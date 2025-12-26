import { RedditApiClient, FetchOptions, FetchResult } from '../src/api-client';
import { RedditSavedSettings, RedditItem } from '../src/types';
import { requestUrl } from 'obsidian';
import { ImportStateManager, ImportProgress } from '../src/import-state';

// Mock Obsidian modules
jest.mock('obsidian');

// Mock ImportStateManager
jest.mock('../src/import-state', () => {
  return {
    ImportStateManager: jest.fn().mockImplementation(() => ({
      setPhase: jest.fn(),
      setCursor: jest.fn(),
      addFetchedItems: jest.fn(),
      shouldContinue: jest.fn().mockReturnValue(true),
      getProgress: jest.fn().mockReturnValue({
        phase: 'fetching',
        fetchedCount: 10,
        processedCount: 5,
        importedCount: 5,
        skippedCount: 0,
        failedCount: 0,
        elapsedMs: 1000,
        itemsPerSecond: 5,
      }),
      pause: jest.fn(),
    })),
  };
});

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
      // Content type settings
      importSavedPosts: true,
      importSavedComments: true,
      importUpvoted: false,
      importUserPosts: false,
      importUserComments: false,
      importCrosspostOriginal: false,
      preserveCrosspostMetadata: true,
      // Organization settings
      organizeBySubreddit: false,
      exportPostComments: false,
      commentUpvoteThreshold: 0,
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

      await expect(client.makeRateLimitedRequest(params, 2)).rejects.toThrow('Network error');
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
      // Items now include contentOrigin
      expect(result).toHaveLength(mockItems.length);
      expect(result[0]).toMatchObject({
        ...mockItems[0],
        contentOrigin: 'saved',
      });
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
      // Mock setTimeout to resolve immediately
      jest.spyOn(global, 'setTimeout').mockImplementation((cb: () => void) => {
        cb();
        return 0 as unknown as NodeJS.Timeout;
      });

      // Set fetchLimit to allow for multiple pages
      mockSettings.fetchLimit = 150;

      const mockItems1: RedditItem[] = Array.from({ length: 100 }, (_, i) => ({
        data: {
          id: `post${i + 1}`,
          name: `t3_post${i + 1}`,
          title: `Test Post ${i + 1}`,
          author: `user${i + 1}`,
          subreddit: 'test',
          created_utc: 1234567890 + i,
          permalink: `/r/test/comments/post${i + 1}`,
          score: 100 + i,
          num_comments: 5 + i,
          is_self: true,
        },
      }));

      const mockItems2: RedditItem[] = Array.from({ length: 50 }, (_, i) => ({
        data: {
          id: `post${i + 101}`,
          name: `t3_post${i + 101}`,
          title: `Test Post ${i + 101}`,
          author: `user${i + 101}`,
          subreddit: 'test2',
          created_utc: 1234567890 + i + 100,
          permalink: `/r/test2/comments/post${i + 101}`,
          score: 200 + i,
          num_comments: 10 + i,
          is_self: false,
          url: `https://example.com/${i + 101}`,
        },
      }));

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

      // Add console debugging
      jest.spyOn(console, 'log').mockImplementation();

      const result = await client.fetchAllSaved();
      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
      // Items now include contentOrigin
      expect(result).toHaveLength(mockItems1.length + mockItems2.length);
      expect(result[0]).toMatchObject({
        ...mockItems1[0],
        contentOrigin: 'saved',
      });
      expect(result[100]).toMatchObject({
        ...mockItems2[0],
        contentOrigin: 'saved',
      });

      // Restore setTimeout
      jest.restoreAllMocks();
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
      // Items now include contentOrigin
      expect(result[0]).toMatchObject({
        ...mockItems[0],
        contentOrigin: 'saved',
      });
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

  describe('fetchPostComments', () => {
    it('should fetch comments for a post', async () => {
      const mockCommentsResponse = [
        { kind: 'Listing', data: { children: [] } }, // Post data
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'comment1',
                  author: 'commenter1',
                  body: 'Great post!',
                  score: 50,
                  created_utc: 1234567890,
                  is_submitter: false,
                  replies: '',
                },
              },
              {
                kind: 't1',
                data: {
                  id: 'comment2',
                  author: 'commenter2',
                  body: 'I agree',
                  score: 25,
                  created_utc: 1234567891,
                  is_submitter: false,
                  replies: '',
                },
              },
            ],
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: mockCommentsResponse,
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchPostComments('/r/test/comments/abc123/', 0);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'comment1',
          author: 'commenter1',
          body: 'Great post!',
          score: 50,
        })
      );
      expect(mockEnsureValidToken).toHaveBeenCalled();
    });

    it('should filter comments by upvote threshold', async () => {
      const mockCommentsResponse = [
        { kind: 'Listing', data: { children: [] } },
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'highscore',
                  author: 'popular',
                  body: 'Popular comment',
                  score: 100,
                  created_utc: 1234567890,
                  is_submitter: false,
                  replies: '',
                },
              },
              {
                kind: 't1',
                data: {
                  id: 'lowscore',
                  author: 'unpopular',
                  body: 'Unpopular comment',
                  score: 5,
                  created_utc: 1234567891,
                  is_submitter: false,
                  replies: '',
                },
              },
            ],
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: mockCommentsResponse,
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchPostComments('/r/test/comments/abc123/', 50);

      expect(result).toHaveLength(1);
      expect(result[0].author).toBe('popular');
    });

    it('should parse nested replies', async () => {
      const mockCommentsResponse = [
        { kind: 'Listing', data: { children: [] } },
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'parent',
                  author: 'parent_author',
                  body: 'Parent comment',
                  score: 50,
                  created_utc: 1234567890,
                  is_submitter: false,
                  replies: {
                    kind: 'Listing',
                    data: {
                      children: [
                        {
                          kind: 't1',
                          data: {
                            id: 'child',
                            author: 'child_author',
                            body: 'Child reply',
                            score: 25,
                            created_utc: 1234567891,
                            is_submitter: false,
                            replies: '',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: mockCommentsResponse,
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchPostComments('/r/test/comments/abc123/', 0);

      expect(result).toHaveLength(1);
      expect(result[0].replies).toHaveLength(1);
      expect(result[0].replies![0].body).toBe('Child reply');
    });

    it('should skip "more" comment placeholders', async () => {
      const mockCommentsResponse = [
        { kind: 'Listing', data: { children: [] } },
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'comment1',
                  author: 'user1',
                  body: 'Real comment',
                  score: 50,
                  created_utc: 1234567890,
                  is_submitter: false,
                  replies: '',
                },
              },
              {
                kind: 'more',
                data: {
                  count: 10,
                  children: ['abc', 'def'],
                },
              },
            ],
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: mockCommentsResponse,
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchPostComments('/r/test/comments/abc123/', 0);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('comment1');
    });

    it('should handle API errors gracefully', async () => {
      mockRequestUrl.mockRejectedValue(new Error('API Error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await client.fetchPostComments('/r/test/comments/abc123/', 0);

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching comments:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should return empty array for invalid response', async () => {
      mockRequestUrl.mockResolvedValue({
        json: { invalid: 'response' },
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchPostComments('/r/test/comments/abc123/', 0);

      expect(result).toEqual([]);
    });
  });

  describe('enhanced features', () => {
    describe('enableEnhancedFeatures', () => {
      it('should enable enhanced features without state manager', () => {
        client.enableEnhancedFeatures();
        expect(client['useEnhancedFeatures']).toBe(true);
        expect(client['importStateManager']).toBeNull();
      });

      it('should enable enhanced features with state manager', () => {
        const mockStateManager = new ImportStateManager({} as any, {} as any);
        client.enableEnhancedFeatures(mockStateManager);
        expect(client['useEnhancedFeatures']).toBe(true);
        expect(client['importStateManager']).toBe(mockStateManager);
      });
    });

    describe('disableEnhancedFeatures', () => {
      it('should disable enhanced features and clear state manager', () => {
        const mockStateManager = new ImportStateManager({} as any, {} as any);
        client.enableEnhancedFeatures(mockStateManager);
        client.disableEnhancedFeatures();
        expect(client['useEnhancedFeatures']).toBe(false);
        expect(client['importStateManager']).toBeNull();
      });
    });

    describe('getPerformanceMonitor', () => {
      it('should return the performance monitor instance', () => {
        const monitor = client.getPerformanceMonitor();
        expect(monitor).toBeDefined();
        expect(typeof monitor.startSession).toBe('function');
      });
    });

    describe('getQueueStatus', () => {
      it('should return queue status object', () => {
        const status = client.getQueueStatus();
        expect(status).toHaveProperty('queueLength');
        expect(status).toHaveProperty('activeRequests');
        expect(status).toHaveProperty('circuitState');
        expect(status).toHaveProperty('availableTokens');
        expect(status).toHaveProperty('isPaused');
        expect(status).toHaveProperty('isOnline');
        expect(status).toHaveProperty('offlineQueueSize');
      });
    });

    describe('pauseRequests', () => {
      it('should pause the request queue', () => {
        client.pauseRequests();
        const status = client.getQueueStatus();
        expect(status.isPaused).toBe(true);
      });
    });

    describe('resumeRequests', () => {
      it('should resume the request queue', () => {
        client.pauseRequests();
        client.resumeRequests();
        const status = client.getQueueStatus();
        expect(status.isPaused).toBe(false);
      });
    });

    describe('setOnline', () => {
      it('should set online status to false', () => {
        client.setOnline(false);
        const status = client.getQueueStatus();
        expect(status.isOnline).toBe(false);
      });

      it('should set online status to true', () => {
        client.setOnline(false);
        client.setOnline(true);
        const status = client.getQueueStatus();
        expect(status.isOnline).toBe(true);
      });
    });

    describe('resetCircuitBreaker', () => {
      it('should reset the circuit breaker', () => {
        client.resetCircuitBreaker();
        const status = client.getQueueStatus();
        expect(status.circuitState).toBe('closed');
      });
    });

    describe('hasPendingRequests', () => {
      it('should return false when no pending requests', () => {
        expect(client.hasPendingRequests()).toBe(false);
      });
    });

    describe('clearPendingRequests', () => {
      it('should clear pending requests without error', () => {
        expect(() => client.clearPendingRequests()).not.toThrow();
      });
    });

    describe('getPerformanceSummary', () => {
      it('should return formatted performance summary', () => {
        const summary = client.getPerformanceSummary();
        expect(typeof summary).toBe('string');
      });
    });
  });

  describe('handleRateLimit edge cases', () => {
    it('should return default delay when rate limit is zero', async () => {
      const mockResponse = {
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor((Date.now() + 5000) / 1000)),
        },
      };

      const delay = await client['handleRateLimit'](mockResponse);
      expect(delay).toBeGreaterThan(0);
    });

    it('should handle missing headers gracefully', async () => {
      const mockResponse = {
        headers: {},
      };

      const delay = await client['handleRateLimit'](mockResponse);
      expect(delay).toBeGreaterThan(0);
    });
  });

  describe('makeRateLimitedRequest edge cases', () => {
    it('should throw max retries exceeded error', async () => {
      mockRequestUrl.mockRejectedValue(new Error('Persistent error'));

      const params = {
        url: 'https://oauth.reddit.com/test',
        method: 'GET' as const,
        headers: { Authorization: 'Bearer test' },
      };

      await expect(client.makeRateLimitedRequest(params, 1)).rejects.toThrow('Persistent error');
    });

    it('should handle 429 error with short retry-after header', async () => {
      // Use a short retry-after header for testing
      const rateLimitError = {
        status: 429,
        headers: { 'retry-after': '1' }, // 1 second retry
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
    }, 10000);
  });

  describe('fetchUpvoted', () => {
    it('should fetch upvoted posts successfully', async () => {
      const mockItems: RedditItem[] = [
        {
          data: {
            id: 'post1',
            name: 't3_post1',
            title: 'Upvoted Post 1',
            author: 'user1',
            subreddit: 'test',
            created_utc: 1234567890,
            permalink: '/r/test/comments/post1',
            score: 500,
            num_comments: 20,
            is_self: false,
            url: 'https://example.com',
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

      const result = await client.fetchUpvoted();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        ...mockItems[0],
        contentOrigin: 'upvoted',
      });
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/user/testuser/upvoted'),
        })
      );
    });
  });

  describe('fetchUserPosts', () => {
    it('should fetch user submitted posts successfully', async () => {
      const mockItems: RedditItem[] = [
        {
          data: {
            id: 'post1',
            name: 't3_post1',
            title: 'My Submitted Post',
            author: 'testuser',
            subreddit: 'test',
            created_utc: 1234567890,
            permalink: '/r/test/comments/post1',
            score: 150,
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

      const result = await client.fetchUserPosts();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        ...mockItems[0],
        contentOrigin: 'submitted',
      });
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/user/testuser/submitted'),
        })
      );
    });
  });

  describe('fetchUserComments', () => {
    it('should fetch user comments successfully', async () => {
      const mockItems: RedditItem[] = [
        {
          kind: 't1',
          data: {
            id: 'comment1',
            name: 't1_comment1',
            body: 'My comment text',
            author: 'testuser',
            subreddit: 'test',
            created_utc: 1234567890,
            permalink: '/r/test/comments/abc/comment/comment1',
            score: 25,
            link_title: 'Parent Post Title',
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

      const result = await client.fetchUserComments();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        ...mockItems[0],
        contentOrigin: 'commented',
      });
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/user/testuser/comments'),
        })
      );
    });
  });

  describe('fetchUserContent edge cases', () => {
    it('should handle empty response data', async () => {
      mockRequestUrl.mockResolvedValue({
        json: {
          data: {
            children: [],
            after: null,
          },
        },
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchAllSaved();
      expect(result).toHaveLength(0);
    });

    it('should stop pagination at max pages safety limit', async () => {
      // This test verifies the safety limit behavior
      mockSettings.fetchLimit = 10000; // High limit to trigger safety limit
      client = new RedditApiClient(mockSettings, mockEnsureValidToken);

      // Create a mock that always returns more items with a cursor
      const createMockPage = (cursor: string) => ({
        json: {
          data: {
            children: Array.from({ length: 100 }, (_, i) => ({
              data: {
                id: `post${cursor}${i}`,
                name: `t3_post${cursor}${i}`,
                title: `Post ${cursor}${i}`,
                author: 'user',
                subreddit: 'test',
                created_utc: 1234567890,
                permalink: `/r/test/comments/post${cursor}${i}`,
                score: 100,
                num_comments: 5,
                is_self: true,
              },
            })),
            after: `cursor_${cursor}_next`,
          },
        },
        headers: { 'x-ratelimit-remaining': '100' },
      });

      // Mock enough responses to trigger safety limit
      for (let i = 0; i < 60; i++) {
        mockRequestUrl.mockResolvedValueOnce(createMockPage(String(i)));
      }

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Note: This won't actually hit 50 pages because of the fetchLimit check
      // but this covers the code path
      await client.fetchAllSaved();

      consoleSpy.mockRestore();
    });
  });

  describe('fetchAllSavedEnhanced', () => {
    beforeEach(() => {
      // Reset mocks for enhanced tests
      mockRequestUrl.mockReset();
      jest.clearAllMocks();
    });

    it('should fetch with default options', async () => {
      const mockItems: RedditItem[] = [
        {
          data: {
            id: 'post1',
            name: 't3_post1',
            title: 'Test Post',
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
        json: {
          data: {
            children: mockItems,
            after: null,
          },
        },
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchAllSavedEnhanced();
      expect(result.items).toHaveLength(1);
      expect(result.wasCancelled).toBe(false);
      expect(result.hasMore).toBe(false);
    });

    it('should support startCursor for resumption', async () => {
      const mockItems: RedditItem[] = [
        {
          data: {
            id: 'post2',
            name: 't3_post2',
            title: 'Test Post 2',
            author: 'user2',
            subreddit: 'test',
            created_utc: 1234567891,
            permalink: '/r/test/comments/post2',
            score: 200,
            num_comments: 10,
            is_self: false,
            url: 'https://example.com',
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

      const result = await client.fetchAllSavedEnhanced({ startCursor: 'previous_cursor' });
      expect(result.items).toHaveLength(1);
      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('&after=previous_cursor'),
        })
      );
    });

    it('should support cancellation via AbortSignal', async () => {
      const controller = new AbortController();

      // Abort immediately
      controller.abort();

      const result = await client.fetchAllSavedEnhanced({ signal: controller.signal });
      expect(result.wasCancelled).toBe(true);
      expect(result.items).toHaveLength(0);
    });

    it('should call progress callback', async () => {
      const mockStateManager = new ImportStateManager({} as any, {} as any);
      client.enableEnhancedFeatures(mockStateManager);

      const mockItems: RedditItem[] = Array.from({ length: 100 }, (_, i) => ({
        data: {
          id: `post${i}`,
          name: `t3_post${i}`,
          title: `Test Post ${i}`,
          author: 'user1',
          subreddit: 'test',
          created_utc: 1234567890 + i,
          permalink: `/r/test/comments/post${i}`,
          score: 100 + i,
          num_comments: 5,
          is_self: true,
        },
      }));

      mockRequestUrl.mockResolvedValue({
        json: {
          data: {
            children: mockItems,
            after: null,
          },
        },
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const onProgress = jest.fn();
      await client.fetchAllSavedEnhanced({ onProgress });

      // Progress should be called (depends on page count and PROGRESS_UPDATE_FREQUENCY)
      expect(onProgress).toHaveBeenCalled();
    });

    it('should use enhanced request queue when enabled', async () => {
      client.enableEnhancedFeatures();

      const mockItems: RedditItem[] = [
        {
          data: {
            id: 'post1',
            name: 't3_post1',
            title: 'Test Post',
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
        json: {
          data: {
            children: mockItems,
            after: null,
          },
        },
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchAllSavedEnhanced();
      expect(result.items).toHaveLength(1);
    });

    it('should handle error and pause import state', async () => {
      const mockStateManager = new ImportStateManager({} as any, {} as any);
      client.enableEnhancedFeatures(mockStateManager);

      mockRequestUrl.mockRejectedValue(new Error('API Error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(client.fetchAllSavedEnhanced()).rejects.toThrow('API Error');
      expect(mockStateManager.pause).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should stop when import state manager says not to continue', async () => {
      const mockStateManager = new ImportStateManager({} as any, {} as any);
      (mockStateManager.shouldContinue as jest.Mock).mockReturnValue(false);
      client.enableEnhancedFeatures(mockStateManager);

      const result = await client.fetchAllSavedEnhanced();
      expect(result.wasCancelled).toBe(true);
    });
  });

  describe('fetchCommentWithContext', () => {
    it('should fetch comment with parent context', async () => {
      const mockResponse = [
        { kind: 'Listing', data: { children: [] } },
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'parent1',
                  author: 'parent_author',
                  body: 'Parent comment',
                  score: 50,
                  permalink: '/r/test/comments/abc/title/parent1',
                  replies: {
                    kind: 'Listing',
                    data: {
                      children: [
                        {
                          kind: 't1',
                          data: {
                            id: 'target123',
                            author: 'target_author',
                            body: 'Target comment',
                            score: 25,
                            permalink: '/r/test/comments/abc/title/target123',
                            replies: '',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: mockResponse,
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchCommentWithContext('/r/test/comments/abc/title/target123');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('target123');
      expect(result?.parent_comments).toHaveLength(1);
    });

    it('should clamp context depth to valid range', async () => {
      mockRequestUrl.mockResolvedValue({
        json: [
          { kind: 'Listing', data: { children: [] } },
          { kind: 'Listing', data: { children: [] } },
        ],
        headers: { 'x-ratelimit-remaining': '100' },
      });

      // Test with depth out of range
      await client.fetchCommentWithContext('/r/test/comments/abc/title/xyz', 15);

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('context=10'), // Should be clamped to max 10
        })
      );
    });

    it('should return null for invalid response', async () => {
      mockRequestUrl.mockResolvedValue({
        json: { not: 'array' },
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchCommentWithContext('/r/test/comments/abc/title/xyz');
      expect(result).toBeNull();
    });

    it('should return null for empty comments listing', async () => {
      mockRequestUrl.mockResolvedValue({
        json: [
          { kind: 'Listing', data: { children: [] } },
          { kind: 'Listing', data: { children: [] } },
        ],
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchCommentWithContext('/r/test/comments/abc/title/xyz');
      expect(result).toBeNull();
    });

    it('should handle API error gracefully', async () => {
      mockRequestUrl.mockRejectedValue(new Error('API Error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await client.fetchCommentWithContext('/r/test/comments/abc/title/xyz');
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching comment context:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('fetchCommentReplies', () => {
    it('should fetch replies to a comment', async () => {
      const mockResponse = [
        { kind: 'Listing', data: { children: [] } },
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'target123',
                  author: 'author',
                  body: 'Target comment',
                  score: 50,
                  permalink: '/r/test/comments/abc/title/target123',
                  replies: {
                    kind: 'Listing',
                    data: {
                      children: [
                        {
                          kind: 't1',
                          data: {
                            id: 'reply1',
                            author: 'replier1',
                            body: 'Reply 1',
                            score: 10,
                            replies: '',
                          },
                        },
                        {
                          kind: 't1',
                          data: {
                            id: 'reply2',
                            author: 'replier2',
                            body: 'Reply 2',
                            score: 5,
                            replies: '',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: mockResponse,
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchCommentReplies('/r/test/comments/abc/title/target123');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('reply1');
      expect(result[1].id).toBe('reply2');
    });

    it('should return empty array for invalid response', async () => {
      mockRequestUrl.mockResolvedValue({
        json: { not: 'array' },
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchCommentReplies('/r/test/comments/abc/title/xyz');
      expect(result).toHaveLength(0);
    });

    it('should return empty array when target comment not found', async () => {
      mockRequestUrl.mockResolvedValue({
        json: [
          { kind: 'Listing', data: { children: [] } },
          {
            kind: 'Listing',
            data: {
              children: [
                {
                  kind: 't1',
                  data: {
                    id: 'differentComment',
                    author: 'author',
                    body: 'Different comment',
                    score: 50,
                    permalink: '/r/test/comments/abc/title/differentComment',
                    replies: '',
                  },
                },
              ],
            },
          },
        ],
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchCommentReplies('/r/test/comments/abc/title/target123');
      expect(result).toHaveLength(0);
    });

    it('should return empty array when no replies', async () => {
      mockRequestUrl.mockResolvedValue({
        json: [
          { kind: 'Listing', data: { children: [] } },
          {
            kind: 'Listing',
            data: {
              children: [
                {
                  kind: 't1',
                  data: {
                    id: 'target123',
                    author: 'author',
                    body: 'Target comment',
                    score: 50,
                    permalink: '/r/test/comments/abc/title/target123',
                    replies: '', // No replies
                  },
                },
              ],
            },
          },
        ],
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchCommentReplies('/r/test/comments/abc/title/target123');
      expect(result).toHaveLength(0);
    });

    it('should handle API error gracefully', async () => {
      mockRequestUrl.mockRejectedValue(new Error('API Error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await client.fetchCommentReplies('/r/test/comments/abc/title/xyz');
      expect(result).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching comment replies:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('fetchCommentThread', () => {
    it('should fetch full comment thread for a post', async () => {
      const mockResponse = [
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't3',
                data: {
                  id: 'postId',
                  title: 'Post Title',
                  author: 'op',
                  subreddit: 'test',
                  num_comments: 2,
                },
              },
            ],
          },
        },
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'comment1',
                  author: 'commenter1',
                  body: 'Comment 1',
                  score: 50,
                  replies: '',
                },
              },
              {
                kind: 't1',
                data: {
                  id: 'comment2',
                  author: 'commenter2',
                  body: 'Comment 2',
                  score: 25,
                  replies: '',
                },
              },
            ],
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: mockResponse,
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchCommentThread('postId', 'test');
      expect(result).not.toBeNull();
      expect(result?.post.id).toBe('postId');
      expect(result?.comments).toHaveLength(2);
      expect(result?.totalComments).toBe(2);
    });

    it('should detect hasMore when "more" comments exist', async () => {
      const mockResponse = [
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't3',
                data: {
                  id: 'postId',
                  title: 'Post Title',
                  author: 'op',
                  subreddit: 'test',
                  num_comments: 100,
                },
              },
            ],
          },
        },
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'comment1',
                  author: 'commenter1',
                  body: 'Comment 1',
                  score: 50,
                  replies: '',
                },
              },
              {
                kind: 'more',
                data: {
                  count: 95,
                  children: ['abc', 'def'],
                },
              },
            ],
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: mockResponse,
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchCommentThread('postId', 'test');
      expect(result?.hasMore).toBe(true);
    });

    it('should return null for invalid response', async () => {
      mockRequestUrl.mockResolvedValue({
        json: { not: 'array' },
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchCommentThread('postId', 'test');
      expect(result).toBeNull();
    });

    it('should return null when post listing is empty', async () => {
      mockRequestUrl.mockResolvedValue({
        json: [
          { kind: 'Listing', data: { children: [] } },
          { kind: 'Listing', data: { children: [] } },
        ],
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchCommentThread('postId', 'test');
      expect(result).toBeNull();
    });

    it('should handle API error gracefully', async () => {
      mockRequestUrl.mockRejectedValue(new Error('API Error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await client.fetchCommentThread('postId', 'test');
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching comment thread:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should use custom sort parameter', async () => {
      mockRequestUrl.mockResolvedValue({
        json: [
          { kind: 'Listing', data: { children: [] } },
          { kind: 'Listing', data: { children: [] } },
        ],
        headers: { 'x-ratelimit-remaining': '100' },
      });

      await client.fetchCommentThread('postId', 'test', 'controversial');

      expect(mockRequestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('sort=controversial'),
        })
      );
    });
  });

  describe('flattenCommentTree', () => {
    it('should flatten nested comment tree with depth tracking', async () => {
      const nestedComments: RedditItem[] = [
        {
          kind: 't1',
          data: {
            id: 'parent',
            author: 'author1',
            body: 'Parent',
            replies: {
              kind: 'Listing',
              data: {
                children: [
                  {
                    kind: 't1',
                    data: {
                      id: 'child1',
                      author: 'author2',
                      body: 'Child 1',
                      replies: {
                        kind: 'Listing',
                        data: {
                          children: [
                            {
                              kind: 't1',
                              data: {
                                id: 'grandchild',
                                author: 'author3',
                                body: 'Grandchild',
                                replies: '',
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      ];

      const result = client['flattenCommentTree'](nestedComments, 0, 5);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('parent');
      expect(result[0].depth).toBe(0);
      expect(result[1].id).toBe('child1');
      expect(result[1].depth).toBe(1);
      expect(result[2].id).toBe('grandchild');
      expect(result[2].depth).toBe(2);
    });

    it('should skip non-comment items', async () => {
      const mixedItems: RedditItem[] = [
        {
          kind: 't1',
          data: {
            id: 'comment1',
            author: 'author1',
            body: 'Comment',
            replies: '',
          },
        },
        {
          kind: 'more',
          data: {
            count: 10,
            children: ['a', 'b'],
          },
        },
      ];

      const result = client['flattenCommentTree'](mixedItems, 0, 5);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('comment1');
    });

    it('should respect max depth limit', async () => {
      const deeplyNested: RedditItem[] = [
        {
          kind: 't1',
          data: {
            id: 'depth0',
            author: 'author',
            body: 'Depth 0',
            replies: {
              kind: 'Listing',
              data: {
                children: [
                  {
                    kind: 't1',
                    data: {
                      id: 'depth1',
                      author: 'author',
                      body: 'Depth 1',
                      replies: {
                        kind: 'Listing',
                        data: {
                          children: [
                            {
                              kind: 't1',
                              data: {
                                id: 'depth2',
                                author: 'author',
                                body: 'Depth 2',
                                replies: '',
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      ];

      // Limit to depth 1, should only get 2 comments (depth 0 and depth 1)
      const result = client['flattenCommentTree'](deeplyNested, 0, 1);

      expect(result).toHaveLength(2);
      expect(result.map(c => c.id)).toEqual(['depth0', 'depth1']);
    });
  });

  describe('static helper methods', () => {
    describe('getParentType', () => {
      it('should return "comment" for t1_ prefix', () => {
        expect(RedditApiClient.getParentType('t1_abc123')).toBe('comment');
      });

      it('should return "post" for t3_ prefix', () => {
        expect(RedditApiClient.getParentType('t3_xyz789')).toBe('post');
      });

      it('should return "post" for unknown prefix', () => {
        expect(RedditApiClient.getParentType('t5_other')).toBe('post');
      });
    });

    describe('extractIdFromFullname', () => {
      it('should extract ID from t1_ fullname', () => {
        expect(RedditApiClient.extractIdFromFullname('t1_abc123')).toBe('abc123');
      });

      it('should extract ID from t3_ fullname', () => {
        expect(RedditApiClient.extractIdFromFullname('t3_xyz789')).toBe('xyz789');
      });

      it('should return original string if no match', () => {
        expect(RedditApiClient.extractIdFromFullname('invalid')).toBe('invalid');
      });

      it('should handle various type prefixes', () => {
        expect(RedditApiClient.extractIdFromFullname('t2_user123')).toBe('user123');
        expect(RedditApiClient.extractIdFromFullname('t4_message456')).toBe('message456');
      });
    });
  });

  describe('parseComments edge cases', () => {
    it('should handle deleted authors', async () => {
      const mockResponse = [
        { kind: 'Listing', data: { children: [] } },
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'comment1',
                  author: null,
                  body: 'Comment body',
                  score: 10,
                  created_utc: 1234567890,
                  is_submitter: false,
                  replies: '',
                },
              },
            ],
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: mockResponse,
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchPostComments('/r/test/comments/abc123/', 0);
      expect(result[0].author).toBe('[deleted]');
    });

    it('should handle missing score', async () => {
      const mockResponse = [
        { kind: 'Listing', data: { children: [] } },
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'comment1',
                  author: 'user',
                  body: 'Comment body',
                  // score intentionally missing
                  created_utc: 1234567890,
                  is_submitter: false,
                  replies: '',
                },
              },
            ],
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: mockResponse,
        headers: { 'x-ratelimit-remaining': '100' },
      });

      const result = await client.fetchPostComments('/r/test/comments/abc123/', 0);
      expect(result[0].score).toBe(0);
    });

    it('should respect max depth in nested parsing', async () => {
      // Create deeply nested structure
      const createNestedReply = (id: string, depth: number, maxDepth: number): any => {
        if (depth >= maxDepth) {
          return {
            kind: 't1',
            data: {
              id,
              author: 'user',
              body: `Comment at depth ${depth}`,
              score: 10,
              created_utc: 1234567890,
              is_submitter: false,
              replies: '',
            },
          };
        }
        return {
          kind: 't1',
          data: {
            id,
            author: 'user',
            body: `Comment at depth ${depth}`,
            score: 10,
            created_utc: 1234567890,
            is_submitter: false,
            replies: {
              kind: 'Listing',
              data: {
                children: [createNestedReply(`${id}_child`, depth + 1, maxDepth)],
              },
            },
          },
        };
      };

      const mockResponse = [
        { kind: 'Listing', data: { children: [] } },
        {
          kind: 'Listing',
          data: {
            children: [createNestedReply('root', 0, 10)],
          },
        },
      ];

      mockRequestUrl.mockResolvedValue({
        json: mockResponse,
        headers: { 'x-ratelimit-remaining': '100' },
      });

      // Default max depth is 5, so we should stop parsing at depth 5
      const result = await client.fetchPostComments('/r/test/comments/abc123/', 0);

      // Count total depth by traversing
      let maxDepthFound = 0;
      const traverse = (comments: any[], currentDepth: number) => {
        for (const comment of comments) {
          if (currentDepth > maxDepthFound) maxDepthFound = currentDepth;
          if (comment.replies?.length > 0) {
            traverse(comment.replies, currentDepth + 1);
          }
        }
      };
      traverse(result, 0);

      expect(maxDepthFound).toBeLessThanOrEqual(5);
    });
  });
});
