export interface MetricsSnapshot {
  totalRequests: number;
  totalErrors: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  toolCallCounts: Record<string, number>;
  uptimeMs: number;
}

export class MetricsCollector {
  private requestCount = 0;
  private errorCount = 0;
  private latencies: number[] = [];
  private toolCalls: Record<string, number> = {};
  private startTime = Date.now();

  recordRequest(latencyMs: number, success: boolean): void {
    this.requestCount++;
    if (!success) this.errorCount++;
    this.latencies.push(latencyMs);
    if (this.latencies.length > 1000) {
      this.latencies = this.latencies.slice(-500);
    }
  }

  recordToolCall(toolName: string): void {
    this.toolCalls[toolName] = (this.toolCalls[toolName] || 0) + 1;
  }

  getSnapshot(): MetricsSnapshot {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)]! : 0;

    return {
      totalRequests: this.requestCount,
      totalErrors: this.errorCount,
      avgLatencyMs: Math.round(avg),
      p95LatencyMs: Math.round(p95),
      toolCallCounts: { ...this.toolCalls },
      uptimeMs: Date.now() - this.startTime,
    };
  }
}
