import { MediaHandler } from '../src/media-handler';
import { RedditSavedSettings, RedditItemData } from '../src/types';
import { App } from 'obsidian';

describe('MediaHandler', () => {
  let handler: MediaHandler;
  let mockSettings: RedditSavedSettings;
  let mockApp: App;

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

    mockApp = new App();
    handler = new MediaHandler(mockApp, mockSettings);
  });

  describe('analyzeMedia', () => {
    it('should identify Reddit images', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        url: 'https://i.redd.it/example.jpg',
        domain: 'i.redd.it',
      };

      const result = handler.analyzeMedia(data);

      expect(result.type).toBe('image');
      expect(result.mediaType).toBe('reddit-image');
      expect(result.isMedia).toBe(true);
      expect(result.canEmbed).toBe(true);
    });

    it('should identify Imgur images', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        url: 'https://imgur.com/example.jpg',
        domain: 'imgur.com',
      };

      const result = handler.analyzeMedia(data);

      expect(result.type).toBe('image');
      expect(result.mediaType).toBe('imgur');
      expect(result.isMedia).toBe(true);
    });

    it('should identify YouTube videos', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        domain: 'youtube.com',
      };

      const result = handler.analyzeMedia(data);

      expect(result.type).toBe('video');
      expect(result.mediaType).toBe('youtube');
      expect(result.isMedia).toBe(true);
      expect(result.canEmbed).toBe(false);
    });

    it('should handle direct file URLs', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        url: 'https://example.com/image.png',
        domain: 'example.com',
      };

      const result = handler.analyzeMedia(data);

      expect(result.type).toBe('image');
      expect(result.mediaType).toBe('image');
      expect(result.isMedia).toBe(true);
    });
  });

  describe('isGalleryUrl', () => {
    it('should identify Imgur galleries', () => {
      const isGalleryUrl = (handler as { isGalleryUrl: (url: string) => boolean }).isGalleryUrl;

      expect(isGalleryUrl('https://imgur.com/gallery/example')).toBe(true);
      expect(isGalleryUrl('https://imgur.com/a/album123')).toBe(true);
      expect(isGalleryUrl('https://imgur.com/example.jpg')).toBe(false);
    });

    it('should identify Reddit galleries', () => {
      const isGalleryUrl = (handler as { isGalleryUrl: (url: string) => boolean }).isGalleryUrl;

      expect(isGalleryUrl('https://reddit.com/gallery/abc123')).toBe(true);
      expect(isGalleryUrl('https://reddit.com/r/test')).toBe(false);
    });
  });

  describe('shouldDownloadMedia', () => {
    it('should respect image download settings', () => {
      const mediaInfo = {
        type: 'image',
        mediaType: 'reddit-image',
        isMedia: true,
        domain: 'i.redd.it',
        canEmbed: true,
      };

      mockSettings.downloadImages = true;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://i.redd.it/test.jpg')).toBe(true);

      mockSettings.downloadImages = false;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://i.redd.it/test.jpg')).toBe(false);
    });

    it('should not download gallery URLs', () => {
      const mediaInfo = {
        type: 'image',
        mediaType: 'imgur',
        isMedia: true,
        domain: 'imgur.com',
        canEmbed: true,
      };

      mockSettings.downloadImages = true;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://imgur.com/gallery/test')).toBe(false);
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://imgur.com/test.jpg')).toBe(true);
    });
  });

  describe('generateMediaFilename', () => {
    it('should generate valid filenames', () => {
      const data: RedditItemData = {
        id: 'abc123',
        name: 't3_abc123',
        title: 'Test Post Title',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const mediaInfo = {
        type: 'image',
        mediaType: 'reddit-image',
        isMedia: true,
        domain: 'i.redd.it',
        canEmbed: true,
      };

      const result = handler.generateMediaFilename(
        data,
        'https://i.redd.it/example.jpg',
        mediaInfo
      );

      expect(result).toContain('Test Post Title');
      expect(result).toContain('abc123');
      expect(result).toContain('.jpg');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle URLs without extensions', () => {
      const data: RedditItemData = {
        id: 'abc123',
        name: 't3_abc123',
        title: 'Test Post',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const mediaInfo = {
        type: 'image',
        mediaType: 'imgur',
        isMedia: true,
        domain: 'imgur.com',
        canEmbed: true,
      };

      const result = handler.generateMediaFilename(
        data,
        'https://imgur.com/gallery/test',
        mediaInfo
      );

      expect(result).toContain('.jpg'); // Should default to jpg for images
    });
  });

  describe('extractYouTubeId', () => {
    it('should extract YouTube video IDs', () => {
      expect(handler.extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ'
      );
      expect(handler.extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(handler.extractYouTubeId('https://youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(handler.extractYouTubeId('https://example.com/video')).toBeNull();
    });
  });

  describe('sanitizeFileName', () => {
    it('should sanitize filenames', () => {
      const sanitizeFileName = (handler as { sanitizeFileName: (filename: string) => string })
        .sanitizeFileName;

      expect(sanitizeFileName('Test: File? Name*')).toBe('Test- File- Name-');
      expect(sanitizeFileName('Normal filename')).toBe('Normal filename');
      expect(sanitizeFileName('')).toBe('Untitled');
      expect(sanitizeFileName('   ')).toBe('Untitled');
    });

    it('should handle Windows reserved names', () => {
      const sanitizeFileName = (handler as { sanitizeFileName: (filename: string) => string })
        .sanitizeFileName;

      expect(sanitizeFileName('CON')).toBe('CON_file');
      expect(sanitizeFileName('PRN')).toBe('PRN_file');
      expect(sanitizeFileName('con')).toBe('con_file'); // Case insensitive
    });
  });

  describe('downloadMediaFile', () => {
    it('should return a file path', async () => {
      const result = await handler.downloadMediaFile('https://example.com/image.jpg', 'test.jpg');
      expect(typeof result).toBe('string');
      expect(result).toContain('test.jpg');
    });
  });

  describe('generateMediaFilename', () => {
    it('should generate filename with timestamp and title', () => {
      const postData = {
        id: 'post1',
        name: 't3_post1',
        title: 'Test Post Title',
        author: 'user1',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/post1',
        score: 100,
        num_comments: 5,
        is_self: false,
      };

      const mediaInfo = {
        type: 'image' as const,
        mediaType: 'image' as const,
        isMedia: true,
        domain: 'i.imgur.com',
        canEmbed: false,
      };

      const filename = handler.generateMediaFilename(
        postData,
        'https://i.imgur.com/abc123.jpg',
        mediaInfo
      );

      expect(filename).toContain('Test Post Title');
      expect(filename).toContain('post1');
      expect(filename).toContain('.jpg');
    });

    it('should handle URLs without extensions', () => {
      const postData = {
        id: 'post2',
        name: 't3_post2',
        title: 'No Extension',
        author: 'user2',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/post2',
        score: 50,
        num_comments: 2,
        is_self: false,
      };

      const mediaInfo = {
        type: 'image' as const,
        mediaType: 'image' as const,
        isMedia: true,
        domain: 'example.com',
        canEmbed: false,
      };

      const filename = handler.generateMediaFilename(
        postData,
        'https://example.com/image',
        mediaInfo
      );

      expect(filename).toContain('No Extension');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty URLs gracefully', () => {
      const postData = {
        id: 'empty',
        name: 't3_empty',
        author: 'user',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/empty',
        score: 0,
        num_comments: 0,
        is_self: true,
        url: '',
      };

      const result = handler.analyzeMedia(postData);

      expect(result.type).toBe('link');
      expect(result.isMedia).toBe(false);
    });

    it('should handle malformed URLs', () => {
      const postData = {
        id: 'malformed',
        name: 't3_malformed',
        author: 'user',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/malformed',
        score: 0,
        num_comments: 0,
        is_self: false,
        url: 'not-a-valid-url',
      };

      const result = handler.analyzeMedia(postData);

      expect(result.type).toBe('link');
      expect(result.domain).toBe('');
    });

    it('should handle very long filenames', () => {
      const longTitle = 'A'.repeat(300); // Very long title
      const postData = {
        id: 'long',
        name: 't3_long',
        title: longTitle,
        author: 'user',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/long',
        score: 0,
        num_comments: 0,
        is_self: false,
      };

      const mediaInfo = {
        type: 'image' as const,
        mediaType: 'image' as const,
        isMedia: true,
        domain: 'example.com',
        canEmbed: false,
      };

      const filename = handler.generateMediaFilename(
        postData,
        'https://example.com/image.jpg',
        mediaInfo
      );

      // Filename should be truncated to reasonable length
      expect(filename.length).toBeLessThan(255); // Typical filesystem limit
    });

    it('should handle special characters in titles', () => {
      const postData = {
        id: 'special',
        name: 't3_special',
        title: 'Title/with\\special<>chars|?*:"',
        author: 'user',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/special',
        score: 0,
        num_comments: 0,
        is_self: false,
      };

      const mediaInfo = {
        type: 'image' as const,
        mediaType: 'image' as const,
        isMedia: true,
        domain: 'example.com',
        canEmbed: false,
      };

      const filename = handler.generateMediaFilename(
        postData,
        'https://example.com/image.jpg',
        mediaInfo
      );

      // Special characters should be sanitized
      expect(filename).not.toMatch(/[<>:"/\\|?*]/);
      expect(filename).toContain('Title-with-special--chars------special');
    });
  });

  describe('media type detection edge cases', () => {
    it('should detect direct image links', () => {
      const postData = {
        id: 'direct',
        name: 't3_direct',
        author: 'user',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/direct',
        score: 0,
        num_comments: 0,
        is_self: false,
        url: 'https://example.com/photo.png',
      };

      const result = handler.analyzeMedia(postData);

      expect(result.type).toBe('image');
      expect(result.mediaType).toBe('image');
      expect(result.isMedia).toBe(true);
    });

    it('should detect GIF files', () => {
      const postData = {
        id: 'gif',
        name: 't3_gif',
        author: 'user',
        subreddit: 'gifs',
        created_utc: 1234567890,
        permalink: '/r/gifs/comments/gif',
        score: 0,
        num_comments: 0,
        is_self: false,
        url: 'https://example.com/animation.gif',
      };

      const result = handler.analyzeMedia(postData);

      expect(result.mediaType).toBe('image'); // GIF files are detected as images by default
      expect(result.isMedia).toBe(true);
    });

    it('should detect video files', () => {
      const postData = {
        id: 'video',
        name: 't3_video',
        author: 'user',
        subreddit: 'videos',
        created_utc: 1234567890,
        permalink: '/r/videos/comments/video',
        score: 0,
        num_comments: 0,
        is_self: false,
        url: 'https://example.com/video.mp4',
      };

      const result = handler.analyzeMedia(postData);

      expect(result.type).toBe('video');
      expect(result.mediaType).toBe('video');
      expect(result.isMedia).toBe(true);
    });
  });
});
