import { App, Modal, setIcon } from 'obsidian';
import { ImportProgress } from './import-state';

/**
 * Modal for displaying import progress with real-time updates
 */
export class ImportProgressModal extends Modal {
  private progressBar: HTMLElement;
  private currentItemEl: HTMLElement;
  private statsContainer: HTMLElement;
  private etaEl: HTMLElement;
  private cancelBtn: HTMLButtonElement;
  private onCancel: () => void;
  private isCancelled = false;

  constructor(app: App, onCancel: () => void) {
    super(app);
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('import-progress-modal');

    // Header
    const header = contentEl.createEl('h2', { text: 'Importing Reddit Content' });
    setIcon(header.createSpan({ cls: 'import-progress-icon' }), 'download');

    // Progress bar container
    const progressContainer = contentEl.createDiv({ cls: 'progress-bar-container' });
    this.progressBar = progressContainer.createDiv({ cls: 'progress-bar' });
    this.progressBar.style.width = '0%';

    // Current item display
    this.currentItemEl = contentEl.createDiv({ cls: 'current-item' });
    this.currentItemEl.setText('Initializing...');

    // Stats grid
    this.statsContainer = contentEl.createDiv({ cls: 'import-stats-grid' });

    // ETA display
    this.etaEl = contentEl.createDiv({ cls: 'import-eta' });

    // Cancel button
    const buttonContainer = contentEl.createDiv({ cls: 'import-progress-buttons' });
    this.cancelBtn = buttonContainer.createEl('button', { text: 'Cancel Import' });
    this.cancelBtn.onclick = () => {
      this.isCancelled = true;
      this.cancelBtn.disabled = true;
      this.cancelBtn.setText('Cancelling...');
      this.onCancel();
    };
  }

  /**
   * Update the progress display
   */
  updateProgress(progress: ImportProgress, currentItemTitle?: string) {
    if (this.isCancelled) return;

    // Calculate percentage
    const total = progress.totalExpected || progress.fetchedCount || 1;
    const percent = Math.min(100, Math.round((progress.processedCount / total) * 100));

    // Update progress bar
    this.progressBar.style.width = `${percent}%`;
    this.progressBar.setAttribute('data-percent', `${percent}%`);

    // Update current item
    if (currentItemTitle) {
      this.currentItemEl.setText(
        currentItemTitle.length > 60 ? currentItemTitle.substring(0, 57) + '...' : currentItemTitle
      );
    } else {
      this.currentItemEl.setText(`Processing item ${progress.processedCount}...`);
    }

    // Update stats grid
    this.statsContainer.empty();
    this.createStat('Processed', `${progress.processedCount} / ${total}`);
    this.createStat('Imported', String(progress.importedCount), 'success');
    this.createStat('Skipped', String(progress.skippedCount), 'muted');
    if (progress.failedCount > 0) {
      this.createStat('Failed', String(progress.failedCount), 'error');
    }
    this.createStat('Rate', `${progress.itemsPerSecond.toFixed(1)}/sec`);

    // Update ETA
    if (progress.estimatedRemainingMs && progress.estimatedRemainingMs > 0) {
      const etaSeconds = Math.ceil(progress.estimatedRemainingMs / 1000);
      const etaDisplay = this.formatDuration(etaSeconds);
      this.etaEl.setText(`Estimated time remaining: ${etaDisplay}`);
    } else if (progress.processedCount >= total) {
      this.etaEl.setText('Completing...');
    } else {
      this.etaEl.setText('Calculating time remaining...');
    }
  }

  /**
   * Show completion state
   */
  showComplete(progress: ImportProgress) {
    this.progressBar.style.width = '100%';
    this.progressBar.addClass('complete');
    this.currentItemEl.setText('Import complete!');

    const elapsed = this.formatDuration(Math.round(progress.elapsedMs / 1000));
    this.etaEl.setText(`Completed in ${elapsed}`);

    this.cancelBtn.setText('Close');
    this.cancelBtn.onclick = () => this.close();
  }

  /**
   * Show cancelled state
   */
  showCancelled() {
    this.currentItemEl.setText('Import cancelled');
    this.progressBar.addClass('cancelled');
    this.etaEl.setText('Progress saved - you can resume later');
    this.cancelBtn.setText('Close');
    this.cancelBtn.onclick = () => this.close();
  }

  private createStat(label: string, value: string, cls?: string) {
    const stat = this.statsContainer.createDiv({ cls: 'import-stat' });
    stat.createSpan({ text: label, cls: 'stat-label' });
    const valueEl = stat.createSpan({ text: value, cls: 'stat-value' });
    if (cls) valueEl.addClass(cls);
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
