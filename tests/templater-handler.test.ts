import { App, TFile } from 'obsidian';
import { TemplaterHandler } from '../src/templater-handler';
import { RedditSavedSettings, RedditItemData } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/constants';

// Mock obsidian module
jest.mock('obsidian', () => ({
  App: jest.fn().mockImplementation(() => ({
    vault: {
      getAbstractFileByPath: jest.fn(),
      read: jest.fn(),
    },
    plugins: {
      plugins: {},
    },
  })),
  TFile: jest.fn(),
}));

describe('TemplaterHandler', () => {
  let mockApp: App;
  let mockSettings: RedditSavedSettings;
  let mockVault: {
    getAbstractFileByPath: jest.Mock;
    read: jest.Mock;
  };
  let handler: TemplaterHandler;

  beforeEach(() => {
    mockVault = {
      getAbstractFileByPath: jest.fn().mockReturnValue(null),
      read: jest.fn().mockResolvedValue(''),
    };

    mockApp = {
      vault: mockVault,
      plugins: {
        plugins: {},
      },
    } as unknown as App;

    mockSettings = {
      ...DEFAULT_SETTINGS,
      useTemplater: false,
      postTemplatePath: '',
      commentTemplatePath: '',
    };

    handler = new TemplaterHandler(mockApp, mockSettings);
  });

  describe('isTemplaterAvailable', () => {
    it('should return false when Templater plugin is not installed', () => {
      expect(handler.isTemplaterAvailable()).toBe(false);
    });

    it('should return false when Templater has no templates folder', () => {
      (mockApp as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins.plugins = {
        'templater-obsidian': {
          settings: {},
        },
      };

      handler = new TemplaterHandler(mockApp, mockSettings);
      expect(handler.isTemplaterAvailable()).toBe(false);
    });

    it('should return true when Templater is properly configured', () => {
      (mockApp as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins.plugins = {
        'templater-obsidian': {
          settings: {
            templates_folder: 'templates',
          },
        },
      };

      handler = new TemplaterHandler(mockApp, mockSettings);
      expect(handler.isTemplaterAvailable()).toBe(true);
    });
  });

  describe('shouldUseTemplater', () => {
    it('should return false when useTemplater is disabled', () => {
      mockSettings.useTemplater = false;
      handler = new TemplaterHandler(mockApp, mockSettings);

      expect(handler.shouldUseTemplater(false)).toBe(false);
      expect(handler.shouldUseTemplater(true)).toBe(false);
    });

    it('should return false when Templater is not available', () => {
      mockSettings.useTemplater = true;
      mockSettings.postTemplatePath = 'templates/post.md';
      handler = new TemplaterHandler(mockApp, mockSettings);

      expect(handler.shouldUseTemplater(false)).toBe(false);
    });

    it('should return false when no template path configured', () => {
      mockSettings.useTemplater = true;
      (mockApp as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins.plugins = {
        'templater-obsidian': {
          settings: { templates_folder: 'templates' },
        },
      };
      handler = new TemplaterHandler(mockApp, mockSettings);

      expect(handler.shouldUseTemplater(false)).toBe(false);
    });

    it('should return true when properly configured for posts', () => {
      mockSettings.useTemplater = true;
      mockSettings.postTemplatePath = 'templates/post.md';
      (mockApp as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins.plugins = {
        'templater-obsidian': {
          settings: { templates_folder: 'templates' },
        },
      };
      handler = new TemplaterHandler(mockApp, mockSettings);

      expect(handler.shouldUseTemplater(false)).toBe(true);
    });

    it('should return true when properly configured for comments', () => {
      mockSettings.useTemplater = true;
      mockSettings.commentTemplatePath = 'templates/comment.md';
      (mockApp as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins.plugins = {
        'templater-obsidian': {
          settings: { templates_folder: 'templates' },
        },
      };
      handler = new TemplaterHandler(mockApp, mockSettings);

      expect(handler.shouldUseTemplater(true)).toBe(true);
    });
  });

  describe('getTemplatePath', () => {
    it('should return post template path for non-comments', () => {
      mockSettings.postTemplatePath = 'templates/post.md';
      mockSettings.commentTemplatePath = 'templates/comment.md';
      handler = new TemplaterHandler(mockApp, mockSettings);

      expect(handler.getTemplatePath(false)).toBe('templates/post.md');
    });

    it('should return comment template path for comments', () => {
      mockSettings.postTemplatePath = 'templates/post.md';
      mockSettings.commentTemplatePath = 'templates/comment.md';
      handler = new TemplaterHandler(mockApp, mockSettings);

      expect(handler.getTemplatePath(true)).toBe('templates/comment.md');
    });
  });

  describe('buildContext', () => {
    const mockItem: RedditItemData = {
      id: 'abc123',
      name: 't3_abc123',
      title: 'Test Post',
      author: 'testuser',
      subreddit: 'test',
      permalink: '/r/test/comments/abc123/test_post/',
      created_utc: 1609459200, // 2021-01-01
      score: 100,
      url: 'https://example.com',
      is_self: false,
      selftext: '',
      link_flair_text: 'Discussion',
    };

    it('should build context for a post', () => {
      handler = new TemplaterHandler(mockApp, mockSettings);
      const context = handler.buildContext(mockItem, false);

      expect(context.isComment).toBe(false);
      expect(context.type).toBe('reddit-post');
      expect(context.item).toBe(mockItem);
      expect(context.tags).toContain('#reddit');
      expect(context.tags).toContain('#r-test');
      expect(context.tags).toContain('#reddit-post');
    });

    it('should build context for a comment', () => {
      const commentItem: RedditItemData = {
        ...mockItem,
        name: 't1_comment123',
        body: 'Test comment body',
        parent_id: 't1_parent123',
      };

      handler = new TemplaterHandler(mockApp, mockSettings);
      const context = handler.buildContext(commentItem, true);

      expect(context.isComment).toBe(true);
      expect(context.type).toBe('reddit-comment');
      expect(context.parentType).toBe('comment');
      expect(context.tags).toContain('#reddit-comment');
    });

    it('should include media info when provided', () => {
      const mediaInfo = {
        type: 'image',
        mediaType: 'reddit-image',
        isMedia: true,
        domain: 'i.redd.it',
        canEmbed: true,
      };

      handler = new TemplaterHandler(mockApp, mockSettings);
      const context = handler.buildContext(mockItem, false, mediaInfo, '/path/to/local.jpg');

      expect(context.mediaInfo).toBe(mediaInfo);
      expect(context.localMediaPath).toBe('/path/to/local.jpg');
    });

    it('should include comment tree context when available', () => {
      const commentItem: RedditItemData = {
        ...mockItem,
        name: 't1_comment123',
        body: 'Test comment',
        parent_id: 't3_abc123',
        parent_comments: [{ ...mockItem, id: 'parent1', body: 'Parent comment' }],
        child_comments: [{ ...mockItem, id: 'child1', body: 'Child comment' }],
        depth: 1,
      };

      handler = new TemplaterHandler(mockApp, mockSettings);
      const context = handler.buildContext(commentItem, true);

      expect(context.hasParentContext).toBe(true);
      expect(context.hasReplies).toBe(true);
      expect(context.depth).toBe(1);
      expect(context.parentComments).toHaveLength(1);
      expect(context.childComments).toHaveLength(1);
    });
  });

  describe('processTemplate', () => {
    const mockItem: RedditItemData = {
      id: 'abc123',
      name: 't3_abc123',
      title: 'Test Post Title',
      author: 'testuser',
      subreddit: 'obsidian',
      permalink: '/r/obsidian/comments/abc123/test/',
      created_utc: 1609459200,
      score: 42,
      num_comments: 10,
      upvote_ratio: 0.95,
    };

    it('should return null when template file not found', async () => {
      mockSettings.postTemplatePath = 'templates/missing.md';
      mockVault.getAbstractFileByPath.mockReturnValue(null);

      handler = new TemplaterHandler(mockApp, mockSettings);
      const context = handler.buildContext(mockItem, false);
      const result = await handler.processTemplate(context);

      expect(result).toBeNull();
    });

    it('should replace variables in template', async () => {
      mockSettings.postTemplatePath = 'templates/post.md';
      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'templates/post.md' });
      mockVault.read.mockResolvedValue(
        '# {{reddit.title}}\nBy: {{reddit.author}}\nSubreddit: {{reddit.subreddit}}\nScore: {{reddit.score}}'
      );

      handler = new TemplaterHandler(mockApp, mockSettings);
      const context = handler.buildContext(mockItem, false);
      const result = await handler.processTemplate(context);

      expect(result).toContain('# Test Post Title');
      expect(result).toContain('By: testuser');
      expect(result).toContain('Subreddit: obsidian');
      expect(result).toContain('Score: 42');
    });

    it('should handle comment-specific variables', async () => {
      const commentItem: RedditItemData = {
        ...mockItem,
        name: 't1_comment123',
        body: 'This is my comment',
        parent_id: 't1_parent123',
        depth: 2,
      };

      mockSettings.commentTemplatePath = 'templates/comment.md';
      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'templates/comment.md' });
      mockVault.read.mockResolvedValue(
        'Body: {{reddit.body}}\nParent: {{reddit.parentId}}\nDepth: {{reddit.depth}}\nType: {{reddit.parentType}}'
      );

      handler = new TemplaterHandler(mockApp, mockSettings);
      const context = handler.buildContext(commentItem, true);
      const result = await handler.processTemplate(context);

      expect(result).toContain('Body: This is my comment');
      expect(result).toContain('Parent: t1_parent123');
      expect(result).toContain('Depth: 2');
      expect(result).toContain('Type: comment');
    });
  });

  describe('validateTemplates', () => {
    it('should return valid when useTemplater is disabled', () => {
      mockSettings.useTemplater = false;
      handler = new TemplaterHandler(mockApp, mockSettings);

      const result = handler.validateTemplates();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error when Templater not available', () => {
      mockSettings.useTemplater = true;
      handler = new TemplaterHandler(mockApp, mockSettings);

      const result = handler.validateTemplates();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Templater plugin is not installed or enabled');
    });

    it('should return error when no templates configured', () => {
      mockSettings.useTemplater = true;
      (mockApp as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins.plugins = {
        'templater-obsidian': {
          settings: { templates_folder: 'templates' },
        },
      };
      handler = new TemplaterHandler(mockApp, mockSettings);

      const result = handler.validateTemplates();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No template paths configured');
    });

    it('should return error when post template not found', () => {
      mockSettings.useTemplater = true;
      mockSettings.postTemplatePath = 'templates/missing.md';
      (mockApp as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins.plugins = {
        'templater-obsidian': {
          settings: { templates_folder: 'templates' },
        },
      };
      mockVault.getAbstractFileByPath.mockReturnValue(null);
      handler = new TemplaterHandler(mockApp, mockSettings);

      const result = handler.validateTemplates();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Post template not found: templates/missing.md');
    });

    it('should return valid when templates exist', () => {
      mockSettings.useTemplater = true;
      mockSettings.postTemplatePath = 'templates/post.md';
      (mockApp as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins.plugins = {
        'templater-obsidian': {
          settings: { templates_folder: 'templates' },
        },
      };
      mockVault.getAbstractFileByPath.mockReturnValue({ path: 'templates/post.md' });
      handler = new TemplaterHandler(mockApp, mockSettings);

      const result = handler.validateTemplates();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('runTemplaterOnFile', () => {
    it('should not throw when Templater plugin not available', async () => {
      const mockFile = { path: 'test.md' } as TFile;
      handler = new TemplaterHandler(mockApp, mockSettings);

      await expect(handler.runTemplaterOnFile(mockFile)).resolves.not.toThrow();
    });

    it('should call Templater overwrite_file_commands when available', async () => {
      const mockOverwrite = jest.fn().mockResolvedValue(undefined);
      (mockApp as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins.plugins = {
        'templater-obsidian': {
          templater: {
            overwrite_file_commands: mockOverwrite,
          },
        },
      };

      const mockFile = { path: 'test.md' } as TFile;
      handler = new TemplaterHandler(mockApp, mockSettings);

      await handler.runTemplaterOnFile(mockFile);

      expect(mockOverwrite).toHaveBeenCalledWith(mockFile);
    });
  });
});
