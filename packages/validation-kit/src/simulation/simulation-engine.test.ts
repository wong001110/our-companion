import { describe, expect, it, vi } from 'vitest';
import type {
  ProductionRuntimeExecution,
  ProductionRuntimeGateway,
} from '../production-runtime';
import { FakeClock } from '../testing';
import { SimulationEngine } from './simulation-engine';

describe('SimulationEngine production flow', () => {
  it('delegates to the supplied production gateway and reports trace-backed state changes', async () => {
    let state: Record<string, unknown> = {
      discoveryCount: 0,
      schedulerHealthy: true,
    };
    const execute = vi.fn(async (): Promise<ProductionRuntimeExecution> => {
      state = { discoveryCount: 1, schedulerHealthy: true };
      return {
        operation: 'scheduled_refresh',
        status: 'completed',
        description: 'Production refresh completed',
        correlationId: 'corr-refresh',
        traceIds: ['trace-provider', 'trace-discovery'],
        inputRefs: ['provider:fixture'],
        outputRefs: ['discovery:one'],
        state,
        completedAt: '2026-07-17T00:00:01.000Z',
      };
    });
    const gateway: ProductionRuntimeGateway = {
      execute,
      getState: vi.fn(async () => structuredClone(state)),
    };
    const emitEvent = vi.fn();
    const engine = new SimulationEngine({
      gateway,
      emitEvent,
      clock: new FakeClock('2026-07-17T00:00:00.000Z'),
    });

    const result = await engine.execute({
      category: 'discovery',
      params: { action: 'scheduled_refresh' },
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({
      category: 'discovery',
      params: { action: 'scheduled_refresh' },
    });
    expect(result).toMatchObject({
      success: true,
      operation: 'scheduled_refresh',
      status: 'completed',
      correlationId: 'corr-refresh',
      traceIds: ['trace-provider', 'trace-discovery'],
      inputRefs: ['provider:fixture'],
      outputRefs: ['discovery:one'],
      timestamp: '2026-07-17T00:00:01.000Z',
    });
    expect(result.stateDelta.changes).toEqual({
      discoveryCount: { before: 0, after: 1 },
    });
    expect('affectedSystems' in result).toBe(false);
    expect(emitEvent).toHaveBeenCalledWith('SimulationExecuted', expect.objectContaining({
      operation: 'scheduled_refresh',
      traceIds: ['trace-provider', 'trace-discovery'],
    }));
  });

  it('reports a thrown production failure without substituting Validation Kit behavior', async () => {
    const gateway: ProductionRuntimeGateway = {
      execute: vi.fn(async () => {
        throw new Error('provider unavailable');
      }),
      getState: vi.fn(async () => ({ discoveryCount: 0 })),
    };
    const engine = new SimulationEngine({
      gateway,
      emitEvent: vi.fn(),
      clock: new FakeClock('2026-07-17T00:00:00.000Z'),
    });

    const result = await engine.execute({
      category: 'discovery',
      params: { action: 'scheduled_refresh' },
    });

    expect(result.status).toBe('failed');
    expect(result.success).toBe(false);
    expect(result.error).toBe('provider unavailable');
    expect(result.traceIds).toEqual([]);
    expect(result.stateDelta.changes).toEqual({});
  });
});
