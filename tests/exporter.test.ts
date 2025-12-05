import { App, TFile } from 'obsidian';
import { Exporter, ExportPackage, ExportedItem } from '../src/exporter';
import { RedditSavedSettings } from '../src/types';

jest.mock('obsidian');

describe('Exporter', () => {
  let mockApp: App;
  let mockSettings: RedditSavedSettings;
  let exporter: Exporter;

  const createMockFile = (path: string): TFile =>
    ({
      path,
      basename: path.split('/').pop()?.replace('.md', '') || '',
      extension: 'md',
    }) as TFile;

  beforeEach(() => {
    mockApp = {
      vault: {
        getMarkdownFiles: jest.fn().mockReturnValue([]),
        read: jest.fn(),
        create: jest.fn(),
        modify: jest.fn(),
        createFolder: jest.fn(),
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
      },
      metadataCache: {
        getFileCache: jest.fn(),
      },
      plugins: {
        plugins: {
          'saved-reddit-exporter': {
            manifest: { version: '1.0.0' },
          },
        },
      },
    } as unknown as App;

    mockSettings = {
      saveLocation: 'Reddit Saved',
    } as RedditSavedSettings;

    exporter = new Exporter(mockApp, mockSettings);
  });

  describe('exportToJson', () => {
    it('should return empty items when no Reddit files exist', async () => {
      const result = await exporter.exportToJson();

      expect(result.items).toHaveLength(0);
      expect(result.exportInfo.itemCount).toBe(0);
      expect(result.exportInfo.includesContent).toBe(false);
    });

    it('should export Reddit post files', async () => {
      const mockFile = createMockFile('Reddit Saved/test-post.md');
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'reddit-post',
          id: 'abc123',
          title: 'Test Post',
          subreddit: 'programming',
          author: 'testuser',
          score: 100,
          created: '2024-01-01T00:00:00.000Z',
          permalink: 'https://reddit.com/r/programming/...',
          content_origin: 'saved',
        },
      });

      const result = await exporter.exportToJson();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('abc123');
      expect(result.items[0].vaultPath).toBe('Reddit Saved/test-post.md');
      expect(result.items[0].metadata.title).toBe('Test Post');
      expect(result.items[0].metadata.subreddit).toBe('programming');
      expect(result.items[0].metadata.author).toBe('testuser');
      expect(result.items[0].metadata.contentOrigin).toBe('saved');
    });

    it('should skip non-Reddit files', async () => {
      const mockFile = createMockFile('Notes/regular-note.md');
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'note',
          title: 'Regular Note',
        },
      });

      const result = await exporter.exportToJson();

      expect(result.items).toHaveLength(0);
    });

    it('should skip files without frontmatter', async () => {
      const mockFile = createMockFile('Notes/no-frontmatter.md');
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({});

      const result = await exporter.exportToJson();

      expect(result.items).toHaveLength(0);
    });

    it('should include content when requested', async () => {
      const mockFile = createMockFile('Reddit Saved/test-post.md');
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'reddit-post',
          id: 'abc123',
        },
      });
      (mockApp.vault.read as jest.Mock).mockResolvedValue('# Test Post\n\nContent here');

      const result = await exporter.exportToJson({ includeContent: true });

      expect(result.exportInfo.includesContent).toBe(true);
      expect(result.items[0].content).toBe('# Test Post\n\nContent here');
    });

    it('should filter by subreddit when specified', async () => {
      const files = [
        createMockFile('Reddit Saved/post1.md'),
        createMockFile('Reddit Saved/post2.md'),
      ];
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue(files);
      (mockApp.metadataCache.getFileCache as jest.Mock)
        .mockReturnValueOnce({
          frontmatter: { type: 'reddit-post', id: 'abc123', subreddit: 'programming' },
        })
        .mockReturnValueOnce({
          frontmatter: { type: 'reddit-post', id: 'def456', subreddit: 'javascript' },
        });

      const result = await exporter.exportToJson({ subredditFilter: ['programming'] });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].metadata.subreddit).toBe('programming');
    });

    it('should handle case-insensitive subreddit filter', async () => {
      const mockFile = createMockFile('Reddit Saved/post.md');
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'abc123', subreddit: 'Programming' },
      });

      const result = await exporter.exportToJson({ subredditFilter: ['PROGRAMMING'] });

      expect(result.items).toHaveLength(1);
    });

    it('should handle multiple IDs in reddit_ids array', async () => {
      const mockFile = createMockFile('Reddit Saved/merged.md');
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'reddit-collection',
          id: 'abc123',
          reddit_ids: ['def456', 'ghi789'],
        },
      });

      const result = await exporter.exportToJson();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('abc123');
      expect(result.items[0].additionalIds).toEqual(['def456', 'ghi789']);
    });

    it('should skip files without ID', async () => {
      const mockFile = createMockFile('Reddit Saved/no-id.md');
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', title: 'No ID Post' },
      });

      const result = await exporter.exportToJson();

      expect(result.items).toHaveLength(0);
    });

    it('should handle errors gracefully', async () => {
      const mockFile = createMockFile('Reddit Saved/error.md');
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockImplementation(() => {
        throw new Error('Cache error');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await exporter.exportToJson();

      expect(result.items).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('exportToJsonFile', () => {
    it('should create new file when it does not exist', async () => {
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

      await exporter.exportToJsonFile();

      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'Reddit Saved/reddit-export.json',
        expect.any(String)
      );
    });

    it('should modify existing file', async () => {
      const mockFile = { path: 'Reddit Saved/reddit-export.json' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);
      (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(mockFile);

      await exporter.exportToJsonFile();

      expect(mockApp.vault.modify).toHaveBeenCalledWith(mockFile, expect.any(String));
    });

    it('should use custom output path', async () => {
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);

      await exporter.exportToJsonFile({ outputPath: 'Custom/export.json' });

      expect(mockApp.vault.createFolder).toHaveBeenCalledWith('Custom');
      expect(mockApp.vault.create).toHaveBeenCalledWith('Custom/export.json', expect.any(String));
    });
  });

  describe('exportToCsv', () => {
    it('should create CSV with headers', async () => {
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);

      await exporter.exportToCsv();

      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'Reddit Saved/reddit-export.csv',
        expect.stringContaining('id,title,subreddit,author,score,created,type,permalink,vaultPath')
      );
    });

    it('should include item data in CSV', async () => {
      const mockFile = createMockFile('Reddit Saved/test.md');
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'reddit-post',
          id: 'abc123',
          title: 'Test Title',
          subreddit: 'test',
          author: 'user',
          score: 50,
        },
      });

      await exporter.exportToCsv();

      const createCall = (mockApp.vault.create as jest.Mock).mock.calls[0];
      const csvContent = createCall[1] as string;
      expect(csvContent).toContain('abc123');
      expect(csvContent).toContain('Test Title');
      expect(csvContent).toContain('test');
    });

    it('should escape CSV fields with commas', async () => {
      const mockFile = createMockFile('Reddit Saved/test.md');
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'reddit-post',
          id: 'abc123',
          title: 'Hello, World',
        },
      });

      await exporter.exportToCsv();

      const createCall = (mockApp.vault.create as jest.Mock).mock.calls[0];
      const csvContent = createCall[1] as string;
      expect(csvContent).toContain('"Hello, World"');
    });

    it('should escape CSV fields with quotes', async () => {
      const mockFile = createMockFile('Reddit Saved/test.md');
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'reddit-post',
          id: 'abc123',
          title: 'Say "Hello"',
        },
      });

      await exporter.exportToCsv();

      const createCall = (mockApp.vault.create as jest.Mock).mock.calls[0];
      const csvContent = createCall[1] as string;
      expect(csvContent).toContain('"Say ""Hello"""');
    });
  });

  describe('getExportStats', () => {
    it('should return statistics grouped by subreddit and type', async () => {
      const files = [
        createMockFile('Reddit Saved/post1.md'),
        createMockFile('Reddit Saved/post2.md'),
        createMockFile('Reddit Saved/comment1.md'),
      ];
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue(files);
      (mockApp.metadataCache.getFileCache as jest.Mock)
        .mockReturnValueOnce({
          frontmatter: { type: 'reddit-post', id: '1', subreddit: 'programming' },
        })
        .mockReturnValueOnce({
          frontmatter: { type: 'reddit-post', id: '2', subreddit: 'javascript' },
        })
        .mockReturnValueOnce({
          frontmatter: { type: 'reddit-comment', id: '3', subreddit: 'programming' },
        });

      const stats = await exporter.getExportStats();

      expect(stats.totalItems).toBe(3);
      expect(stats.bySubreddit).toEqual({
        programming: 2,
        javascript: 1,
      });
      expect(stats.byType).toEqual({
        'reddit-post': 2,
        'reddit-comment': 1,
      });
    });

    it('should handle unknown subreddit and type', async () => {
      const mockFile = createMockFile('Reddit Saved/mystery.md');
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'abc' },
      });

      const stats = await exporter.getExportStats();

      expect(stats.bySubreddit).toEqual({ unknown: 1 });
    });
  });

  describe('plugin version', () => {
    it('should get plugin version from manifest', async () => {
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);

      const result = await exporter.exportToJson();

      expect(result.exportInfo.pluginVersion).toBe('1.0.0');
    });

    it('should return unknown when manifest is not available', async () => {
      mockApp = {
        ...mockApp,
        plugins: undefined,
      } as unknown as App;
      exporter = new Exporter(mockApp, mockSettings);
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([]);

      const result = await exporter.exportToJson();

      expect(result.exportInfo.pluginVersion).toBe('unknown');
    });
  });
});
