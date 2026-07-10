import { describe, expect, it } from 'vitest';
import type { CompanionDecision } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { DatabaseService } from '@our-companion/database';
import {
  DecisionCoordinator,
  shouldDeferDiscovery,
  shouldPresentNow
} from './DecisionCoordinator';

function shareDecision(timing: CompanionDecision['timing']): CompanionDecision {
  return {
    id: createId('decision'),
    action: 'share_discovery',
    timing,
    priority: 'normal',
    reason: 'test',
    createdAt: nowIso()
  };
}

describe('DecisionCoordinator', () => {
  it('shouldPresentNow only for timing now', () => {
    expect(shouldPresentNow(shareDecision('now'))).toBe(true);
    expect(shouldPresentNow(shareDecision('next_idle'))).toBe(false);
    expect(shouldDeferDiscovery(shareDecision('next_idle'))).toBe(true);
  });

  it('next_idle does not present immediately — enqueues pending', () => {
    const db = new DatabaseService();
    const coordinator = new DecisionCoordinator(db);
    const decision = shareDecision('next_idle');
    const pending = coordinator.enqueueDeferred(decision, 'ann', 'disc-1');
    expect(pending.status).toBe('pending');
    expect(db.listPendingActions('ann').length).toBe(1);
    db.close();
  });

  it('stale pending action expires', () => {
    const db = new DatabaseService();
    const coordinator = new DecisionCoordinator(db);
    const decision = shareDecision('next_idle');
    db.insertPendingAction({
      id: createId('pending'),
      companionId: 'ann',
      decision,
      discoveryId: 'disc-1',
      createdAt: new Date(Date.now() - 10_000).toISOString(),
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      status: 'pending'
    });
    coordinator.expireStale('ann');
    const remaining = db.listPendingActions('ann');
    expect(remaining.length).toBe(0);
    db.close();
  });

  it('cancelled action never presents', () => {
    const db = new DatabaseService();
    const coordinator = new DecisionCoordinator(db);
    coordinator.enqueueDeferred(shareDecision('next_idle'), 'ann', 'disc-1');
    coordinator.cancelAll('ann');
    expect(db.listPendingActions('ann').length).toBe(0);
    db.close();
  });
});
