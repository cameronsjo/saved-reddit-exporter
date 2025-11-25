import { Notice, Plugin } from 'obsidian';
import { RedditSavedSettings, ImportResult, RedditItem } from './types';
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

      let savedItems: RedditItem[];

      if (this.settings.enableEnhancedMode) {
        // Use enhanced fetch with progress tracking
        const result = await this.apiClient.fetchAllSavedEnhanced({
          onProgress: (progress: ImportProgress) => {
            this.handleProgressUpdate(progress);
          },
          signal: this.currentAbortController.signal,
        });

        if (result.wasCancelled) {
          new Notice('Import was cancelled. You can resume later.');
          return;
        }

        savedItems = result.items;
      } else {
        // Use legacy fetch
        savedItems = await this.apiClient.fetchAllSaved();
      }

      if (savedItems.length === 0) {
        new Notice(MSG_NO_POSTS_FOUND);
        this.importStateManager.markCompleted();
        return;
      }

      // Update state to processing phase
      this.importStateManager.setPhase('processing');

      const result = await this.createMarkdownFiles(savedItems);

      // Mark import as completed
      this.importStateManager.markCompleted();

      // End performance monitoring
      this.performanceMonitor.endSession();

      // Provide detailed feedback
      if (result.skipped > 0) {
        new Notice(
          `Imported ${result.imported} new items, skipped ${result.skipped} already imported items`
        );
      } else {
        new Notice(`Successfully imported ${result.imported} saved items`);
      }

      // Show performance stats if enabled
      if (this.settings.showPerformanceStats) {
        console.log(this.performanceMonitor.formatForDisplay());
        new Notice(
          'Performance stats logged to console. Use "Show import status" command for details.'
        );
      }

      if (this.settings.autoUnsave) {
        this.importStateManager.setPhase('unsaving');
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

      const isComment = item.kind === REDDIT_ITEM_TYPE_COMMENT;

      const rawFileName = isComment ? `Comment - ${data.link_title || 'Unknown'}` : data.title!;

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

        // Generate unique filename if it already exists
        let filePath = `${this.settings.saveLocation}/${fileName}.md`;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(filePath)) {
          filePath = `${this.settings.saveLocation}/${fileName} ${counter}.md`;
          counter++;
        }

        const content = await this.contentFormatter.formatRedditContent(data, isComment);
        await this.app.vault.create(filePath, content);

        // Record file creation
        this.performanceMonitor.recordFileCreated();

        // Add to imported IDs
        if (!this.settings.importedIds.includes(redditId)) {
          this.settings.importedIds.push(redditId);
        }

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

    // Return counts for better user feedback
    return { imported: importedCount, skipped: skippedCount };
  }
}
