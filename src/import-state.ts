import { App } from 'obsidian';
import { RedditItem } from './types';

/**
 * Represents the current state of an import operation
 */
export interface ImportCheckpoint {
  /** Unique identifier for this import session */
  sessionId: string;
  /** Timestamp when import started */
  startedAt: number;
  /** Timestamp of last update */
  lastUpdatedAt: number;
  /** Current phase of import */
  phase: ImportPhase;
  /** Pagination cursor for Reddit API */
  afterCursor: string;
  /** Number of items fetched so far */
  fetchedCount: number;
  /** Number of items processed (file creation attempted) */
  processedCount: number;
  /** Number of items successfully imported */
  importedCount: number;
  /** Number of items skipped (already exist) */
  skippedCount: number;
  /** Number of items that failed */
  failedCount: number;
  /** IDs of items that have been fetched but not yet processed */
  pendingItemIds: string[];
  /** IDs of items that failed and could be retried */
  failedItemIds: string[];
  /** Error messages for failed items */
  errors: ImportError[];
  /** Whether this import was completed */
  completed: boolean;
  /** Whether this import was cancelled */
  cancelled: boolean;
}

export type ImportPhase =
  | 'idle'
  | 'fetching'
  | 'processing'
  | 'unsaving'
  | 'completed'
  | 'paused'
  | 'failed';

export interface ImportError {
  itemId: string;
  error: string;
  timestamp: number;
  retryable: boolean;
}

export interface ImportProgress {
  phase: ImportPhase;
  fetchedCount: number;
  processedCount: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  totalExpected?: number;
  elapsedMs: number;
  itemsPerSecond: number;
  estimatedRemainingMs?: number;
}

/**
 * Callback type for progress updates
 */
export type ProgressCallback = (progress: ImportProgress) => void;

/**
 * Configuration for ImportStateManager
 */
export interface ImportStateConfig {
  /** How often to auto-save checkpoint (in ms) */
  autoSaveIntervalMs: number;
  /** Maximum errors before auto-pausing */
  maxErrorsBeforePause: number;
  /** Whether to enable checkpointing */
  enableCheckpointing: boolean;
}

const DEFAULT_CONFIG: ImportStateConfig = {
  autoSaveIntervalMs: 5000, // Save every 5 seconds
  maxErrorsBeforePause: 10,
  enableCheckpointing: true,
};

const CHECKPOINT_FILE = '.reddit-import-checkpoint.json';

/**
 * Manages import state for incremental and resumable imports
 */
export class ImportStateManager {
  private app: App;
  private config: ImportStateConfig;
  private checkpoint: ImportCheckpoint | null = null;
  private progressCallback: ProgressCallback | null = null;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private pendingItems: Map<string, RedditItem> = new Map();

  constructor(app: App, config: Partial<ImportStateConfig> = {}) {
    this.app = app;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `import-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Start a new import session
   */
  startSession(): ImportCheckpoint {
    this.checkpoint = {
      sessionId: this.generateSessionId(),
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      phase: 'idle',
      afterCursor: '',
      fetchedCount: 0,
      processedCount: 0,
      importedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      pendingItemIds: [],
      failedItemIds: [],
      errors: [],
      completed: false,
      cancelled: false,
    };

    this.pendingItems.clear();
    this.startAutoSave();

    return this.checkpoint;
  }

  /**
   * Resume a previous import session
   */
  async resumeSession(): Promise<ImportCheckpoint | null> {
    const savedCheckpoint = await this.loadCheckpoint();

    if (savedCheckpoint && !savedCheckpoint.completed && !savedCheckpoint.cancelled) {
      this.checkpoint = savedCheckpoint;
      this.checkpoint.phase = 'paused';
      this.startAutoSave();
      return this.checkpoint;
    }

    return null;
  }

  /**
   * Check if there's a resumable session
   */
  async hasResumableSession(): Promise<boolean> {
    const checkpoint = await this.loadCheckpoint();
    return checkpoint !== null && !checkpoint.completed && !checkpoint.cancelled;
  }

  /**
   * Get the current checkpoint
   */
  getCheckpoint(): ImportCheckpoint | null {
    return this.checkpoint;
  }

  /**
   * Update the import phase
   */
  setPhase(phase: ImportPhase): void {
    if (this.checkpoint) {
      this.checkpoint.phase = phase;
      this.checkpoint.lastUpdatedAt = Date.now();
      this.notifyProgress();
    }
  }

  /**
   * Update pagination cursor
   */
  setCursor(cursor: string): void {
    if (this.checkpoint) {
      this.checkpoint.afterCursor = cursor;
      this.checkpoint.lastUpdatedAt = Date.now();
    }
  }

  /**
   * Get the current cursor for resuming
   */
  getCursor(): string {
    return this.checkpoint?.afterCursor || '';
  }

  /**
   * Add fetched items to pending queue
   */
  addFetchedItems(items: RedditItem[]): void {
    if (!this.checkpoint) return;

    for (const item of items) {
      const id = item.data.id;
      this.pendingItems.set(id, item);
      if (!this.checkpoint.pendingItemIds.includes(id)) {
        this.checkpoint.pendingItemIds.push(id);
      }
    }

    this.checkpoint.fetchedCount += items.length;
    this.checkpoint.lastUpdatedAt = Date.now();
    this.notifyProgress();
  }

  /**
   * Get pending items that haven't been processed
   */
  getPendingItems(): RedditItem[] {
    return Array.from(this.pendingItems.values());
  }

  /**
   * Mark an item as processed (success)
   */
  markItemImported(itemId: string): void {
    if (!this.checkpoint) return;

    this.checkpoint.processedCount++;
    this.checkpoint.importedCount++;
    this.checkpoint.pendingItemIds = this.checkpoint.pendingItemIds.filter(id => id !== itemId);
    this.pendingItems.delete(itemId);
    this.checkpoint.lastUpdatedAt = Date.now();
    this.notifyProgress();
  }

  /**
   * Mark an item as skipped
   */
  markItemSkipped(itemId: string): void {
    if (!this.checkpoint) return;

    this.checkpoint.processedCount++;
    this.checkpoint.skippedCount++;
    this.checkpoint.pendingItemIds = this.checkpoint.pendingItemIds.filter(id => id !== itemId);
    this.pendingItems.delete(itemId);
    this.checkpoint.lastUpdatedAt = Date.now();
    this.notifyProgress();
  }

  /**
   * Mark an item as failed
   */
  markItemFailed(itemId: string, error: string, retryable: boolean = true): void {
    if (!this.checkpoint) return;

    this.checkpoint.processedCount++;
    this.checkpoint.failedCount++;
    this.checkpoint.pendingItemIds = this.checkpoint.pendingItemIds.filter(id => id !== itemId);

    if (retryable) {
      this.checkpoint.failedItemIds.push(itemId);
    }

    this.checkpoint.errors.push({
      itemId,
      error,
      timestamp: Date.now(),
      retryable,
    });

    this.checkpoint.lastUpdatedAt = Date.now();

    // Check if we should auto-pause due to too many errors
    if (this.checkpoint.failedCount >= this.config.maxErrorsBeforePause) {
      this.checkpoint.phase = 'paused';
    }

    this.notifyProgress();
  }

  /**
   * Get failed items for retry
   */
  getFailedItemIds(): string[] {
    return this.checkpoint?.failedItemIds || [];
  }

  /**
   * Clear failed items (after successful retry)
   */
  clearFailedItems(): void {
    if (this.checkpoint) {
      this.checkpoint.failedItemIds = [];
    }
  }

  /**
   * Mark import as completed
   */
  markCompleted(): void {
    if (this.checkpoint) {
      this.checkpoint.completed = true;
      this.checkpoint.phase = 'completed';
      this.checkpoint.lastUpdatedAt = Date.now();
      this.stopAutoSave();
      this.notifyProgress();

      // Clear checkpoint file on successful completion
      this.clearCheckpoint();
    }
  }

  /**
   * Mark import as cancelled
   */
  markCancelled(): void {
    if (this.checkpoint) {
      this.checkpoint.cancelled = true;
      this.checkpoint.phase = 'paused';
      this.checkpoint.lastUpdatedAt = Date.now();
      this.stopAutoSave();
      this.notifyProgress();

      // Save checkpoint so user can resume later
      this.saveCheckpoint();
    }
  }

  /**
   * Pause the import
   */
  pause(): void {
    if (this.checkpoint && !this.checkpoint.completed) {
      this.checkpoint.phase = 'paused';
      this.checkpoint.lastUpdatedAt = Date.now();
      this.saveCheckpoint();
      this.notifyProgress();
    }
  }

  /**
   * Register a progress callback
   */
  onProgress(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Get current progress
   */
  getProgress(): ImportProgress | null {
    if (!this.checkpoint) return null;

    const elapsedMs = Date.now() - this.checkpoint.startedAt;
    const totalProcessed =
      this.checkpoint.importedCount + this.checkpoint.skippedCount + this.checkpoint.failedCount;
    const itemsPerSecond = elapsedMs > 0 ? (totalProcessed / elapsedMs) * 1000 : 0;

    const pendingCount = this.checkpoint.fetchedCount - totalProcessed;
    const estimatedRemainingMs =
      itemsPerSecond > 0 ? (pendingCount / itemsPerSecond) * 1000 : undefined;

    return {
      phase: this.checkpoint.phase,
      fetchedCount: this.checkpoint.fetchedCount,
      processedCount: this.checkpoint.processedCount,
      importedCount: this.checkpoint.importedCount,
      skippedCount: this.checkpoint.skippedCount,
      failedCount: this.checkpoint.failedCount,
      elapsedMs,
      itemsPerSecond,
      estimatedRemainingMs,
    };
  }

  /**
   * Notify progress callback
   */
  private notifyProgress(): void {
    if (this.progressCallback) {
      const progress = this.getProgress();
      if (progress) {
        this.progressCallback(progress);
      }
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (!this.config.enableCheckpointing) return;

    this.stopAutoSave();
    this.autoSaveTimer = setInterval(() => {
      this.saveCheckpoint();
    }, this.config.autoSaveIntervalMs);
  }

  /**
   * Stop auto-save timer
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Save checkpoint to file
   */
  async saveCheckpoint(): Promise<void> {
    if (!this.checkpoint || !this.config.enableCheckpointing) return;

    try {
      const checkpointPath = this.getCheckpointPath();
      const content = JSON.stringify(this.checkpoint, null, 2);

      const existingFile = this.app.vault.getAbstractFileByPath(checkpointPath);
      if (existingFile) {
        await this.app.vault.adapter.write(checkpointPath, content);
      } else {
        await this.app.vault.create(checkpointPath, content);
      }
    } catch (error) {
      console.error('Failed to save import checkpoint:', error);
    }
  }

  /**
   * Load checkpoint from file
   */
  async loadCheckpoint(): Promise<ImportCheckpoint | null> {
    if (!this.config.enableCheckpointing) return null;

    try {
      const checkpointPath = this.getCheckpointPath();
      const existingFile = this.app.vault.getAbstractFileByPath(checkpointPath);

      if (existingFile) {
        const content = await this.app.vault.adapter.read(checkpointPath);
        return JSON.parse(content) as ImportCheckpoint;
      }
    } catch (error) {
      console.error('Failed to load import checkpoint:', error);
    }

    return null;
  }

  /**
   * Clear checkpoint file
   */
  async clearCheckpoint(): Promise<void> {
    try {
      const checkpointPath = this.getCheckpointPath();
      const existingFile = this.app.vault.getAbstractFileByPath(checkpointPath);

      if (existingFile) {
        await this.app.vault.adapter.remove(checkpointPath);
      }
    } catch (error) {
      console.error('Failed to clear import checkpoint:', error);
    }
  }

  /**
   * Get checkpoint file path
   */
  private getCheckpointPath(): string {
    return CHECKPOINT_FILE;
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 10): ImportError[] {
    if (!this.checkpoint) return [];
    return this.checkpoint.errors.slice(-limit);
  }

  /**
   * Check if import should continue (not paused/cancelled/completed)
   */
  shouldContinue(): boolean {
    if (!this.checkpoint) return false;
    return (
      !this.checkpoint.completed &&
      !this.checkpoint.cancelled &&
      this.checkpoint.phase !== 'paused' &&
      this.checkpoint.phase !== 'failed'
    );
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopAutoSave();
    this.pendingItems.clear();
  }
}
