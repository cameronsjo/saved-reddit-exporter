import { Setting } from 'obsidian';
import { RedditSavedSettings, UnsaveMode } from '../types';
import { REDDIT_MAX_ITEMS } from '../constants';
import { createCollapsibleSection } from './collapsible-section';

interface ContentTabContext {
  settings: RedditSavedSettings;
  saveSettings: () => Promise<void>;
  expandedSections: Set<string>;
  redisplay: () => void;
}

export function renderContentTab(containerEl: HTMLElement, ctx: ContentTabContext): void {
  const { settings, saveSettings, expandedSections } = ctx;

  // Content sources
  new Setting(containerEl).setName('Content sources').setHeading();

  const contentInfo = containerEl.createDiv({ cls: 'settings-info-box compact' });
  contentInfo.createSpan({ text: 'Choose which Reddit content to pull into your vault.' });

  new Setting(containerEl)
    .setName('Saved posts')
    .setDesc('Posts you have saved on Reddit')
    .addToggle(toggle =>
      toggle.setValue(settings.importSavedPosts).onChange(async value => {
        settings.importSavedPosts = value;
        await saveSettings();
      })
    );

  new Setting(containerEl)
    .setName('Saved comments')
    .setDesc('Comments you have saved on Reddit')
    .addToggle(toggle =>
      toggle.setValue(settings.importSavedComments).onChange(async value => {
        settings.importSavedComments = value;
        await saveSettings();
      })
    );

  new Setting(containerEl)
    .setName('Upvoted posts')
    .setDesc('Posts you have upvoted (can be large)')
    .addToggle(toggle =>
      toggle.setValue(settings.importUpvoted).onChange(async value => {
        settings.importUpvoted = value;
        await saveSettings();
      })
    );

  new Setting(containerEl)
    .setName('Your posts')
    .setDesc('Posts you have submitted to Reddit')
    .addToggle(toggle =>
      toggle.setValue(settings.importUserPosts).onChange(async value => {
        settings.importUserPosts = value;
        await saveSettings();
      })
    );

  new Setting(containerEl)
    .setName('Your comments')
    .setDesc('Comments you have posted on Reddit')
    .addToggle(toggle =>
      toggle.setValue(settings.importUserComments).onChange(async value => {
        settings.importUserComments = value;
        await saveSettings();
      })
    );

  // Fetch settings
  new Setting(containerEl).setName('Fetch settings').setHeading();

  new Setting(containerEl)
    .setName('Fetch limit')
    .setDesc(`Maximum items per fetch from Reddit (hard cap: ${REDDIT_MAX_ITEMS})`)
    .addText(text =>
      text
        .setPlaceholder(String(REDDIT_MAX_ITEMS))
        .setValue(String(settings.fetchLimit))
        .onChange(async value => {
          const num = parseInt(value);
          if (!isNaN(num) && num > 0) {
            settings.fetchLimit = Math.min(num, REDDIT_MAX_ITEMS);
            await saveSettings();
          }
        })
    );

  new Setting(containerEl)
    .setName('Skip existing')
    .setDesc('Skip posts already in your vault (matched by Reddit ID)')
    .addToggle(toggle =>
      toggle.setValue(settings.skipExisting).onChange(async value => {
        settings.skipExisting = value;
        await saveSettings();
      })
    );

  new Setting(containerEl)
    .setName('Unsave after import')
    .setDesc('Automatically remove items from Reddit saved list after importing')
    .addDropdown(dropdown =>
      dropdown
        .addOption('off', 'Off \u2014 keep saved')
        .addOption('prompt', 'Prompt \u2014 choose which to unsave')
        .addOption('auto', 'Auto \u2014 unsave all after import')
        .setValue(settings.unsaveMode)
        .onChange(async value => {
          settings.unsaveMode = value as UnsaveMode;
          settings.autoUnsave = value === 'auto';
          await saveSettings();
        })
    );

  // Crosspost handling
  const crosspostContent = createCollapsibleSection(
    containerEl, expandedSections, 'content-crosspost', 'Crosspost handling',
  );

  new Setting(crosspostContent)
    .setName('Import original post')
    .setDesc('When you save a crosspost, import the original instead')
    .addToggle(toggle =>
      toggle.setValue(settings.importCrosspostOriginal).onChange(async value => {
        settings.importCrosspostOriginal = value;
        await saveSettings();
      })
    );

  new Setting(crosspostContent)
    .setName('Preserve crosspost metadata')
    .setDesc('Keep crosspost relationship info in frontmatter')
    .addToggle(toggle =>
      toggle.setValue(settings.preserveCrosspostMetadata).onChange(async value => {
        settings.preserveCrosspostMetadata = value;
        await saveSettings();
      })
    );
}
