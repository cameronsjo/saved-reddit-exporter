import { ImportStateManager } from '../src/import-state';

// Mock Obsidian modules
jest.mock('obsidian');

// Create a properly structured mock App type
interface MockApp {
  vault: {
    adapter: {
      write: jest.Mock;
      read: jest.Mock;
      remove: jest.Mock;
    };
    getAbstractFileByPath: jest.Mock;
    create: jest.Mock;
  };
}

describe('ImportStateManager', () => {
  let mockApp: MockApp;
  let stateManager: ImportStateManager;

  beforeEach(() => {
    // Create a properly structured mock App
    mockApp = {
      vault: {
        adapter: {
          write: jest.fn().mockResolvedValue(undefined),
          read: jest.fn().mockResolvedValue('{}'),
          remove: jest.fn().mockResolvedValue(undefined),
        },
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stateManager = new ImportStateManager(mockApp as any, {
      autoSaveIntervalMs: 60000, // Long interval to prevent auto-save during tests
      enableCheckpointing: true,
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    stateManager.cleanup();
  });

  describe('startSession', () => {
    it('should create a new checkpoint with initial values', () => {
      const checkpoint = stateManager.startSession();

      expect(checkpoint.sessionId).toMatch(/^import-\d+-[a-z0-9]+$/);
      expect(checkpoint.phase).toBe('idle');
      expect(checkpoint.fetchedCount).toBe(0);
      expect(checkpoint.processedCount).toBe(0);
      expect(checkpoint.importedCount).toBe(0);
      expect(checkpoint.skippedCount).toBe(0);
      expect(checkpoint.failedCount).toBe(0);
      expect(checkpoint.completed).toBe(false);
      expect(checkpoint.cancelled).toBe(false);
    });

    it('should generate unique session IDs', () => {
      const checkpoint1 = stateManager.startSession();
      stateManager.cleanup();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stateManager2 = new ImportStateManager(mockApp as any);
      const checkpoint2 = stateManager2.startSession();
      stateManager2.cleanup();

      expect(checkpoint1.sessionId).not.toBe(checkpoint2.sessionId);
    });
  });

  describe('setPhase', () => {
    it('should update the phase', () => {
      stateManager.startSession();
      stateManager.setPhase('fetching');

      const checkpoint = stateManager.getCheckpoint();
      expect(checkpoint?.phase).toBe('fetching');
    });

    it('should do nothing if no session exists', () => {
      stateManager.setPhase('fetching');
      expect(stateManager.getCheckpoint()).toBeNull();
    });
  });

  describe('setCursor and getCursor', () => {
    it('should store and retrieve pagination cursor', () => {
      stateManager.startSession();
      stateManager.setCursor('after_abc123');

      expect(stateManager.getCursor()).toBe('after_abc123');
    });

    it('should return empty string if no session', () => {
      expect(stateManager.getCursor()).toBe('');
    });
  });

  describe('addFetchedItems', () => {
    it('should track fetched items', () => {
      stateManager.startSession();

      const mockItems = [
        {
          kind: 't3',
          data: {
            id: 'item1',
            name: 't3_item1',
            author: 'user',
            subreddit: 'test',
            permalink: '/r/test',
            created_utc: 123,
            score: 1,
          },
        },
        {
          kind: 't3',
          data: {
            id: 'item2',
            name: 't3_item2',
            author: 'user',
            subreddit: 'test',
            permalink: '/r/test',
            created_utc: 123,
            score: 1,
          },
        },
      ];

      stateManager.addFetchedItems(mockItems);

      const checkpoint = stateManager.getCheckpoint();
      expect(checkpoint?.fetchedCount).toBe(2);
      expect(checkpoint?.pendingItemIds).toContain('item1');
      expect(checkpoint?.pendingItemIds).toContain('item2');
    });
  });

  describe('markItemImported', () => {
    it('should update counts when item is imported', () => {
      stateManager.startSession();
      const mockItem = {
        kind: 't3',
        data: {
          id: 'item1',
          name: 't3_item1',
          author: 'user',
          subreddit: 'test',
          permalink: '/r/test',
          created_utc: 123,
          score: 1,
        },
      };
      stateManager.addFetchedItems([mockItem]);

      stateManager.markItemImported('item1');

      const checkpoint = stateManager.getCheckpoint();
      expect(checkpoint?.importedCount).toBe(1);
      expect(checkpoint?.processedCount).toBe(1);
      expect(checkpoint?.pendingItemIds).not.toContain('item1');
    });
  });

  describe('markItemSkipped', () => {
    it('should update counts when item is skipped', () => {
      stateManager.startSession();
      const mockItem = {
        kind: 't3',
        data: {
          id: 'item1',
          name: 't3_item1',
          author: 'user',
          subreddit: 'test',
          permalink: '/r/test',
          created_utc: 123,
          score: 1,
        },
      };
      stateManager.addFetchedItems([mockItem]);

      stateManager.markItemSkipped('item1');

      const checkpoint = stateManager.getCheckpoint();
      expect(checkpoint?.skippedCount).toBe(1);
      expect(checkpoint?.processedCount).toBe(1);
    });
  });

  describe('markItemFailed', () => {
    it('should track failed items', () => {
      stateManager.startSession();
      const mockItem = {
        kind: 't3',
        data: {
          id: 'item1',
          name: 't3_item1',
          author: 'user',
          subreddit: 'test',
          permalink: '/r/test',
          created_utc: 123,
          score: 1,
        },
      };
      stateManager.addFetchedItems([mockItem]);

      stateManager.markItemFailed('item1', 'Test error', true);

      const checkpoint = stateManager.getCheckpoint();
      expect(checkpoint?.failedCount).toBe(1);
      expect(checkpoint?.failedItemIds).toContain('item1');
      expect(checkpoint?.errors).toHaveLength(1);
      expect(checkpoint?.errors[0].error).toBe('Test error');
      expect(checkpoint?.errors[0].retryable).toBe(true);
    });

    it('should auto-pause after max errors', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const manager = new ImportStateManager(mockApp as any, {
        maxErrorsBeforePause: 2,
        enableCheckpointing: true,
      });
      manager.startSession();

      manager.markItemFailed('item1', 'Error 1', true);
      expect(manager.getCheckpoint()?.phase).not.toBe('paused');

      manager.markItemFailed('item2', 'Error 2', true);
      expect(manager.getCheckpoint()?.phase).toBe('paused');

      manager.cleanup();
    });
  });

  describe('markCompleted', () => {
    it('should mark session as completed', () => {
      stateManager.startSession();
      stateManager.markCompleted();

      const checkpoint = stateManager.getCheckpoint();
      expect(checkpoint?.completed).toBe(true);
      expect(checkpoint?.phase).toBe('completed');
    });
  });

  describe('markCancelled', () => {
    it('should mark session as cancelled', () => {
      stateManager.startSession();
      stateManager.markCancelled();

      const checkpoint = stateManager.getCheckpoint();
      expect(checkpoint?.cancelled).toBe(true);
      expect(checkpoint?.phase).toBe('paused');
    });
  });

  describe('shouldContinue', () => {
    it('should return true for active session', () => {
      stateManager.startSession();
      stateManager.setPhase('fetching');

      expect(stateManager.shouldContinue()).toBe(true);
    });

    it('should return false for completed session', () => {
      stateManager.startSession();
      stateManager.markCompleted();

      expect(stateManager.shouldContinue()).toBe(false);
    });

    it('should return false for cancelled session', () => {
      stateManager.startSession();
      stateManager.markCancelled();

      expect(stateManager.shouldContinue()).toBe(false);
    });

    it('should return false for paused session', () => {
      stateManager.startSession();
      stateManager.pause();

      expect(stateManager.shouldContinue()).toBe(false);
    });

    it('should return false if no session exists', () => {
      expect(stateManager.shouldContinue()).toBe(false);
    });
  });

  describe('getProgress', () => {
    it('should calculate progress metrics', async () => {
      stateManager.startSession();
      stateManager.setPhase('processing');

      // Add and process some items
      const items = [
        {
          kind: 't3',
          data: {
            id: 'item1',
            name: 't3_item1',
            author: 'user',
            subreddit: 'test',
            permalink: '/r/test',
            created_utc: 123,
            score: 1,
          },
        },
        {
          kind: 't3',
          data: {
            id: 'item2',
            name: 't3_item2',
            author: 'user',
            subreddit: 'test',
            permalink: '/r/test',
            created_utc: 123,
            score: 1,
          },
        },
      ];
      stateManager.addFetchedItems(items);
      stateManager.markItemImported('item1');

      // Wait a bit for elapsed time calculation
      await new Promise(resolve => setTimeout(resolve, 10));

      const progress = stateManager.getProgress();

      expect(progress).toBeDefined();
      expect(progress?.phase).toBe('processing');
      expect(progress?.fetchedCount).toBe(2);
      expect(progress?.importedCount).toBe(1);
      expect(progress?.elapsedMs).toBeGreaterThan(0);
    });

    it('should return null if no session', () => {
      expect(stateManager.getProgress()).toBeNull();
    });
  });

  describe('getRecentErrors', () => {
    it('should return recent errors', () => {
      stateManager.startSession();

      for (let i = 0; i < 15; i++) {
        stateManager.markItemFailed(`item${i}`, `Error ${i}`, true);
      }

      const recentErrors = stateManager.getRecentErrors(5);
      expect(recentErrors).toHaveLength(5);
      expect(recentErrors[0].error).toBe('Error 10');
    });

    it('should return empty array if no session', () => {
      expect(stateManager.getRecentErrors()).toEqual([]);
    });
  });

  describe('progress callback', () => {
    it('should call progress callback on updates', () => {
      const mockCallback = jest.fn();
      stateManager.onProgress(mockCallback);
      stateManager.startSession();

      stateManager.setPhase('fetching');

      expect(mockCallback).toHaveBeenCalled();
    });
  });
});
