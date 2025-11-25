import {
  PerformanceMonitor,
  RequestMetrics,
  ImportMetrics,
  PerformanceSummary,
} from '../src/performance-monitor';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  afterEach(() => {
    monitor.reset();
  });

  describe('startSession and endSession', () => {
    it('should initialize metrics on start', () => {
      monitor.startSession();

      const metrics = monitor.getImportMetrics();
      expect(metrics.startTime).toBeGreaterThan(0);
      expect(metrics.itemsFetched).toBe(0);
      expect(metrics.itemsProcessed).toBe(0);
    });

    it('should set end time on end', () => {
      monitor.startSession();
      monitor.endSession();

      const metrics = monitor.getImportMetrics();
      expect(metrics.endTime).toBeDefined();
      expect(metrics.endTime).toBeGreaterThanOrEqual(metrics.startTime);
    });
  });

  describe('recordRequest', () => {
    beforeEach(() => {
      monitor.startSession();
    });

    it('should track successful requests', () => {
      monitor.recordRequest(true, 100, 1024, false);

      const metrics = monitor.getRequestMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.totalBytesDownloaded).toBe(1024);
    });

    it('should track failed requests', () => {
      monitor.recordRequest(false, 50, 0, false);

      const metrics = monitor.getRequestMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(1);
    });

    it('should track rate limited requests', () => {
      monitor.recordRequest(false, 100, 0, true);

      const metrics = monitor.getRequestMetrics();
      expect(metrics.rateLimitedRequests).toBe(1);
    });

    it('should calculate average response time', () => {
      monitor.recordRequest(true, 100, 0, false);
      monitor.recordRequest(true, 200, 0, false);
      monitor.recordRequest(true, 300, 0, false);

      const metrics = monitor.getRequestMetrics();
      expect(metrics.avgResponseTimeMs).toBe(200);
    });

    it('should track min and max response times', () => {
      monitor.recordRequest(true, 100, 0, false);
      monitor.recordRequest(true, 500, 0, false);
      monitor.recordRequest(true, 200, 0, false);

      const metrics = monitor.getRequestMetrics();
      expect(metrics.minResponseTimeMs).toBe(100);
      expect(metrics.maxResponseTimeMs).toBe(500);
    });

    it('should not record when not monitoring', () => {
      monitor.endSession();
      monitor.recordRequest(true, 100, 1024, false);

      const metrics = monitor.getRequestMetrics();
      expect(metrics.totalRequests).toBe(0);
    });
  });

  describe('recordRateLimitWait', () => {
    it('should accumulate rate limit wait time', () => {
      monitor.startSession();

      monitor.recordRateLimitWait(1000);
      monitor.recordRateLimitWait(2000);

      const metrics = monitor.getRequestMetrics();
      expect(metrics.rateLimitWaitTimeMs).toBe(3000);
    });
  });

  describe('recordItemsFetched', () => {
    it('should track fetched items', () => {
      monitor.startSession();

      monitor.recordItemsFetched(50);
      monitor.recordItemsFetched(30);

      const metrics = monitor.getImportMetrics();
      expect(metrics.itemsFetched).toBe(80);
    });
  });

  describe('recordItemProcessed', () => {
    beforeEach(() => {
      monitor.startSession();
    });

    it('should track imported items', () => {
      monitor.recordItemProcessed('imported');

      const metrics = monitor.getImportMetrics();
      expect(metrics.itemsProcessed).toBe(1);
      expect(metrics.itemsImported).toBe(1);
    });

    it('should track skipped items', () => {
      monitor.recordItemProcessed('skipped');

      const metrics = monitor.getImportMetrics();
      expect(metrics.itemsProcessed).toBe(1);
      expect(metrics.itemsSkipped).toBe(1);
    });

    it('should track failed items', () => {
      monitor.recordItemProcessed('failed');

      const metrics = monitor.getImportMetrics();
      expect(metrics.itemsProcessed).toBe(1);
      expect(metrics.itemsFailed).toBe(1);
    });
  });

  describe('recordMediaDownload', () => {
    beforeEach(() => {
      monitor.startSession();
    });

    it('should track successful media downloads', () => {
      monitor.recordMediaDownload(true, 2048);

      const metrics = monitor.getImportMetrics();
      expect(metrics.mediaFilesDownloaded).toBe(1);
      expect(metrics.mediaBytesDownloaded).toBe(2048);
    });

    it('should track failed media downloads', () => {
      monitor.recordMediaDownload(false);

      const metrics = monitor.getImportMetrics();
      expect(metrics.mediaDownloadFailures).toBe(1);
    });
  });

  describe('recordFileCreated', () => {
    it('should track file creations', () => {
      monitor.startSession();

      monitor.recordFileCreated();
      monitor.recordFileCreated();

      const metrics = monitor.getImportMetrics();
      expect(metrics.filesCreated).toBe(2);
    });
  });

  describe('getSummary', () => {
    it('should calculate performance summary', async () => {
      monitor.startSession();

      // Simulate some work
      for (let i = 0; i < 10; i++) {
        monitor.recordRequest(true, 100, 1000, false);
        monitor.recordItemProcessed('imported');
      }

      // Wait a bit for time to pass
      await new Promise(resolve => setTimeout(resolve, 50));

      monitor.endSession();

      const summary = monitor.getSummary();

      expect(summary.durationMs).toBeGreaterThan(0);
      expect(summary.itemsPerSecond).toBeGreaterThan(0);
      expect(summary.avgRequestLatencyMs).toBe(100);
      expect(summary.requestSuccessRate).toBe(1);
      expect(summary.rateLimitPercentage).toBe(0);
    });

    it('should calculate rate limit percentage', () => {
      monitor.startSession();

      monitor.recordRequest(true, 100, 0, false);
      monitor.recordRequest(true, 100, 0, false);
      monitor.recordRequest(false, 100, 0, true); // Rate limited
      monitor.recordRequest(false, 100, 0, true); // Rate limited

      const summary = monitor.getSummary();
      expect(summary.rateLimitPercentage).toBe(0.5);
    });

    it('should provide time estimation function', () => {
      monitor.startSession();

      // Process items quickly
      for (let i = 0; i < 100; i++) {
        monitor.recordItemProcessed('imported');
      }

      const summary = monitor.getSummary();
      const estimatedTime = summary.estimatedTimeForItems(200);

      expect(typeof estimatedTime).toBe('number');
      expect(estimatedTime).toBeGreaterThan(0);
    });
  });

  describe('getCurrentRequestRate', () => {
    it('should calculate request rate', async () => {
      monitor.startSession();

      // Record several requests with some time between them
      for (let i = 0; i < 5; i++) {
        monitor.recordRequest(true, 10, 0, false);
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay between requests
      }

      const rate = monitor.getCurrentRequestRate();
      // Rate should be calculated if there was time between requests
      expect(rate).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 with insufficient data', () => {
      monitor.startSession();
      monitor.recordRequest(true, 10, 0, false);

      const rate = monitor.getCurrentRequestRate();
      expect(rate).toBe(0);
    });
  });

  describe('identifyBottlenecks', () => {
    beforeEach(() => {
      monitor.startSession();
    });

    it('should identify rate limiting issues', () => {
      // 40% rate limited (>30% threshold for high severity)
      for (let i = 0; i < 6; i++) {
        monitor.recordRequest(true, 100, 0, false);
      }
      for (let i = 0; i < 4; i++) {
        monitor.recordRequest(false, 100, 0, true);
      }

      const bottlenecks = monitor.identifyBottlenecks();
      const rateLimitBottleneck = bottlenecks.find(b => b.type === 'rate_limit');

      expect(rateLimitBottleneck).toBeDefined();
      expect(rateLimitBottleneck?.severity).toBe('high');
    });

    it('should identify network failure issues', () => {
      // 30% failure rate
      for (let i = 0; i < 7; i++) {
        monitor.recordRequest(true, 100, 0, false);
      }
      for (let i = 0; i < 3; i++) {
        monitor.recordRequest(false, 100, 0, false);
      }

      const bottlenecks = monitor.identifyBottlenecks();
      const networkBottleneck = bottlenecks.find(
        b => b.type === 'network' && b.description.includes('failed')
      );

      expect(networkBottleneck).toBeDefined();
    });

    it('should identify high latency issues', () => {
      // High response times
      for (let i = 0; i < 5; i++) {
        monitor.recordRequest(true, 6000, 0, false); // 6 second response time
      }

      const bottlenecks = monitor.identifyBottlenecks();
      const latencyBottleneck = bottlenecks.find(
        b => b.type === 'network' && b.description.includes('response time')
      );

      expect(latencyBottleneck).toBeDefined();
      expect(latencyBottleneck?.severity).toBe('high');
    });

    it('should identify media download failures', () => {
      // High media failure rate
      for (let i = 0; i < 5; i++) {
        monitor.recordMediaDownload(true, 1000);
      }
      for (let i = 0; i < 5; i++) {
        monitor.recordMediaDownload(false);
      }

      const bottlenecks = monitor.identifyBottlenecks();
      const mediaBottleneck = bottlenecks.find(b => b.type === 'media_download');

      expect(mediaBottleneck).toBeDefined();
    });

    it('should return empty array for healthy metrics', () => {
      // Good metrics
      for (let i = 0; i < 10; i++) {
        monitor.recordRequest(true, 100, 0, false);
        monitor.recordItemProcessed('imported');
      }

      const bottlenecks = monitor.identifyBottlenecks();
      expect(bottlenecks.length).toBe(0);
    });
  });

  describe('formatForDisplay', () => {
    it('should format metrics as string', () => {
      monitor.startSession();

      monitor.recordRequest(true, 100, 1024, false);
      monitor.recordItemProcessed('imported');
      monitor.recordFileCreated();

      const display = monitor.formatForDisplay();

      expect(display).toContain('Import Performance Summary');
      expect(display).toContain('Items processed');
      expect(display).toContain('Network Statistics');
    });

    it('should include media section when media downloaded', () => {
      monitor.startSession();
      monitor.recordMediaDownload(true, 2048);

      const display = monitor.formatForDisplay();

      expect(display).toContain('Media Downloads');
      expect(display).toContain('Files downloaded: 1');
    });

    it('should include bottleneck recommendations', () => {
      monitor.startSession();

      // Create high rate limit scenario
      for (let i = 0; i < 5; i++) {
        monitor.recordRequest(false, 100, 0, true);
      }

      const display = monitor.formatForDisplay();

      expect(display).toContain('Identified Issues');
    });
  });

  describe('getMemoryTrend', () => {
    it('should return unknown with insufficient samples', () => {
      monitor.startSession();

      const trend = monitor.getMemoryTrend();
      expect(trend).toBe('unknown');
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      monitor.startSession();
      monitor.recordRequest(true, 100, 1024, false);
      monitor.recordItemProcessed('imported');

      monitor.reset();

      const requestMetrics = monitor.getRequestMetrics();
      const importMetrics = monitor.getImportMetrics();

      expect(requestMetrics.totalRequests).toBe(0);
      expect(importMetrics.itemsProcessed).toBe(0);
    });
  });
});
