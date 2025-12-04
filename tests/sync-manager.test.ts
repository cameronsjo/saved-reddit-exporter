import { SyncManager } from '../src/sync-manager';
import { RedditItem, RedditSavedSettings, SyncItem, VaultItemInfo } from '../src/types';
import { DEFAULT_FILTER_SETTINGS, DEFAULT_SETTINGS } from '../src/constants';

// Mock Obsidian App
function createMockApp(files: Array<{ path: string; frontmatter: Record<string, unknown> }> = []) {
  const fileCache = new Map<string, { frontmatter: Record<string, unknown> }>();
  const markdownFiles: Array<{ path: string }> = [];

  for (const file of files) {
    markdownFiles.push({ path: file.path });
    fileCache.set(file.path, { frontmatter: file.frontmatter });
  }

  return {
    vault: {
      getMarkdownFiles: () => markdownFiles,
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => fileCache.get(file.path),
    },
  } as unknown as import('obsidian').App;
}

// Helper to create mock Reddit item
function createMockRedditItem(
  overrides: Partial<RedditItem['data']> = {},
  kind: 't1' | 't3' = 't3'
): RedditItem {
  const id = overrides.id || 'test123';
  return {
    kind,
    data: {
      id,
      name: `${kind}_${id}`,
      title: 'Test Post Title',
      link_title: 'Parent Post Title',
      author: 'testuser',
      subreddit: 'testsubreddit',
      permalink: `/r/testsubreddit/comments/${id}/test_post/`,
      created_utc: Math.floor(Date.now() / 1000) - 3600,
      score: 100,
      url: 'https://example.com/link',
      domain: 'example.com',
      is_self: false,
      selftext: '',
      num_comments: 50,
      upvote_ratio: 0.95,
      link_flair_text: 'Discussion',
      over_18: false,
      ...overrides,
    },
  };
}

// Helper to create settings
function createSettings(overrides: Partial<RedditSavedSettings> = {}): RedditSavedSettings {
  return {
    ...DEFAULT_SETTINGS,
    filterSettings: {
      ...DEFAULT_FILTER_SETTINGS,
      enabled: false, // Disable filters by default for simpler testing
    },
    ...overrides,
  };
}

describe('SyncManager', () => {
  describe('scanVault', () => {
    it('should scan vault and extract Reddit items from frontmatter', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
            title: 'Test Post',
            subreddit: 'test',
            author: 'user1',
            score: 100,
          },
        },
        {
          path: 'reddit/comment1.md',
          frontmatter: {
            type: 'reddit-comment',
            id: 'def456',
            subreddit: 'other',
            author: 'user2',
          },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      const vaultItems = manager.scanVault();

      expect(vaultItems.size).toBe(2);
      expect(vaultItems.get('abc123')).toMatchObject({
        path: 'reddit/post1.md',
        id: 'abc123',
        title: 'Test Post',
        subreddit: 'test',
      });
      expect(vaultItems.get('def456')).toMatchObject({
        path: 'reddit/comment1.md',
        id: 'def456',
        subreddit: 'other',
      });
    });

    it('should handle multiple IDs in reddit_ids array', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/merged.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'primary123',
            reddit_ids: ['primary123', 'secondary456', 'tertiary789'],
            title: 'Merged Post',
            subreddit: 'test',
          },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      const vaultItems = manager.scanVault();

      // All IDs should map to the same vault file
      expect(vaultItems.size).toBe(3);
      expect(vaultItems.get('primary123')?.path).toBe('reddit/merged.md');
      expect(vaultItems.get('secondary456')?.path).toBe('reddit/merged.md');
      expect(vaultItems.get('tertiary789')?.path).toBe('reddit/merged.md');
    });

    it('should skip files without Reddit-type frontmatter', () => {
      const mockApp = createMockApp([
        {
          path: 'notes/regular.md',
          frontmatter: {
            type: 'note',
            title: 'Regular Note',
          },
        },
        {
          path: 'reddit/post.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
          },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      const vaultItems = manager.scanVault();

      expect(vaultItems.size).toBe(1);
      expect(vaultItems.has('abc123')).toBe(true);
    });

    it('should skip files without id', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/broken.md',
          frontmatter: {
            type: 'reddit-post',
            title: 'No ID Post',
          },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      const vaultItems = manager.scanVault();

      expect(vaultItems.size).toBe(0);
    });
  });

  describe('computeSyncState', () => {
    it('should categorize items as imported when they exist in vault', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/post1.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'abc123',
            subreddit: 'test',
          },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'abc123' })];
      const result = manager.computeSyncState(redditItems);

      expect(result.imported.length).toBe(1);
      expect(result.pending.length).toBe(0);
      expect(result.filtered.length).toBe(0);
      expect(result.orphaned.length).toBe(0);
      expect(result.imported[0].status).toBe('imported');
      expect(result.imported[0].vaultPath).toBe('reddit/post1.md');
    });

    it('should categorize items as pending when not in vault and passes filters', () => {
      const mockApp = createMockApp([]);
      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'new123' })];
      const result = manager.computeSyncState(redditItems);

      expect(result.imported.length).toBe(0);
      expect(result.pending.length).toBe(1);
      expect(result.filtered.length).toBe(0);
      expect(result.orphaned.length).toBe(0);
      expect(result.pending[0].status).toBe('pending');
    });

    it('should categorize items as filtered when they fail filter checks', () => {
      const mockApp = createMockApp([]);
      const settings = createSettings({
        filterSettings: {
          ...DEFAULT_FILTER_SETTINGS,
          enabled: true,
          excludeNsfw: true,
        },
      });

      const manager = new SyncManager(mockApp, settings);
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'nsfw123', over_18: true })];
      const result = manager.computeSyncState(redditItems);

      expect(result.imported.length).toBe(0);
      expect(result.pending.length).toBe(0);
      expect(result.filtered.length).toBe(1);
      expect(result.filtered[0].status).toBe('filtered');
      expect(result.filtered[0].filterResult).toBeDefined();
    });

    it('should categorize vault items as orphaned when not on Reddit', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/old-post.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'orphan123',
            subreddit: 'test',
            title: 'Old Post',
          },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      // Reddit items don't include the vault item
      const redditItems = [createMockRedditItem({ id: 'different123' })];
      const result = manager.computeSyncState(redditItems);

      expect(result.orphaned.length).toBe(1);
      expect(result.orphaned[0].status).toBe('orphaned');
      expect(result.orphaned[0].vaultPath).toBe('reddit/old-post.md');
      expect(result.orphaned[0].item).toBeUndefined();
    });

    it('should compute correct stats', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/existing.md',
          frontmatter: { type: 'reddit-post', id: 'existing123', subreddit: 'test' },
        },
        {
          path: 'reddit/orphan.md',
          frontmatter: { type: 'reddit-post', id: 'orphan123', subreddit: 'test' },
        },
      ]);

      const settings = createSettings({
        filterSettings: {
          ...DEFAULT_FILTER_SETTINGS,
          enabled: true,
          excludeNsfw: true,
        },
      });

      const manager = new SyncManager(mockApp, settings);
      manager.scanVault();

      const redditItems = [
        createMockRedditItem({ id: 'existing123' }), // imported
        createMockRedditItem({ id: 'new123' }), // pending
        createMockRedditItem({ id: 'nsfw123', over_18: true }), // filtered
      ];

      const result = manager.computeSyncState(redditItems);

      expect(result.stats).toEqual({
        totalReddit: 3,
        totalVault: 2,
        imported: 1,
        pending: 1,
        filtered: 1,
        orphaned: 1,
      });
    });
  });

  describe('toggleOverride', () => {
    it('should toggle filtered item to override-pending', () => {
      const mockApp = createMockApp([]);
      const settings = createSettings({
        filterSettings: {
          ...DEFAULT_FILTER_SETTINGS,
          enabled: true,
          excludeNsfw: true,
        },
      });

      const manager = new SyncManager(mockApp, settings);
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'nsfw123', over_18: true })];
      manager.computeSyncState(redditItems);

      // Toggle override on
      const result = manager.toggleOverride('nsfw123');
      expect(result).toBe(true);

      const syncItem = manager.getSyncItem('nsfw123');
      expect(syncItem?.status).toBe('override-pending');
      expect(syncItem?.userOverride).toBe(true);
    });

    it('should toggle override-pending back to filtered', () => {
      const mockApp = createMockApp([]);
      const settings = createSettings({
        filterSettings: {
          ...DEFAULT_FILTER_SETTINGS,
          enabled: true,
          excludeNsfw: true,
        },
      });

      const manager = new SyncManager(mockApp, settings);
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'nsfw123', over_18: true })];
      manager.computeSyncState(redditItems);

      // Toggle on then off
      manager.toggleOverride('nsfw123');
      manager.toggleOverride('nsfw123');

      const syncItem = manager.getSyncItem('nsfw123');
      expect(syncItem?.status).toBe('filtered');
      expect(syncItem?.userOverride).toBe(false);
    });

    it('should return false for imported items', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/post.md',
          frontmatter: { type: 'reddit-post', id: 'abc123', subreddit: 'test' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'abc123' })];
      manager.computeSyncState(redditItems);

      const result = manager.toggleOverride('abc123');
      expect(result).toBe(false);
    });

    it('should return false for orphaned items', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/orphan.md',
          frontmatter: { type: 'reddit-post', id: 'orphan123', subreddit: 'test' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems: RedditItem[] = [];
      manager.computeSyncState(redditItems);

      const result = manager.toggleOverride('orphan123');
      expect(result).toBe(false);
    });
  });

  describe('getItemsToImport', () => {
    it('should return pending and override-pending items', () => {
      const mockApp = createMockApp([]);
      const settings = createSettings({
        filterSettings: {
          ...DEFAULT_FILTER_SETTINGS,
          enabled: true,
          excludeNsfw: true,
        },
      });

      const manager = new SyncManager(mockApp, settings);
      manager.scanVault();

      const redditItems = [
        createMockRedditItem({ id: 'pending1' }),
        createMockRedditItem({ id: 'pending2' }),
        createMockRedditItem({ id: 'nsfw123', over_18: true }),
      ];
      manager.computeSyncState(redditItems);

      // Override the NSFW item
      manager.toggleOverride('nsfw123');

      const itemsToImport = manager.getItemsToImport();

      expect(itemsToImport.length).toBe(3);
      expect(itemsToImport.map(i => i.data.id).sort()).toEqual(['nsfw123', 'pending1', 'pending2']);
    });

    it('should filter by selectedIds when provided', () => {
      const mockApp = createMockApp([]);
      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [
        createMockRedditItem({ id: 'pending1' }),
        createMockRedditItem({ id: 'pending2' }),
        createMockRedditItem({ id: 'pending3' }),
      ];
      manager.computeSyncState(redditItems);

      const selectedIds = new Set(['pending1', 'pending3']);
      const itemsToImport = manager.getItemsToImport(selectedIds);

      expect(itemsToImport.length).toBe(2);
      expect(itemsToImport.map(i => i.data.id).sort()).toEqual(['pending1', 'pending3']);
    });
  });

  describe('getItemsToReprocess', () => {
    it('should return imported items with RedditItem data', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/post1.md',
          frontmatter: { type: 'reddit-post', id: 'abc123', subreddit: 'test' },
        },
        {
          path: 'reddit/post2.md',
          frontmatter: { type: 'reddit-post', id: 'def456', subreddit: 'test' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [
        createMockRedditItem({ id: 'abc123' }),
        createMockRedditItem({ id: 'def456' }),
      ];
      manager.computeSyncState(redditItems);

      const itemsToReprocess = manager.getItemsToReprocess();

      expect(itemsToReprocess.length).toBe(2);
      expect(itemsToReprocess[0].vaultPath).toBeDefined();
      expect(itemsToReprocess[0].item).toBeDefined();
    });

    it('should filter by selectedIds when provided', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/post1.md',
          frontmatter: { type: 'reddit-post', id: 'abc123', subreddit: 'test' },
        },
        {
          path: 'reddit/post2.md',
          frontmatter: { type: 'reddit-post', id: 'def456', subreddit: 'test' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [
        createMockRedditItem({ id: 'abc123' }),
        createMockRedditItem({ id: 'def456' }),
      ];
      manager.computeSyncState(redditItems);

      const selectedIds = new Set(['abc123']);
      const itemsToReprocess = manager.getItemsToReprocess(selectedIds);

      expect(itemsToReprocess.length).toBe(1);
      expect(itemsToReprocess[0].item?.data.id).toBe('abc123');
    });
  });

  describe('getItemsToUnsave', () => {
    it('should return items matching selectedIds that have RedditItem data', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/post1.md',
          frontmatter: { type: 'reddit-post', id: 'abc123', subreddit: 'test' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [
        createMockRedditItem({ id: 'abc123' }),
        createMockRedditItem({ id: 'pending1' }),
      ];
      manager.computeSyncState(redditItems);

      const selectedIds = new Set(['abc123', 'pending1']);
      const itemsToUnsave = manager.getItemsToUnsave(selectedIds);

      expect(itemsToUnsave.length).toBe(2);
    });
  });

  describe('clearOverrides', () => {
    it('should reset all overrides to filtered status', () => {
      const mockApp = createMockApp([]);
      const settings = createSettings({
        filterSettings: {
          ...DEFAULT_FILTER_SETTINGS,
          enabled: true,
          excludeNsfw: true,
        },
      });

      const manager = new SyncManager(mockApp, settings);
      manager.scanVault();

      const redditItems = [
        createMockRedditItem({ id: 'nsfw1', over_18: true }),
        createMockRedditItem({ id: 'nsfw2', over_18: true }),
      ];
      manager.computeSyncState(redditItems);

      // Toggle overrides on
      manager.toggleOverride('nsfw1');
      manager.toggleOverride('nsfw2');

      expect(manager.getSyncItem('nsfw1')?.status).toBe('override-pending');
      expect(manager.getSyncItem('nsfw2')?.status).toBe('override-pending');

      // Clear all overrides
      manager.clearOverrides();

      expect(manager.getSyncItem('nsfw1')?.status).toBe('filtered');
      expect(manager.getSyncItem('nsfw2')?.status).toBe('filtered');
      expect(manager.getSyncItem('nsfw1')?.userOverride).toBe(false);
      expect(manager.getSyncItem('nsfw2')?.userOverride).toBe(false);
    });
  });

  describe('getFullname', () => {
    it('should return fullname from RedditItem', () => {
      const mockApp = createMockApp([]);
      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'abc123' })];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('abc123');
      expect(manager.getFullname(syncItem!)).toBe('t3_abc123');
    });

    it('should reconstruct fullname for orphaned post', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/orphan.md',
          frontmatter: { type: 'reddit-post', id: 'orphan123', subreddit: 'test' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems: RedditItem[] = [];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('orphan123');
      expect(manager.getFullname(syncItem!)).toBe('t3_orphan123');
    });

    it('should reconstruct fullname for orphaned comment', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/orphan-comment.md',
          frontmatter: { type: 'reddit-comment', id: 'comment123', subreddit: 'test' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems: RedditItem[] = [];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('comment123');
      expect(manager.getFullname(syncItem!)).toBe('t1_comment123');
    });
  });

  describe('getDisplayTitle', () => {
    it('should return title for posts', () => {
      const mockApp = createMockApp([]);
      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'abc123', title: 'My Post Title' })];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('abc123');
      expect(manager.getDisplayTitle(syncItem!)).toBe('My Post Title');
    });

    it('should return "Comment on: <title>" for comments', () => {
      const mockApp = createMockApp([]);
      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [
        createMockRedditItem({ id: 'comment123', link_title: 'Parent Post' }, 't1'),
      ];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('comment123');
      expect(manager.getDisplayTitle(syncItem!)).toBe('Comment on: Parent Post');
    });

    it('should use vault frontmatter for orphaned items', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/orphan.md',
          frontmatter: {
            type: 'reddit-post',
            id: 'orphan123',
            title: 'Vault Title',
            subreddit: 'test',
          },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems: RedditItem[] = [];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('orphan123');
      expect(manager.getDisplayTitle(syncItem!)).toBe('Vault Title');
    });

    it('should return fallback for orphaned items without title', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/orphan.md',
          frontmatter: { type: 'reddit-post', id: 'orphan123', subreddit: 'deleted' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems: RedditItem[] = [];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('orphan123');
      expect(manager.getDisplayTitle(syncItem!)).toBe('[Deleted] r/deleted');
    });
  });

  describe('getSubreddit', () => {
    it('should return subreddit from RedditItem', () => {
      const mockApp = createMockApp([]);
      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'abc123', subreddit: 'programming' })];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('abc123');
      expect(manager.getSubreddit(syncItem!)).toBe('programming');
    });

    it('should return subreddit from vault for orphaned items', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/orphan.md',
          frontmatter: { type: 'reddit-post', id: 'orphan123', subreddit: 'oldsubreddit' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems: RedditItem[] = [];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('orphan123');
      expect(manager.getSubreddit(syncItem!)).toBe('oldsubreddit');
    });
  });

  describe('isComment', () => {
    it('should return true for comment items', () => {
      const mockApp = createMockApp([]);
      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'comment123' }, 't1')];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('comment123');
      expect(manager.isComment(syncItem!)).toBe(true);
    });

    it('should return false for post items', () => {
      const mockApp = createMockApp([]);
      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'post123' }, 't3')];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('post123');
      expect(manager.isComment(syncItem!)).toBe(false);
    });

    it('should use vault type for orphaned items', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/orphan-comment.md',
          frontmatter: { type: 'reddit-comment', id: 'orphan123', subreddit: 'test' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems: RedditItem[] = [];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('orphan123');
      expect(manager.isComment(syncItem!)).toBe(true);
    });
  });

  describe('getItemsByStatus', () => {
    it('should filter items by status', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/existing.md',
          frontmatter: { type: 'reddit-post', id: 'existing123', subreddit: 'test' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [
        createMockRedditItem({ id: 'existing123' }),
        createMockRedditItem({ id: 'pending1' }),
        createMockRedditItem({ id: 'pending2' }),
      ];
      manager.computeSyncState(redditItems);

      const importedItems = manager.getItemsByStatus('imported');
      const pendingItems = manager.getItemsByStatus('pending');

      expect(importedItems.length).toBe(1);
      expect(pendingItems.length).toBe(2);
    });
  });

  describe('getAllSyncItems', () => {
    it('should return all sync items', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/existing.md',
          frontmatter: { type: 'reddit-post', id: 'existing123', subreddit: 'test' },
        },
        {
          path: 'reddit/orphan.md',
          frontmatter: { type: 'reddit-post', id: 'orphan123', subreddit: 'test' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [
        createMockRedditItem({ id: 'existing123' }),
        createMockRedditItem({ id: 'pending1' }),
      ];
      manager.computeSyncState(redditItems);

      const allItems = manager.getAllSyncItems();

      // existing123 (imported) + pending1 (pending) + orphan123 (orphaned)
      expect(allItems.length).toBe(3);
    });
  });

  describe('getScore', () => {
    it('should return score from RedditItem', () => {
      const mockApp = createMockApp([]);
      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'abc123', score: 500 })];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('abc123');
      expect(manager.getScore(syncItem!)).toBe(500);
    });

    it('should return score from vault for orphaned items', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/orphan.md',
          frontmatter: { type: 'reddit-post', id: 'orphan123', subreddit: 'test', score: 250 },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems: RedditItem[] = [];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('orphan123');
      expect(manager.getScore(syncItem!)).toBe(250);
    });
  });

  describe('getCreatedUtc', () => {
    it('should return created_utc from RedditItem', () => {
      const timestamp = 1700000000;
      const mockApp = createMockApp([]);
      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems = [createMockRedditItem({ id: 'abc123', created_utc: timestamp })];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('abc123');
      expect(manager.getCreatedUtc(syncItem!)).toBe(timestamp);
    });

    it('should return undefined for orphaned items', () => {
      const mockApp = createMockApp([
        {
          path: 'reddit/orphan.md',
          frontmatter: { type: 'reddit-post', id: 'orphan123', subreddit: 'test' },
        },
      ]);

      const manager = new SyncManager(mockApp, createSettings());
      manager.scanVault();

      const redditItems: RedditItem[] = [];
      manager.computeSyncState(redditItems);

      const syncItem = manager.getSyncItem('orphan123');
      expect(manager.getCreatedUtc(syncItem!)).toBeUndefined();
    });
  });
});
