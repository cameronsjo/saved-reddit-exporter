import { Setting } from 'obsidian';
import { RedditSavedSettings } from '../types';
import { createCollapsibleSection } from './collapsible-section';

interface AdvancedTabContext {
  settings: RedditSavedSettings;
  saveSettings: () => Promise<void>;
  expandedSections: Set<string>;
  redisplay: () => void;
}

export function renderAdvancedTab(containerEl: HTMLElement, ctx: AdvancedTabContext): void {
  const { settings, saveSettings, expandedSections, redisplay } = ctx;

  // Performance
  new Setting(containerEl).setName('Performance & reliability').setHeading();

  const perfInfo = containerEl.createDiv({ cls: 'settings-info-box compact' });
  perfInfo.createSpan({
    text: 'Settings that affect import speed and error recovery. Defaults work well for most users.',
  });

  new Setting(containerEl)
    .setName('Enhanced mode')
    .setDesc('Automatically handle Reddit API rate limits and recover from errors. Recommended for large imports (100+ items).')
    .addToggle(toggle =>
      toggle.setValue(settings.enableEnhancedMode).onChange(async value => {
        settings.enableEnhancedMode = value;
        await saveSettings();
      })
    );

  new Setting(containerEl)
    .setName('Enable checkpointing')
    .setDesc('Save progress during imports so interrupted syncs can resume where they left off')
    .addToggle(toggle =>
      toggle.setValue(settings.enableCheckpointing).onChange(async value => {
        settings.enableCheckpointing = value;
        await saveSettings();
      })
    );

  new Setting(containerEl)
    .setName('Max concurrent requests')
    .setDesc('Parallel API requests (1\u20135). Lower is safer but slower.')
    .addText(text =>
      text
        .setPlaceholder('2')
        .setValue(String(settings.maxConcurrentRequests))
        .onChange(async value => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 1 && num <= 5) {
            settings.maxConcurrentRequests = num;
            await saveSettings();
          }
        })
    );

  new Setting(containerEl)
    .setName('Max retries')
    .setDesc('Retry failed requests up to this many times (1\u201310)')
    .addText(text =>
      text
        .setPlaceholder('3')
        .setValue(String(settings.maxRetries))
        .onChange(async value => {
          const num = parseInt(value);
          if (!isNaN(num) && num >= 1 && num <= 10) {
            settings.maxRetries = num;
            await saveSettings();
          }
        })
    );

  new Setting(containerEl)
    .setName('Offline queue')
    .setDesc('Queue requests when offline and process them when connectivity returns')
    .addToggle(toggle =>
      toggle.setValue(settings.enableOfflineQueue).onChange(async value => {
        settings.enableOfflineQueue = value;
        await saveSettings();
      })
    );

  new Setting(containerEl)
    .setName('Show performance stats')
    .setDesc('Log timing metrics and request counts after each import')
    .addToggle(toggle =>
      toggle.setValue(settings.showPerformanceStats).onChange(async value => {
        settings.showPerformanceStats = value;
        await saveSettings();
      })
    );

  // Link preservation
  const linkContent = createCollapsibleSection(
    containerEl, expandedSections, 'advanced-links', 'Link preservation',
  );

  const linkInfo = linkContent.createDiv({ cls: 'settings-info-box compact' });
  linkInfo.createSpan({
    text: 'Archive external links via the Internet Archive. Adds latency per link.',
  });

  new Setting(linkContent)
    .setName('Enable link preservation')
    .setDesc('Check linked URLs against the Wayback Machine and add archive links')
    .addToggle(toggle =>
      toggle.setValue(settings.enableLinkPreservation).onChange(async value => {
        settings.enableLinkPreservation = value;
        await saveSettings();
        redisplay();
      })
    );

  if (settings.enableLinkPreservation) {
    new Setting(linkContent)
      .setName('Extract external links')
      .setDesc('Find and list all external URLs in post content')
      .addToggle(toggle =>
        toggle.setValue(settings.extractExternalLinks).onChange(async value => {
          settings.extractExternalLinks = value;
          await saveSettings();
        })
      );

    new Setting(linkContent)
      .setName('Check Wayback archive')
      .setDesc('Query Internet Archive for each link (adds latency)')
      .addToggle(toggle =>
        toggle.setValue(settings.checkWaybackArchive).onChange(async value => {
          settings.checkWaybackArchive = value;
          await saveSettings();
        })
      );

    new Setting(linkContent)
      .setName('Include archive links')
      .setDesc('Add Wayback Machine URLs alongside original links')
      .addToggle(toggle =>
        toggle.setValue(settings.includeArchiveLinks).onChange(async value => {
          settings.includeArchiveLinks = value;
          await saveSettings();
        })
      );
  }

  // Progress tracking
  const progressContent = createCollapsibleSection(
    containerEl, expandedSections, 'advanced-progress', 'Progress tracking',
  );

  new Setting(progressContent)
    .setName('Show progress modal')
    .setDesc('Display real-time import progress with ETA and item counts')
    .addToggle(toggle =>
      toggle.setValue(settings.showProgressModal).onChange(async value => {
        settings.showProgressModal = value;
        await saveSettings();
      })
    );

  new Setting(progressContent)
    .setName('Generate import log')
    .setDesc('Create a log file after each import with statistics and any errors')
    .addToggle(toggle =>
      toggle.setValue(settings.generateImportLog).onChange(async value => {
        settings.generateImportLog = value;
        await saveSettings();
      })
    );
}
