import { describe, expect, it } from 'vitest';
import { computeInitiativeBudget, decideUnifiedCompanionAction } from './unified-decision';
import type { UserCompanionRelationship } from '@our-companion/shared';

const baseRelationship: UserCompanionRelationship = {
  userId: 'local',
  companionId: 'ann',
  familiarity: 20,
  trust: 30,
  comfort: 25,
  preferredInteractionFrequency: 'normal',
  preferredInteractionStyle: 'balanced',
  recentPositiveInteractions: 0,
  recentIgnoredInteractions: 0,
  recentCorrections: 0,
  sharedExperienceIds: [],
  knownBoundaries: [],
  updatedAt: new Date().toISOString(),
};

describe('computeInitiativeBudget', () => {
  it('reduces budget when focused mode is on', () => {
    const normal = computeInitiativeBudget(baseRelationship, 0, false);
    const focused = computeInitiativeBudget(baseRelationship, 0, true);
    expect(focused.remaining).toBeLessThanOrEqual(normal.remaining);
  });

  it('reduces budget after ignored interactions', () => {
    const rel = { ...baseRelationship, recentIgnoredInteractions: 3 };
    const budget = computeInitiativeBudget(rel, 0, false);
    expect(budget.remaining).toBeLessThan(3);
  });
});

describe('decideUnifiedCompanionAction', () => {
  it('does not share discovery when initiative budget is exhausted', () => {
    const decision = decideUnifiedCompanionAction({
      brainInput: {
        insightContext: { recentInsights: ['d1'], insightCount: 1, topInsightImportance: 0.9 },
        timestamp: new Date().toISOString(),
      },
      userContext: { mode: 'idle', localTime: '2026-07-10T14:00:00.000Z', recentActions: [], fatigueScore: 10 },
      relationship: baseRelationship,
      initiativeBudget: { remaining: 0, max: 8, recoveryRate: 1 },
      discovery: {
        id: 'd1',
        source: 'hackernews',
        title: 'Test',
        tags: [],
        raw: {},
        userInterestScore: 80,
        userHistoryScore: 50,
        characterExpertiseScore: 50,
        noveltyScore: 80,
        usefulnessScore: 80,
        finalScore: 85,
        status: 'shared',
        createdAt: new Date().toISOString(),
      },
      sessionActive: false,
      companionDragging: false,
    });
    expect(decision.action).not.toBe('share_discovery');
  });

  it('provides displayHint for renderer', () => {
    const decision = decideUnifiedCompanionAction({
      brainInput: { timestamp: new Date().toISOString() },
      userContext: { mode: 'idle', localTime: '2026-07-10T14:00:00.000Z', recentActions: [], fatigueScore: 10 },
      relationship: baseRelationship,
      initiativeBudget: { remaining: 3, max: 8, recoveryRate: 1 },
      sessionActive: false,
      companionDragging: false,
    });
    expect(decision.displayHint).toBeDefined();
  });
});
