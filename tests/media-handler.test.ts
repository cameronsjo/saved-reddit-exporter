import { MediaHandler } from '../src/media-handler';
import { RedditSavedSettings, RedditItemData } from '../src/types';
import { App } from 'obsidian';
import { sanitizeFileName } from '../src/utils/file-sanitizer';

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
      organizeBySubreddit: false,
      exportPostComments: false,
      commentUpvoteThreshold: 0,
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
      expect(sanitizeFileName('Test: File? Name*')).toBe('Test- File- Name-');
      expect(sanitizeFileName('Normal filename')).toBe('Normal filename');
      expect(sanitizeFileName('')).toBe('Untitled');
      expect(sanitizeFileName('   ')).toBe('Untitled');
    });

    it('should handle Windows reserved names', () => {
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

  describe('analyzeMedia extended coverage', () => {
    it('should identify Reddit videos', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        url: 'https://v.redd.it/abc123',
        domain: 'v.redd.it',
      };

      const result = handler.analyzeMedia(data);

      expect(result.type).toBe('video');
      expect(result.mediaType).toBe('reddit-video');
      expect(result.isMedia).toBe(true);
      expect(result.canEmbed).toBe(false);
    });

    it('should identify Gfycat GIFs', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        url: 'https://gfycat.com/coolcat',
        domain: 'gfycat.com',
      };

      const result = handler.analyzeMedia(data);

      expect(result.type).toBe('gif');
      expect(result.mediaType).toBe('gif-platform');
      expect(result.isMedia).toBe(true);
      expect(result.canEmbed).toBe(false);
    });

    it('should identify Redgifs', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        url: 'https://redgifs.com/watch/example',
        domain: 'redgifs.com',
      };

      const result = handler.analyzeMedia(data);

      expect(result.type).toBe('gif');
      expect(result.mediaType).toBe('gif-platform');
    });

    it('should identify youtu.be short URLs', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        url: 'https://youtu.be/dQw4w9WgXcQ',
        domain: 'youtu.be',
      };

      const result = handler.analyzeMedia(data);

      expect(result.type).toBe('video');
      expect(result.mediaType).toBe('youtube');
      expect(result.isMedia).toBe(true);
    });

    it('should identify direct video file URLs', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        url: 'https://example.com/video.webm',
        domain: 'example.com',
      };

      const result = handler.analyzeMedia(data);

      expect(result.type).toBe('video');
      expect(result.mediaType).toBe('video');
      expect(result.isMedia).toBe(true);
      expect(result.canEmbed).toBe(true);
    });

    it('should return link type for non-media URLs', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        url: 'https://news.ycombinator.com/item?id=12345',
        domain: 'news.ycombinator.com',
      };

      const result = handler.analyzeMedia(data);

      expect(result.type).toBe('link');
      expect(result.mediaType).toBeNull();
      expect(result.isMedia).toBe(false);
      expect(result.canEmbed).toBe(false);
    });
  });

  describe('shouldDownloadMedia extended coverage', () => {
    it('should respect GIF platform download settings', () => {
      const mediaInfo = {
        type: 'gif' as const,
        mediaType: 'gif-platform' as const,
        isMedia: true,
        domain: 'gfycat.com',
        canEmbed: false,
      };

      mockSettings.downloadGifs = true;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://gfycat.com/coolcat')).toBe(true);

      mockSettings.downloadGifs = false;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://gfycat.com/coolcat')).toBe(false);
    });

    it('should respect video download settings', () => {
      const mediaInfo = {
        type: 'video' as const,
        mediaType: 'video' as const,
        isMedia: true,
        domain: 'example.com',
        canEmbed: true,
      };

      mockSettings.downloadVideos = true;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://example.com/video.mp4')).toBe(true);

      mockSettings.downloadVideos = false;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://example.com/video.mp4')).toBe(false);
    });

    it('should handle Imgur image downloads', () => {
      const mediaInfo = {
        type: 'image' as const,
        mediaType: 'imgur' as const,
        isMedia: true,
        domain: 'i.imgur.com',
        canEmbed: true,
      };

      mockSettings.downloadImages = true;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://i.imgur.com/abc.jpg')).toBe(true);

      mockSettings.downloadImages = false;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://i.imgur.com/abc.jpg')).toBe(false);
    });

    it('should download generic image files by extension', () => {
      const mediaInfo = {
        type: 'link' as const,
        mediaType: null,
        isMedia: false,
        domain: 'unknown.com',
        canEmbed: false,
      };

      mockSettings.downloadImages = true;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://unknown.com/image.png')).toBe(true);

      mockSettings.downloadImages = false;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://unknown.com/image.png')).toBe(false);
    });

    it('should download generic GIF files by extension', () => {
      const mediaInfo = {
        type: 'link' as const,
        mediaType: null,
        isMedia: false,
        domain: 'unknown.com',
        canEmbed: false,
      };

      mockSettings.downloadGifs = true;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://unknown.com/animation.gif')).toBe(
        true
      );

      mockSettings.downloadGifs = false;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://unknown.com/animation.gif')).toBe(
        false
      );
    });

    it('should download generic video files by extension', () => {
      const mediaInfo = {
        type: 'link' as const,
        mediaType: null,
        isMedia: false,
        domain: 'unknown.com',
        canEmbed: false,
      };

      mockSettings.downloadVideos = true;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://unknown.com/video.mp4')).toBe(true);

      mockSettings.downloadVideos = false;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://unknown.com/video.mp4')).toBe(false);
    });

    it('should return false for non-media URLs without file extensions', () => {
      const mediaInfo = {
        type: 'link' as const,
        mediaType: null,
        isMedia: false,
        domain: 'example.com',
        canEmbed: false,
      };

      mockSettings.downloadImages = true;
      mockSettings.downloadGifs = true;
      mockSettings.downloadVideos = true;
      expect(handler.shouldDownloadMedia(mediaInfo, 'https://example.com/article')).toBe(false);
    });
  });

  describe('generateMediaFilename extended coverage', () => {
    it('should default to gif extension for gif-platform media type', () => {
      const data: RedditItemData = {
        id: 'abc123',
        name: 't3_abc123',
        title: 'Funny GIF',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const mediaInfo = {
        type: 'gif' as const,
        mediaType: 'gif-platform' as const,
        isMedia: true,
        domain: 'gfycat.com',
        canEmbed: false,
      };

      const result = handler.generateMediaFilename(data, 'https://gfycat.com/coolcat', mediaInfo);

      expect(result).toContain('.gif');
    });

    it('should default to mp4 extension for video media type', () => {
      const data: RedditItemData = {
        id: 'abc123',
        name: 't3_abc123',
        title: 'Cool Video',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const mediaInfo = {
        type: 'video' as const,
        mediaType: 'video' as const,
        isMedia: true,
        domain: 'example.com',
        canEmbed: true,
      };

      const result = handler.generateMediaFilename(data, 'https://example.com/watch', mediaInfo);

      expect(result).toContain('.mp4');
    });

    it('should use fallback title when title is missing', () => {
      const data: RedditItemData = {
        id: 'abc123',
        name: 't3_abc123',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const mediaInfo = {
        type: 'image' as const,
        mediaType: 'image' as const,
        isMedia: true,
        domain: 'example.com',
        canEmbed: true,
      };

      const result = handler.generateMediaFilename(
        data,
        'https://example.com/image.jpg',
        mediaInfo
      );

      expect(result).toContain('reddit-media');
      expect(result).toContain('abc123');
    });

    it('should use fallback ID when ID is missing', () => {
      const data: RedditItemData = {
        id: '',
        name: 't3_test',
        title: 'Test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const mediaInfo = {
        type: 'image' as const,
        mediaType: 'image' as const,
        isMedia: true,
        domain: 'example.com',
        canEmbed: true,
      };

      const result = handler.generateMediaFilename(
        data,
        'https://example.com/image.jpg',
        mediaInfo
      );

      expect(result).toContain('unknown');
    });

    it('should handle path traversal attempts safely', () => {
      const data: RedditItemData = {
        id: 'abc123',
        name: 't3_abc123',
        title: '../../../etc/passwd',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const mediaInfo = {
        type: 'image' as const,
        mediaType: 'image' as const,
        isMedia: true,
        domain: 'example.com',
        canEmbed: true,
      };

      const result = handler.generateMediaFilename(
        data,
        'https://example.com/image.jpg',
        mediaInfo
      );

      // Should return safe fallback filename
      expect(result).toContain('media-abc123');
      expect(result).not.toContain('..');
    });

    it('should default to unknown extension for unknown media types', () => {
      const data: RedditItemData = {
        id: 'abc123',
        name: 't3_abc123',
        title: 'Unknown Media',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const mediaInfo = {
        type: 'link' as const,
        mediaType: null,
        isMedia: false,
        domain: 'example.com',
        canEmbed: false,
      };

      const result = handler.generateMediaFilename(data, 'https://example.com/unknown', mediaInfo);

      expect(result).toContain('.unknown');
    });
  });

  describe('isGalleryPost', () => {
    it('should return true for valid gallery posts', () => {
      const data: RedditItemData = {
        id: 'gallery1',
        name: 't3_gallery1',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        is_gallery: true,
        gallery_data: {
          items: [{ media_id: 'img1', id: 1 }],
        },
        media_metadata: {
          img1: {
            status: 'valid',
            e: 'Image',
            m: 'image/jpeg',
            s: { u: 'https://i.redd.it/img1.jpg', x: 800, y: 600 },
          },
        },
      };

      expect(handler.isGalleryPost(data)).toBe(true);
    });

    it('should return false when is_gallery is false', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        is_gallery: false,
      };

      expect(handler.isGalleryPost(data)).toBe(false);
    });

    it('should return false when gallery_data is missing', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        is_gallery: true,
        media_metadata: {},
      };

      expect(handler.isGalleryPost(data)).toBe(false);
    });

    it('should return false when media_metadata is missing', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        is_gallery: true,
        gallery_data: {
          items: [{ media_id: 'img1', id: 1 }],
        },
      };

      expect(handler.isGalleryPost(data)).toBe(false);
    });
  });

  describe('isPollPost', () => {
    it('should return true for valid poll posts', () => {
      const data: RedditItemData = {
        id: 'poll1',
        name: 't3_poll1',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        poll_data: {
          options: [
            { id: '1', text: 'Option 1' },
            { id: '2', text: 'Option 2' },
          ],
          total_vote_count: 100,
          voting_end_timestamp: 1641000000,
        },
      };

      expect(handler.isPollPost(data)).toBe(true);
    });

    it('should return false when poll_data is missing', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      expect(handler.isPollPost(data)).toBe(false);
    });

    it('should return false when poll has no options', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        poll_data: {
          options: [],
          total_vote_count: 0,
          voting_end_timestamp: 1641000000,
        },
      };

      expect(handler.isPollPost(data)).toBe(false);
    });
  });

  describe('extractGalleryImages', () => {
    it('should extract images from valid gallery', () => {
      const data: RedditItemData = {
        id: 'gallery1',
        name: 't3_gallery1',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        is_gallery: true,
        gallery_data: {
          items: [
            { media_id: 'img1', id: 1, caption: 'First image' },
            { media_id: 'img2', id: 2, caption: 'Second image', outbound_url: 'https://link.com' },
          ],
        },
        media_metadata: {
          img1: {
            status: 'valid',
            e: 'Image',
            m: 'image/jpeg',
            s: { u: 'https://preview.redd.it/img1.jpg?width=800&amp;height=600', x: 800, y: 600 },
          },
          img2: {
            status: 'valid',
            e: 'Image',
            m: 'image/png',
            s: { u: 'https://preview.redd.it/img2.png?width=1024&amp;height=768', x: 1024, y: 768 },
          },
        },
      };

      const images = handler.extractGalleryImages(data);

      expect(images).toHaveLength(2);
      expect(images[0].mediaId).toBe('img1');
      expect(images[0].caption).toBe('First image');
      expect(images[0].url).toContain('img1.jpg');
      expect(images[0].url).not.toContain('&amp;'); // Should be decoded
      expect(images[0].width).toBe(800);
      expect(images[0].height).toBe(600);
      expect(images[0].index).toBe(0);
      expect(images[0].isAnimated).toBe(false);

      expect(images[1].mediaId).toBe('img2');
      expect(images[1].caption).toBe('Second image');
      expect(images[1].outboundUrl).toBe('https://link.com');
      expect(images[1].index).toBe(1);
    });

    it('should return empty array for non-gallery posts', () => {
      const data: RedditItemData = {
        id: 'test',
        name: 't3_test',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        is_gallery: false,
      };

      const images = handler.extractGalleryImages(data);
      expect(images).toHaveLength(0);
    });

    it('should skip items with invalid status', () => {
      const data: RedditItemData = {
        id: 'gallery1',
        name: 't3_gallery1',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        is_gallery: true,
        gallery_data: {
          items: [
            { media_id: 'img1', id: 1 },
            { media_id: 'img2', id: 2 },
          ],
        },
        media_metadata: {
          img1: {
            status: 'valid',
            e: 'Image',
            m: 'image/jpeg',
            s: { u: 'https://preview.redd.it/img1.jpg', x: 800, y: 600 },
          },
          img2: {
            status: 'failed',
            e: 'Image',
            m: 'image/png',
          },
        },
      };

      const images = handler.extractGalleryImages(data);
      expect(images).toHaveLength(1);
      expect(images[0].mediaId).toBe('img1');
    });

    it('should handle animated images (GIFs) with MP4 fallback', () => {
      const data: RedditItemData = {
        id: 'gallery1',
        name: 't3_gallery1',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        is_gallery: true,
        gallery_data: {
          items: [{ media_id: 'anim1', id: 1 }],
        },
        media_metadata: {
          anim1: {
            status: 'valid',
            e: 'AnimatedImage',
            m: 'image/gif',
            s: {
              gif: 'https://preview.redd.it/anim1.gif?format=gif&amp;v=1',
              mp4: 'https://preview.redd.it/anim1.mp4?format=mp4&amp;v=1',
              x: 400,
              y: 300,
            },
          },
        },
      };

      const images = handler.extractGalleryImages(data);

      expect(images).toHaveLength(1);
      expect(images[0].isAnimated).toBe(true);
      expect(images[0].url).toContain('anim1.gif');
      expect(images[0].url).not.toContain('&amp;');
      expect(images[0].mp4Url).toContain('anim1.mp4');
      expect(images[0].mp4Url).not.toContain('&amp;');
    });

    it('should handle animated images without GIF URL', () => {
      const data: RedditItemData = {
        id: 'gallery1',
        name: 't3_gallery1',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        is_gallery: true,
        gallery_data: {
          items: [{ media_id: 'anim1', id: 1 }],
        },
        media_metadata: {
          anim1: {
            status: 'valid',
            e: 'AnimatedImage',
            m: 'video/mp4',
            s: {
              mp4: 'https://preview.redd.it/anim1.mp4',
              x: 400,
              y: 300,
            },
          },
        },
      };

      const images = handler.extractGalleryImages(data);

      expect(images).toHaveLength(1);
      expect(images[0].isAnimated).toBe(true);
      expect(images[0].url).toContain('anim1.mp4');
      expect(images[0].mp4Url).toContain('anim1.mp4');
    });

    it('should skip items with missing URL', () => {
      const data: RedditItemData = {
        id: 'gallery1',
        name: 't3_gallery1',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
        is_gallery: true,
        gallery_data: {
          items: [{ media_id: 'img1', id: 1 }],
        },
        media_metadata: {
          img1: {
            status: 'valid',
            e: 'Image',
            m: 'image/jpeg',
            s: { x: 800, y: 600 }, // Missing 'u' URL
          },
        },
      };

      const images = handler.extractGalleryImages(data);
      expect(images).toHaveLength(0);
    });
  });

  describe('generateGalleryImageFilename', () => {
    it('should generate padded index filenames', () => {
      const data: RedditItemData = {
        id: 'gallery1',
        name: 't3_gallery1',
        title: 'My Gallery Post',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const image = {
        mediaId: 'img1',
        url: 'https://preview.redd.it/img1.jpg?width=800',
        index: 0,
        isAnimated: false,
      };

      const filename = handler.generateGalleryImageFilename(data, image, 10);

      expect(filename).toContain('My Gallery Post');
      expect(filename).toContain('gallery1');
      expect(filename).toContain('-01.');
      expect(filename).toContain('.jpg');
    });

    it('should use mp4 extension for animated images with mp4Url', () => {
      const data: RedditItemData = {
        id: 'gallery1',
        name: 't3_gallery1',
        title: 'Animated Gallery',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const image = {
        mediaId: 'anim1',
        url: 'https://preview.redd.it/anim1.gif',
        mp4Url: 'https://preview.redd.it/anim1.mp4',
        index: 0,
        isAnimated: true,
      };

      const filename = handler.generateGalleryImageFilename(data, image, 5);

      expect(filename).toContain('.mp4');
    });

    it('should use gif extension for animated images without mp4Url', () => {
      const data: RedditItemData = {
        id: 'gallery1',
        name: 't3_gallery1',
        title: 'GIF Gallery',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const image = {
        mediaId: 'anim1',
        url: 'https://preview.redd.it/anim1.gif',
        index: 0,
        isAnimated: true,
      };

      const filename = handler.generateGalleryImageFilename(data, image, 5);

      expect(filename).toContain('.gif');
    });

    it('should use fallback title for missing title', () => {
      const data: RedditItemData = {
        id: 'gallery1',
        name: 't3_gallery1',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const image = {
        mediaId: 'img1',
        url: 'https://preview.redd.it/img1.jpg',
        index: 0,
        isAnimated: false,
      };

      const filename = handler.generateGalleryImageFilename(data, image, 5);

      expect(filename).toContain('reddit-gallery');
    });

    it('should extract extension from URL', () => {
      const data: RedditItemData = {
        id: 'gallery1',
        name: 't3_gallery1',
        title: 'PNG Gallery',
        author: 'user',
        subreddit: 'test',
        permalink: '/test',
        created_utc: 1640995200,
        score: 0,
      };

      const image = {
        mediaId: 'img1',
        url: 'https://preview.redd.it/img1.PNG?width=800',
        index: 0,
        isAnimated: false,
      };

      const filename = handler.generateGalleryImageFilename(data, image, 5);

      expect(filename).toContain('.png');
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
