import { Exporter, ExportPackage, ExportedItem } from '../src/exporter';
import { RedditSavedSettings } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/constants';

// Mock Obsidian modules
jest.mock('obsidian', () => ({
  App: jest.fn(),
  TFile: jest.fn(),
  Notice: jest.fn(),
}));

// Helper to create mock files with frontmatter
interface MockFile {
  path: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

// Create mock App with configurable files
function createMockApp(files: MockFile[] = []) {
  const fileCache = new Map<string, { frontmatter: Record<string, unknown> }>();
  const fileContents = new Map<string, string>();
  const markdownFiles: Array<{ path: string }> = [];
  const abstractFiles = new Map<string, { path: string }>();

  for (const file of files) {
    markdownFiles.push({ path: file.path });
    fileCache.set(file.path, { frontmatter: file.frontmatter });
    fileContents.set(file.path, file.content);
    abstractFiles.set(file.path, { path: file.path });
  }

  return {
    vault: {
      getMarkdownFiles: () => markdownFiles,
      getAbstractFileByPath: (path: string) => abstractFiles.get(path),
      read: jest.fn((file: { path: string }) => Promise.resolve(fileContents.get(file.path) || '')),
      modify: jest.fn(() => Promise.resolve()),
      create: jest.fn(() => Promise.resolve()),
      createFolder: jest.fn(() => Promise.resolve()),
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => fileCache.get(file.path),
    },
    plugins: {
      plugins: {
        'saved-reddit-exporter': {
          manifest: { version: '1.0.0' },
        },
      },
    },
  } as unknown as import('obsidian').App;
}

// Helper to create settings
function createSettings(overrides: Partial<RedditSavedSettings> = {}): RedditSavedSettings {
  return {
    ...DEFAULT_SETTINGS,
    saveLocation: 'Reddit',
    ...overrides,
  };
}

describe('Exporter', () => {
  describe('exportToJson', () => {
    it('should export Reddit items from vault', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
            title: 'Test Post',
            subreddit: 'programming',
            author: 'testuser',
            score: 100,
            created: '2024-01-01T00:00:00.000Z',
            permalink: 'https://reddit.com/r/programming/abc123',
            content_origin: 'saved',
          },
          content: '# Test Post\n\nContent here',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      const result = await exporter.exportToJson();

      expect(result.exportInfo.itemCount).toBe(1);
      expect(result.exportInfo.includesContent).toBe(false);
      expect(result.items[0]).toMatchObject({
        id: 'abc123',
        vaultPath: 'Reddit/post1.md',
        metadata: {
          type: 'reddit-post',
          title: 'Test Post',
          subreddit: 'programming',
          author: 'testuser',
          score: 100,
        },
      });
    });

    it('should include content when requested', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
            title: 'Test Post',
            subreddit: 'test',
          },
          content: '# Test Post\n\nFull content here',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      const result = await exporter.exportToJson({ includeContent: true });

      expect(result.exportInfo.includesContent).toBe(true);
      expect(result.items[0].content).toBe('# Test Post\n\nFull content here');
    });

    it('should filter by subreddit when specified', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
            subreddit: 'programming',
          },
          content: '',
        },
        {
          path: 'Reddit/post2.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'def456',
            subreddit: 'javascript',
          },
          content: '',
        },
        {
          path: 'Reddit/post3.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'ghi789',
            subreddit: 'python',
          },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      const result = await exporter.exportToJson({
        subredditFilter: ['programming', 'javascript'],
      });

      expect(result.exportInfo.itemCount).toBe(2);
      expect(result.items.map(i => i.metadata.subreddit).sort()).toEqual([
        'javascript',
        'programming',
      ]);
    });

    it('should handle case-insensitive subreddit filtering', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
            subreddit: 'Programming',
          },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      const result = await exporter.exportToJson({
        subredditFilter: ['programming'],
      });

      expect(result.exportInfo.itemCount).toBe(1);
    });

    it('should skip non-Reddit files', async () => {
      const mockApp = createMockApp([
        {
          path: 'Notes/regular.md',
          frontmatter: {
            type: 'note',
            title: 'Regular Note',
          },
          content: '',
        },
        {
          path: 'Reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
          },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      const result = await exporter.exportToJson();

      expect(result.exportInfo.itemCount).toBe(1);
    });

    it('should handle files with reddit_ids array', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/merged.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'primary123',
            reddit_ids: ['primary123', 'secondary456'],
            title: 'Merged Post',
            subreddit: 'test',
          },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      const result = await exporter.exportToJson();

      expect(result.items[0].id).toBe('primary123');
      expect(result.items[0].additionalIds).toEqual(['secondary456']);
    });

    it('should skip files without id', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/broken.md',
          frontmatter: {
            type: 'reddit-post',
            title: 'No ID',
          },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      const result = await exporter.exportToJson();

      expect(result.exportInfo.itemCount).toBe(0);
    });

    it('should include export metadata', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
          },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      const result = await exporter.exportToJson();

      expect(result.exportInfo).toMatchObject({
        itemCount: 1,
        includesContent: false,
        pluginVersion: '1.0.0',
      });
      expect(result.exportInfo.exportedAt).toBeDefined();
    });
  });

  describe('exportToCsv', () => {
    it('should generate valid CSV with headers', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
            title: 'Test Post',
            subreddit: 'programming',
            author: 'testuser',
            score: 100,
            created: '2024-01-01',
            permalink: 'https://reddit.com/abc123',
          },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      await exporter.exportToCsv();

      const createCall = mockApp.vault.create as jest.Mock;
      expect(createCall).toHaveBeenCalled();

      const csvContent = createCall.mock.calls[0][1];
      const lines = csvContent.split('\n');

      expect(lines[0]).toBe('id,title,subreddit,author,score,created,type,permalink,vaultPath');
      expect(lines[1]).toContain('abc123');
      expect(lines[1]).toContain('Test Post');
      expect(lines[1]).toContain('programming');
    });

    it('should escape CSV fields with commas', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
            title: 'Hello, World',
            subreddit: 'test',
          },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      await exporter.exportToCsv();

      const createCall = mockApp.vault.create as jest.Mock;
      const csvContent = createCall.mock.calls[0][1];

      expect(csvContent).toContain('"Hello, World"');
    });

    it('should escape CSV fields with quotes', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
            title: 'He said "Hello"',
            subreddit: 'test',
          },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      await exporter.exportToCsv();

      const createCall = mockApp.vault.create as jest.Mock;
      const csvContent = createCall.mock.calls[0][1];

      expect(csvContent).toContain('"He said ""Hello"""');
    });

    it('should escape CSV fields with newlines', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
            title: 'Line1\nLine2',
            subreddit: 'test',
          },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      await exporter.exportToCsv();

      const createCall = mockApp.vault.create as jest.Mock;
      const csvContent = createCall.mock.calls[0][1];

      expect(csvContent).toContain('"Line1\nLine2"');
    });

    it('should modify existing file if it exists', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
            subreddit: 'test',
          },
          content: '',
        },
      ]);

      // Add the export file to abstractFiles
      (mockApp.vault.getAbstractFileByPath as jest.Mock) = jest.fn((path: string) => {
        if (path === 'Reddit/reddit-export.csv') {
          return { path };
        }
        return undefined;
      });

      const exporter = new Exporter(mockApp, createSettings());
      await exporter.exportToCsv();

      expect(mockApp.vault.modify).toHaveBeenCalled();
      expect(mockApp.vault.create).not.toHaveBeenCalled();
    });
  });

  describe('getExportStats', () => {
    it('should compute statistics by subreddit', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: { type: 'reddit-post', id: 'abc', subreddit: 'programming' },
          content: '',
        },
        {
          path: 'Reddit/post2.md',
          frontmatter: { type: 'reddit-post', id: 'def', subreddit: 'programming' },
          content: '',
        },
        {
          path: 'Reddit/post3.md',
          frontmatter: { type: 'reddit-post', id: 'ghi', subreddit: 'javascript' },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      const stats = await exporter.getExportStats();

      expect(stats.totalItems).toBe(3);
      expect(stats.bySubreddit).toEqual({
        programming: 2,
        javascript: 1,
      });
    });

    it('should compute statistics by type', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: { type: 'reddit-post', id: 'abc', subreddit: 'test' },
          content: '',
        },
        {
          path: 'Reddit/comment1.md',
          frontmatter: { type: 'reddit-comment', id: 'def', subreddit: 'test' },
          content: '',
        },
        {
          path: 'Reddit/comment2.md',
          frontmatter: { type: 'reddit-comment', id: 'ghi', subreddit: 'test' },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      const stats = await exporter.getExportStats();

      expect(stats.byType).toEqual({
        'reddit-post': 1,
        'reddit-comment': 2,
      });
    });

    it('should handle missing subreddit and type', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/broken.md',
          frontmatter: { type: 'reddit-post', id: 'abc' },
          content: '',
        },
      ]);

      const exporter = new Exporter(mockApp, createSettings());
      const stats = await exporter.getExportStats();

      expect(stats.bySubreddit).toEqual({ unknown: 1 });
    });
  });

  describe('exportToJsonFile', () => {
    it('should create folder if it does not exist', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: { type: 'reddit-post', id: 'abc', subreddit: 'test' },
          content: '',
        },
      ]);

      // No existing files
      (mockApp.vault.getAbstractFileByPath as jest.Mock) = jest.fn(() => undefined);

      const exporter = new Exporter(mockApp, createSettings());
      await exporter.exportToJsonFile({ outputPath: 'exports/reddit-export.json' });

      expect(mockApp.vault.createFolder).toHaveBeenCalledWith('exports');
      expect(mockApp.vault.create).toHaveBeenCalled();
    });

    it('should use default output path from settings', async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: { type: 'reddit-post', id: 'abc', subreddit: 'test' },
          content: '',
        },
      ]);

      (mockApp.vault.getAbstractFileByPath as jest.Mock) = jest.fn(() => undefined);

      const exporter = new Exporter(mockApp, createSettings({ saveLocation: 'MyReddit' }));
      const result = await exporter.exportToJsonFile();

      expect(result).toBe('MyReddit/reddit-export.json');
    });
  });
});

describe('CSV escaping (via Exporter internals)', () => {
  // Test the escapeCsvField logic indirectly through the exported CSV
  // Note: newline test case omitted as it requires multi-line CSV parsing
  const testCases = [
    { input: 'simple', expected: 'simple' },
    { input: 'with,comma', expected: '"with,comma"' },
    { input: 'with"quote', expected: '"with""quote"' },
    { input: 'combo,with"both', expected: '"combo,with""both"' },
    { input: '', expected: '' },
  ];

  testCases.forEach(({ input, expected }) => {
    it(`should escape "${input}" as ${expected}`, async () => {
      const mockApp = createMockApp([
        {
          path: 'Reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'test',
            title: input,
            subreddit: 'test',
          },
          content: '',
        },
      ]);

      (mockApp.vault.getAbstractFileByPath as jest.Mock) = jest.fn(() => undefined);

      const exporter = new Exporter(mockApp, createSettings());
      await exporter.exportToCsv();

      const createCall = mockApp.vault.create as jest.Mock;
      const csvContent = createCall.mock.calls[0][1];
      const lines = csvContent.split('\n');
      const dataLine = lines[1];

      // Title is the second field
      const fields = parseCSVLine(dataLine);
      expect(fields[1]).toBe(input);
    });
  });
});

// Helper to parse CSV line (simple implementation for testing)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        result.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  result.push(current);
  return result;
}
