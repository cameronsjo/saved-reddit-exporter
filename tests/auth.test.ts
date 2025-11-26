import { RedditAuth } from '../src/auth';
import { RedditSavedSettings } from '../src/types';
import { App, requestUrl } from 'obsidian';

// Mock Obsidian modules
jest.mock('obsidian');

// Mock requestUrl implementation
const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

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
  });
});
