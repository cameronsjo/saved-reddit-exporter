import { RedditAuth } from '../src/auth';
import { RedditSavedSettings } from '../src/types';
import { App, requestUrl, Notice, Modal, TextComponent, Setting } from 'obsidian';

// Mock Obsidian modules
jest.mock('obsidian');

// Mock requestUrl implementation
const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;
const mockNotice = Notice as jest.MockedClass<typeof Notice>;

describe('RedditAuth', () => {
  let mockOpen: jest.Mock;

  beforeAll(() => {
    // Mock global functions
    mockOpen = jest.fn();
    Object.defineProperty(window, 'open', {
      writable: true,
      value: mockOpen,
    });

    (global as unknown as { btoa: (str: string) => string }).btoa = jest.fn((str: string) =>
      Buffer.from(str).toString('base64')
    );
  });
  let mockApp: App;
  let mockSettings: RedditSavedSettings;
  let mockSaveSettings: jest.Mock;
  let auth: RedditAuth;

  beforeEach(() => {
    mockApp = new App();
    mockSettings = {
      clientId: 'test-client',
      clientSecret: 'test-secret',
      accessToken: '',
      refreshToken: '',
      tokenExpiry: 0,
      username: '',
      fetchLimit: 100,
      saveLocation: 'Reddit Saved',
      skipExisting: true,
      autoUnsave: false,
      downloadImages: true,
      downloadGifs: true,
      downloadVideos: false,
      mediaFolder: 'Attachments',
      oauthRedirectPort: 9638,
      importedIds: [],
      showAdvancedSettings: false,
      organizeBySubreddit: false,
      exportPostComments: false,
      commentUpvoteThreshold: 0,
    };

    mockSaveSettings = jest.fn().mockResolvedValue(undefined);
    auth = new RedditAuth(mockApp, mockSettings, mockSaveSettings);

    // Reset mocks
    mockRequestUrl.mockReset();
    mockOpen.mockReset();
    mockSaveSettings.mockReset();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with app, settings, and save function', () => {
      expect(auth).toBeDefined();
      expect(auth['app']).toBe(mockApp);
      expect(auth['settings']).toBe(mockSettings);
      expect(auth['saveSettings']).toBe(mockSaveSettings);
      expect(auth['authorizationInProgress']).toBe(false);
    });
  });

  describe('initiateOAuth', () => {
    it('should prevent multiple authorization attempts', async () => {
      auth['authorizationInProgress'] = true;

      await auth.initiateOAuth();

      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('should require client credentials', async () => {
      mockSettings.clientId = '';
      mockSettings.clientSecret = '';

      await auth.initiateOAuth();

      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('should fallback to manual entry when server fails', async () => {
      // Mock window.require to return null (no Node.js environment)
      Object.defineProperty(window, 'require', {
        writable: true,
        value: null,
      });

      const showAuthCodeInputSpy = jest.spyOn(
        auth as unknown as { showAuthCodeInput: (state: string) => void },
        'showAuthCodeInput'
      );
      showAuthCodeInputSpy.mockImplementation(() => {});

      await auth.initiateOAuth();

      expect(showAuthCodeInputSpy).toHaveBeenCalled();
      showAuthCodeInputSpy.mockRestore();
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for tokens successfully', async () => {
      const mockResponse = {
        json: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      };

      mockRequestUrl.mockResolvedValue(mockResponse);

      await auth['exchangeCodeForToken']('auth-code');

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://www.reddit.com/api/v1/access_token',
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
          body: expect.stringContaining('grant_type=authorization_code'),
        })
      );

      expect(mockSettings.accessToken).toBe('new-access-token');
      expect(mockSettings.refreshToken).toBe('new-refresh-token');
      expect(mockSettings.tokenExpiry).toBeGreaterThan(Date.now());
      expect(mockSaveSettings).toHaveBeenCalled();
    });

    it('should handle token exchange errors', async () => {
      const mockResponse = {
        json: {
          error: 'invalid_grant',
        },
      };

      mockRequestUrl.mockResolvedValue(mockResponse);

      await expect(auth['exchangeCodeForToken']('invalid-code')).rejects.toThrow('invalid_grant');
    });
  });

  describe('refreshAccessToken', () => {
    beforeEach(() => {
      mockSettings.refreshToken = 'valid-refresh-token';
    });

    it('should refresh access token successfully', async () => {
      const mockResponse = {
        json: {
          access_token: 'new-access-token',
          expires_in: 3600,
        },
      };

      mockRequestUrl.mockResolvedValue(mockResponse);

      await auth.refreshAccessToken();

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://www.reddit.com/api/v1/access_token',
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
          body: expect.stringContaining('grant_type=refresh_token'),
        })
      );

      expect(mockSettings.accessToken).toBe('new-access-token');
      expect(mockSettings.tokenExpiry).toBeGreaterThan(Date.now());
      expect(mockSaveSettings).toHaveBeenCalled();
    });

    it('should throw error when no refresh token available', async () => {
      mockSettings.refreshToken = '';

      await expect(auth.refreshAccessToken()).rejects.toThrow(
        'No refresh token available. Please authenticate first.'
      );
    });

    it('should handle refresh token errors', async () => {
      const mockResponse = {
        json: {
          error: 'invalid_grant',
        },
      };

      mockRequestUrl.mockResolvedValue(mockResponse);

      await expect(auth.refreshAccessToken()).rejects.toThrow('invalid_grant');
    });
  });

  describe('ensureValidToken', () => {
    it('should refresh token when expired', async () => {
      mockSettings.accessToken = 'expired-token';
      mockSettings.tokenExpiry = Date.now() - 1000; // Expired
      mockSettings.refreshToken = 'valid-refresh-token';

      const mockResponse = {
        json: {
          access_token: 'new-access-token',
          expires_in: 3600,
        },
      };

      mockRequestUrl.mockResolvedValue(mockResponse);

      await auth.ensureValidToken();

      expect(mockRequestUrl).toHaveBeenCalled();
      expect(mockSettings.accessToken).toBe('new-access-token');
    });

    it('should not refresh valid token', async () => {
      mockSettings.accessToken = 'valid-token';
      mockSettings.tokenExpiry = Date.now() + 3600000; // Valid for 1 hour

      await auth.ensureValidToken();

      expect(mockRequestUrl).not.toHaveBeenCalled();
    });

    it('should refresh when no token exists', async () => {
      mockSettings.accessToken = '';
      mockSettings.refreshToken = 'valid-refresh-token';

      const mockResponse = {
        json: {
          access_token: 'new-access-token',
          expires_in: 3600,
        },
      };

      mockRequestUrl.mockResolvedValue(mockResponse);

      await auth.ensureValidToken();

      expect(mockRequestUrl).toHaveBeenCalled();
    });
  });

  describe('fetchUsername', () => {
    it('should fetch and save username', async () => {
      mockSettings.accessToken = 'valid-token';
      mockSettings.tokenExpiry = Date.now() + 3600000;

      const mockResponse = {
        json: {
          name: 'testuser',
        },
      };

      mockRequestUrl.mockResolvedValue(mockResponse);

      await auth['fetchUsername']();

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://oauth.reddit.com/api/v1/me',
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-token',
          }),
        })
      );

      expect(mockSettings.username).toBe('testuser');
      expect(mockSaveSettings).toHaveBeenCalled();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when both tokens exist', () => {
      mockSettings.accessToken = 'access-token';
      mockSettings.refreshToken = 'refresh-token';

      expect(auth.isAuthenticated()).toBe(true);
    });

    it('should return false when access token missing', () => {
      mockSettings.accessToken = '';
      mockSettings.refreshToken = 'refresh-token';

      expect(auth.isAuthenticated()).toBe(false);
    });

    it('should return false when refresh token missing', () => {
      mockSettings.accessToken = 'access-token';
      mockSettings.refreshToken = '';

      expect(auth.isAuthenticated()).toBe(false);
    });

    it('should return false when both tokens missing', () => {
      mockSettings.accessToken = '';
      mockSettings.refreshToken = '';

      expect(auth.isAuthenticated()).toBe(false);
    });
  });

  describe('handleManualAuthCode', () => {
    it('should handle manual auth code successfully', async () => {
      const expectedState = 'test-state';
      (mockSettings as RedditSavedSettings & { oauthState: string }).oauthState = expectedState;

      const mockResponse = {
        json: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      };

      mockRequestUrl.mockResolvedValue(mockResponse);

      await auth['handleManualAuthCode']('auth-code', expectedState);

      expect(mockSettings.accessToken).toBe('new-access-token');
    });

    it('should throw error for invalid state', async () => {
      const expectedState = 'expected-state';
      (mockSettings as RedditSavedSettings & { oauthState: string }).oauthState = 'different-state';

      await expect(auth['handleManualAuthCode']('auth-code', expectedState)).rejects.toThrow(
        'Invalid authorization state'
      );
    });
  });

  describe('stopOAuthServer', () => {
    it('should handle missing server gracefully', () => {
      auth['oauthServer'] = null;

      expect(() => auth['stopOAuthServer']()).not.toThrow();
    });

    it('should close server when it exists', () => {
      const mockServer = { close: jest.fn() };
      auth['oauthServer'] = mockServer;

      auth['stopOAuthServer']();

      expect(mockServer.close).toHaveBeenCalled();
      expect(auth['oauthServer']).toBeNull();
    });

    it('should handle non-object server gracefully', () => {
      auth['oauthServer'] = 'not an object';

      expect(() => auth['stopOAuthServer']()).not.toThrow();
    });

    it('should handle object without close method', () => {
      auth['oauthServer'] = { something: 'else' };

      expect(() => auth['stopOAuthServer']()).not.toThrow();
    });
  });

  describe('handleOAuthCallback', () => {
    it('should successfully handle valid OAuth callback', async () => {
      const code = 'valid-auth-code';
      const state = 'valid-state';

      // Mock token exchange response
      const mockTokenResponse = {
        json: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      };

      // Mock username fetch response
      const mockUserResponse = {
        json: {
          name: 'testuser',
        },
      };

      mockRequestUrl.mockResolvedValueOnce(mockTokenResponse);
      mockRequestUrl.mockResolvedValueOnce(mockUserResponse);

      await auth['handleOAuthCallback'](code, state, state);

      expect(mockSettings.accessToken).toBe('new-access-token');
      expect(mockSettings.refreshToken).toBe('new-refresh-token');
      expect(auth['authorizationInProgress']).toBe(false);
    });

    it('should throw error when state does not match', async () => {
      const code = 'valid-auth-code';
      const receivedState = 'received-state';
      const expectedState = 'expected-state';

      // The method should throw and handle the error internally
      await auth['handleOAuthCallback'](code, receivedState, expectedState);

      // After handling error, authorizationInProgress should be false
      expect(auth['authorizationInProgress']).toBe(false);
    });

    it('should handle token exchange failure gracefully', async () => {
      const code = 'invalid-code';
      const state = 'valid-state';

      mockRequestUrl.mockRejectedValueOnce(new Error('Token exchange failed'));

      await auth['handleOAuthCallback'](code, state, state);

      expect(auth['authorizationInProgress']).toBe(false);
    });

    it('should stop OAuth server after callback regardless of success', async () => {
      const mockServer = { close: jest.fn() };
      auth['oauthServer'] = mockServer;

      const mockTokenResponse = {
        json: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      };

      const mockUserResponse = {
        json: { name: 'testuser' },
      };

      mockRequestUrl.mockResolvedValueOnce(mockTokenResponse);
      mockRequestUrl.mockResolvedValueOnce(mockUserResponse);

      await auth['handleOAuthCallback']('code', 'state', 'state');

      expect(mockServer.close).toHaveBeenCalled();
      expect(auth['oauthServer']).toBeNull();
    });
  });

  describe('startOAuthServer', () => {
    it('should reject when http module is not available', async () => {
      // Ensure window.require returns null (no http module)
      Object.defineProperty(window, 'require', {
        writable: true,
        value: null,
      });

      await expect(auth['startOAuthServer']('test-state')).rejects.toThrow(
        'Node.js http module not available'
      );
    });

    it('should reject when window.require returns undefined for http', async () => {
      Object.defineProperty(window, 'require', {
        writable: true,
        value: () => undefined,
      });

      await expect(auth['startOAuthServer']('test-state')).rejects.toThrow(
        'Node.js http module not available'
      );
    });

    it('should close existing server before creating new one', async () => {
      const mockExistingServer = { close: jest.fn() };
      auth['oauthServer'] = mockExistingServer;

      // Mock a server that errors on listen
      const mockServer = {
        on: jest.fn((_event: string, callback: (err: { code: string }) => void) => {
          if (_event === 'error') {
            callback({ code: 'EADDRINUSE' });
          }
        }),
        listen: jest.fn(),
        close: jest.fn(),
      };

      Object.defineProperty(window, 'require', {
        writable: true,
        value: () => ({
          createServer: () => mockServer,
        }),
      });

      try {
        await auth['startOAuthServer']('test-state');
      } catch {
        // Expected to throw
      }

      expect(mockExistingServer.close).toHaveBeenCalled();
    });

    it('should handle EADDRINUSE error with appropriate message', async () => {
      const mockServer = {
        on: jest.fn((event: string, callback: (err: { code: string }) => void) => {
          if (event === 'error') {
            // Immediately call error callback
            setTimeout(() => callback({ code: 'EADDRINUSE' }), 0);
          }
        }),
        listen: jest.fn(),
        close: jest.fn(),
      };

      Object.defineProperty(window, 'require', {
        writable: true,
        value: () => ({
          createServer: () => mockServer,
        }),
      });

      await expect(auth['startOAuthServer']('test-state')).rejects.toThrow(
        `Port ${mockSettings.oauthRedirectPort} is already in use`
      );
    });

    it('should handle other server errors', async () => {
      const mockServer = {
        on: jest.fn((event: string, callback: (err: { code: string }) => void) => {
          if (event === 'error') {
            setTimeout(() => callback({ code: 'ECONNREFUSED' }), 0);
          }
        }),
        listen: jest.fn(),
        close: jest.fn(),
      };

      Object.defineProperty(window, 'require', {
        writable: true,
        value: () => ({
          createServer: () => mockServer,
        }),
      });

      await expect(auth['startOAuthServer']('test-state')).rejects.toThrow(
        'OAuth server error: ECONNREFUSED'
      );
    });

    it('should resolve when server starts successfully', async () => {
      const mockServer = {
        on: jest.fn(),
        listen: jest.fn((_port: number, _host: string, callback: () => void) => {
          callback();
        }),
        close: jest.fn(),
      };

      Object.defineProperty(window, 'require', {
        writable: true,
        value: () => ({
          createServer: () => mockServer,
        }),
      });

      await expect(auth['startOAuthServer']('test-state')).resolves.toBeUndefined();
      expect(mockServer.listen).toHaveBeenCalledWith(
        mockSettings.oauthRedirectPort,
        'localhost',
        expect.any(Function)
      );
    });

    it('should reject with Error instance for non-Error throws', async () => {
      Object.defineProperty(window, 'require', {
        writable: true,
        value: () => {
          throw 'String error';
        },
      });

      await expect(auth['startOAuthServer']('test-state')).rejects.toThrow('String error');
    });
  });

  describe('initiateOAuth - OAuth server success path', () => {
    it('should open browser and start server successfully', async () => {
      const mockServer = {
        on: jest.fn(),
        listen: jest.fn((_port: number, _host: string, callback: () => void) => {
          callback();
        }),
        close: jest.fn(),
      };

      Object.defineProperty(window, 'require', {
        writable: true,
        value: () => ({
          createServer: () => mockServer,
        }),
      });

      await auth.initiateOAuth();

      expect(mockOpen).toHaveBeenCalled();
      expect(mockSaveSettings).toHaveBeenCalled();
      expect(auth['authorizationInProgress']).toBe(true);
    });

    it('should include correct OAuth parameters in URL', async () => {
      const mockServer = {
        on: jest.fn(),
        listen: jest.fn((_port: number, _host: string, callback: () => void) => {
          callback();
        }),
        close: jest.fn(),
      };

      Object.defineProperty(window, 'require', {
        writable: true,
        value: () => ({
          createServer: () => mockServer,
        }),
      });

      await auth.initiateOAuth();

      expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining('client_id=test-client'));
      expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining('response_type=code'));
      expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining('duration=permanent'));
    });

    it('should require only client ID to fail', async () => {
      mockSettings.clientId = 'test-client';
      mockSettings.clientSecret = '';

      await auth.initiateOAuth();

      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('should require only client secret to fail', async () => {
      mockSettings.clientId = '';
      mockSettings.clientSecret = 'test-secret';

      await auth.initiateOAuth();

      expect(mockOpen).not.toHaveBeenCalled();
    });
  });

  describe('showAuthCodeInput', () => {
    it('should create AuthCodeModal and open it', () => {
      const state = 'test-state';

      // Mock Modal.prototype.open
      const mockModalOpen = jest.fn();
      Modal.prototype.open = mockModalOpen;

      auth['showAuthCodeInput'](state);

      expect(mockModalOpen).toHaveBeenCalled();
    });
  });

  describe('OAuth server request handling', () => {
    let serverCallback: (
      req: { url?: string },
      res: {
        writeHead: jest.Mock;
        end: jest.Mock;
      }
    ) => void;
    let mockRes: { writeHead: jest.Mock; end: jest.Mock };
    const expectedState = 'expected-state';

    beforeEach(() => {
      mockRes = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      // Capture the server callback when createServer is called
      const mockServer = {
        on: jest.fn(),
        listen: jest.fn((_port: number, _host: string, callback: () => void) => {
          callback();
        }),
        close: jest.fn(),
      };

      Object.defineProperty(window, 'require', {
        writable: true,
        value: () => ({
          createServer: (callback: typeof serverCallback) => {
            serverCallback = callback;
            return mockServer;
          },
        }),
      });
    });

    it('should handle error parameter in OAuth callback', async () => {
      await auth['startOAuthServer'](expectedState);

      const mockReq = {
        url: `/?error=access_denied&state=${expectedState}`,
      };

      serverCallback(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('Authorization Failed'));
      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('access_denied'));
    });

    it('should handle missing code parameter', async () => {
      await auth['startOAuthServer'](expectedState);

      const mockReq = {
        url: `/?state=${expectedState}`,
      };

      serverCallback(mockReq, mockRes);

      expect(mockRes.end).toHaveBeenCalledWith(
        expect.stringContaining('Missing authorization code')
      );
    });

    it('should handle missing state parameter', async () => {
      await auth['startOAuthServer'](expectedState);

      const mockReq = {
        url: '/?code=some-code',
      };

      serverCallback(mockReq, mockRes);

      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('Missing authorization'));
    });

    it('should handle state mismatch (CSRF protection)', async () => {
      await auth['startOAuthServer'](expectedState);

      const mockReq = {
        url: '/?code=some-code&state=wrong-state',
      };

      serverCallback(mockReq, mockRes);

      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('Invalid state parameter'));
      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('CSRF'));
    });

    it('should handle successful authorization', async () => {
      // Set up mocks for token exchange
      const mockTokenResponse = {
        json: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      };

      const mockUserResponse = {
        json: { name: 'testuser' },
      };

      mockRequestUrl.mockResolvedValueOnce(mockTokenResponse);
      mockRequestUrl.mockResolvedValueOnce(mockUserResponse);

      await auth['startOAuthServer'](expectedState);

      const mockReq = {
        url: `/?code=valid-code&state=${expectedState}`,
      };

      serverCallback(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('Authorization Successful'));
    });

    it('should handle server request processing error when URL throws', async () => {
      // Create a mock server that captures the callback
      let capturedCallback: typeof serverCallback;
      const mockServer = {
        on: jest.fn(),
        listen: jest.fn((_port: number, _host: string, callback: () => void) => {
          callback();
        }),
        close: jest.fn(),
      };

      Object.defineProperty(window, 'require', {
        writable: true,
        value: () => ({
          createServer: (callback: typeof serverCallback) => {
            capturedCallback = callback;
            return mockServer;
          },
        }),
      });

      await auth['startOAuthServer'](expectedState);

      const badRes = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };

      // Mock URL constructor to throw an error
      const originalURL = global.URL;
      global.URL = jest.fn().mockImplementation(() => {
        throw new Error('URL parse error');
      }) as unknown as typeof URL;

      // This should trigger the catch block
      capturedCallback!({ url: '/?code=test' }, badRes);

      // Restore URL
      global.URL = originalURL;

      expect(badRes.writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'text/html' });
      expect(badRes.end).toHaveBeenCalledWith(expect.stringContaining('Server Error'));
    });
  });

  describe('OAuth timeout handling', () => {
    it('should timeout and close server after OAUTH_TIMEOUT_MS', async () => {
      jest.useFakeTimers();

      const mockServer = {
        on: jest.fn(),
        listen: jest.fn((_port: number, _host: string, callback: () => void) => {
          callback();
        }),
        close: jest.fn(),
      };

      Object.defineProperty(window, 'require', {
        writable: true,
        value: () => ({
          createServer: () => mockServer,
        }),
      });

      await auth['startOAuthServer']('test-state');
      auth['authorizationInProgress'] = true;

      // Fast-forward to just after the timeout (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000 + 100);

      expect(mockServer.close).toHaveBeenCalled();
      expect(auth['authorizationInProgress']).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('ensureValidToken edge cases', () => {
    it('should handle exactly expired token (edge case)', async () => {
      mockSettings.accessToken = 'token';
      mockSettings.tokenExpiry = Date.now(); // Exactly at current time
      mockSettings.refreshToken = 'valid-refresh-token';

      const mockResponse = {
        json: {
          access_token: 'new-access-token',
          expires_in: 3600,
        },
      };

      mockRequestUrl.mockResolvedValue(mockResponse);

      await auth.ensureValidToken();

      expect(mockRequestUrl).toHaveBeenCalled();
    });
  });

  describe('exchangeCodeForToken - edge cases', () => {
    it('should correctly encode redirect URI with special port', async () => {
      mockSettings.oauthRedirectPort = 12345;

      const mockResponse = {
        json: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      };

      // Mock username fetch
      const mockUserResponse = {
        json: { name: 'testuser' },
      };

      mockRequestUrl.mockResolvedValueOnce(mockResponse);
      mockRequestUrl.mockResolvedValueOnce(mockUserResponse);

      await auth['exchangeCodeForToken']('auth-code');

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('redirect_uri=http%3A%2F%2Flocalhost%3A12345'),
        })
      );
    });

    it('should call fetchUsername after successful token exchange', async () => {
      const mockTokenResponse = {
        json: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      };

      const mockUserResponse = {
        json: { name: 'fetcheduser' },
      };

      mockRequestUrl.mockResolvedValueOnce(mockTokenResponse);
      mockRequestUrl.mockResolvedValueOnce(mockUserResponse);

      await auth['exchangeCodeForToken']('auth-code');

      expect(mockSettings.username).toBe('fetcheduser');
    });
  });

  describe('refreshAccessToken - edge cases', () => {
    it('should correctly include refresh token in request body', async () => {
      mockSettings.refreshToken = 'my-special-refresh-token';

      const mockResponse = {
        json: {
          access_token: 'new-access-token',
          expires_in: 3600,
        },
      };

      mockRequestUrl.mockResolvedValue(mockResponse);

      await auth.refreshAccessToken();

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('refresh_token=my-special-refresh-token'),
        })
      );
    });

    it('should update tokenExpiry based on expires_in', async () => {
      mockSettings.refreshToken = 'valid-token';
      const beforeTime = Date.now();

      const mockResponse = {
        json: {
          access_token: 'new-access-token',
          expires_in: 7200, // 2 hours
        },
      };

      mockRequestUrl.mockResolvedValue(mockResponse);

      await auth.refreshAccessToken();

      // Token expiry should be approximately 2 hours from now
      expect(mockSettings.tokenExpiry).toBeGreaterThanOrEqual(beforeTime + 7200 * 1000);
    });
  });

  describe('showAuthCodeInput callback handling', () => {
    it('should call success callback with code and show success notice', async () => {
      // Set up the state in settings
      const expectedState = 'test-state-123';
      (mockSettings as RedditSavedSettings & { oauthState: string }).oauthState = expectedState;

      // Mock token exchange response
      const mockTokenResponse = {
        json: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      };

      // Mock username fetch response
      const mockUserResponse = {
        json: { name: 'testuser' },
      };

      mockRequestUrl.mockResolvedValueOnce(mockTokenResponse);
      mockRequestUrl.mockResolvedValueOnce(mockUserResponse);

      // Track what callback was passed to the modal
      let capturedCallback: ((code: string) => void) | null = null;

      // Mock the Modal class to capture the callbacks
      const originalOpen = Modal.prototype.open;
      Modal.prototype.open = function (this: Modal & { callback?: (code: string) => void }) {
        // The AuthCodeModal stores callbacks in the constructor
        capturedCallback = this.callback ?? null;
      };

      auth['showAuthCodeInput'](expectedState);

      // Invoke the success callback
      if (capturedCallback) {
        capturedCallback('valid-auth-code');
      }

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 20));

      // Verify authentication succeeded
      expect(mockSettings.accessToken).toBe('new-access-token');
      expect(mockSettings.refreshToken).toBe('new-refresh-token');

      Modal.prototype.open = originalOpen;
    });

    it('should invoke cancel callback and show cancelled notice', async () => {
      auth['authorizationInProgress'] = true;

      let capturedCancelCallback: (() => void) | null = null;

      // Mock the Modal class to capture the cancel callback
      const originalOpen = Modal.prototype.open;
      Modal.prototype.open = function (this: Modal & { cancelCallback?: () => void }) {
        capturedCancelCallback = this.cancelCallback ?? null;
      };

      auth['showAuthCodeInput']('test-state');

      // Invoke the cancel callback
      if (capturedCancelCallback) {
        capturedCancelCallback();
      }

      // authorizationInProgress should be reset
      expect(auth['authorizationInProgress']).toBe(false);

      Modal.prototype.open = originalOpen;
    });
  });

  describe('showAuthCodeInput integration', () => {
    it('should reset authorizationInProgress when manual auth fails', async () => {
      const state = 'test-state';
      (mockSettings as RedditSavedSettings & { oauthState: string }).oauthState = 'different-state';
      auth['authorizationInProgress'] = true;

      // Mock Modal to immediately trigger success callback with a code
      const originalOpen = Modal.prototype.open;
      let successCallback: ((code: string) => void) | null = null;

      Modal.prototype.open = function (this: unknown) {
        // Access private callback property through type assertion
        const modal = this as { callback?: (code: string) => void };
        successCallback = modal.callback ?? null;
      };

      auth['showAuthCodeInput'](state);

      // Simulate user entering a code - should fail due to state mismatch
      if (successCallback) {
        successCallback('test-code');
      }

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      // authorizationInProgress should be reset after error
      expect(auth['authorizationInProgress']).toBe(false);

      Modal.prototype.open = originalOpen;
    });

    it('should show error notice when token exchange fails', async () => {
      const state = 'test-state';
      (mockSettings as RedditSavedSettings & { oauthState: string }).oauthState = state;
      auth['authorizationInProgress'] = true;

      // Mock token exchange to fail
      mockRequestUrl.mockRejectedValueOnce(new Error('Network error'));

      let successCallback: ((code: string) => void) | null = null;

      const originalOpen = Modal.prototype.open;
      Modal.prototype.open = function (this: unknown) {
        const modal = this as { callback?: (code: string) => void };
        successCallback = modal.callback ?? null;
      };

      auth['showAuthCodeInput'](state);

      // Simulate user entering a code - should fail due to network error
      if (successCallback) {
        successCallback('test-code');
      }

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 20));

      // authorizationInProgress should be reset after error
      expect(auth['authorizationInProgress']).toBe(false);

      Modal.prototype.open = originalOpen;
    });
  });

  describe('handleManualAuthCode edge cases', () => {
    it('should handle undefined oauthState in settings', async () => {
      // Don't set oauthState in settings - it should be undefined
      delete (mockSettings as RedditSavedSettings & { oauthState?: string }).oauthState;

      await expect(auth['handleManualAuthCode']('auth-code', 'some-state')).rejects.toThrow(
        'Invalid authorization state'
      );
    });
  });
});

// Note: AuthCodeModal UI tests are skipped because they require extensive Obsidian
// component mocking (Setting, TextComponent). The modal's callback and cancel handlers
// are tested through the showAuthCodeInput callback tests above. Coverage for the
// modal's onOpen UI setup (lines 431-493) would require a full Obsidian mock.
