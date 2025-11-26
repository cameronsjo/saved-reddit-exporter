import { UnsaveSelectionModal, AutoUnsaveConfirmModal } from '../src/unsave-modal';
import { RedditItem } from '../src/types';
import { App } from 'obsidian';

// Mock Obsidian modules
jest.mock('obsidian');

describe('UnsaveSelectionModal', () => {
  let mockApp: App;
  let mockItems: RedditItem[];
  let mockOnConfirm: jest.Mock;
  let mockOnCancel: jest.Mock;

  beforeEach(() => {
    mockApp = new App();
    mockOnConfirm = jest.fn().mockResolvedValue(undefined);
    mockOnCancel = jest.fn();

    mockItems = [
      {
        kind: 't3',
        data: {
          id: 'post1',
          name: 't3_post1',
          title: 'Test Post 1',
          author: 'user1',
          subreddit: 'test',
          created_utc: 1234567890,
          permalink: '/r/test/comments/post1',
          score: 100,
          num_comments: 5,
          is_self: true,
        },
      },
      {
        kind: 't3',
        data: {
          id: 'post2',
          name: 't3_post2',
          title: 'Test Post 2',
          author: 'user2',
          subreddit: 'programming',
          created_utc: 1234567900,
          permalink: '/r/programming/comments/post2',
          score: 200,
          num_comments: 10,
          is_self: false,
          url: 'https://example.com',
        },
      },
      {
        kind: 't1',
        data: {
          id: 'comment1',
          name: 't1_comment1',
          author: 'user3',
          subreddit: 'test',
          created_utc: 1234567880,
          permalink: '/r/test/comments/post1/comment1',
          score: 50,
          body: 'This is a comment',
          link_title: 'Original Post Title',
        },
      },
    ];
  });

  describe('constructor', () => {
    it('should initialize with all items selected by default', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm, mockOnCancel);
      expect(modal).toBeDefined();
      // All items should be selected by default (internal state)
      expect(modal['selectedItems'].size).toBe(3);
    });

    it('should accept optional onCancel callback', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      expect(modal).toBeDefined();
    });

    it('should store items reference', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      expect(modal['items']).toBe(mockItems);
      expect(modal['items'].length).toBe(3);
    });
  });

  describe('getFilteredAndSortedItems', () => {
    it('should filter posts only', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['filterType'] = 'posts';
      const filtered = modal['getFilteredAndSortedItems']();
      expect(filtered.length).toBe(2);
      expect(filtered.every(item => item.kind === 't3')).toBe(true);
    });

    it('should filter comments only', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['filterType'] = 'comments';
      const filtered = modal['getFilteredAndSortedItems']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].kind).toBe('t1');
    });

    it('should return all items when filter is all', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['filterType'] = 'all';
      const filtered = modal['getFilteredAndSortedItems']();
      expect(filtered.length).toBe(3);
    });

    it('should search by title', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['searchQuery'] = 'Post 1';
      const filtered = modal['getFilteredAndSortedItems']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].data.title).toBe('Test Post 1');
    });

    it('should search by subreddit', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['searchQuery'] = 'programming';
      const filtered = modal['getFilteredAndSortedItems']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].data.subreddit).toBe('programming');
    });

    it('should search by author', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['searchQuery'] = 'user3';
      const filtered = modal['getFilteredAndSortedItems']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].data.author).toBe('user3');
    });

    it('should search case-insensitively', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['searchQuery'] = 'PROGRAMMING';
      const filtered = modal['getFilteredAndSortedItems']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].data.subreddit).toBe('programming');
    });

    it('should sort by subreddit', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['sortBy'] = 'subreddit';
      const sorted = modal['getFilteredAndSortedItems']();
      expect(sorted[0].data.subreddit).toBe('programming');
      expect(sorted[1].data.subreddit).toBe('test');
    });

    it('should sort by date (newest first)', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['sortBy'] = 'date';
      const sorted = modal['getFilteredAndSortedItems']();
      expect(sorted[0].data.created_utc).toBe(1234567900);
      expect(sorted[2].data.created_utc).toBe(1234567880);
    });

    it('should sort by score (highest first)', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['sortBy'] = 'score';
      const sorted = modal['getFilteredAndSortedItems']();
      expect(sorted[0].data.score).toBe(200);
      expect(sorted[2].data.score).toBe(50);
    });

    it('should sort by type', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['sortBy'] = 'type';
      const sorted = modal['getFilteredAndSortedItems']();
      expect(sorted[0].kind).toBe('t1'); // comments first (t1 < t3)
      expect(sorted[1].kind).toBe('t3');
    });
  });

  describe('selection methods', () => {
    it('should toggle individual items to deselected', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      const item = mockItems[0];

      // Initially selected
      expect(modal['selectedItems'].has(item.data.name)).toBe(true);

      // Deselect
      modal['toggleItem'](item, false);
      expect(modal['selectedItems'].has(item.data.name)).toBe(false);
    });

    it('should toggle individual items to selected', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      const item = mockItems[0];

      // Deselect first
      modal['toggleItem'](item, false);
      expect(modal['selectedItems'].has(item.data.name)).toBe(false);

      // Select again
      modal['toggleItem'](item, true);
      expect(modal['selectedItems'].has(item.data.name)).toBe(true);
    });

    it('should track multiple selections independently', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);

      // Deselect first item
      modal['toggleItem'](mockItems[0], false);

      // Check states
      expect(modal['selectedItems'].has(mockItems[0].data.name)).toBe(false);
      expect(modal['selectedItems'].has(mockItems[1].data.name)).toBe(true);
      expect(modal['selectedItems'].has(mockItems[2].data.name)).toBe(true);
      expect(modal['selectedItems'].size).toBe(2);
    });
  });

  describe('combined filter and search', () => {
    it('should filter and search together', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['filterType'] = 'posts';
      modal['searchQuery'] = 'Post 1';
      const filtered = modal['getFilteredAndSortedItems']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].data.title).toBe('Test Post 1');
    });

    it('should handle empty search results', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      modal['searchQuery'] = 'nonexistent query that matches nothing';
      const filtered = modal['getFilteredAndSortedItems']();
      expect(filtered.length).toBe(0);
    });

    it('should apply filter before search', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      // Search for 'test' which matches both a post and a comment's subreddit
      modal['filterType'] = 'comments';
      modal['searchQuery'] = 'test';
      const filtered = modal['getFilteredAndSortedItems']();
      // Should only return the comment since filter is set to comments
      expect(filtered.length).toBe(1);
      expect(filtered[0].kind).toBe('t1');
    });
  });

  describe('focus management', () => {
    it('should initialize focus index to -1', () => {
      const modal = new UnsaveSelectionModal(mockApp, mockItems, mockOnConfirm);
      expect(modal['focusedIndex']).toBe(-1);
    });
  });
});

describe('AutoUnsaveConfirmModal', () => {
  let mockApp: App;
  let mockOnConfirm: jest.Mock;
  let mockOnCancel: jest.Mock;

  beforeEach(() => {
    mockApp = new App();
    mockOnConfirm = jest.fn();
    mockOnCancel = jest.fn();
  });

  describe('constructor', () => {
    it('should initialize with item count', () => {
      const modal = new AutoUnsaveConfirmModal(mockApp, 5, mockOnConfirm, mockOnCancel);
      expect(modal).toBeDefined();
      expect(modal['itemCount']).toBe(5);
    });

    it('should accept optional onCancel callback', () => {
      const modal = new AutoUnsaveConfirmModal(mockApp, 5, mockOnConfirm);
      expect(modal).toBeDefined();
    });

    it('should store onConfirm callback', () => {
      const modal = new AutoUnsaveConfirmModal(mockApp, 5, mockOnConfirm);
      expect(modal['onConfirm']).toBe(mockOnConfirm);
    });

    it('should store onCancel callback', () => {
      const modal = new AutoUnsaveConfirmModal(mockApp, 5, mockOnConfirm, mockOnCancel);
      expect(modal['onCancel']).toBe(mockOnCancel);
    });
  });
});
