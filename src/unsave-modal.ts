import { App, Modal, Setting } from 'obsidian';
import { RedditItem } from './types';
import { REDDIT_ITEM_TYPE_COMMENT } from './constants';

export class UnsaveSelectionModal extends Modal {
  private items: RedditItem[];
  private selectedItems: Set<string>;
  private onConfirm: (selectedItems: RedditItem[]) => void;
  private onCancel: () => void;

  constructor(
    app: App,
    items: RedditItem[],
    onConfirm: (selectedItems: RedditItem[]) => void,
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

    contentEl.createEl('h2', { text: 'Unsave from Reddit' });

    const description = contentEl.createEl('p', {
      text: `Select which items to unsave from Reddit (${this.items.length} imported):`,
    });
    description.style.marginBottom = '15px';

    // Select all / Deselect all buttons
    const bulkActions = contentEl.createDiv();
    bulkActions.style.marginBottom = '15px';
    bulkActions.style.display = 'flex';
    bulkActions.style.gap = '10px';

    const selectAllBtn = bulkActions.createEl('button', { text: 'Select All' });
    selectAllBtn.onclick = () => {
      this.items.forEach(item => this.selectedItems.add(item.data.name));
      this.refreshList(listContainer);
      this.updateCounter(counterEl);
    };

    const deselectAllBtn = bulkActions.createEl('button', { text: 'Deselect All' });
    deselectAllBtn.onclick = () => {
      this.selectedItems.clear();
      this.refreshList(listContainer);
      this.updateCounter(counterEl);
    };

    // Counter
    const counterEl = contentEl.createEl('p');
    counterEl.style.fontWeight = 'bold';
    counterEl.style.marginBottom = '10px';
    this.updateCounter(counterEl);

    // Scrollable list container
    const listContainer = contentEl.createDiv();
    listContainer.style.maxHeight = '300px';
    listContainer.style.overflowY = 'auto';
    listContainer.style.border = '1px solid var(--background-modifier-border)';
    listContainer.style.borderRadius = '4px';
    listContainer.style.padding = '10px';
    listContainer.style.marginBottom = '15px';

    this.refreshList(listContainer);

    // Action buttons
    const buttonContainer = contentEl.createDiv();
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
    confirmBtn.onclick = () => {
      const selected = this.items.filter(item => this.selectedItems.has(item.data.name));
      this.onConfirm(selected);
      this.close();
    };
  }

  private updateCounter(counterEl: HTMLElement) {
    counterEl.textContent = `${this.selectedItems.size} of ${this.items.length} selected`;
  }

  private refreshList(container: HTMLElement) {
    container.empty();

    for (const item of this.items) {
      const isComment = item.kind === REDDIT_ITEM_TYPE_COMMENT;
      const title = isComment
        ? `Comment on: ${item.data.link_title || 'Unknown'}`
        : item.data.title || 'Untitled';
      const subreddit = `r/${item.data.subreddit}`;

      const itemEl = container.createDiv();
      itemEl.style.display = 'flex';
      itemEl.style.alignItems = 'flex-start';
      itemEl.style.padding = '8px';
      itemEl.style.borderBottom = '1px solid var(--background-modifier-border)';
      itemEl.style.cursor = 'pointer';

      const checkbox = itemEl.createEl('input', { type: 'checkbox' });
      checkbox.checked = this.selectedItems.has(item.data.name);
      checkbox.style.marginRight = '10px';
      checkbox.style.marginTop = '3px';

      const textContainer = itemEl.createDiv();
      textContainer.style.flex = '1';

      const titleEl = textContainer.createEl('div', { text: title });
      titleEl.style.fontWeight = '500';
      titleEl.style.marginBottom = '2px';

      const metaEl = textContainer.createEl('div', {
        text: `${subreddit} • ${isComment ? 'Comment' : 'Post'} • by u/${item.data.author}`,
      });
      metaEl.style.fontSize = '12px';
      metaEl.style.color = 'var(--text-muted)';

      // Click handler for the whole row
      itemEl.onclick = e => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
        if (checkbox.checked) {
          this.selectedItems.add(item.data.name);
        } else {
          this.selectedItems.delete(item.data.name);
        }
        this.updateCounter(container.parentElement!.querySelector('p[style*="font-weight"]')!);
      };
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
