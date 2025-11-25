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
      expect(result).toEqual([...mockItems1, ...mockItems2]);

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
});
