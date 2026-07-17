import { describe, expect, it, vi } from 'vitest';
import type { CompanionDecision } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { DatabaseService } from '@our-companion/database';
import {
  DecisionCoordinator,
  shouldDeferDiscovery,
  shouldPresentNow
} from './DecisionCoordinator';

const { decideAction } = vi.hoisted(() => ({ decideAction: vi.fn() }));
vi.mock('@our-companion/decision-engine', async (importOriginal) => ({
  ...await importOriginal<typeof import('@our-companion/decision-engine')>(),
  decideUnifiedCompanionAction: decideAction,
}));

function shareDecision(timing: CompanionDecision['timing'], action: CompanionDecision['action'] = 'share_discovery'): CompanionDecision {
  return {
    id: createId('decision'),
    action,
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

  it('defers a next_idle discovery even when the current action is stay_silent', () => {
    expect(shouldDeferDiscovery({
      ...shareDecision('next_idle'),
      action: 'stay_silent',
      displayHint: 'stay_silent',
    })).toBe(true);
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

  it('preserves one pending action when immediate execution is deferred as busy', () => {
    const db = new DatabaseService();
    const coordinator = new DecisionCoordinator(db);
    const immediate = shareDecision('now');
    const first = coordinator.ensureDeferred(immediate, 'ann', 'disc-1', 'active_command_exists');
    const second = coordinator.ensureDeferred(immediate, 'ann', 'disc-1', 'active_command_exists');
    expect(second.id).toBe(first.id);
    expect(second.deferReason).toBe('active_command_exists');
    expect(db.listPendingActions('ann')).toHaveLength(1);
    db.close();
  });

  it('keeps pending intent until a fresh now decision is successfully activated', () => {
    const db = new DatabaseService();
    const coordinator = new DecisionCoordinator(db);
    const pending = coordinator.ensureDeferred(shareDecision('now'), 'ann', 'disc-1', 'active_command_exists');
    const context = {
      companionId: 'ann', userId: 'local', sessionActive: false, companionDragging: false,
      relationship: {} as never, sharedToday: 0, recentActions: [] as string[],
    };

    decideAction.mockReturnValueOnce(shareDecision('next_idle'));
    expect(coordinator.reevaluatePending(context).decision?.timing).toBe('next_idle');
    expect(db.listPendingActions('ann')).toHaveLength(1);

    decideAction.mockReturnValueOnce(shareDecision('later', 'stay_silent'));
    expect(coordinator.reevaluatePending(context).decision).toBeNull();
    expect(db.listPendingActions('ann')).toHaveLength(1);

    decideAction.mockReturnValueOnce(shareDecision('now'));
    const result = coordinator.reevaluatePending(context);
    expect(result.decision?.timing).toBe('now');
    expect(result.pendingAction?.id).toBe(pending.id);
    expect(db.listPendingActions('ann')).toHaveLength(1);
    coordinator.completePendingAction(result.pendingAction!.id);
    expect(db.listPendingActions('ann')).toHaveLength(0);
    db.close();
  });
});
