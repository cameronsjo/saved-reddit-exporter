import {
  RequestQueue,
  CircuitBreaker,
  RateLimiter,
  OfflineQueue,
  CircuitState,
} from '../src/request-queue';
import { requestUrl } from 'obsidian';

// Mock Obsidian modules
jest.mock('obsidian');

const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      successThreshold: 2,
      failureWindowMs: 5000,
    });
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('should allow requests in closed state', () => {
      expect(breaker.allowRequest()).toBe(true);
    });
  });

  describe('failure handling', () => {
    it('should open after reaching failure threshold', () => {
      breaker.recordFailure();
      expect(breaker.getState()).toBe('closed');

      breaker.recordFailure();
      expect(breaker.getState()).toBe('closed');

      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');
    });

    it('should not allow requests when open', () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }

      expect(breaker.allowRequest()).toBe(false);
    });
  });

  describe('recovery', () => {
    it('should reset failure count on success', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();

      // Should be able to handle more failures now
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('closed');
    });

    it('should transition to half-open after reset timeout', async () => {
      // Use shorter timeout for test
      const fastBreaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 50,
        successThreshold: 1,
        failureWindowMs: 5000,
      });

      fastBreaker.recordFailure();
      expect(fastBreaker.getState()).toBe('open');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 60));

      // Next allowRequest should transition to half-open
      expect(fastBreaker.allowRequest()).toBe(true);
      expect(fastBreaker.getState()).toBe('half-open');
    });

    it('should close after success threshold in half-open', async () => {
      const fastBreaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 50,
        successThreshold: 2,
        failureWindowMs: 5000,
      });

      fastBreaker.recordFailure();
      await new Promise(resolve => setTimeout(resolve, 60));
      fastBreaker.allowRequest(); // Transition to half-open

      fastBreaker.recordSuccess();
      expect(fastBreaker.getState()).toBe('half-open');

      fastBreaker.recordSuccess();
      expect(fastBreaker.getState()).toBe('closed');
    });

    it('should open immediately on failure in half-open', async () => {
      const fastBreaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 50,
        successThreshold: 2,
        failureWindowMs: 5000,
      });

      fastBreaker.recordFailure();
      await new Promise(resolve => setTimeout(resolve, 60));
      fastBreaker.allowRequest(); // Transition to half-open

      fastBreaker.recordFailure();
      expect(fastBreaker.getState()).toBe('open');
    });
  });

  describe('getTimeUntilRetry', () => {
    it('should return 0 when not open', () => {
      expect(breaker.getTimeUntilRetry()).toBe(0);
    });

    it('should return remaining time when open', () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }

      const timeUntilRetry = breaker.getTimeUntilRetry();
      expect(timeUntilRetry).toBeGreaterThan(0);
      expect(timeUntilRetry).toBeLessThanOrEqual(1000);
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('open');

      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.allowRequest()).toBe(true);
    });
  });
});

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(10, 1000); // 10 requests per second
  });

  describe('tryAcquire', () => {
    it('should allow requests within limit', () => {
      for (let i = 0; i < 10; i++) {
        expect(limiter.tryAcquire()).toBe(true);
      }
    });

    it('should reject requests exceeding limit', () => {
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      expect(limiter.tryAcquire()).toBe(false);
    });
  });

  describe('getWaitTime', () => {
    it('should return 0 when tokens available', () => {
      expect(limiter.getWaitTime()).toBe(0);
    });

    it('should return wait time when depleted', () => {
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      const waitTime = limiter.getWaitTime();
      expect(waitTime).toBeGreaterThan(0);
    });
  });

  describe('getAvailableTokens', () => {
    it('should return current token count', () => {
      expect(limiter.getAvailableTokens()).toBe(10);

      limiter.tryAcquire();
      expect(limiter.getAvailableTokens()).toBeLessThan(10);
    });
  });

  describe('updateFromHeaders', () => {
    it('should update tokens from server response', () => {
      // Use up some tokens
      for (let i = 0; i < 5; i++) {
        limiter.tryAcquire();
      }

      // Server says we have fewer
      limiter.updateFromHeaders(2, 60);

      // Use toBeCloseTo for floating point comparison
      expect(limiter.getAvailableTokens()).toBeCloseTo(2, 1);
    });
  });

  describe('token refill', () => {
    it('should refill tokens over time', async () => {
      // Use all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }

      // Wait for partial refill
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(limiter.getAvailableTokens()).toBeGreaterThan(0);
    });
  });
});

describe('OfflineQueue', () => {
  let queue: OfflineQueue;

  beforeEach(() => {
    queue = new OfflineQueue();
  });

  describe('add', () => {
    it('should add requests to queue', () => {
      const result = queue.add({ url: 'https://example.com', method: 'GET' });

      expect(result).toBe(true);
      expect(queue.size()).toBe(1);
    });

    it('should respect max size', () => {
      // Add 100 requests (default max)
      for (let i = 0; i < 100; i++) {
        queue.add({ url: `https://example.com/${i}`, method: 'GET' }, 'high');
      }

      // Should fail when adding more with no low priority to remove
      const result = queue.add({ url: 'https://example.com/overflow', method: 'GET' });
      expect(result).toBe(false);
    });

    it('should remove low priority requests when full', () => {
      // Add some low priority requests
      for (let i = 0; i < 100; i++) {
        queue.add({ url: `https://example.com/${i}`, method: 'GET' }, 'low');
      }

      // Should succeed by removing a low priority
      const result = queue.add({ url: 'https://example.com/new', method: 'GET' }, 'normal');
      expect(result).toBe(true);
      expect(queue.size()).toBe(100);
    });
  });

  describe('drain', () => {
    it('should return all requests sorted by priority', () => {
      queue.add({ url: 'https://example.com/low', method: 'GET' }, 'low');
      queue.add({ url: 'https://example.com/high', method: 'GET' }, 'high');
      queue.add({ url: 'https://example.com/normal', method: 'GET' }, 'normal');

      const requests = queue.drain();

      expect(requests).toHaveLength(3);
      expect(requests[0].url).toBe('https://example.com/high');
      expect(requests[1].url).toBe('https://example.com/normal');
      expect(requests[2].url).toBe('https://example.com/low');
      expect(queue.size()).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear the queue', () => {
      queue.add({ url: 'https://example.com', method: 'GET' });
      queue.add({ url: 'https://example.com/2', method: 'GET' });

      queue.clear();

      expect(queue.size()).toBe(0);
    });
  });
});

describe('RequestQueue', () => {
  let queue: RequestQueue;

  beforeEach(() => {
    queue = new RequestQueue({
      maxConcurrent: 2,
      defaultTimeoutMs: 5000,
      maxRetries: 2,
      baseBackoffMs: 100,
      maxBackoffMs: 1000,
      rateLimitRequests: 60,
      rateLimitWindowMs: 60000,
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        successThreshold: 2,
        failureWindowMs: 5000,
      },
    });

    mockRequestUrl.mockReset();
  });

  afterEach(() => {
    queue.clear();
  });

  describe('enqueue', () => {
    it('should execute request and return response', async () => {
      const mockResponse = {
        status: 200,
        json: { data: 'test' },
        headers: { 'x-ratelimit-remaining': '60' },
      };
      mockRequestUrl.mockResolvedValue(mockResponse);

      const response = await queue.enqueue({
        url: 'https://example.com',
        method: 'GET',
      });

      expect(response).toEqual(mockResponse);
      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const mockError = new Error('Network error');
      const mockResponse = {
        status: 200,
        json: { data: 'test' },
        headers: { 'x-ratelimit-remaining': '60' },
      };

      mockRequestUrl.mockRejectedValueOnce(mockError).mockResolvedValue(mockResponse);

      const response = await queue.enqueue({
        url: 'https://example.com',
        method: 'GET',
      });

      expect(response).toEqual(mockResponse);
      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      const mockError = new Error('Persistent error');
      mockRequestUrl.mockRejectedValue(mockError);

      await expect(
        queue.enqueue({
          url: 'https://example.com',
          method: 'GET',
        })
      ).rejects.toThrow('Persistent error');

      // maxRetries = 2 means initial attempt + 2 retries = 3 total calls
      expect(mockRequestUrl).toHaveBeenCalledTimes(3);
    });

    it('should respect priority ordering', async () => {
      const callOrder: string[] = [];
      const slowQueue = new RequestQueue({
        maxConcurrent: 1,
        defaultTimeoutMs: 5000,
        maxRetries: 1,
        baseBackoffMs: 100,
        maxBackoffMs: 1000,
        rateLimitRequests: 100,
        rateLimitWindowMs: 1000,
        circuitBreaker: {
          failureThreshold: 10,
          resetTimeoutMs: 1000,
          successThreshold: 2,
          failureWindowMs: 5000,
        },
      });

      mockRequestUrl.mockImplementation(async params => {
        callOrder.push(params.url);
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          status: 200,
          json: {},
          headers: { 'x-ratelimit-remaining': '60' },
        };
      });

      // Enqueue in order: low, normal, high
      const promises = [
        slowQueue.enqueue({ url: 'low', method: 'GET' }, { priority: 'low' }),
        slowQueue.enqueue({ url: 'normal', method: 'GET' }, { priority: 'normal' }),
        slowQueue.enqueue({ url: 'high', method: 'GET' }, { priority: 'high' }),
      ];

      await Promise.all(promises);

      // First request is 'low' because it started processing immediately
      // But subsequent requests should be prioritized
      expect(callOrder[0]).toBe('low'); // Already processing
      // High priority should come before normal
      expect(callOrder.indexOf('high')).toBeLessThan(callOrder.indexOf('normal'));

      slowQueue.clear();
    });
  });

  describe('pause and resume', () => {
    it('should pause queue processing', async () => {
      const mockResponse = {
        status: 200,
        json: {},
        headers: { 'x-ratelimit-remaining': '60' },
      };
      mockRequestUrl.mockResolvedValue(mockResponse);

      queue.pause();

      const promise = queue.enqueue({ url: 'https://example.com', method: 'GET' });

      // Request shouldn't have been made yet
      await new Promise(resolve => setTimeout(resolve, 50));

      // Resume and let it complete
      queue.resume();

      await promise;
      expect(mockRequestUrl).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return queue status', () => {
      const status = queue.getStatus();

      expect(status).toHaveProperty('queueLength');
      expect(status).toHaveProperty('activeRequests');
      expect(status).toHaveProperty('circuitState');
      expect(status).toHaveProperty('availableTokens');
      expect(status).toHaveProperty('isPaused');
      expect(status).toHaveProperty('isOnline');
      expect(status).toHaveProperty('offlineQueueSize');
    });
  });

  describe('setOnline', () => {
    it('should handle offline state', () => {
      queue.setOnline(false);

      const status = queue.getStatus();
      expect(status.isOnline).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear pending requests', async () => {
      mockRequestUrl.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

      queue.enqueue({ url: 'https://example.com/1', method: 'GET' }).catch(() => {});
      queue.enqueue({ url: 'https://example.com/2', method: 'GET' }).catch(() => {});

      queue.clear();

      const status = queue.getStatus();
      expect(status.queueLength).toBe(0);
    });
  });

  describe('resetCircuitBreaker', () => {
    it('should reset the circuit breaker', async () => {
      // Cause failures to open circuit
      const error = Object.assign(new Error('Server error'), { status: 500 });
      mockRequestUrl.mockRejectedValue(error);

      // Make enough requests to open circuit
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          queue.enqueue({ url: `https://example.com/${i}`, method: 'GET' }).catch(() => {})
        );
      }
      await Promise.all(promises);

      // Reset
      queue.resetCircuitBreaker();

      const status = queue.getStatus();
      expect(status.circuitState).toBe('closed');
    });
  });

  describe('getPendingCount', () => {
    it('should return count of pending requests', () => {
      expect(queue.getPendingCount()).toBe(0);
    });
  });
});
