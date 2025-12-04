import { ContentFormatter } from '../src/content-formatter';
import { MediaHandler } from '../src/media-handler';
import { RedditSavedSettings, RedditItemData, RedditComment } from '../src/types';
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
      organizeBySubreddit: false,
      exportPostComments: false,
      commentUpvoteThreshold: 0,
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
      expect(result).toContain('# Comment on: Original Post Title');
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

  describe('formatCommentHeader', () => {
    it('should format comment headers correctly', async () => {
      const commentData = {
        id: 'comment1',
        name: 't1_comment1',
        author: 'commenter',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/post1/title/comment1',
        score: 50,
        body: 'This is a comment',
        is_submitter: true,
        link_title: 'Original Post Title',
        link_permalink: '/r/test/comments/post1',
      };

      const result = await formatter.formatRedditContent(commentData, true);

      expect(result).toContain('type: reddit-comment');
      expect(result).toContain('· OP ·'); // OP badge in the metadata line
      expect(result).toContain('# Comment on: Original Post Title');
      expect(result).toContain('This is a comment');
    });

    it('should handle comment without OP status', async () => {
      const commentData = {
        id: 'comment2',
        name: 't1_comment2',
        author: 'normaluser',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/post1/title/comment2',
        score: 25,
        body: 'Regular comment',
        is_submitter: false,
        link_title: 'Post Title',
      };

      const result = await formatter.formatRedditContent(commentData, true);

      expect(result).toContain('type: reddit-comment');
      expect(result).not.toContain('👑 **OP**');
      expect(result).toContain('Regular comment');
    });
  });

  describe('formatPostHeader', () => {
    it('should format post headers with flair', async () => {
      const postData = {
        id: 'post1',
        name: 't3_post1',
        title: 'Test Post',
        author: 'author1',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/post1',
        score: 100,
        num_comments: 5,
        is_self: false,
        url: 'https://example.com',
        link_flair_text: 'Discussion',
        upvote_ratio: 0.95,
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('type: reddit-post');
      expect(result).toContain('flair: "Discussion"');
      expect(result).toContain('# Test Post');
      expect(result).toContain('upvote_ratio: 0.95');
    });

    it('should handle self posts', async () => {
      const postData = {
        id: 'post2',
        name: 't3_post2',
        title: 'Self Post',
        author: 'author2',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/post2',
        score: 75,
        num_comments: 3,
        is_self: true,
        selftext: 'This is the post content.',
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('post_type: text');
      expect(result).toContain('This is the post content.');
      expect(result).not.toContain('url:');
    });
  });

  describe('formatMediaContent', () => {
    it('should handle video content', async () => {
      const postData = {
        id: 'video1',
        name: 't3_video1',
        title: 'Video Post',
        author: 'videomaker',
        subreddit: 'videos',
        created_utc: 1234567890,
        permalink: '/r/videos/comments/video1',
        score: 200,
        num_comments: 15,
        is_self: false,
        url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
        preview: {
          images: [{ source: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg' } }],
        },
      };

      // Mock media handler to return youtube type
      mockMediaHandler.analyzeMedia.mockReturnValue({
        type: 'video',
        mediaType: 'youtube',
        isMedia: true,
        domain: 'youtube.com',
        canEmbed: true,
      });

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('🎬 **YouTube Video**');
      expect(result).toContain('▶️ Watch on YouTube');
    });

    it('should handle Reddit video content', async () => {
      const postData = {
        id: 'rvideo1',
        name: 't3_rvideo1',
        title: 'Reddit Video',
        author: 'videouser',
        subreddit: 'funny',
        created_utc: 1234567890,
        permalink: '/r/funny/comments/rvideo1',
        score: 150,
        num_comments: 8,
        is_self: false,
        url: 'https://v.redd.it/abc123',
      };

      // Mock media handler to return reddit-video type
      mockMediaHandler.analyzeMedia.mockReturnValue({
        type: 'video',
        mediaType: 'reddit-video',
        isMedia: true,
        domain: 'v.redd.it',
        canEmbed: false,
      });

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('🎥 **Reddit Video**');
      expect(result).toContain('⚠️ Reddit-hosted video');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle missing preview data', async () => {
      const postData = {
        id: 'nopreview',
        name: 't3_nopreview',
        title: 'No Preview Post',
        author: 'author',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/nopreview',
        score: 50,
        num_comments: 2,
        is_self: false,
        url: 'https://example.com/image.jpg',
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('No Preview Post');
      expect(result).not.toContain('Resolution:');
    });

    it('should handle quotes in titles and flair', async () => {
      const postData = {
        id: 'quotes',
        name: 't3_quotes',
        title: 'Title with "quotes" and more',
        author: 'quoter',
        subreddit: 'test',
        created_utc: 1234567890,
        permalink: '/r/test/comments/quotes',
        score: 30,
        num_comments: 1,
        is_self: true,
        link_flair_text: 'Flair with "quotes" too',
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('title: "Title with \\"quotes\\" and more"');
      expect(result).toContain('flair: "Flair with \\"quotes\\" too"');
    });

    it('should handle empty content gracefully', async () => {
      const emptyData = {
        id: 'empty',
        name: 't3_empty',
        title: 'Empty Post',
        author: 'emptyuser',
        subreddit: 'empty',
        created_utc: 1234567890,
        permalink: '/r/empty/comments/empty',
        score: 0,
        num_comments: 0,
        is_self: true,
        selftext: '',
      };

      const result = await formatter.formatRedditContent(emptyData, false);

      expect(result).toContain('Empty Post');
      expect(result).toContain('score: 0');
    });
  });

  describe('formatRedditContent with comments', () => {
    it('should include comments section when comments are provided', async () => {
      const postData: RedditItemData = {
        id: 'post123',
        name: 't3_post123',
        title: 'Post With Comments',
        author: 'postauthor',
        subreddit: 'test',
        permalink: '/r/test/comments/post123/post_with_comments/',
        created_utc: 1640995200,
        score: 100,
        num_comments: 25,
        is_self: true,
        selftext: 'Post content here',
      };

      const comments: RedditComment[] = [
        {
          id: 'comment1',
          author: 'commenter1',
          body: 'This is a great post!',
          score: 50,
          created_utc: 1640995300,
          is_submitter: false,
          depth: 0,
        },
        {
          id: 'comment2',
          author: 'postauthor',
          body: 'Thanks for the feedback!',
          score: 25,
          created_utc: 1640995400,
          is_submitter: true,
          depth: 0,
        },
      ];

      const result = await formatter.formatRedditContent(postData, false, 'saved', comments);

      expect(result).toContain('## Comments (2)');
      expect(result).toContain('**u/commenter1**');
      expect(result).toContain('This is a great post!');
      expect(result).toContain('**u/postauthor** [OP]'); // OP badge format
      expect(result).toContain('Thanks for the feedback!');
      expect(result).toContain('exported_comments: 2');
    });

    it('should handle nested comment replies', async () => {
      const postData: RedditItemData = {
        id: 'post456',
        name: 't3_post456',
        title: 'Post With Nested Comments',
        author: 'op',
        subreddit: 'test',
        permalink: '/r/test/comments/post456/',
        created_utc: 1640995200,
        score: 50,
        num_comments: 10,
        is_self: true,
        selftext: 'Post body',
      };

      const comments: RedditComment[] = [
        {
          id: 'parent1',
          author: 'user1',
          body: 'Parent comment',
          score: 30,
          created_utc: 1640995300,
          is_submitter: false,
          depth: 0,
          replies: [
            {
              id: 'child1',
              author: 'user2',
              body: 'Reply to parent',
              score: 15,
              created_utc: 1640995400,
              is_submitter: false,
              depth: 1,
            },
          ],
        },
      ];

      const result = await formatter.formatRedditContent(postData, false, 'saved', comments);

      expect(result).toContain('Parent comment');
      expect(result).toContain('Reply to parent');
      expect(result).toContain('exported_comments: 2');
    });

    it('should not include comments section for saved comments', async () => {
      const commentData: RedditItemData = {
        id: 'savedcomment',
        name: 't1_savedcomment',
        author: 'commenter',
        subreddit: 'test',
        permalink: '/r/test/comments/post123/title/savedcomment/',
        created_utc: 1640995200,
        score: 50,
        body: 'This is a saved comment',
        link_title: 'Original Post',
        is_submitter: false,
      };

      const comments: RedditComment[] = [
        {
          id: 'comment1',
          author: 'other',
          body: 'Other comment',
          score: 10,
          created_utc: 1640995300,
          is_submitter: false,
          depth: 0,
        },
      ];

      // Even if comments are passed, they should not be included for saved comments
      const result = await formatter.formatRedditContent(commentData, true, 'saved', comments);

      expect(result).not.toContain('## 💬 Top Comments');
      expect(result).toContain('type: reddit-comment');
    });

    it('should handle empty comments array', async () => {
      const postData: RedditItemData = {
        id: 'nocomments',
        name: 't3_nocomments',
        title: 'Post Without Comments',
        author: 'author',
        subreddit: 'test',
        permalink: '/r/test/comments/nocomments/',
        created_utc: 1640995200,
        score: 10,
        num_comments: 0,
        is_self: true,
        selftext: 'Empty post',
      };

      const result = await formatter.formatRedditContent(postData, false, []);

      expect(result).not.toContain('## 💬 Top Comments');
      expect(result).not.toContain('exported_comments');
    });
  });
});
