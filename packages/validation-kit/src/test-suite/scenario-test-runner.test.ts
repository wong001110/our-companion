import { describe, expect, it, vi } from 'vitest';
import type { ProductionRuntimeGateway } from '../production-runtime';
import { FakeClock } from '../testing';
import { ScenarioTestRunner } from './scenario-test-runner';

describe('ScenarioTestRunner production flow', () => {
  it('loads preconditions then runs assertions against the production gateway result', async () => {
    const execute = vi.fn(async (command) => ({
      operation: 'autonomous_cycle',
      status: 'completed' as const,
      correlationId: 'corr-cycle',
      traceIds: ['trace-memory', 'trace-pattern', 'trace-decision'],
      outputRefs: ['decision:one'],
      state: {
        memoryCount: 1,
        patternCount: 1,
        decisionCount: 1,
      },
    }));
    const gateway: ProductionRuntimeGateway = {
      execute,
      getState: vi.fn(async () => ({ memoryCount: 1 })),
    };
    const loadScenario = vi.fn(async () => true);
    const runner = new ScenarioTestRunner({
      loadScenario,
      gateway,
      clock: new FakeClock('2026-07-17T00:00:00.000Z'),
    });

    const report = await runner.runScenario(
      'autonomous-cycle',
      [{
        name: 'one decision is produced',
        check: (state, execution) =>
          state.decisionCount === 1 &&
          execution.traceIds.at(-1) === 'trace-decision',
      }],
      {
        category: 'discovery',
        params: { action: 'autonomous_cycle' },
      },
    );

    expect(loadScenario).toHaveBeenCalledWith('autonomous-cycle');
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({
      category: 'discovery',
      params: {
        action: 'autonomous_cycle',
        scenarioId: 'autonomous-cycle',
      },
    });
    expect(report.productionExecution?.correlationId).toBe('corr-cycle');
    expect(report.results.map((result) => result.name)).toEqual([
      'Load scenario autonomous-cycle',
      'Execute production flow for autonomous-cycle',
      'one decision is produced',
    ]);
    expect(report.failed).toBe(0);
  });

  it('does not invoke production when scenario preconditions cannot be loaded', async () => {
    const gateway: ProductionRuntimeGateway = {
      execute: vi.fn(),
      getState: vi.fn(),
    };
    const runner = new ScenarioTestRunner({
      loadScenario: async () => false,
      gateway,
      clock: new FakeClock(),
    });

    const report = await runner.runScenario('missing', []);

    expect(gateway.execute).not.toHaveBeenCalled();
    expect(report.failed).toBe(1);
    expect(report.productionExecution).toBeUndefined();
  });
});
