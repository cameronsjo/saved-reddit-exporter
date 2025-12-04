import {
  LinkPreservationService,
  ExternalLink,
  WaybackCheckResult,
} from '../src/link-preservation';
import { RedditItemData } from '../src/types';

// Mock Obsidian's requestUrl
jest.mock('obsidian', () => ({
  requestUrl: jest.fn(),
}));

import { requestUrl } from 'obsidian';

const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

// Helper to create mock Reddit item data
function createMockItemData(overrides: Partial<RedditItemData> = {}): RedditItemData {
  return {
    id: 'test123',
    name: 't3_test123',
    title: 'Test Post Title',
    author: 'testuser',
    subreddit: 'programming',
    permalink: '/r/programming/comments/test123/test_post/',
    created_utc: Math.floor(Date.now() / 1000),
    score: 100,
    url: 'https://example.com/article',
    domain: 'example.com',
    is_self: false,
    selftext: '',
    num_comments: 50,
    upvote_ratio: 0.95,
    over_18: false,
    ...overrides,
  };
}

describe('LinkPreservationService', () => {
  let service: LinkPreservationService;

  beforeEach(() => {
    service = new LinkPreservationService();
    jest.clearAllMocks();
  });

  describe('extractExternalLinks', () => {
    it('should extract URL from link post', () => {
      const data = createMockItemData({
        url: 'https://example.com/article',
        is_self: false,
      });

      const links = service.extractExternalLinks(data);

      expect(links.length).toBe(1);
      expect(links[0]).toEqual({
        url: 'https://example.com/article',
        source: 'url',
        domain: 'example.com',
      });
    });

    it('should not extract URL from self post', () => {
      const data = createMockItemData({
        url: 'https://reddit.com/r/test/post123',
        is_self: true,
        selftext: 'Just some text',
      });

      const links = service.extractExternalLinks(data);

      expect(links.length).toBe(0);
    });

    it('should extract links from selftext', () => {
      const data = createMockItemData({
        is_self: true,
        selftext: 'Check out https://github.com/repo and https://docs.example.com/page',
      });

      const links = service.extractExternalLinks(data);

      expect(links.length).toBe(2);
      expect(links[0].url).toBe('https://github.com/repo');
      expect(links[0].source).toBe('body');
      expect(links[1].url).toBe('https://docs.example.com/page');
    });

    it('should extract links from comment body', () => {
      const data = createMockItemData({
        is_self: true, // Comment-like behavior, no main URL extraction
        body: 'Great resource: https://stackoverflow.com/questions/123',
      });

      const links = service.extractExternalLinks(data);

      expect(links.length).toBe(1);
      expect(links[0].url).toBe('https://stackoverflow.com/questions/123');
      expect(links[0].domain).toBe('stackoverflow.com');
    });

    it('should not extract Reddit links', () => {
      const data = createMockItemData({
        is_self: true,
        selftext:
          'See https://reddit.com/r/other and https://old.reddit.com/r/test and https://i.redd.it/image.png',
      });

      const links = service.extractExternalLinks(data);

      expect(links.length).toBe(0);
    });

    it('should deduplicate URLs', () => {
      const data = createMockItemData({
        url: 'https://example.com/page',
        is_self: false,
        selftext: 'Also see https://example.com/page for more info',
      });

      const links = service.extractExternalLinks(data);

      expect(links.length).toBe(1);
    });

    it('should clean trailing punctuation from URLs', () => {
      const data = createMockItemData({
        is_self: true,
        selftext: 'Check https://example.com/page. Also https://test.com/article!',
      });

      const links = service.extractExternalLinks(data);

      expect(links[0].url).toBe('https://example.com/page');
      expect(links[1].url).toBe('https://test.com/article');
    });

    it('should handle malformed URLs gracefully', () => {
      const data = createMockItemData({
        is_self: true,
        selftext: 'Bad URL: https:///invalid and good: https://valid.com/page',
      });

      const links = service.extractExternalLinks(data);

      // Should only get the valid URL
      expect(links.some(l => l.url === 'https://valid.com/page')).toBe(true);
    });

    it('should extract domain correctly', () => {
      const data = createMockItemData({
        url: 'https://subdomain.example.com/path/to/page?query=1',
        is_self: false,
      });

      const links = service.extractExternalLinks(data);

      expect(links[0].domain).toBe('subdomain.example.com');
    });

    it('should filter all Reddit domains', () => {
      const redditUrls = [
        'https://reddit.com/r/test',
        'https://www.reddit.com/r/test',
        'https://old.reddit.com/r/test',
        'https://new.reddit.com/r/test',
        'https://i.redd.it/image.png',
        'https://v.redd.it/video',
        'https://preview.redd.it/image.jpg',
      ];

      for (const url of redditUrls) {
        const data = createMockItemData({
          url,
          is_self: false,
        });

        const links = service.extractExternalLinks(data);
        expect(links.length).toBe(0);
      }
    });
  });

  describe('checkWaybackArchive', () => {
    it('should return archived status when snapshot exists', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        json: {
          archived_snapshots: {
            closest: {
              available: true,
              url: 'https://web.archive.org/web/20240101/https://example.com',
              timestamp: '20240101000000',
            },
          },
        },
      } as any);

      const result = await service.checkWaybackArchive('https://example.com');

      expect(result.isArchived).toBe(true);
      expect(result.archivedUrl).toBe('https://web.archive.org/web/20240101/https://example.com');
      expect(result.timestamp).toBe('20240101000000');
    });

    it('should return not archived when no snapshot exists', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        json: {
          archived_snapshots: {},
        },
      } as any);

      const result = await service.checkWaybackArchive('https://newsite.com');

      expect(result.isArchived).toBe(false);
      expect(result.archivedUrl).toBeUndefined();
    });

    it('should handle API errors', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 500,
        json: {},
      } as any);

      const result = await service.checkWaybackArchive('https://example.com');

      expect(result.isArchived).toBe(false);
      expect(result.error).toContain('500');
    });

    it('should handle network errors', async () => {
      mockRequestUrl.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.checkWaybackArchive('https://example.com');

      expect(result.isArchived).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle snapshot with available: false', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        json: {
          archived_snapshots: {
            closest: {
              available: false,
            },
          },
        },
      } as any);

      const result = await service.checkWaybackArchive('https://example.com');

      expect(result.isArchived).toBe(false);
    });
  });

  describe('saveToWayback', () => {
    it('should return success for valid save request', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
      } as any);

      const result = await service.saveToWayback('https://example.com/page');

      expect(result.success).toBe(true);
      expect(result.archivedUrl).toContain('web.archive.org/save/');
    });

    it('should handle 3xx redirect as success', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 302,
      } as any);

      const result = await service.saveToWayback('https://example.com');

      expect(result.success).toBe(true);
    });

    it('should handle save errors', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 429,
      } as any);

      const result = await service.saveToWayback('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('429');
    });

    it('should handle network errors', async () => {
      mockRequestUrl.mockRejectedValueOnce(new Error('Rate limited'));

      const result = await service.saveToWayback('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limited');
    });
  });

  describe('checkLinkHealth', () => {
    it('should return alive for 200 response', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
      } as any);

      const result = await service.checkLinkHealth('https://example.com');

      expect(result.isAlive).toBe(true);
      expect(result.hasContent).toBe(true);
      expect(result.status).toBe(200);
    });

    it('should return alive for 3xx redirect', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 301,
      } as any);

      const result = await service.checkLinkHealth('https://example.com');

      expect(result.isAlive).toBe(true);
      expect(result.hasContent).toBe(false);
    });

    it('should return not alive for 404', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 404,
      } as any);

      const result = await service.checkLinkHealth('https://example.com/missing');

      expect(result.isAlive).toBe(false);
      expect(result.status).toBe(404);
    });

    it('should return not alive for 500', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 500,
      } as any);

      const result = await service.checkLinkHealth('https://example.com');

      expect(result.isAlive).toBe(false);
      expect(result.status).toBe(500);
    });

    it('should handle network errors', async () => {
      mockRequestUrl.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.checkLinkHealth('https://unreachable.com');

      expect(result.isAlive).toBe(false);
      expect(result.status).toBe(0);
      expect(result.error).toBe('Connection refused');
    });

    it('should include original URL in result', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
      } as any);

      const result = await service.checkLinkHealth('https://example.com/page');

      expect(result.url).toBe('https://example.com/page');
    });
  });

  describe('generateWaybackUrl', () => {
    it('should generate URL with timestamp', () => {
      const url = service.generateWaybackUrl('https://example.com', '20240101000000');

      expect(url).toBe('https://web.archive.org/web/20240101000000/https://example.com');
    });

    it('should generate URL with wildcard when no timestamp', () => {
      const url = service.generateWaybackUrl('https://example.com');

      expect(url).toBe('https://web.archive.org/web/*/https://example.com');
    });
  });

  describe('formatLinkPreservation', () => {
    it('should format link with archive URL when available', () => {
      const link: ExternalLink = {
        url: 'https://example.com/page',
        source: 'url',
        domain: 'example.com',
      };

      const archiveResult: WaybackCheckResult = {
        isArchived: true,
        archivedUrl: 'https://web.archive.org/web/20240101/https://example.com/page',
      };

      const result = service.formatLinkPreservation(link, archiveResult);

      expect(result).toContain('[example.com](https://example.com/page)');
      expect(result).toContain('[📚 Archive]');
      expect(result).toContain('web.archive.org/web/20240101');
    });

    it('should format link with save URL when not archived', () => {
      const link: ExternalLink = {
        url: 'https://newsite.com/page',
        source: 'body',
        domain: 'newsite.com',
      };

      const archiveResult: WaybackCheckResult = {
        isArchived: false,
      };

      const result = service.formatLinkPreservation(link, archiveResult);

      expect(result).toContain('[newsite.com](https://newsite.com/page)');
      expect(result).toContain('[📚 Save to Archive]');
      expect(result).toContain('web.archive.org/save/');
    });

    it('should format link without archive result', () => {
      const link: ExternalLink = {
        url: 'https://example.com',
        source: 'url',
        domain: 'example.com',
      };

      const result = service.formatLinkPreservation(link);

      expect(result).toContain('[example.com](https://example.com)');
      expect(result).toContain('[📚 Save to Archive]');
    });

    it('should URL-encode the save link', () => {
      const link: ExternalLink = {
        url: 'https://example.com/page?query=value&other=123',
        source: 'url',
        domain: 'example.com',
      };

      const result = service.formatLinkPreservation(link);

      expect(result).toContain(
        encodeURIComponent('https://example.com/page?query=value&other=123')
      );
    });
  });
});
