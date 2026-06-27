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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const states: string[] = [];
    let current = createInitialCharacterState();

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => { current = state; states.push(`${state.intent}:${state.coreState}`); return state; },
      generateReason: async () => ({ why_this_matters: 'Useful', recommended_action: 'view', short_message: 'Found.', card_title: 'T', card_body: 'B.', tags: [] }),
      markAnnounced: vi.fn(),
      canAnnounce: () => true,
      shouldInterruptShare: () => false
    });

    orchestrator.enqueue(sampleDiscovery('d1'));
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

  it('FIFO queue processes in order', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = createInitialCharacterState();
    const markAnnounced = vi.fn();

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => { current = state; return state; },
      generateReason: async () => ({ why_this_matters: 'U', recommended_action: 'view', short_message: 'F.', tags: [] }),
      markAnnounced,
      canAnnounce: () => true,
      shouldInterruptShare: () => false
    });

    orchestrator.enqueue(sampleDiscovery('d1'));
    orchestrator.enqueue(sampleDiscovery('d2'));
    orchestrator.enqueue(sampleDiscovery('d3'));
    await vi.runAllTimersAsync();

    expect(markAnnounced).toHaveBeenCalledTimes(3);
    expect(markAnnounced.mock.calls.map((c: unknown[]) => c[0])).toEqual(['d1', 'd2', 'd3']);
    vi.useRealTimers();
  });

  it('duplicate id is rejected', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = createInitialCharacterState();
    const markAnnounced = vi.fn();

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => { current = state; return state; },
      generateReason: async () => ({ why_this_matters: 'U', recommended_action: 'view', short_message: 'F.', tags: [] }),
      markAnnounced,
      canAnnounce: () => true,
      shouldInterruptShare: () => false
    });

    orchestrator.enqueue(sampleDiscovery('dup'));
    await vi.runAllTimersAsync();

    expect(orchestrator.enqueue(sampleDiscovery('dup'))).toBe(false);
    expect(markAnnounced).toHaveBeenCalledTimes(1);
    expect(orchestrator.getLastAnnouncedId()).toBe('dup');
    vi.useRealTimers();
  });

  it('interrupted discovery exhausts retries then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = createInitialCharacterState();
    let interruptCount = 0;

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => { current = state; return state; },
      generateReason: async () => ({ why_this_matters: 'U', recommended_action: 'view', short_message: 'F.', tags: [] }),
      markAnnounced: vi.fn(),
      canAnnounce: () => true,
      shouldInterruptShare: () => { interruptCount++; return true; }
    });

    orchestrator.enqueue(sampleDiscovery('give_up'));
    await vi.runAllTimersAsync();

    expect(interruptCount).toBe(3);
    expect(orchestrator.getQueue()).toHaveLength(0);
    expect(orchestrator.getLastAnnouncedId()).toBeUndefined();
    vi.useRealTimers();
  });

  it('partial interrupts eventually succeed after retries', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = createInitialCharacterState();
    let interruptCount = 0;
    const markAnnounced = vi.fn();

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => { current = state; return state; },
      generateReason: async () => ({ why_this_matters: 'U', recommended_action: 'view', short_message: 'F.', tags: [] }),
      markAnnounced,
      canAnnounce: () => true,
      shouldInterruptShare: () => { interruptCount++; return interruptCount <= 2; }
    });

    orchestrator.enqueue(sampleDiscovery('retry_ok'));
    await vi.runAllTimersAsync();

    expect(markAnnounced).toHaveBeenCalledTimes(1);
    expect(orchestrator.getLastAnnouncedId()).toBe('retry_ok');
    vi.useRealTimers();
  });

  it('queue resumes when canAnnounce becomes true', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = createInitialCharacterState();
    let canAnnounce = false;

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => { current = state; return state; },
      generateReason: async () => ({ why_this_matters: 'U', recommended_action: 'view', short_message: 'F.', tags: [] }),
      markAnnounced: vi.fn(),
      canAnnounce: () => canAnnounce,
      shouldInterruptShare: () => false
    });

    orchestrator.enqueue(sampleDiscovery('wait'));
    await vi.advanceTimersByTimeAsync(500);
    expect(orchestrator.isBusy()).toBe(false);

    canAnnounce = true;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(orchestrator.getQueue()).toHaveLength(0);
    vi.useRealTimers();
  });

  it('clearQueue empties the queue', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = createInitialCharacterState();

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => { current = state; return state; },
      generateReason: async () => ({ why_this_matters: 'U', recommended_action: 'view', short_message: 'F.', tags: [] }),
      markAnnounced: vi.fn(),
      canAnnounce: () => true,
      shouldInterruptShare: () => false
    });

    orchestrator.enqueue(sampleDiscovery('a'));
    orchestrator.enqueue(sampleDiscovery('b'));
    orchestrator.clearQueue();
    expect(orchestrator.getQueueLength()).toBe(0);
    vi.useRealTimers();
  });

  it('reports lastAnnouncedId after completion', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = createInitialCharacterState();

    const orchestrator = new DiscoveryShareOrchestrator({
      getState: () => current,
      saveState: (state) => { current = state; return state; },
      generateReason: async () => ({ why_this_matters: 'U', recommended_action: 'view', short_message: 'F.', tags: [] }),
      markAnnounced: vi.fn(),
      canAnnounce: () => true,
      shouldInterruptShare: () => false
    });

    expect(orchestrator.getLastAnnouncedId()).toBeUndefined();
    orchestrator.enqueue(sampleDiscovery('done'));
    await vi.runAllTimersAsync();
    expect(orchestrator.getLastAnnouncedId()).toBe('done');
    vi.useRealTimers();
  });
});
