import { createId, nowIso } from '@our-companion/shared';
import type { PerformanceAlert, PerformanceBudget, MetricCategory } from './types';

export interface AlertThreshold {
  category: MetricCategory;
  name: string;
  warningThreshold: number;
  criticalThreshold: number;
}

export class AlertManager {
  private alerts: PerformanceAlert[] = [];
  private thresholds: AlertThreshold[] = [];
  private maxAlerts = 100;

  addThreshold(threshold: AlertThreshold): void {
    this.thresholds.push(threshold);
  }

  removeThreshold(category: MetricCategory, name: string): void {
    this.thresholds = this.thresholds.filter(
      (t) => !(t.category === category && t.name === name)
    );
  }

  evaluate(category: MetricCategory, name: string, value: number): PerformanceAlert | null {
    const threshold = this.thresholds.find(
      (t) => t.category === category && t.name === name
    );
    if (!threshold) return null;

    if (value >= threshold.criticalThreshold) {
      const alert: PerformanceAlert = {
        id: createId('alert'),
        category,
        name,
        value,
        threshold: threshold.criticalThreshold,
        severity: 'critical',
        message: `${name} exceeded critical threshold: ${value} >= ${threshold.criticalThreshold}`,
        timestamp: nowIso(),
      };
      this.alerts.unshift(alert);
      if (this.alerts.length > this.maxAlerts) this.alerts.length = this.maxAlerts;
      return alert;
    }

    if (value >= threshold.warningThreshold) {
      const alert: PerformanceAlert = {
        id: createId('alert'),
        category,
        name,
        value,
        threshold: threshold.warningThreshold,
        severity: 'warning',
        message: `${name} exceeded warning threshold: ${value} >= ${threshold.warningThreshold}`,
        timestamp: nowIso(),
      };
      this.alerts.unshift(alert);
      if (this.alerts.length > this.maxAlerts) this.alerts.length = this.maxAlerts;
      return alert;
    }

    return null;
  }

  getAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  getCriticalAlerts(): PerformanceAlert[] {
    return this.alerts.filter((a) => a.severity === 'critical');
  }

  getRecent(count = 10): PerformanceAlert[] {
    return this.alerts.slice(0, count);
  }

  clear(): void {
    this.alerts = [];
  }
}
