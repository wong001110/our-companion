import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import { ConversationCoordinator } from './ConversationCoordinator';

describe('ConversationCoordinator', () => {
  it('isolates sessions per companion', () => {
    const db = new DatabaseService();
    const coordinator = new ConversationCoordinator(db);

    coordinator.handleSessionPhase('ann', 'listening');
    coordinator.handleSessionPhase('bob', 'listening');

    expect(coordinator.getActiveSessionId('ann')).toBeTruthy();
    expect(coordinator.getActiveSessionId('bob')).toBeTruthy();
    expect(coordinator.getActiveSessionId('ann')).not.toBe(coordinator.getActiveSessionId('bob'));
    db.close();
  });

  it('switching companion does not cross-update phases', () => {
    const db = new DatabaseService();
    const coordinator = new ConversationCoordinator(db);

    coordinator.handleSessionPhase('ann', 'listening');
    const annSession = coordinator.getActiveSessionId('ann');
    coordinator.onCompanionSwitch('ann', 'bob');
    coordinator.handleSessionPhase('bob', 'listening');

    expect(db.getActiveConversationSession('ann')).toBeNull();
    expect(coordinator.getActiveSessionId('bob')).toBeTruthy();
    expect(coordinator.getActiveSessionId('bob')).not.toBe(annSession);
    db.close();
  });

  it('records close reason on session close', () => {
    const db = new DatabaseService();
    const coordinator = new ConversationCoordinator(db);
    coordinator.handleSessionPhase('ann', 'listening');
    const sessionId = coordinator.getActiveSessionId('ann')!;
    const closed = coordinator.closeSession(sessionId, 'timeout', 'local', 'ann');
    expect(closed.closeReason).toBe('timeout');
    expect(db.getActiveConversationSession('ann')).toBeNull();
    db.close();
  });
});
