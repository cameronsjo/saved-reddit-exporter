import { ContentFormatter } from '../src/content-formatter';
import { MediaHandler } from '../src/media-handler';
import { RedditSavedSettings, RedditItemData } from '../src/types';
import { App } from 'obsidian';

// Mock MediaHandler
jest.mock('../src/media-handler');

describe('ContentFormatter', () => {
  let formatter: ContentFormatter;
  let mockMediaHandler: jest.Mocked<MediaHandler>;
  let mockSettings: RedditSavedSettings;

  beforeEach(() => {
    mockSettings = {
      clientId: 'test-id',
      clientSecret: 'test-secret',
      refreshToken: '',
      accessToken: '',
      tokenExpiry: 0,
      username: 'testuser',
      saveLocation: 'Reddit Saved',
      autoUnsave: false,
      fetchLimit: 100,
      importedIds: [],
      skipExisting: true,
      oauthRedirectPort: 9638,
      showAdvancedSettings: false,
      downloadImages: true,
      downloadGifs: true,
      downloadVideos: true,
      mediaFolder: 'Attachments',
    };

    mockMediaHandler = new MediaHandler({} as App, mockSettings) as jest.Mocked<MediaHandler>;
    mockMediaHandler.analyzeMedia.mockReturnValue({
      type: 'text',
      mediaType: null,
      isMedia: false,
      domain: 'reddit.com',
      canEmbed: false,
    });

    formatter = new ContentFormatter(mockSettings, mockMediaHandler);
  });

  describe('formatRedditContent', () => {
    it('should format a basic Reddit post', async () => {
      const mockData: RedditItemData = {
        id: 'test123',
        name: 't3_test123',
        title: 'Test Post Title',
        author: 'testuser',
        subreddit: 'test',
        permalink: '/r/test/comments/test123/test_post_title/',
        created_utc: 1640995200, // 2022-01-01
        score: 100,
        num_comments: 25,
        upvote_ratio: 0.95,
        is_self: true,
        selftext: 'This is test content',
      };

      const result = await formatter.formatRedditContent(mockData, false);

      expect(result).toContain('type: reddit-post');
      expect(result).toContain('title: "Test Post Title"');
      expect(result).toContain('author: testuser');
      expect(result).toContain('subreddit: test');
      expect(result).toContain('score: 100');
      expect(result).toContain('id: test123');
      expect(result).toContain('# Test Post Title');
      expect(result).toContain('This is test content');
    });

    it('should format a Reddit comment', async () => {
      const mockData: RedditItemData = {
        id: 'comment123',
        name: 't1_comment123',
        author: 'commenter',
        subreddit: 'test',
        permalink: '/r/test/comments/post123/title/comment123/',
        created_utc: 1640995200,
        score: 50,
        body: 'This is a test comment',
        link_title: 'Original Post Title',
        link_permalink: '/r/test/comments/post123/title/',
        is_submitter: false,
      };

      const result = await formatter.formatRedditContent(mockData, true);

      expect(result).toContain('type: reddit-comment');
      expect(result).toContain('post_title: "Original Post Title"');
      expect(result).toContain('is_submitter: false');
      expect(result).toContain('# 💬 Comment on: Original Post Title');
      expect(result).toContain('This is a test comment');
    });

    it('should handle posts with media', async () => {
      const mockData: RedditItemData = {
        id: 'media123',
        name: 't3_media123',
        title: 'Image Post',
        author: 'imageuser',
        subreddit: 'pics',
        permalink: '/r/pics/comments/media123/image_post/',
        created_utc: 1640995200,
        score: 200,
        num_comments: 15,
        url: 'https://i.redd.it/example.jpg',
        is_self: false,
      };

      mockMediaHandler.analyzeMedia.mockReturnValue({
        type: 'image',
        mediaType: 'reddit-image',
        isMedia: true,
        domain: 'i.redd.it',
        canEmbed: true,
      });

      const result = await formatter.formatRedditContent(mockData, false);

      expect(result).toContain('post_type: image');
      expect(result).toContain('media_type: reddit-image');
      expect(result).toContain('url: https://i.redd.it/example.jpg');
      expect(result).toContain('📸 **Image**');
    });
  });

  describe('extractFilename', () => {
    it('should extract filename from path', () => {
      const formatter = new ContentFormatter(mockSettings, mockMediaHandler);
      const extractFilename = (formatter as { extractFilename: (path: string) => string })
        .extractFilename;

      expect(extractFilename('path/to/file.jpg')).toBe('file.jpg');
      expect(extractFilename('file.png')).toBe('file.png');
      expect(extractFilename('deep/nested/path/image.gif')).toBe('image.gif');
    });
  });

  describe('convertRedditMarkdown', () => {
    it('should convert Reddit markdown syntax', () => {
      const formatter = new ContentFormatter(mockSettings, mockMediaHandler);
      const convertRedditMarkdown = (
        formatter as { convertRedditMarkdown: (input: string) => string }
      ).convertRedditMarkdown;

      const input = 'Check out r/test and u/testuser. &gt;!spoiler text!&lt;';
      const result = convertRedditMarkdown(input);

      expect(result).toContain('[r/test](https://reddit.com/r/test)');
      expect(result).toContain('[u/testuser](https://reddit.com/u/testuser)');
      expect(result).toContain('%%spoiler text%%');
    });

    it('should handle HTML entities', () => {
      const formatter = new ContentFormatter(mockSettings, mockMediaHandler);
      const convertRedditMarkdown = (
        formatter as { convertRedditMarkdown: (input: string) => string }
      ).convertRedditMarkdown;

      const input = '&amp; &lt; &gt; &quot; &#x27; &#x2F;';
      const result = convertRedditMarkdown(input);

      expect(result).toBe('& < > " \' /');
    });

    it('should convert quotes', () => {
      const formatter = new ContentFormatter(mockSettings, mockMediaHandler);
      const convertRedditMarkdown = (
        formatter as { convertRedditMarkdown: (input: string) => string }
      ).convertRedditMarkdown;

      const input = '&gt;This is a quote\n&gt;Multi-line quote';
      const result = convertRedditMarkdown(input);

      expect(result).toContain('> This is a quote');
      expect(result).toContain('> Multi-line quote');
    });
  });
});
