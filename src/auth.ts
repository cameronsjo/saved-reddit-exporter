import { App, Notice, Modal, TextComponent, requestUrl, RequestUrlParam } from 'obsidian';
import { RedditSavedSettings } from './types';

// Constants
export const REDDIT_OAUTH_SCOPES = 'identity history read';
export const REDDIT_USER_AGENT = 'Obsidian:saved-reddit-exporter:v1.0.0';

export class RedditAuth {
    private app: App;
    private settings: RedditSavedSettings;
    private saveSettings: () => Promise<void>;
    private authorizationInProgress = false;
    private oauthServer: any | null = null;

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

        try {
            // Start OAuth server
            await this.startOAuthServer(state);
            new Notice('Opening Reddit for authorization... Server started on port ' + this.settings.oauthRedirectPort);
            window.open(authUrl);
        } catch (error) {
            console.error('Failed to start OAuth server:', error);
            new Notice(`Failed to start OAuth server: ${error.message}. Falling back to manual entry...`);
            // Fallback to manual code entry
            this.showAuthCodeInput(state);
        }
    }

    private async startOAuthServer(expectedState: string): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // Try to access Node.js http module through require (Electron environment)
                const http = (window as any).require?.('http');
                if (!http) {
                    throw new Error('Node.js http module not available in this environment');
                }

                // Close any existing server
                if (this.oauthServer) {
                    this.oauthServer.close();
                }

                this.oauthServer = http.createServer((req: any, res: any) => {
                    try {
                        const url = new URL(req.url!, `http://localhost:${this.settings.oauthRedirectPort}`);
                        const code = url.searchParams.get('code');
                        const state = url.searchParams.get('state');
                        const error = url.searchParams.get('error');

                        // Send response to browser
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        
                        if (error) {
                            res.end(`
                                <html>
                                    <body>
                                        <h1>Authorization Failed</h1>
                                        <p>Error: ${error}</p>
                                        <p>You can close this window and try again in Obsidian.</p>
                                    </body>
                                </html>
                            `);
                            this.authorizationInProgress = false;
                            this.stopOAuthServer();
                            return;
                        }

                        if (!code || !state) {
                            res.end(`
                                <html>
                                    <body>
                                        <h1>Authorization Error</h1>
                                        <p>Missing authorization code or state parameter.</p>
                                        <p>You can close this window and try again in Obsidian.</p>
                                    </body>
                                </html>
                            `);
                            return;
                        }

                        if (state !== expectedState) {
                            res.end(`
                                <html>
                                    <body>
                                        <h1>Authorization Error</h1>
                                        <p>Invalid state parameter. Possible CSRF attack.</p>
                                        <p>You can close this window and try again in Obsidian.</p>
                                    </body>
                                </html>
                            `);
                            this.authorizationInProgress = false;
                            this.stopOAuthServer();
                            return;
                        }

                        // Success response
                        res.end(`
                            <html>
                                <body>
                                    <h1>Authorization Successful!</h1>
                                    <p>You have successfully authorized the Reddit Saved Posts plugin.</p>
                                    <p>You can close this window and return to Obsidian.</p>
                                    <script>window.close();</script>
                                </body>
                            </html>
                        `);

                        // Process the authorization code
                        this.handleOAuthCallback(code, state, expectedState);
                        
                    } catch (err) {
                        console.error('OAuth server error:', err);
                        res.writeHead(500, { 'Content-Type': 'text/html' });
                        res.end(`
                            <html>
                                <body>
                                    <h1>Server Error</h1>
                                    <p>An error occurred processing the authorization.</p>
                                    <p>You can close this window and try again in Obsidian.</p>
                                </body>
                            </html>
                        `);
                    }
                });

                this.oauthServer.on('error', (err: any) => {
                    if (err.code === 'EADDRINUSE') {
                        reject(new Error(`Port ${this.settings.oauthRedirectPort} is already in use. Try a different port in settings.`));
                    } else {
                        reject(err);
                    }
                });

                this.oauthServer.listen(this.settings.oauthRedirectPort, 'localhost', () => {
                    resolve();
                });

                // Auto-close server after 5 minutes to prevent hanging
                setTimeout(() => {
                    if (this.oauthServer) {
                        this.stopOAuthServer();
                        if (this.authorizationInProgress) {
                            new Notice('OAuth server timed out. Please try authenticating again.');
                            this.authorizationInProgress = false;
                        }
                    }
                }, 5 * 60 * 1000); // 5 minutes

            } catch (error) {
                reject(error);
            }
        });
    }

    private async handleOAuthCallback(code: string, receivedState: string, expectedState: string): Promise<void> {
        try {
            // Debug state comparison
            console.log('State validation:', { receivedState, expectedState, match: receivedState === expectedState });
            
            // Validate state first
            if (receivedState !== expectedState) {
                throw new Error(`Invalid authorization state - possible CSRF attack. Expected: ${expectedState}, Received: ${receivedState}`);
            }
            await this.exchangeCodeForToken(code);
            new Notice('Successfully authenticated with Reddit!');
        } catch (error) {
            console.error('OAuth callback error:', error);
            new Notice(`Failed to authenticate: ${error.message}`);
        } finally {
            this.authorizationInProgress = false;
            this.stopOAuthServer();
        }
    }

    private stopOAuthServer(): void {
        if (this.oauthServer) {
            this.oauthServer.close();
            this.oauthServer = null;
        }
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
        instructions.createEl('p', { text: '1. After approving the Reddit authorization, you\'ll be redirected to a page that cannot load' });
        instructions.createEl('p', { text: '2. Copy the authorization code from the URL in your browser address bar' });
        instructions.createEl('p', { text: '3. The code appears after "code=" in the URL' });
        instructions.createEl('p', { text: '4. Paste it below:' });

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