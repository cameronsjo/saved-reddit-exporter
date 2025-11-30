import { App } from 'obsidian';
import {
  RedditItem,
  RedditSavedSettings,
  SyncItem,
  SyncDiffResult,
  SyncStatus,
  SyncStats,
  VaultItemInfo,
  FilterResult,
} from './types';
import { FilterEngine } from './filters';

/**
 * SyncManager handles sync state computation between Reddit and the vault
 *
 * Responsibilities:
 * - Scan vault for existing Reddit items
 * - Compute diff between Reddit and vault
 * - Track user filter overrides
 * - Provide items for import/unsave/reprocess operations
 */
export class SyncManager {
  private app: App;
  private settings: RedditSavedSettings;
  private filterEngine: FilterEngine;

  /** Map of Reddit ID to vault file info */
  private vaultItems: Map<string, VaultItemInfo> = new Map();

  /** Map of Reddit ID to SyncItem */
  private syncItems: Map<string, SyncItem> = new Map();

  /** Set of Reddit IDs that user has overridden to import anyway */
  private userOverrides: Set<string> = new Set();

  constructor(app: App, settings: RedditSavedSettings) {
    this.app = app;
    this.settings = settings;
    this.filterEngine = new FilterEngine(settings.filterSettings);
  }

  /**
   * Scan the vault for existing Reddit items
   * Extracts frontmatter metadata for display and matching
   * Supports both single `id` and multi-ID `reddit_ids` array in frontmatter
   */
  scanVault(): Map<string, VaultItemInfo> {
    this.vaultItems.clear();

    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      try {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        // Only process files with Reddit-type frontmatter
        if (frontmatter?.type?.startsWith('reddit-')) {
          // Collect all Reddit IDs from this file
          const allIds: string[] = [];

          // Primary ID field
          if (frontmatter.id) {
            allIds.push(frontmatter.id);
          }

          // Additional IDs from reddit_ids array (for merged/collection files)
          if (Array.isArray(frontmatter.reddit_ids)) {
            for (const id of frontmatter.reddit_ids) {
              if (typeof id === 'string' && !allIds.includes(id)) {
                allIds.push(id);
              }
            }
          }

          // Skip if no IDs found
          if (allIds.length === 0) {
            continue;
          }

          const primaryId = allIds[0];
          const additionalIds = allIds.length > 1 ? allIds.slice(1) : undefined;

          const vaultInfo: VaultItemInfo = {
            path: file.path,
            id: primaryId,
            additionalIds,
            title: frontmatter.title,
            subreddit: frontmatter.subreddit,
            type: frontmatter.type,
            author: frontmatter.author,
            score: frontmatter.score,
            contentOrigin: frontmatter.content_origin,
            permalink: frontmatter.permalink,
          };

          // Register ALL IDs as pointing to this vault file
          for (const id of allIds) {
            this.vaultItems.set(id, vaultInfo);
          }
        }
      } catch (error) {
        console.error(`Error reading frontmatter from ${file.path}:`, error);
      }
    }

    return this.vaultItems;
  }

  /**
   * Compute sync state from Reddit items
   * Categories: imported, pending, filtered, orphaned
   */
  computeSyncState(redditItems: RedditItem[]): SyncDiffResult {
    this.syncItems.clear();

    const imported: SyncItem[] = [];
    const pending: SyncItem[] = [];
    const filtered: SyncItem[] = [];
    const orphaned: SyncItem[] = [];

    // Track which Reddit IDs we've seen
    const seenRedditIds = new Set<string>();

    // Process each Reddit item
    for (const item of redditItems) {
      const redditId = item.data.id;
      seenRedditIds.add(redditId);

      const vaultInfo = this.vaultItems.get(redditId);
      const hasOverride = this.userOverrides.has(redditId);

      if (vaultInfo) {
        // Item exists in both Reddit and vault
        const syncItem: SyncItem = {
          item,
          status: 'imported',
          userOverride: false,
          vaultPath: vaultInfo.path,
          vaultInfo,
        };
        this.syncItems.set(redditId, syncItem);
        imported.push(syncItem);
      } else {
        // Item on Reddit but not in vault - check filters
        const filterResult = this.filterEngine.shouldIncludeItem(item);

        let status: SyncStatus;
        if (filterResult.passes) {
          status = 'pending';
        } else if (hasOverride) {
          status = 'override-pending';
        } else {
          status = 'filtered';
        }

        const syncItem: SyncItem = {
          item,
          status,
          filterResult: filterResult.passes ? undefined : filterResult,
          userOverride: hasOverride,
        };

        this.syncItems.set(redditId, syncItem);

        if (status === 'pending') {
          pending.push(syncItem);
        } else {
          // Both 'filtered' and 'override-pending' go to filtered list
          filtered.push(syncItem);
        }
      }
    }

    // Find orphaned items (in vault but not on Reddit)
    for (const [redditId, vaultInfo] of this.vaultItems) {
      if (!seenRedditIds.has(redditId)) {
        const syncItem: SyncItem = {
          // No RedditItem available for orphaned items
          item: undefined,
          status: 'orphaned',
          userOverride: false,
          vaultPath: vaultInfo.path,
          vaultInfo,
        };
        this.syncItems.set(redditId, syncItem);
        orphaned.push(syncItem);
      }
    }

    const stats: SyncStats = {
      totalReddit: redditItems.length,
      totalVault: this.vaultItems.size,
      imported: imported.length,
      pending: pending.length,
      filtered: filtered.length,
      orphaned: orphaned.length,
    };

    return { imported, pending, filtered, orphaned, stats };
  }

  /**
   * Toggle user override for a filtered item
   * Allows importing items that would normally be filtered out
   */
  toggleOverride(redditId: string): boolean {
    const syncItem = this.syncItems.get(redditId);
    if (!syncItem || syncItem.status === 'imported' || syncItem.status === 'orphaned') {
      return false;
    }

    if (this.userOverrides.has(redditId)) {
      // Remove override
      this.userOverrides.delete(redditId);
      syncItem.userOverride = false;
      syncItem.status = 'filtered';
    } else {
      // Add override
      this.userOverrides.add(redditId);
      syncItem.userOverride = true;
      syncItem.status = 'override-pending';
    }

    return true;
  }

  /**
   * Get all items that are ready to import (pending + override-pending)
   */
  getItemsToImport(selectedIds?: Set<string>): RedditItem[] {
    const items: RedditItem[] = [];

    for (const syncItem of this.syncItems.values()) {
      if (syncItem.status === 'pending' || syncItem.status === 'override-pending') {
        if (syncItem.item) {
          // If selectedIds provided, only include selected items
          if (!selectedIds || selectedIds.has(syncItem.item.data.id)) {
            items.push(syncItem.item);
          }
        }
      }
    }

    return items;
  }

  /**
   * Get imported items for reprocessing
   * Returns SyncItems so we know the vault path
   */
  getItemsToReprocess(selectedIds?: Set<string>): SyncItem[] {
    const items: SyncItem[] = [];

    for (const syncItem of this.syncItems.values()) {
      if (syncItem.status === 'imported' && syncItem.item) {
        if (!selectedIds || selectedIds.has(syncItem.item.data.id)) {
          items.push(syncItem);
        }
      }
    }

    return items;
  }

  /**
   * Get items to unsave from Reddit
   * Can include any status that has a RedditItem
   */
  getItemsToUnsave(selectedIds: Set<string>): RedditItem[] {
    const items: RedditItem[] = [];

    for (const syncItem of this.syncItems.values()) {
      if (syncItem.item && selectedIds.has(syncItem.item.data.id)) {
        items.push(syncItem.item);
      }
    }

    return items;
  }

  /**
   * Get orphaned items (in vault but not on Reddit)
   */
  getOrphanedItems(): SyncItem[] {
    return Array.from(this.syncItems.values()).filter(item => item.status === 'orphaned');
  }

  /**
   * Get all sync items
   */
  getAllSyncItems(): SyncItem[] {
    return Array.from(this.syncItems.values());
  }

  /**
   * Get items filtered by status
   */
  getItemsByStatus(status: SyncStatus): SyncItem[] {
    return Array.from(this.syncItems.values()).filter(item => item.status === status);
  }

  /**
   * Get a specific sync item by Reddit ID
   */
  getSyncItem(redditId: string): SyncItem | undefined {
    return this.syncItems.get(redditId);
  }

  /**
   * Clear all user overrides
   */
  clearOverrides(): void {
    for (const redditId of this.userOverrides) {
      const syncItem = this.syncItems.get(redditId);
      if (syncItem) {
        syncItem.userOverride = false;
        syncItem.status = 'filtered';
      }
    }
    this.userOverrides.clear();
  }

  /**
   * Update vault items after import/reprocess
   * Call this after modifying vault files
   */
  refreshVaultState(): void {
    this.scanVault();
  }

  /**
   * Get the Reddit fullname (t3_xxx or t1_xxx) for an item
   * Needed for unsave API calls
   */
  getFullname(syncItem: SyncItem): string | undefined {
    if (syncItem.item) {
      return syncItem.item.data.name;
    }
    // For orphaned items, reconstruct from vault info
    if (syncItem.vaultInfo) {
      const prefix = syncItem.vaultInfo.type?.includes('comment') ? 't1_' : 't3_';
      return prefix + syncItem.vaultInfo.id;
    }
    return undefined;
  }

  /**
   * Get display title for a sync item
   * Works for both Reddit items and orphaned vault items
   */
  getDisplayTitle(syncItem: SyncItem): string {
    if (syncItem.item) {
      const data = syncItem.item.data;
      // For comments, show "Comment on: <post title>"
      if (syncItem.item.kind === 't1') {
        return `Comment on: ${data.link_title || 'Unknown post'}`;
      }
      return data.title || 'Untitled';
    }

    // Orphaned item - use vault frontmatter
    if (syncItem.vaultInfo) {
      return syncItem.vaultInfo.title || `[Deleted] r/${syncItem.vaultInfo.subreddit || 'unknown'}`;
    }

    return 'Unknown item';
  }

  /**
   * Get subreddit for a sync item
   */
  getSubreddit(syncItem: SyncItem): string {
    if (syncItem.item) {
      return syncItem.item.data.subreddit;
    }
    return syncItem.vaultInfo?.subreddit || 'unknown';
  }

  /**
   * Get score for a sync item
   */
  getScore(syncItem: SyncItem): number | undefined {
    if (syncItem.item) {
      return syncItem.item.data.score;
    }
    return syncItem.vaultInfo?.score;
  }

  /**
   * Get created timestamp for a sync item
   */
  getCreatedUtc(syncItem: SyncItem): number | undefined {
    if (syncItem.item) {
      return syncItem.item.data.created_utc;
    }
    return undefined; // Vault items don't store raw timestamp
  }

  /**
   * Check if item is a comment
   */
  isComment(syncItem: SyncItem): boolean {
    if (syncItem.item) {
      return syncItem.item.kind === 't1';
    }
    return syncItem.vaultInfo?.type?.includes('comment') || false;
  }
}
