import { createId, nowIso } from '@our-companion/shared';
import type { PerformanceMetric, PerformanceBudget, PerformanceSummary, MetricCategory } from './types';

const DEFAULT_BUDGETS: PerformanceBudget[] = [
  { category: 'runtime', name: 'tick_duration', maxAllowed: 50, unit: 'ms' },
  { category: 'ai', name: 'llm_response_time', maxAllowed: 5000, unit: 'ms' },
  { category: 'database', name: 'read_latency', maxAllowed: 10, unit: 'ms' },
  { category: 'database', name: 'write_latency', maxAllowed: 20, unit: 'ms' },
  { category: 'memory', name: 'heap_used', maxAllowed: 512, unit: 'MB' },
  { category: 'cpu', name: 'idle_usage', maxAllowed: 5, unit: '%' },
];

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private budgets: PerformanceBudget[] = [...DEFAULT_BUDGETS];
  private maxMetrics = 1000;
  private startTime = Date.now();

  record(category: MetricCategory, name: string, value: number, unit: string): PerformanceMetric {
    const metric: PerformanceMetric = {
      id: createId('perf'),
      category,
      name,
      value,
      unit,
      timestamp: nowIso(),
    };
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
    return metric;
  }

  recordTickDuration(durationMs: number): PerformanceMetric {
    return this.record('runtime', 'tick_duration', durationMs, 'ms');
  }

  recordLLMResponse(timeMs: number): PerformanceMetric {
    return this.record('ai', 'llm_response_time', timeMs, 'ms');
  }

  recordMemoryUsage(heapMB: number): PerformanceMetric {
    return this.record('memory', 'heap_used', heapMB, 'MB');
  }

  recordCPUUsage(percent: number): PerformanceMetric {
    return this.record('cpu', 'idle_usage', percent, '%');
  }

  getMetrics(category?: MetricCategory, name?: string): PerformanceMetric[] {
    let result = this.metrics;
    if (category) result = result.filter((m) => m.category === category);
    if (name) result = result.filter((m) => m.name === name);
    return [...result];
  }

  getLatest(category: MetricCategory, name: string): PerformanceMetric | undefined {
    return [...this.metrics].reverse().find((m) => m.category === category && m.name === name);
  }

  getAverage(category: MetricCategory, name: string, count = 10): number {
    const matching = this.metrics.filter((m) => m.category === category && m.name === name).slice(-count);
    if (matching.length === 0) return 0;
    return matching.reduce((sum, m) => sum + m.value, 0) / matching.length;
  }

  getPeak(category: MetricCategory, name: string): number {
    const matching = this.metrics.filter((m) => m.category === category && m.name === name);
    if (matching.length === 0) return 0;
    return Math.max(...matching.map((m) => m.value));
  }

  checkBudgets(): PerformanceBudget[] {
    const violations: PerformanceBudget[] = [];
    for (const budget of this.budgets) {
      const latest = this.getLatest(budget.category, budget.name);
      if (latest && latest.value > budget.maxAllowed) {
        violations.push(budget);
      }
    }
    return violations;
  }

  addBudget(budget: PerformanceBudget): void {
    this.budgets.push(budget);
  }

  removeBudget(category: MetricCategory, name: string): void {
    this.budgets = this.budgets.filter((b) => !(b.category === category && b.name === name));
  }

  getSummary(): PerformanceSummary {
    return {
      metrics: this.getMetrics().slice(-50),
      alerts: [],
      budgetViolations: this.checkBudgets(),
      timestamp: nowIso(),
    };
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }

  clear(): void {
    this.metrics = [];
  }
}
