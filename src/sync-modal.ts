import { App, Modal, Notice } from 'obsidian';
import { SyncManager } from './sync-manager';
import { RedditApiClient } from './api-client';
import { RedditItem, RedditSavedSettings, SyncItem, SyncStatus } from './types';

type SyncTab = 'all' | 'pending' | 'imported' | 'filtered' | 'orphaned';
type SyncSortOption = 'status' | 'subreddit' | 'date' | 'score';
type SyncFilterType = 'all' | 'posts' | 'comments';

interface SyncModalCallbacks {
  onImport: (items: RedditItem[]) => Promise<{ imported: number; skipped: number }>;
  onReprocess: (items: SyncItem[]) => Promise<{ success: number; failed: number }>;
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
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('sync-manager-modal');
    contentEl.style.width = '750px';

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
      if (!this.isProcessing) this.handleImport();
      return false;
    });

    this.scope.register([], 'u', () => {
      if (!this.isProcessing) this.handleUnsave();
      return false;
    });

    this.scope.register([], 'r', () => {
      if (!this.isProcessing) this.handleReprocess();
      return false;
    });
  }

  private buildUI() {
    const { contentEl } = this;
    contentEl.empty();

    this.buildHeader();
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
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '15px';

    header.createEl('h2', { text: 'Sync Manager' });

    const refreshBtn = header.createEl('button', { text: '↻ Refresh' });
    refreshBtn.onclick = () => this.handleRefresh();
  }

  private buildStatsBar() {
    const { contentEl } = this;
    this.statsContainer = contentEl.createDiv({ cls: 'sync-stats-bar' });
    this.statsContainer.style.display = 'flex';
    this.statsContainer.style.gap = '20px';
    this.statsContainer.style.padding = '10px 15px';
    this.statsContainer.style.backgroundColor = 'var(--background-secondary)';
    this.statsContainer.style.borderRadius = '6px';
    this.statsContainer.style.marginBottom = '15px';
    this.statsContainer.style.fontSize = '13px';

    this.updateStats();
  }

  private updateStats() {
    const items = this.syncManager.getAllSyncItems();
    const stats = {
      imported: items.filter(i => i.status === 'imported').length,
      pending: items.filter(i => i.status === 'pending').length,
      filtered: items.filter(i => i.status === 'filtered' || i.status === 'override-pending')
        .length,
      orphaned: items.filter(i => i.status === 'orphaned').length,
      overridden: items.filter(i => i.status === 'override-pending').length,
    };

    this.statsContainer.empty();

    const createStat = (label: string, count: number, color?: string) => {
      const stat = this.statsContainer.createDiv();
      stat.innerHTML = `<span style="color: var(--text-muted)">${label}:</span> <strong style="${color ? `color: ${color}` : ''}">${count}</strong>`;
    };

    createStat('Imported', stats.imported, 'var(--text-success)');
    createStat('Pending', stats.pending, 'var(--text-accent)');
    createStat(
      'Filtered',
      stats.filtered,
      stats.overridden > 0 ? 'var(--text-warning)' : undefined
    );
    if (stats.overridden > 0) {
      createStat('Overridden', stats.overridden, 'var(--color-purple)');
    }
    if (stats.orphaned > 0) {
      createStat('Orphaned', stats.orphaned, 'var(--text-error)');
    }
    createStat('Selected', this.selectedItems.size);
  }

  private buildTabBar() {
    const { contentEl } = this;
    const tabBar = contentEl.createDiv({ cls: 'sync-tab-bar' });
    tabBar.style.display = 'flex';
    tabBar.style.gap = '5px';
    tabBar.style.marginBottom = '15px';

    const tabs: Array<{ id: SyncTab; label: string }> = [
      { id: 'all', label: 'All' },
      { id: 'pending', label: 'Pending' },
      { id: 'imported', label: 'Imported' },
      { id: 'filtered', label: 'Filtered' },
      { id: 'orphaned', label: 'Orphaned' },
    ];

    for (const tab of tabs) {
      const btn = tabBar.createEl('button', { text: tab.label });
      btn.style.padding = '6px 12px';
      btn.style.fontSize = '12px';
      btn.style.borderRadius = '4px';

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
    for (const [id, btn] of this.tabButtons) {
      btn.classList.toggle('mod-cta', this.activeTab === id);
    }
  }

  private buildControls() {
    const { contentEl } = this;
    const controls = contentEl.createDiv({ cls: 'sync-controls' });
    controls.style.display = 'flex';
    controls.style.gap = '10px';
    controls.style.marginBottom = '10px';
    controls.style.flexWrap = 'wrap';
    controls.style.alignItems = 'center';

    // Search input
    this.searchInput = controls.createEl('input', {
      type: 'text',
      placeholder: 'Search by title, subreddit, or author...',
    });
    this.searchInput.style.flex = '1';
    this.searchInput.style.minWidth = '200px';
    this.searchInput.style.padding = '8px';
    this.searchInput.style.borderRadius = '4px';
    this.searchInput.style.border = '1px solid var(--background-modifier-border)';
    this.searchInput.value = this.searchQuery;
    this.searchInput.oninput = () => {
      this.searchQuery = this.searchInput.value;
      this.refreshList();
    };

    // Type filter
    const typeSelect = controls.createEl('select');
    typeSelect.style.padding = '6px';
    const typeOptions = [
      { value: 'all', label: 'All Types' },
      { value: 'posts', label: 'Posts Only' },
      { value: 'comments', label: 'Comments Only' },
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
    const sortSelect = controls.createEl('select');
    sortSelect.style.padding = '6px';
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

    // Bulk selection buttons
    const bulkActions = controls.createDiv();
    bulkActions.style.display = 'flex';
    bulkActions.style.gap = '5px';

    const selectAllBtn = bulkActions.createEl('button', { text: 'Select All' });
    selectAllBtn.style.padding = '4px 8px';
    selectAllBtn.style.fontSize = '12px';
    selectAllBtn.onclick = () => this.selectAllDisplayed();

    const deselectAllBtn = bulkActions.createEl('button', { text: 'Deselect' });
    deselectAllBtn.style.padding = '4px 8px';
    deselectAllBtn.style.fontSize = '12px';
    deselectAllBtn.onclick = () => this.deselectAllDisplayed();
  }

  private buildItemList() {
    const { contentEl } = this;
    this.listContainer = contentEl.createDiv({ cls: 'sync-item-list' });
    this.listContainer.style.maxHeight = '350px';
    this.listContainer.style.overflowY = 'auto';
    this.listContainer.style.border = '1px solid var(--background-modifier-border)';
    this.listContainer.style.borderRadius = '4px';
    this.listContainer.style.marginBottom = '10px';
    this.listContainer.tabIndex = 0;

    this.refreshList();
  }

  private refreshList() {
    this.listContainer.empty();
    this.displayedItems = this.getFilteredItems();
    this.focusedIndex = -1;

    if (this.displayedItems.length === 0) {
      const emptyMsg = this.listContainer.createDiv();
      emptyMsg.style.padding = '30px';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--text-muted)';
      emptyMsg.textContent = this.searchQuery
        ? 'No items match your search'
        : `No ${this.activeTab === 'all' ? '' : this.activeTab + ' '}items to display`;
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
    itemEl.style.display = 'flex';
    itemEl.style.alignItems = 'flex-start';
    itemEl.style.padding = '10px 12px';
    itemEl.style.borderBottom = '1px solid var(--background-modifier-border)';
    itemEl.style.gap = '10px';
    itemEl.dataset.index = String(index);

    if (index === this.focusedIndex) {
      itemEl.style.backgroundColor = 'var(--background-modifier-hover)';
      itemEl.style.outline = '2px solid var(--interactive-accent)';
    }

    // Status icon
    const statusIcon = itemEl.createEl('span', { cls: 'status-icon' });
    statusIcon.style.fontSize = '16px';
    statusIcon.style.width = '20px';
    statusIcon.style.flexShrink = '0';
    statusIcon.textContent = this.getStatusIcon(syncItem.status);
    statusIcon.style.color = this.getStatusColor(syncItem.status);
    statusIcon.title = this.getStatusTooltip(syncItem);

    // Checkbox (for items that can be selected)
    const canSelect = this.canSelectItem(syncItem);
    if (canSelect) {
      const checkbox = itemEl.createEl('input', { type: 'checkbox' });
      checkbox.style.flexShrink = '0';
      checkbox.checked = this.selectedItems.has(this.getItemId(syncItem));
      checkbox.onclick = e => {
        e.stopPropagation();
        this.toggleSelection(this.getItemId(syncItem));
      };
    } else {
      // Spacer for alignment
      const spacer = itemEl.createDiv();
      spacer.style.width = '17px';
      spacer.style.flexShrink = '0';
    }

    // Content
    const content = itemEl.createDiv({ cls: 'item-content' });
    content.style.flex = '1';
    content.style.minWidth = '0';
    content.style.overflow = 'hidden';

    // Title
    const titleEl = content.createEl('div', { cls: 'item-title' });
    titleEl.style.fontWeight = '500';
    titleEl.style.overflow = 'hidden';
    titleEl.style.textOverflow = 'ellipsis';
    titleEl.style.whiteSpace = 'nowrap';
    titleEl.textContent = this.syncManager.getDisplayTitle(syncItem);

    // Metadata row
    const metaEl = content.createEl('div', { cls: 'item-meta' });
    metaEl.style.fontSize = '12px';
    metaEl.style.color = 'var(--text-muted)';
    metaEl.style.marginTop = '2px';

    const subreddit = this.syncManager.getSubreddit(syncItem);
    const isComment = this.syncManager.isComment(syncItem);
    const score = this.syncManager.getScore(syncItem);
    const dateStr = this.formatDate(syncItem);

    metaEl.innerHTML = `r/${subreddit} <span style="opacity:0.5">•</span> ${isComment ? 'Comment' : 'Post'}${score !== undefined ? ` <span style="opacity:0.5">•</span> ${this.formatScore(score)} pts` : ''}${dateStr ? ` <span style="opacity:0.5">•</span> ${dateStr}` : ''}`;

    // Filter reason (for filtered items)
    if (syncItem.filterResult && !syncItem.filterResult.passes) {
      const reasonEl = content.createEl('div', { cls: 'filter-reason' });
      reasonEl.style.fontSize = '11px';
      reasonEl.style.color = 'var(--text-warning)';
      reasonEl.style.marginTop = '4px';
      reasonEl.style.display = 'flex';
      reasonEl.style.alignItems = 'center';
      reasonEl.style.gap = '8px';

      reasonEl.createEl('span', { text: `⚠ ${syncItem.filterResult.reason}` });

      if (!syncItem.userOverride) {
        const overrideBtn = reasonEl.createEl('button', { text: 'Import Anyway' });
        overrideBtn.style.fontSize = '10px';
        overrideBtn.style.padding = '2px 6px';
        overrideBtn.onclick = e => {
          e.stopPropagation();
          this.syncManager.toggleOverride(this.getItemId(syncItem));
          this.refreshList();
        };
      } else {
        const undoBtn = reasonEl.createEl('button', { text: 'Undo Override' });
        undoBtn.style.fontSize = '10px';
        undoBtn.style.padding = '2px 6px';
        undoBtn.onclick = e => {
          e.stopPropagation();
          this.syncManager.toggleOverride(this.getItemId(syncItem));
          this.refreshList();
        };
      }
    }

    // Orphan info
    if (syncItem.status === 'orphaned') {
      const orphanEl = content.createEl('div', { cls: 'orphan-info' });
      orphanEl.style.fontSize = '11px';
      orphanEl.style.color = 'var(--text-error)';
      orphanEl.style.marginTop = '4px';
      orphanEl.textContent = '⊘ No longer on Reddit - file preserved in vault';
    }

    // Vault path (for imported items)
    if (syncItem.vaultPath) {
      const pathEl = content.createEl('div', { cls: 'vault-path' });
      pathEl.style.fontSize = '11px';
      pathEl.style.color = 'var(--text-muted)';
      pathEl.style.marginTop = '4px';
      pathEl.style.opacity = '0.7';
      pathEl.textContent = `📁 ${syncItem.vaultPath}`;
    }

    // Click to select
    if (canSelect) {
      itemEl.style.cursor = 'pointer';
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
    this.actionBar.style.display = 'flex';
    this.actionBar.style.justifyContent = 'flex-end';
    this.actionBar.style.gap = '10px';
    this.actionBar.style.marginBottom = '10px';

    this.updateActionBar();
  }

  private updateActionBar() {
    this.actionBar.empty();

    // Import button (for pending/filtered tabs)
    if (['all', 'pending', 'filtered'].includes(this.activeTab)) {
      const importBtn = this.actionBar.createEl('button', { text: 'Import Selected' });
      importBtn.addClass('mod-cta');
      importBtn.title = 'Keyboard: i';
      importBtn.onclick = () => this.handleImport();
    }

    // Reprocess button (for imported tab)
    if (['all', 'imported'].includes(this.activeTab)) {
      const reprocessBtn = this.actionBar.createEl('button', { text: 'Reprocess Selected' });
      reprocessBtn.title = 'Keyboard: r';
      reprocessBtn.onclick = () => this.handleReprocess();
    }

    // Unsave button (for all tabs)
    const unsaveBtn = this.actionBar.createEl('button', { text: 'Unsave Selected' });
    unsaveBtn.addClass('mod-warning');
    unsaveBtn.title = 'Keyboard: u';
    unsaveBtn.onclick = () => this.handleUnsave();

    // Close button
    const closeBtn = this.actionBar.createEl('button', { text: 'Close' });
    closeBtn.onclick = () => this.close();
  }

  private buildKeyboardHints() {
    const { contentEl } = this;
    const hints = contentEl.createDiv({ cls: 'sync-keyboard-hints' });
    hints.style.fontSize = '11px';
    hints.style.color = 'var(--text-muted)';
    hints.style.display = 'flex';
    hints.style.gap = '15px';
    hints.style.flexWrap = 'wrap';

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

  private async handleRefresh() {
    this.isProcessing = true;
    new Notice('Refreshing sync status...');

    try {
      const savedItems = await this.apiClient.fetchAllSaved();
      this.syncManager.refreshVaultState();
      this.syncManager.computeSyncState(savedItems);
      this.selectedItems.clear();
      this.refreshList();
      this.updateStats();
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

    contentEl.createEl('h3', { text: this.title });
    contentEl.createEl('p', { text: this.message });

    const buttonContainer = contentEl.createDiv();
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '20px';

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
