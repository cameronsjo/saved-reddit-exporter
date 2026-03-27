import { Notice, Setting, setIcon } from 'obsidian';
import { CredentialBackup, RedditSavedSettings } from '../types';
import { OBSIDIAN_REDIRECT_URI } from '../constants';

interface SetupTabContext {
  settings: RedditSavedSettings;
  saveSettings: () => Promise<void>;
  redisplay: () => void;
  initiateOAuth: () => Promise<void>;
}

export function renderSetupTab(containerEl: HTMLElement, ctx: SetupTabContext): void {
  const { settings, saveSettings, redisplay, initiateOAuth } = ctx;

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
  mobileDesc.createSpan({ text: '"installed app"' });
  mobileDesc.createSpan({ text: ' \u2022 No secret needed' });
  mobileDesc.createEl('br');
  mobileDesc.createEl('code', { text: OBSIDIAN_REDIRECT_URI });

  // Desktop option
  const desktopOption = optionsGrid.createDiv({ cls: 'settings-platform-option' });
  const desktopLabel = desktopOption.createEl('div', { cls: 'settings-platform-label' });
  setIcon(desktopLabel.createSpan(), 'monitor');
  desktopLabel.createEl('strong', { text: 'Desktop only' });
  const desktopDesc = desktopOption.createEl('div', { cls: 'settings-platform-desc' });
  desktopDesc.createSpan({ text: '"script" app' });
  desktopDesc.createSpan({ text: ' \u2022 Secret required' });
  desktopDesc.createEl('br');
  desktopDesc.createEl('code', { text: `http://localhost:${settings.oauthRedirectPort}` });

  new Setting(containerEl)
    .setName('Client ID')
    .setDesc('Your Reddit app client ID')
    .addText(text =>
      text
        .setPlaceholder('Enter client ID')
        .setValue(settings.clientId)
        .onChange(async value => {
          settings.clientId = value;
          await saveSettings();
        })
    );

  new Setting(containerEl)
    .setName('Client secret')
    .setDesc('Leave empty for mobile/installed app')
    .addText(text =>
      text
        .setPlaceholder('Leave empty for mobile')
        .setValue(settings.clientSecret)
        .onChange(async value => {
          settings.clientSecret = value;
          await saveSettings();
          redisplay();
        })
    );

  // Mode indicator
  const isInstalledApp = !settings.clientSecret?.trim();
  const modeIndicator = containerEl.createDiv({ cls: 'settings-mode-indicator' });
  modeIndicator.addClass(isInstalledApp ? 'mode-mobile' : 'mode-desktop');
  setIcon(modeIndicator.createSpan(), isInstalledApp ? 'smartphone' : 'monitor');
  modeIndicator.createSpan({
    text: isInstalledApp ? 'Mobile Mode \u2014 Works on all platforms' : 'Desktop Mode \u2014 Desktop only',
  });

  // Auth button
  if (settings.username) {
    new Setting(containerEl)
      .setName('Authenticated user')
      .setDesc(`Logged in as: ${settings.username}`)
      .addButton(button =>
        button.setButtonText('Re-authenticate').onClick(async () => {
          await initiateOAuth();
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
            await initiateOAuth();
          })
      );
  }

  // Credential backup
  renderCredentialBackup(containerEl, settings, saveSettings, redisplay);

  // Save location
  new Setting(containerEl).setName('Save location').setHeading();

  new Setting(containerEl)
    .setName('Save folder')
    .setDesc('Where Reddit posts will be saved in your vault')
    .addText(text =>
      text
        .setPlaceholder('Reddit saved')
        .setValue(settings.saveLocation)
        .onChange(async value => {
          settings.saveLocation = value;
          await saveSettings();
        })
    );

  new Setting(containerEl)
    .setName('OAuth redirect port')
    .setDesc('Port for OAuth callback (desktop/script app only)')
    .addText(text =>
      text
        .setPlaceholder('9638')
        .setValue(String(settings.oauthRedirectPort))
        .onChange(async value => {
          const port = parseInt(value);
          if (!isNaN(port) && port > 1000 && port < 65536) {
            settings.oauthRedirectPort = port;
            await saveSettings();
            redisplay();
          }
        })
    );
}

function renderCredentialBackup(
  containerEl: HTMLElement,
  settings: RedditSavedSettings,
  saveSettings: () => Promise<void>,
  redisplay: () => void,
): void {
  if (!settings.clientId && !settings.accessToken) {
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
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      accessToken: settings.accessToken,
      refreshToken: settings.refreshToken,
      tokenExpiry: settings.tokenExpiry,
      username: settings.username,
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

      settings.clientId = backup.clientId;
      settings.clientSecret = backup.clientSecret;
      settings.accessToken = backup.accessToken;
      settings.refreshToken = backup.refreshToken;
      settings.tokenExpiry = backup.tokenExpiry;
      settings.username = backup.username;

      await saveSettings();
      redisplay();
      new Notice(`Credentials restored from ${new Date(backup.createdAt).toLocaleDateString()}`);
    } catch {
      new Notice('Failed to import. Check clipboard contents.');
    }
  });
}
