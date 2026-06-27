export type TestLevel = 'unit' | 'integration' | 'runtime' | 'scenario' | 'experience' | 'regression';

export interface TestResult {
  id: string;
  name: string;
  level: TestLevel;
  passed: boolean;
  duration: number;
  assertion?: string;
  expected?: unknown;
  actual?: unknown;
  error?: string;
  timestamp: string;
}

export interface TestReport {
  id: string;
  name: string;
  results: TestResult[];
  passed: number;
  failed: number;
  total: number;
  duration: number;
  timestamp: string;
}

export interface ExperienceAssertion {
  type: string;
  description: string;
  check: () => boolean;
}
