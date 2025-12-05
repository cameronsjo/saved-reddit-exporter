import { requestUrl } from 'obsidian';
import { LinkPreservationService } from '../src/link-preservation';
import { RedditItemData } from '../src/types';

jest.mock('obsidian');

const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

describe('LinkPreservationService', () => {
  let service: LinkPreservationService;

  beforeEach(() => {
    service = new LinkPreservationService();
    jest.clearAllMocks();
  });

  describe('checkWaybackArchive', () => {
    it('should return archived info when URL is archived', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        json: {
          archived_snapshots: {
            closest: {
              available: true,
              url: 'https://web.archive.org/web/20240101000000/https://example.com',
              timestamp: '20240101000000',
            },
          },
        },
      } as never);

      const result = await service.checkWaybackArchive('https://example.com');

      expect(result.isArchived).toBe(true);
      expect(result.archivedUrl).toBe(
        'https://web.archive.org/web/20240101000000/https://example.com'
      );
      expect(result.timestamp).toBe('20240101000000');
    });

    it('should return not archived when no snapshot exists', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
        json: {
          archived_snapshots: {},
        },
      } as never);

      const result = await service.checkWaybackArchive('https://example.com');

      expect(result.isArchived).toBe(false);
      expect(result.archivedUrl).toBeUndefined();
    });

    it('should handle API errors', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 500,
        json: {},
      } as never);

      const result = await service.checkWaybackArchive('https://example.com');

      expect(result.isArchived).toBe(false);
      expect(result.error).toBe('API returned status 500');
    });

    it('should handle network errors', async () => {
      mockRequestUrl.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.checkWaybackArchive('https://example.com');

      expect(result.isArchived).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle unknown errors', async () => {
      mockRequestUrl.mockRejectedValueOnce('Unknown error');

      const result = await service.checkWaybackArchive('https://example.com');

      expect(result.isArchived).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('saveToWayback', () => {
    it('should return success when save succeeds', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
      } as never);

      const result = await service.saveToWayback('https://example.com');

      expect(result.success).toBe(true);
      expect(result.archivedUrl).toBe('https://web.archive.org/save/https://example.com');
    });

    it('should return success for redirect status', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 302,
      } as never);

      const result = await service.saveToWayback('https://example.com');

      expect(result.success).toBe(true);
    });

    it('should return failure for 4xx/5xx status', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 503,
      } as never);

      const result = await service.saveToWayback('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Save returned status 503');
    });

    it('should handle network errors', async () => {
      mockRequestUrl.mockRejectedValueOnce(new Error('Request failed'));

      const result = await service.saveToWayback('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Request failed');
    });

    it('should handle unknown errors', async () => {
      mockRequestUrl.mockRejectedValueOnce({ message: 'unknown' });

      const result = await service.saveToWayback('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('checkLinkHealth', () => {
    it('should return alive for 200 status', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 200,
      } as never);

      const result = await service.checkLinkHealth('https://example.com');

      expect(result.url).toBe('https://example.com');
      expect(result.status).toBe(200);
      expect(result.isAlive).toBe(true);
      expect(result.hasContent).toBe(true);
    });

    it('should return alive but no content for redirect', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 301,
      } as never);

      const result = await service.checkLinkHealth('https://example.com');

      expect(result.isAlive).toBe(true);
      expect(result.hasContent).toBe(false);
    });

    it('should return not alive for 404', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 404,
      } as never);

      const result = await service.checkLinkHealth('https://example.com');

      expect(result.isAlive).toBe(false);
      expect(result.hasContent).toBe(false);
    });

    it('should return not alive for 500', async () => {
      mockRequestUrl.mockResolvedValueOnce({
        status: 500,
      } as never);

      const result = await service.checkLinkHealth('https://example.com');

      expect(result.isAlive).toBe(false);
    });

    it('should handle request errors', async () => {
      mockRequestUrl.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.checkLinkHealth('https://example.com');

      expect(result.isAlive).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('should handle non-Error rejections', async () => {
      mockRequestUrl.mockRejectedValueOnce('some error');

      const result = await service.checkLinkHealth('https://example.com');

      expect(result.error).toBe('Request failed');
    });
  });

  describe('extractExternalLinks', () => {
    const createMockData = (overrides: Partial<RedditItemData> = {}): RedditItemData => ({
      id: 'abc123',
      name: 't3_abc123',
      title: 'Test Post',
      author: 'testuser',
      subreddit: 'test',
      permalink: '/r/test/comments/abc123/',
      created_utc: 1704067200,
      score: 100,
      ...overrides,
    });

    it('should extract URL from link post', () => {
      const data = createMockData({
        url: 'https://example.com/article',
        is_self: false,
      });

      const links = service.extractExternalLinks(data);

      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com/article');
      expect(links[0].source).toBe('url');
      expect(links[0].domain).toBe('example.com');
    });

    it('should not extract URL from self post', () => {
      const data = createMockData({
        url: 'https://www.reddit.com/r/test/comments/abc123/',
        is_self: true,
      });

      const links = service.extractExternalLinks(data);

      expect(links).toHaveLength(0);
    });

    it('should not extract Reddit domain URLs', () => {
      const data = createMockData({
        url: 'https://www.reddit.com/r/another/comments/xyz/',
        is_self: false,
      });

      const links = service.extractExternalLinks(data);

      expect(links).toHaveLength(0);
    });

    it('should not extract i.redd.it URLs', () => {
      const data = createMockData({
        url: 'https://i.redd.it/image123.jpg',
        is_self: false,
      });

      const links = service.extractExternalLinks(data);

      expect(links).toHaveLength(0);
    });

    it('should not extract v.redd.it URLs', () => {
      const data = createMockData({
        url: 'https://v.redd.it/video123',
        is_self: false,
      });

      const links = service.extractExternalLinks(data);

      expect(links).toHaveLength(0);
    });

    it('should extract links from selftext', () => {
      const data = createMockData({
        is_self: true,
        selftext: 'Check out https://example.com/page and https://test.org/article',
      });

      const links = service.extractExternalLinks(data);

      expect(links).toHaveLength(2);
      expect(links[0].url).toBe('https://example.com/page');
      expect(links[0].source).toBe('body');
      expect(links[1].url).toBe('https://test.org/article');
    });

    it('should extract links from comment body', () => {
      const data = createMockData({
        body: 'Here is a link: https://docs.example.com/guide',
      });

      const links = service.extractExternalLinks(data);

      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://docs.example.com/guide');
      expect(links[0].source).toBe('body');
    });

    it('should deduplicate URLs', () => {
      const data = createMockData({
        is_self: true,
        selftext: 'Visit https://example.com and again https://example.com',
      });

      const links = service.extractExternalLinks(data);

      expect(links).toHaveLength(1);
    });

    it('should clean trailing punctuation from URLs', () => {
      const data = createMockData({
        is_self: true,
        selftext: 'Check https://example.com/page. Also see https://test.org/article!',
      });

      const links = service.extractExternalLinks(data);

      expect(links[0].url).toBe('https://example.com/page');
      expect(links[1].url).toBe('https://test.org/article');
    });

    it('should filter Reddit links from body text', () => {
      const data = createMockData({
        is_self: true,
        selftext: 'See https://www.reddit.com/r/other and https://example.com',
      });

      const links = service.extractExternalLinks(data);

      expect(links).toHaveLength(1);
      expect(links[0].url).toBe('https://example.com');
    });

    it('should handle data with no URLs', () => {
      const data = createMockData({
        is_self: true,
        selftext: 'This post has no links',
      });

      const links = service.extractExternalLinks(data);

      expect(links).toHaveLength(0);
    });

    it('should handle empty selftext', () => {
      const data = createMockData({
        is_self: true,
        selftext: '',
      });

      const links = service.extractExternalLinks(data);

      expect(links).toHaveLength(0);
    });

    it('should combine url field and body links', () => {
      const data = createMockData({
        url: 'https://example.com/main',
        is_self: false,
        selftext: 'Related: https://related.com/article',
      });

      const links = service.extractExternalLinks(data);

      expect(links).toHaveLength(2);
      expect(links.some(l => l.url === 'https://example.com/main' && l.source === 'url')).toBe(
        true
      );
      expect(links.some(l => l.url === 'https://related.com/article' && l.source === 'body')).toBe(
        true
      );
    });
  });

  describe('generateWaybackUrl', () => {
    it('should generate URL with timestamp', () => {
      const url = service.generateWaybackUrl('https://example.com', '20240101000000');

      expect(url).toBe('https://web.archive.org/web/20240101000000/https://example.com');
    });

    it('should generate wildcard URL without timestamp', () => {
      const url = service.generateWaybackUrl('https://example.com');

      expect(url).toBe('https://web.archive.org/web/*/https://example.com');
    });
  });

  describe('formatLinkPreservation', () => {
    it('should format link with archive available', () => {
      const link = {
        url: 'https://example.com',
        source: 'url' as const,
        domain: 'example.com',
      };
      const archiveResult = {
        isArchived: true,
        archivedUrl: 'https://web.archive.org/web/20240101/https://example.com',
      };

      const formatted = service.formatLinkPreservation(link, archiveResult);

      expect(formatted).toContain('[example.com](https://example.com)');
      expect(formatted).toContain(
        '[📚 Archive](https://web.archive.org/web/20240101/https://example.com)'
      );
    });

    it('should format link without archive', () => {
      const link = {
        url: 'https://example.com',
        source: 'body' as const,
        domain: 'example.com',
      };
      const archiveResult = {
        isArchived: false,
      };

      const formatted = service.formatLinkPreservation(link, archiveResult);

      expect(formatted).toContain('[example.com](https://example.com)');
      expect(formatted).toContain('[📚 Save to Archive]');
      expect(formatted).toContain('web.archive.org/save/');
    });

    it('should format link with no archive result', () => {
      const link = {
        url: 'https://example.com/path?query=1',
        source: 'url' as const,
        domain: 'example.com',
      };

      const formatted = service.formatLinkPreservation(link);

      expect(formatted).toContain('[example.com](https://example.com/path?query=1)');
      expect(formatted).toContain('[📚 Save to Archive]');
    });
  });
});
