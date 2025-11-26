import { Notice, Plugin, Modal, App } from 'obsidian';
import {
  RedditSavedSettings,
  ImportResult,
  RedditItem,
  ContentOrigin,
  RedditComment,
  FilterBreakdown,
} from './types';
import {
  DEFAULT_SETTINGS,
  DEFAULT_FILTER_SETTINGS,
  REDDIT_ITEM_TYPE_COMMENT,
  MSG_AUTH_REQUIRED,
  MSG_NO_POSTS_FOUND,
  MSG_FETCHING_POSTS,
  MSG_RESCAN_VAULT,
  MSG_NO_CONTENT_TYPES,
} from './constants';
import { RedditAuth } from './auth';
import { RedditApiClient } from './api-client';
import { MediaHandler } from './media-handler';
import { ContentFormatter } from './content-formatter';
import { RedditSavedSettingTab } from './settings';
import { UnsaveSelectionModal, AutoUnsaveConfirmModal } from './unsave-modal';
import { sanitizeFileName, isPathSafe, sanitizeSubredditName } from './utils/file-sanitizer';
import { FilterEngine, createEmptyBreakdown } from './filters';
import { ImportStateManager, ImportProgress } from './import-state';
import { PerformanceMonitor } from './performance-monitor';

export default class RedditSavedPlugin extends Plugin {
  settings: RedditSavedSettings;
  private auth: RedditAuth;
  private apiClient: RedditApiClient;
  private mediaHandler: MediaHandler;
  private contentFormatter: ContentFormatter;
  private importStateManager: ImportStateManager;
  private performanceMonitor: PerformanceMonitor;
  private currentAbortController: AbortController | null = null;

  async onload() {
    await this.loadSettings();

    // Initialize modules
    this.auth = new RedditAuth(this.app, this.settings, () => this.saveSettings());
    this.apiClient = new RedditApiClient(this.settings, () => this.auth.ensureValidToken());
    this.mediaHandler = new MediaHandler(this.app, this.settings);
    this.contentFormatter = new ContentFormatter(this.settings, this.mediaHandler);
    this.importStateManager = new ImportStateManager(this.app, {
      enableCheckpointing: this.settings.enableCheckpointing,
    });
    this.performanceMonitor = new PerformanceMonitor();

    // Configure enhanced features based on settings
    if (this.settings.enableEnhancedMode) {
      this.apiClient.enableEnhancedFeatures(this.importStateManager);
    }

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

    this.addCommand({
      id: 'resume-reddit-import',
      name: 'Resume interrupted import',
      callback: async () => {
        await this.resumeImport();
      },
    });

    this.addCommand({
      id: 'cancel-reddit-import',
      name: 'Cancel current import',
      callback: () => {
        this.cancelImport();
      },
    });

    this.addCommand({
      id: 'show-import-status',
      name: 'Show import status and performance',
      callback: () => {
        this.showImportStatus();
      },
    });

    this.addCommand({
      id: 'preview-reddit-import',
      name: 'Preview import (dry run)',
      callback: async () => {
        await this.previewImport();
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

  onunload() {
    // Clean up resources
    this.importStateManager.cleanup();
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
  }

  async loadSettings() {
    const savedData = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, savedData);

    // Ensure filterSettings exists and has all required properties
    if (!this.settings.filterSettings) {
      this.settings.filterSettings = { ...DEFAULT_FILTER_SETTINGS };
    } else {
      // Merge with defaults to ensure new filter properties are available
      this.settings.filterSettings = {
        ...DEFAULT_FILTER_SETTINGS,
        ...this.settings.filterSettings,
      };
    }

    // Migration: convert old autoUnsave boolean to new unsaveMode
    if (savedData && savedData.autoUnsave && !savedData.unsaveMode) {
      this.settings.unsaveMode = 'auto';
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Check if any content types are enabled
   */
  private hasEnabledContentTypes(): boolean {
    return (
      this.settings.importSavedPosts ||
      this.settings.importSavedComments ||
      this.settings.importUpvoted ||
      this.settings.importUserPosts ||
      this.settings.importUserComments
    );
  }

  async fetchSavedPosts() {
    if (!this.auth.isAuthenticated()) {
      new Notice(MSG_AUTH_REQUIRED);
      await this.auth.initiateOAuth();
      return;
    }

    // Check if any content types are enabled
    if (!this.hasEnabledContentTypes()) {
      new Notice(MSG_NO_CONTENT_TYPES);
      return;
    }

    // Check for resumable session first
    if (this.settings.enableCheckpointing) {
      const hasResumable = await this.importStateManager.hasResumableSession();
      if (hasResumable) {
        new Notice(
          'Found interrupted import. Use "Resume interrupted import" command to continue, or start fresh.'
        );
      }
    }

    try {
      await this.auth.ensureValidToken();

      new Notice(MSG_FETCHING_POSTS);

      // Start performance monitoring
      this.performanceMonitor.startSession();

      // Create abort controller for cancellation
      this.currentAbortController = new AbortController();

      // Start new import session
      this.importStateManager.startSession();

      const allItems: RedditItem[] = [];
      const savedItemsForUnsave: RedditItem[] = [];

      // Fetch saved items (posts and/or comments)
      if (this.settings.importSavedPosts || this.settings.importSavedComments) {
        const savedItems = await this.apiClient.fetchAllSaved();

        // Filter based on content type preferences
        const filteredSaved = savedItems.filter(item => {
          const isComment = item.kind === REDDIT_ITEM_TYPE_COMMENT;
          if (isComment) {
            return this.settings.importSavedComments;
          } else {
            return this.settings.importSavedPosts;
          }
        });

        allItems.push(...filteredSaved);
        savedItemsForUnsave.push(...filteredSaved);
      }

      // Fetch upvoted posts
      if (this.settings.importUpvoted) {
        const upvotedItems = await this.apiClient.fetchUpvoted();
        allItems.push(...upvotedItems);
      }

      // Fetch user's own posts
      if (this.settings.importUserPosts) {
        const userPosts = await this.apiClient.fetchUserPosts();
        allItems.push(...userPosts);
      }

      // Fetch user's own comments
      if (this.settings.importUserComments) {
        const userComments = await this.apiClient.fetchUserComments();
        allItems.push(...userComments);
      }

      if (allItems.length === 0) {
        new Notice(MSG_NO_POSTS_FOUND);
        this.importStateManager.markCompleted();
        return;
      }

      // Deduplicate items by ID (in case an item appears in multiple categories)
      const uniqueItems = this.deduplicateItems(allItems);

      // Update state to processing phase
      this.importStateManager.setPhase('processing');

      const result = await this.createMarkdownFiles(uniqueItems);

      // Mark import as completed
      this.importStateManager.markCompleted();

      // End performance monitoring
      this.performanceMonitor.endSession();

      // Provide detailed feedback
      const parts: string[] = [];
      parts.push(`Imported ${result.imported}`);
      if (result.filtered > 0) {
        parts.push(`filtered ${result.filtered}`);
      }
      if (result.skipped > 0) {
        parts.push(`skipped ${result.skipped} existing`);
      }
      new Notice(parts.join(', '));

      // Show performance stats if enabled
      if (this.settings.showPerformanceStats) {
        console.log(this.performanceMonitor.formatForDisplay());
        new Notice(
          'Performance stats logged to console. Use "Show import status" command for details.'
        );
      }

      // Handle unsave based on mode (only for saved items, not upvoted/user content)
      this.importStateManager.setPhase('unsaving');
      const savedItemsToUnsave = result.importedItems.filter(
        (item: RedditItem) =>
          (item as RedditItem & { contentOrigin?: ContentOrigin }).contentOrigin === 'saved' ||
          !(item as RedditItem & { contentOrigin?: ContentOrigin }).contentOrigin
      );
      if (savedItemsToUnsave.length > 0) {
        await this.handleUnsave(savedItemsToUnsave);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Error: ${errorMessage}`);

      // Save state for potential resumption
      if (this.settings.enableCheckpointing) {
        this.importStateManager.pause();
        new Notice('Import state saved. You can resume later.');
      }
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Resume an interrupted import
   */
  async resumeImport() {
    if (!this.auth.isAuthenticated()) {
      new Notice(MSG_AUTH_REQUIRED);
      return;
    }

    const checkpoint = await this.importStateManager.resumeSession();
    if (!checkpoint) {
      new Notice('No interrupted import found to resume.');
      return;
    }

    new Notice(`Resuming import from ${checkpoint.fetchedCount} items...`);

    try {
      await this.auth.ensureValidToken();

      // Create new abort controller
      this.currentAbortController = new AbortController();

      // Resume from saved cursor
      const result = await this.apiClient.fetchAllSavedEnhanced({
        startCursor: checkpoint.afterCursor,
        onProgress: (progress: ImportProgress) => {
          this.handleProgressUpdate(progress);
        },
        signal: this.currentAbortController.signal,
      });

      if (result.wasCancelled) {
        new Notice('Import was cancelled. You can resume later.');
        return;
      }

      // Get pending items that weren't processed
      const pendingItems = this.importStateManager.getPendingItems();
      const allItems = [...pendingItems, ...result.items];

      if (allItems.length === 0) {
        new Notice('No more items to import.');
        this.importStateManager.markCompleted();
        return;
      }

      this.importStateManager.setPhase('processing');
      const importResult = await this.createMarkdownFiles(allItems);

      this.importStateManager.markCompleted();

      new Notice(
        `Resume complete: Imported ${importResult.imported} items, skipped ${importResult.skipped}`
      );
    } catch (error) {
      console.error('Error resuming import:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Error resuming: ${errorMessage}`);
      this.importStateManager.pause();
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Cancel the current import
   */
  cancelImport() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.importStateManager.markCancelled();
      new Notice('Import cancelled. State saved for later resumption.');
    } else {
      new Notice('No import in progress.');
    }
  }

  /**
   * Show current import status and performance metrics
   */
  showImportStatus() {
    const progress = this.importStateManager.getProgress();
    const queueStatus = this.apiClient.getQueueStatus();

    let statusMessage = '=== Import Status ===\n';

    if (progress) {
      statusMessage += `Phase: ${progress.phase}\n`;
      statusMessage += `Fetched: ${progress.fetchedCount}\n`;
      statusMessage += `Processed: ${progress.processedCount}\n`;
      statusMessage += `Imported: ${progress.importedCount}\n`;
      statusMessage += `Skipped: ${progress.skippedCount}\n`;
      statusMessage += `Failed: ${progress.failedCount}\n`;
      statusMessage += `Speed: ${progress.itemsPerSecond.toFixed(2)} items/sec\n`;
    } else {
      statusMessage += 'No active import session.\n';
    }

    statusMessage += '\n=== Queue Status ===\n';
    statusMessage += `Pending requests: ${queueStatus.queueLength}\n`;
    statusMessage += `Active requests: ${queueStatus.activeRequests}\n`;
    statusMessage += `Circuit breaker: ${queueStatus.circuitState}\n`;
    statusMessage += `Online: ${queueStatus.isOnline}\n`;

    // Log full performance report
    console.log(statusMessage);
    console.log('\n' + this.performanceMonitor.formatForDisplay());

    new Notice(`Import status logged to console. Phase: ${progress?.phase || 'idle'}`);
  }

  /**
   * Handle progress updates during import
   */
  private handleProgressUpdate(progress: ImportProgress) {
    // Could be used to update UI in the future
    // For now, just log significant milestones
    if (progress.processedCount > 0 && progress.processedCount % 50 === 0) {
      new Notice(
        `Progress: ${progress.processedCount} items processed (${progress.itemsPerSecond.toFixed(1)}/sec)`
      );
    }
  }

  /**
   * Remove duplicate items, keeping the first occurrence (which preserves content origin)
   */
  private deduplicateItems(items: RedditItem[]): RedditItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
      if (seen.has(item.data.id)) {
        return false;
      }
      seen.add(item.data.id);
      return true;
    });
  }

  private async handleUnsave(importedItems: RedditItem[]): Promise<void> {
    switch (this.settings.unsaveMode) {
      case 'auto':
        // Show confirmation before auto-unsaving
        new AutoUnsaveConfirmModal(this.app, importedItems.length, async () => {
          await this.apiClient.unsaveItems(importedItems);
        }).open();
        break;

      case 'prompt':
        // Show selection modal for user to choose which items to unsave
        // The callback receives items one at a time for per-item progress tracking
        new UnsaveSelectionModal(this.app, importedItems, async (selectedItems: RedditItem[]) => {
          // This is called per-item from the modal for progress tracking
          await this.apiClient.unsaveItems(selectedItems);
        }).open();
        break;

      case 'off':
      default:
        // Do nothing
        break;
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

    // Initialize filter engine
    const filterEngine = new FilterEngine(this.settings.filterSettings);

    let importedCount = 0;
    let skippedCount = 0;
    let filteredCount = 0;
    const filterBreakdown = createEmptyBreakdown();
    const importedItems: RedditItem[] = [];

    for (const item of items) {
      // Check for cancellation
      if (this.currentAbortController?.signal.aborted) {
        break;
      }

      const data = item.data;
      const redditId = data.id;

      // Check if this post has already been imported
      if (this.settings.skipExisting && existingIds.has(redditId)) {
        skippedCount++;
        this.importStateManager.markItemSkipped(redditId);
        this.performanceMonitor.recordItemProcessed('skipped');
        continue;
      }

      // Apply filters
      const filterResult = filterEngine.shouldIncludeItem(item);
      if (!filterResult.passes) {
        filteredCount++;
        if (filterResult.filterType) {
          filterBreakdown[filterResult.filterType]++;
        }
        continue;
      }

      const isComment = item.kind === REDDIT_ITEM_TYPE_COMMENT;
      const contentOrigin: ContentOrigin = item.contentOrigin || 'saved';

      // Generate filename based on content type
      let rawFileName: string;
      if (isComment) {
        rawFileName = `Comment - ${data.link_title || 'Unknown'}`;
      } else {
        rawFileName = data.title!;
      }

      // Add prefix for non-saved content to help with organization
      if (contentOrigin === 'upvoted') {
        rawFileName = `[Upvoted] ${rawFileName}`;
      } else if (contentOrigin === 'submitted') {
        rawFileName = `[My Post] ${rawFileName}`;
      } else if (contentOrigin === 'commented') {
        rawFileName = `[My Comment] ${rawFileName}`;
      }

      // Validate path safety before sanitizing
      if (!isPathSafe(rawFileName)) {
        console.warn(`Skipping potentially unsafe filename: ${rawFileName}`);
        skippedCount++;
        this.importStateManager.markItemFailed(redditId, 'Unsafe filename', false);
        this.performanceMonitor.recordItemProcessed('failed');
        continue;
      }

      try {
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

        const content = await this.contentFormatter.formatRedditContent(
          data,
          isComment,
          contentOrigin,
          comments
        );
        await this.app.vault.create(filePath, content);

        // Record file creation
        this.performanceMonitor.recordFileCreated();

        // Add to imported IDs
        if (!this.settings.importedIds.includes(redditId)) {
          this.settings.importedIds.push(redditId);
        }

        // Track successfully imported item
        importedItems.push(item);
        importedCount++;
        this.importStateManager.markItemImported(redditId);
        this.performanceMonitor.recordItemProcessed('imported');
      } catch (error) {
        console.error(`Error creating file for item ${redditId}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.importStateManager.markItemFailed(redditId, errorMessage, true);
        this.performanceMonitor.recordItemProcessed('failed');
      }
    }

    // Save updated imported IDs
    await this.saveSettings();

    // Return counts and imported items for better user feedback
    return {
      imported: importedCount,
      skipped: skippedCount,
      filtered: filteredCount,
      importedItems,
      filterBreakdown,
    };
  }

  async previewImport() {
    if (!this.auth.isAuthenticated()) {
      new Notice(MSG_AUTH_REQUIRED);
      await this.auth.initiateOAuth();
      return;
    }

    try {
      await this.auth.ensureValidToken();

      new Notice('Fetching posts for preview...');

      const savedItems = await this.apiClient.fetchAllSaved();

      if (savedItems.length === 0) {
        new Notice(MSG_NO_POSTS_FOUND);
        return;
      }

      // Scan for existing Reddit IDs
      const existingIds = this.settings.skipExisting
        ? this.scanExistingRedditIds()
        : new Set<string>();

      // Use filter engine to preview
      const filterEngine = new FilterEngine(this.settings.filterSettings);
      const preview = filterEngine.previewImport(
        savedItems,
        existingIds,
        this.settings.skipExisting
      );

      // Show preview modal
      new PreviewModal(this.app, preview, this.settings.filterSettings.enabled).open();
    } catch (error) {
      console.error('Error during preview:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Error: ${errorMessage}`);
    }
  }
}

/**
 * Modal to display import preview results
 */
class PreviewModal extends Modal {
  private preview: {
    wouldImport: RedditItem[];
    wouldFilter: Array<{ item: RedditItem; reason: string }>;
    wouldSkip: RedditItem[];
    breakdown: FilterBreakdown;
  };
  private filterEnabled: boolean;

  constructor(
    app: App,
    preview: {
      wouldImport: RedditItem[];
      wouldFilter: Array<{ item: RedditItem; reason: string }>;
      wouldSkip: RedditItem[];
      breakdown: FilterBreakdown;
    },
    filterEnabled: boolean
  ) {
    super(app);
    this.preview = preview;
    this.filterEnabled = filterEnabled;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Import Preview' });

    // Summary
    const summaryDiv = contentEl.createDiv();
    summaryDiv.setCssProps({
      backgroundColor: 'var(--background-secondary)',
      padding: '15px',
      borderRadius: '8px',
      marginBottom: '15px',
    });

    summaryDiv.createEl('h3', { text: 'Summary' });
    summaryDiv.createEl('p', {
      text: `✅ Would import: ${this.preview.wouldImport.length} items`,
    });

    if (this.filterEnabled) {
      summaryDiv.createEl('p', {
        text: `🔍 Would filter: ${this.preview.wouldFilter.length} items`,
      });
    }

    summaryDiv.createEl('p', {
      text: `⏭️ Would skip (already imported): ${this.preview.wouldSkip.length} items`,
    });

    // Filter breakdown
    if (this.filterEnabled && this.preview.wouldFilter.length > 0) {
      const breakdownDiv = contentEl.createDiv();
      breakdownDiv.setCssProps({
        marginBottom: '15px',
      });

      breakdownDiv.createEl('h3', { text: 'Filter Breakdown' });
      const breakdown = this.preview.breakdown;
      const breakdownList = breakdownDiv.createEl('ul');

      const breakdownItems: Array<{ key: keyof FilterBreakdown; label: string }> = [
        { key: 'subreddit', label: 'Subreddit filter' },
        { key: 'score', label: 'Score filter' },
        { key: 'date', label: 'Date filter' },
        { key: 'postType', label: 'Post type filter' },
        { key: 'content', label: 'Content filter' },
        { key: 'author', label: 'Author filter' },
        { key: 'domain', label: 'Domain filter' },
        { key: 'nsfw', label: 'NSFW filter' },
        { key: 'commentCount', label: 'Comment count filter' },
      ];

      for (const { key, label } of breakdownItems) {
        if (breakdown[key] > 0) {
          breakdownList.createEl('li', { text: `${label}: ${breakdown[key]}` });
        }
      }
    }

    // Sample of items to import
    if (this.preview.wouldImport.length > 0) {
      const importDiv = contentEl.createDiv();
      importDiv.createEl('h3', { text: 'Sample items to import' });

      const sampleItems = this.preview.wouldImport.slice(0, 5);
      const importList = importDiv.createEl('ul');

      for (const item of sampleItems) {
        const isComment = item.kind === 't1';
        const title = isComment
          ? `Comment on: ${item.data.link_title || 'Unknown'}`
          : item.data.title || 'Untitled';
        const li = importList.createEl('li');
        li.createEl('strong', { text: `r/${item.data.subreddit}` });
        li.createSpan({ text: ` - ${title.substring(0, 60)}${title.length > 60 ? '...' : ''}` });
      }

      if (this.preview.wouldImport.length > 5) {
        importDiv.createEl('p', {
          text: `...and ${this.preview.wouldImport.length - 5} more items`,
          cls: 'mod-muted',
        });
      }
    }

    // Sample of filtered items
    if (this.filterEnabled && this.preview.wouldFilter.length > 0) {
      const filterDiv = contentEl.createDiv();
      filterDiv.createEl('h3', { text: 'Sample filtered items' });

      const sampleFiltered = this.preview.wouldFilter.slice(0, 5);
      const filterList = filterDiv.createEl('ul');

      for (const { item, reason } of sampleFiltered) {
        const isComment = item.kind === 't1';
        const title = isComment
          ? `Comment on: ${item.data.link_title || 'Unknown'}`
          : item.data.title || 'Untitled';
        const li = filterList.createEl('li');
        li.createEl('strong', { text: `r/${item.data.subreddit}` });
        li.createSpan({ text: ` - ${title.substring(0, 40)}${title.length > 40 ? '...' : ''}` });
        li.createEl('br');
        li.createEl('em', { text: `Reason: ${reason}`, cls: 'mod-muted' });
      }

      if (this.preview.wouldFilter.length > 5) {
        filterDiv.createEl('p', {
          text: `...and ${this.preview.wouldFilter.length - 5} more filtered items`,
          cls: 'mod-muted',
        });
      }
    }

    // Close button
    const buttonDiv = contentEl.createDiv();
    buttonDiv.setCssProps({
      marginTop: '20px',
      textAlign: 'right',
    });

    const closeBtn = buttonDiv.createEl('button', { text: 'Close' });
    closeBtn.addEventListener('click', () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
