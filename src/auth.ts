import { App, Notice, Modal, TextComponent, requestUrl, RequestUrlParam } from 'obsidian';
import { RedditSavedSettings } from './types';

// Constants
export const REDDIT_OAUTH_SCOPES = 'identity history read';
export const REDDIT_USER_AGENT = 'Obsidian:saved-reddit-posts:v1.0.0';

export class RedditAuth {
    private app: App;
    private settings: RedditSavedSettings;
    private saveSettings: () => Promise<void>;
    private authorizationInProgress = false;

    constructor(app: App, settings: RedditSavedSettings, saveSettings: () => Promise<void>) {
        this.app = app;
        this.settings = settings;
        this.saveSettings = saveSettings;
    }

    async initiateOAuth(): Promise<void> {
        if (this.authorizationInProgress) {
            new Notice('Authorization already in progress');
            return;
        }

        if (!this.settings.clientId || !this.settings.clientSecret) {
            new Notice('Please enter your Client ID and Client Secret in plugin settings first');
            return;
        }

        this.authorizationInProgress = true;

        const state = Math.random().toString(36).substring(2, 15);
        const redirectUri = `http://localhost:${this.settings.oauthRedirectPort}`;

        const authUrl = `https://www.reddit.com/api/v1/authorize?` +
            `client_id=${this.settings.clientId}` +
            `&response_type=code` +
            `&state=${state}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&duration=permanent` +
            `&scope=${encodeURIComponent(REDDIT_OAUTH_SCOPES)}`;

        // Store state for verification
        const currentData = { ...this.settings };
        (currentData as any).oauthState = state;
        await this.saveSettings();

        new Notice('Copy the authorization code from the URL after approving...');
        window.open(authUrl);

        // Show input modal for the user to paste the code
        this.showAuthCodeInput(state);
    }

    private showAuthCodeInput(state: string): void {
        const modal = new AuthCodeModal(this.app, 
            // Success callback
            async (code: string) => {
                try {
                    await this.handleManualAuthCode(code, state);
                    new Notice('Successfully authenticated with Reddit!');
                } catch (error) {
                    new Notice(`Failed to authenticate: ${error.message}`);
                } finally {
                    this.authorizationInProgress = false;
                }
            },
            // Cancel callback
            () => {
                this.authorizationInProgress = false;
                new Notice('Reddit authentication cancelled');
            }
        );
        modal.open();
    }

    private async handleManualAuthCode(code: string, expectedState: string): Promise<void> {
        const currentState = (this.settings as any).oauthState;
        
        if (expectedState !== currentState) {
            throw new Error('Invalid authorization state');
        }

        await this.exchangeCodeForToken(code);
    }

    private async exchangeCodeForToken(code: string): Promise<void> {
        const auth = btoa(`${this.settings.clientId}:${this.settings.clientSecret}`);

        const params: RequestUrlParam = {
            url: 'https://www.reddit.com/api/v1/access_token',
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(`http://localhost:${this.settings.oauthRedirectPort}`)}`
        };

        const response = await requestUrl(params);

        if (response.json.error) {
            throw new Error(response.json.error);
        }

        this.settings.accessToken = response.json.access_token;
        this.settings.refreshToken = response.json.refresh_token;
        this.settings.tokenExpiry = Date.now() + (response.json.expires_in * 1000);

        await this.saveSettings();
        await this.fetchUsername();
    }

    async refreshAccessToken(): Promise<void> {
        if (!this.settings.refreshToken) {
            throw new Error('No refresh token available. Please authenticate first.');
        }

        const auth = btoa(`${this.settings.clientId}:${this.settings.clientSecret}`);

        const params: RequestUrlParam = {
            url: 'https://www.reddit.com/api/v1/access_token',
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `grant_type=refresh_token&refresh_token=${this.settings.refreshToken}`
        };

        const response = await requestUrl(params);

        if (response.json.error) {
            throw new Error(response.json.error);
        }

        this.settings.accessToken = response.json.access_token;
        this.settings.tokenExpiry = Date.now() + (response.json.expires_in * 1000);

        await this.saveSettings();
    }

    async ensureValidToken(): Promise<void> {
        if (!this.settings.accessToken || Date.now() >= this.settings.tokenExpiry) {
            await this.refreshAccessToken();
        }
    }

    private async fetchUsername(): Promise<void> {
        await this.ensureValidToken();

        const params: RequestUrlParam = {
            url: 'https://oauth.reddit.com/api/v1/me',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.settings.accessToken}`,
                'User-Agent': REDDIT_USER_AGENT
            }
        };

        const response = await requestUrl(params);
        this.settings.username = response.json.name;
        await this.saveSettings();
    }

    isAuthenticated(): boolean {
        return !!(this.settings.accessToken && this.settings.refreshToken);
    }
}

class AuthCodeModal extends Modal {
    private callback: (code: string) => void;
    private cancelCallback: () => void;
    private codeInput: TextComponent;
    private wasSubmitted = false;

    constructor(app: App, callback: (code: string) => void, cancelCallback?: () => void) {
        super(app);
        this.callback = callback;
        this.cancelCallback = cancelCallback || (() => {});
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Reddit Authorization' });
        
        const instructions = contentEl.createDiv();
        instructions.innerHTML = `
            <p>1. After approving the Reddit authorization, you'll be redirected to a page that cannot load</p>
            <p>2. Copy the authorization code from the URL in your browser address bar</p>
            <p>3. The code appears after "code=" in the URL</p>
            <p>4. Paste it below:</p>
        `;

        const inputContainer = contentEl.createDiv();
        inputContainer.style.margin = '20px 0';
        
        inputContainer.createEl('label', { text: 'Authorization Code:' });
        this.codeInput = new TextComponent(inputContainer);
        this.codeInput.inputEl.style.width = '100%';
        this.codeInput.inputEl.style.margin = '10px 0';
        this.codeInput.inputEl.placeholder = 'Paste authorization code here...';

        const buttonContainer = contentEl.createDiv();
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginTop = '20px';

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.onclick = () => {
            this.wasSubmitted = true;
            this.cancelCallback();
            this.close();
        };

        const submitButton = buttonContainer.createEl('button', { text: 'Authenticate' });
        submitButton.classList.add('mod-cta');
        submitButton.onclick = () => {
            const code = this.codeInput.getValue().trim();
            if (code) {
                this.wasSubmitted = true;
                this.callback(code);
                this.close();
            } else {
                new Notice('Please enter the authorization code');
            }
        };

        // Focus the input
        this.codeInput.inputEl.focus();
        
        // Allow Enter to submit
        this.codeInput.inputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitButton.click();
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        // Call cancel callback if modal is closed without being submitted
        if (!this.wasSubmitted && this.cancelCallback) {
            this.cancelCallback();
        }
    }
}