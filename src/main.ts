import { Notice, Plugin, TFile } from 'obsidian';
import { RedditSavedSettings, ImportResult, RedditItem, RedditItemData } from './types';
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
import { sanitizeFileName, isPathSafe } from './utils/file-sanitizer';
import { TemplaterHandler } from './templater-handler';

export default class RedditSavedPlugin extends Plugin {
  settings: RedditSavedSettings;
  private auth: RedditAuth;
  private apiClient: RedditApiClient;
  private mediaHandler: MediaHandler;
  private contentFormatter: ContentFormatter;
  private templaterHandler: TemplaterHandler;

  async onload() {
    await this.loadSettings();

    // Initialize modules
    this.auth = new RedditAuth(this.app, this.settings, () => this.saveSettings());
    this.apiClient = new RedditApiClient(this.settings, () => this.auth.ensureValidToken());
    this.mediaHandler = new MediaHandler(this.app, this.settings);
    this.contentFormatter = new ContentFormatter(this.settings, this.mediaHandler);
    this.templaterHandler = new TemplaterHandler(this.app, this.settings);

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

  /**
   * Enrich comment data with parent context and/or replies
   * This requires additional API calls per comment
   */
  private async enrichCommentData(data: RedditItemData): Promise<void> {
    const shouldFetchContext = this.settings.fetchCommentContext && data.permalink;
    const shouldFetchReplies = this.settings.includeCommentReplies && data.permalink;

    if (!shouldFetchContext && !shouldFetchReplies) {
      return;
    }

    try {
      // Fetch parent context if enabled
      if (shouldFetchContext) {
        const enrichedData = await this.apiClient.fetchCommentWithContext(
          data.permalink,
          this.settings.commentContextDepth
        );

        if (enrichedData?.parent_comments) {
          data.parent_comments = enrichedData.parent_comments;
          data.depth = enrichedData.depth;
        }
      }

      // Fetch replies if enabled
      if (shouldFetchReplies) {
        const replies = await this.apiClient.fetchCommentReplies(
          data.permalink,
          this.settings.commentReplyDepth
        );

        if (replies && replies.length > 0) {
          data.child_comments = replies;
        }
      }
    } catch (error) {
      console.error('Error enriching comment data:', error);
      // Continue without context/replies rather than failing the import
    }
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

      // Fetch comment context and replies if enabled
      if (isComment) {
        await this.enrichCommentData(data);
      }

      const rawFileName = isComment ? `Comment - ${data.link_title || 'Unknown'}` : data.title!;

      // Validate path safety before sanitizing
      if (!isPathSafe(rawFileName)) {
        console.warn(`Skipping potentially unsafe filename: ${rawFileName}`);
        skippedCount++;
        continue;
      }

      const fileName = sanitizeFileName(rawFileName);

      // Generate unique filename if it already exists
      let filePath = `${this.settings.saveLocation}/${fileName}.md`;
      let counter = 1;
      while (this.app.vault.getAbstractFileByPath(filePath)) {
        filePath = `${this.settings.saveLocation}/${fileName} ${counter}.md`;
        counter++;
      }

      // Try to use Templater if enabled and available
      let content: string;
      let useTemplater = false;

      if (this.templaterHandler.shouldUseTemplater(isComment)) {
        const mediaInfo = this.mediaHandler.analyzeMedia(data);
        const context = this.templaterHandler.buildContext(data, isComment, mediaInfo);
        const templatedContent = await this.templaterHandler.processTemplate(context);

        if (templatedContent !== null) {
          content = templatedContent;
          useTemplater = true;
        } else {
          // Fall back to default formatter if template processing fails
          content = await this.contentFormatter.formatRedditContent(data, isComment);
        }
      } else {
        content = await this.contentFormatter.formatRedditContent(data, isComment);
      }

      const file = await this.app.vault.create(filePath, content);

      // Run Templater on the file to process any <% %> syntax
      if (useTemplater && file instanceof TFile) {
        await this.templaterHandler.runTemplaterOnFile(file);
      }

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
