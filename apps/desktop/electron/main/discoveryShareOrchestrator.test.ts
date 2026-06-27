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
      orchestrator.queue(sampleDiscovery('disc_test'));
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

  it('reports busy while announcing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let current = createInitialCharacterState();

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => { current = state; return state; },
      generateReason: async () => ({
        why_this_matters: 'Useful',
        recommended_action: 'view',
        short_message: 'Found something.',
        tags: ['frontend']
      }),
      markAnnounced: vi.fn(),
      canAnnounce: () => true,
      shouldInterruptShare: () => false
    });

    expect(orchestrator.isBusy()).toBe(false);
    expect(orchestrator.hasPending()).toBe(false);

    orchestrator.queue(sampleDiscovery('disc1'));
    expect(orchestrator.isBusy()).toBe(true);
    expect(orchestrator.hasPending()).toBe(false);

    await vi.runAllTimersAsync();

    expect(orchestrator.isBusy()).toBe(false);
    vi.useRealTimers();
  });

  it('rejects queue while busy', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let current = createInitialCharacterState();
    const markAnnounced = vi.fn();

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => { current = state; return state; },
      generateReason: async () => ({
        why_this_matters: 'Useful',
        recommended_action: 'view',
        short_message: 'Found something.',
        tags: ['frontend']
      }),
      markAnnounced,
      canAnnounce: () => true,
      shouldInterruptShare: () => false
    });

    orchestrator.queue(sampleDiscovery('disc1'));
    orchestrator.queue(sampleDiscovery('disc2'));

    await vi.runAllTimersAsync();

    expect(markAnnounced).toHaveBeenCalledTimes(1);
    expect(markAnnounced).toHaveBeenCalledWith('disc1');
    vi.useRealTimers();
  });

  it('ignores duplicate id', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let current = createInitialCharacterState();
    const markAnnounced = vi.fn();

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => { current = state; return state; },
      generateReason: async () => ({
        why_this_matters: 'Useful',
        recommended_action: 'view',
        short_message: 'Found something.',
        tags: ['frontend']
      }),
      markAnnounced,
      canAnnounce: () => true,
      shouldInterruptShare: () => false
    });

    orchestrator.queue(sampleDiscovery('dup'));
    orchestrator.queue(sampleDiscovery('dup'));

    await vi.runAllTimersAsync();

    expect(markAnnounced).toHaveBeenCalledTimes(1);
    expect(markAnnounced).toHaveBeenCalledWith('dup');
    vi.useRealTimers();
  });
});
