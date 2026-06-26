import { describe, expect, it, vi } from 'vitest';
import { AppServices } from './services';

vi.mock('electron', () => ({
  app: {
    getPath: () => ':memory:'
  }
}));

describe('foundation event log', () => {
  it('records emitted foundation events and filters by source', async () => {
    const services = new AppServices(':memory:');

    services.emitFoundationEvent('CompanionDecisionMade', 'decision', { action: 'speak' }, 'corr_1');
    services.emitFoundationEvent('AnnStateChanged', 'character', { coreState: 'idle' });

    const all = await services.debug.getFoundationLog({ limit: 10 });
    expect(all).toHaveLength(2);
    expect(all[0].type).toBe('AnnStateChanged');

    const decisions = await services.debug.getFoundationLog({ source: 'decision', limit: 10 });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].correlationId).toBe('corr_1');

    services.db.close();
  });

  it('caps the ring buffer at 200 events', async () => {
    const services = new AppServices(':memory:');

    for (let index = 0; index < 205; index += 1) {
      services.emitFoundationEvent('TestEvent', 'discovery', { index });
    }

    const log = await services.debug.getFoundationLog({ limit: 300 });
    expect(log).toHaveLength(200);
    expect((log[0].payload as { index: number }).index).toBe(204);

    services.db.close();
  });
});
