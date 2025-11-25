import { Notice, Plugin } from 'obsidian';
import { RedditSavedSettings, ImportResult, RedditItem, RedditComment } from './types';
import {
  DEFAULT_SETTINGS,
  REDDIT_ITEM_TYPE_COMMENT,
  MSG_AUTH_REQUIRED,
  MSG_NO_POSTS_FOUND,
  MSG_FETCHING_POSTS,
  MSG_RESCAN_VAULT,
} from './constants';
import { RedditAuth } from './auth';
import { RedditApiClient } from './api-client';
import { MediaHandler } from './media-handler';
import { ContentFormatter } from './content-formatter';
import { RedditSavedSettingTab } from './settings';
import { sanitizeFileName, isPathSafe, sanitizeSubredditName } from './utils/file-sanitizer';

export default class RedditSavedPlugin extends Plugin {
  settings: RedditSavedSettings;
  private auth: RedditAuth;
  private apiClient: RedditApiClient;
  private mediaHandler: MediaHandler;
  private contentFormatter: ContentFormatter;

  async onload() {
    await this.loadSettings();

    // Initialize modules
    this.auth = new RedditAuth(this.app, this.settings, () => this.saveSettings());
    this.apiClient = new RedditApiClient(this.settings, () => this.auth.ensureValidToken());
    this.mediaHandler = new MediaHandler(this.app, this.settings);
    this.contentFormatter = new ContentFormatter(this.settings, this.mediaHandler);

    // Add ribbon icon
    this.addRibbonIcon('download', 'Fetch Reddit saved posts', async () => {
      await this.fetchSavedPosts();
    });

    // Add commands
    this.addCommand({
      id: 'fetch-reddit-saved',
      name: 'Fetch saved posts from Reddit',
      callback: async () => {
        await this.fetchSavedPosts();
      },
    });

    this.addCommand({
      id: 'authenticate-reddit',
      name: 'Authenticate with Reddit',
      callback: async () => {
        await this.auth.initiateOAuth();
      },
    });

    this.addCommand({
      id: 'rescan-reddit-ids',
      name: 'Rescan vault for imported Reddit posts',
      callback: async () => {
        await this.rescanImportedIds();
      },
    });

    // Add settings tab
    this.addSettingTab(
      new RedditSavedSettingTab(
        this.app,
        this,
        this.settings,
        () => this.saveSettings(),
        () => this.auth.initiateOAuth()
      )
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async fetchSavedPosts() {
    if (!this.auth.isAuthenticated()) {
      new Notice(MSG_AUTH_REQUIRED);
      await this.auth.initiateOAuth();
      return;
    }

    try {
      await this.auth.ensureValidToken();

      new Notice(MSG_FETCHING_POSTS);

      const savedItems = await this.apiClient.fetchAllSaved();

      if (savedItems.length === 0) {
        new Notice(MSG_NO_POSTS_FOUND);
        return;
      }

      const result = await this.createMarkdownFiles(savedItems);

      // Provide detailed feedback
      if (result.skipped > 0) {
        new Notice(
          `Imported ${result.imported} new items, skipped ${result.skipped} already imported items`
        );
      } else {
        new Notice(`Successfully imported ${result.imported} saved items`);
      }

      if (this.settings.autoUnsave) {
        // Only unsave newly imported items
        const itemsToUnsave = savedItems.filter(_item => {
          return !this.settings.skipExisting || result.imported > 0;
        });
        if (itemsToUnsave.length > 0) {
          await this.apiClient.unsaveItems(itemsToUnsave);
        }
      }
    } catch (error) {
      console.error('Error fetching saved posts:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Error: ${errorMessage}`);
    }
  }

  private scanExistingRedditIds(): Set<string> {
    const existingIds = new Set<string>();

    // Scan all markdown files in the vault for Reddit IDs
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      try {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter?.id && cache?.frontmatter?.type?.startsWith('reddit-')) {
          existingIds.add(cache.frontmatter.id);
        }
      } catch (error) {
        console.error(`Error reading frontmatter from ${file.path}:`, error);
      }
    }

    return existingIds;
  }

  private async rescanImportedIds() {
    new Notice(MSG_RESCAN_VAULT);

    const existingIds = this.scanExistingRedditIds();

    // Update the imported IDs list with what's actually in the vault
    this.settings.importedIds = Array.from(existingIds);
    await this.saveSettings();

    new Notice(`Found ${existingIds.size} imported Reddit posts in vault`);
  }

  private async createMarkdownFiles(items: RedditItem[]): Promise<ImportResult> {
    const folder = this.app.vault.getAbstractFileByPath(this.settings.saveLocation);

    if (!folder) {
      await this.app.vault.createFolder(this.settings.saveLocation);
    }

    // Scan for existing Reddit IDs if skip existing is enabled
    let existingIds: Set<string> = new Set();
    if (this.settings.skipExisting) {
      existingIds = this.scanExistingRedditIds();
    }

    let importedCount = 0;
    let skippedCount = 0;

    for (const item of items) {
      const data = item.data;
      const redditId = data.id;

      // Check if this post has already been imported
      if (this.settings.skipExisting && existingIds.has(redditId)) {
        skippedCount++;
        continue;
      }

      const isComment = item.kind === REDDIT_ITEM_TYPE_COMMENT;

      const rawFileName = isComment ? `Comment - ${data.link_title || 'Unknown'}` : data.title!;

      // Validate path safety before sanitizing
      if (!isPathSafe(rawFileName)) {
        console.warn(`Skipping potentially unsafe filename: ${rawFileName}`);
        skippedCount++;
        continue;
      }

      const fileName = sanitizeFileName(rawFileName);

      // Determine the save folder based on subreddit organization setting
      let saveFolder = this.settings.saveLocation;
      if (this.settings.organizeBySubreddit && data.subreddit) {
        const subredditFolder = sanitizeSubredditName(data.subreddit);
        saveFolder = `${this.settings.saveLocation}/${subredditFolder}`;

        // Create subreddit folder if it doesn't exist
        const subredditFolderExists = this.app.vault.getAbstractFileByPath(saveFolder);
        if (!subredditFolderExists) {
          await this.app.vault.createFolder(saveFolder);
        }
      }

      // Generate unique filename if it already exists
      let filePath = `${saveFolder}/${fileName}.md`;
      let counter = 1;
      while (this.app.vault.getAbstractFileByPath(filePath)) {
        filePath = `${saveFolder}/${fileName} ${counter}.md`;
        counter++;
      }

      // Fetch comments if enabled and this is a post (not a saved comment)
      let comments: RedditComment[] = [];
      if (this.settings.exportPostComments && !isComment) {
        try {
          comments = await this.apiClient.fetchPostComments(
            data.permalink,
            this.settings.commentUpvoteThreshold
          );
        } catch (error) {
          console.error(`Error fetching comments for ${data.id}:`, error);
        }
      }

      const content = await this.contentFormatter.formatRedditContent(data, isComment, comments);
      await this.app.vault.create(filePath, content);

      // Add to imported IDs
      if (!this.settings.importedIds.includes(redditId)) {
        this.settings.importedIds.push(redditId);
      }

      importedCount++;
    }

    // Save updated imported IDs
    await this.saveSettings();

    // Return counts for better user feedback
    return { imported: importedCount, skipped: skippedCount };
  }
}
