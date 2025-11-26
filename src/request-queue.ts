import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { PerformanceMonitor } from './performance-monitor';

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Request priority levels
 */
export type RequestPriority = 'high' | 'normal' | 'low';

/**
 * Request in the queue
 */
interface QueuedRequest {
  id: string;
  params: RequestUrlParam;
  priority: RequestPriority;
  resolve: (response: RequestUrlResponse) => void;
  reject: (error: Error) => void;
  retryCount: number;
  maxRetries: number;
  addedAt: number;
  timeout: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms before attempting to close circuit */
  resetTimeoutMs: number;
  /** Number of successful requests needed to close circuit */
  successThreshold: number;
  /** Time window for counting failures */
  failureWindowMs: number;
}

/**
 * Request queue configuration
 */
export interface RequestQueueConfig {
  /** Maximum concurrent requests */
  maxConcurrent: number;
  /** Default request timeout in ms */
  defaultTimeoutMs: number;
  /** Maximum retries per request */
  maxRetries: number;
  /** Base delay for exponential backoff */
  baseBackoffMs: number;
  /** Maximum backoff delay */
  maxBackoffMs: number;
  /** Rate limit: max requests per window */
  rateLimitRequests: number;
  /** Rate limit window in ms */
  rateLimitWindowMs: number;
  /** Circuit breaker config */
  circuitBreaker: CircuitBreakerConfig;
}

const DEFAULT_CONFIG: RequestQueueConfig = {
  maxConcurrent: 2, // Conservative for API limits
  defaultTimeoutMs: 30000,
  maxRetries: 3,
  baseBackoffMs: 1000,
  maxBackoffMs: 30000,
  rateLimitRequests: 60,
  rateLimitWindowMs: 60000,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    successThreshold: 2,
    failureWindowMs: 60000,
  },
};

/**
 * Circuit breaker for handling failure scenarios
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private failures: number[] = [];
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if request should be allowed
   */
  allowRequest(): boolean {
    this.cleanOldFailures();

    switch (this.state) {
      case 'closed':
        return true;
      case 'open':
        // Check if we should transition to half-open
        if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
          this.state = 'half-open';
          this.successCount = 0;
          return true;
        }
        return false;
      case 'half-open':
        return true;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'closed';
        this.successCount = 0;
      }
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.failures.push(Date.now());
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Immediately open on any failure in half-open state
      this.state = 'open';
      this.successCount = 0;
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  /**
   * Clean old failures outside the window
   */
  private cleanOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs;
    this.failures = this.failures.filter(time => time > cutoff);
    this.failureCount = this.failures.length;
  }

  /**
   * Get time until circuit might close
   */
  getTimeUntilRetry(): number {
    if (this.state !== 'open') return 0;
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.config.resetTimeoutMs - elapsed);
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.failures = [];
    this.lastFailureTime = 0;
  }
}

/**
 * Rate limiter for controlling request frequency
 */
export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private windowMs: number;
  private lastRefill: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxTokens = maxRequests;
    this.tokens = maxRequests;
    this.windowMs = windowMs;
    this.lastRefill = Date.now();
  }

  /**
   * Try to acquire a token
   */
  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Get time until next token available
   */
  getWaitTime(): number {
    this.refill();
    if (this.tokens >= 1) return 0;

    const tokensNeeded = 1 - this.tokens;
    const msPerToken = this.windowMs / this.maxTokens;
    return Math.ceil(tokensNeeded * msPerToken);
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed > 0) {
      const tokensToAdd = (elapsed / this.windowMs) * this.maxTokens;
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Update rate based on response headers
   */
  updateFromHeaders(remaining: number, resetSeconds: number): void {
    // Adjust tokens based on server feedback
    if (remaining < this.tokens) {
      this.tokens = remaining;
    }

    // If reset time is provided, adjust refill timing
    if (resetSeconds > 0) {
      this.lastRefill = Date.now();
      this.windowMs = resetSeconds * 1000;
    }
  }
}

/**
 * Offline queue for requests made while offline
 */
export class OfflineQueue {
  private queue: Array<{
    params: RequestUrlParam;
    addedAt: number;
    priority: RequestPriority;
  }> = [];
  private maxSize: number = 100;

  /**
   * Add request to offline queue
   */
  add(params: RequestUrlParam, priority: RequestPriority = 'normal'): boolean {
    if (this.queue.length >= this.maxSize) {
      // Remove lowest priority, oldest request
      const lowPriorityIdx = this.queue.findIndex(r => r.priority === 'low');
      if (lowPriorityIdx >= 0) {
        this.queue.splice(lowPriorityIdx, 1);
      } else {
        return false; // Queue full, can't add
      }
    }

    this.queue.push({
      params,
      addedAt: Date.now(),
      priority,
    });

    return true;
  }

  /**
   * Get all queued requests sorted by priority
   */
  drain(): RequestUrlParam[] {
    const sorted = [...this.queue].sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    this.queue = [];
    return sorted.map(r => r.params);
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = [];
  }
}

/**
 * Advanced request queue with circuit breaker, rate limiting, and retry logic
 */
export class RequestQueue {
  private config: RequestQueueConfig;
  private queue: QueuedRequest[] = [];
  private activeRequests: number = 0;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;
  private offlineQueue: OfflineQueue;
  private performanceMonitor: PerformanceMonitor | null = null;
  private isProcessing: boolean = false;
  private isPaused: boolean = false;
  private isOnline: boolean = true;
  private requestIdCounter: number = 0;

  constructor(config: Partial<RequestQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker);
    this.rateLimiter = new RateLimiter(
      this.config.rateLimitRequests,
      this.config.rateLimitWindowMs
    );
    this.offlineQueue = new OfflineQueue();
  }

  /**
   * Set performance monitor for tracking
   */
  setPerformanceMonitor(monitor: PerformanceMonitor): void {
    this.performanceMonitor = monitor;
  }

  /**
   * Add request to queue
   */
  async enqueue(
    params: RequestUrlParam,
    options: {
      priority?: RequestPriority;
      maxRetries?: number;
      timeout?: number;
    } = {}
  ): Promise<RequestUrlResponse> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: `req-${++this.requestIdCounter}`,
        params,
        priority: options.priority || 'normal',
        resolve,
        reject,
        retryCount: 0,
        maxRetries: options.maxRetries ?? this.config.maxRetries,
        addedAt: Date.now(),
        timeout: options.timeout ?? this.config.defaultTimeoutMs,
      };

      // Insert based on priority
      if (request.priority === 'high') {
        const insertIdx = this.queue.findIndex(r => r.priority !== 'high');
        if (insertIdx >= 0) {
          this.queue.splice(insertIdx, 0, request);
        } else {
          this.queue.push(request);
        }
      } else if (request.priority === 'low') {
        this.queue.push(request);
      } else {
        // Normal priority: after high, before low
        const insertIdx = this.queue.findIndex(r => r.priority === 'low');
        if (insertIdx >= 0) {
          this.queue.splice(insertIdx, 0, request);
        } else {
          this.queue.push(request);
        }
      }

      this.processQueue();
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.isPaused) return;

    this.isProcessing = true;

    try {
      while (
        this.queue.length > 0 &&
        this.activeRequests < this.config.maxConcurrent &&
        !this.isPaused
      ) {
        // Check if we're online
        if (!this.isOnline) {
          // Move remaining requests to offline queue
          for (const req of this.queue) {
            this.offlineQueue.add(req.params, req.priority);
            req.reject(new Error('Offline: request queued for later'));
          }
          this.queue = [];
          break;
        }

        // Check circuit breaker
        if (!this.circuitBreaker.allowRequest()) {
          const waitTime = this.circuitBreaker.getTimeUntilRetry();
          console.warn(`Circuit breaker open. Waiting ${waitTime}ms before retry.`);
          await this.delay(waitTime);
          continue;
        }

        // Check rate limiter
        if (!this.rateLimiter.tryAcquire()) {
          const waitTime = this.rateLimiter.getWaitTime();
          if (this.performanceMonitor) {
            this.performanceMonitor.recordRateLimitWait(waitTime);
          }
          await this.delay(waitTime);
          continue;
        }

        const request = this.queue.shift();
        if (!request) break;

        // Check if request has timed out while waiting
        if (Date.now() - request.addedAt > request.timeout) {
          request.reject(new Error('Request timed out while waiting in queue'));
          continue;
        }

        // Execute request
        this.activeRequests++;
        this.executeRequest(request).finally(() => {
          this.activeRequests--;
          // Continue processing after request completes
          if (this.queue.length > 0 && !this.isPaused) {
            this.processQueue();
          }
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute a single request with retry logic
   */
  private async executeRequest(request: QueuedRequest): Promise<void> {
    const startTime = Date.now();

    try {
      const response = await this.executeWithTimeout(request.params, request.timeout);
      const responseTime = Date.now() - startTime;

      // Update rate limiter from response headers
      const remaining = parseInt(response.headers['x-ratelimit-remaining'] || '60');
      const reset = parseInt(response.headers['x-ratelimit-reset'] || '60');
      this.rateLimiter.updateFromHeaders(remaining, reset);

      // Record success
      this.circuitBreaker.recordSuccess();

      if (this.performanceMonitor) {
        const contentLength = parseInt(response.headers['content-length'] || '0');
        this.performanceMonitor.recordRequest(true, responseTime, contentLength, false);
      }

      request.resolve(response);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const err = error as Error & { status?: number; headers?: Record<string, string> };

      // Handle rate limiting (429)
      if (err.status === 429) {
        const retryAfter = parseInt(err.headers?.['retry-after'] || '60') * 1000;

        if (this.performanceMonitor) {
          this.performanceMonitor.recordRequest(false, responseTime, 0, true);
          this.performanceMonitor.recordRateLimitWait(retryAfter);
        }

        // Requeue with delay
        if (request.retryCount < request.maxRetries) {
          request.retryCount++;
          await this.delay(retryAfter);
          this.queue.unshift(request); // Add back to front of queue
          return;
        }
      }

      // Record failure
      this.circuitBreaker.recordFailure();

      if (this.performanceMonitor) {
        this.performanceMonitor.recordRequest(false, responseTime, 0, false);
      }

      // Retry with exponential backoff for other errors
      if (request.retryCount < request.maxRetries && this.isRetryableError(err)) {
        request.retryCount++;
        const backoffDelay = this.calculateBackoff(request.retryCount);
        await this.delay(backoffDelay);
        this.queue.unshift(request);
        return;
      }

      // Give up
      request.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Execute request with timeout
   */
  private async executeWithTimeout(
    params: RequestUrlParam,
    timeout: number
  ): Promise<RequestUrlResponse> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timed out after ${timeout}ms`));
      }, timeout);

      requestUrl(params)
        .then(response => {
          clearTimeout(timeoutId);
          resolve(response);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error & { status?: number }): boolean {
    // Network errors are retryable
    if (!error.status) return true;

    // Server errors (5xx) are retryable
    if (error.status >= 500 && error.status < 600) return true;

    // Specific retryable client errors
    if (error.status === 408 || error.status === 429) return true;

    return false;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(retryCount: number): number {
    const delay = this.config.baseBackoffMs * Math.pow(2, retryCount - 1);
    // Add jitter (0-25% of delay)
    const jitter = delay * Math.random() * 0.25;
    return Math.min(delay + jitter, this.config.maxBackoffMs);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    this.isPaused = false;
    this.processQueue();
  }

  /**
   * Set online/offline status
   */
  setOnline(online: boolean): void {
    const wasOffline = !this.isOnline;
    this.isOnline = online;

    if (online && wasOffline) {
      // Process offline queue
      const offlineRequests = this.offlineQueue.drain();
      for (const params of offlineRequests) {
        this.enqueue(params, { priority: 'normal' }).catch(console.error);
      }
      this.processQueue();
    }
  }

  /**
   * Get queue status
   */
  getStatus(): {
    queueLength: number;
    activeRequests: number;
    circuitState: CircuitState;
    availableTokens: number;
    isPaused: boolean;
    isOnline: boolean;
    offlineQueueSize: number;
  } {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      circuitState: this.circuitBreaker.getState(),
      availableTokens: this.rateLimiter.getAvailableTokens(),
      isPaused: this.isPaused,
      isOnline: this.isOnline,
      offlineQueueSize: this.offlineQueue.size(),
    };
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    for (const request of this.queue) {
      request.reject(new Error('Queue cleared'));
    }
    this.queue = [];
    this.offlineQueue.clear();
  }

  /**
   * Reset circuit breaker manually
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Get pending request count
   */
  getPendingCount(): number {
    return this.queue.length + this.activeRequests;
  }
}
