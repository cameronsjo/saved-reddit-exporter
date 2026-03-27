import { App, Modal, Notice, Setting } from 'obsidian';
import { SyncManager } from './sync-manager';
import { RedditApiClient } from './api-client';
import { RedditItem, RedditSavedSettings, SyncItem, SyncStatus } from './types';

type SyncTab = 'all' | 'pending' | 'imported' | 'filtered' | 'orphaned';
type SyncSortOption = 'status' | 'subreddit' | 'date' | 'score';
type SyncFilterType = 'all' | 'posts' | 'comments';

interface SyncModalCallbacks {
  onImport: (items: RedditItem[]) => Promise<{ imported: number; skipped: number }>;
  onReprocess: (items: SyncItem[]) => Promise<{ success: number; failed: number }>;
  onRefresh: () => Promise<RedditItem[]>;
  onSaveSettings: () => Promise<void>;
  onResumeCheckpoint?: () => Promise<void>;
  onDiscardCheckpoint?: () => Promise<void>;
  checkpointInfo?: { processed: number; total: number };
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
  private isLoading = false;
  private hasLoadedInitially = false;
  private showUnsaved = false;
  private onRefresh: () => Promise<RedditItem[]>;
  private onSaveSettings: () => Promise<void>;
  private checkpointInfo?: { processed: number; total: number };
  private onResumeCheckpoint: () => Promise<void>;
  private onDiscardCheckpoint: () => Promise<void>;

  // UI references
  private listContainer: HTMLElement;
  private statsContainer: HTMLElement;
  private searchInput: HTMLInputElement;
  private actionBar: HTMLElement;
  private tabButtons: Map<SyncTab, HTMLButtonElement> = new Map();

  // Keyboard navigation
  private focusedIndex = -1;
  private displayedItems: SyncItem[] = [];

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
    this.onRefresh = callbacks.onRefresh;
    this.onSaveSettings = callbacks.onSaveSettings;
    this.checkpointInfo = callbacks.checkpointInfo;
    this.onResumeCheckpoint = callbacks.onResumeCheckpoint || (async () => {});
    this.onDiscardCheckpoint = callbacks.onDiscardCheckpoint || (async () => {});
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

    this.buildHeader();
    this.buildCheckpointBanner();
    this.buildStatsBar();
    this.buildTabBar();
    this.buildControls();
    this.buildItemList();
    this.buildActionBar();
    this.buildKeyboardHints();
  }

  private buildHeader() {
    const { contentEl } = this;
    const header = contentEl.createDiv({ cls: 'sync-modal-header' });

    // Left side: title and timestamp
    const titleSection = header.createDiv({ cls: 'sync-modal-title-section' });
    new Setting(titleSection).setName('Sync manager').setHeading();

    // Last updated timestamp
    const lastUpdatedDisplay = this.syncManager.getLastUpdatedDisplay();
    if (lastUpdatedDisplay) {
      const timestampEl = titleSection.createDiv({ cls: 'sync-last-updated' });
      timestampEl.textContent = `Last updated: ${lastUpdatedDisplay}`;
    }

    // Right side: refresh button
    const refreshBtn = header.createEl('button', {
      text: this.isLoading ? 'Fetching...' : 'Refresh from Reddit',
      cls: 'sync-refresh-btn',
    });
    refreshBtn.disabled = this.isLoading;
    if (!this.isLoading) {
      refreshBtn.addClass('mod-cta');
    }
    refreshBtn.onclick = () => void this.handleRefreshFromReddit();
  }

  private buildCheckpointBanner() {
    if (!this.checkpointInfo) return;

    const { contentEl } = this;
    const banner = contentEl.createDiv({ cls: 'sync-checkpoint-banner' });

    const titleEl = banner.createEl('p', { cls: 'banner-title' });
    titleEl.textContent = '⚠️ Interrupted import detected';

    banner.createEl('p', {
      text: `${this.checkpointInfo.processed} of ${this.checkpointInfo.total} items imported before interruption`,
    });

    const actions = banner.createDiv({ cls: 'sync-checkpoint-actions' });

    const resumeBtn = actions.createEl('button', {
      text: 'Resume Import',
      cls: 'mod-cta',
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

  private buildStatsBar() {
    const { contentEl } = this;
    this.statsContainer = contentEl.createDiv({ cls: 'sync-stats-bar' });

    this.updateStats();
  }

  private computeStatusCounts(): Record<string, number> {
    const items = this.syncManager.getAllSyncItems();
    return {
      imported: items.filter(i => i.status === 'imported').length,
      pending: items.filter(i => i.status === 'pending').length,
      filtered: items.filter(i => i.status === 'filtered' || i.status === 'override-pending').length,
      orphaned: items.filter(i => i.status === 'orphaned').length,
      all: items.filter(i => this.showUnsaved || i.status !== 'orphaned').length,
    };
  }

  private updateStats() {
    const counts = this.computeStatusCounts();

    this.statsContainer.empty();

    const createStat = (label: string, count: number, statusClass?: string) => {
      const stat = this.statsContainer.createDiv({ cls: 'stat-item' });
      stat.createEl('span', { text: `${label}:`, cls: 'stat-label' });
      const valueEl = stat.createEl('strong', { text: String(count), cls: 'stat-value' });
      if (statusClass) {
        valueEl.addClass(statusClass);
      }
    };

    createStat('In Vault', counts.imported, 'imported');
    createStat('Ready', counts.pending, 'pending');
    createStat('Skipped', counts.filtered, 'filtered');
    if (this.showUnsaved && counts.orphaned > 0) {
      createStat('Unsaved', counts.orphaned, 'orphaned');
    }
  }

  private buildTabBar() {
    const { contentEl } = this;
    const tabBar = contentEl.createDiv({ cls: 'sync-tab-bar' });

    const counts = this.computeStatusCounts();

    const tabs: Array<{ id: SyncTab; label: string; count: number }> = [
      { id: 'all', label: 'All', count: counts.all },
      { id: 'pending', label: 'Ready', count: counts.pending },
      { id: 'imported', label: 'In Vault', count: counts.imported },
      { id: 'filtered', label: 'Skipped', count: counts.filtered },
    ];

    // Only show Unsaved tab when toggle is on
    if (this.showUnsaved) {
      tabs.push({ id: 'orphaned', label: 'Unsaved', count: counts.orphaned });
    }

    for (const tab of tabs) {
      const btn = tabBar.createEl('button', {
        text: `${tab.label} (${tab.count})`,
        cls: 'sync-tab-btn',
      });

      if (this.activeTab === tab.id) {
        btn.addClass('mod-cta');
      }

      btn.onclick = () => {
        this.activeTab = tab.id;
        this.selectedItems.clear();
        this.updateTabStyles();
        this.refreshList();
        this.updateActionBar();
      };

      this.tabButtons.set(tab.id, btn);
    }
  }

  private updateTabStyles() {
    const counts = this.computeStatusCounts();
    const labelMap: Record<SyncTab, string> = {
      all: 'All',
      pending: 'Ready',
      imported: 'In Vault',
      filtered: 'Skipped',
      orphaned: 'Unsaved',
    };

    for (const [id, btn] of this.tabButtons) {
      btn.classList.toggle('mod-cta', this.activeTab === id);
      const count = id === 'all' ? counts.all : counts[id] ?? 0;
      btn.textContent = `${labelMap[id]} (${count})`;
    }
  }

  private buildControls() {
    const { contentEl } = this;
    const controls = contentEl.createDiv({ cls: 'sync-controls' });

    // Search input
    this.searchInput = controls.createEl('input', {
      type: 'text',
      placeholder: 'Search by title, subreddit, or author...',
      cls: 'sync-search-input',
    });
    this.searchInput.value = this.searchQuery;
    this.searchInput.oninput = () => {
      this.searchQuery = this.searchInput.value;
      this.refreshList();
    };

    // Type filter
    const typeSelect = controls.createEl('select', { cls: 'sync-select' });
    const typeOptions = [
      { value: 'all', label: 'All types' },
      { value: 'posts', label: 'Posts only' },
      { value: 'comments', label: 'Comments only' },
    ];
    for (const opt of typeOptions) {
      const option = typeSelect.createEl('option', { text: opt.label, value: opt.value });
      option.selected = this.filterType === opt.value;
    }
    typeSelect.onchange = () => {
      this.filterType = typeSelect.value as SyncFilterType;
      this.refreshList();
    };

    // Sort select
    const sortSelect = controls.createEl('select', { cls: 'sync-select' });
    const sortOptions = [
      { value: 'status', label: 'Sort: Status' },
      { value: 'subreddit', label: 'Sort: Subreddit' },
      { value: 'date', label: 'Sort: Date' },
      { value: 'score', label: 'Sort: Score' },
    ];
    for (const opt of sortOptions) {
      const option = sortSelect.createEl('option', { text: opt.label, value: opt.value });
      option.selected = this.sortBy === opt.value;
    }
    sortSelect.onchange = () => {
      this.sortBy = sortSelect.value as SyncSortOption;
      this.refreshList();
    };

    // Show unsaved toggle
    const unsavedToggle = controls.createEl('label', { cls: 'sync-unsaved-toggle' });
    const unsavedCheckbox = unsavedToggle.createEl('input', { type: 'checkbox' });
    unsavedCheckbox.checked = this.showUnsaved;
    unsavedToggle.createSpan({ text: 'Show unsaved' });
    unsavedCheckbox.onchange = () => {
      this.showUnsaved = unsavedCheckbox.checked;
      if (!this.showUnsaved && this.activeTab === 'orphaned') {
        this.activeTab = 'all';
      }
      this.buildUI();
    };

    // Bulk selection buttons
    const bulkActions = controls.createDiv({ cls: 'sync-bulk-actions' });

    const selectAllBtn = bulkActions.createEl('button', {
      text: 'Select all',
      cls: 'sync-bulk-btn',
    });
    selectAllBtn.onclick = () => this.selectAllDisplayed();

    const deselectAllBtn = bulkActions.createEl('button', {
      text: 'Deselect',
      cls: 'sync-bulk-btn',
    });
    deselectAllBtn.onclick = () => this.deselectAllDisplayed();
  }

  private buildItemList() {
    const { contentEl } = this;
    this.listContainer = contentEl.createDiv({ cls: 'sync-item-list' });
    this.listContainer.tabIndex = 0;

    // Check if we have any cached data
    if (!this.syncManager.hasCachedItems() && !this.hasLoadedInitially) {
      this.renderEmptyState();
      return;
    }

    this.refreshList();
  }

  private renderEmptyState() {
    const emptyState = this.listContainer.createDiv({ cls: 'sync-empty-state' });

    emptyState.createEl('h3', { text: 'Welcome to Sync Manager', cls: 'sync-empty-title' });

    const message = emptyState.createDiv({ cls: 'sync-empty-message' });
    message.textContent = 'See what\u2019s new on Reddit and manage your imports.';

    const refreshBtn = emptyState.createEl('button', {
      text: this.isLoading ? 'Fetching...' : 'Fetch from Reddit',
      cls: 'sync-empty-refresh-btn',
    });
    refreshBtn.disabled = this.isLoading;
    if (!this.isLoading) {
      refreshBtn.addClass('mod-cta');
    }
    refreshBtn.onclick = () => void this.handleRefreshFromReddit();
  }

  private refreshList() {
    this.listContainer.empty();
    this.displayedItems = this.getFilteredItems();
    this.focusedIndex = -1;

    if (this.displayedItems.length === 0) {
      const emptyMsg = this.listContainer.createDiv({ cls: 'sync-empty-msg' });
      if (this.searchQuery) {
        emptyMsg.textContent = 'No items match your search';
      } else if (this.activeTab === 'pending') {
        const counts = this.computeStatusCounts();
        emptyMsg.textContent = counts.imported > 0
          ? `All caught up \u2014 ${counts.imported} items in your vault. No new items to import.`
          : 'No items ready to import.';
      } else {
        const tabLabel = this.activeTab === 'all' ? '' : this.getStatusLabel(this.activeTab as SyncStatus).toLowerCase() + ' ';
        emptyMsg.textContent = `No ${tabLabel}items to display`;
      }
      this.updateStats();
      return;
    }

    for (let i = 0; i < this.displayedItems.length; i++) {
      this.renderSyncItem(this.displayedItems[i], i);
    }

    this.updateStats();
  }

  private getFilteredItems(): SyncItem[] {
    let items = this.syncManager.getAllSyncItems();

    // Exclude unsaved items unless toggle is on
    if (!this.showUnsaved && this.activeTab !== 'orphaned') {
      items = items.filter(i => i.status !== 'orphaned');
    }

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
    const itemEl = this.listContainer.createDiv({ cls: 'sync-item' });
    itemEl.dataset.index = String(index);

    if (index === this.focusedIndex) {
      itemEl.addClass('focused');
    }

    // Status icon
    const statusIcon = itemEl.createEl('span', { cls: 'sync-status-icon' });
    statusIcon.textContent = this.getStatusIcon(syncItem.status);
    statusIcon.setCssProps({ color: this.getStatusColor(syncItem.status) });
    statusIcon.title = this.getStatusTooltip(syncItem);

    // Checkbox (for items that can be selected)
    const canSelect = this.canSelectItem(syncItem);
    if (canSelect) {
      const checkbox = itemEl.createEl('input', { type: 'checkbox', cls: 'sync-checkbox' });
      checkbox.checked = this.selectedItems.has(this.getItemId(syncItem));
      checkbox.onclick = e => {
        e.stopPropagation();
        this.toggleSelection(this.getItemId(syncItem));
      };
    } else {
      // Spacer for alignment
      itemEl.createDiv({ cls: 'sync-spacer' });
    }

    // Content
    const content = itemEl.createDiv({ cls: 'sync-item-content' });

    // Title
    const titleEl = content.createEl('div', { cls: 'sync-item-title' });
    titleEl.textContent = this.syncManager.getDisplayTitle(syncItem);

    // Metadata row
    const metaEl = content.createEl('div', { cls: 'sync-item-meta' });

    const subreddit = this.syncManager.getSubreddit(syncItem);
    const isComment = this.syncManager.isComment(syncItem);
    const score = this.syncManager.getScore(syncItem);
    const dateStr = this.formatDate(syncItem);

    // Build metadata safely using DOM API to prevent XSS
    metaEl.createSpan({ text: `r/${subreddit}` });
    metaEl.createSpan({ text: ' • ', cls: 'sync-item-separator' });
    metaEl.createSpan({ text: isComment ? 'Comment' : 'Post' });
    if (score !== undefined) {
      metaEl.createSpan({ text: ' • ', cls: 'sync-item-separator' });
      metaEl.createSpan({ text: `${this.formatScore(score)} pts` });
    }
    if (dateStr) {
      metaEl.createSpan({ text: ' • ', cls: 'sync-item-separator' });
      metaEl.createSpan({ text: dateStr });
    }

    // Filter reason (for filtered items)
    if (syncItem.filterResult && !syncItem.filterResult.passes) {
      const reasonEl = content.createEl('div', { cls: 'sync-filter-reason' });

      reasonEl.createEl('span', { text: `⚠ ${syncItem.filterResult.reason}` });

      if (!syncItem.userOverride) {
        const overrideBtn = reasonEl.createEl('button', {
          text: 'Import anyway',
          cls: 'sync-override-btn',
        });
        overrideBtn.onclick = e => {
          e.stopPropagation();
          this.syncManager.toggleOverride(this.getItemId(syncItem));
          this.refreshList();
        };
      } else {
        const undoBtn = reasonEl.createEl('button', {
          text: 'Undo override',
          cls: 'sync-override-btn',
        });
        undoBtn.onclick = e => {
          e.stopPropagation();
          this.syncManager.toggleOverride(this.getItemId(syncItem));
          this.refreshList();
        };
      }
    }

    // Orphan info
    if (syncItem.status === 'orphaned') {
      const orphanEl = content.createEl('div', { cls: 'sync-orphan-info' });
      orphanEl.textContent = 'Unsaved from Reddit \u2014 file preserved in vault';
    }

    // Vault path (for imported items)
    if (syncItem.vaultPath) {
      const pathEl = content.createEl('div', { cls: 'sync-vault-path' });
      pathEl.textContent = `📁 ${syncItem.vaultPath}`;
    }

    // Click to select
    if (canSelect) {
      itemEl.addClass('clickable');
      itemEl.onclick = () => {
        this.toggleSelection(this.getItemId(syncItem));
        this.focusedIndex = index;
        this.refreshList();
      };
    }
  }

  private buildActionBar() {
    const { contentEl } = this;
    this.actionBar = contentEl.createDiv({ cls: 'sync-action-bar' });

    this.updateActionBar();
  }

  private updateActionBar() {
    this.actionBar.empty();

    // Selected count (left-aligned)
    if (this.selectedItems.size > 0) {
      const countEl = this.actionBar.createSpan({ cls: 'sync-selected-count' });
      countEl.textContent = `${this.selectedItems.size} selected`;
    }

    // Spacer to push buttons right
    this.actionBar.createDiv({ cls: 'sync-action-spacer' });

    const hasSelection = this.selectedItems.size > 0;

    // Import button (for pending/filtered tabs)
    if (['all', 'pending', 'filtered'].includes(this.activeTab)) {
      const importBtn = this.actionBar.createEl('button', { text: 'Import selected' });
      importBtn.addClass('mod-cta');
      importBtn.disabled = !hasSelection;
      importBtn.title = hasSelection ? 'Import selected items (i)' : 'Select items to import';
      importBtn.onclick = () => void this.handleImport();
    }

    // Reprocess button (for imported tab)
    if (['all', 'imported'].includes(this.activeTab)) {
      const reprocessBtn = this.actionBar.createEl('button', { text: 'Reprocess selected' });
      reprocessBtn.disabled = !hasSelection;
      reprocessBtn.title = hasSelection ? 'Re-fetch and update selected items (r)' : 'Select items to reprocess';
      reprocessBtn.onclick = () => void this.handleReprocess();
    }

    // Unsave button (for all tabs)
    const unsaveBtn = this.actionBar.createEl('button', { text: 'Unsave selected' });
    unsaveBtn.addClass('mod-warning');
    unsaveBtn.disabled = !hasSelection;
    unsaveBtn.title = hasSelection ? 'Remove selected from Reddit saved list (u)' : 'Select items to unsave';
    unsaveBtn.onclick = () => void this.handleUnsave();

    // Close button
    const closeBtn = this.actionBar.createEl('button', { text: 'Close' });
    closeBtn.onclick = () => this.close();
  }

  private buildKeyboardHints() {
    const { contentEl } = this;
    const hints = contentEl.createDiv({ cls: 'sync-keyboard-hints' });

    const shortcuts = [
      ['\u2191\u2193', 'Navigate'],
      ['Space', 'Toggle'],
      ['\u2318A', 'Select all'],
      ['i', 'Import'],
      ['r', 'Reprocess'],
      ['u', 'Unsave'],
      ['Esc', 'Close'],
    ];

    for (const [key, label] of shortcuts) {
      const span = hints.createSpan();
      span.createEl('kbd', { text: key });
      span.appendText(` ${label}`);
    }
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
        return '\u2713';
      case 'pending':
        return '\u25CB';
      case 'filtered':
        return '\u26A0';
      case 'override-pending':
        return '\u2192';
      case 'orphaned':
        return '\u2298';
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
        return 'var(--text-muted)';
    }
  }

  private getStatusTooltip(syncItem: SyncItem): string {
    switch (syncItem.status) {
      case 'imported':
        return `In vault: ${syncItem.vaultPath}`;
      case 'pending':
        return 'Ready to import into your vault';
      case 'filtered':
        return `Skipped by filter: ${syncItem.filterResult?.reason}`;
      case 'override-pending':
        return 'Filter overridden \u2014 will be imported';
      case 'orphaned':
        return 'Imported, then unsaved from Reddit. File preserved in vault.';
    }
  }

  private getStatusLabel(status: SyncStatus): string {
    switch (status) {
      case 'imported':
        return 'In Vault';
      case 'pending':
        return 'Ready';
      case 'filtered':
        return 'Skipped';
      case 'override-pending':
        return 'Will Import';
      case 'orphaned':
        return 'Unsaved';
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
    this.updateStats();
  }

  private selectAllDisplayed() {
    for (const item of this.displayedItems) {
      const id = this.getItemId(item);
      if (id) this.selectedItems.add(id);
    }
    this.refreshList();
  }

  private deselectAllDisplayed() {
    for (const item of this.displayedItems) {
      this.selectedItems.delete(this.getItemId(item));
    }
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

  private async handleRefreshFromReddit() {
    // Prevent concurrent refresh operations
    if (this.isLoading) {
      new Notice('Refresh already in progress');
      return;
    }

    this.isLoading = true;
    this.buildUI(); // Rebuild to show loading state

    try {
      const savedItems = await this.onRefresh();
      this.syncManager.updateCache(savedItems, this.onSaveSettings);
      this.syncManager.refreshVaultState();
      this.syncManager.computeSyncState(savedItems);
      this.selectedItems.clear();
      this.hasLoadedInitially = true;
      new Notice(`Refreshed: ${savedItems.length} saved items from Reddit`);
    } catch (error) {
      new Notice(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isLoading = false;
      this.buildUI(); // Rebuild to show updated state
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
