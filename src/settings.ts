import { App, Notice, Plugin, PluginSettingTab, setIcon, Setting } from 'obsidian';
import {
  RedditSavedSettings,
  FilterSettings,
  PostType,
  FilterMode,
  DateRangePreset,
  UnsaveMode,
  CredentialBackup,
  SettingsTab,
} from './types';
import { FILTER_PRESETS } from './filters';
import {
  DEFAULT_FILTER_SETTINGS,
  COMMENT_CONTEXT_MAX,
  COMMENT_MAX_DEPTH,
  OBSIDIAN_REDIRECT_URI,
} from './constants';

const REDDIT_MAX_ITEMS = 1000; // Reddit's hard limit

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { id: 'setup', label: 'Setup', icon: 'key' },
  { id: 'import', label: 'Import', icon: 'download' },
  { id: 'filters', label: 'Filters', icon: 'filter' },
  { id: 'advanced', label: 'Advanced', icon: 'settings' },
];

export class RedditSavedSettingTab extends PluginSettingTab {
  private settings: RedditSavedSettings;
  private saveSettings: () => Promise<void>;
  private initiateOAuth: () => Promise<void>;

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

    // Tab bar
    this.buildTabBar(containerEl);

    // Tab content
    const contentEl = containerEl.createDiv({ cls: 'settings-tab-content' });

    switch (this.settings.activeSettingsTab) {
      case 'setup':
        this.displaySetupTab(contentEl);
        break;
      case 'import':
        this.displayImportTab(contentEl);
        break;
      case 'filters':
        this.displayFiltersTab(contentEl);
        break;
      case 'advanced':
        this.displayAdvancedTab(contentEl);
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

  // ============================================================================
  // SETUP TAB
  // ============================================================================

  private displaySetupTab(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Authentication').setHeading();

    // Platform guide
    const platformBox = containerEl.createDiv({ cls: 'settings-info-box' });
    platformBox.createEl('strong', { text: 'Choose your Reddit app type:' });

    const optionsGrid = platformBox.createDiv({ cls: 'settings-platform-grid' });

    // Mobile option
    const mobileOption = optionsGrid.createDiv({ cls: 'settings-platform-option' });
    const mobileLabel = mobileOption.createEl('div', { cls: 'settings-platform-label' });
    setIcon(mobileLabel.createSpan(), 'smartphone');
    mobileLabel.createEl('strong', { text: 'Mobile / all platforms' });
    const mobileDesc = mobileOption.createEl('div', { cls: 'settings-platform-desc' });
    mobileDesc.innerHTML = `"installed app" &bull; No secret needed<br><code>${OBSIDIAN_REDIRECT_URI}</code>`;

    // Desktop option
    const desktopOption = optionsGrid.createDiv({ cls: 'settings-platform-option' });
    const desktopLabel = desktopOption.createEl('div', { cls: 'settings-platform-label' });
    setIcon(desktopLabel.createSpan(), 'monitor');
    desktopLabel.createEl('strong', { text: 'Desktop only' });
    const desktopDesc = desktopOption.createEl('div', { cls: 'settings-platform-desc' });
    desktopDesc.innerHTML = `"script" app &bull; Secret required<br><code>http://localhost:${this.settings.oauthRedirectPort}</code>`;

    new Setting(containerEl)
      .setName('Client ID')
      .setDesc('Your Reddit app client ID')
      .addText(text =>
        text
          .setPlaceholder('Enter client ID')
          .setValue(this.settings.clientId)
          .onChange(async value => {
            this.settings.clientId = value;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Client secret')
      .setDesc('Leave empty for mobile/installed app')
      .addText(text =>
        text
          .setPlaceholder('Leave empty for mobile')
          .setValue(this.settings.clientSecret)
          .onChange(async value => {
            this.settings.clientSecret = value;
            await this.saveSettings();
            this.display();
          })
      );

    // Mode indicator
    const isInstalledApp = !this.settings.clientSecret?.trim();
    const modeIndicator = containerEl.createDiv({ cls: 'settings-mode-indicator' });
    modeIndicator.addClass(isInstalledApp ? 'mode-mobile' : 'mode-desktop');
    setIcon(modeIndicator.createSpan(), isInstalledApp ? 'smartphone' : 'monitor');
    modeIndicator.createSpan({
      text: isInstalledApp ? 'Mobile Mode — Works on all platforms' : 'Desktop Mode — Desktop only',
    });

    // Auth button
    if (this.settings.username) {
      new Setting(containerEl)
        .setName('Authenticated user')
        .setDesc(`Logged in as: ${this.settings.username}`)
        .addButton(button =>
          button.setButtonText('Re-authenticate').onClick(async () => {
            await this.initiateOAuth();
          })
        );
    } else {
      new Setting(containerEl)
        .setName('Authentication')
        .setDesc('Connect your Reddit account')
        .addButton(button =>
          button
            .setButtonText('Authenticate with Reddit')
            .setCta()
            .onClick(async () => {
              await this.initiateOAuth();
            })
        );
    }

    // Credential backup (collapsible)
    this.displayCredentialBackup(containerEl);

    // Save location
    new Setting(containerEl).setName('Save location').setHeading();

    new Setting(containerEl)
      .setName('Save folder')
      .setDesc('Where Reddit posts will be saved in your vault')
      .addText(text =>
        text
          .setPlaceholder('Reddit saved')
          .setValue(this.settings.saveLocation)
          .onChange(async value => {
            this.settings.saveLocation = value;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('OAuth redirect port')
      .setDesc('Port for OAuth callback (desktop/script app only)')
      .addText(text =>
        text
          .setPlaceholder('9638')
          .setValue(String(this.settings.oauthRedirectPort))
          .onChange(async value => {
            const port = parseInt(value);
            if (!isNaN(port) && port > 1000 && port < 65536) {
              this.settings.oauthRedirectPort = port;
              await this.saveSettings();
              this.display();
            }
          })
      );
  }

  private displayCredentialBackup(containerEl: HTMLElement): void {
    if (!this.settings.clientId && !this.settings.accessToken) {
      return;
    }

    const details = containerEl.createEl('details', { cls: 'settings-collapsible' });
    const summary = details.createEl('summary');
    setIcon(summary.createSpan(), 'shield');
    summary.createSpan({ text: 'Credential backup' });

    const content = details.createDiv({ cls: 'settings-collapsible-content' });
    content.createEl('p', {
      text: 'Backup credentials before testing new OAuth configurations.',
      cls: 'setting-item-description',
    });

    const buttonContainer = content.createDiv({ cls: 'settings-button-row' });

    const exportBtn = buttonContainer.createEl('button', { text: 'Export to clipboard' });
    exportBtn.addEventListener('click', async () => {
      const backup: CredentialBackup = {
        version: 1,
        createdAt: new Date().toISOString(),
        clientId: this.settings.clientId,
        clientSecret: this.settings.clientSecret,
        accessToken: this.settings.accessToken,
        refreshToken: this.settings.refreshToken,
        tokenExpiry: this.settings.tokenExpiry,
        username: this.settings.username,
      };
      await navigator.clipboard.writeText(JSON.stringify(backup, null, 2));
      new Notice('Credentials copied to clipboard!');
    });

    const importBtn = buttonContainer.createEl('button', { text: 'Import from clipboard' });
    importBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        const backup = JSON.parse(text) as CredentialBackup;

        if (backup.version !== 1 || !backup.clientId || !backup.createdAt) {
          new Notice('Invalid backup format');
          return;
        }

        this.settings.clientId = backup.clientId;
        this.settings.clientSecret = backup.clientSecret;
        this.settings.accessToken = backup.accessToken;
        this.settings.refreshToken = backup.refreshToken;
        this.settings.tokenExpiry = backup.tokenExpiry;
        this.settings.username = backup.username;

        await this.saveSettings();
        this.display();
        new Notice(`Credentials restored from ${new Date(backup.createdAt).toLocaleDateString()}`);
      } catch {
        new Notice('Failed to import. Check clipboard contents.');
      }
    });
  }

  // ============================================================================
  // IMPORT TAB
  // ============================================================================

  private displayImportTab(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Content types').setHeading();

    const contentInfo = containerEl.createDiv({ cls: 'settings-info-box compact' });
    contentInfo.createSpan({ text: 'Select which Reddit content to import.' });

    new Setting(containerEl)
      .setName('Saved posts')
      .setDesc('Posts you have saved')
      .addToggle(toggle =>
        toggle.setValue(this.settings.importSavedPosts).onChange(async value => {
          this.settings.importSavedPosts = value;
          await this.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Saved comments')
      .setDesc('Comments you have saved')
      .addToggle(toggle =>
        toggle.setValue(this.settings.importSavedComments).onChange(async value => {
          this.settings.importSavedComments = value;
          await this.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Upvoted posts')
      .setDesc('Posts you have upvoted')
      .addToggle(toggle =>
        toggle.setValue(this.settings.importUpvoted).onChange(async value => {
          this.settings.importUpvoted = value;
          await this.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Your posts')
      .setDesc('Posts you have submitted')
      .addToggle(toggle =>
        toggle.setValue(this.settings.importUserPosts).onChange(async value => {
          this.settings.importUserPosts = value;
          await this.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Your comments')
      .setDesc('Comments you have posted')
      .addToggle(toggle =>
        toggle.setValue(this.settings.importUserComments).onChange(async value => {
          this.settings.importUserComments = value;
          await this.saveSettings();
        })
      );

    // Post Processing
    new Setting(containerEl).setName('Post processing').setHeading();

    new Setting(containerEl)
      .setName('Fetch limit')
      .setDesc(`Max items per import (Reddit cap: ${REDDIT_MAX_ITEMS})`)
      .addText(text =>
        text
          .setPlaceholder(String(REDDIT_MAX_ITEMS))
          .setValue(String(this.settings.fetchLimit))
          .onChange(async value => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.settings.fetchLimit = Math.min(num, REDDIT_MAX_ITEMS);
              await this.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Skip existing')
      .setDesc('Skip posts already imported (by Reddit ID)')
      .addToggle(toggle =>
        toggle.setValue(this.settings.skipExisting).onChange(async value => {
          this.settings.skipExisting = value;
          await this.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Unsave after import')
      .setDesc('Remove from Reddit after importing')
      .addDropdown(dropdown =>
        dropdown
          .addOption('off', 'Off - keep saved')
          .addOption('prompt', 'Prompt - choose which')
          .addOption('auto', 'Auto - unsave all')
          .setValue(this.settings.unsaveMode)
          .onChange(async value => {
            this.settings.unsaveMode = value as UnsaveMode;
            this.settings.autoUnsave = value === 'auto';
            await this.saveSettings();
          })
      );

    // Crosspost handling (collapsible)
    const crosspostDetails = containerEl.createEl('details', { cls: 'settings-collapsible' });
    const crosspostSummary = crosspostDetails.createEl('summary');
    setIcon(crosspostSummary.createSpan(), 'git-branch');
    crosspostSummary.createSpan({ text: 'Crosspost Handling' });

    const crosspostContent = crosspostDetails.createDiv({ cls: 'settings-collapsible-content' });

    new Setting(crosspostContent)
      .setName('Import original post')
      .setDesc('Import the original instead of the crosspost')
      .addToggle(toggle =>
        toggle.setValue(this.settings.importCrosspostOriginal).onChange(async value => {
          this.settings.importCrosspostOriginal = value;
          await this.saveSettings();
        })
      );

    new Setting(crosspostContent)
      .setName('Preserve crosspost metadata')
      .setDesc('Keep crosspost relationship info in frontmatter')
      .addToggle(toggle =>
        toggle.setValue(this.settings.preserveCrosspostMetadata).onChange(async value => {
          this.settings.preserveCrosspostMetadata = value;
          await this.saveSettings();
        })
      );

    // Comment export (collapsible)
    const commentDetails = containerEl.createEl('details', { cls: 'settings-collapsible' });
    const commentSummary = commentDetails.createEl('summary');
    setIcon(commentSummary.createSpan(), 'message-square');
    commentSummary.createSpan({ text: 'Comment Export' });

    const commentContent = commentDetails.createDiv({ cls: 'settings-collapsible-content' });

    new Setting(commentContent)
      .setName('Export post comments')
      .setDesc('Include top comments when exporting posts')
      .addToggle(toggle =>
        toggle.setValue(this.settings.exportPostComments).onChange(async value => {
          this.settings.exportPostComments = value;
          await this.saveSettings();
          this.display();
        })
      );

    if (this.settings.exportPostComments) {
      new Setting(commentContent)
        .setName('Comment upvote threshold')
        .setDesc('Minimum upvotes to include (0 = all)')
        .addText(text =>
          text
            .setPlaceholder('0')
            .setValue(String(this.settings.commentUpvoteThreshold))
            .onChange(async value => {
              const num = parseInt(value);
              if (!isNaN(num) && num >= 0) {
                this.settings.commentUpvoteThreshold = num;
                await this.saveSettings();
              }
            })
        );
    }

    // Organization
    new Setting(containerEl).setName('Organization').setHeading();

    new Setting(containerEl)
      .setName('Organize by subreddit')
      .setDesc('Create subfolders per subreddit')
      .addToggle(toggle =>
        toggle.setValue(this.settings.organizeBySubreddit).onChange(async value => {
          this.settings.organizeBySubreddit = value;
          await this.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Folder template')
      .setDesc('Custom folder structure')
      .addText(text =>
        text
          .setPlaceholder('{subreddit}/{year}')
          .setValue(this.settings.folderTemplate)
          .onChange(async value => {
            this.settings.folderTemplate = value;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Filename template')
      .setDesc('Custom filename format')
      .addText(text =>
        text
          .setPlaceholder('{title}')
          .setValue(this.settings.filenameTemplate)
          .onChange(async value => {
            this.settings.filenameTemplate = value;
            await this.saveSettings();
          })
      );

    // Template variables reference
    const templateInfo = containerEl.createDiv({ cls: 'settings-info-box compact' });
    templateInfo.createEl('strong', { text: 'Variables: ' });
    templateInfo.createEl('code', {
      text: '{subreddit} {author} {type} {year} {month} {day} {title} {id} {score}',
    });
  }

  // ============================================================================
  // FILTERS TAB
  // ============================================================================

  private displayFiltersTab(containerEl: HTMLElement): void {
    // Ensure filterSettings exists
    if (!this.settings.filterSettings) {
      this.settings.filterSettings = { ...DEFAULT_FILTER_SETTINGS };
    }

    const filters = this.settings.filterSettings;

    // Quick presets
    new Setting(containerEl).setName('Quick presets').setHeading();

    const presetContainer = containerEl.createDiv({ cls: 'settings-preset-row' });
    for (const [, preset] of Object.entries(FILTER_PRESETS)) {
      const btn = presetContainer.createEl('button', {
        text: preset.name,
        cls: 'settings-preset-btn',
      });
      btn.title = preset.description;
      btn.addEventListener('click', async () => {
        Object.assign(this.settings.filterSettings, preset.settings);
        await this.saveSettings();
        this.display();
        new Notice(`Applied: ${preset.name}`);
      });
    }

    // Enable filtering
    new Setting(containerEl).setName('Basic filters').setHeading();

    new Setting(containerEl)
      .setName('Enable filtering')
      .setDesc('Only import items matching filter criteria')
      .addToggle(toggle =>
        toggle.setValue(filters.enabled).onChange(async value => {
          filters.enabled = value;
          await this.saveSettings();
          this.display();
        })
      );

    if (!filters.enabled) {
      const infoDiv = containerEl.createDiv({ cls: 'settings-info-box' });
      infoDiv.createSpan({ text: 'Enable filtering above to configure filters.' });
      return;
    }

    // Basic filters
    new Setting(containerEl)
      .setName('Date range')
      .setDesc('Import posts from a specific time period')
      .addDropdown(dropdown =>
        dropdown
          .addOption('all', 'All time')
          .addOption('last_day', 'Last 24 hours')
          .addOption('last_week', 'Last week')
          .addOption('last_month', 'Last month')
          .addOption('last_year', 'Last year')
          .addOption('custom', 'Custom range')
          .setValue(filters.dateRangePreset)
          .onChange(async (value: DateRangePreset) => {
            filters.dateRangePreset = value;
            await this.saveSettings();
            this.display();
          })
      );

    if (filters.dateRangePreset === 'custom') {
      new Setting(containerEl).setName('Start date').addText(text =>
        text
          .setPlaceholder('YYYY-MM-DD')
          .setValue(
            filters.dateRangeStart
              ? new Date(filters.dateRangeStart).toISOString().split('T')[0]
              : ''
          )
          .onChange(async value => {
            const date = new Date(value);
            filters.dateRangeStart = !isNaN(date.getTime()) ? date.getTime() : null;
            await this.saveSettings();
          })
      );

      new Setting(containerEl).setName('End date').addText(text =>
        text
          .setPlaceholder('YYYY-MM-DD')
          .setValue(
            filters.dateRangeEnd ? new Date(filters.dateRangeEnd).toISOString().split('T')[0] : ''
          )
          .onChange(async value => {
            const date = new Date(value);
            filters.dateRangeEnd = !isNaN(date.getTime()) ? date.getTime() : null;
            await this.saveSettings();
          })
      );
    }

    // Post types
    const postTypes: Array<{ type: PostType; label: string }> = [
      { type: 'text', label: 'Text' },
      { type: 'link', label: 'Links' },
      { type: 'image', label: 'Images' },
      { type: 'video', label: 'Videos' },
    ];

    const postTypeContainer = containerEl.createDiv({ cls: 'settings-checkbox-row' });
    postTypeContainer.createSpan({ text: 'Post types: ', cls: 'settings-checkbox-label' });

    for (const { type, label } of postTypes) {
      const checkbox = postTypeContainer.createEl('label', { cls: 'settings-checkbox' });
      const input = checkbox.createEl('input', { type: 'checkbox' });
      input.checked = filters.includePostTypes.includes(type);
      input.addEventListener('change', async () => {
        if (input.checked) {
          if (!filters.includePostTypes.includes(type)) {
            filters.includePostTypes.push(type);
          }
        } else {
          filters.includePostTypes = filters.includePostTypes.filter(t => t !== type);
        }
        await this.saveSettings();
      });
      checkbox.createSpan({ text: label });
    }

    new Setting(containerEl).setName('Include posts').addToggle(toggle =>
      toggle.setValue(filters.includePosts).onChange(async value => {
        filters.includePosts = value;
        await this.saveSettings();
      })
    );

    new Setting(containerEl).setName('Include comments').addToggle(toggle =>
      toggle.setValue(filters.includeComments).onChange(async value => {
        filters.includeComments = value;
        await this.saveSettings();
      })
    );

    new Setting(containerEl)
      .setName('Exclude NSFW')
      .setDesc('Filter out adult content')
      .addToggle(toggle =>
        toggle.setValue(filters.excludeNsfw).onChange(async value => {
          filters.excludeNsfw = value;
          await this.saveSettings();
        })
      );

    // Advanced Filters (collapsible)
    const advancedDetails = containerEl.createEl('details', { cls: 'settings-collapsible' });
    const advancedSummary = advancedDetails.createEl('summary');
    setIcon(advancedSummary.createSpan(), 'sliders-horizontal');
    advancedSummary.createSpan({ text: 'Advanced filters' });

    const advancedContent = advancedDetails.createDiv({ cls: 'settings-collapsible-content' });

    // Subreddit filtering
    new Setting(advancedContent).setName('Subreddit filtering').setHeading();

    new Setting(advancedContent).setName('Mode').addDropdown(dropdown =>
      dropdown
        .addOption('include', 'Include only listed')
        .addOption('exclude', 'Exclude listed')
        .setValue(filters.subredditFilterMode)
        .onChange(async (value: FilterMode) => {
          filters.subredditFilterMode = value;
          await this.saveSettings();
        })
    );

    new Setting(advancedContent)
      .setName('Subreddits')
      .setDesc('One per line, without r/')
      .addTextArea(text => {
        text
          .setPlaceholder('AskReddit\nprogramming')
          .setValue(filters.subredditList.join('\n'))
          .onChange(async value => {
            filters.subredditList = value
              .split('\n')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            await this.saveSettings();
          });
        text.inputEl.rows = 3;
      });

    new Setting(advancedContent).setName('Use regex').addToggle(toggle =>
      toggle.setValue(filters.useSubredditRegex).onChange(async value => {
        filters.useSubredditRegex = value;
        await this.saveSettings();
        this.display();
      })
    );

    if (filters.useSubredditRegex) {
      new Setting(advancedContent).setName('Regex pattern').addText(text =>
        text
          .setPlaceholder('^(programming|coding).*')
          .setValue(filters.subredditRegex)
          .onChange(async value => {
            filters.subredditRegex = value;
            await this.saveSettings();
          })
      );
    }

    // Score filtering
    new Setting(advancedContent).setName('Score filtering').setHeading();

    new Setting(advancedContent).setName('Minimum score').addText(text =>
      text
        .setPlaceholder('No minimum')
        .setValue(filters.minScore !== null ? String(filters.minScore) : '')
        .onChange(async value => {
          const num = parseInt(value);
          filters.minScore = !isNaN(num) ? num : null;
          await this.saveSettings();
        })
    );

    new Setting(advancedContent).setName('Maximum score').addText(text =>
      text
        .setPlaceholder('No maximum')
        .setValue(filters.maxScore !== null ? String(filters.maxScore) : '')
        .onChange(async value => {
          const num = parseInt(value);
          filters.maxScore = !isNaN(num) ? num : null;
          await this.saveSettings();
        })
    );

    new Setting(advancedContent)
      .setName('Min upvote ratio')
      .setDesc('0.0 to 1.0')
      .addText(text =>
        text
          .setPlaceholder('e.g., 0.9')
          .setValue(filters.minUpvoteRatio !== null ? String(filters.minUpvoteRatio) : '')
          .onChange(async value => {
            const num = parseFloat(value);
            if (!isNaN(num) && num >= 0 && num <= 1) {
              filters.minUpvoteRatio = num;
            } else if (value === '') {
              filters.minUpvoteRatio = null;
            }
            await this.saveSettings();
          })
      );

    // Content keywords
    new Setting(advancedContent).setName('Content filtering').setHeading();

    new Setting(advancedContent).setName('Title keyword mode').addDropdown(dropdown =>
      dropdown
        .addOption('include', 'Must contain')
        .addOption('exclude', 'Must not contain')
        .setValue(filters.titleKeywordsMode)
        .onChange(async (value: FilterMode) => {
          filters.titleKeywordsMode = value;
          await this.saveSettings();
        })
    );

    new Setting(advancedContent).setName('Title keywords').addTextArea(text => {
      text
        .setPlaceholder('tutorial\nguide')
        .setValue(filters.titleKeywords.join('\n'))
        .onChange(async value => {
          filters.titleKeywords = value
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          await this.saveSettings();
        });
      text.inputEl.rows = 2;
    });

    new Setting(advancedContent).setName('Content keyword mode').addDropdown(dropdown =>
      dropdown
        .addOption('include', 'Must contain')
        .addOption('exclude', 'Must not contain')
        .setValue(filters.contentKeywordsMode)
        .onChange(async (value: FilterMode) => {
          filters.contentKeywordsMode = value;
          await this.saveSettings();
        })
    );

    new Setting(advancedContent).setName('Content keywords').addTextArea(text => {
      text
        .setPlaceholder('python\njavascript')
        .setValue(filters.contentKeywords.join('\n'))
        .onChange(async value => {
          filters.contentKeywords = value
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          await this.saveSettings();
        });
      text.inputEl.rows = 2;
    });

    // Flair filtering
    new Setting(advancedContent).setName('Flair filter mode').addDropdown(dropdown =>
      dropdown
        .addOption('include', 'Include only listed')
        .addOption('exclude', 'Exclude listed')
        .setValue(filters.flairFilterMode)
        .onChange(async (value: FilterMode) => {
          filters.flairFilterMode = value;
          await this.saveSettings();
        })
    );

    new Setting(advancedContent).setName('Flair list').addTextArea(text => {
      text
        .setPlaceholder('Discussion\nQuestion')
        .setValue(filters.flairList.join('\n'))
        .onChange(async value => {
          filters.flairList = value
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          await this.saveSettings();
        });
      text.inputEl.rows = 2;
    });

    // Author filtering
    new Setting(advancedContent).setName('Author & domain').setHeading();

    new Setting(advancedContent).setName('Author filter mode').addDropdown(dropdown =>
      dropdown
        .addOption('include', 'Include only listed')
        .addOption('exclude', 'Exclude listed')
        .setValue(filters.authorFilterMode)
        .onChange(async (value: FilterMode) => {
          filters.authorFilterMode = value;
          await this.saveSettings();
        })
    );

    new Setting(advancedContent).setName('Authors').addTextArea(text => {
      text
        .setPlaceholder('username1\nusername2')
        .setValue(filters.authorList.join('\n'))
        .onChange(async value => {
          filters.authorList = value
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          await this.saveSettings();
        });
      text.inputEl.rows = 2;
    });

    new Setting(advancedContent).setName('Domain filter mode').addDropdown(dropdown =>
      dropdown
        .addOption('include', 'Include only listed')
        .addOption('exclude', 'Exclude listed')
        .setValue(filters.domainFilterMode)
        .onChange(async (value: FilterMode) => {
          filters.domainFilterMode = value;
          await this.saveSettings();
        })
    );

    new Setting(advancedContent).setName('Domains').addTextArea(text => {
      text
        .setPlaceholder('youtube.com\ngithub.com')
        .setValue(filters.domainList.join('\n'))
        .onChange(async value => {
          filters.domainList = value
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          await this.saveSettings();
        });
      text.inputEl.rows = 2;
    });

    // Comment count
    new Setting(advancedContent).setName('Min comment count').addText(text =>
      text
        .setPlaceholder('No minimum')
        .setValue(filters.minCommentCount !== null ? String(filters.minCommentCount) : '')
        .onChange(async value => {
          const num = parseInt(value);
          filters.minCommentCount = !isNaN(num) ? num : null;
          await this.saveSettings();
        })
    );

    new Setting(advancedContent).setName('Max comment count').addText(text =>
      text
        .setPlaceholder('No maximum')
        .setValue(filters.maxCommentCount !== null ? String(filters.maxCommentCount) : '')
        .onChange(async value => {
          const num = parseInt(value);
          filters.maxCommentCount = !isNaN(num) ? num : null;
          await this.saveSettings();
        })
    );

    // Reset button
    new Setting(containerEl).addButton(button =>
      button
        .setButtonText('Reset all filters')
        .setWarning()
        .onClick(async () => {
          this.settings.filterSettings = { ...DEFAULT_FILTER_SETTINGS, enabled: true };
          await this.saveSettings();
          this.display();
          new Notice('Filters reset');
        })
    );
  }

  // ============================================================================
  // ADVANCED TAB
  // ============================================================================

  private displayAdvancedTab(containerEl: HTMLElement): void {
    // Performance
    new Setting(containerEl).setName('Performance & reliability').setHeading();

    new Setting(containerEl)
      .setName('Enhanced mode')
      .setDesc('Circuit breaker, request queuing, adaptive rate limiting')
      .addToggle(toggle =>
        toggle.setValue(this.settings.enableEnhancedMode).onChange(async value => {
          this.settings.enableEnhancedMode = value;
          await this.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Enable checkpointing')
      .setDesc('Resume interrupted imports')
      .addToggle(toggle =>
        toggle.setValue(this.settings.enableCheckpointing).onChange(async value => {
          this.settings.enableCheckpointing = value;
          await this.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Max concurrent requests')
      .setDesc('1-5, lower is safer')
      .addText(text =>
        text
          .setPlaceholder('2')
          .setValue(String(this.settings.maxConcurrentRequests))
          .onChange(async value => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 1 && num <= 5) {
              this.settings.maxConcurrentRequests = num;
              await this.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Max retries')
      .setDesc('1-10')
      .addText(text =>
        text
          .setPlaceholder('3')
          .setValue(String(this.settings.maxRetries))
          .onChange(async value => {
            const num = parseInt(value);
            if (!isNaN(num) && num >= 1 && num <= 10) {
              this.settings.maxRetries = num;
              await this.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Offline queue')
      .setDesc('Queue requests when offline')
      .addToggle(toggle =>
        toggle.setValue(this.settings.enableOfflineQueue).onChange(async value => {
          this.settings.enableOfflineQueue = value;
          await this.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Show performance stats')
      .setDesc('Log metrics after import')
      .addToggle(toggle =>
        toggle.setValue(this.settings.showPerformanceStats).onChange(async value => {
          this.settings.showPerformanceStats = value;
          await this.saveSettings();
        })
      );

    // Media Downloads (collapsible)
    const mediaDetails = containerEl.createEl('details', { cls: 'settings-collapsible' });
    const mediaSummary = mediaDetails.createEl('summary');
    setIcon(mediaSummary.createSpan(), 'image');
    mediaSummary.createSpan({ text: 'Media Downloads' });

    const mediaContent = mediaDetails.createDiv({ cls: 'settings-collapsible-content' });

    new Setting(mediaContent)
      .setName('Media folder')
      .setDesc('Where to save downloaded media')
      .addText(text =>
        text
          .setPlaceholder('Attachments')
          .setValue(this.settings.mediaFolder)
          .onChange(async value => {
            this.settings.mediaFolder = value || 'Attachments';
            await this.saveSettings();
          })
      );

    new Setting(mediaContent).setName('Download images').addToggle(toggle =>
      toggle.setValue(this.settings.downloadImages).onChange(async value => {
        this.settings.downloadImages = value;
        await this.saveSettings();
      })
    );

    new Setting(mediaContent).setName('Download GIFs').addToggle(toggle =>
      toggle.setValue(this.settings.downloadGifs).onChange(async value => {
        this.settings.downloadGifs = value;
        await this.saveSettings();
      })
    );

    new Setting(mediaContent).setName('Download videos').addToggle(toggle =>
      toggle.setValue(this.settings.downloadVideos).onChange(async value => {
        this.settings.downloadVideos = value;
        await this.saveSettings();
      })
    );

    // Templater Integration (collapsible)
    const templaterDetails = containerEl.createEl('details', { cls: 'settings-collapsible' });
    const templaterSummary = templaterDetails.createEl('summary');
    setIcon(templaterSummary.createSpan(), 'file-code');
    templaterSummary.createSpan({ text: 'Templater Integration' });

    const templaterContent = templaterDetails.createDiv({ cls: 'settings-collapsible-content' });

    new Setting(templaterContent)
      .setName('Use Templater')
      .setDesc('Custom templates for output')
      .addToggle(toggle =>
        toggle.setValue(this.settings.useTemplater).onChange(async value => {
          this.settings.useTemplater = value;
          await this.saveSettings();
          this.display();
        })
      );

    if (this.settings.useTemplater) {
      new Setting(templaterContent).setName('Post template path').addText(text =>
        text
          .setPlaceholder('templates/reddit-post.md')
          .setValue(this.settings.postTemplatePath)
          .onChange(async value => {
            this.settings.postTemplatePath = value;
            await this.saveSettings();
          })
      );

      new Setting(templaterContent).setName('Comment template path').addText(text =>
        text
          .setPlaceholder('templates/reddit-comment.md')
          .setValue(this.settings.commentTemplatePath)
          .onChange(async value => {
            this.settings.commentTemplatePath = value;
            await this.saveSettings();
          })
      );
    }

    // Comment Context (collapsible)
    const contextDetails = containerEl.createEl('details', { cls: 'settings-collapsible' });
    const contextSummary = contextDetails.createEl('summary');
    setIcon(contextSummary.createSpan(), 'messages-square');
    contextSummary.createSpan({ text: 'Comment Context' });

    const contextContent = contextDetails.createDiv({ cls: 'settings-collapsible-content' });

    const contextInfo = contextContent.createDiv({ cls: 'settings-info-box compact' });
    contextInfo.createSpan({
      text: 'Fetch parent comments and replies. Requires additional API calls.',
    });

    new Setting(contextContent).setName('Fetch parent context').addToggle(toggle =>
      toggle.setValue(this.settings.fetchCommentContext).onChange(async value => {
        this.settings.fetchCommentContext = value;
        await this.saveSettings();
        this.display();
      })
    );

    if (this.settings.fetchCommentContext) {
      new Setting(contextContent)
        .setName('Context depth')
        .setDesc(`1-${COMMENT_CONTEXT_MAX}`)
        .addSlider(slider =>
          slider
            .setLimits(1, COMMENT_CONTEXT_MAX, 1)
            .setValue(this.settings.commentContextDepth)
            .setDynamicTooltip()
            .onChange(async value => {
              this.settings.commentContextDepth = value;
              await this.saveSettings();
            })
        );
    }

    new Setting(contextContent).setName('Include replies').addToggle(toggle =>
      toggle.setValue(this.settings.includeCommentReplies).onChange(async value => {
        this.settings.includeCommentReplies = value;
        await this.saveSettings();
        this.display();
      })
    );

    if (this.settings.includeCommentReplies) {
      new Setting(contextContent)
        .setName('Reply depth')
        .setDesc(`1-${COMMENT_MAX_DEPTH}`)
        .addSlider(slider =>
          slider
            .setLimits(1, COMMENT_MAX_DEPTH, 1)
            .setValue(this.settings.commentReplyDepth)
            .setDynamicTooltip()
            .onChange(async value => {
              this.settings.commentReplyDepth = value;
              await this.saveSettings();
            })
        );
    }

    // Link Preservation (collapsible)
    const linkDetails = containerEl.createEl('details', { cls: 'settings-collapsible' });
    const linkSummary = linkDetails.createEl('summary');
    setIcon(linkSummary.createSpan(), 'link');
    linkSummary.createSpan({ text: 'Link Preservation' });

    const linkContent = linkDetails.createDiv({ cls: 'settings-collapsible-content' });

    new Setting(linkContent)
      .setName('Enable link preservation')
      .setDesc('Integrate with Internet Archive')
      .addToggle(toggle =>
        toggle.setValue(this.settings.enableLinkPreservation).onChange(async value => {
          this.settings.enableLinkPreservation = value;
          await this.saveSettings();
          this.display();
        })
      );

    if (this.settings.enableLinkPreservation) {
      new Setting(linkContent).setName('Extract external links').addToggle(toggle =>
        toggle.setValue(this.settings.extractExternalLinks).onChange(async value => {
          this.settings.extractExternalLinks = value;
          await this.saveSettings();
        })
      );

      new Setting(linkContent)
        .setName('Check Wayback archive')
        .setDesc('Adds latency')
        .addToggle(toggle =>
          toggle.setValue(this.settings.checkWaybackArchive).onChange(async value => {
            this.settings.checkWaybackArchive = value;
            await this.saveSettings();
          })
        );

      new Setting(linkContent).setName('Include archive links').addToggle(toggle =>
        toggle.setValue(this.settings.includeArchiveLinks).onChange(async value => {
          this.settings.includeArchiveLinks = value;
          await this.saveSettings();
        })
      );
    }
  }
}
