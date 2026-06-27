import { createId, nowIso } from '@our-companion/shared';
import type { TestResult, TestReport } from './types';

export interface ScenarioTestRunnerDeps {
  loadScenario(scenarioId: string): boolean;
  runSimulation(): void;
  getState(): Record<string, unknown>;
}

export class ScenarioTestRunner {
  private readonly deps: ScenarioTestRunnerDeps;
  private reports: TestReport[] = [];

  constructor(deps: ScenarioTestRunnerDeps) {
    this.deps = deps;
  }

  getReports(): TestReport[] {
    return [...this.reports];
  }

  async runScenario(
    scenarioId: string,
    assertions: Array<{ name: string; check: (state: Record<string, unknown>) => boolean }>
  ): Promise<TestReport> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    const loaded = this.deps.loadScenario(scenarioId);
    results.push({
      id: createId('test'),
      name: `Load scenario ${scenarioId}`,
      level: 'scenario',
      passed: loaded,
      duration: 0,
      expected: true,
      actual: loaded,
      timestamp: nowIso(),
    });

    if (!loaded) {
      const report: TestReport = {
        id: createId('report'),
        name: `Scenario: ${scenarioId}`,
        results,
        passed: 0,
        failed: 1,
        total: 1,
        duration: Date.now() - startTime,
        timestamp: nowIso(),
      };
      this.reports.push(report);
      return report;
    }

    this.deps.runSimulation();
    const state = this.deps.getState();

    for (const assertion of assertions) {
      const start = Date.now();
      let passed = false;
      let error: string | undefined;
      try {
        passed = assertion.check(state);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      results.push({
        id: createId('test'),
        name: assertion.name,
        level: 'scenario',
        passed,
        duration: Date.now() - start,
        error,
        timestamp: nowIso(),
      });
    }

    const report: TestReport = {
      id: createId('report'),
      name: `Scenario: ${scenarioId}`,
      results,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      total: results.length,
      duration: Date.now() - startTime,
      timestamp: nowIso(),
    };
    this.reports.push(report);
    return report;
  }
}
