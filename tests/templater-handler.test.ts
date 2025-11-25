import { TemplaterHandler } from '../src/templater-handler';
import { RedditSavedSettings, RedditItemData, MediaInfo } from '../src/types';
import { App, TFile, Vault } from 'obsidian';

// Mock Obsidian modules
jest.mock('obsidian');

describe('TemplaterHandler', () => {
  let handler: TemplaterHandler;
  let mockSettings: RedditSavedSettings;
  let mockApp: App;
  let mockVault: jest.Mocked<Vault>;

  const createMockRedditData = (overrides: Partial<RedditItemData> = {}): RedditItemData => ({
    id: 'test123',
    name: 't3_test123',
    title: 'Test Post Title',
    author: 'testuser',
    subreddit: 'testsubreddit',
    permalink: '/r/testsubreddit/comments/test123/test_post_title/',
    created_utc: 1640995200, // 2022-01-01
    score: 100,
    num_comments: 25,
    upvote_ratio: 0.95,
    is_self: true,
    selftext: 'This is test content',
    ...overrides,
  });

  const createMockMediaInfo = (overrides: Partial<MediaInfo> = {}): MediaInfo => ({
    type: 'text',
    mediaType: null,
    isMedia: false,
    domain: 'reddit.com',
    canEmbed: false,
    ...overrides,
  });

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
      downloadImages: false,
      downloadGifs: false,
      downloadVideos: false,
      mediaFolder: 'Attachments',
      useTemplater: false,
      postTemplatePath: '',
      commentTemplatePath: '',
    };

    // Create mock vault with jest functions
    mockVault = {
      getMarkdownFiles: jest.fn().mockReturnValue([]),
      getAbstractFileByPath: jest.fn().mockReturnValue(null),
      createFolder: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
      createBinary: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(''),
    } as unknown as jest.Mocked<Vault>;

    mockApp = new App();
    mockApp.vault = mockVault;
    handler = new TemplaterHandler(mockApp, mockSettings);
  });

  describe('isTemplaterAvailable', () => {
    it('should return false when Templater plugin is not installed', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockApp as any).plugins = { plugins: {} };

      const result = handler.isTemplaterAvailable();

      expect(result).toBe(false);
    });

    it('should return false when Templater plugin exists but has no templates folder', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockApp as any).plugins = {
        plugins: {
          'templater-obsidian': {
            settings: {},
          },
        },
      };

      const result = handler.isTemplaterAvailable();

      expect(result).toBe(false);
    });

    it('should return true when Templater plugin is properly configured', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockApp as any).plugins = {
        plugins: {
          'templater-obsidian': {
            settings: {
              templates_folder: 'Templates',
            },
          },
        },
      };

      const result = handler.isTemplaterAvailable();

      expect(result).toBe(true);
    });
  });

  describe('shouldUseTemplater', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockApp as any).plugins = {
        plugins: {
          'templater-obsidian': {
            settings: {
              templates_folder: 'Templates',
            },
          },
        },
      };
    });

    it('should return false when useTemplater is disabled', () => {
      mockSettings.useTemplater = false;
      mockSettings.postTemplatePath = 'Templates/Post.md';

      const result = handler.shouldUseTemplater(false);

      expect(result).toBe(false);
    });

    it('should return false when no template path is configured for posts', () => {
      mockSettings.useTemplater = true;
      mockSettings.postTemplatePath = '';

      const result = handler.shouldUseTemplater(false);

      expect(result).toBe(false);
    });

    it('should return false when no template path is configured for comments', () => {
      mockSettings.useTemplater = true;
      mockSettings.commentTemplatePath = '';

      const result = handler.shouldUseTemplater(true);

      expect(result).toBe(false);
    });

    it('should return true for posts when properly configured', () => {
      mockSettings.useTemplater = true;
      mockSettings.postTemplatePath = 'Templates/Post.md';

      const result = handler.shouldUseTemplater(false);

      expect(result).toBe(true);
    });

    it('should return true for comments when properly configured', () => {
      mockSettings.useTemplater = true;
      mockSettings.commentTemplatePath = 'Templates/Comment.md';

      const result = handler.shouldUseTemplater(true);

      expect(result).toBe(true);
    });
  });

  describe('getTemplatePath', () => {
    it('should return post template path for posts', () => {
      mockSettings.postTemplatePath = 'Templates/Post.md';
      mockSettings.commentTemplatePath = 'Templates/Comment.md';

      const result = handler.getTemplatePath(false);

      expect(result).toBe('Templates/Post.md');
    });

    it('should return comment template path for comments', () => {
      mockSettings.postTemplatePath = 'Templates/Post.md';
      mockSettings.commentTemplatePath = 'Templates/Comment.md';

      const result = handler.getTemplatePath(true);

      expect(result).toBe('Templates/Comment.md');
    });
  });

  describe('buildContext', () => {
    it('should build context for a post', () => {
      const data = createMockRedditData();

      const context = handler.buildContext(data, false);

      expect(context.item).toBe(data);
      expect(context.isComment).toBe(false);
      expect(context.type).toBe('reddit-post');
      expect(context.permalink).toBe(
        'https://reddit.com/r/testsubreddit/comments/test123/test_post_title/'
      );
      expect(context.subredditUrl).toBe('https://reddit.com/r/testsubreddit');
      expect(context.authorUrl).toBe('https://reddit.com/u/testuser');
      expect(context.tags).toContain('#reddit');
      expect(context.tags).toContain('#r-testsubreddit');
      expect(context.tags).toContain('#reddit-post');
    });

    it('should build context for a comment', () => {
      const data = createMockRedditData({
        body: 'This is a comment',
        link_title: 'Parent Post Title',
        is_submitter: true,
      });

      const context = handler.buildContext(data, true);

      expect(context.isComment).toBe(true);
      expect(context.type).toBe('reddit-comment');
      expect(context.tags).toContain('#reddit-comment');
      expect(context.tags).not.toContain('#reddit-post');
    });

    it('should include flair in tags when present', () => {
      const data = createMockRedditData({
        link_flair_text: 'Discussion',
      });

      const context = handler.buildContext(data, false);

      expect(context.tags).toContain('#discussion');
    });

    it('should include media info when provided', () => {
      const data = createMockRedditData();
      const mediaInfo = createMockMediaInfo({
        isMedia: true,
        mediaType: 'image',
      });

      const context = handler.buildContext(data, false, mediaInfo, '/path/to/media.jpg');

      expect(context.mediaInfo).toBe(mediaInfo);
      expect(context.localMediaPath).toBe('/path/to/media.jpg');
    });

    it('should format dates correctly', () => {
      const data = createMockRedditData({
        created_utc: 1640995200, // 2022-01-01T00:00:00.000Z
      });

      const context = handler.buildContext(data, false);

      expect(context.created).toBe('2022-01-01T00:00:00.000Z');
      // createdDate will be locale-dependent, so just check it's not empty
      expect(context.createdDate).toBeTruthy();
    });
  });

  describe('processTemplate', () => {
    beforeEach(() => {
      mockSettings.useTemplater = true;
      mockSettings.postTemplatePath = 'Templates/Post.md';
    });

    it('should return null when template file does not exist', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      const context = handler.buildContext(createMockRedditData(), false);
      const result = await handler.processTemplate(context);

      expect(result).toBeNull();
    });

    it('should replace variables in template content', async () => {
      const mockFile = {
        path: 'Templates/Post.md',
      } as TFile;

      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.read.mockResolvedValue(
        '# {{reddit.title}}\n\nBy: {{reddit.author}}\nSubreddit: {{reddit.subreddit}}\nScore: {{reddit.score}}'
      );

      const data = createMockRedditData({
        title: 'My Test Post',
        author: 'myuser',
        subreddit: 'mysubreddit',
        score: 42,
      });

      const context = handler.buildContext(data, false);
      const result = await handler.processTemplate(context);

      expect(result).toBe('# My Test Post\n\nBy: myuser\nSubreddit: mysubreddit\nScore: 42');
    });

    it('should replace all Reddit variables', async () => {
      const mockFile = {
        path: 'Templates/Post.md',
      } as TFile;

      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.read.mockResolvedValue(
        '{{reddit.id}} {{reddit.permalink}} {{reddit.created}} {{reddit.type}}'
      );

      const data = createMockRedditData();
      const context = handler.buildContext(data, false);
      const result = await handler.processTemplate(context);

      expect(result).toContain('test123');
      expect(result).toContain('https://reddit.com');
      expect(result).toContain('2022-01-01');
      expect(result).toContain('reddit-post');
    });

    it('should handle empty/missing field values gracefully', async () => {
      const mockFile = {
        path: 'Templates/Post.md',
      } as TFile;

      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.read.mockResolvedValue('URL: {{reddit.url}}\nFlair: {{reddit.flair}}');

      const data = createMockRedditData({
        url: undefined,
        link_flair_text: undefined,
      });

      const context = handler.buildContext(data, false);
      const result = await handler.processTemplate(context);

      expect(result).toBe('URL: \nFlair: ');
    });

    it('should handle comment-specific variables', async () => {
      mockSettings.commentTemplatePath = 'Templates/Comment.md';
      const mockFile = {
        path: 'Templates/Comment.md',
      } as TFile;

      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockVault.read.mockResolvedValue(
        'Body: {{reddit.body}}\nLink Title: {{reddit.linkTitle}}\nIs OP: {{reddit.isSubmitter}}'
      );

      const data = createMockRedditData({
        body: 'This is my comment',
        link_title: 'Original Post',
        is_submitter: true,
      });

      const context = handler.buildContext(data, true);
      const result = await handler.processTemplate(context);

      expect(result).toBe('Body: This is my comment\nLink Title: Original Post\nIs OP: true');
    });
  });

  describe('validateTemplates', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockApp as any).plugins = {
        plugins: {
          'templater-obsidian': {
            settings: {
              templates_folder: 'Templates',
            },
          },
        },
      };
    });

    it('should return valid when Templater is disabled', () => {
      mockSettings.useTemplater = false;

      const result = handler.validateTemplates();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error when Templater is enabled but plugin not available', () => {
      mockSettings.useTemplater = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockApp as any).plugins = { plugins: {} };

      const result = handler.validateTemplates();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Templater plugin is not installed or enabled');
    });

    it('should return error when no template paths are configured', () => {
      mockSettings.useTemplater = true;
      mockSettings.postTemplatePath = '';
      mockSettings.commentTemplatePath = '';

      const result = handler.validateTemplates();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No template paths configured');
    });

    it('should return error when post template file does not exist', () => {
      mockSettings.useTemplater = true;
      mockSettings.postTemplatePath = 'Templates/NonExistent.md';
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      const result = handler.validateTemplates();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Post template not found: Templates/NonExistent.md');
    });

    it('should return valid when templates exist', () => {
      mockSettings.useTemplater = true;
      mockSettings.postTemplatePath = 'Templates/Post.md';
      mockVault.getAbstractFileByPath.mockReturnValue({} as TFile);

      const result = handler.validateTemplates();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('runTemplaterOnFile', () => {
    it('should call Templater overwrite_file_commands when available', async () => {
      const mockFile = {} as TFile;
      const mockOverwriteFileCommands = jest.fn().mockResolvedValue(undefined);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockApp as any).plugins = {
        plugins: {
          'templater-obsidian': {
            templater: {
              overwrite_file_commands: mockOverwriteFileCommands,
            },
          },
        },
      };

      await handler.runTemplaterOnFile(mockFile);

      expect(mockOverwriteFileCommands).toHaveBeenCalledWith(mockFile);
    });

    it('should not throw when Templater plugin is not available', async () => {
      const mockFile = {} as TFile;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockApp as any).plugins = { plugins: {} };

      await expect(handler.runTemplaterOnFile(mockFile)).resolves.not.toThrow();
    });

    it('should handle errors gracefully', async () => {
      const mockFile = {} as TFile;
      const mockOverwriteFileCommands = jest.fn().mockRejectedValue(new Error('Templater error'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockApp as any).plugins = {
        plugins: {
          'templater-obsidian': {
            templater: {
              overwrite_file_commands: mockOverwriteFileCommands,
            },
          },
        },
      };

      // Should not throw, just log error
      await expect(handler.runTemplaterOnFile(mockFile)).resolves.not.toThrow();
    });
  });
});
