import { describe, expect, it } from 'vitest';
import {
  assessAttention,
  decideCompanionAction,
  CompanionBrain,
  buildDecisionContext,
  generateCandidates,
  scoreCandidate,
  shouldInterrupt,
} from './index';
import type { CompanionDecisionInput, CompanionDecisionContext } from '@our-companion/shared';

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

describe('companion brain v2', () => {
  const defaultInput: CompanionDecisionInput = {
    userContext: {
      mode: 'idle',
      localTime: new Date().toISOString(),
      recentActions: [],
      fatigueScore: 20,
    },
    conversationContext: {
      recentMessages: ['Hello'],
      messageCount: 1,
    },
    memoryContext: {
      relevantMemories: ['mem1'],
      memoryCount: 5,
      topMemoryImportance: 0.8,
    },
    patternContext: {
      activePatterns: ['pattern1'],
      patternCount: 3,
      topPatternConfidence: 0.7,
    },
    insightContext: {
      recentInsights: ['insight1'],
      insightCount: 2,
      topInsightImportance: 0.75,
    },
    curiosityContext: {
      curiosityTargets: ['target1'],
      targetCount: 1,
      topCuriosityScore: 0.8,
    },
    characterContext: {
      mood: 'curious',
      energy: 75,
    },
  };

  describe('context building', () => {
    it('builds context from partial input', () => {
      const brain = new CompanionBrain();
      const context = brain.buildContext({});
      expect(context.user.mode).toBe('idle');
      expect(context.conversation.messageCount).toBe(0);
    });

    it('uses provided context', () => {
      const brain = new CompanionBrain();
      const context = brain.buildContext(defaultInput);
      expect(context.user.mode).toBe('idle');
      expect(context.conversation.messageCount).toBe(1);
      expect(context.memory.memoryCount).toBe(5);
    });
  });

  describe('candidate evaluation', () => {
    it('generates stay_quiet candidate', () => {
      const brain = new CompanionBrain();
      const context = brain.buildContext({});
      const candidates = brain.evaluateCandidates(context);
      expect(candidates.some((c) => c.type === 'stay_quiet')).toBe(true);
    });

    it('generates respond candidate when conversation is active', () => {
      const brain = new CompanionBrain();
      const context = brain.buildContext(defaultInput);
      const candidates = brain.evaluateCandidates(context);
      expect(candidates.some((c) => c.type === 'respond')).toBe(true);
    });

    it('generates share_discovery when insight is strong', () => {
      const brain = new CompanionBrain();
      const context = brain.buildContext(defaultInput);
      const candidates = brain.evaluateCandidates(context);
      expect(candidates.some((c) => c.type === 'share_discovery')).toBe(true);
    });

    it('lowers score when interruption cost is high', () => {
      const brain = new CompanionBrain();
      const focusedInput: CompanionDecisionInput = {
        ...defaultInput,
        userContext: { ...defaultInput.userContext!, mode: 'focused' },
      };
      const context = brain.buildContext(focusedInput);
      const candidates = brain.evaluateCandidates(context);
      const highCostCandidate = candidates.find((c) => c.interruptionCost > 0.3);
      const stayQuiet = candidates.find((c) => c.type === 'stay_quiet');
      if (highCostCandidate && stayQuiet) {
        expect(highCostCandidate.score).toBeLessThanOrEqual(stayQuiet.score + 0.2);
      }
    });
  });

  describe('selection', () => {
    it('selects highest valid candidate', () => {
      const brain = new CompanionBrain();
      const result = brain.decide(defaultInput);
      expect(result.selectedCandidate).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('returns reasoning summary', () => {
      const brain = new CompanionBrain();
      const result = brain.decide(defaultInput);
      expect(result.reasoningSummary).toBeTruthy();
      expect(result.reasoningSummary.length).toBeGreaterThan(0);
    });

    it('includes confidence score', () => {
      const brain = new CompanionBrain();
      const result = brain.decide(defaultInput);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('interruption safety', () => {
    it('blocks interruption for focused user with high cost', () => {
      const brain = new CompanionBrain();
      const focusedInput: CompanionDecisionInput = {
        ...defaultInput,
        userContext: { ...defaultInput.userContext!, mode: 'focused', fatigueScore: 85 },
      };
      const result = brain.decide(focusedInput);
      if (result.selectedCandidate.interruptionCost > 0.3) {
        expect(result.shouldInterruptUser).toBe(false);
      }
    });

    it('allows interruption for idle user with low cost', () => {
      const brain = new CompanionBrain();
      const result = brain.decide(defaultInput);
      expect(result.shouldInterruptUser).toBe(true);
    });
  });
});
