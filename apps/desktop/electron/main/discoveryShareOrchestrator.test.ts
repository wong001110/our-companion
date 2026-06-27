import { describe, expect, it, vi } from 'vitest';
import { createInitialCharacterState } from '@our-companion/character-engine';
import type { Discovery, DiscoveryCandidate } from '@our-companion/shared';
import { DOMAIN_EVENT_TYPES } from '@our-companion/shared';
import { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';

function sampleDiscovery(id: string): Discovery {
  return {
    id,
    source: 'github',
    title: `Discovery ${id}`,
    tags: ['frontend'],
    raw: {},
    userInterestScore: 80,
    userHistoryScore: 70,
    characterExpertiseScore: 75,
    noveltyScore: 70,
    usefulnessScore: 65,
    finalScore: 75,
    status: 'shared',
    createdAt: new Date().toISOString(),
    sharedAt: new Date().toISOString()
  };
}

function sampleCandidate(id: string): DiscoveryCandidate {
  return {
    id,
    userId: 'default',
    companionId: 'ann',
    title: `Candidate ${id}`,
    summary: 'A useful signal.',
    sourceType: 'article',
    sourceName: 'github',
    agentType: 'scout',
    relatedCuriosityTargetId: 'curiosity_1',
    relevanceScore: 0.8,
    noveltyScore: 0.7,
    evidenceScore: 0.7,
    usefulnessScore: 0.75,
    collectedAt: new Date().toISOString()
  };
}

describe('DiscoveryShareOrchestrator', () => {
  it('advances through thinking, discovering, talking, and idle', async () => {
    vi.useFakeTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const states: string[] = [];
    let current = createInitialCharacterState();

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => {
        current = state;
        states.push(`${state.intent}:${state.coreState}`);
        return state;
      },
      generateReason: async () => ({
        why_this_matters: 'Useful',
        recommended_action: 'view',
        short_message: 'I found something worth a peek.',
        card_title: 'Worth a peek',
        card_body: 'Something useful for your work.',
        tags: ['frontend']
      }),
      markAnnounced: vi.fn(),
      canAnnounce: () => true,
      shouldInterruptShare: () => false
    });

    const announcePromise = Promise.resolve().then(() => {
      orchestrator.enqueue([sampleDiscovery('disc_test')]);
    });

    await vi.runAllTimersAsync();
    await announcePromise;
    await vi.runAllTimersAsync();

    expect(states).toEqual([
      'sharing_discovery:thinking',
      'sharing_discovery:discovering',
      'sharing_discovery:talking',
      'sharing_discovery:idle',
      'waiting:idle'
    ]);

    vi.useRealTimers();
  });

  it('emits card before speech and queues candidates independently', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const payloads: Array<{ phase?: string; message?: string }> = [];
    let current = createInitialCharacterState();
    const events: Array<{ type: string; payload?: Record<string, unknown> }> = [];
    const eventBus = {
      emit: (event: { type: string; payload?: Record<string, unknown> }) => {
        events.push(event);
        if (event.type === DOMAIN_EVENT_TYPES.AnnMessageQueued) {
          payloads.push(event.payload as { phase?: string; message?: string });
        }
      }
    };

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => {
        current = state;
        return state;
      },
      generateReason: async () => ({
        why_this_matters: 'Useful',
        recommended_action: 'view',
        short_message: 'This might fit your memory work.',
        card_title: 'Local-first memory',
        card_body: 'SQLite-backed tools can stay local and inspectable.',
        tags: ['sqlite']
      }),
      markAnnounced: vi.fn(),
      canAnnounce: () => true,
      shouldInterruptShare: () => false,
      eventBus: eventBus as never
    });

    orchestrator.enqueueCandidates([sampleCandidate('candidate_a'), sampleCandidate('candidate_b')], 'cycle_1');
    await vi.runAllTimersAsync();

    expect(payloads[0]?.phase).toBe('card');
    expect(payloads[0]?.message).toBe('');
    expect(payloads.find((payload) => payload.phase === 'speech')?.message).toBe('This might fit your memory work.');
    expect(orchestrator.getQueueDebugState().queueLength).toBe(0);

    vi.useRealTimers();
  });
});
