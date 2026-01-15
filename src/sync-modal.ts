import { App, Menu, Modal, Notice, Platform, setIcon, Setting } from 'obsidian';
import { SyncManager } from './sync-manager';
import { RedditApiClient } from './api-client';
import { RedditItem, RedditSavedSettings, SyncItem, SyncStatus } from './types';

type SyncTab = 'all' | 'pending' | 'imported' | 'filtered' | 'orphaned';
type SyncSortOption = 'status' | 'subreddit' | 'date' | 'score';
type SyncFilterType = 'all' | 'posts' | 'comments';

interface SyncModalCallbacks {
  onImport: (items: RedditItem[]) => Promise<{ imported: number; skipped: number }>;
  onReprocess: (items: SyncItem[]) => Promise<{ success: number; failed: number }>;
  onDeleteFile?: (path: string) => Promise<void>;
}

/**
 * Modal for managing Reddit sync state
 * Provides diff view, bulk import, unsave, and reprocess operations
 */
export class SyncManagerModal extends Modal {
  private syncManager: SyncManager;
  private apiClient: RedditApiClient;
  private settings: RedditSavedSettings;
  private callbacks: SyncModalCallbacks;

  // UI State
  private activeTab: SyncTab = 'all';
  private selectedItems: Set<string> = new Set();
  private searchQuery = '';
  private sortBy: SyncSortOption = 'status';
  private filterType: SyncFilterType = 'all';
  private isProcessing = false;

  // UI references
  private listContainer: HTMLElement;
  private searchInput: HTMLInputElement;
  private actionBar: HTMLElement;
  private tabButtons: Map<SyncTab, HTMLButtonElement> = new Map();
  private tabCounts: Map<SyncTab, number> = new Map();

  // Keyboard navigation
  private focusedIndex = -1;
  private displayedItems: SyncItem[] = [];

  // Long-press handling
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTarget: SyncItem | null = null;
  private readonly LONG_PRESS_DURATION = 500; // ms

  constructor(
    app: App,
    syncManager: SyncManager,
    apiClient: RedditApiClient,
    settings: RedditSavedSettings,
    callbacks: SyncModalCallbacks
  ) {
    super(app);
    this.syncManager = syncManager;
    this.apiClient = apiClient;
    this.settings = settings;
    this.callbacks = callbacks;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();

    // Apply modal class for CSS styling (width: 90vw, max-width: 1100px)
    modalEl.addClass('sync-manager-modal');

    this.setupKeyboardNavigation();
    this.buildUI();
  }

  private setupKeyboardNavigation() {
    this.scope.register([], 'Escape', () => {
      this.close();
      return false;
    });

    this.scope.register(['Mod'], 'a', () => {
      this.selectAllDisplayed();
      return false;
    });

    this.scope.register(['Mod', 'Shift'], 'a', () => {
      this.deselectAllDisplayed();
      return false;
    });

    this.scope.register([], 'ArrowDown', () => {
      this.moveFocus(1);
      return false;
    });

    this.scope.register([], 'ArrowUp', () => {
      this.moveFocus(-1);
      return false;
    });

    this.scope.register([], ' ', e => {
      if (this.focusedIndex >= 0 && document.activeElement !== this.searchInput) {
        this.toggleFocusedItem();
        e.preventDefault();
        return false;
      }
      return true;
    });

    // Shortcut keys for actions
    this.scope.register([], 'i', () => {
      if (!this.isProcessing) void this.handleImport();
      return false;
    });

    this.scope.register([], 'u', () => {
      if (!this.isProcessing) void this.handleUnsave();
      return false;
    });

    this.scope.register([], 'r', () => {
      if (!this.isProcessing) void this.handleReprocess();
      return false;
    });
  }

  private buildUI() {
    const { contentEl } = this;
    contentEl.empty();

    // Calculate tab counts first
    this.updateTabCounts();

    this.buildHeader();
    this.buildTabBar();
    this.buildControls();
    this.buildItemList();
    this.buildActionBar();

    // Only show keyboard hints on desktop
    if (!Platform.isMobile) {
      this.buildKeyboardHints();
    }
  }

  private buildHeader() {
    const { contentEl } = this;
    const header = contentEl.createDiv({ cls: 'sync-modal-header' });

    const titleRow = header.createDiv({ cls: 'sync-header-title-row' });
    titleRow.createEl('h2', { text: 'Sync manager', cls: 'sync-header-title' });

    const headerActions = titleRow.createDiv({ cls: 'sync-header-actions' });

    // Selected count badge
    const selectedBadge = headerActions.createEl('span', { cls: 'sync-selected-badge' });
    selectedBadge.style.display = this.selectedItems.size > 0 ? 'inline-flex' : 'none';
    selectedBadge.textContent = `${this.selectedItems.size} selected`;

    const refreshBtn = headerActions.createEl('button', {
      cls: 'sync-header-btn',
      attr: { 'aria-label': 'Refresh from Reddit' },
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.title = 'Refresh from Reddit';
    refreshBtn.onclick = () => void this.handleRefresh();

    const closeBtn = headerActions.createEl('button', {
      cls: 'sync-header-btn sync-close-btn',
      attr: { 'aria-label': 'Close' },
    });
    setIcon(closeBtn, 'x');
    closeBtn.title = 'Close';
    closeBtn.onclick = () => this.close();

    // Mobile hint
    if (Platform.isMobile) {
      const hint = header.createDiv({ cls: 'sync-mobile-hint' });
      hint.textContent = 'Long-press items for more options';
    }
  }

  private updateTabCounts() {
    const items = this.syncManager.getAllSyncItems();
    this.tabCounts.set('all', items.length);
    this.tabCounts.set('pending', items.filter(i => i.status === 'pending').length);
    this.tabCounts.set('imported', items.filter(i => i.status === 'imported').length);
    this.tabCounts.set(
      'filtered',
      items.filter(i => i.status === 'filtered' || i.status === 'override-pending').length
    );
    this.tabCounts.set('orphaned', items.filter(i => i.status === 'orphaned').length);
  }

  private updateSelectedBadge() {
    const badge = this.contentEl.querySelector('.sync-selected-badge') as HTMLElement;
    if (badge) {
      badge.style.display = this.selectedItems.size > 0 ? 'inline-flex' : 'none';
      badge.textContent = `${this.selectedItems.size} selected`;
    }
  }

  private buildTabBar() {
    const { contentEl } = this;
    const tabBar = contentEl.createDiv({ cls: 'sync-tab-bar' });

    const tabs: Array<{ id: SyncTab; label: string; icon: string }> = [
      { id: 'all', label: 'All', icon: 'list' },
      { id: 'pending', label: 'Pending', icon: 'circle' },
      { id: 'imported', label: 'Imported', icon: 'check-circle' },
      { id: 'filtered', label: 'Filtered', icon: 'filter' },
      { id: 'orphaned', label: 'Orphaned', icon: 'file-x' },
    ];

    for (const tab of tabs) {
      const count = this.tabCounts.get(tab.id) || 0;
      // Skip orphaned tab if no orphaned items
      if (tab.id === 'orphaned' && count === 0) continue;

      const btn = tabBar.createEl('button', { cls: 'sync-tab-btn' });
      btn.dataset.tab = tab.id;

      // Icon + label + count
      const iconSpan = btn.createEl('span', { cls: 'sync-tab-icon' });
      setIcon(iconSpan, tab.icon);
      iconSpan.style.color = this.getStatusColor(
        tab.id === 'all' ? 'pending' : (tab.id as SyncStatus)
      );

      btn.createEl('span', { cls: 'sync-tab-label', text: tab.label });

      if (count > 0 || tab.id === 'all') {
        btn.createEl('span', { cls: 'sync-tab-count', text: String(count) });
      }

      if (this.activeTab === tab.id) {
        btn.addClass('active');
      }

      btn.onclick = () => {
        this.activeTab = tab.id;
        this.selectedItems.clear();
        this.updateTabStyles();
        this.refreshList();
        this.updateActionBar();
        this.updateSelectedBadge();
      };

      this.tabButtons.set(tab.id, btn);
    }
  }

  private updateTabStyles() {
    for (const [id, btn] of this.tabButtons) {
      btn.classList.toggle('active', this.activeTab === id);
    }
  }

  private refreshTabCounts() {
    this.updateTabCounts();
    for (const [id, btn] of this.tabButtons) {
      const countEl = btn.querySelector('.sync-tab-count');
      if (countEl) {
        countEl.textContent = String(this.tabCounts.get(id) || 0);
      }
    }
  }

  private buildControls() {
    const { contentEl } = this;
    const controls = contentEl.createDiv({ cls: 'sync-controls' });

    // Search row
    const searchRow = controls.createDiv({ cls: 'sync-search-row' });

    this.searchInput = searchRow.createEl('input', {
      type: 'text',
      placeholder: 'Search...',
      cls: 'sync-search-input',
    });
    this.searchInput.value = this.searchQuery;
    this.searchInput.oninput = () => {
      this.searchQuery = this.searchInput.value;
      this.refreshList();
    };

    // Filter row
    const filterRow = controls.createDiv({ cls: 'sync-filter-row' });

    // Type filter pills
    const typePills = filterRow.createDiv({ cls: 'sync-filter-pills' });
    const typeOptions: Array<{ value: SyncFilterType; label: string }> = [
      { value: 'all', label: 'All' },
      { value: 'posts', label: 'Posts' },
      { value: 'comments', label: 'Comments' },
    ];
    for (const opt of typeOptions) {
      const pill = typePills.createEl('button', {
        text: opt.label,
        cls: 'sync-filter-pill',
      });
      if (this.filterType === opt.value) pill.addClass('active');
      pill.onclick = () => {
        this.filterType = opt.value;
        typePills.querySelectorAll('.sync-filter-pill').forEach(p => p.removeClass('active'));
        pill.addClass('active');
        this.refreshList();
      };
    }

    // Sort dropdown
    const sortSelect = filterRow.createEl('select', { cls: 'sync-sort-select' });
    const sortOptions = [
      { value: 'status', label: 'Status' },
      { value: 'date', label: 'Newest' },
      { value: 'score', label: 'Top scored' },
      { value: 'subreddit', label: 'Subreddit' },
    ];
    for (const opt of sortOptions) {
      const option = sortSelect.createEl('option', { text: opt.label, value: opt.value });
      option.selected = this.sortBy === opt.value;
    }
    sortSelect.onchange = () => {
      this.sortBy = sortSelect.value as SyncSortOption;
      this.refreshList();
    };

    // Bulk selection
    const bulkRow = filterRow.createDiv({ cls: 'sync-bulk-row' });

    const selectAllBtn = bulkRow.createEl('button', {
      text: 'Select all',
      cls: 'sync-text-btn',
    });
    selectAllBtn.onclick = () => this.selectAllDisplayed();

    const deselectBtn = bulkRow.createEl('button', {
      text: 'Clear',
      cls: 'sync-text-btn',
    });
    deselectBtn.onclick = () => this.deselectAllDisplayed();
  }

  private buildItemList() {
    const { contentEl } = this;
    this.listContainer = contentEl.createDiv({ cls: 'sync-item-list' });
    this.listContainer.tabIndex = 0;

    this.refreshList();
  }

  private refreshList() {
    this.listContainer.empty();
    this.displayedItems = this.getFilteredItems();
    this.focusedIndex = -1;

    if (this.displayedItems.length === 0) {
      this.renderEmptyState();
      this.updateActionBar();
      return;
    }

    for (let i = 0; i < this.displayedItems.length; i++) {
      this.renderSyncItem(this.displayedItems[i], i);
    }

    this.updateActionBar();
  }

  private renderEmptyState() {
    const empty = this.listContainer.createDiv({ cls: 'sync-empty-state' });

    if (this.searchQuery) {
      const iconEl = empty.createDiv({ cls: 'sync-empty-icon' });
      setIcon(iconEl, 'search');
      empty.createEl('div', { cls: 'sync-empty-title', text: 'No matches found' });
      empty.createEl('div', {
        cls: 'sync-empty-desc',
        text: `No items match "${this.searchQuery}"`,
      });
      const clearBtn = empty.createEl('button', {
        text: 'Clear search',
        cls: 'sync-empty-action',
      });
      clearBtn.onclick = () => {
        this.searchQuery = '';
        this.searchInput.value = '';
        this.refreshList();
      };
      return;
    }

    const emptyStates: Record<SyncTab, { icon: string; title: string; desc: string }> = {
      all: {
        icon: 'inbox',
        title: 'No saved items',
        desc: 'Save some posts or comments on Reddit to get started',
      },
      pending: {
        icon: 'check-circle-2',
        title: 'All caught up!',
        desc: 'No new items to import',
      },
      imported: {
        icon: 'folder-open',
        title: 'Nothing imported yet',
        desc: 'Switch to the Pending tab to import items',
      },
      filtered: {
        icon: 'filter-x',
        title: 'No filtered items',
        desc: 'All your saved items pass the current filters',
      },
      orphaned: {
        icon: 'party-popper',
        title: 'No orphaned files',
        desc: 'All vault files have matching Reddit items',
      },
    };

    const state = emptyStates[this.activeTab];
    const iconEl = empty.createDiv({ cls: 'sync-empty-icon' });
    setIcon(iconEl, state.icon);
    empty.createEl('div', { cls: 'sync-empty-title', text: state.title });
    empty.createEl('div', { cls: 'sync-empty-desc', text: state.desc });
  }

  private getFilteredItems(): SyncItem[] {
    let items = this.syncManager.getAllSyncItems();

    // Filter by tab
    if (this.activeTab !== 'all') {
      if (this.activeTab === 'filtered') {
        items = items.filter(i => i.status === 'filtered' || i.status === 'override-pending');
      } else {
        items = items.filter(i => i.status === this.activeTab);
      }
    }

    // Filter by type
    if (this.filterType === 'posts') {
      items = items.filter(i => !this.syncManager.isComment(i));
    } else if (this.filterType === 'comments') {
      items = items.filter(i => this.syncManager.isComment(i));
    }

    // Filter by search
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      items = items.filter(i => {
        const title = this.syncManager.getDisplayTitle(i).toLowerCase();
        const subreddit = this.syncManager.getSubreddit(i).toLowerCase();
        const author = i.item?.data.author?.toLowerCase() || i.vaultInfo?.author?.toLowerCase();
        return (
          title.includes(query) || subreddit.includes(query) || (author && author.includes(query))
        );
      });
    }

    // Sort
    items.sort((a, b) => {
      switch (this.sortBy) {
        case 'status':
          return this.getStatusOrder(a.status) - this.getStatusOrder(b.status);
        case 'subreddit':
          return this.syncManager.getSubreddit(a).localeCompare(this.syncManager.getSubreddit(b));
        case 'date': {
          const dateA = this.syncManager.getCreatedUtc(a) || 0;
          const dateB = this.syncManager.getCreatedUtc(b) || 0;
          return dateB - dateA;
        }
        case 'score': {
          const scoreA = this.syncManager.getScore(a) || 0;
          const scoreB = this.syncManager.getScore(b) || 0;
          return scoreB - scoreA;
        }
        default:
          return 0;
      }
    });

    return items;
  }

  private getStatusOrder(status: SyncStatus): number {
    const order: Record<SyncStatus, number> = {
      pending: 0,
      'override-pending': 1,
      filtered: 2,
      imported: 3,
      orphaned: 4,
    };
    return order[status];
  }

  private renderSyncItem(syncItem: SyncItem, index: number) {
    const isComment = this.syncManager.isComment(syncItem);
    const itemEl = this.listContainer.createDiv({
      cls: `sync-item ${isComment ? 'sync-item-comment' : 'sync-item-post'}`,
    });
    itemEl.dataset.index = String(index);

    if (index === this.focusedIndex) {
      itemEl.addClass('focused');
    }

    // Selection indicator (left border) + checkbox
    const selectArea = itemEl.createDiv({ cls: 'sync-select-area' });
    const isSelected = this.selectedItems.has(this.getItemId(syncItem));
    if (isSelected) {
      itemEl.addClass('selected');
    }

    const checkbox = selectArea.createEl('input', { type: 'checkbox', cls: 'sync-checkbox' });
    checkbox.checked = isSelected;
    checkbox.onclick = e => {
      e.stopPropagation();
      this.toggleSelection(this.getItemId(syncItem));
      this.updateSelectedBadge();
    };

    // Main content area
    const content = itemEl.createDiv({ cls: 'sync-item-content' });

    // Title row with status
    const titleRow = content.createDiv({ cls: 'sync-item-title-row' });

    // Type indicator (post/comment icon)
    const typeIcon = titleRow.createEl('span', {
      cls: 'sync-type-icon',
      attr: { title: isComment ? 'Comment' : 'Post' },
    });
    setIcon(typeIcon, isComment ? 'message-square' : 'file-text');

    const titleEl = titleRow.createEl('span', { cls: 'sync-item-title' });
    titleEl.textContent = this.syncManager.getDisplayTitle(syncItem);

    // Status badge
    const statusBadge = titleRow.createEl('span', { cls: 'sync-status-badge' });
    statusBadge.textContent = this.getStatusLabel(syncItem.status);
    statusBadge.style.setProperty('--status-color', this.getStatusColor(syncItem.status));
    statusBadge.title = this.getStatusTooltip(syncItem);

    // Metadata row
    const metaEl = content.createEl('div', { cls: 'sync-item-meta' });
    const subreddit = this.syncManager.getSubreddit(syncItem);
    const score = this.syncManager.getScore(syncItem);
    const dateStr = this.formatDate(syncItem);

    const metaParts: string[] = [`r/${subreddit}`];
    if (score !== undefined) metaParts.push(`${this.formatScore(score)} pts`);
    if (dateStr) metaParts.push(dateStr);
    metaEl.textContent = metaParts.join(' · ');

    // Filter reason (for filtered items)
    if (syncItem.filterResult && !syncItem.filterResult.passes) {
      const reasonEl = content.createEl('div', { cls: 'sync-filter-reason' });
      reasonEl.createEl('span', {
        text: syncItem.filterResult.reason || 'Filtered',
        cls: 'sync-filter-reason-text',
      });

      const overrideBtn = reasonEl.createEl('button', {
        text: syncItem.userOverride ? 'Undo' : 'Import anyway',
        cls: 'sync-override-btn',
      });
      overrideBtn.onclick = e => {
        e.stopPropagation();
        this.syncManager.toggleOverride(this.getItemId(syncItem));
        this.refreshList();
      };
    }

    // Vault path (for imported/orphaned items)
    if (syncItem.vaultPath) {
      const pathEl = content.createEl('div', { cls: 'sync-vault-path' });
      pathEl.textContent = syncItem.vaultPath;
    }

    // Orphan info
    if (syncItem.status === 'orphaned') {
      const orphanEl = content.createEl('div', { cls: 'sync-orphan-info' });
      orphanEl.textContent = 'No longer saved on Reddit';
    }

    // Click to select
    itemEl.addClass('clickable');
    itemEl.onclick = () => {
      this.toggleSelection(this.getItemId(syncItem));
      this.focusedIndex = index;
      this.updateSelectedBadge();
      // Update just this item's visual state
      itemEl.classList.toggle('selected', this.selectedItems.has(this.getItemId(syncItem)));
      checkbox.checked = this.selectedItems.has(this.getItemId(syncItem));
    };

    // Long-press for context menu (mobile)
    this.attachLongPress(itemEl, syncItem);

    // Right-click context menu (desktop)
    itemEl.oncontextmenu = e => {
      e.preventDefault();
      this.showContextMenu(syncItem, e);
    };
  }

  private getStatusLabel(status: SyncStatus): string {
    switch (status) {
      case 'imported':
        return 'Imported';
      case 'pending':
        return 'Pending';
      case 'filtered':
        return 'Filtered';
      case 'override-pending':
        return 'Override';
      case 'orphaned':
        return 'Orphaned';
    }
  }

  private attachLongPress(element: HTMLElement, syncItem: SyncItem) {
    let startX = 0;
    let startY = 0;

    element.addEventListener('touchstart', (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      this.longPressTarget = syncItem;

      this.longPressTimer = setTimeout(() => {
        // Trigger haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
        this.showContextMenu(syncItem, e);
      }, this.LONG_PRESS_DURATION);
    });

    element.addEventListener('touchmove', (e: TouchEvent) => {
      // Cancel if moved too far (scrolling)
      const moveX = Math.abs(e.touches[0].clientX - startX);
      const moveY = Math.abs(e.touches[0].clientY - startY);
      if (moveX > 10 || moveY > 10) {
        this.cancelLongPress();
      }
    });

    element.addEventListener('touchend', () => {
      this.cancelLongPress();
    });

    element.addEventListener('touchcancel', () => {
      this.cancelLongPress();
    });
  }

  private cancelLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressTarget = null;
  }

  private showContextMenu(syncItem: SyncItem, event: TouchEvent | MouseEvent) {
    const menu = new Menu();
    const itemId = this.getItemId(syncItem);
    const isSelected = this.selectedItems.has(itemId);

    // Selection toggle
    menu.addItem(item => {
      item
        .setTitle(isSelected ? 'Deselect' : 'Select')
        .setIcon(isSelected ? 'square' : 'check-square')
        .onClick(() => {
          this.toggleSelection(itemId);
          this.updateSelectedBadge();
          this.refreshList();
        });
    });

    menu.addSeparator();

    // Open in vault (for imported/orphaned items with vault path)
    if (syncItem.vaultPath) {
      menu.addItem(item => {
        item
          .setTitle('Open in vault')
          .setIcon('file-text')
          .onClick(() => {
            const file = this.app.vault.getAbstractFileByPath(syncItem.vaultPath!);
            if (file) {
              void this.app.workspace.openLinkText(syncItem.vaultPath!, '', false);
              this.close();
            } else {
              new Notice('File not found in vault');
            }
          });
      });
    }

    // Open on Reddit
    const permalink = this.getPermalink(syncItem);
    if (permalink) {
      menu.addItem(item => {
        item
          .setTitle('Open on Reddit')
          .setIcon('external-link')
          .onClick(() => {
            window.open(`https://reddit.com${permalink}`, '_blank');
          });
      });

      menu.addItem(item => {
        item
          .setTitle('Copy Reddit link')
          .setIcon('link')
          .onClick(() => {
            void navigator.clipboard.writeText(`https://reddit.com${permalink}`);
            new Notice('Link copied to clipboard');
          });
      });
    }

    menu.addSeparator();

    // Import (for pending/filtered items)
    if (syncItem.status === 'pending' || syncItem.status === 'override-pending') {
      menu.addItem(item => {
        item
          .setTitle('Import now')
          .setIcon('download')
          .onClick(() => {
            this.selectedItems.clear();
            this.selectedItems.add(itemId);
            void this.handleImport();
          });
      });
    }

    // Reprocess (for imported items)
    if (syncItem.status === 'imported') {
      menu.addItem(item => {
        item
          .setTitle('Reprocess')
          .setIcon('refresh-cw')
          .onClick(() => {
            this.selectedItems.clear();
            this.selectedItems.add(itemId);
            void this.handleReprocess();
          });
      });
    }

    // Toggle filter override (for filtered items)
    if (syncItem.status === 'filtered' || syncItem.status === 'override-pending') {
      menu.addItem(item => {
        item
          .setTitle(syncItem.userOverride ? 'Remove override' : 'Override filter')
          .setIcon(syncItem.userOverride ? 'x' : 'check')
          .onClick(() => {
            this.syncManager.toggleOverride(itemId);
            this.refreshList();
          });
      });
    }

    // Unsave from Reddit (for items still on Reddit)
    if (syncItem.item) {
      menu.addItem(item => {
        item
          .setTitle('Unsave from Reddit')
          .setIcon('trash')
          .onClick(() => {
            this.selectedItems.clear();
            this.selectedItems.add(itemId);
            void this.handleUnsave();
          });
      });
    }

    // Delete vault file (for imported/orphaned items)
    if (syncItem.vaultPath && this.callbacks.onDeleteFile) {
      menu.addSeparator();
      menu.addItem(item => {
        item
          .setTitle('Delete vault file')
          .setIcon('trash-2')
          .onClick(() => {
            void this.handleDeleteFile(syncItem);
          });
      });
    }

    // Show menu at event location
    if (event instanceof TouchEvent) {
      const touch = event.touches[0] || event.changedTouches[0];
      menu.showAtPosition({ x: touch.clientX, y: touch.clientY });
    } else {
      menu.showAtPosition({ x: event.clientX, y: event.clientY });
    }
  }

  private getPermalink(syncItem: SyncItem): string | undefined {
    return syncItem.item?.data.permalink || syncItem.vaultInfo?.permalink;
  }

  private async handleDeleteFile(syncItem: SyncItem) {
    if (!syncItem.vaultPath || !this.callbacks.onDeleteFile) return;

    const confirm = await this.showConfirmation(
      'Delete vault file?',
      `This will permanently delete "${syncItem.vaultPath}" from your vault.`
    );
    if (!confirm) return;

    try {
      await this.callbacks.onDeleteFile(syncItem.vaultPath);
      new Notice('File deleted');

      // Refresh state
      this.syncManager.refreshVaultState();
      const allItems = this.syncManager.getAllSyncItems();
      const redditItems = allItems.filter(i => i.item).map(i => i.item!);
      this.syncManager.computeSyncState(redditItems);
      this.refreshTabCounts();
      this.refreshList();
    } catch (error) {
      new Notice(`Failed to delete: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private buildActionBar() {
    const { contentEl } = this;
    this.actionBar = contentEl.createDiv({ cls: 'sync-action-bar' });

    this.updateActionBar();
  }

  private updateActionBar() {
    this.actionBar.empty();

    const hasSelection = this.selectedItems.size > 0;

    // Primary action based on tab
    if (this.activeTab === 'pending' || this.activeTab === 'all') {
      const importBtn = this.actionBar.createEl('button', {
        text: `Import${hasSelection ? ` (${this.selectedItems.size})` : ''}`,
        cls: 'sync-action-btn mod-cta',
      });
      importBtn.disabled = !hasSelection;
      if (!Platform.isMobile) importBtn.title = 'Keyboard: i';
      importBtn.onclick = () => void this.handleImport();
    }

    if (this.activeTab === 'imported' || this.activeTab === 'all') {
      const reprocessBtn = this.actionBar.createEl('button', {
        text: 'Reprocess',
        cls: 'sync-action-btn',
      });
      reprocessBtn.disabled = !hasSelection;
      if (!Platform.isMobile) reprocessBtn.title = 'Keyboard: r';
      reprocessBtn.onclick = () => void this.handleReprocess();
    }

    if (this.activeTab === 'filtered') {
      const overrideBtn = this.actionBar.createEl('button', {
        text: 'Override & Import',
        cls: 'sync-action-btn mod-cta',
      });
      overrideBtn.disabled = !hasSelection;
      overrideBtn.onclick = () => {
        // Toggle override for all selected, then import
        for (const id of this.selectedItems) {
          const item = this.displayedItems.find(i => this.getItemId(i) === id);
          if (item && !item.userOverride) {
            this.syncManager.toggleOverride(id);
          }
        }
        void this.handleImport();
      };
    }

    // Unsave is available on all tabs except orphaned
    if (this.activeTab !== 'orphaned') {
      const unsaveBtn = this.actionBar.createEl('button', {
        text: 'Unsave',
        cls: 'sync-action-btn mod-warning',
      });
      unsaveBtn.disabled = !hasSelection;
      if (!Platform.isMobile) unsaveBtn.title = 'Keyboard: u';
      unsaveBtn.onclick = () => void this.handleUnsave();
    }

    // For orphaned tab, show delete option if callback exists
    if (this.activeTab === 'orphaned' && this.callbacks.onDeleteFile) {
      const deleteBtn = this.actionBar.createEl('button', {
        text: 'Delete files',
        cls: 'sync-action-btn mod-warning',
      });
      deleteBtn.disabled = !hasSelection;
      deleteBtn.onclick = () => void this.handleBulkDelete();
    }
  }

  private async handleBulkDelete() {
    const itemsToDelete = this.displayedItems.filter(
      item => item.vaultPath && this.selectedItems.has(this.getItemId(item))
    );

    if (itemsToDelete.length === 0) {
      new Notice('No files selected to delete');
      return;
    }

    const confirm = await this.showConfirmation(
      `Delete ${itemsToDelete.length} files?`,
      'This will permanently delete these files from your vault.'
    );
    if (!confirm) return;

    this.isProcessing = true;
    let deleted = 0;
    let failed = 0;

    for (const item of itemsToDelete) {
      try {
        await this.callbacks.onDeleteFile!(item.vaultPath!);
        deleted++;
      } catch {
        failed++;
      }
    }

    new Notice(`Deleted ${deleted} files${failed > 0 ? ` (${failed} failed)` : ''}`);

    // Refresh state
    this.syncManager.refreshVaultState();
    const allItems = this.syncManager.getAllSyncItems();
    const redditItems = allItems.filter(i => i.item).map(i => i.item!);
    this.syncManager.computeSyncState(redditItems);
    this.selectedItems.clear();
    this.refreshTabCounts();
    this.refreshList();
    this.updateSelectedBadge();
    this.isProcessing = false;
  }

  private buildKeyboardHints() {
    const { contentEl } = this;
    const hints = contentEl.createDiv({ cls: 'sync-keyboard-hints' });

    hints.innerHTML = `
      <span><kbd>↑↓</kbd> Navigate</span>
      <span><kbd>Space</kbd> Toggle</span>
      <span><kbd>⌘A</kbd> Select all</span>
      <span><kbd>i</kbd> Import</span>
      <span><kbd>r</kbd> Reprocess</span>
      <span><kbd>u</kbd> Unsave</span>
      <span><kbd>Esc</kbd> Close</span>
    `;
  }

  // Helper methods
  private getItemId(syncItem: SyncItem): string {
    return syncItem.item?.data.id || syncItem.vaultInfo?.id || '';
  }

  private canSelectItem(syncItem: SyncItem): boolean {
    // Can select anything except orphaned items (they have no Reddit data for operations)
    // Actually orphaned can be unsaved, so allow selection
    return true;
  }

  private getStatusIcon(status: SyncStatus): string {
    switch (status) {
      case 'imported':
        return '✓';
      case 'pending':
        return '○';
      case 'filtered':
        return '⚠';
      case 'override-pending':
        return '→';
      case 'orphaned':
        return '⊘';
    }
  }

  private getStatusColor(status: SyncStatus): string {
    switch (status) {
      case 'imported':
        return 'var(--text-success)';
      case 'pending':
        return 'var(--text-accent)';
      case 'filtered':
        return 'var(--text-warning)';
      case 'override-pending':
        return 'var(--color-purple, #9966cc)';
      case 'orphaned':
        return 'var(--text-error)';
    }
  }

  private getStatusTooltip(syncItem: SyncItem): string {
    switch (syncItem.status) {
      case 'imported':
        return `Already in vault: ${syncItem.vaultPath}`;
      case 'pending':
        return 'Ready to import';
      case 'filtered':
        return `Would be filtered: ${syncItem.filterResult?.reason}`;
      case 'override-pending':
        return 'Filter overridden - will be imported';
      case 'orphaned':
        return 'In vault but no longer on Reddit';
    }
  }

  private formatScore(score: number): string {
    if (score >= 10000) {
      return (score / 1000).toFixed(1) + 'k';
    } else if (score >= 1000) {
      return (score / 1000).toFixed(1) + 'k';
    }
    return String(score);
  }

  private formatDate(syncItem: SyncItem): string {
    const timestamp = this.syncManager.getCreatedUtc(syncItem);
    if (!timestamp) return '';

    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  }

  // Selection methods
  private toggleSelection(itemId: string) {
    if (this.selectedItems.has(itemId)) {
      this.selectedItems.delete(itemId);
    } else {
      this.selectedItems.add(itemId);
    }
    this.updateActionBar();
  }

  private selectAllDisplayed() {
    for (const item of this.displayedItems) {
      const id = this.getItemId(item);
      if (id) this.selectedItems.add(id);
    }
    this.updateSelectedBadge();
    this.refreshList();
  }

  private deselectAllDisplayed() {
    for (const item of this.displayedItems) {
      this.selectedItems.delete(this.getItemId(item));
    }
    this.updateSelectedBadge();
    this.refreshList();
  }

  // Keyboard navigation
  private moveFocus(delta: number) {
    if (this.displayedItems.length === 0) return;
    this.focusedIndex += delta;
    if (this.focusedIndex < 0) this.focusedIndex = 0;
    if (this.focusedIndex >= this.displayedItems.length) {
      this.focusedIndex = this.displayedItems.length - 1;
    }
    this.refreshList();

    // Scroll into view
    const focusedEl = this.listContainer.querySelector(`[data-index="${this.focusedIndex}"]`);
    if (focusedEl) {
      focusedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  private toggleFocusedItem() {
    if (this.focusedIndex >= 0 && this.focusedIndex < this.displayedItems.length) {
      const item = this.displayedItems[this.focusedIndex];
      this.toggleSelection(this.getItemId(item));
      this.refreshList();
    }
  }

  // Action handlers
  private async handleImport() {
    const itemsToImport = this.syncManager.getItemsToImport(this.selectedItems);

    if (itemsToImport.length === 0) {
      new Notice('No importable items selected');
      return;
    }

    const confirm = await this.showConfirmation(
      `Import ${itemsToImport.length} items?`,
      'This will create new files in your vault.'
    );
    if (!confirm) return;

    this.isProcessing = true;
    new Notice(`Importing ${itemsToImport.length} items...`);

    try {
      const result = await this.callbacks.onImport(itemsToImport);
      new Notice(`Imported ${result.imported} items (${result.skipped} skipped)`);

      // Refresh state
      this.syncManager.refreshVaultState();
      this.selectedItems.clear();
      // Re-compute sync state with existing Reddit items
      const allItems = this.syncManager.getAllSyncItems();
      const redditItems = allItems.filter(i => i.item).map(i => i.item!);
      this.syncManager.computeSyncState(redditItems);
      this.refreshList();
    } catch (error) {
      new Notice(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async handleReprocess() {
    // Get imported items that are selected
    const importedSelected = this.displayedItems.filter(
      item => item.status === 'imported' && this.selectedItems.has(this.getItemId(item))
    );

    if (importedSelected.length === 0) {
      new Notice('No imported items selected for reprocessing');
      return;
    }

    const confirm = await this.showConfirmation(
      `Reprocess ${importedSelected.length} items?`,
      'This will fetch fresh data from Reddit and overwrite existing files.'
    );
    if (!confirm) return;

    this.isProcessing = true;
    new Notice(`Reprocessing ${importedSelected.length} items...`);

    try {
      const result = await this.callbacks.onReprocess(importedSelected);
      new Notice(`Reprocessed ${result.success} items (${result.failed} failed)`);

      this.selectedItems.clear();
      this.refreshList();
    } catch (error) {
      new Notice(`Reprocess failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async handleUnsave() {
    const itemsToUnsave = this.syncManager.getItemsToUnsave(this.selectedItems);

    if (itemsToUnsave.length === 0) {
      new Notice('No items selected to unsave');
      return;
    }

    const confirm = await this.showConfirmation(
      `Unsave ${itemsToUnsave.length} items from Reddit?`,
      'This will remove them from your Reddit saved list. Vault files will be preserved.'
    );
    if (!confirm) return;

    this.isProcessing = true;
    new Notice(`Unsaving ${itemsToUnsave.length} items...`);

    try {
      await this.apiClient.unsaveItems(itemsToUnsave);
      new Notice(`Unsaved ${itemsToUnsave.length} items from Reddit`);

      this.selectedItems.clear();
      // Note: We don't refresh from Reddit here - items will show as orphaned on next refresh
      this.refreshList();
    } catch (error) {
      new Notice(`Unsave failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async handleRefresh() {
    this.isProcessing = true;
    new Notice('Refreshing sync status...');

    try {
      const savedItems = await this.apiClient.fetchAllSaved();
      this.syncManager.refreshVaultState();
      this.syncManager.computeSyncState(savedItems);
      this.selectedItems.clear();
      this.refreshTabCounts();
      this.refreshList();
      this.updateSelectedBadge();
      new Notice('Sync status refreshed');
    } catch (error) {
      new Notice(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private showConfirmation(title: string, message: string): Promise<boolean> {
    return new Promise(resolve => {
      const modal = new ConfirmationModal(this.app, title, message, resolve);
      modal.open();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/**
 * Simple confirmation modal
 */
class ConfirmationModal extends Modal {
  private title: string;
  private message: string;
  private onResult: (confirmed: boolean) => void;

  constructor(app: App, title: string, message: string, onResult: (confirmed: boolean) => void) {
    super(app);
    this.title = title;
    this.message = message;
    this.onResult = onResult;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    new Setting(contentEl).setName(this.title).setHeading();
    contentEl.createEl('p', { text: this.message });

    const buttonContainer = contentEl.createDiv({ cls: 'confirmation-button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => {
      this.onResult(false);
      this.close();
    };

    const confirmBtn = buttonContainer.createEl('button', { text: 'Confirm' });
    confirmBtn.addClass('mod-cta');
    confirmBtn.onclick = () => {
      this.onResult(true);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
