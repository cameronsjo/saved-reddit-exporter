import { RedditApiClient } from '../src/api-client';
import { RedditSavedSettings, RedditItem } from '../src/types';
import { requestUrl } from 'obsidian';

// Mock Obsidian modules
jest.mock('obsidian');

// Mock requestUrl implementation
const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

describe('RedditApiClient', () => {
  let mockSettings: RedditSavedSettings;
  let mockEnsureValidToken: jest.Mock;
  let client: RedditApiClient;

  beforeEach(() => {
    mockSettings = {
      clientId: 'test-client',
      clientSecret: 'test-secret',
      accessToken: 'test-token',
      refreshToken: 'refresh-token',
      tokenExpiry: Date.now() + 3600000,
      username: 'testuser',
      fetchLimit: 100,
      outputPath: 'reddit-saved',
      skipExisting: true,
      autoUnsave: false,
      downloadMedia: true,
      downloadImages: true,
      downloadGifs: true,
      downloadVideos: false,
      mediaPath: 'assets/reddit',
      oauthRedirectPort: 8080,
      importedIds: [],
    };

    mockEnsureValidToken = jest.fn().mockResolvedValue(undefined);
    client = new RedditApiClient(mockSettings, mockEnsureValidToken);

    // Reset mocks
    mockRequestUrl.mockReset();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with settings and token function', () => {
      expect(client).toBeDefined();
      expect(client['settings']).toBe(mockSettings);
      expect(client['ensureValidToken']).toBe(mockEnsureValidToken);
    });
  });

  describe('handleRateLimit', () => {
    it('should return delay for low remaining requests', async () => {
      const mockResponse = {
        headers: {
          'x-ratelimit-remaining': '5',
          'x-ratelimit-reset': String(Math.floor((Date.now() + 10000) / 1000)),
        },
      };

      const delay = await client['handleRateLimit'](mockResponse);
      expect(delay).toBeGreaterThan(0);
    });

    it('should return small delay for high remaining requests', async () => {
      const mockResponse = {
        headers: {
          'x-ratelimit-remaining': '100',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000)),
        },
      };

      const delay = await client['handleRateLimit'](mockResponse);
      expect(delay).toBe(100);
    });

    it('should return medium delay for medium remaining requests', async () => {
      const mockResponse = {
        headers: {
          'x-ratelimit-remaining': '25',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000)),
        },
      };

      const delay = await client['handleRateLimit'](mockResponse);
      expect(delay).toBe(500);
    });
  });

  describe('makeRateLimitedRequest', () => {
    it('should make successful request', async () => {
      const mockResponse = {
        json: { data: { children: [] } },
        headers: { 'x-ratelimit-remaining': '100' },
      };
      mockRequestUrl.mockResolvedValue(mockResponse);

      const params = {
        url: 'https://oauth.reddit.com/test',
        method: 'GET' as const,
        headers: { Authorization: 'Bearer test' },
      };

      const result = await client.makeRateLimitedRequest(params);
      expect(result).toBe(mockResponse);
      expect(mockRequestUrl).toHaveBeenCalledWith(params);
    });

    it('should retry on rate limit error', async () => {
      const rateLimitError = {
        status: 429,
        headers: { 'retry-after': '2' },
      };
      const mockResponse = {
        json: { data: { children: [] } },
        headers: { 'x-ratelimit-remaining': '100' },
      };

      mockRequestUrl.mockRejectedValueOnce(rateLimitError).mockResolvedValue(mockResponse);

      const params = {
        url: 'https://oauth.reddit.com/test',
        method: 'GET' as const,
        headers: { Authorization: 'Bearer test' },
      };

      const result = await client.makeRateLimitedRequest(params);
      expect(result).toBe(mockResponse);
      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      const error = new Error('Network error');
      mockRequestUrl.mockRejectedValue(error);

      const params = {
        url: 'https://oauth.reddit.com/test',
        method: 'GET' as const,
        headers: { Authorization: 'Bearer test' },
      };

      await expect(client.makeRateLimitedRequest(params, 2)).rejects.toThrow(
        'Max retries exceeded'
      );
      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchAllSaved', () => {
    it('should fetch saved posts successfully', async () => {
      const mockItems: RedditItem[] = [
        {
          data: {
            id: 'post1',
            name: 't3_post1',
            title: 'Test Post 1',
            author: 'user1',
            subreddit: 'test',
            created_utc: 1234567890,
            permalink: '/r/test/comments/post1',
            score: 100,
            num_comments: 5,
            is_self: false,
            url: 'https://example.com',
          },
        },
      ];

      const mockResponse = {
        json: {
          data: {
            children: mockItems,
            after: null,
          },
        },
        headers: { 'x-ratelimit-remaining': '100' },
      };

      mockRequestUrl.mockResolvedValue(mockResponse);

      const result = await client.fetchAllSaved();
      expect(result).toEqual(mockItems);
      expect(mockEnsureValidToken).toHaveBeenCalled();
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/user/testuser/saved'),
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should handle pagination', async () => {
      const mockItems1: RedditItem[] = [
        {
          data: {
            id: 'post1',
            name: 't3_post1',
            title: 'Test Post 1',
            author: 'user1',
            subreddit: 'test',
            created_utc: 1234567890,
            permalink: '/r/test/comments/post1',
            score: 100,
            num_comments: 5,
            is_self: true,
          },
        },
      ];

      const mockItems2: RedditItem[] = [
        {
          data: {
            id: 'post2',
            name: 't3_post2',
            title: 'Test Post 2',
            author: 'user2',
            subreddit: 'test2',
            created_utc: 1234567891,
            permalink: '/r/test2/comments/post2',
            score: 200,
            num_comments: 10,
            is_self: false,
            url: 'https://example.com/2',
          },
        },
      ];

      mockRequestUrl
        .mockResolvedValueOnce({
          json: {
            data: {
              children: mockItems1,
              after: 'page2',
            },
          },
          headers: { 'x-ratelimit-remaining': '100' },
        })
        .mockResolvedValueOnce({
          json: {
            data: {
              children: mockItems2,
              after: null,
            },
          },
          headers: { 'x-ratelimit-remaining': '99' },
        });

      const result = await client.fetchAllSaved();
      expect(result).toEqual([...mockItems1, ...mockItems2]);
      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    });

    it('should respect fetch limit', async () => {
      mockSettings.fetchLimit = 1;

      const mockItems: RedditItem[] = [
        {
          data: {
            id: 'post1',
            name: 't3_post1',
            title: 'Test Post 1',
            author: 'user1',
            subreddit: 'test',
            created_utc: 1234567890,
            permalink: '/r/test/comments/post1',
            score: 100,
            num_comments: 5,
            is_self: true,
          },
        },
        {
          data: {
            id: 'post2',
            name: 't3_post2',
            title: 'Test Post 2',
            author: 'user2',
            subreddit: 'test2',
            created_utc: 1234567891,
            permalink: '/r/test2/comments/post2',
            score: 200,
            num_comments: 10,
            is_self: true,
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: {
          data: {
            children: mockItems,
            after: null,
          },
        },
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchAllSaved();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockItems[0]);
    });
  });

  describe('unsaveItems', () => {
    it('should unsave items successfully', async () => {
      const mockItems: RedditItem[] = [
        {
          data: {
            id: 'post1',
            name: 't3_post1',
            title: 'Test Post 1',
            author: 'user1',
            subreddit: 'test',
            created_utc: 1234567890,
            permalink: '/r/test/comments/post1',
            score: 100,
            num_comments: 5,
            is_self: true,
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: {},
        headers: { 'x-ratelimit-remaining': '100' },
      });

      await client.unsaveItems(mockItems);

      expect(mockEnsureValidToken).toHaveBeenCalled();
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://oauth.reddit.com/api/unsave',
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
          body: 'id=t3_post1',
        })
      );
    });

    it('should handle unsave errors gracefully', async () => {
      const mockItems: RedditItem[] = [
        {
          data: {
            id: 'post1',
            name: 't3_post1',
            title: 'Test Post 1',
            author: 'user1',
            subreddit: 'test',
            created_utc: 1234567890,
            permalink: '/r/test/comments/post1',
            score: 100,
            num_comments: 5,
            is_self: true,
          },
        },
      ];

      mockRequestUrl.mockRejectedValue(new Error('Unsave failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await client.unsaveItems(mockItems);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to unsave t3_post1'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
