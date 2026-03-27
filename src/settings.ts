import { App, Plugin, PluginSettingTab, setIcon } from 'obsidian';
import { RedditSavedSettings, SettingsTab } from './types';
import { renderSetupTab } from './settings/setup-tab';
import { renderContentTab } from './settings/content-tab';
import { renderOutputTab } from './settings/output-tab';
import { renderFiltersTab } from './settings/filters-tab';
import { renderAdvancedTab } from './settings/advanced-tab';

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { id: 'setup', label: 'Setup', icon: 'key' },
  { id: 'content', label: 'Content', icon: 'download' },
  { id: 'output', label: 'Output', icon: 'file-text' },
  { id: 'filters', label: 'Filters', icon: 'filter' },
  { id: 'advanced', label: 'Advanced', icon: 'settings' },
];

export class RedditSavedSettingTab extends PluginSettingTab {
  private settings: RedditSavedSettings;
  private saveSettings: () => Promise<void>;
  private initiateOAuth: () => Promise<void>;
  private expandedSections = new Set<string>();

  constructor(
    app: App,
    plugin: Plugin,
    settings: RedditSavedSettings,
    saveSettings: () => Promise<void>,
    initiateOAuth: () => Promise<void>
  ) {
    super(app, plugin);
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.initiateOAuth = initiateOAuth;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('reddit-saved-settings');

    this.buildTabBar(containerEl);

    const contentEl = containerEl.createDiv({ cls: 'settings-tab-content' });
    const ctx = {
      settings: this.settings,
      saveSettings: this.saveSettings,
      expandedSections: this.expandedSections,
      redisplay: () => this.display(),
    };

    switch (this.settings.activeSettingsTab) {
      case 'setup':
        renderSetupTab(contentEl, { ...ctx, initiateOAuth: this.initiateOAuth });
        break;
      case 'content':
        renderContentTab(contentEl, ctx);
        break;
      case 'output':
        renderOutputTab(contentEl, ctx);
        break;
      case 'filters':
        renderFiltersTab(contentEl, ctx);
        break;
      case 'advanced':
        renderAdvancedTab(contentEl, ctx);
        break;
      default:
        this.settings.activeSettingsTab = 'setup';
        void this.saveSettings();
        renderSetupTab(contentEl, { ...ctx, initiateOAuth: this.initiateOAuth });
        break;
    }
  }

  private buildTabBar(containerEl: HTMLElement): void {
    const tabBar = containerEl.createDiv({ cls: 'settings-tab-bar' });

    for (const tab of TABS) {
      const btn = tabBar.createEl('button', { cls: 'settings-tab-btn' });

      const iconSpan = btn.createSpan({ cls: 'settings-tab-icon' });
      setIcon(iconSpan, tab.icon);
      btn.createSpan({ text: tab.label });

      if (this.settings.activeSettingsTab === tab.id) {
        btn.addClass('active');
      }

      btn.addEventListener('click', async () => {
        this.settings.activeSettingsTab = tab.id;
        await this.saveSettings();
        this.display();
      });
    }
  }
}
