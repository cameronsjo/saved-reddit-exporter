import { App, Notice, Plugin, PluginSettingTab, Setting, TextAreaComponent } from 'obsidian';
import {
  RedditSavedSettings,
  FilterSettings,
  PostType,
  FilterMode,
  DateRangePreset,
} from './types';
import { FILTER_PRESETS } from './filters';
import { DEFAULT_FILTER_SETTINGS } from './constants';

const REDDIT_MAX_ITEMS = 1000; // Reddit's hard limit

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

    new Setting(containerEl).setName('Reddit Saved Posts Settings').setHeading();

    const setupInstructions = containerEl.createDiv();

    const firstPara = setupInstructions.createEl('p');
    firstPara.createSpan({ text: 'To use this plugin, you need to create a Reddit app at ' });
    firstPara
      .createEl('a', {
        text: 'Reddit Apps',
        href: 'https://www.reddit.com/prefs/apps',
      })
      .setAttr('target', '_blank');

    const secondPara = setupInstructions.createEl('p');
    secondPara.createEl('strong', { text: 'Important' });
    secondPara.createSpan({ text: ': Set the redirect URI to ' });
    secondPara.createEl('code', { text: `http://localhost:${this.settings.oauthRedirectPort}` });

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
      .setDesc('Your Reddit app client secret')
      .addText(text =>
        text
          .setPlaceholder('Enter client secret')
          .setValue(this.settings.clientSecret)
          .onChange(async value => {
            this.settings.clientSecret = value;
            await this.saveSettings();
          })
      );

    if (this.settings.username) {
      new Setting(containerEl)
        .setName('Authenticated user')
        .setDesc(`Currently authenticated as: ${this.settings.username}`)
        .addButton(button =>
          button.setButtonText('Re-authenticate').onClick(async () => {
            await this.initiateOAuth();
          })
        );
    } else {
      new Setting(containerEl)
        .setName('Authentication')
        .setDesc('Authenticate with Reddit to access your saved posts')
        .addButton(button =>
          button
            .setButtonText('Authenticate')
            .setCta()
            .onClick(async () => {
              await this.initiateOAuth();
            })
        );
    }

    new Setting(containerEl).setName('Import settings').setHeading();

    // Rate limiting info
    const rateLimitInfo = containerEl.createDiv();
    rateLimitInfo.setCssProps({
      backgroundColor: 'var(--background-secondary)',
      padding: '10px',
      borderRadius: '4px',
      marginBottom: '15px',
    });

    rateLimitInfo.createEl('strong', { text: 'ℹ️ Reddit API limits' });
    rateLimitInfo.createEl('br');
    rateLimitInfo.createSpan({ text: '• Maximum 1,000 saved items can be fetched' });
    rateLimitInfo.createEl('br');
    rateLimitInfo.createSpan({ text: '• Rate limiting applies (60 requests/minute)' });
    rateLimitInfo.createEl('br');
    rateLimitInfo.createSpan({ text: '• Large fetches may take several minutes' });
    rateLimitInfo.createEl('br');
    rateLimitInfo.createSpan({ text: '• Progress will be shown during import' });

    new Setting(containerEl)
      .setName('Save location')
      .setDesc('Folder where Reddit posts will be saved')
      .addText(text =>
        text
          .setPlaceholder('Reddit Saved')
          .setValue(this.settings.saveLocation)
          .onChange(async value => {
            this.settings.saveLocation = value;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Fetch limit')
      .setDesc(
        `Maximum saved posts to fetch (Reddit's hard limit: ${REDDIT_MAX_ITEMS}. Higher numbers may take longer due to rate limiting)`
      )
      .addText(text =>
        text
          .setPlaceholder(String(REDDIT_MAX_ITEMS))
          .setValue(String(this.settings.fetchLimit))
          .onChange(async value => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              const finalLimit = Math.min(num, REDDIT_MAX_ITEMS);
              if (finalLimit !== num) {
                new Notice(`Limit capped at Reddit's maximum: ${REDDIT_MAX_ITEMS}`);
              }
              this.settings.fetchLimit = finalLimit;
              await this.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Skip existing')
      .setDesc('Skip posts that have already been imported (checks by Reddit ID in frontmatter)')
      .addToggle(toggle =>
        toggle.setValue(this.settings.skipExisting).onChange(async value => {
          this.settings.skipExisting = value;
          await this.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Auto-unsave')
      .setDesc('Automatically unsave posts from Reddit after importing')
      .addToggle(toggle =>
        toggle.setValue(this.settings.autoUnsave).onChange(async value => {
          this.settings.autoUnsave = value;
          await this.saveSettings();
        })
      );

    // Advanced Settings Section
    new Setting(containerEl).setName('Advanced settings').setHeading();

    new Setting(containerEl)
      .setName('Show advanced settings')
      .setDesc('Toggle advanced configuration options')
      .addToggle(toggle =>
        toggle.setValue(this.settings.showAdvancedSettings).onChange(async value => {
          this.settings.showAdvancedSettings = value;
          await this.saveSettings();
          this.display(); // Refresh the settings page
        })
      );

    if (this.settings.showAdvancedSettings) {
      new Setting(containerEl)
        .setName('OAuth redirect port')
        .setDesc('Port for OAuth callback (must match Reddit app redirect URI)')
        .addText(text =>
          text
            .setPlaceholder('9638')
            .setValue(String(this.settings.oauthRedirectPort))
            .onChange(async value => {
              const port = parseInt(value);
              if (!isNaN(port) && port > 1000 && port < 65536) {
                this.settings.oauthRedirectPort = port;
                await this.saveSettings();
                this.display(); // Refresh to update the redirect URI display
              }
            })
        );

      // Media Download Settings
      new Setting(containerEl).setName('Media download options').setHeading();

      new Setting(containerEl)
        .setName('Media folder')
        .setDesc(
          'Folder where downloaded media files will be saved (relative to vault root, separate from posts folder)'
        )
        .addText(text =>
          text
            .setPlaceholder('Attachments')
            .setValue(this.settings.mediaFolder)
            .onChange(async value => {
              this.settings.mediaFolder = value || 'Attachments';
              await this.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('Download images')
        .setDesc('Automatically download linked images (PNG, JPG, WEBP, etc.)')
        .addToggle(toggle =>
          toggle.setValue(this.settings.downloadImages).onChange(async value => {
            this.settings.downloadImages = value;
            await this.saveSettings();
          })
        );

      new Setting(containerEl)
        .setName('Download GIFs')
        .setDesc('Automatically download GIF animations')
        .addToggle(toggle =>
          toggle.setValue(this.settings.downloadGifs).onChange(async value => {
            this.settings.downloadGifs = value;
            await this.saveSettings();
          })
        );

      new Setting(containerEl)
        .setName('Download videos')
        .setDesc('Automatically download video files (MP4, WEBM, etc.)')
        .addToggle(toggle =>
          toggle.setValue(this.settings.downloadVideos).onChange(async value => {
            this.settings.downloadVideos = value;
            await this.saveSettings();
          })
        );
    }

    // Filter Settings Section
    this.displayFilterSettings(containerEl);
  }

  private displayFilterSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Import filters').setHeading();

    new Setting(containerEl)
      .setName('Show filter settings')
      .setDesc('Configure filters to selectively import saved content')
      .addToggle(toggle =>
        toggle.setValue(this.settings.showFilterSettings).onChange(async value => {
          this.settings.showFilterSettings = value;
          await this.saveSettings();
          this.display();
        })
      );

    if (!this.settings.showFilterSettings) {
      return;
    }

    // Ensure filterSettings exists
    if (!this.settings.filterSettings) {
      this.settings.filterSettings = { ...DEFAULT_FILTER_SETTINGS };
    }

    const filters = this.settings.filterSettings;

    // Enable/Disable Filtering
    new Setting(containerEl)
      .setName('Enable filtering')
      .setDesc('When enabled, only items matching filter criteria will be imported')
      .addToggle(toggle =>
        toggle.setValue(filters.enabled).onChange(async value => {
          filters.enabled = value;
          await this.saveSettings();
          this.display();
        })
      );

    if (!filters.enabled) {
      const infoDiv = containerEl.createDiv();
      infoDiv.setCssProps({
        backgroundColor: 'var(--background-secondary)',
        padding: '10px',
        borderRadius: '4px',
        marginBottom: '15px',
      });
      infoDiv.createSpan({
        text: 'ℹ️ Filtering is disabled. Enable it above to configure filters.',
      });
      return;
    }

    // Filter Presets
    this.displayFilterPresets(containerEl, filters);

    // Subreddit Filtering
    this.displaySubredditFilters(containerEl, filters);

    // Content Filtering
    this.displayContentFilters(containerEl, filters);

    // Score Filtering
    this.displayScoreFilters(containerEl, filters);

    // Post Type Filtering
    this.displayPostTypeFilters(containerEl, filters);

    // Date Range Filtering
    this.displayDateFilters(containerEl, filters);

    // Advanced Filters
    this.displayAdvancedFilters(containerEl, filters);

    // Reset Filters Button
    new Setting(containerEl).addButton(button =>
      button
        .setButtonText('Reset all filters')
        .setWarning()
        .onClick(async () => {
          this.settings.filterSettings = { ...DEFAULT_FILTER_SETTINGS, enabled: true };
          await this.saveSettings();
          this.display();
          new Notice('Filters reset to defaults');
        })
    );
  }

  private displayFilterPresets(containerEl: HTMLElement, filters: FilterSettings): void {
    const presetDiv = containerEl.createDiv();
    presetDiv.setCssProps({
      backgroundColor: 'var(--background-secondary)',
      padding: '10px',
      borderRadius: '4px',
      marginBottom: '15px',
    });

    presetDiv.createEl('strong', { text: '🎯 Quick presets' });
    presetDiv.createEl('br');

    const buttonContainer = presetDiv.createDiv();
    buttonContainer.setCssProps({
      display: 'flex',
      flexWrap: 'wrap',
      gap: '5px',
      marginTop: '8px',
    });

    for (const [key, preset] of Object.entries(FILTER_PRESETS)) {
      const btn = buttonContainer.createEl('button', { text: preset.name });
      btn.setCssProps({
        padding: '4px 8px',
        fontSize: '12px',
        cursor: 'pointer',
      });
      btn.title = preset.description;
      btn.addEventListener('click', async () => {
        Object.assign(this.settings.filterSettings, preset.settings);
        await this.saveSettings();
        this.display();
        new Notice(`Applied preset: ${preset.name}`);
      });
    }
  }

  private displaySubredditFilters(containerEl: HTMLElement, filters: FilterSettings): void {
    new Setting(containerEl).setName('Subreddit filtering').setHeading();

    new Setting(containerEl)
      .setName('Subreddit filter mode')
      .setDesc('Include only specific subreddits, or exclude specific subreddits')
      .addDropdown(dropdown =>
        dropdown
          .addOption('include', 'Include only listed')
          .addOption('exclude', 'Exclude listed')
          .setValue(filters.subredditFilterMode)
          .onChange(async (value: FilterMode) => {
            filters.subredditFilterMode = value;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Subreddit list')
      .setDesc('Enter subreddit names (one per line, without r/)')
      .addTextArea(text => {
        text
          .setPlaceholder('AskReddit\nprogramming\ntechnology')
          .setValue(filters.subredditList.join('\n'))
          .onChange(async value => {
            filters.subredditList = value
              .split('\n')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            await this.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.setCssProps({ width: '100%' });
      });

    new Setting(containerEl)
      .setName('Use regex pattern')
      .setDesc('Enable regex matching for subreddit names')
      .addToggle(toggle =>
        toggle.setValue(filters.useSubredditRegex).onChange(async value => {
          filters.useSubredditRegex = value;
          await this.saveSettings();
          this.display();
        })
      );

    if (filters.useSubredditRegex) {
      new Setting(containerEl)
        .setName('Subreddit regex')
        .setDesc('Regular expression pattern to match subreddit names')
        .addText(text =>
          text
            .setPlaceholder('^(programming|coding).*')
            .setValue(filters.subredditRegex)
            .onChange(async value => {
              filters.subredditRegex = value;
              await this.saveSettings();
            })
        );
    }
  }

  private displayContentFilters(containerEl: HTMLElement, filters: FilterSettings): void {
    new Setting(containerEl).setName('Content filtering').setHeading();

    // Title keywords
    new Setting(containerEl)
      .setName('Title keyword mode')
      .setDesc('Include posts with keywords, or exclude posts with keywords')
      .addDropdown(dropdown =>
        dropdown
          .addOption('include', 'Must contain keywords')
          .addOption('exclude', 'Must not contain keywords')
          .setValue(filters.titleKeywordsMode)
          .onChange(async (value: FilterMode) => {
            filters.titleKeywordsMode = value;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Title keywords')
      .setDesc('Keywords to search for in post titles (one per line)')
      .addTextArea(text => {
        text
          .setPlaceholder('tutorial\nguide\nhow to')
          .setValue(filters.titleKeywords.join('\n'))
          .onChange(async value => {
            filters.titleKeywords = value
              .split('\n')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            await this.saveSettings();
          });
        text.inputEl.rows = 3;
        text.inputEl.setCssProps({ width: '100%' });
      });

    // Content keywords
    new Setting(containerEl)
      .setName('Content keyword mode')
      .setDesc('Include posts with keywords in body, or exclude them')
      .addDropdown(dropdown =>
        dropdown
          .addOption('include', 'Must contain keywords')
          .addOption('exclude', 'Must not contain keywords')
          .setValue(filters.contentKeywordsMode)
          .onChange(async (value: FilterMode) => {
            filters.contentKeywordsMode = value;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Content keywords')
      .setDesc('Keywords to search for in post/comment body (one per line)')
      .addTextArea(text => {
        text
          .setPlaceholder('python\njavascript\ntypescript')
          .setValue(filters.contentKeywords.join('\n'))
          .onChange(async value => {
            filters.contentKeywords = value
              .split('\n')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            await this.saveSettings();
          });
        text.inputEl.rows = 3;
        text.inputEl.setCssProps({ width: '100%' });
      });

    // Flair filtering
    new Setting(containerEl)
      .setName('Flair filter mode')
      .setDesc('Include only posts with specific flairs, or exclude them')
      .addDropdown(dropdown =>
        dropdown
          .addOption('include', 'Include only listed flairs')
          .addOption('exclude', 'Exclude listed flairs')
          .setValue(filters.flairFilterMode)
          .onChange(async (value: FilterMode) => {
            filters.flairFilterMode = value;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Flair list')
      .setDesc('Flairs to filter (one per line)')
      .addTextArea(text => {
        text
          .setPlaceholder('Discussion\nQuestion\nMeta')
          .setValue(filters.flairList.join('\n'))
          .onChange(async value => {
            filters.flairList = value
              .split('\n')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            await this.saveSettings();
          });
        text.inputEl.rows = 3;
        text.inputEl.setCssProps({ width: '100%' });
      });
  }

  private displayScoreFilters(containerEl: HTMLElement, filters: FilterSettings): void {
    new Setting(containerEl).setName('Score filtering').setHeading();

    new Setting(containerEl)
      .setName('Minimum score')
      .setDesc('Only import posts with at least this many upvotes (leave empty for no minimum)')
      .addText(text =>
        text
          .setPlaceholder('No minimum')
          .setValue(filters.minScore !== null ? String(filters.minScore) : '')
          .onChange(async value => {
            const num = parseInt(value);
            filters.minScore = !isNaN(num) ? num : null;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Maximum score')
      .setDesc('Only import posts with at most this many upvotes (leave empty for no maximum)')
      .addText(text =>
        text
          .setPlaceholder('No maximum')
          .setValue(filters.maxScore !== null ? String(filters.maxScore) : '')
          .onChange(async value => {
            const num = parseInt(value);
            filters.maxScore = !isNaN(num) ? num : null;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Minimum upvote ratio')
      .setDesc('Only import posts with at least this upvote ratio (0.0 to 1.0, e.g., 0.9 for 90%)')
      .addText(text =>
        text
          .setPlaceholder('No minimum (e.g., 0.9)')
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
  }

  private displayPostTypeFilters(containerEl: HTMLElement, filters: FilterSettings): void {
    new Setting(containerEl).setName('Post type filtering').setHeading();

    new Setting(containerEl)
      .setName('Include posts')
      .setDesc('Import saved posts')
      .addToggle(toggle =>
        toggle.setValue(filters.includePosts).onChange(async value => {
          filters.includePosts = value;
          await this.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Include comments')
      .setDesc('Import saved comments')
      .addToggle(toggle =>
        toggle.setValue(filters.includeComments).onChange(async value => {
          filters.includeComments = value;
          await this.saveSettings();
        })
      );

    // Post type checkboxes
    const postTypes: Array<{ type: PostType; label: string; desc: string }> = [
      { type: 'text', label: 'Text posts', desc: 'Self posts with text content' },
      { type: 'link', label: 'Link posts', desc: 'Posts linking to external content' },
      { type: 'image', label: 'Image posts', desc: 'Posts with images or GIFs' },
      { type: 'video', label: 'Video posts', desc: 'Posts with videos' },
    ];

    for (const { type, label, desc } of postTypes) {
      new Setting(containerEl)
        .setName(label)
        .setDesc(desc)
        .addToggle(toggle =>
          toggle.setValue(filters.includePostTypes.includes(type)).onChange(async value => {
            if (value) {
              if (!filters.includePostTypes.includes(type)) {
                filters.includePostTypes.push(type);
              }
            } else {
              filters.includePostTypes = filters.includePostTypes.filter(t => t !== type);
            }
            await this.saveSettings();
          })
        );
    }
  }

  private displayDateFilters(containerEl: HTMLElement, filters: FilterSettings): void {
    new Setting(containerEl).setName('Date range filtering').setHeading();

    new Setting(containerEl)
      .setName('Date range')
      .setDesc('Only import posts from a specific time period')
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
      new Setting(containerEl)
        .setName('Start date')
        .setDesc('Only import posts after this date')
        .addText(text =>
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

      new Setting(containerEl)
        .setName('End date')
        .setDesc('Only import posts before this date')
        .addText(text =>
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
  }

  private displayAdvancedFilters(containerEl: HTMLElement, filters: FilterSettings): void {
    new Setting(containerEl).setName('Advanced filters').setHeading();

    // NSFW filter
    new Setting(containerEl)
      .setName('Exclude NSFW content')
      .setDesc('Filter out posts marked as NSFW/18+')
      .addToggle(toggle =>
        toggle.setValue(filters.excludeNsfw).onChange(async value => {
          filters.excludeNsfw = value;
          await this.saveSettings();
        })
      );

    // Author filtering
    new Setting(containerEl)
      .setName('Author filter mode')
      .setDesc('Include only specific authors, or exclude specific authors')
      .addDropdown(dropdown =>
        dropdown
          .addOption('include', 'Include only listed')
          .addOption('exclude', 'Exclude listed')
          .setValue(filters.authorFilterMode)
          .onChange(async (value: FilterMode) => {
            filters.authorFilterMode = value;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Author list')
      .setDesc('Usernames to filter (one per line, without u/)')
      .addTextArea(text => {
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
        text.inputEl.rows = 3;
        text.inputEl.setCssProps({ width: '100%' });
      });

    // Comment count filtering
    new Setting(containerEl)
      .setName('Minimum comment count')
      .setDesc('Only import posts with at least this many comments')
      .addText(text =>
        text
          .setPlaceholder('No minimum')
          .setValue(filters.minCommentCount !== null ? String(filters.minCommentCount) : '')
          .onChange(async value => {
            const num = parseInt(value);
            filters.minCommentCount = !isNaN(num) ? num : null;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Maximum comment count')
      .setDesc('Only import posts with at most this many comments')
      .addText(text =>
        text
          .setPlaceholder('No maximum')
          .setValue(filters.maxCommentCount !== null ? String(filters.maxCommentCount) : '')
          .onChange(async value => {
            const num = parseInt(value);
            filters.maxCommentCount = !isNaN(num) ? num : null;
            await this.saveSettings();
          })
      );

    // Domain filtering
    new Setting(containerEl)
      .setName('Domain filter mode')
      .setDesc('Include only links from specific domains, or exclude them')
      .addDropdown(dropdown =>
        dropdown
          .addOption('include', 'Include only listed')
          .addOption('exclude', 'Exclude listed')
          .setValue(filters.domainFilterMode)
          .onChange(async (value: FilterMode) => {
            filters.domainFilterMode = value;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Domain list')
      .setDesc('Domains to filter for link posts (one per line)')
      .addTextArea(text => {
        text
          .setPlaceholder('youtube.com\ntwitter.com\ngithub.com')
          .setValue(filters.domainList.join('\n'))
          .onChange(async value => {
            filters.domainList = value
              .split('\n')
              .map(s => s.trim())
              .filter(s => s.length > 0);
            await this.saveSettings();
          });
        text.inputEl.rows = 3;
        text.inputEl.setCssProps({ width: '100%' });
      });
  }
}
