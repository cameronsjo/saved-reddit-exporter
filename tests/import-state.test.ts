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

  describe('resumeSession', () => {
    it('should resume an incomplete session from checkpoint', async () => {
      const savedCheckpoint = {
        sessionId: 'import-123-abc',
        startedAt: Date.now() - 10000,
        lastUpdatedAt: Date.now() - 5000,
        phase: 'fetching',
        afterCursor: 'cursor123',
        fetchedCount: 50,
        processedCount: 25,
        importedCount: 20,
        skippedCount: 3,
        failedCount: 2,
        pendingItemIds: ['item1', 'item2'],
        failedItemIds: ['item3'],
        errors: [],
        completed: false,
        cancelled: false,
      };

      mockApp.vault.getAbstractFileByPath.mockReturnValue({
        path: '.reddit-import-checkpoint.json',
      });
      mockApp.vault.adapter.read.mockResolvedValue(JSON.stringify(savedCheckpoint));

      const resumed = await stateManager.resumeSession();

      expect(resumed).not.toBeNull();
      expect(resumed?.sessionId).toBe('import-123-abc');
      expect(resumed?.phase).toBe('paused'); // Should be set to paused on resume
      expect(resumed?.fetchedCount).toBe(50);
    });

    it('should return null if checkpoint is completed', async () => {
      const completedCheckpoint = {
        sessionId: 'import-123-abc',
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        phase: 'completed',
        afterCursor: '',
        fetchedCount: 100,
        processedCount: 100,
        importedCount: 100,
        skippedCount: 0,
        failedCount: 0,
        pendingItemIds: [],
        failedItemIds: [],
        errors: [],
        completed: true,
        cancelled: false,
      };

      mockApp.vault.getAbstractFileByPath.mockReturnValue({
        path: '.reddit-import-checkpoint.json',
      });
      mockApp.vault.adapter.read.mockResolvedValue(JSON.stringify(completedCheckpoint));

      const resumed = await stateManager.resumeSession();
      expect(resumed).toBeNull();
    });

    it('should return null if checkpoint is cancelled', async () => {
      const cancelledCheckpoint = {
        sessionId: 'import-123-abc',
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        phase: 'paused',
        afterCursor: '',
        fetchedCount: 50,
        processedCount: 50,
        importedCount: 50,
        skippedCount: 0,
        failedCount: 0,
        pendingItemIds: [],
        failedItemIds: [],
        errors: [],
        completed: false,
        cancelled: true,
      };

      mockApp.vault.getAbstractFileByPath.mockReturnValue({
        path: '.reddit-import-checkpoint.json',
      });
      mockApp.vault.adapter.read.mockResolvedValue(JSON.stringify(cancelledCheckpoint));

      const resumed = await stateManager.resumeSession();
      expect(resumed).toBeNull();
    });

    it('should return null if no checkpoint file exists', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

      const resumed = await stateManager.resumeSession();
      expect(resumed).toBeNull();
    });
  });

  describe('hasResumableSession', () => {
    it('should return true for incomplete session', async () => {
      const incompleteCheckpoint = {
        sessionId: 'import-123-abc',
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        phase: 'fetching',
        afterCursor: '',
        fetchedCount: 50,
        processedCount: 25,
        importedCount: 25,
        skippedCount: 0,
        failedCount: 0,
        pendingItemIds: [],
        failedItemIds: [],
        errors: [],
        completed: false,
        cancelled: false,
      };

      mockApp.vault.getAbstractFileByPath.mockReturnValue({
        path: '.reddit-import-checkpoint.json',
      });
      mockApp.vault.adapter.read.mockResolvedValue(JSON.stringify(incompleteCheckpoint));

      const hasResumable = await stateManager.hasResumableSession();
      expect(hasResumable).toBe(true);
    });

    it('should return false for completed session', async () => {
      const completedCheckpoint = {
        sessionId: 'import-123-abc',
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        phase: 'completed',
        afterCursor: '',
        fetchedCount: 100,
        processedCount: 100,
        importedCount: 100,
        skippedCount: 0,
        failedCount: 0,
        pendingItemIds: [],
        failedItemIds: [],
        errors: [],
        completed: true,
        cancelled: false,
      };

      mockApp.vault.getAbstractFileByPath.mockReturnValue({
        path: '.reddit-import-checkpoint.json',
      });
      mockApp.vault.adapter.read.mockResolvedValue(JSON.stringify(completedCheckpoint));

      const hasResumable = await stateManager.hasResumableSession();
      expect(hasResumable).toBe(false);
    });

    it('should return false when no checkpoint exists', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

      const hasResumable = await stateManager.hasResumableSession();
      expect(hasResumable).toBe(false);
    });
  });

  describe('getPendingItems', () => {
    it('should return all pending items', () => {
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

      const pending = stateManager.getPendingItems();
      expect(pending).toHaveLength(2);
      expect(pending[0].data.id).toBe('item1');
      expect(pending[1].data.id).toBe('item2');
    });

    it('should return empty array when no items added', () => {
      stateManager.startSession();
      const pending = stateManager.getPendingItems();
      expect(pending).toEqual([]);
    });
  });

  describe('getFailedItemIds', () => {
    it('should return failed item IDs', () => {
      stateManager.startSession();

      stateManager.markItemFailed('item1', 'Error 1', true);
      stateManager.markItemFailed('item2', 'Error 2', true);

      const failedIds = stateManager.getFailedItemIds();
      expect(failedIds).toContain('item1');
      expect(failedIds).toContain('item2');
    });

    it('should return empty array if no session', () => {
      const failedIds = stateManager.getFailedItemIds();
      expect(failedIds).toEqual([]);
    });
  });

  describe('clearFailedItems', () => {
    it('should clear all failed item IDs', () => {
      stateManager.startSession();

      stateManager.markItemFailed('item1', 'Error 1', true);
      stateManager.markItemFailed('item2', 'Error 2', true);

      expect(stateManager.getFailedItemIds()).toHaveLength(2);

      stateManager.clearFailedItems();

      expect(stateManager.getFailedItemIds()).toEqual([]);
    });

    it('should do nothing if no session', () => {
      // Should not throw
      stateManager.clearFailedItems();
      expect(stateManager.getFailedItemIds()).toEqual([]);
    });
  });

  describe('saveCheckpoint', () => {
    it('should update existing checkpoint file', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue({
        path: '.reddit-import-checkpoint.json',
      });

      stateManager.startSession();
      await stateManager.saveCheckpoint();

      expect(mockApp.vault.adapter.write).toHaveBeenCalled();
      expect(mockApp.vault.create).not.toHaveBeenCalled();
    });

    it('should create new checkpoint file if none exists', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

      stateManager.startSession();
      await stateManager.saveCheckpoint();

      expect(mockApp.vault.create).toHaveBeenCalled();
    });

    it('should not save if checkpointing is disabled', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const noCheckpointManager = new ImportStateManager(mockApp as any, {
        enableCheckpointing: false,
      });
      noCheckpointManager.startSession();
      await noCheckpointManager.saveCheckpoint();

      expect(mockApp.vault.adapter.write).not.toHaveBeenCalled();
      expect(mockApp.vault.create).not.toHaveBeenCalled();
      noCheckpointManager.cleanup();
    });

    it('should not save if no session exists', async () => {
      await stateManager.saveCheckpoint();

      expect(mockApp.vault.adapter.write).not.toHaveBeenCalled();
      expect(mockApp.vault.create).not.toHaveBeenCalled();
    });

    it('should handle save errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);
      mockApp.vault.create.mockRejectedValue(new Error('Write failed'));

      stateManager.startSession();
      await stateManager.saveCheckpoint();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save import checkpoint:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('loadCheckpoint', () => {
    it('should load checkpoint from file', async () => {
      const savedCheckpoint = {
        sessionId: 'import-123-abc',
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        phase: 'fetching',
        afterCursor: 'cursor123',
        fetchedCount: 50,
        processedCount: 25,
        importedCount: 20,
        skippedCount: 3,
        failedCount: 2,
        pendingItemIds: [],
        failedItemIds: [],
        errors: [],
        completed: false,
        cancelled: false,
      };

      mockApp.vault.getAbstractFileByPath.mockReturnValue({
        path: '.reddit-import-checkpoint.json',
      });
      mockApp.vault.adapter.read.mockResolvedValue(JSON.stringify(savedCheckpoint));

      // Access private method via any cast for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loaded = await (stateManager as any).loadCheckpoint();

      expect(loaded).not.toBeNull();
      expect(loaded.sessionId).toBe('import-123-abc');
    });

    it('should return null when checkpointing is disabled', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const noCheckpointManager = new ImportStateManager(mockApp as any, {
        enableCheckpointing: false,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loaded = await (noCheckpointManager as any).loadCheckpoint();
      expect(loaded).toBeNull();
      noCheckpointManager.cleanup();
    });

    it('should return null when no checkpoint file exists', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loaded = await (stateManager as any).loadCheckpoint();
      expect(loaded).toBeNull();
    });

    it('should handle load errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockApp.vault.getAbstractFileByPath.mockReturnValue({
        path: '.reddit-import-checkpoint.json',
      });
      mockApp.vault.adapter.read.mockRejectedValue(new Error('Read failed'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loaded = await (stateManager as any).loadCheckpoint();

      expect(loaded).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load import checkpoint:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('clearCheckpoint', () => {
    it('should remove checkpoint file if it exists', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue({
        path: '.reddit-import-checkpoint.json',
      });

      await stateManager.clearCheckpoint();

      expect(mockApp.vault.adapter.remove).toHaveBeenCalledWith('.reddit-import-checkpoint.json');
    });

    it('should do nothing if checkpoint file does not exist', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

      await stateManager.clearCheckpoint();

      expect(mockApp.vault.adapter.remove).not.toHaveBeenCalled();
    });

    it('should handle remove errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockApp.vault.getAbstractFileByPath.mockReturnValue({
        path: '.reddit-import-checkpoint.json',
      });
      mockApp.vault.adapter.remove.mockRejectedValue(new Error('Remove failed'));

      await stateManager.clearCheckpoint();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to clear import checkpoint:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('checkpointing disabled', () => {
    it('should not start auto-save timer when checkpointing is disabled', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const noCheckpointManager = new ImportStateManager(mockApp as any, {
        enableCheckpointing: false,
        autoSaveIntervalMs: 100,
      });

      noCheckpointManager.startSession();

      // The autoSaveTimer should not be set
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((noCheckpointManager as any).autoSaveTimer).toBeNull();
      noCheckpointManager.cleanup();
    });
  });

  describe('auto-save timer', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should auto-save checkpoint at configured interval', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const autoSaveManager = new ImportStateManager(mockApp as any, {
        enableCheckpointing: true,
        autoSaveIntervalMs: 100,
      });

      autoSaveManager.startSession();

      // Clear any calls from startSession
      jest.clearAllMocks();

      // Advance time to trigger auto-save
      jest.advanceTimersByTime(100);

      // Need to flush promises since saveCheckpoint is async
      await Promise.resolve();

      expect(mockApp.vault.create).toHaveBeenCalled();

      autoSaveManager.cleanup();
    });
  });

  describe('addFetchedItems edge cases', () => {
    it('should not add duplicate item IDs to pendingItemIds', () => {
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
      stateManager.addFetchedItems([mockItem]); // Add same item again

      const checkpoint = stateManager.getCheckpoint();
      // pendingItemIds should still only have one entry for item1
      expect(checkpoint?.pendingItemIds.filter(id => id === 'item1')).toHaveLength(1);
      // But fetchedCount increments each time
      expect(checkpoint?.fetchedCount).toBe(2);
    });

    it('should do nothing if no session exists', () => {
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
      expect(stateManager.getCheckpoint()).toBeNull();
    });
  });

  describe('markItemImported edge cases', () => {
    it('should do nothing if no session exists', () => {
      stateManager.markItemImported('item1');
      expect(stateManager.getCheckpoint()).toBeNull();
    });
  });

  describe('markItemSkipped edge cases', () => {
    it('should do nothing if no session exists', () => {
      stateManager.markItemSkipped('item1');
      expect(stateManager.getCheckpoint()).toBeNull();
    });
  });

  describe('markItemFailed edge cases', () => {
    it('should do nothing if no session exists', () => {
      stateManager.markItemFailed('item1', 'Error', true);
      expect(stateManager.getCheckpoint()).toBeNull();
    });

    it('should not add to failedItemIds when not retryable', () => {
      stateManager.startSession();

      stateManager.markItemFailed('item1', 'Non-retryable error', false);

      const checkpoint = stateManager.getCheckpoint();
      expect(checkpoint?.failedCount).toBe(1);
      expect(checkpoint?.failedItemIds).not.toContain('item1');
      expect(checkpoint?.errors[0].retryable).toBe(false);
    });

    it('should default to retryable when not specified', () => {
      stateManager.startSession();

      // Call without the third parameter to use the default value
      stateManager.markItemFailed('item1', 'Error with default retryable');

      const checkpoint = stateManager.getCheckpoint();
      expect(checkpoint?.failedCount).toBe(1);
      expect(checkpoint?.failedItemIds).toContain('item1');
      expect(checkpoint?.errors[0].retryable).toBe(true);
    });
  });

  describe('markCompleted edge cases', () => {
    it('should do nothing if no session exists', () => {
      stateManager.markCompleted();
      expect(stateManager.getCheckpoint()).toBeNull();
    });
  });

  describe('markCancelled edge cases', () => {
    it('should do nothing if no session exists', () => {
      stateManager.markCancelled();
      expect(stateManager.getCheckpoint()).toBeNull();
    });
  });

  describe('pause edge cases', () => {
    it('should do nothing if no session exists', () => {
      stateManager.pause();
      expect(stateManager.getCheckpoint()).toBeNull();
    });

    it('should not pause a completed session', () => {
      stateManager.startSession();
      stateManager.markCompleted();

      stateManager.pause();

      // Phase should remain 'completed', not change to 'paused'
      expect(stateManager.getCheckpoint()?.phase).toBe('completed');
    });
  });

  describe('setCursor edge cases', () => {
    it('should do nothing if no session exists', () => {
      stateManager.setCursor('cursor123');
      expect(stateManager.getCursor()).toBe('');
    });
  });

  describe('shouldContinue edge cases', () => {
    it('should return false for failed phase', () => {
      stateManager.startSession();
      stateManager.setPhase('failed');

      expect(stateManager.shouldContinue()).toBe(false);
    });
  });
});
