# Sync Manager Primary UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Sync Manager the only entry point for importing Reddit items, with cached state for instant open and manual refresh.

**Architecture:** The modal opens instantly with cached Reddit items (if available), displays vault comparison, and provides a "Refresh from Reddit" button. Entry points (ribbon, commands) redirect to open the Sync Manager instead of direct import.

**Tech Stack:** TypeScript, Obsidian API, existing SyncManager/SyncManagerModal classes

---

## Task 1: Add SyncCache Type to types.ts

**Files:**

- Modify: `src/types.ts:100` (after RedditSavedSettings)

**Step 1: Add the SyncCache interface**

Add after line 100 (after `RedditSavedSettings`):

```typescript
/**
 * Cached sync state for instant Sync Manager open
 */
export interface SyncCache {
  /** Cached Reddit items from last fetch */
  items: RedditItem[];
  /** When the cache was last updated (ISO timestamp) */
  lastUpdated: string;
}
```

**Step 2: Add syncCache to RedditSavedSettings**

Add to the `RedditSavedSettings` interface (around line 99, before the closing brace):

```typescript
  // Sync cache for instant Sync Manager open
  syncCache?: SyncCache;
```

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "$(cat <<'EOF'
feat(types): add SyncCache interface for instant sync manager open

Adds cached Reddit items storage to enable instant Sync Manager loading
without requiring a fresh API fetch on every open.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add Cache Methods to SyncManager

**Files:**

- Modify: `src/sync-manager.ts`

**Step 1: Add method to check if cache exists and is valid**

Add after line 40 (after constructor):

```typescript
  /**
   * Check if we have cached Reddit items
   */
  hasCachedItems(): boolean {
    return !!this.settings.syncCache?.items?.length;
  }

  /**
   * Get the last update timestamp for display
   */
  getLastUpdatedDisplay(): string {
    if (!this.settings.syncCache?.lastUpdated) {
      return '';
    }

    const updated = new Date(this.settings.syncCache.lastUpdated);
    const now = new Date();
    const diffMs = now.getTime() - updated.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'yesterday';
    return `${diffDays} days ago`;
  }

  /**
   * Get cached items for display
   */
  getCachedItems(): RedditItem[] {
    return this.settings.syncCache?.items || [];
  }

  /**
   * Update the cache with fresh Reddit items
   */
  updateCache(items: RedditItem[], saveSettings: () => Promise<void>): void {
    this.settings.syncCache = {
      items,
      lastUpdated: new Date().toISOString(),
    };
    void saveSettings();
  }

  /**
   * Clear the cache
   */
  clearCache(saveSettings: () => Promise<void>): void {
    this.settings.syncCache = undefined;
    void saveSettings();
  }
```

**Step 2: Add import for RedditItem if not present**

Ensure the import at top includes `RedditItem`:

```typescript
import {
  RedditItem,
  RedditSavedSettings,
  // ... rest of imports
} from './types';
```

**Step 3: Run type check**

```bash
npm run type-check
```

**Step 4: Commit**

```bash
git add src/sync-manager.ts
git commit -m "$(cat <<'EOF'
feat(sync-manager): add cache methods for instant modal open

Adds methods to check, get, update, and clear cached Reddit items.
Cache includes timestamp for "last updated" display.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Enhance SyncManagerModal with Refresh Button and Loading States

**Files:**

- Modify: `src/sync-modal.ts`

**Step 1: Add new state properties**

Add after line 31 (after `isProcessing`):

```typescript
  private isLoading = false;
  private hasLoadedInitially = false;
  private onRefresh: () => Promise<RedditItem[]>;
  private onSaveSettings: () => Promise<void>;
```

**Step 2: Update constructor to accept new callbacks**

Update the `SyncModalCallbacks` interface (around line 10):

```typescript
interface SyncModalCallbacks {
  onImport: (items: RedditItem[]) => Promise<{ imported: number; skipped: number }>;
  onReprocess: (items: SyncItem[]) => Promise<{ success: number; failed: number }>;
  onRefresh: () => Promise<RedditItem[]>;
  onSaveSettings: () => Promise<void>;
}
```

Update constructor to extract new callbacks (around line 56):

```typescript
this.onRefresh = callbacks.onRefresh;
this.onSaveSettings = callbacks.onSaveSettings;
```

**Step 3: Update buildHeader for new layout**

Replace the `buildHeader` method:

```typescript
  private buildHeader() {
    const { contentEl } = this;
    const header = contentEl.createDiv({ cls: 'sync-modal-header' });

    const titleRow = header.createDiv({ cls: 'sync-header-title-row' });

    const titleSection = titleRow.createDiv({ cls: 'sync-header-title-section' });
    titleSection.createEl('h2', { text: 'Sync manager' });

    // Last updated timestamp
    const lastUpdated = this.syncManager.getLastUpdatedDisplay();
    if (lastUpdated) {
      titleSection.createEl('span', {
        text: `Last updated: ${lastUpdated}`,
        cls: 'sync-last-updated'
      });
    }

    // Refresh button
    const refreshBtn = titleRow.createEl('button', {
      cls: 'sync-refresh-btn mod-cta'
    });
    refreshBtn.textContent = this.isLoading ? 'Fetching...' : 'Refresh from Reddit';
    refreshBtn.disabled = this.isLoading;
    refreshBtn.onclick = () => void this.handleRefreshFromReddit();
  }
```

**Step 4: Add handleRefreshFromReddit method**

Replace the existing `handleRefresh` method with this enhanced version:

```typescript
  private async handleRefreshFromReddit() {
    if (this.isLoading) return;

    this.isLoading = true;
    this.buildUI(); // Rebuild to show loading state

    try {
      const items = await this.onRefresh();

      // Update cache
      this.syncManager.updateCache(items, this.onSaveSettings);

      // Recompute sync state
      this.syncManager.refreshVaultState();
      this.syncManager.computeSyncState(items);

      this.selectedItems.clear();
      this.hasLoadedInitially = true;
      new Notice('Sync status refreshed');
    } catch (error) {
      new Notice(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isLoading = false;
      this.buildUI(); // Rebuild to show results
    }
  }
```

**Step 5: Add empty state rendering**

Update `buildItemList` to show empty state when no cached data:

```typescript
  private buildItemList() {
    const { contentEl } = this;
    this.listContainer = contentEl.createDiv({ cls: 'sync-item-list' });
    this.listContainer.tabIndex = 0;

    // Check if we have any data to show
    if (!this.syncManager.hasCachedItems() && !this.hasLoadedInitially) {
      this.renderEmptyState();
      return;
    }

    this.refreshList();
  }

  private renderEmptyState() {
    this.listContainer.empty();

    const emptyState = this.listContainer.createDiv({ cls: 'sync-empty-state' });
    emptyState.createEl('p', {
      text: 'Click "Refresh from Reddit" to fetch your saved posts and comments',
      cls: 'sync-empty-message'
    });

    const refreshBtn = emptyState.createEl('button', {
      text: 'Refresh from Reddit',
      cls: 'mod-cta sync-empty-refresh-btn'
    });
    refreshBtn.onclick = () => void this.handleRefreshFromReddit();
  }
```

**Step 6: Run type check**

```bash
npm run type-check
```

**Step 7: Commit**

```bash
git add src/sync-modal.ts
git commit -m "$(cat <<'EOF'
feat(sync-modal): add refresh button, timestamp, and empty state

- Prominent "Refresh from Reddit" button in header
- "Last updated: X minutes ago" timestamp display
- Empty state with guidance when no cached data
- Loading states during refresh

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add CSS for New UI Elements

**Files:**

- Modify: `styles.css`

**Step 1: Add styles for new header layout**

Add to the sync modal styles section:

```css
/* Sync Modal Header Enhancements */
.sync-header-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.sync-header-title-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sync-header-title-section h2 {
  margin: 0;
}

.sync-last-updated {
  font-size: 0.85em;
  color: var(--text-muted);
}

.sync-refresh-btn {
  white-space: nowrap;
}

/* Empty State */
.sync-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.sync-empty-message {
  color: var(--text-muted);
  margin-bottom: 20px;
  font-size: 1.1em;
}

.sync-empty-refresh-btn {
  font-size: 1em;
  padding: 10px 20px;
}

/* Checkpoint Banner */
.sync-checkpoint-banner {
  background: var(--background-modifier-warning);
  border: 1px solid var(--text-warning);
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.sync-checkpoint-banner p {
  margin: 0 0 8px 0;
}

.sync-checkpoint-banner .banner-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sync-checkpoint-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
```

**Step 2: Commit**

```bash
git add styles.css
git commit -m "$(cat <<'EOF'
style: add CSS for sync modal header, empty state, and checkpoint banner

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add Checkpoint Banner to SyncManagerModal

**Files:**

- Modify: `src/sync-modal.ts`

**Step 1: Add checkpoint detection property**

Add after the state properties:

```typescript
  private checkpointInfo?: { processed: number; total: number };
  private onResumeCheckpoint: () => Promise<void>;
  private onDiscardCheckpoint: () => Promise<void>;
```

**Step 2: Update SyncModalCallbacks interface**

Add to the interface:

```typescript
  onResumeCheckpoint?: () => Promise<void>;
  onDiscardCheckpoint?: () => Promise<void>;
  checkpointInfo?: { processed: number; total: number };
```

**Step 3: Update constructor to accept checkpoint info**

```typescript
this.checkpointInfo = callbacks.checkpointInfo;
this.onResumeCheckpoint = callbacks.onResumeCheckpoint || (async () => {});
this.onDiscardCheckpoint = callbacks.onDiscardCheckpoint || (async () => {});
```

**Step 4: Add buildCheckpointBanner method**

Add after `buildHeader`:

```typescript
  private buildCheckpointBanner() {
    if (!this.checkpointInfo) return;

    const { contentEl } = this;
    const banner = contentEl.createDiv({ cls: 'sync-checkpoint-banner' });

    const titleEl = banner.createEl('p', { cls: 'banner-title' });
    titleEl.textContent = '⚠️ Interrupted import detected';

    banner.createEl('p', {
      text: `${this.checkpointInfo.processed} of ${this.checkpointInfo.total} items imported before interruption`
    });

    const actions = banner.createDiv({ cls: 'sync-checkpoint-actions' });

    const resumeBtn = actions.createEl('button', {
      text: 'Resume Import',
      cls: 'mod-cta'
    });
    resumeBtn.onclick = async () => {
      await this.onResumeCheckpoint();
      this.checkpointInfo = undefined;
      this.buildUI();
    };

    const discardBtn = actions.createEl('button', { text: 'Discard & Start Fresh' });
    discardBtn.onclick = async () => {
      await this.onDiscardCheckpoint();
      this.checkpointInfo = undefined;
      this.buildUI();
    };
  }
```

**Step 5: Update buildUI to include checkpoint banner**

Update the `buildUI` method:

```typescript
  private buildUI() {
    const { contentEl } = this;
    contentEl.empty();

    this.buildHeader();
    this.buildCheckpointBanner(); // Add this line
    this.buildStatsBar();
    this.buildTabBar();
    this.buildControls();
    this.buildItemList();
    this.buildActionBar();
    this.buildKeyboardHints();
  }
```

**Step 6: Run type check**

```bash
npm run type-check
```

**Step 7: Commit**

```bash
git add src/sync-modal.ts
git commit -m "$(cat <<'EOF'
feat(sync-modal): add checkpoint resume banner

Shows banner when interrupted import is detected with Resume/Discard options.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Rewire Entry Points in main.ts

**Files:**

- Modify: `src/main.ts`

**Step 1: Update ribbon icon to open Sync Manager**

Replace line 74-76:

```typescript
// Add ribbon icon - opens Sync Manager
this.addRibbonIcon('download', 'Open Reddit sync manager', async () => {
  await this.openSyncManager();
});
```

**Step 2: Update fetch-reddit-saved command**

Replace lines 79-85:

```typescript
this.addCommand({
  id: 'fetch-reddit-saved',
  name: 'Fetch saved posts from Reddit',
  callback: async () => {
    await this.openSyncManager();
  },
});
```

**Step 3: Remove preview-reddit-import command**

Delete lines 127-133 (the preview-reddit-import command block).

**Step 4: Remove resume-reddit-import command**

Delete lines 103-109 (the resume-reddit-import command block).

**Step 5: Update openSyncManager to use cache and new callbacks**

Replace the `openSyncManager` method:

```typescript
  /**
   * Open the Sync Manager modal for comprehensive vault/Reddit synchronization
   *
   * Opens instantly with cached data if available, otherwise shows empty state.
   * User clicks "Refresh from Reddit" to fetch latest items.
   */
  async openSyncManager(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      new Notice(MSG_AUTH_REQUIRED);
      await this.auth.initiateOAuth();
      return;
    }

    // Initialize sync manager
    const syncManager = new SyncManager(this.app, this.settings);
    syncManager.scanVault();

    // Check for checkpoint
    let checkpointInfo: { processed: number; total: number } | undefined;
    if (this.settings.enableCheckpointing) {
      const hasResumable = await this.importStateManager.hasResumableSession();
      if (hasResumable) {
        const progress = this.importStateManager.getProgress();
        if (progress) {
          checkpointInfo = {
            processed: progress.processedCount,
            total: progress.fetchedCount,
          };
        }
      }
    }

    // Use cached items if available
    const cachedItems = syncManager.getCachedItems();
    if (cachedItems.length > 0) {
      syncManager.computeSyncState(cachedItems);
    }

    // Open the sync modal with callbacks
    new SyncManagerModal(this.app, syncManager, this.apiClient, this.settings, {
      onImport: async (items: RedditItem[]) => {
        const result = await this.createMarkdownFiles(items);
        return result;
      },
      onReprocess: async (syncItems: SyncItem[]) => {
        return await this.reprocessItems(syncItems);
      },
      onRefresh: async () => {
        await this.auth.ensureValidToken();
        return await this.apiClient.fetchAllSaved();
      },
      onSaveSettings: async () => {
        await this.saveSettings();
      },
      checkpointInfo,
      onResumeCheckpoint: async () => {
        await this.resumeImport();
      },
      onDiscardCheckpoint: async () => {
        this.importStateManager.markCompleted();
        new Notice('Checkpoint discarded');
      },
    }).open();
  }
```

**Step 6: Remove previewImport method**

Delete the entire `previewImport` method (lines 779-818).

**Step 7: Remove PreviewModal class**

Delete the entire `PreviewModal` class (lines 1056-1212).

**Step 8: Run type check and lint**

```bash
npm run type-check && npm run lint
```

**Step 9: Commit**

```bash
git add src/main.ts
git commit -m "$(cat <<'EOF'
feat(main): rewire entry points to Sync Manager

BREAKING: Import workflow now requires Sync Manager selection

- Ribbon icon opens Sync Manager instead of direct import
- fetch-reddit-saved command opens Sync Manager
- Remove preview-reddit-import command (Sync Manager IS the preview)
- Remove resume-reddit-import command (handled by checkpoint banner)
- Remove PreviewModal class
- openSyncManager now uses cache for instant open

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Run Full Test Suite and Fix Issues

**Files:**

- All modified files

**Step 1: Run tests**

```bash
npm test
```

**Step 2: Run full build**

```bash
npm run build
```

**Step 3: Fix any type errors or test failures**

Address issues as they arise.

**Step 4: Commit fixes if any**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: address test and build issues from sync manager refactor

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update CLAUDE.md Documentation

**Files:**

- Modify: `CLAUDE.md`

**Step 1: Add note about Sync Manager being primary UI**

Add a section or update existing documentation to reflect that the Sync Manager is now the primary import interface.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: update CLAUDE.md for sync manager as primary UI

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Summary of Changes

| File                  | Changes                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/types.ts`        | Add `SyncCache` interface, add `syncCache` to settings                                                      |
| `src/sync-manager.ts` | Add cache methods: `hasCachedItems`, `getLastUpdatedDisplay`, `getCachedItems`, `updateCache`, `clearCache` |
| `src/sync-modal.ts`   | Add refresh button, loading states, empty state, checkpoint banner, new callbacks                           |
| `styles.css`          | Add styles for header, empty state, checkpoint banner                                                       |
| `src/main.ts`         | Rewire ribbon/commands, update openSyncManager, remove PreviewModal and preview command                     |
| `CLAUDE.md`           | Document new workflow                                                                                       |

## Removed Code

- `PreviewModal` class (~150 lines)
- `previewImport` method (~40 lines)
- `preview-reddit-import` command (~7 lines)
- `resume-reddit-import` command (~7 lines)
