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
      orchestrator.enqueue(sampleDiscovery('disc_test'));
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

  it('accepts enqueue while busy (FIFO queue)', async () => {
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

    expect(orchestrator.enqueue(sampleDiscovery('d1'))).toBe(true);
    expect(orchestrator.enqueue(sampleDiscovery('d2'))).toBe(true);
    expect(orchestrator.enqueue(sampleDiscovery('d3'))).toBe(true);
    expect(orchestrator.getQueueLength()).toBe(3);

    await vi.runAllTimersAsync();

    expect(markAnnounced).toHaveBeenCalledTimes(3);
    expect(markAnnounced.mock.calls.map((c: unknown[]) => c[0])).toEqual(['d1', 'd2', 'd3']);
    vi.useRealTimers();
  });

  it('rejects duplicate id', async () => {
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

    expect(orchestrator.enqueue(sampleDiscovery('dup'))).toBe(true);
    expect(orchestrator.enqueue(sampleDiscovery('dup'))).toBe(false);

    await vi.runAllTimersAsync();

    expect(markAnnounced).toHaveBeenCalledTimes(1);
    expect(markAnnounced).toHaveBeenCalledWith('dup');
    vi.useRealTimers();
  });

  it('reports queue length and pending id', async () => {
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

    expect(orchestrator.hasPending()).toBe(false);
    expect(orchestrator.getQueueLength()).toBe(0);

    orchestrator.enqueue(sampleDiscovery('a'));
    orchestrator.enqueue(sampleDiscovery('b'));

    expect(orchestrator.hasPending()).toBe(true);
    expect(orchestrator.getQueueLength()).toBe(2);
    expect(orchestrator.getPendingDiscoveryId()).toBe('a');

    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });
});
