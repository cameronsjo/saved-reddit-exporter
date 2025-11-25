import { App, Modal, Notice } from 'obsidian';
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
    contentEl.style.width = '600px';

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
    this.progressContainer = contentEl.createDiv();
    this.progressContainer.style.display = 'none';

    // Main content container
    this.mainContent = contentEl.createDiv();
    this.buildMainContent();
  }

  private buildMainContent() {
    const container = this.mainContent;
    container.empty();

    container.createEl('h2', { text: 'Unsave from Reddit' });

    // Search bar
    const searchContainer = container.createDiv();
    searchContainer.style.marginBottom = '10px';

    this.searchInput = searchContainer.createEl('input', {
      type: 'text',
      placeholder: 'Search by title, subreddit, or author...',
    });
    this.searchInput.style.width = '100%';
    this.searchInput.style.padding = '8px';
    this.searchInput.style.borderRadius = '4px';
    this.searchInput.style.border = '1px solid var(--background-modifier-border)';
    this.searchInput.value = this.searchQuery;
    this.searchInput.oninput = () => {
      this.searchQuery = this.searchInput.value;
      this.refreshList();
    };

    // Filters and sort row
    const controlsRow = container.createDiv();
    controlsRow.style.display = 'flex';
    controlsRow.style.gap = '10px';
    controlsRow.style.marginBottom = '10px';
    controlsRow.style.flexWrap = 'wrap';
    controlsRow.style.alignItems = 'center';

    // Filter buttons
    const filterGroup = controlsRow.createDiv();
    filterGroup.style.display = 'flex';
    filterGroup.style.gap = '5px';

    const filterOptions: { value: FilterType; label: string }[] = [
      { value: 'all', label: 'All' },
      { value: 'posts', label: 'Posts' },
      { value: 'comments', label: 'Comments' },
    ];

    filterOptions.forEach(opt => {
      const btn = filterGroup.createEl('button', { text: opt.label });
      btn.style.padding = '4px 8px';
      btn.style.fontSize = '12px';
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
    const sortContainer = controlsRow.createDiv();
    sortContainer.style.display = 'flex';
    sortContainer.style.alignItems = 'center';
    sortContainer.style.gap = '5px';

    sortContainer.createEl('span', { text: 'Sort:' });
    const sortSelect = sortContainer.createEl('select');
    sortSelect.style.padding = '4px';

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
    const bulkActions = controlsRow.createDiv();
    bulkActions.style.display = 'flex';
    bulkActions.style.gap = '5px';
    bulkActions.style.marginLeft = 'auto';

    const selectAllBtn = bulkActions.createEl('button', { text: 'Select All' });
    selectAllBtn.style.padding = '4px 8px';
    selectAllBtn.style.fontSize = '12px';
    selectAllBtn.title = 'Ctrl/Cmd+A';
    selectAllBtn.onclick = () => this.selectAllFiltered();

    const deselectAllBtn = bulkActions.createEl('button', { text: 'Deselect All' });
    deselectAllBtn.style.padding = '4px 8px';
    deselectAllBtn.style.fontSize = '12px';
    deselectAllBtn.title = 'Ctrl/Cmd+Shift+A';
    deselectAllBtn.onclick = () => this.deselectAllFiltered();

    // Counter
    this.counterEl = container.createEl('p');
    this.counterEl.style.fontWeight = 'bold';
    this.counterEl.style.marginBottom = '10px';
    this.updateCounter();

    // Scrollable list container
    this.listContainer = container.createDiv();
    this.listContainer.style.maxHeight = '350px';
    this.listContainer.style.overflowY = 'auto';
    this.listContainer.style.border = '1px solid var(--background-modifier-border)';
    this.listContainer.style.borderRadius = '4px';
    this.listContainer.style.marginBottom = '15px';
    this.listContainer.tabIndex = 0;

    this.refreshList();

    // Keyboard hints
    const hintsEl = container.createEl('div');
    hintsEl.style.fontSize = '11px';
    hintsEl.style.color = 'var(--text-muted)';
    hintsEl.style.marginBottom = '10px';
    hintsEl.innerHTML =
      '<kbd>↑↓</kbd> Navigate &nbsp; <kbd>Space</kbd> Toggle &nbsp; <kbd>Ctrl+A</kbd> Select all &nbsp; <kbd>Esc</kbd> Cancel';

    // Action buttons
    const buttonContainer = container.createDiv();
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';

    const cancelBtn = buttonContainer.createEl('button', { text: 'Skip Unsave' });
    cancelBtn.onclick = () => {
      this.onCancel();
      this.close();
    };

    const confirmBtn = buttonContainer.createEl('button', { text: 'Unsave Selected' });
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
      const emptyMsg = this.listContainer.createDiv();
      emptyMsg.style.padding = '20px';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--text-muted)';
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
      const headerEl = this.listContainer.createDiv();
      headerEl.style.display = 'flex';
      headerEl.style.alignItems = 'center';
      headerEl.style.padding = '8px 10px';
      headerEl.style.backgroundColor = 'var(--background-secondary)';
      headerEl.style.cursor = 'pointer';
      headerEl.style.userSelect = 'none';
      headerEl.style.position = 'sticky';
      headerEl.style.top = '0';
      headerEl.style.zIndex = '1';

      const collapseIcon = headerEl.createEl('span', { text: isCollapsed ? '▶' : '▼' });
      collapseIcon.style.marginRight = '8px';
      collapseIcon.style.fontSize = '10px';

      const groupCheckbox = headerEl.createEl('input', { type: 'checkbox' });
      groupCheckbox.checked = selectedInGroup === items.length;
      groupCheckbox.indeterminate = selectedInGroup > 0 && selectedInGroup < items.length;
      groupCheckbox.style.marginRight = '8px';
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
      }).style.fontWeight = '600';

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

    const itemEl = this.listContainer.createDiv();
    itemEl.dataset.index = String(index);
    itemEl.style.display = 'flex';
    itemEl.style.alignItems = 'flex-start';
    itemEl.style.padding = '8px 10px';
    itemEl.style.borderBottom = '1px solid var(--background-modifier-border)';
    itemEl.style.cursor = 'pointer';

    if (index === this.focusedIndex) {
      itemEl.style.backgroundColor = 'var(--background-modifier-hover)';
    }

    const checkbox = itemEl.createEl('input', { type: 'checkbox' });
    checkbox.checked = this.selectedItems.has(item.data.name);
    checkbox.style.marginRight = '10px';
    checkbox.style.marginTop = '3px';
    checkbox.style.flexShrink = '0';

    const textContainer = itemEl.createDiv();
    textContainer.style.flex = '1';
    textContainer.style.minWidth = '0';

    const titleEl = textContainer.createEl('div', { text: title });
    titleEl.style.fontWeight = '500';
    titleEl.style.marginBottom = '2px';
    titleEl.style.overflow = 'hidden';
    titleEl.style.textOverflow = 'ellipsis';
    titleEl.style.whiteSpace = 'nowrap';

    const metaParts = [
      this.sortBy !== 'subreddit' ? `r/${item.data.subreddit}` : null,
      isComment ? 'Comment' : 'Post',
      `u/${item.data.author}`,
      `${item.data.score} pts`,
    ].filter(Boolean);

    const metaEl = textContainer.createEl('div', {
      text: metaParts.join(' • '),
    });
    metaEl.style.fontSize = '12px';
    metaEl.style.color = 'var(--text-muted)';

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
    this.mainContent.style.display = 'none';
    this.progressContainer.style.display = 'block';
    this.progressContainer.empty();

    this.progressContainer.createEl('h2', { text: 'Unsaving from Reddit...' });

    const progressText = this.progressContainer.createEl('p');
    progressText.textContent = `Processing 0 of ${selected.length} items...`;

    const progressBarContainer = this.progressContainer.createDiv();
    progressBarContainer.style.width = '100%';
    progressBarContainer.style.height = '20px';
    progressBarContainer.style.backgroundColor = 'var(--background-modifier-border)';
    progressBarContainer.style.borderRadius = '4px';
    progressBarContainer.style.overflow = 'hidden';
    progressBarContainer.style.marginBottom = '15px';

    const progressBar = progressBarContainer.createDiv();
    progressBar.style.height = '100%';
    progressBar.style.width = '0%';
    progressBar.style.backgroundColor = 'var(--interactive-accent)';
    progressBar.style.transition = 'width 0.2s ease';

    const resultsContainer = this.progressContainer.createDiv();
    resultsContainer.style.maxHeight = '200px';
    resultsContainer.style.overflowY = 'auto';
    resultsContainer.style.marginBottom = '15px';
    resultsContainer.style.fontSize = '12px';

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
      progressBar.style.width = `${((i + 1) / selected.length) * 100}%`;

      try {
        // Call the actual unsave - we pass a single-item array
        await this.onConfirm([item]);
        results.push({ item, success: true });
        successCount++;

        const resultEl = resultsContainer.createDiv();
        resultEl.style.color = 'var(--text-success)';
        resultEl.textContent = `✓ ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}`;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({ item, success: false, error: errorMsg });
        failCount++;

        const resultEl = resultsContainer.createDiv();
        resultEl.style.color = 'var(--text-error)';
        resultEl.textContent = `✗ ${title.substring(0, 40)}... - ${errorMsg}`;
      }

      // Scroll to bottom of results
      resultsContainer.scrollTop = resultsContainer.scrollHeight;
    }

    // Show completion summary
    progressText.textContent = `Completed: ${successCount} succeeded, ${failCount} failed`;

    const closeBtn = this.progressContainer.createEl('button', { text: 'Close' });
    closeBtn.addClass('mod-cta');
    closeBtn.style.marginTop = '10px';
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

    contentEl.createEl('h2', { text: 'Confirm Auto-Unsave' });

    contentEl.createEl('p', {
      text: `You are about to unsave ${this.itemCount} item${this.itemCount !== 1 ? 's' : ''} from Reddit. This action cannot be undone.`,
    });

    contentEl.createEl('p', {
      text: 'Are you sure you want to continue?',
    }).style.fontWeight = 'bold';

    const buttonContainer = contentEl.createDiv();
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '20px';

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => {
      this.onCancel();
      this.close();
    };

    const confirmBtn = buttonContainer.createEl('button', { text: 'Unsave All' });
    confirmBtn.addClass('mod-warning');
    confirmBtn.style.backgroundColor = 'var(--text-error)';
    confirmBtn.style.color = 'white';
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
