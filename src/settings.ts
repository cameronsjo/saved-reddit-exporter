import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { RedditSavedSettings } from './types';

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
  }
}
