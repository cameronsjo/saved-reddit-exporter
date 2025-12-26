import {
  App,
  Notice,
  Modal,
  Setting,
  TextComponent,
  requestUrl,
  RequestUrlParam,
  Plugin,
  ObsidianProtocolData,
} from 'obsidian';
import { RedditSavedSettings, OAuthAppType } from './types';
import {
  OAUTH_SCOPES,
  OAUTH_DURATION,
  OAUTH_RESPONSE_TYPE,
  OAUTH_TIMEOUT_MS,
  OAUTH_STATE_EXPIRY_MS,
  REDDIT_USER_AGENT,
  REDDIT_OAUTH_AUTHORIZE_URL,
  REDDIT_OAUTH_TOKEN_URL,
  REDDIT_OAUTH_BASE_URL,
  OBSIDIAN_PROTOCOL_ACTION,
  OBSIDIAN_REDIRECT_URI,
  MSG_AUTH_IN_PROGRESS,
  MSG_ENTER_CREDENTIALS,
  MSG_AUTH_SUCCESS,
  MSG_AUTH_CANCELLED,
  MSG_OAUTH_TIMEOUT,
  MSG_MOBILE_AUTH_STARTED,
  MSG_OAUTH_STATE_EXPIRED,
  MSG_OAUTH_STATE_MISMATCH,
  MSG_NO_PENDING_AUTH,
  MSG_MISSING_AUTH_PARAMS,
  CONTENT_TYPE_HTML,
  CONTENT_TYPE_FORM_URLENCODED,
  HEADER_AUTHORIZATION,
  HEADER_CONTENT_TYPE,
  HEADER_USER_AGENT,
} from './constants';
import { escapeHtml } from './utils/html-escape';
import { generateCsrfToken } from './utils/crypto-utils';

export class RedditAuth {
  private app: App;
  private settings: RedditSavedSettings;
  private saveSettings: () => Promise<void>;
  private authorizationInProgress = false;
  private oauthServer: unknown = null;

  constructor(app: App, settings: RedditSavedSettings, saveSettings: () => Promise<void>) {
    this.app = app;
    this.settings = settings;
    this.saveSettings = saveSettings;
  }

  /**
   * Register the Obsidian protocol handler for OAuth callbacks.
   * This enables the installed app flow on all platforms including mobile.
   * Must be called during plugin onload.
   */
  registerProtocolHandler(plugin: Plugin): void {
    plugin.registerObsidianProtocolHandler(
      OBSIDIAN_PROTOCOL_ACTION,
      async (params: ObsidianProtocolData) => {
        await this.handleProtocolCallback(params);
      }
    );
  }

  /**
   * Determine which OAuth flow to use based on settings.
   * If clientSecret is empty/undefined, use installed app flow (works on mobile).
   * If clientSecret is provided, use script app flow (desktop only).
   */
  getOAuthAppType(): OAuthAppType {
    return this.settings.clientSecret?.trim() ? 'script' : 'installed';
  }

  /**
   * Get the appropriate redirect URI based on OAuth app type.
   */
  private getRedirectUri(): string {
    return this.getOAuthAppType() === 'installed'
      ? OBSIDIAN_REDIRECT_URI
      : `http://localhost:${this.settings.oauthRedirectPort}`;
  }

  async initiateOAuth(): Promise<void> {
    if (this.authorizationInProgress) {
      new Notice(MSG_AUTH_IN_PROGRESS);
      return;
    }

    if (!this.settings.clientId) {
      new Notice('Please enter your Client ID in settings first');
      return;
    }

    const appType = this.getOAuthAppType();

    // Script app requires client secret
    if (appType === 'script' && !this.settings.clientSecret) {
      new Notice(MSG_ENTER_CREDENTIALS);
      return;
    }

    this.authorizationInProgress = true;

    const state = generateCsrfToken();
    const redirectUri = this.getRedirectUri();

    const authUrl =
      `${REDDIT_OAUTH_AUTHORIZE_URL}?` +
      `client_id=${this.settings.clientId}` +
      `&response_type=${OAUTH_RESPONSE_TYPE}` +
      `&state=${state}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&duration=${OAUTH_DURATION}` +
      `&scope=${encodeURIComponent(OAUTH_SCOPES)}`;

    if (appType === 'installed') {
      // Installed app flow: use protocol handler (works on mobile)
      await this.initiateInstalledAppFlow(state, authUrl);
    } else {
      // Script app flow: use HTTP server (desktop only)
      await this.initiateScriptAppFlow(state, authUrl);
    }
  }

  /**
   * Installed app OAuth flow using Obsidian protocol handler.
   * Works on all platforms including mobile.
   */
  private async initiateInstalledAppFlow(state: string, authUrl: string): Promise<void> {
    // Store pending state for validation when callback arrives
    this.settings.pendingOAuthState = {
      state,
      timestamp: Date.now(),
      expiresAt: Date.now() + OAUTH_STATE_EXPIRY_MS,
    };
    await this.saveSettings();

    new Notice(MSG_MOBILE_AUTH_STARTED);
    window.open(authUrl);

    // Set up timeout to clean up pending state
    setTimeout(async () => {
      if (this.settings.pendingOAuthState?.state === state) {
        this.settings.pendingOAuthState = undefined;
        await this.saveSettings();
        if (this.authorizationInProgress) {
          new Notice(MSG_OAUTH_STATE_EXPIRED);
          this.authorizationInProgress = false;
        }
      }
    }, OAUTH_STATE_EXPIRY_MS);
  }

  /**
   * Script app OAuth flow using local HTTP server.
   * Desktop only - requires Node.js http module.
   */
  private async initiateScriptAppFlow(state: string, authUrl: string): Promise<void> {
    // Store state for verification (legacy approach)
    const currentData = { ...this.settings };
    (currentData as RedditSavedSettings & { oauthState: string }).oauthState = state;
    await this.saveSettings();

    try {
      // Start OAuth server
      await this.startOAuthServer(state);
      new Notice(
        'Opening Reddit for authorization... Server started on port ' +
          this.settings.oauthRedirectPort
      );
      window.open(authUrl);
    } catch (error) {
      console.error('Failed to start OAuth server:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to start OAuth server: ${errorMessage}. Falling back to manual entry...`);
      // Fallback to manual code entry
      this.showAuthCodeInput(state);
    }
  }

  /**
   * Handle OAuth callback from Obsidian protocol handler.
   * Called when user is redirected back via obsidian://saved-reddit-exporter?code=...&state=...
   */
  private async handleProtocolCallback(params: ObsidianProtocolData): Promise<void> {
    const { code, state, error } = params;

    if (error) {
      new Notice(`Authorization failed: ${error}`);
      this.authorizationInProgress = false;
      return;
    }

    if (!code || !state) {
      new Notice(MSG_MISSING_AUTH_PARAMS);
      this.authorizationInProgress = false;
      return;
    }

    const pending = this.settings.pendingOAuthState;

    if (!pending) {
      new Notice(MSG_NO_PENDING_AUTH);
      return;
    }

    if (Date.now() > pending.expiresAt) {
      new Notice(MSG_OAUTH_STATE_EXPIRED);
      this.settings.pendingOAuthState = undefined;
      await this.saveSettings();
      this.authorizationInProgress = false;
      return;
    }

    if (state !== pending.state) {
      new Notice(MSG_OAUTH_STATE_MISMATCH);
      this.authorizationInProgress = false;
      return;
    }

    try {
      await this.exchangeCodeForToken(code, OBSIDIAN_REDIRECT_URI);
      new Notice(MSG_AUTH_SUCCESS);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to authenticate: ${errorMessage}`);
    } finally {
      this.settings.pendingOAuthState = undefined;
      await this.saveSettings();
      this.authorizationInProgress = false;
    }
  }

  private async startOAuthServer(expectedState: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Try to access Node.js http module through require (Electron environment)
        const http = (window as { require?: (module: string) => unknown }).require?.('http');
        if (!http) {
          throw new Error('Node.js http module not available in this environment');
        }

        // Close any existing server
        if (
          this.oauthServer &&
          typeof this.oauthServer === 'object' &&
          'close' in this.oauthServer
        ) {
          (this.oauthServer as { close: () => void }).close();
        }

        this.oauthServer = (
          http as {
            createServer: (
              callback: (
                req: { url?: string },
                res: {
                  writeHead: (code: number, headers: Record<string, string>) => void;
                  end: (html: string) => void;
                }
              ) => void
            ) => {
              close: () => void;
              on: (event: string, callback: (err: { code: string }) => void) => void;
              listen: (port: number, hostname: string, callback: () => void) => void;
            };
          }
        ).createServer(
          (
            req: { url?: string },
            res: {
              writeHead: (code: number, headers: Record<string, string>) => void;
              end: (html: string) => void;
            }
          ) => {
            try {
              const url = new URL(req.url!, `http://localhost:${this.settings.oauthRedirectPort}`);
              const code = url.searchParams.get('code');
              const state = url.searchParams.get('state');
              const error = url.searchParams.get('error');

              // Send response to browser
              res.writeHead(200, { [HEADER_CONTENT_TYPE]: CONTENT_TYPE_HTML });

              if (error) {
                const escapedError = escapeHtml(error);
                res.end(`
                                <html>
                                    <body>
                                        <h1>Authorization Failed</h1>
                                        <p>Error: ${escapedError}</p>
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
              void this.handleOAuthCallback(code, state, expectedState);
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
          }
        );

        (
          this.oauthServer as {
            on: (event: string, callback: (err: { code: string }) => void) => void;
          }
        ).on('error', (err: { code: string }) => {
          if (err.code === 'EADDRINUSE') {
            reject(
              new Error(
                `Port ${this.settings.oauthRedirectPort} is already in use. Try a different port in settings.`
              )
            );
          } else {
            reject(new Error(`OAuth server error: ${err.code}`));
          }
        });

        (
          this.oauthServer as {
            listen: (port: number, hostname: string, callback: () => void) => void;
          }
        ).listen(this.settings.oauthRedirectPort, 'localhost', () => {
          resolve();
        });

        // Auto-close server after timeout to prevent hanging
        setTimeout(() => {
          if (
            this.oauthServer &&
            typeof this.oauthServer === 'object' &&
            'close' in this.oauthServer
          ) {
            (this.oauthServer as { close: () => void }).close();
            this.oauthServer = null;
            if (this.authorizationInProgress) {
              new Notice(MSG_OAUTH_TIMEOUT);
              this.authorizationInProgress = false;
            }
          }
        }, OAUTH_TIMEOUT_MS);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async handleOAuthCallback(
    code: string,
    receivedState: string,
    expectedState: string
  ): Promise<void> {
    try {
      // Debug state comparison
      console.debug('State validation:', {
        receivedState,
        expectedState,
        match: receivedState === expectedState,
      });

      // Validate state first
      if (receivedState !== expectedState) {
        throw new Error(
          `Invalid authorization state - possible CSRF attack. Expected: ${expectedState}, Received: ${receivedState}`
        );
      }
      await this.exchangeCodeForToken(code);
      new Notice(MSG_AUTH_SUCCESS);
    } catch (error) {
      console.error('OAuth callback error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to authenticate: ${errorMessage}`);
    } finally {
      this.authorizationInProgress = false;
      this.stopOAuthServer();
    }
  }

  private stopOAuthServer(): void {
    if (this.oauthServer && typeof this.oauthServer === 'object' && 'close' in this.oauthServer) {
      (this.oauthServer as { close: () => void }).close();
      this.oauthServer = null;
    }
  }

  private showAuthCodeInput(state: string): void {
    const modal = new AuthCodeModal(
      this.app,
      // Success callback
      (code: string) => {
        void (async () => {
          try {
            await this.handleManualAuthCode(code, state);
            new Notice(MSG_AUTH_SUCCESS);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            new Notice(`Failed to authenticate: ${errorMessage}`);
          } finally {
            this.authorizationInProgress = false;
          }
        })();
      },
      // Cancel callback
      () => {
        this.authorizationInProgress = false;
        new Notice(MSG_AUTH_CANCELLED);
      }
    );
    modal.open();
  }

  private async handleManualAuthCode(code: string, expectedState: string): Promise<void> {
    const currentState = (this.settings as RedditSavedSettings & { oauthState: string }).oauthState;

    if (expectedState !== currentState) {
      throw new Error('Invalid authorization state');
    }

    await this.exchangeCodeForToken(code);
  }

  private async exchangeCodeForToken(code: string, redirectUri?: string): Promise<void> {
    const appType = this.getOAuthAppType();
    const actualRedirectUri = redirectUri ?? this.getRedirectUri();

    // For installed apps, client_secret is empty string
    const secret = appType === 'installed' ? '' : this.settings.clientSecret;
    const auth = btoa(`${this.settings.clientId}:${secret}`);

    const params: RequestUrlParam = {
      url: REDDIT_OAUTH_TOKEN_URL,
      method: 'POST',
      headers: {
        [HEADER_AUTHORIZATION]: `Basic ${auth}`,
        [HEADER_CONTENT_TYPE]: CONTENT_TYPE_FORM_URLENCODED,
      },
      body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(actualRedirectUri)}`,
    };

    const response = await requestUrl(params);

    if (response.json.error) {
      throw new Error(response.json.error);
    }

    this.settings.accessToken = response.json.access_token;
    this.settings.refreshToken = response.json.refresh_token;
    this.settings.tokenExpiry = Date.now() + response.json.expires_in * 1000;

    await this.saveSettings();
    await this.fetchUsername();
  }

  async refreshAccessToken(): Promise<void> {
    if (!this.settings.refreshToken) {
      throw new Error('No refresh token available. Please authenticate first.');
    }

    const appType = this.getOAuthAppType();
    // For installed apps, client_secret is empty string
    const secret = appType === 'installed' ? '' : this.settings.clientSecret;
    const auth = btoa(`${this.settings.clientId}:${secret}`);

    const params: RequestUrlParam = {
      url: REDDIT_OAUTH_TOKEN_URL,
      method: 'POST',
      headers: {
        [HEADER_AUTHORIZATION]: `Basic ${auth}`,
        [HEADER_CONTENT_TYPE]: CONTENT_TYPE_FORM_URLENCODED,
      },
      body: `grant_type=refresh_token&refresh_token=${this.settings.refreshToken}`,
    };

    const response = await requestUrl(params);

    if (response.json.error) {
      throw new Error(response.json.error);
    }

    this.settings.accessToken = response.json.access_token;
    this.settings.tokenExpiry = Date.now() + response.json.expires_in * 1000;

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
      url: `${REDDIT_OAUTH_BASE_URL}/api/v1/me`,
      method: 'GET',
      headers: {
        [HEADER_AUTHORIZATION]: `Bearer ${this.settings.accessToken}`,
        [HEADER_USER_AGENT]: REDDIT_USER_AGENT,
      },
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

    new Setting(contentEl).setName('Reddit authorization').setHeading();

    const instructions = contentEl.createDiv();
    instructions.createEl('p', {
      text: "1. After approving the Reddit authorization, you'll be redirected to a page that cannot load",
    });
    instructions.createEl('p', {
      text: '2. Copy the authorization code from the URL in your browser address bar',
    });
    instructions.createEl('p', { text: '3. The code appears after "code=" in the URL' });
    instructions.createEl('p', { text: '4. Paste it below:' });

    const inputContainer = contentEl.createDiv();
    inputContainer.setCssProps({ margin: '20px 0' });

    inputContainer.createEl('label', { text: 'Authorization code:' });
    this.codeInput = new TextComponent(inputContainer);
    this.codeInput.inputEl.setCssProps({ width: '100%', margin: '10px 0' });
    this.codeInput.inputEl.placeholder = 'Paste authorization code here...';

    const buttonContainer = contentEl.createDiv();
    buttonContainer.setCssProps({
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      marginTop: '20px',
    });

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
    this.codeInput.inputEl.addEventListener('keypress', e => {
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
