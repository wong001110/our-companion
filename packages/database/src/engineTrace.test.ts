import { describe, expect, it } from 'vitest';
import { DatabaseService } from './index';
import type { EngineTrace } from '@our-companion/shared';

describe('Engine Trace persistence', () => {
  it('round-trips complete and empty traces and filters the causal chain', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const patternTrace: EngineTrace = {
      id: 'trace-pattern',
      correlationId: 'corr-a',
      cycleId: 'cycle-a',
      companionId: 'companion-a',
      engine: 'pattern',
      operation: 'detect',
      providerMode: 'deterministic',
      inputRefs: ['memory:a'],
      outputRefs: ['pattern:a'],
      stateBeforeHash: 'before',
      stateAfterHash: 'after',
      startedAt: '2026-07-17T01:00:00.000Z',
      completedAt: '2026-07-17T01:00:00.008Z',
      durationMs: 8,
      status: 'completed'
    };
    const discoveryTrace: EngineTrace = {
      id: 'trace-discovery',
      correlationId: 'corr-a',
      causationId: patternTrace.id,
      cycleId: 'cycle-a',
      companionId: 'companion-a',
      engine: 'discovery',
      operation: 'provider-search',
      providerMode: 'live',
      inputRefs: ['pattern:a'],
      outputRefs: [],
      startedAt: '2026-07-17T01:00:01.000Z',
      completedAt: '2026-07-17T01:00:01.022Z',
      durationMs: 22,
      status: 'empty',
      skipReason: 'no_valid_discoveries'
    };

    db.insertEngineTrace(patternTrace);
    db.insertEngineTrace(discoveryTrace);

    expect(db.listEngineTraces({ correlationId: 'corr-a' })).toEqual([patternTrace, discoveryTrace]);
    expect(db.listEngineTraces({ cycleId: 'missing' })).toEqual([]);
    expect(db.listEngineTraces({ companionId: 'companion-a', limit: 1 })).toEqual([patternTrace]);
    db.close();
  });
});
