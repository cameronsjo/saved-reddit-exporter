/**
 * Performance monitoring module for tracking import metrics and diagnostics
 */

export interface RequestMetrics {
  /** Total requests made */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Rate limited requests (429s) */
  rateLimitedRequests: number;
  /** Total bytes downloaded */
  totalBytesDownloaded: number;
  /** Average response time in ms */
  avgResponseTimeMs: number;
  /** Min response time in ms */
  minResponseTimeMs: number;
  /** Max response time in ms */
  maxResponseTimeMs: number;
  /** Total time spent waiting for rate limits */
  rateLimitWaitTimeMs: number;
  /** Request timestamps for rate calculation */
  requestTimestamps: number[];
}

export interface ImportMetrics {
  /** Session start time */
  startTime: number;
  /** Session end time (if completed) */
  endTime?: number;
  /** Total items fetched */
  itemsFetched: number;
  /** Total items processed */
  itemsProcessed: number;
  /** Items successfully imported */
  itemsImported: number;
  /** Items skipped */
  itemsSkipped: number;
  /** Items failed */
  itemsFailed: number;
  /** Media files downloaded */
  mediaFilesDownloaded: number;
  /** Media download failures */
  mediaDownloadFailures: number;
  /** Total media bytes downloaded */
  mediaBytesDownloaded: number;
  /** Files created in vault */
  filesCreated: number;
  /** Memory usage samples */
  memoryUsageSamples: MemorySample[];
}

export interface MemorySample {
  timestamp: number;
  usedHeapSize?: number;
  totalHeapSize?: number;
}

export interface PerformanceSummary {
  /** Total duration in ms */
  durationMs: number;
  /** Items processed per second */
  itemsPerSecond: number;
  /** Average request latency */
  avgRequestLatencyMs: number;
  /** Success rate (0-1) */
  requestSuccessRate: number;
  /** Rate limit percentage */
  rateLimitPercentage: number;
  /** Effective throughput (items/s accounting for all delays) */
  effectiveThroughput: number;
  /** Estimated time for N items */
  estimatedTimeForItems: (count: number) => number;
}

export interface Bottleneck {
  type: 'network' | 'rate_limit' | 'processing' | 'media_download' | 'file_io';
  severity: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
}

const METRICS_WINDOW_SIZE = 100; // Keep last 100 request timestamps

/**
 * Monitors and tracks performance metrics during import operations
 */
export class PerformanceMonitor {
  private requestMetrics: RequestMetrics;
  private importMetrics: ImportMetrics;
  private responseTimes: number[] = [];
  private isMonitoring: boolean = false;
  private memoryMonitorInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.requestMetrics = this.createEmptyRequestMetrics();
    this.importMetrics = this.createEmptyImportMetrics();
  }

  private createEmptyRequestMetrics(): RequestMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      totalBytesDownloaded: 0,
      avgResponseTimeMs: 0,
      minResponseTimeMs: Infinity,
      maxResponseTimeMs: 0,
      rateLimitWaitTimeMs: 0,
      requestTimestamps: [],
    };
  }

  private createEmptyImportMetrics(): ImportMetrics {
    return {
      startTime: 0,
      itemsFetched: 0,
      itemsProcessed: 0,
      itemsImported: 0,
      itemsSkipped: 0,
      itemsFailed: 0,
      mediaFilesDownloaded: 0,
      mediaDownloadFailures: 0,
      mediaBytesDownloaded: 0,
      filesCreated: 0,
      memoryUsageSamples: [],
    };
  }

  /**
   * Start monitoring a new import session
   */
  startSession(): void {
    this.requestMetrics = this.createEmptyRequestMetrics();
    this.importMetrics = this.createEmptyImportMetrics();
    this.importMetrics.startTime = Date.now();
    this.responseTimes = [];
    this.isMonitoring = true;

    // Start memory monitoring (if available in environment)
    this.startMemoryMonitoring();
  }

  /**
   * End the monitoring session
   */
  endSession(): void {
    this.importMetrics.endTime = Date.now();
    this.isMonitoring = false;
    this.stopMemoryMonitoring();
  }

  /**
   * Record a request attempt
   */
  recordRequest(
    success: boolean,
    responseTimeMs: number,
    bytesDownloaded: number = 0,
    wasRateLimited: boolean = false
  ): void {
    if (!this.isMonitoring) return;

    this.requestMetrics.totalRequests++;

    if (success) {
      this.requestMetrics.successfulRequests++;
    } else {
      this.requestMetrics.failedRequests++;
    }

    if (wasRateLimited) {
      this.requestMetrics.rateLimitedRequests++;
    }

    this.requestMetrics.totalBytesDownloaded += bytesDownloaded;

    // Track response times
    this.responseTimes.push(responseTimeMs);
    this.requestMetrics.minResponseTimeMs = Math.min(
      this.requestMetrics.minResponseTimeMs,
      responseTimeMs
    );
    this.requestMetrics.maxResponseTimeMs = Math.max(
      this.requestMetrics.maxResponseTimeMs,
      responseTimeMs
    );
    this.requestMetrics.avgResponseTimeMs =
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;

    // Track request timestamps for rate calculation
    const now = Date.now();
    this.requestMetrics.requestTimestamps.push(now);

    // Keep only recent timestamps
    if (this.requestMetrics.requestTimestamps.length > METRICS_WINDOW_SIZE) {
      this.requestMetrics.requestTimestamps.shift();
    }
  }

  /**
   * Record rate limit wait time
   */
  recordRateLimitWait(waitTimeMs: number): void {
    if (!this.isMonitoring) return;
    this.requestMetrics.rateLimitWaitTimeMs += waitTimeMs;
  }

  /**
   * Record items fetched
   */
  recordItemsFetched(count: number): void {
    if (!this.isMonitoring) return;
    this.importMetrics.itemsFetched += count;
  }

  /**
   * Record item processed
   */
  recordItemProcessed(result: 'imported' | 'skipped' | 'failed'): void {
    if (!this.isMonitoring) return;

    this.importMetrics.itemsProcessed++;

    switch (result) {
      case 'imported':
        this.importMetrics.itemsImported++;
        break;
      case 'skipped':
        this.importMetrics.itemsSkipped++;
        break;
      case 'failed':
        this.importMetrics.itemsFailed++;
        break;
    }
  }

  /**
   * Record media download
   */
  recordMediaDownload(success: boolean, bytesDownloaded: number = 0): void {
    if (!this.isMonitoring) return;

    if (success) {
      this.importMetrics.mediaFilesDownloaded++;
      this.importMetrics.mediaBytesDownloaded += bytesDownloaded;
    } else {
      this.importMetrics.mediaDownloadFailures++;
    }
  }

  /**
   * Record file creation
   */
  recordFileCreated(): void {
    if (!this.isMonitoring) return;
    this.importMetrics.filesCreated++;
  }

  /**
   * Get current request metrics
   */
  getRequestMetrics(): RequestMetrics {
    return { ...this.requestMetrics };
  }

  /**
   * Get current import metrics
   */
  getImportMetrics(): ImportMetrics {
    return { ...this.importMetrics };
  }

  /**
   * Get performance summary
   */
  getSummary(): PerformanceSummary {
    const endTime = this.importMetrics.endTime || Date.now();
    const durationMs = endTime - this.importMetrics.startTime;
    const durationSeconds = durationMs / 1000;

    const itemsPerSecond =
      durationSeconds > 0 ? this.importMetrics.itemsProcessed / durationSeconds : 0;

    const requestSuccessRate =
      this.requestMetrics.totalRequests > 0
        ? this.requestMetrics.successfulRequests / this.requestMetrics.totalRequests
        : 1;

    const rateLimitPercentage =
      this.requestMetrics.totalRequests > 0
        ? this.requestMetrics.rateLimitedRequests / this.requestMetrics.totalRequests
        : 0;

    // Effective throughput accounts for all time including rate limit waits
    const totalActiveTime = durationMs - this.requestMetrics.rateLimitWaitTimeMs;
    const effectiveThroughput =
      totalActiveTime > 0 ? (this.importMetrics.itemsProcessed / totalActiveTime) * 1000 : 0;

    return {
      durationMs,
      itemsPerSecond,
      avgRequestLatencyMs: this.requestMetrics.avgResponseTimeMs,
      requestSuccessRate,
      rateLimitPercentage,
      effectiveThroughput,
      estimatedTimeForItems: (count: number) => {
        if (itemsPerSecond <= 0) return Infinity;
        return (count / itemsPerSecond) * 1000;
      },
    };
  }

  /**
   * Calculate current request rate (requests per second over recent window)
   */
  getCurrentRequestRate(): number {
    const timestamps = this.requestMetrics.requestTimestamps;
    if (timestamps.length < 2) return 0;

    const windowMs = timestamps[timestamps.length - 1] - timestamps[0];
    if (windowMs <= 0) return 0;

    return ((timestamps.length - 1) / windowMs) * 1000;
  }

  /**
   * Identify performance bottlenecks
   */
  identifyBottlenecks(): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];
    const summary = this.getSummary();

    // Check rate limiting impact
    if (summary.rateLimitPercentage > 0.1) {
      const severity =
        summary.rateLimitPercentage > 0.3
          ? 'high'
          : summary.rateLimitPercentage > 0.2
            ? 'medium'
            : 'low';
      bottlenecks.push({
        type: 'rate_limit',
        severity,
        description: `${(summary.rateLimitPercentage * 100).toFixed(1)}% of requests were rate limited`,
        recommendation: 'Consider reducing fetch limit or waiting between import sessions',
      });
    }

    // Check request failure rate
    if (summary.requestSuccessRate < 0.95) {
      const severity =
        summary.requestSuccessRate < 0.8
          ? 'high'
          : summary.requestSuccessRate < 0.9
            ? 'medium'
            : 'low';
      bottlenecks.push({
        type: 'network',
        severity,
        description: `${((1 - summary.requestSuccessRate) * 100).toFixed(1)}% of requests failed`,
        recommendation: 'Check network connection or increase retry attempts',
      });
    }

    // Check average latency
    if (this.requestMetrics.avgResponseTimeMs > 2000) {
      const severity =
        this.requestMetrics.avgResponseTimeMs > 5000
          ? 'high'
          : this.requestMetrics.avgResponseTimeMs > 3000
            ? 'medium'
            : 'low';
      bottlenecks.push({
        type: 'network',
        severity,
        description: `Average response time is ${this.requestMetrics.avgResponseTimeMs.toFixed(0)}ms`,
        recommendation: 'Network latency is high; consider importing during off-peak hours',
      });
    }

    // Check media download failures
    const totalMediaAttempts =
      this.importMetrics.mediaFilesDownloaded + this.importMetrics.mediaDownloadFailures;
    if (totalMediaAttempts > 0) {
      const mediaFailureRate = this.importMetrics.mediaDownloadFailures / totalMediaAttempts;
      if (mediaFailureRate > 0.1) {
        const severity =
          mediaFailureRate > 0.3 ? 'high' : mediaFailureRate > 0.2 ? 'medium' : 'low';
        bottlenecks.push({
          type: 'media_download',
          severity,
          description: `${(mediaFailureRate * 100).toFixed(1)}% of media downloads failed`,
          recommendation: 'Some media URLs may be expired or require authentication',
        });
      }
    }

    // Check processing speed
    if (summary.itemsPerSecond < 0.5 && this.importMetrics.itemsProcessed > 10) {
      bottlenecks.push({
        type: 'processing',
        severity: 'medium',
        description: `Processing speed is ${summary.itemsPerSecond.toFixed(2)} items/second`,
        recommendation: 'Large media files or complex content may be slowing imports',
      });
    }

    return bottlenecks;
  }

  /**
   * Format metrics for display
   */
  formatForDisplay(): string {
    const summary = this.getSummary();
    const metrics = this.getImportMetrics();
    const bottlenecks = this.identifyBottlenecks();

    const lines: string[] = [
      '=== Import Performance Summary ===',
      '',
      `Duration: ${this.formatDuration(summary.durationMs)}`,
      `Items processed: ${metrics.itemsProcessed} (${metrics.itemsImported} imported, ${metrics.itemsSkipped} skipped, ${metrics.itemsFailed} failed)`,
      `Processing speed: ${summary.itemsPerSecond.toFixed(2)} items/second`,
      `Effective throughput: ${summary.effectiveThroughput.toFixed(2)} items/second`,
      '',
      '--- Network Statistics ---',
      `Total requests: ${this.requestMetrics.totalRequests}`,
      `Success rate: ${(summary.requestSuccessRate * 100).toFixed(1)}%`,
      `Rate limited: ${this.requestMetrics.rateLimitedRequests} (${(summary.rateLimitPercentage * 100).toFixed(1)}%)`,
      `Avg response time: ${this.requestMetrics.avgResponseTimeMs.toFixed(0)}ms`,
      `Rate limit wait time: ${this.formatDuration(this.requestMetrics.rateLimitWaitTimeMs)}`,
      `Data downloaded: ${this.formatBytes(this.requestMetrics.totalBytesDownloaded)}`,
    ];

    if (metrics.mediaFilesDownloaded > 0 || metrics.mediaDownloadFailures > 0) {
      lines.push(
        '',
        '--- Media Downloads ---',
        `Files downloaded: ${metrics.mediaFilesDownloaded}`,
        `Failed downloads: ${metrics.mediaDownloadFailures}`,
        `Media size: ${this.formatBytes(metrics.mediaBytesDownloaded)}`
      );
    }

    if (bottlenecks.length > 0) {
      lines.push('', '--- Identified Issues ---');
      for (const bottleneck of bottlenecks) {
        lines.push(`[${bottleneck.severity.toUpperCase()}] ${bottleneck.description}`);
        lines.push(`  Recommendation: ${bottleneck.recommendation}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format duration for display
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }

  /**
   * Format bytes for display
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    // Memory monitoring is environment-dependent
    // In browser/Electron, we can try to use performance.memory
    this.memoryMonitorInterval = setInterval(() => {
      this.sampleMemory();
    }, 5000); // Sample every 5 seconds
  }

  /**
   * Stop memory monitoring
   */
  private stopMemoryMonitoring(): void {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }
  }

  /**
   * Sample current memory usage
   */
  private sampleMemory(): void {
    const sample: MemorySample = {
      timestamp: Date.now(),
    };

    // Try to get memory info (Chrome/Electron specific)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Chrome/Electron memory API is not in standard types
    const perf = performance as any;
    if (perf.memory) {
      sample.usedHeapSize = perf.memory.usedJSHeapSize;
      sample.totalHeapSize = perf.memory.totalJSHeapSize;
    }

    this.importMetrics.memoryUsageSamples.push(sample);

    // Keep only last 100 samples
    if (this.importMetrics.memoryUsageSamples.length > 100) {
      this.importMetrics.memoryUsageSamples.shift();
    }
  }

  /**
   * Get memory trend
   */
  getMemoryTrend(): 'stable' | 'increasing' | 'decreasing' | 'unknown' {
    const samples = this.importMetrics.memoryUsageSamples;
    if (samples.length < 5) return 'unknown';

    const recentSamples = samples.slice(-5);
    const validSamples = recentSamples.filter(s => s.usedHeapSize !== undefined);
    if (validSamples.length < 3) return 'unknown';

    const firstValue = validSamples[0].usedHeapSize!;
    const lastValue = validSamples[validSamples.length - 1].usedHeapSize!;
    const percentChange = ((lastValue - firstValue) / firstValue) * 100;

    if (percentChange > 10) return 'increasing';
    if (percentChange < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.requestMetrics = this.createEmptyRequestMetrics();
    this.importMetrics = this.createEmptyImportMetrics();
    this.responseTimes = [];
    this.isMonitoring = false;
    this.stopMemoryMonitoring();
  }
}
