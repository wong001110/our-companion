import { describe, expect, it } from 'vitest';
import { assessAttention, decideCompanionAction } from './index';

const companionContext = {
  dailySharedCount: 0,
  attentionBudgetRemaining: 80,
  curiosityBudgetRemaining: 80,
  trustScore: 0.8
};

describe('decision engine', () => {
  it('queues while the user is focused', () => {
    const decision = decideCompanionAction({
      eventType: 'DiscoveryCreated',
      targetId: 'disc_1',
      discovery: {
        id: 'disc_1',
        source: 'github',
        title: 'Useful discovery',
        tags: [],
        raw: {},
        userInterestScore: 70,
        userHistoryScore: 70,
        characterExpertiseScore: 70,
        noveltyScore: 80,
        usefulnessScore: 80,
        finalScore: 80,
        growthValue: 80,
        confidenceScore: 80,
        status: 'candidate',
        createdAt: 'now'
      },
      userContext: { mode: 'focused', localTime: '2026-06-26T14:00:00.000Z', recentActions: [], fatigueScore: 20 },
      companionContext
    });

    expect(decision.action).toBe('queue_for_later');
  });

  it('speaks for idle high-growth discoveries', () => {
    const attention = assessAttention({
      targetId: 'disc_1',
      targetType: 'discovery',
      noveltyScore: 88,
      growthValue: 92,
      sourceQuality: 90,
      userContext: { mode: 'idle', localTime: '2026-06-26T14:00:00.000Z', recentActions: [], fatigueScore: 10 },
      companionContext
    });
    const decision = decideCompanionAction({
      eventType: 'DiscoveryCreated',
      targetId: 'disc_1',
      curiosity: { id: 'curiosity_1', targetId: 'disc_1', targetType: 'discovery', growthValue: 92, budgetCost: 8, reason: 'High growth.' },
      attention,
      userContext: { mode: 'idle', localTime: '2026-06-26T14:00:00.000Z', recentActions: [], fatigueScore: 10 },
      companionContext
    });

    expect(attention.deservesAttention).toBe(true);
    expect(decision.action).toBe('speak');
  });

  it('remembers low-novelty or repeatedly ignored topics quietly', () => {
    const decision = decideCompanionAction({
      eventType: 'DiscoveryCreated',
      targetId: 'disc_1',
      discovery: {
        id: 'disc_1',
        source: 'github',
        title: 'Repeated topic',
        tags: [],
        raw: {},
        userInterestScore: 50,
        userHistoryScore: 50,
        characterExpertiseScore: 50,
        noveltyScore: 30,
        usefulnessScore: 70,
        finalScore: 60,
        growthValue: 65,
        confidenceScore: 70,
        status: 'candidate',
        createdAt: 'now'
      },
      userContext: {
        mode: 'idle',
        localTime: '2026-06-26T14:00:00.000Z',
        recentActions: ['ignored_discovery', 'ignored_discovery', 'ignored_discovery'],
        fatigueScore: 10
      },
      companionContext
    });

    expect(decision.action).toBe('remember_only');
  });

  it('daily share limit queues', () => {
    const decision = decideCompanionAction({
      eventType: 'DiscoveryCreated',
      targetId: 'disc_1',
      userContext: { mode: 'idle', localTime: '2026-06-26T14:00:00.000Z', recentActions: [], fatigueScore: 10 },
      companionContext: { ...companionContext, dailySharedCount: 3 }
    });

    expect(decision.action).toBe('queue_for_later');
  });
});
