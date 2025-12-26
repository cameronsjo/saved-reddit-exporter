import { App, Modal, Notice, Setting } from 'obsidian';
import { RedditItem } from './types';
import { REDDIT_ITEM_TYPE_COMMENT } from './constants';

type SortOption = 'subreddit' | 'date' | 'score' | 'type';
type FilterType = 'all' | 'posts' | 'comments';

interface UnsaveResult {
  item: RedditItem;
  success: boolean;
  error?: string;
}

export class UnsaveSelectionModal extends Modal {
  private items: RedditItem[];
  private selectedItems: Set<string>;
  private onConfirm: (selectedItems: RedditItem[]) => Promise<void>;
  private onCancel: () => void;

  // Filter and sort state
  private searchQuery = '';
  private filterType: FilterType = 'all';
  private sortBy: SortOption = 'subreddit';
  private collapsedSubreddits: Set<string> = new Set();

  // UI references
  private listContainer: HTMLElement;
  private counterEl: HTMLElement;
  private searchInput: HTMLInputElement;
  private progressContainer: HTMLElement;
  private mainContent: HTMLElement;

  // Keyboard navigation
  private focusedIndex = -1;
  private filteredItems: RedditItem[] = [];

  constructor(
    app: App,
    items: RedditItem[],
    onConfirm: (selectedItems: RedditItem[]) => Promise<void>,
    onCancel?: () => void
  ) {
    super(app);
    this.items = items;
    this.selectedItems = new Set(items.map(item => item.data.name));
    this.onConfirm = onConfirm;
    this.onCancel = onCancel || (() => {});
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('unsave-selection-modal');

    // Register keyboard handlers
    this.scope.register([], 'Escape', () => {
      this.onCancel();
      this.close();
      return false;
    });

    this.scope.register(['Mod'], 'a', () => {
      this.selectAllFiltered();
      return false;
    });

    this.scope.register(['Mod', 'Shift'], 'a', () => {
      this.deselectAllFiltered();
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

    // Progress container (hidden initially)
    this.progressContainer = contentEl.createDiv({ cls: 'unsave-progress-hidden' });

    // Main content container
    this.mainContent = contentEl.createDiv();
    this.buildMainContent();
  }

  private buildMainContent() {
    const container = this.mainContent;
    container.empty();

    new Setting(container).setName('Unsave from Reddit').setHeading();

    // Search bar
    const searchContainer = container.createDiv({ cls: 'unsave-search-container' });

    this.searchInput = searchContainer.createEl('input', {
      type: 'text',
      placeholder: 'Search by title, subreddit, or author...',
      cls: 'unsave-search-input',
    });
    this.searchInput.value = this.searchQuery;
    this.searchInput.oninput = () => {
      this.searchQuery = this.searchInput.value;
      this.refreshList();
    };

    // Filters and sort row
    const controlsRow = container.createDiv({ cls: 'unsave-controls-row' });

    // Filter buttons
    const filterGroup = controlsRow.createDiv({ cls: 'unsave-filter-group' });

    const filterOptions: { value: FilterType; label: string }[] = [
      { value: 'all', label: 'All' },
      { value: 'posts', label: 'Posts' },
      { value: 'comments', label: 'Comments' },
    ];

    filterOptions.forEach(opt => {
      const btn = filterGroup.createEl('button', { text: opt.label, cls: 'unsave-filter-btn' });
      if (this.filterType === opt.value) {
        btn.addClass('mod-cta');
      }
      btn.onclick = () => {
        this.filterType = opt.value;
        this.refreshList();
        this.buildMainContent();
      };
    });

    // Sort dropdown
    const sortContainer = controlsRow.createDiv({ cls: 'unsave-sort-container' });

    sortContainer.createEl('span', { text: 'Sort:' });
    const sortSelect = sortContainer.createEl('select', { cls: 'unsave-sort-select' });

    const sortOptions: { value: SortOption; label: string }[] = [
      { value: 'subreddit', label: 'Subreddit' },
      { value: 'date', label: 'Date' },
      { value: 'score', label: 'Score' },
      { value: 'type', label: 'Type' },
    ];

    sortOptions.forEach(opt => {
      const option = sortSelect.createEl('option', { text: opt.label, value: opt.value });
      if (this.sortBy === opt.value) {
        option.selected = true;
      }
    });

    sortSelect.onchange = () => {
      this.sortBy = sortSelect.value as SortOption;
      this.refreshList();
    };

    // Bulk action buttons
    const bulkActions = controlsRow.createDiv({ cls: 'unsave-bulk-actions' });

    const selectAllBtn = bulkActions.createEl('button', {
      text: 'Select all',
      cls: 'unsave-bulk-btn',
    });
    selectAllBtn.title = 'Ctrl/Cmd+A';
    selectAllBtn.onclick = () => this.selectAllFiltered();

    const deselectAllBtn = bulkActions.createEl('button', {
      text: 'Deselect all',
      cls: 'unsave-bulk-btn',
    });
    deselectAllBtn.title = 'Ctrl/Cmd+Shift+A';
    deselectAllBtn.onclick = () => this.deselectAllFiltered();

    // Counter
    this.counterEl = container.createEl('p', { cls: 'unsave-counter' });
    this.updateCounter();

    // Scrollable list container
    this.listContainer = container.createDiv({ cls: 'unsave-list-container' });
    this.listContainer.tabIndex = 0;

    this.refreshList();

    // Keyboard hints
    const hintsEl = container.createEl('div', { cls: 'unsave-hints' });
    hintsEl.innerHTML =
      '<kbd>↑↓</kbd> Navigate &nbsp; <kbd>Space</kbd> Toggle &nbsp; <kbd>Ctrl+A</kbd> Select all &nbsp; <kbd>Esc</kbd> Cancel';

    // Action buttons
    const buttonContainer = container.createDiv({ cls: 'unsave-button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Skip unsave' });
    cancelBtn.onclick = () => {
      this.onCancel();
      this.close();
    };

    const confirmBtn = buttonContainer.createEl('button', { text: 'Unsave selected' });
    confirmBtn.addClass('mod-cta');
    confirmBtn.onclick = () => this.handleConfirm();
  }

  private getFilteredAndSortedItems(): RedditItem[] {
    let items = [...this.items];

    // Apply filter
    if (this.filterType === 'posts') {
      items = items.filter(item => item.kind !== REDDIT_ITEM_TYPE_COMMENT);
    } else if (this.filterType === 'comments') {
      items = items.filter(item => item.kind === REDDIT_ITEM_TYPE_COMMENT);
    }

    // Apply search
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      items = items.filter(item => {
        const title = (
          item.kind === REDDIT_ITEM_TYPE_COMMENT ? item.data.link_title : item.data.title
        )?.toLowerCase();
        const subreddit = item.data.subreddit.toLowerCase();
        const author = item.data.author.toLowerCase();
        return title?.includes(query) || subreddit.includes(query) || author.includes(query);
      });
    }

    // Apply sort
    items.sort((a, b) => {
      switch (this.sortBy) {
        case 'subreddit':
          return a.data.subreddit.localeCompare(b.data.subreddit);
        case 'date':
          return b.data.created_utc - a.data.created_utc;
        case 'score':
          return b.data.score - a.data.score;
        case 'type':
          return a.kind.localeCompare(b.kind);
        default:
          return 0;
      }
    });

    return items;
  }

  private updateCounter() {
    const filtered = this.getFilteredAndSortedItems();
    const selectedInView = filtered.filter(item => this.selectedItems.has(item.data.name)).length;
    this.counterEl.textContent = `${this.selectedItems.size} selected (${selectedInView} in view) • ${filtered.length} of ${this.items.length} shown`;
  }

  private refreshList() {
    this.listContainer.empty();
    this.filteredItems = this.getFilteredAndSortedItems();
    this.focusedIndex = -1;

    if (this.filteredItems.length === 0) {
      const emptyMsg = this.listContainer.createDiv({ cls: 'unsave-empty-message' });
      emptyMsg.textContent = this.searchQuery
        ? 'No items match your search'
        : 'No items to display';
      this.updateCounter();
      return;
    }

    if (this.sortBy === 'subreddit') {
      this.renderGroupedBySubreddit();
    } else {
      this.renderFlatList();
    }

    this.updateCounter();
  }

  private renderGroupedBySubreddit() {
    // Group items by subreddit
    const groups = new Map<string, RedditItem[]>();
    for (const item of this.filteredItems) {
      const sub = item.data.subreddit;
      if (!groups.has(sub)) {
        groups.set(sub, []);
      }
      groups.get(sub)!.push(item);
    }

    // Sort groups by subreddit name
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    let flatIndex = 0;
    for (const [subreddit, items] of sortedGroups) {
      const isCollapsed = this.collapsedSubreddits.has(subreddit);
      const selectedInGroup = items.filter(item => this.selectedItems.has(item.data.name)).length;

      // Group header
      const headerEl = this.listContainer.createDiv({ cls: 'unsave-group-header' });

      const collapseIcon = headerEl.createEl('span', {
        text: isCollapsed ? '▶' : '▼',
        cls: 'unsave-collapse-icon',
      });

      const groupCheckbox = headerEl.createEl('input', {
        type: 'checkbox',
        cls: 'unsave-group-checkbox',
      });
      groupCheckbox.checked = selectedInGroup === items.length;
      groupCheckbox.indeterminate = selectedInGroup > 0 && selectedInGroup < items.length;
      groupCheckbox.onclick = e => {
        e.stopPropagation();
        const shouldSelect = selectedInGroup < items.length;
        items.forEach(item => {
          if (shouldSelect) {
            this.selectedItems.add(item.data.name);
          } else {
            this.selectedItems.delete(item.data.name);
          }
        });
        this.refreshList();
      };

      headerEl.createEl('span', {
        text: `r/${subreddit} (${selectedInGroup}/${items.length})`,
        cls: 'unsave-group-name',
      });

      headerEl.onclick = e => {
        if (e.target === groupCheckbox) return;
        if (isCollapsed) {
          this.collapsedSubreddits.delete(subreddit);
        } else {
          this.collapsedSubreddits.add(subreddit);
        }
        this.refreshList();
      };

      // Group items
      if (!isCollapsed) {
        for (const item of items) {
          this.renderItem(item, flatIndex);
          flatIndex++;
        }
      } else {
        flatIndex += items.length;
      }
    }
  }

  private renderFlatList() {
    this.filteredItems.forEach((item, index) => {
      this.renderItem(item, index);
    });
  }

  private renderItem(item: RedditItem, index: number) {
    const isComment = item.kind === REDDIT_ITEM_TYPE_COMMENT;
    const title = isComment
      ? `Comment on: ${item.data.link_title || 'Unknown'}`
      : item.data.title || 'Untitled';

    const itemEl = this.listContainer.createDiv({ cls: 'unsave-item' });
    itemEl.dataset.index = String(index);

    if (index === this.focusedIndex) {
      itemEl.addClass('focused');
    }

    const checkbox = itemEl.createEl('input', { type: 'checkbox', cls: 'unsave-item-checkbox' });
    checkbox.checked = this.selectedItems.has(item.data.name);

    const textContainer = itemEl.createDiv({ cls: 'unsave-item-text' });

    const titleEl = textContainer.createEl('div', { text: title, cls: 'unsave-item-title' });

    const metaParts = [
      this.sortBy !== 'subreddit' ? `r/${item.data.subreddit}` : null,
      isComment ? 'Comment' : 'Post',
      `u/${item.data.author}`,
      `${item.data.score} pts`,
    ].filter(Boolean);

    const metaEl = textContainer.createEl('div', {
      text: metaParts.join(' • '),
      cls: 'unsave-item-meta',
    });

    // Click handler
    itemEl.onclick = e => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      this.toggleItem(item, checkbox.checked);
      this.focusedIndex = index;
      this.refreshList();
    };
  }

  private toggleItem(item: RedditItem, selected: boolean) {
    if (selected) {
      this.selectedItems.add(item.data.name);
    } else {
      this.selectedItems.delete(item.data.name);
    }
  }

  private selectAllFiltered() {
    this.filteredItems.forEach(item => this.selectedItems.add(item.data.name));
    this.refreshList();
  }

  private deselectAllFiltered() {
    this.filteredItems.forEach(item => this.selectedItems.delete(item.data.name));
    this.refreshList();
  }

  private moveFocus(delta: number) {
    if (this.filteredItems.length === 0) return;

    this.focusedIndex += delta;
    if (this.focusedIndex < 0) this.focusedIndex = 0;
    if (this.focusedIndex >= this.filteredItems.length) {
      this.focusedIndex = this.filteredItems.length - 1;
    }

    this.refreshList();

    // Scroll into view
    const focusedEl = this.listContainer.querySelector(
      `[data-index="${this.focusedIndex}"]`
    ) as HTMLElement;
    if (focusedEl) {
      focusedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  private toggleFocusedItem() {
    if (this.focusedIndex >= 0 && this.focusedIndex < this.filteredItems.length) {
      const item = this.filteredItems[this.focusedIndex];
      const isSelected = this.selectedItems.has(item.data.name);
      this.toggleItem(item, !isSelected);
      this.refreshList();
    }
  }

  private async handleConfirm() {
    const selected = this.items.filter(item => this.selectedItems.has(item.data.name));

    if (selected.length === 0) {
      new Notice('No items selected to unsave');
      return;
    }

    // Show progress UI
    this.mainContent.addClass('unsave-main-hidden');
    this.progressContainer.removeClass('unsave-progress-hidden');
    this.progressContainer.addClass('unsave-progress-visible');
    this.progressContainer.empty();

    new Setting(this.progressContainer).setName('Unsaving from Reddit...').setHeading();

    const progressText = this.progressContainer.createEl('p');
    progressText.textContent = `Processing 0 of ${selected.length} items...`;

    const progressBarContainer = this.progressContainer.createDiv({
      cls: 'unsave-progress-bar-container',
    });

    const progressBar = progressBarContainer.createDiv({ cls: 'unsave-progress-bar' });

    const resultsContainer = this.progressContainer.createDiv({ cls: 'unsave-results-container' });

    const results: UnsaveResult[] = [];
    let successCount = 0;
    let failCount = 0;

    // Process items with progress updates
    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      const title =
        item.kind === REDDIT_ITEM_TYPE_COMMENT
          ? `Comment on: ${item.data.link_title || 'Unknown'}`
          : item.data.title || 'Untitled';

      progressText.textContent = `Processing ${i + 1} of ${selected.length} items...`;
      progressBar.setCssProps({ width: `${((i + 1) / selected.length) * 100}%` });

      try {
        // Call the actual unsave - we pass a single-item array
        await this.onConfirm([item]);
        results.push({ item, success: true });
        successCount++;

        const resultEl = resultsContainer.createDiv({ cls: 'unsave-result-success' });
        resultEl.textContent = `✓ ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}`;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({ item, success: false, error: errorMsg });
        failCount++;

        const resultEl = resultsContainer.createDiv({ cls: 'unsave-result-error' });
        resultEl.textContent = `✗ ${title.substring(0, 40)}... - ${errorMsg}`;
      }

      // Scroll to bottom of results
      resultsContainer.scrollTop = resultsContainer.scrollHeight;
    }

    // Show completion summary
    progressText.textContent = `Completed: ${successCount} succeeded, ${failCount} failed`;

    const closeBtn = this.progressContainer.createEl('button', {
      text: 'Close',
      cls: 'unsave-close-btn',
    });
    closeBtn.addClass('mod-cta');
    closeBtn.onclick = () => this.close();

    // Show notification
    if (failCount === 0) {
      new Notice(`Successfully unsaved ${successCount} items from Reddit`);
    } else {
      new Notice(`Unsaved ${successCount} items, ${failCount} failed`);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Confirmation modal for auto-unsave mode
 */
export class AutoUnsaveConfirmModal extends Modal {
  private itemCount: number;
  private onConfirm: () => void;
  private onCancel: () => void;

  constructor(app: App, itemCount: number, onConfirm: () => void, onCancel?: () => void) {
    super(app);
    this.itemCount = itemCount;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel || (() => {});
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    new Setting(contentEl).setName('Confirm auto-unsave').setHeading();

    contentEl.createEl('p', {
      text: `You are about to unsave ${this.itemCount} item${this.itemCount !== 1 ? 's' : ''} from Reddit. This action cannot be undone.`,
    });

    const confirmText = contentEl.createEl('p', {
      text: 'Are you sure you want to continue?',
      cls: 'auto-unsave-confirm-text',
    });

    const buttonContainer = contentEl.createDiv({ cls: 'auto-unsave-button-container' });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => {
      this.onCancel();
      this.close();
    };

    const confirmBtn = buttonContainer.createEl('button', {
      text: 'Unsave all',
      cls: 'auto-unsave-confirm-btn',
    });
    confirmBtn.addClass('mod-warning');
    confirmBtn.onclick = () => {
      this.onConfirm();
      this.close();
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
