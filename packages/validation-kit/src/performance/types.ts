export type MetricCategory = 'runtime' | 'ai' | 'ui' | 'database' | 'memory' | 'cpu' | 'queue';

export interface PerformanceMetric {
  id: string;
  category: MetricCategory;
  name: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface PerformanceBudget {
  category: MetricCategory;
  name: string;
  maxAllowed: number;
  unit: string;
}

export interface PerformanceAlert {
  id: string;
  category: MetricCategory;
  name: string;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
  message: string;
  timestamp: string;
}

export interface PerformanceSummary {
  metrics: PerformanceMetric[];
  alerts: PerformanceAlert[];
  budgetViolations: PerformanceBudget[];
  timestamp: string;
}
