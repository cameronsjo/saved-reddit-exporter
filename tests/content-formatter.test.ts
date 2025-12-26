import { ContentFormatter } from '../src/content-formatter';
import { MediaHandler, GalleryImage } from '../src/media-handler';
import { RedditSavedSettings, RedditItemData, RedditComment, ContentOrigin } from '../src/types';
import { App } from 'obsidian';

// Mock MediaHandler
jest.mock('../src/media-handler');

// Mock LinkPreservationService
jest.mock('../src/link-preservation', () => ({
  LinkPreservationService: jest.fn().mockImplementation(() => ({
    extractExternalLinks: jest.fn().mockReturnValue([]),
    checkWaybackArchive: jest.fn().mockResolvedValue({ isArchived: false }),
  })),
  ExternalLink: {},
}));

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
      expect(result).toContain(' · OP');
      expect(result).toContain('Comment on: Original Post Title');
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
      expect(result).toContain('**u/postauthor** [OP]');
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

  describe('content origins', () => {
    it('should format upvoted content correctly', async () => {
      const postData: RedditItemData = {
        id: 'upvoted1',
        name: 't3_upvoted1',
        title: 'Upvoted Post',
        author: 'someone',
        subreddit: 'test',
        permalink: '/r/test/comments/upvoted1/',
        created_utc: 1640995200,
        score: 500,
        num_comments: 20,
        is_self: true,
        selftext: 'Great content',
      };

      const result = await formatter.formatRedditContent(postData, false, 'upvoted');

      expect(result).toContain('type: reddit-upvoted');
      expect(result).toContain('content_origin: upvoted');
      expect(result).not.toContain('saved: true');
      expect(result).toContain('👍 Upvoted');
    });

    it('should format submitted content correctly', async () => {
      const postData: RedditItemData = {
        id: 'submitted1',
        name: 't3_submitted1',
        title: 'My Post',
        author: 'testuser',
        subreddit: 'test',
        permalink: '/r/test/comments/submitted1/',
        created_utc: 1640995200,
        score: 100,
        num_comments: 10,
        is_self: true,
        selftext: 'My content',
      };

      const result = await formatter.formatRedditContent(postData, false, 'submitted');

      expect(result).toContain('type: reddit-user-post');
      expect(result).toContain('content_origin: submitted');
      expect(result).toContain('📝 Your Post');
    });

    it('should format commented content correctly', async () => {
      const commentData: RedditItemData = {
        id: 'commented1',
        name: 't1_commented1',
        author: 'testuser',
        subreddit: 'test',
        permalink: '/r/test/comments/post1/title/commented1/',
        created_utc: 1640995200,
        score: 50,
        body: 'My comment',
        link_title: 'Post Title',
        is_submitter: false,
      };

      const result = await formatter.formatRedditContent(commentData, true, 'commented');

      expect(result).toContain('type: reddit-user-comment');
      expect(result).toContain('content_origin: commented');
      expect(result).toContain('💬 Your Comment');
    });

    it('should format submitted comment correctly', async () => {
      const commentData: RedditItemData = {
        id: 'subcomment1',
        name: 't1_subcomment1',
        author: 'testuser',
        subreddit: 'test',
        permalink: '/r/test/comments/post1/title/subcomment1/',
        created_utc: 1640995200,
        score: 25,
        body: 'My submitted comment',
        link_title: 'Post Title',
        is_submitter: true,
      };

      const result = await formatter.formatRedditContent(commentData, true, 'submitted');

      expect(result).toContain('type: reddit-user-comment');
      expect(result).toContain('content_origin: submitted');
    });
  });

  describe('crosspost handling', () => {
    it('should include crosspost metadata when enabled', async () => {
      const settings = {
        ...mockSettings,
        preserveCrosspostMetadata: true,
        importCrosspostOriginal: false,
      };
      const crosspostFormatter = new ContentFormatter(settings, mockMediaHandler);

      const postData: RedditItemData = {
        id: 'crosspost1',
        name: 't3_crosspost1',
        title: 'Crossposted Content',
        author: 'crossposter',
        subreddit: 'newsubreddit',
        permalink: '/r/newsubreddit/comments/crosspost1/',
        created_utc: 1640995200,
        score: 200,
        num_comments: 15,
        is_self: false,
        url: 'https://example.com',
        crosspost_parent: 't3_original123',
        crosspost_parent_list: [
          {
            id: 'original123',
            name: 't3_original123',
            subreddit: 'originalsubreddit',
            author: 'originalauthor',
            title: 'Original Title',
            created_utc: 1640994200,
            score: 1000,
            permalink: '/r/originalsubreddit/comments/original123/',
          },
        ],
      };

      const result = await crosspostFormatter.formatRedditContent(postData, false);

      expect(result).toContain('is_crosspost: true');
      expect(result).toContain('crosspost_subreddit: newsubreddit');
      expect(result).toContain('original_subreddit: originalsubreddit');
      expect(result).toContain('original_author: originalauthor');
      expect(result).toContain('original_id: original123');
      expect(result).toContain('Crosspost');
    });

    it('should use original post data when importCrosspostOriginal is enabled', async () => {
      const settings = {
        ...mockSettings,
        preserveCrosspostMetadata: true,
        importCrosspostOriginal: true,
      };
      const crosspostFormatter = new ContentFormatter(settings, mockMediaHandler);

      const postData: RedditItemData = {
        id: 'crosspost2',
        name: 't3_crosspost2',
        title: 'Crossposted Title',
        author: 'crossposter',
        subreddit: 'newsubreddit',
        permalink: '/r/newsubreddit/comments/crosspost2/',
        created_utc: 1640995200,
        score: 50,
        num_comments: 5,
        is_self: true,
        selftext: 'Crosspost text',
        crosspost_parent: 't3_original456',
        crosspost_parent_list: [
          {
            id: 'original456',
            name: 't3_original456',
            subreddit: 'originalsubreddit',
            author: 'originalauthor',
            title: 'Original Title',
            selftext: 'Original content',
            created_utc: 1640994200,
            score: 500,
            permalink: '/r/originalsubreddit/comments/original456/',
            is_self: true,
          },
        ],
      };

      const result = await crosspostFormatter.formatRedditContent(postData, false);

      // Should use original subreddit and author
      expect(result).toContain('subreddit: originalsubreddit');
      expect(result).toContain('author: originalauthor');
    });
  });

  describe('comment metadata', () => {
    it('should include parent_id and parent_type for comments', async () => {
      const commentData: RedditItemData = {
        id: 'reply1',
        name: 't1_reply1',
        author: 'replier',
        subreddit: 'test',
        permalink: '/r/test/comments/post1/title/reply1/',
        created_utc: 1640995200,
        score: 10,
        body: 'This is a reply',
        link_title: 'Post Title',
        is_submitter: false,
        parent_id: 't1_parent123',
        link_id: 't3_post1',
        depth: 2,
      };

      const result = await formatter.formatRedditContent(commentData, true);

      expect(result).toContain('parent_id: t1_parent123');
      expect(result).toContain('parent_type: comment');
      expect(result).toContain('link_id: t3_post1');
      expect(result).toContain('depth: 2');
      expect(result).toContain('Reply to comment');
    });

    it('should handle top-level comments', async () => {
      const commentData: RedditItemData = {
        id: 'toplevel1',
        name: 't1_toplevel1',
        author: 'commenter',
        subreddit: 'test',
        permalink: '/r/test/comments/post1/title/toplevel1/',
        created_utc: 1640995200,
        score: 100,
        body: 'Top level comment',
        link_title: 'Post Title',
        is_submitter: false,
        parent_id: 't3_post1',
        depth: 0,
      };

      const result = await formatter.formatRedditContent(commentData, true);

      expect(result).toContain('parent_type: post');
      expect(result).toContain('Top-level comment');
    });

    it('should include distinguished status', async () => {
      const commentData: RedditItemData = {
        id: 'modcomment',
        name: 't1_modcomment',
        author: 'moderator',
        subreddit: 'test',
        permalink: '/r/test/comments/post1/title/modcomment/',
        created_utc: 1640995200,
        score: 50,
        body: 'Mod comment',
        link_title: 'Post Title',
        is_submitter: false,
        distinguished: 'moderator',
      };

      const result = await formatter.formatRedditContent(commentData, true);

      expect(result).toContain('distinguished: moderator');
    });

    it('should include edited timestamp', async () => {
      const commentData: RedditItemData = {
        id: 'edited1',
        name: 't1_edited1',
        author: 'editor',
        subreddit: 'test',
        permalink: '/r/test/comments/post1/title/edited1/',
        created_utc: 1640995200,
        score: 30,
        body: 'Edited comment',
        link_title: 'Post Title',
        is_submitter: false,
        edited: 1640996200,
      };

      const result = await formatter.formatRedditContent(commentData, true);

      expect(result).toContain('edited:');
      expect(result).toMatch(/edited: \d{4}-\d{2}-\d{2}/);
    });

    it('should include archived and locked status', async () => {
      const commentData: RedditItemData = {
        id: 'archived1',
        name: 't1_archived1',
        author: 'olduser',
        subreddit: 'test',
        permalink: '/r/test/comments/post1/title/archived1/',
        created_utc: 1640995200,
        score: 200,
        body: 'Old archived comment',
        link_title: 'Post Title',
        is_submitter: false,
        archived: true,
        locked: true,
      };

      const result = await formatter.formatRedditContent(commentData, true);

      expect(result).toContain('archived: true');
      expect(result).toContain('locked: true');
    });

    it('should include parent context when available', async () => {
      const commentData: RedditItemData = {
        id: 'withcontext',
        name: 't1_withcontext',
        author: 'replier',
        subreddit: 'test',
        permalink: '/r/test/comments/post1/title/withcontext/',
        created_utc: 1640995200,
        score: 25,
        body: 'Reply with context',
        link_title: 'Post Title',
        is_submitter: false,
        parent_comments: [
          {
            id: 'parent1',
            name: 't1_parent1',
            author: 'parentauthor',
            subreddit: 'test',
            permalink: '/r/test/comments/post1/title/parent1/',
            created_utc: 1640994200,
            score: 100,
            body: 'Parent comment body',
            is_submitter: true,
          },
        ],
      };

      const result = await formatter.formatRedditContent(commentData, true);

      expect(result).toContain('has_parent_context: true');
      expect(result).toContain('parent_context_count: 1');
      expect(result).toContain('Parent Context');
      expect(result).toContain('Parent comment body');
    });

    it('should include child replies when available', async () => {
      const commentData: RedditItemData = {
        id: 'withreplies',
        name: 't1_withreplies',
        author: 'originalcommenter',
        subreddit: 'test',
        permalink: '/r/test/comments/post1/title/withreplies/',
        created_utc: 1640995200,
        score: 75,
        body: 'Comment with replies',
        link_title: 'Post Title',
        is_submitter: false,
        child_comments: [
          {
            id: 'child1',
            name: 't1_child1',
            author: 'replier1',
            subreddit: 'test',
            permalink: '/r/test/comments/post1/title/child1/',
            created_utc: 1640996200,
            score: 30,
            body: 'First reply',
            depth: 1,
          },
          {
            id: 'child2',
            name: 't1_child2',
            author: 'replier2',
            subreddit: 'test',
            permalink: '/r/test/comments/post1/title/child2/',
            created_utc: 1640996300,
            score: 20,
            body: 'Second reply',
            depth: 1,
          },
        ],
      };

      const result = await formatter.formatRedditContent(commentData, true);

      expect(result).toContain('has_replies: true');
      expect(result).toContain('reply_count: 2');
      expect(result).toContain('## Replies (2)');
      expect(result).toContain('First reply');
      expect(result).toContain('Second reply');
    });
  });

  describe('gallery posts', () => {
    it('should format gallery posts correctly', async () => {
      mockMediaHandler.isGalleryPost.mockReturnValue(true);
      mockMediaHandler.isPollPost.mockReturnValue(false);
      mockMediaHandler.extractGalleryImages.mockReturnValue([
        {
          id: 'img1',
          url: 'https://i.redd.it/img1.jpg',
          width: 1920,
          height: 1080,
          caption: 'First image',
        },
        {
          id: 'img2',
          url: 'https://i.redd.it/img2.jpg',
          width: 1080,
          height: 1080,
          caption: 'Second image',
        },
      ] as GalleryImage[]);
      mockMediaHandler.downloadGalleryImages.mockResolvedValue([]);

      const postData: RedditItemData = {
        id: 'gallery1',
        name: 't3_gallery1',
        title: 'Gallery Post',
        author: 'photographer',
        subreddit: 'pics',
        permalink: '/r/pics/comments/gallery1/',
        created_utc: 1640995200,
        score: 500,
        num_comments: 50,
        is_self: false,
        is_gallery: true,
        gallery_data: { items: [] },
        media_metadata: {},
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('post_type: gallery');
      expect(result).toContain('gallery_count: 2');
      expect(result).toContain('Gallery (2 images)');
      expect(result).toContain('1/2: First image');
      expect(result).toContain('2/2: Second image');
    });

    it('should handle empty gallery', async () => {
      mockMediaHandler.isGalleryPost.mockReturnValue(true);
      mockMediaHandler.isPollPost.mockReturnValue(false);
      mockMediaHandler.extractGalleryImages.mockReturnValue([]);

      const postData: RedditItemData = {
        id: 'emptygallery',
        name: 't3_emptygallery',
        title: 'Empty Gallery',
        author: 'user',
        subreddit: 'test',
        permalink: '/r/test/comments/emptygallery/',
        created_utc: 1640995200,
        score: 10,
        num_comments: 0,
        is_self: false,
        is_gallery: true,
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('Gallery post with no accessible images');
    });

    it('should handle animated gallery images', async () => {
      mockMediaHandler.isGalleryPost.mockReturnValue(true);
      mockMediaHandler.isPollPost.mockReturnValue(false);
      mockMediaHandler.extractGalleryImages.mockReturnValue([
        {
          id: 'gif1',
          url: 'https://i.redd.it/gif1.gif',
          width: 500,
          height: 500,
          isAnimated: true,
          mp4Url: 'https://i.redd.it/gif1.mp4',
        },
      ] as GalleryImage[]);
      mockMediaHandler.downloadGalleryImages.mockResolvedValue([]);

      const postData: RedditItemData = {
        id: 'animgallery',
        name: 't3_animgallery',
        title: 'Animated Gallery',
        author: 'gifmaker',
        subreddit: 'gifs',
        permalink: '/r/gifs/comments/animgallery/',
        created_utc: 1640995200,
        score: 100,
        num_comments: 10,
        is_self: false,
        is_gallery: true,
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('View animation');
    });
  });

  describe('poll posts', () => {
    it('should format poll posts correctly', async () => {
      mockMediaHandler.isGalleryPost.mockReturnValue(false);
      mockMediaHandler.isPollPost.mockReturnValue(true);

      const postData: RedditItemData = {
        id: 'poll1',
        name: 't3_poll1',
        title: 'Vote on this!',
        author: 'pollster',
        subreddit: 'polls',
        permalink: '/r/polls/comments/poll1/',
        created_utc: 1640995200,
        score: 300,
        num_comments: 100,
        is_self: true,
        selftext: 'Please vote!',
        poll_data: {
          total_vote_count: 1500,
          voting_end_timestamp: Date.now() + 86400000,
          options: [
            { id: 'opt1', text: 'Option A', vote_count: 800 },
            { id: 'opt2', text: 'Option B', vote_count: 500 },
            { id: 'opt3', text: 'Option C', vote_count: 200 },
          ],
        },
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('post_type: poll');
      expect(result).toContain('poll_total_votes: 1500');
      expect(result).toContain('poll_options_count: 3');
      expect(result).toContain('| Option | Votes | % |');
      expect(result).toContain('Option A');
      expect(result).toContain('Option B');
      expect(result).toContain('### Results');
    });

    it('should show user selection in poll', async () => {
      mockMediaHandler.isGalleryPost.mockReturnValue(false);
      mockMediaHandler.isPollPost.mockReturnValue(true);

      const postData: RedditItemData = {
        id: 'mypoll',
        name: 't3_mypoll',
        title: 'Poll I voted on',
        author: 'pollcreator',
        subreddit: 'polls',
        permalink: '/r/polls/comments/mypoll/',
        created_utc: 1640995200,
        score: 200,
        num_comments: 50,
        is_self: true,
        poll_data: {
          total_vote_count: 100,
          user_selection: 'opt1',
          options: [
            { id: 'opt1', text: 'My Choice', vote_count: 60 },
            { id: 'opt2', text: 'Other', vote_count: 40 },
          ],
        },
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('You voted');
      expect(result).toContain('My Choice ✓');
    });

    it('should show ended poll status', async () => {
      mockMediaHandler.isGalleryPost.mockReturnValue(false);
      mockMediaHandler.isPollPost.mockReturnValue(true);

      const postData: RedditItemData = {
        id: 'endedpoll',
        name: 't3_endedpoll',
        title: 'Ended Poll',
        author: 'pollster',
        subreddit: 'polls',
        permalink: '/r/polls/comments/endedpoll/',
        created_utc: 1640995200,
        score: 500,
        num_comments: 200,
        is_self: true,
        poll_data: {
          total_vote_count: 5000,
          voting_end_timestamp: Date.now() - 86400000, // Ended yesterday
          options: [
            { id: 'opt1', text: 'Winner', vote_count: 3000 },
            { id: 'opt2', text: 'Loser', vote_count: 2000 },
          ],
        },
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('Poll (Ended)');
    });
  });

  describe('enrichment metadata', () => {
    it('should include awards in frontmatter', async () => {
      const postData: RedditItemData = {
        id: 'awarded1',
        name: 't3_awarded1',
        title: 'Award Winning Post',
        author: 'winner',
        subreddit: 'bestof',
        permalink: '/r/bestof/comments/awarded1/',
        created_utc: 1640995200,
        score: 10000,
        num_comments: 500,
        is_self: true,
        selftext: 'Amazing content',
        total_awards_received: 15,
        gilded: 3,
        all_awardings: [
          { name: 'Gold', count: 3 },
          { name: 'Silver', count: 5 },
          { name: 'Wholesome', count: 7 },
        ],
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('total_awards: 15');
      expect(result).toContain('awards: [Gold (3), Silver (5), Wholesome (7)]');
      expect(result).toContain('gilded: 3');
      expect(result).toContain('🏆 15 awards');
    });

    it('should include status flags', async () => {
      const postData: RedditItemData = {
        id: 'flagged1',
        name: 't3_flagged1',
        title: 'Flagged Post',
        author: 'mod',
        subreddit: 'announcements',
        permalink: '/r/announcements/comments/flagged1/',
        created_utc: 1640995200,
        score: 5000,
        num_comments: 1000,
        is_self: true,
        selftext: 'Important announcement',
        stickied: true,
        spoiler: true,
        archived: true,
        locked: true,
        over_18: true,
        contest_mode: true,
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('stickied: true');
      expect(result).toContain('spoiler: true');
      expect(result).toContain('archived: true');
      expect(result).toContain('locked: true');
      expect(result).toContain('nsfw: true');
      expect(result).toContain('contest_mode: true');
      expect(result).toContain('📌 Stickied');
      expect(result).toContain('🔒 Locked');
      expect(result).toContain('📦 Archived');
      expect(result).toContain('⚠️ Spoiler');
      expect(result).toContain('🔞 NSFW');
    });

    it('should include suggested sort', async () => {
      const postData: RedditItemData = {
        id: 'sorted1',
        name: 't3_sorted1',
        title: 'AMA Post',
        author: 'celebrity',
        subreddit: 'IAmA',
        permalink: '/r/IAmA/comments/sorted1/',
        created_utc: 1640995200,
        score: 20000,
        num_comments: 5000,
        is_self: true,
        selftext: 'Ask me anything!',
        suggested_sort: 'qa',
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('suggested_sort: qa');
    });

    it('should include edited timestamp for posts', async () => {
      const postData: RedditItemData = {
        id: 'editedpost',
        name: 't3_editedpost',
        title: 'Edited Post',
        author: 'editor',
        subreddit: 'test',
        permalink: '/r/test/comments/editedpost/',
        created_utc: 1640995200,
        score: 100,
        num_comments: 10,
        is_self: true,
        selftext: 'Updated content',
        edited: 1640998800,
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('edited:');
    });
  });

  describe('media content formatting', () => {
    beforeEach(() => {
      mockMediaHandler.isGalleryPost.mockReturnValue(false);
      mockMediaHandler.isPollPost.mockReturnValue(false);
    });

    it('should format GIF content', async () => {
      mockMediaHandler.analyzeMedia.mockReturnValue({
        type: 'gif',
        mediaType: 'gif-platform',
        isMedia: true,
        domain: 'giphy.com',
        canEmbed: true,
      });
      mockMediaHandler.shouldDownloadMedia.mockReturnValue(false);

      const postData: RedditItemData = {
        id: 'gif1',
        name: 't3_gif1',
        title: 'Funny GIF',
        author: 'gifuser',
        subreddit: 'gifs',
        permalink: '/r/gifs/comments/gif1/',
        created_utc: 1640995200,
        score: 200,
        num_comments: 20,
        is_self: false,
        url: 'https://giphy.com/gifs/abc123',
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('🎞️ **GIF/Animation**');
      expect(result).toContain('View Animation');
    });

    it('should format video with thumbnail', async () => {
      mockMediaHandler.analyzeMedia.mockReturnValue({
        type: 'video',
        mediaType: 'video',
        isMedia: true,
        domain: 'streamable.com',
        canEmbed: true,
      });
      mockMediaHandler.shouldDownloadMedia.mockReturnValue(false);

      const postData: RedditItemData = {
        id: 'video1',
        name: 't3_video1',
        title: 'Video Post',
        author: 'videouser',
        subreddit: 'videos',
        permalink: '/r/videos/comments/video1/',
        created_utc: 1640995200,
        score: 300,
        num_comments: 30,
        is_self: false,
        url: 'https://streamable.com/xyz',
        preview: {
          images: [
            { source: { url: 'https://preview.redd.it/thumb.jpg', width: 1920, height: 1080 } },
          ],
        },
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('🎥 **Video**');
      expect(result).toContain('Video Thumbnail');
    });

    it('should format image with resolution', async () => {
      mockMediaHandler.analyzeMedia.mockReturnValue({
        type: 'image',
        mediaType: 'image',
        isMedia: true,
        domain: 'i.imgur.com',
        canEmbed: true,
      });
      mockMediaHandler.shouldDownloadMedia.mockReturnValue(false);

      const postData: RedditItemData = {
        id: 'img1',
        name: 't3_img1',
        title: 'Image Post',
        author: 'imguser',
        subreddit: 'pics',
        permalink: '/r/pics/comments/img1/',
        created_utc: 1640995200,
        score: 400,
        num_comments: 40,
        is_self: false,
        url: 'https://i.imgur.com/abc.jpg',
        preview: {
          images: [{ source: { url: 'https://i.imgur.com/abc.jpg', width: 3840, height: 2160 } }],
        },
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('📸 **Image**');
      expect(result).toContain('Resolution: 3840×2160');
    });

    it('should embed downloaded media', async () => {
      mockMediaHandler.analyzeMedia.mockReturnValue({
        type: 'image',
        mediaType: 'reddit-image',
        isMedia: true,
        domain: 'i.redd.it',
        canEmbed: true,
      });
      mockMediaHandler.shouldDownloadMedia.mockReturnValue(true);
      mockMediaHandler.generateMediaFilename.mockReturnValue('test_image.jpg');
      mockMediaHandler.downloadMediaFile.mockResolvedValue('Attachments/test_image.jpg');

      const postData: RedditItemData = {
        id: 'dl1',
        name: 't3_dl1',
        title: 'Downloaded Image',
        author: 'dluser',
        subreddit: 'pics',
        permalink: '/r/pics/comments/dl1/',
        created_utc: 1640995200,
        score: 500,
        num_comments: 50,
        is_self: false,
        url: 'https://i.redd.it/downloaded.jpg',
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('![[test_image.jpg]]');
      expect(result).toContain('Downloaded locally: test_image.jpg');
    });

    it('should extract YouTube video ID and embed', async () => {
      mockMediaHandler.analyzeMedia.mockReturnValue({
        type: 'video',
        mediaType: 'youtube',
        isMedia: true,
        domain: 'youtube.com',
        canEmbed: true,
      });
      mockMediaHandler.extractYouTubeId.mockReturnValue('dQw4w9WgXcQ');
      mockMediaHandler.shouldDownloadMedia.mockReturnValue(false);

      const postData: RedditItemData = {
        id: 'yt1',
        name: 't3_yt1',
        title: 'YouTube Video',
        author: 'ytuser',
        subreddit: 'videos',
        permalink: '/r/videos/comments/yt1/',
        created_utc: 1640995200,
        score: 600,
        num_comments: 60,
        is_self: false,
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('🎬 **YouTube Video**');
      expect(result).toContain('youtube.com/embed/dQw4w9WgXcQ');
    });
  });

  describe('footer formatting', () => {
    beforeEach(() => {
      mockMediaHandler.isGalleryPost.mockReturnValue(false);
      mockMediaHandler.isPollPost.mockReturnValue(false);
    });

    it('should include gallery tag for gallery posts', async () => {
      mockMediaHandler.isGalleryPost.mockReturnValue(true);
      mockMediaHandler.extractGalleryImages.mockReturnValue([
        { id: 'img1', url: 'https://i.redd.it/img1.jpg' },
      ] as GalleryImage[]);
      mockMediaHandler.downloadGalleryImages.mockResolvedValue([]);

      const postData: RedditItemData = {
        id: 'galfoot',
        name: 't3_galfoot',
        title: 'Gallery Footer Test',
        author: 'user',
        subreddit: 'test',
        permalink: '/r/test/comments/galfoot/',
        created_utc: 1640995200,
        score: 100,
        num_comments: 10,
        is_self: false,
        is_gallery: true,
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('#reddit-gallery');
    });

    it('should include poll tag for poll posts', async () => {
      mockMediaHandler.isPollPost.mockReturnValue(true);

      const postData: RedditItemData = {
        id: 'pollfoot',
        name: 't3_pollfoot',
        title: 'Poll Footer Test',
        author: 'pollster',
        subreddit: 'polls',
        permalink: '/r/polls/comments/pollfoot/',
        created_utc: 1640995200,
        score: 100,
        num_comments: 50,
        is_self: true,
        poll_data: {
          total_vote_count: 100,
          options: [
            { id: 'opt1', text: 'A', vote_count: 50 },
            { id: 'opt2', text: 'B', vote_count: 50 },
          ],
        },
      };

      const result = await formatter.formatRedditContent(postData, false);

      expect(result).toContain('#reddit-poll');
    });

    it('should include content origin tag', async () => {
      const postData: RedditItemData = {
        id: 'origintag',
        name: 't3_origintag',
        title: 'Origin Tag Test',
        author: 'user',
        subreddit: 'test',
        permalink: '/r/test/comments/origintag/',
        created_utc: 1640995200,
        score: 50,
        num_comments: 5,
        is_self: true,
      };

      const result = await formatter.formatRedditContent(postData, false, 'upvoted');

      expect(result).toContain('#reddit-upvoted');
    });
  });
});
