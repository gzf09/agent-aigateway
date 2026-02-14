import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../metrics/collector.js';

describe('MetricsCollector', () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = new MetricsCollector();
  });

  it('should start with zero counts', () => {
    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalRequests).toBe(0);
    expect(snapshot.totalErrors).toBe(0);
    expect(snapshot.avgLatencyMs).toBe(0);
    expect(snapshot.p95LatencyMs).toBe(0);
  });

  it('should record requests and calculate stats', () => {
    metrics.recordRequest(100, true);
    metrics.recordRequest(200, true);
    metrics.recordRequest(300, false);

    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalRequests).toBe(3);
    expect(snapshot.totalErrors).toBe(1);
    expect(snapshot.avgLatencyMs).toBe(200);
  });

  it('should record tool calls', () => {
    metrics.recordToolCall('list-ai-providers');
    metrics.recordToolCall('list-ai-providers');
    metrics.recordToolCall('add-ai-provider');

    const snapshot = metrics.getSnapshot();
    expect(snapshot.toolCallCounts['list-ai-providers']).toBe(2);
    expect(snapshot.toolCallCounts['add-ai-provider']).toBe(1);
  });

  it('should calculate p95 latency', () => {
    for (let i = 1; i <= 100; i++) {
      metrics.recordRequest(i, true);
    }
    const snapshot = metrics.getSnapshot();
    // p95 index = floor(100 * 0.95) = 95, sorted[95] = 96
    expect(snapshot.p95LatencyMs).toBe(96);
  });

  it('should track uptime', () => {
    const snapshot = metrics.getSnapshot();
    expect(snapshot.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should return a snapshot copy (not reference)', () => {
    metrics.recordToolCall('test-tool');
    const s1 = metrics.getSnapshot();
    metrics.recordToolCall('test-tool');
    const s2 = metrics.getSnapshot();
    expect(s1.toolCallCounts['test-tool']).toBe(1);
    expect(s2.toolCallCounts['test-tool']).toBe(2);
  });
});
