import { createId } from '@our-companion/shared';
import type { TestResult, TestReport } from './types';
import { SimulationEngine } from '../simulation';
import type { SimulationConfig, SimulationResult } from '../simulation';
import type { Clock, ProductionRuntimeGateway } from '../production-runtime';

export interface ScenarioTestRunnerDeps {
  loadScenario(scenarioId: string): boolean | Promise<boolean>;
  gateway: ProductionRuntimeGateway;
  emitEvent?(type: string, payload?: Record<string, unknown>): void;
  clock?: Pick<Clock, 'now' | 'nowIso'>;
}

export class ScenarioTestRunner {
  private readonly deps: ScenarioTestRunnerDeps;
  private readonly simulation: SimulationEngine;
  private reports: TestReport[] = [];

  constructor(deps: ScenarioTestRunnerDeps) {
    this.deps = deps;
    this.simulation = new SimulationEngine({
      gateway: deps.gateway,
      emitEvent: deps.emitEvent ?? (() => undefined),
      clock: deps.clock,
    });
  }

  getReports(): TestReport[] {
    return [...this.reports];
  }

  async runScenario(
    scenarioId: string,
    assertions: Array<{
      name: string;
      check: (state: Record<string, unknown>, execution: SimulationResult) => boolean;
    }>,
    config: SimulationConfig = {
      category: 'runtime',
      params: { action: 'run_scenario' },
    },
  ): Promise<TestReport> {
    const startTime = this.now();
    const results: TestResult[] = [];

    const loaded = await this.deps.loadScenario(scenarioId);
    results.push({
      id: createId('test'),
      name: `Load scenario ${scenarioId}`,
      level: 'scenario',
      passed: loaded,
      duration: 0,
      expected: true,
      actual: loaded,
      timestamp: this.nowIso(),
    });

    if (!loaded) {
      const report: TestReport = {
        id: createId('report'),
        name: `Scenario: ${scenarioId}`,
        results,
        passed: 0,
        failed: 1,
        total: 1,
        duration: this.now() - startTime,
        timestamp: this.nowIso(),
      };
      this.reports.push(report);
      return report;
    }

    const execution = await this.simulation.execute({
      ...config,
      params: { ...config.params, scenarioId },
    });
    results.push({
      id: createId('test'),
      name: `Execute production flow for ${scenarioId}`,
      level: 'integration',
      passed: execution.success,
      duration: 0,
      expected: 'completed, empty, or skipped',
      actual: execution.status,
      error: execution.error,
      timestamp: this.nowIso(),
    });
    const state = execution.stateDelta.after;

    for (const assertion of assertions) {
      const start = this.now();
      let passed = false;
      let error: string | undefined;
      try {
        passed = assertion.check(state, execution);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      results.push({
        id: createId('test'),
        name: assertion.name,
        level: 'scenario',
        passed,
        duration: this.now() - start,
        error,
        timestamp: this.nowIso(),
      });
    }

    const report: TestReport = {
      id: createId('report'),
      name: `Scenario: ${scenarioId}`,
      results,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      total: results.length,
      duration: this.now() - startTime,
      timestamp: this.nowIso(),
      productionExecution: execution,
    };
    this.reports.push(report);
    return report;
  }

  private now(): number {
    return this.deps.clock?.now() ?? Date.now();
  }

  private nowIso(): string {
    return this.deps.clock?.nowIso() ?? new Date().toISOString();
  }
}
