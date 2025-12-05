import { App } from 'obsidian';
import { SyncManager } from '../src/sync-manager';
import {
  RedditItem,
  RedditSavedSettings,
  SyncItem,
  FilterSettings,
  VaultItemInfo,
} from '../src/types';

jest.mock('obsidian');

describe('SyncManager', () => {
  let mockApp: App;
  let mockSettings: RedditSavedSettings;
  let syncManager: SyncManager;

  const createMockFilterSettings = (): FilterSettings => ({
    enabled: false,
    subredditFilterMode: 'include',
    subredditList: [],
    subredditRegex: '',
    useSubredditRegex: false,
    titleKeywords: [],
    titleKeywordsMode: 'include',
    contentKeywords: [],
    contentKeywordsMode: 'include',
    flairList: [],
    flairFilterMode: 'include',
    minScore: null,
    maxScore: null,
    minUpvoteRatio: null,
    includePostTypes: ['text', 'link', 'image', 'video'],
    includeComments: true,
    includePosts: true,
    dateRangePreset: 'all',
    dateRangeStart: null,
    dateRangeEnd: null,
    authorFilterMode: 'include',
    authorList: [],
    minCommentCount: null,
    maxCommentCount: null,
    domainFilterMode: 'include',
    domainList: [],
    excludeNsfw: false,
  });

  const createMockRedditItem = (
    id: string,
    kind: 't3' | 't1' = 't3',
    overrides: Record<string, unknown> = {}
  ): RedditItem => ({
    kind,
    data: {
      id,
      name: `${kind}_${id}`,
      title: `Test Post ${id}`,
      author: 'testuser',
      subreddit: 'programming',
      permalink: `/r/programming/comments/${id}/`,
      created_utc: 1704067200,
      score: 100,
      is_self: true,
      link_title: kind === 't1' ? `Parent Post for ${id}` : undefined,
      ...overrides,
    },
  });

  beforeEach(() => {
    mockApp = {
      vault: {
        getMarkdownFiles: jest.fn().mockReturnValue([]),
      },
      metadataCache: {
        getFileCache: jest.fn(),
      },
    } as unknown as App;

    mockSettings = {
      filterSettings: createMockFilterSettings(),
    } as RedditSavedSettings;

    syncManager = new SyncManager(mockApp, mockSettings);
  });

  describe('scanVault', () => {
    it('should return empty map when no files exist', () => {
      const result = syncManager.scanVault();
      expect(result.size).toBe(0);
    });

    it('should scan Reddit post files', () => {
      const mockFile = { path: 'Reddit/test-post.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'reddit-post',
          id: 'abc123',
          title: 'Test Post',
          subreddit: 'programming',
          author: 'testuser',
          score: 100,
        },
      });

      const result = syncManager.scanVault();

      expect(result.size).toBe(1);
      expect(result.get('abc123')).toEqual({
        path: 'Reddit/test-post.md',
        id: 'abc123',
        additionalIds: undefined,
        title: 'Test Post',
        subreddit: 'programming',
        type: 'reddit-post',
        author: 'testuser',
        score: 100,
        contentOrigin: undefined,
        permalink: undefined,
      });
    });

    it('should scan Reddit comment files', () => {
      const mockFile = { path: 'Reddit/comment.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'reddit-comment',
          id: 'comment123',
          subreddit: 'learnprogramming',
        },
      });

      const result = syncManager.scanVault();

      expect(result.size).toBe(1);
      expect(result.get('comment123')?.type).toBe('reddit-comment');
    });

    it('should handle files with multiple reddit_ids', () => {
      const mockFile = { path: 'Reddit/merged.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'reddit-collection',
          id: 'primary123',
          reddit_ids: ['secondary456', 'tertiary789'],
        },
      });

      const result = syncManager.scanVault();

      // All 3 IDs should map to the same file
      expect(result.size).toBe(3);
      expect(result.get('primary123')?.path).toBe('Reddit/merged.md');
      expect(result.get('secondary456')?.path).toBe('Reddit/merged.md');
      expect(result.get('tertiary789')?.path).toBe('Reddit/merged.md');
      expect(result.get('primary123')?.additionalIds).toEqual(['secondary456', 'tertiary789']);
    });

    it('should skip non-Reddit files', () => {
      const mockFile = { path: 'Notes/regular.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'note',
          title: 'Regular Note',
        },
      });

      const result = syncManager.scanVault();

      expect(result.size).toBe(0);
    });

    it('should skip files without frontmatter', () => {
      const mockFile = { path: 'Notes/no-frontmatter.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({});

      const result = syncManager.scanVault();

      expect(result.size).toBe(0);
    });

    it('should skip files without ID', () => {
      const mockFile = { path: 'Reddit/no-id.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'reddit-post',
          title: 'No ID',
        },
      });

      const result = syncManager.scanVault();

      expect(result.size).toBe(0);
    });

    it('should handle errors gracefully', () => {
      const mockFile = { path: 'Reddit/error.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockImplementation(() => {
        throw new Error('Cache error');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = syncManager.scanVault();

      expect(result.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('computeSyncState', () => {
    it('should categorize items as pending when not in vault', () => {
      const redditItems = [createMockRedditItem('abc123')];

      const result = syncManager.computeSyncState(redditItems);

      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].status).toBe('pending');
      expect(result.imported).toHaveLength(0);
      expect(result.filtered).toHaveLength(0);
      expect(result.orphaned).toHaveLength(0);
    });

    it('should categorize items as imported when in vault', () => {
      // First scan vault with an existing item
      const mockFile = { path: 'Reddit/post.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'abc123' },
      });
      syncManager.scanVault();

      // Then compute sync state with matching Reddit item
      const redditItems = [createMockRedditItem('abc123')];
      const result = syncManager.computeSyncState(redditItems);

      expect(result.imported).toHaveLength(1);
      expect(result.imported[0].status).toBe('imported');
      expect(result.imported[0].vaultPath).toBe('Reddit/post.md');
      expect(result.pending).toHaveLength(0);
    });

    it('should categorize items as filtered when they fail filters', () => {
      // Enable filtering with minimum score
      mockSettings.filterSettings.enabled = true;
      mockSettings.filterSettings.minScore = 500;
      syncManager = new SyncManager(mockApp, mockSettings);

      const redditItems = [createMockRedditItem('abc123', 't3', { score: 100 })];
      const result = syncManager.computeSyncState(redditItems);

      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].status).toBe('filtered');
      expect(result.filtered[0].filterResult).toBeDefined();
      expect(result.pending).toHaveLength(0);
    });

    it('should detect orphaned items in vault but not on Reddit', () => {
      // Scan vault with an existing item
      const mockFile = { path: 'Reddit/orphan.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: {
          type: 'reddit-post',
          id: 'orphan123',
          title: 'Orphaned Post',
          subreddit: 'deleted',
        },
      });
      syncManager.scanVault();

      // Compute sync state with different Reddit items
      const redditItems = [createMockRedditItem('different123')];
      const result = syncManager.computeSyncState(redditItems);

      expect(result.orphaned).toHaveLength(1);
      expect(result.orphaned[0].status).toBe('orphaned');
      expect(result.orphaned[0].vaultInfo?.id).toBe('orphan123');
    });

    it('should compute correct stats', () => {
      const mockFile = { path: 'Reddit/imported.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'imported1' },
      });
      syncManager.scanVault();

      const redditItems = [
        createMockRedditItem('imported1'),
        createMockRedditItem('pending1'),
        createMockRedditItem('pending2'),
      ];

      const result = syncManager.computeSyncState(redditItems);

      expect(result.stats).toEqual({
        totalReddit: 3,
        totalVault: 1,
        imported: 1,
        pending: 2,
        filtered: 0,
        orphaned: 0,
      });
    });
  });

  describe('toggleOverride', () => {
    beforeEach(() => {
      mockSettings.filterSettings.enabled = true;
      mockSettings.filterSettings.minScore = 500;
      syncManager = new SyncManager(mockApp, mockSettings);
    });

    it('should toggle filtered item to override-pending', () => {
      const redditItems = [createMockRedditItem('abc123', 't3', { score: 100 })];
      syncManager.computeSyncState(redditItems);

      const result = syncManager.toggleOverride('abc123');

      expect(result).toBe(true);
      const item = syncManager.getSyncItem('abc123');
      expect(item?.status).toBe('override-pending');
      expect(item?.userOverride).toBe(true);
    });

    it('should toggle override-pending back to filtered', () => {
      const redditItems = [createMockRedditItem('abc123', 't3', { score: 100 })];
      syncManager.computeSyncState(redditItems);

      syncManager.toggleOverride('abc123'); // Add override
      syncManager.toggleOverride('abc123'); // Remove override

      const item = syncManager.getSyncItem('abc123');
      expect(item?.status).toBe('filtered');
      expect(item?.userOverride).toBe(false);
    });

    it('should return false for non-existent items', () => {
      const result = syncManager.toggleOverride('nonexistent');
      expect(result).toBe(false);
    });

    it('should return false for imported items', () => {
      const mockFile = { path: 'Reddit/post.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'abc123' },
      });
      syncManager.scanVault();

      const redditItems = [createMockRedditItem('abc123')];
      syncManager.computeSyncState(redditItems);

      const result = syncManager.toggleOverride('abc123');
      expect(result).toBe(false);
    });
  });

  describe('getItemsToImport', () => {
    it('should return pending items', () => {
      const redditItems = [createMockRedditItem('pending1'), createMockRedditItem('pending2')];
      syncManager.computeSyncState(redditItems);

      const items = syncManager.getItemsToImport();

      expect(items).toHaveLength(2);
      expect(items.map(i => i.data.id)).toContain('pending1');
      expect(items.map(i => i.data.id)).toContain('pending2');
    });

    it('should include override-pending items', () => {
      mockSettings.filterSettings.enabled = true;
      mockSettings.filterSettings.minScore = 500;
      syncManager = new SyncManager(mockApp, mockSettings);

      const redditItems = [createMockRedditItem('low-score', 't3', { score: 100 })];
      syncManager.computeSyncState(redditItems);
      syncManager.toggleOverride('low-score');

      const items = syncManager.getItemsToImport();

      expect(items).toHaveLength(1);
      expect(items[0].data.id).toBe('low-score');
    });

    it('should filter by selectedIds when provided', () => {
      const redditItems = [
        createMockRedditItem('pending1'),
        createMockRedditItem('pending2'),
        createMockRedditItem('pending3'),
      ];
      syncManager.computeSyncState(redditItems);

      const selectedIds = new Set(['pending1', 'pending3']);
      const items = syncManager.getItemsToImport(selectedIds);

      expect(items).toHaveLength(2);
      expect(items.map(i => i.data.id)).toContain('pending1');
      expect(items.map(i => i.data.id)).toContain('pending3');
      expect(items.map(i => i.data.id)).not.toContain('pending2');
    });
  });

  describe('getItemsToReprocess', () => {
    it('should return imported items', () => {
      const mockFile = { path: 'Reddit/post.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'abc123' },
      });
      syncManager.scanVault();

      const redditItems = [createMockRedditItem('abc123')];
      syncManager.computeSyncState(redditItems);

      const items = syncManager.getItemsToReprocess();

      expect(items).toHaveLength(1);
      expect(items[0].item?.data.id).toBe('abc123');
    });

    it('should filter by selectedIds when provided', () => {
      const files = [{ path: 'Reddit/post1.md' }, { path: 'Reddit/post2.md' }];
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue(files);
      (mockApp.metadataCache.getFileCache as jest.Mock)
        .mockReturnValueOnce({ frontmatter: { type: 'reddit-post', id: 'post1' } })
        .mockReturnValueOnce({ frontmatter: { type: 'reddit-post', id: 'post2' } });
      syncManager.scanVault();

      const redditItems = [createMockRedditItem('post1'), createMockRedditItem('post2')];
      syncManager.computeSyncState(redditItems);

      const selectedIds = new Set(['post1']);
      const items = syncManager.getItemsToReprocess(selectedIds);

      expect(items).toHaveLength(1);
      expect(items[0].item?.data.id).toBe('post1');
    });
  });

  describe('getItemsToUnsave', () => {
    it('should return items matching selectedIds', () => {
      const redditItems = [
        createMockRedditItem('item1'),
        createMockRedditItem('item2'),
        createMockRedditItem('item3'),
      ];
      syncManager.computeSyncState(redditItems);

      const selectedIds = new Set(['item1', 'item3']);
      const items = syncManager.getItemsToUnsave(selectedIds);

      expect(items).toHaveLength(2);
      expect(items.map(i => i.data.id)).toContain('item1');
      expect(items.map(i => i.data.id)).toContain('item3');
    });
  });

  describe('getOrphanedItems', () => {
    it('should return only orphaned items', () => {
      const mockFile = { path: 'Reddit/orphan.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'orphan1' },
      });
      syncManager.scanVault();

      syncManager.computeSyncState([createMockRedditItem('different')]);

      const orphans = syncManager.getOrphanedItems();

      expect(orphans).toHaveLength(1);
      expect(orphans[0].vaultInfo?.id).toBe('orphan1');
    });
  });

  describe('getAllSyncItems', () => {
    it('should return all sync items', () => {
      const mockFile = { path: 'Reddit/post.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'imported1' },
      });
      syncManager.scanVault();

      const redditItems = [createMockRedditItem('imported1'), createMockRedditItem('pending1')];
      syncManager.computeSyncState(redditItems);

      const allItems = syncManager.getAllSyncItems();

      expect(allItems).toHaveLength(2);
    });
  });

  describe('getItemsByStatus', () => {
    it('should filter by status', () => {
      const redditItems = [createMockRedditItem('pending1'), createMockRedditItem('pending2')];
      syncManager.computeSyncState(redditItems);

      const pendingItems = syncManager.getItemsByStatus('pending');

      expect(pendingItems).toHaveLength(2);
      expect(pendingItems.every(i => i.status === 'pending')).toBe(true);
    });
  });

  describe('clearOverrides', () => {
    it('should clear all user overrides', () => {
      mockSettings.filterSettings.enabled = true;
      mockSettings.filterSettings.minScore = 500;
      syncManager = new SyncManager(mockApp, mockSettings);

      const redditItems = [
        createMockRedditItem('item1', 't3', { score: 100 }),
        createMockRedditItem('item2', 't3', { score: 100 }),
      ];
      syncManager.computeSyncState(redditItems);

      syncManager.toggleOverride('item1');
      syncManager.toggleOverride('item2');

      expect(syncManager.getSyncItem('item1')?.status).toBe('override-pending');
      expect(syncManager.getSyncItem('item2')?.status).toBe('override-pending');

      syncManager.clearOverrides();

      expect(syncManager.getSyncItem('item1')?.status).toBe('filtered');
      expect(syncManager.getSyncItem('item2')?.status).toBe('filtered');
    });
  });

  describe('getFullname', () => {
    it('should return fullname from Reddit item', () => {
      const redditItems = [createMockRedditItem('abc123', 't3')];
      syncManager.computeSyncState(redditItems);

      const syncItem = syncManager.getSyncItem('abc123')!;
      const fullname = syncManager.getFullname(syncItem);

      expect(fullname).toBe('t3_abc123');
    });

    it('should reconstruct fullname for orphaned post', () => {
      const mockFile = { path: 'Reddit/orphan.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'orphan123' },
      });
      syncManager.scanVault();
      syncManager.computeSyncState([]);

      const orphan = syncManager.getOrphanedItems()[0];
      const fullname = syncManager.getFullname(orphan);

      expect(fullname).toBe('t3_orphan123');
    });

    it('should reconstruct fullname for orphaned comment', () => {
      const mockFile = { path: 'Reddit/orphan.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-comment', id: 'comment123' },
      });
      syncManager.scanVault();
      syncManager.computeSyncState([]);

      const orphan = syncManager.getOrphanedItems()[0];
      const fullname = syncManager.getFullname(orphan);

      expect(fullname).toBe('t1_comment123');
    });
  });

  describe('getDisplayTitle', () => {
    it('should return title for posts', () => {
      const redditItems = [createMockRedditItem('abc123', 't3', { title: 'My Post Title' })];
      syncManager.computeSyncState(redditItems);

      const syncItem = syncManager.getSyncItem('abc123')!;
      const title = syncManager.getDisplayTitle(syncItem);

      expect(title).toBe('My Post Title');
    });

    it('should return "Comment on:" format for comments', () => {
      const redditItems = [createMockRedditItem('comment1', 't1', { link_title: 'Parent Post' })];
      syncManager.computeSyncState(redditItems);

      const syncItem = syncManager.getSyncItem('comment1')!;
      const title = syncManager.getDisplayTitle(syncItem);

      expect(title).toBe('Comment on: Parent Post');
    });

    it('should return vault title for orphaned items', () => {
      const mockFile = { path: 'Reddit/orphan.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'orphan1', title: 'Orphan Title' },
      });
      syncManager.scanVault();
      syncManager.computeSyncState([]);

      const orphan = syncManager.getOrphanedItems()[0];
      const title = syncManager.getDisplayTitle(orphan);

      expect(title).toBe('Orphan Title');
    });

    it('should return "[Deleted]" for orphans without title', () => {
      const mockFile = { path: 'Reddit/orphan.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'orphan1', subreddit: 'test' },
      });
      syncManager.scanVault();
      syncManager.computeSyncState([]);

      const orphan = syncManager.getOrphanedItems()[0];
      const title = syncManager.getDisplayTitle(orphan);

      expect(title).toBe('[Deleted] r/test');
    });
  });

  describe('getSubreddit', () => {
    it('should return subreddit from Reddit item', () => {
      const redditItems = [createMockRedditItem('abc123', 't3', { subreddit: 'javascript' })];
      syncManager.computeSyncState(redditItems);

      const syncItem = syncManager.getSyncItem('abc123')!;
      expect(syncManager.getSubreddit(syncItem)).toBe('javascript');
    });

    it('should return subreddit from vault info for orphans', () => {
      const mockFile = { path: 'Reddit/orphan.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'orphan1', subreddit: 'typescript' },
      });
      syncManager.scanVault();
      syncManager.computeSyncState([]);

      const orphan = syncManager.getOrphanedItems()[0];
      expect(syncManager.getSubreddit(orphan)).toBe('typescript');
    });
  });

  describe('getScore', () => {
    it('should return score from Reddit item', () => {
      const redditItems = [createMockRedditItem('abc123', 't3', { score: 500 })];
      syncManager.computeSyncState(redditItems);

      const syncItem = syncManager.getSyncItem('abc123')!;
      expect(syncManager.getScore(syncItem)).toBe(500);
    });

    it('should return score from vault info for orphans', () => {
      const mockFile = { path: 'Reddit/orphan.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'orphan1', score: 250 },
      });
      syncManager.scanVault();
      syncManager.computeSyncState([]);

      const orphan = syncManager.getOrphanedItems()[0];
      expect(syncManager.getScore(orphan)).toBe(250);
    });
  });

  describe('getCreatedUtc', () => {
    it('should return timestamp from Reddit item', () => {
      const redditItems = [createMockRedditItem('abc123', 't3', { created_utc: 1700000000 })];
      syncManager.computeSyncState(redditItems);

      const syncItem = syncManager.getSyncItem('abc123')!;
      expect(syncManager.getCreatedUtc(syncItem)).toBe(1700000000);
    });

    it('should return undefined for orphaned items', () => {
      const mockFile = { path: 'Reddit/orphan.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-post', id: 'orphan1' },
      });
      syncManager.scanVault();
      syncManager.computeSyncState([]);

      const orphan = syncManager.getOrphanedItems()[0];
      expect(syncManager.getCreatedUtc(orphan)).toBeUndefined();
    });
  });

  describe('isComment', () => {
    it('should return true for comments', () => {
      const redditItems = [createMockRedditItem('comment1', 't1')];
      syncManager.computeSyncState(redditItems);

      const syncItem = syncManager.getSyncItem('comment1')!;
      expect(syncManager.isComment(syncItem)).toBe(true);
    });

    it('should return false for posts', () => {
      const redditItems = [createMockRedditItem('post1', 't3')];
      syncManager.computeSyncState(redditItems);

      const syncItem = syncManager.getSyncItem('post1')!;
      expect(syncManager.isComment(syncItem)).toBe(false);
    });

    it('should detect comment type from vault info for orphans', () => {
      const mockFile = { path: 'Reddit/orphan.md' };
      (mockApp.vault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
      (mockApp.metadataCache.getFileCache as jest.Mock).mockReturnValue({
        frontmatter: { type: 'reddit-comment', id: 'orphan1' },
      });
      syncManager.scanVault();
      syncManager.computeSyncState([]);

      const orphan = syncManager.getOrphanedItems()[0];
      expect(syncManager.isComment(orphan)).toBe(true);
    });
  });

  describe('refreshVaultState', () => {
    it('should rescan vault', () => {
      const scanSpy = jest.spyOn(syncManager, 'scanVault');

      syncManager.refreshVaultState();

      expect(scanSpy).toHaveBeenCalled();
    });
  });
});
