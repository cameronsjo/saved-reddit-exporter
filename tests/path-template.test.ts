import {
  buildTemplateVariables,
  applyTemplate,
  generateFolderPath,
  generateFilename,
  getTemplateVariablesDocs,
  FOLDER_TEMPLATE_PRESETS,
  FILENAME_TEMPLATE_PRESETS,
  TemplateVariables,
} from '../src/utils/path-template';
import { RedditItemData, ContentOrigin } from '../src/types';

describe('path-template', () => {
  // Helper to create mock Reddit item data
  // Use timestamps that are mid-day UTC to avoid timezone edge cases
  const createMockPost = (overrides: Partial<RedditItemData> = {}): RedditItemData => ({
    id: 'abc123',
    name: 't3_abc123',
    title: 'Test Post Title',
    author: 'testuser',
    subreddit: 'programming',
    permalink: '/r/programming/comments/abc123/test_post/',
    created_utc: 1704110400, // 2024-01-01 12:00:00 UTC (mid-day to avoid TZ issues)
    score: 100,
    url: 'https://example.com',
    is_self: false,
    ...overrides,
  });

  const createMockComment = (overrides: Partial<RedditItemData> = {}): RedditItemData => ({
    id: 'xyz789',
    name: 't1_xyz789',
    author: 'commenter',
    subreddit: 'learnprogramming',
    permalink: '/r/learnprogramming/comments/abc123/post/xyz789/',
    created_utc: 1706788800, // 2024-02-01 12:00:00 UTC (mid-day to avoid TZ issues)
    score: 50,
    body: 'This is a comment body',
    link_title: 'Parent Post Title',
    ...overrides,
  });

  describe('buildTemplateVariables', () => {
    it('should build variables for a text post', () => {
      const data = createMockPost({ is_self: true, selftext: 'Post body' });
      const vars = buildTemplateVariables(data, false, 'saved');

      // Compute expected date values based on local timezone
      const expectedDate = new Date(data.created_utc * 1000);

      expect(vars.subreddit).toBe('programming');
      expect(vars.author).toBe('testuser');
      expect(vars.type).toBe('post');
      expect(vars.origin).toBe('saved');
      expect(vars.year).toBe(expectedDate.getFullYear().toString());
      expect(vars.month).toBe(String(expectedDate.getMonth() + 1).padStart(2, '0'));
      expect(vars.day).toBe(String(expectedDate.getDate()).padStart(2, '0'));
      expect(vars.title).toBe('Test Post Title');
      expect(vars.id).toBe('abc123');
      expect(vars.postType).toBe('text');
      expect(vars.score).toBe('100');
    });

    it('should build variables for a link post', () => {
      const data = createMockPost({ is_self: false, url: 'https://example.com' });
      const vars = buildTemplateVariables(data, false, 'upvoted');

      expect(vars.type).toBe('post');
      expect(vars.origin).toBe('upvoted');
      expect(vars.postType).toBe('link');
    });

    it('should build variables for an image post', () => {
      const data = createMockPost({
        is_self: false,
        url: 'https://i.imgur.com/image.jpg',
        post_hint: 'image',
      });
      const vars = buildTemplateVariables(data, false, 'saved');

      expect(vars.postType).toBe('image');
    });

    it('should detect image post by URL extension', () => {
      const data = createMockPost({
        is_self: false,
        url: 'https://example.com/photo.png',
      });
      const vars = buildTemplateVariables(data, false, 'saved');

      expect(vars.postType).toBe('image');
    });

    it('should build variables for a video post', () => {
      const data = createMockPost({
        is_self: false,
        is_video: true,
        post_hint: 'hosted:video',
      });
      const vars = buildTemplateVariables(data, false, 'saved');

      expect(vars.postType).toBe('video');
    });

    it('should build variables for a comment', () => {
      const data = createMockComment();
      const vars = buildTemplateVariables(data, true, 'saved');

      // Compute expected date values based on local timezone
      const expectedDate = new Date(data.created_utc * 1000);

      expect(vars.type).toBe('comment');
      expect(vars.title).toBe('Parent Post Title');
      expect(vars.subreddit).toBe('learnprogramming');
      expect(vars.year).toBe(expectedDate.getFullYear().toString());
      expect(vars.month).toBe(String(expectedDate.getMonth() + 1).padStart(2, '0'));
      expect(vars.day).toBe(String(expectedDate.getDate()).padStart(2, '0'));
    });

    it('should handle comment without link_title', () => {
      const data = createMockComment({ link_title: undefined, author: 'someone' });
      const vars = buildTemplateVariables(data, true, 'commented');

      expect(vars.title).toBe('Comment by someone');
      expect(vars.origin).toBe('commented');
    });

    it('should handle missing subreddit', () => {
      const data = createMockPost({ subreddit: undefined as unknown as string });
      const vars = buildTemplateVariables(data, false, 'saved');

      expect(vars.subreddit).toBe('unknown');
    });

    it('should handle missing author', () => {
      const data = createMockPost({ author: undefined as unknown as string });
      const vars = buildTemplateVariables(data, false, 'saved');

      expect(vars.author).toBe('unknown');
    });

    it('should handle post flair', () => {
      const data = createMockPost({ link_flair_text: 'Discussion' });
      const vars = buildTemplateVariables(data, false, 'saved');

      expect(vars.flair).toBe('Discussion');
    });

    it('should handle missing flair', () => {
      const data = createMockPost({ link_flair_text: undefined });
      const vars = buildTemplateVariables(data, false, 'saved');

      // sanitizeFileName('') returns 'Untitled' for empty strings
      expect(vars.flair).toBe('Untitled');
    });

    it('should handle missing title for post', () => {
      const data = createMockPost({ title: undefined });
      const vars = buildTemplateVariables(data, false, 'saved');

      expect(vars.title).toBe('Untitled');
    });

    it('should handle missing score', () => {
      const data = createMockPost({ score: undefined as unknown as number });
      const vars = buildTemplateVariables(data, false, 'saved');

      expect(vars.score).toBe('0');
    });

    it('should handle submitted content origin', () => {
      const data = createMockPost();
      const vars = buildTemplateVariables(data, false, 'submitted');

      expect(vars.origin).toBe('submitted');
    });
  });

  describe('applyTemplate', () => {
    const mockVars: TemplateVariables = {
      subreddit: 'programming',
      author: 'testuser',
      type: 'post',
      origin: 'saved',
      year: '2024',
      month: '01',
      day: '15',
      title: 'My Test Post',
      id: 'abc123',
      flair: 'Discussion',
      postType: 'text',
      score: '100',
    };

    it('should replace single variable', () => {
      expect(applyTemplate('{subreddit}', mockVars)).toBe('programming');
    });

    it('should replace multiple variables', () => {
      expect(applyTemplate('{subreddit}/{year}/{month}', mockVars)).toBe('programming/2024/01');
    });

    it('should handle case-insensitive replacement', () => {
      expect(applyTemplate('{SUBREDDIT}/{Year}/{MONTH}', mockVars)).toBe('programming/2024/01');
    });

    it('should return empty string for empty template', () => {
      expect(applyTemplate('', mockVars)).toBe('');
    });

    it('should clean up unreplaced variables', () => {
      expect(applyTemplate('{subreddit}/{unknown}', mockVars)).toBe('programming');
    });

    it('should clean up double slashes', () => {
      const varsWithEmptyFlair = { ...mockVars, flair: '' };
      expect(applyTemplate('{subreddit}/{flair}/{year}', varsWithEmptyFlair)).toBe(
        'programming/2024'
      );
    });

    it('should remove trailing slashes', () => {
      expect(applyTemplate('{subreddit}/', mockVars)).toBe('programming');
    });

    it('should handle complex templates', () => {
      expect(applyTemplate('{origin}/{type}s/{subreddit}/{year}', mockVars)).toBe(
        'saved/posts/programming/2024'
      );
    });

    it('should handle filename templates', () => {
      expect(applyTemplate('{year}-{month}-{day} {title}', mockVars)).toBe(
        '2024-01-15 My Test Post'
      );
    });

    it('should handle templates with static text', () => {
      expect(applyTemplate('Reddit - {subreddit} - {title}', mockVars)).toBe(
        'Reddit - programming - My Test Post'
      );
    });
  });

  describe('generateFolderPath', () => {
    const mockVars: TemplateVariables = {
      subreddit: 'programming',
      author: 'testuser',
      type: 'post',
      origin: 'saved',
      year: '2024',
      month: '01',
      day: '15',
      title: 'My Test Post',
      id: 'abc123',
      flair: '',
      postType: 'text',
      score: '100',
    };

    it('should use base location when no template and legacy off', () => {
      expect(generateFolderPath('Reddit Saved', '', mockVars, false)).toBe('Reddit Saved');
    });

    it('should use subreddit subfolder when legacy mode on', () => {
      expect(generateFolderPath('Reddit Saved', '', mockVars, true)).toBe(
        'Reddit Saved/programming'
      );
    });

    it('should apply folder template', () => {
      expect(generateFolderPath('Reddit Saved', '{subreddit}/{year}', mockVars, false)).toBe(
        'Reddit Saved/programming/2024'
      );
    });

    it('should prefer template over legacy setting', () => {
      expect(generateFolderPath('Reddit Saved', '{year}/{month}', mockVars, true)).toBe(
        'Reddit Saved/2024/01'
      );
    });

    it('should handle template with flair variable', () => {
      const varsWithFlair = { ...mockVars, flair: 'Discussion' };
      expect(generateFolderPath('Reddit Saved', '{flair}', varsWithFlair, false)).toBe(
        'Reddit Saved/Discussion'
      );
    });
  });

  describe('generateFilename', () => {
    const mockVars: TemplateVariables = {
      subreddit: 'programming',
      author: 'testuser',
      type: 'post',
      origin: 'saved',
      year: '2024',
      month: '01',
      day: '15',
      title: 'My Test Post',
      id: 'abc123',
      flair: 'Discussion',
      postType: 'text',
      score: '100',
    };

    it('should use title as default when no template', () => {
      expect(generateFilename('', mockVars)).toBe('My Test Post');
    });

    it('should fall back to id if title is empty', () => {
      const varsNoTitle = { ...mockVars, title: '' };
      expect(generateFilename('', varsNoTitle)).toBe('abc123');
    });

    it('should apply filename template', () => {
      expect(generateFilename('{year}-{month}-{day} {title}', mockVars)).toBe(
        '2024-01-15 My Test Post'
      );
    });

    it('should use template with flair', () => {
      const varsWithFlair = { ...mockVars, flair: 'Discussion' };
      expect(generateFilename('{flair} - {title}', varsWithFlair)).toBe(
        'Discussion - My Test Post'
      );
    });

    it('should handle subreddit and title template', () => {
      expect(generateFilename('{subreddit} - {title}', mockVars)).toBe(
        'programming - My Test Post'
      );
    });
  });

  describe('getTemplateVariablesDocs', () => {
    it('should return documentation for all template variables', () => {
      const docs = getTemplateVariablesDocs();

      expect(docs.length).toBeGreaterThan(0);
      expect(docs.some(d => d.variable === '{subreddit}')).toBe(true);
      expect(docs.some(d => d.variable === '{author}')).toBe(true);
      expect(docs.some(d => d.variable === '{type}')).toBe(true);
      expect(docs.some(d => d.variable === '{origin}')).toBe(true);
      expect(docs.some(d => d.variable === '{year}')).toBe(true);
      expect(docs.some(d => d.variable === '{month}')).toBe(true);
      expect(docs.some(d => d.variable === '{day}')).toBe(true);
      expect(docs.some(d => d.variable === '{title}')).toBe(true);
      expect(docs.some(d => d.variable === '{id}')).toBe(true);
      expect(docs.some(d => d.variable === '{flair}')).toBe(true);
      expect(docs.some(d => d.variable === '{postType}')).toBe(true);
      expect(docs.some(d => d.variable === '{score}')).toBe(true);
    });

    it('should have description and example for each variable', () => {
      const docs = getTemplateVariablesDocs();

      for (const doc of docs) {
        expect(doc.variable).toBeTruthy();
        expect(doc.description).toBeTruthy();
        expect(doc.example).toBeTruthy();
      }
    });
  });

  describe('FOLDER_TEMPLATE_PRESETS', () => {
    it('should have expected presets', () => {
      expect(FOLDER_TEMPLATE_PRESETS.flat).toBe('');
      expect(FOLDER_TEMPLATE_PRESETS.bySubreddit).toBe('{subreddit}');
      expect(FOLDER_TEMPLATE_PRESETS.byDate).toBe('{year}/{month}');
      expect(FOLDER_TEMPLATE_PRESETS.bySubredditAndDate).toBe('{subreddit}/{year}/{month}');
      expect(FOLDER_TEMPLATE_PRESETS.byType).toBe('{type}s');
      expect(FOLDER_TEMPLATE_PRESETS.byOrigin).toBe('{origin}');
      expect(FOLDER_TEMPLATE_PRESETS.bySubredditAndType).toBe('{subreddit}/{type}s');
      expect(FOLDER_TEMPLATE_PRESETS.comprehensive).toBe('{origin}/{subreddit}/{year}');
    });
  });

  describe('FILENAME_TEMPLATE_PRESETS', () => {
    it('should have expected presets', () => {
      expect(FILENAME_TEMPLATE_PRESETS.titleOnly).toBe('{title}');
      expect(FILENAME_TEMPLATE_PRESETS.titleWithDate).toBe('{year}-{month}-{day} {title}');
      expect(FILENAME_TEMPLATE_PRESETS.subredditAndTitle).toBe('{subreddit} - {title}');
      expect(FILENAME_TEMPLATE_PRESETS.idAndTitle).toBe('{id} - {title}');
      expect(FILENAME_TEMPLATE_PRESETS.dateAndTitle).toBe('{year}{month}{day} - {title}');
    });
  });
});
