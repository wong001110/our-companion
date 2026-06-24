import { describe, expect, it, vi } from 'vitest';
import { createInitialCharacterState } from '@our-companion/character-engine';
import type { Discovery } from '@our-companion/shared';
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

describe('DiscoveryShareOrchestrator', () => {
  it('advances through thinking, discovering, talking, and idle', async () => {
    vi.useFakeTimers();

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
        tags: ['frontend']
      }),
      markAnnounced: vi.fn(),
      canAnnounce: () => true,
      shouldInterruptShare: () => false,
      getCompanionWindow: () => undefined
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
});
