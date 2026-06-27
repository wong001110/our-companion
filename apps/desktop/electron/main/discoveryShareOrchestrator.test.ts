import { describe, expect, it, vi } from 'vitest';
import { createInitialCharacterState } from '@our-companion/character-engine';
import type { Discovery } from '@our-companion/shared';
import { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';

function sampleDiscovery(id: string, overrides?: Partial<Discovery>): Discovery {
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
    sharedAt: new Date().toISOString(),
    ...overrides
  };
}

function createDeps(overrides?: { canAnnounce?: () => boolean; shouldInterruptShare?: () => boolean }) {
  let current = createInitialCharacterState();
  return {
    getState: () => current,
    saveState: (state: typeof current) => { current = state; return state; },
    generateReason: async () => ({
      why_this_matters: 'Useful', recommended_action: 'view' as const,
      short_message: 'Found something.', card_title: 'T', card_body: 'B.', tags: ['frontend']
    }),
    markAnnounced: vi.fn(),
    canAnnounce: overrides?.canAnnounce ?? (() => true),
    shouldInterruptShare: overrides?.shouldInterruptShare ?? (() => false)
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
      generateReason: async () => ({ why_this_matters: 'U', recommended_action: 'view', short_message: 'F.', card_title: 'T', card_body: 'B.', tags: [] }),
      markAnnounced: vi.fn(),
      canAnnounce: () => true,
      shouldInterruptShare: () => false
    });

    orchestrator.enqueue(sampleDiscovery('d1'));
    await vi.runAllTimersAsync();
    expect(states).toEqual(['sharing_discovery:thinking', 'sharing_discovery:discovering', 'sharing_discovery:talking', 'sharing_discovery:idle', 'waiting:idle']);
    vi.useRealTimers();
  });

  it('FIFO queue processes in order', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const markAnnounced = vi.fn();
    const orchestrator = new DiscoveryShareOrchestrator({ ...createDeps(), markAnnounced });

    orchestrator.enqueue(sampleDiscovery('d1'));
    orchestrator.enqueue(sampleDiscovery('d2'));
    orchestrator.enqueue(sampleDiscovery('d3'));
    await vi.runAllTimersAsync();

    expect(markAnnounced).toHaveBeenCalledTimes(3);
    expect(markAnnounced.mock.calls.map((c: unknown[]) => c[0])).toEqual(['d1', 'd2', 'd3']);
    vi.useRealTimers();
  });

  it('rejects duplicate by id', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const markAnnounced = vi.fn();
    const orchestrator = new DiscoveryShareOrchestrator({ ...createDeps(), markAnnounced });

    orchestrator.enqueue(sampleDiscovery('dup'));
    await vi.runAllTimersAsync();
    expect(orchestrator.enqueue(sampleDiscovery('dup'))).toBe(false);
    expect(markAnnounced).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('rejects duplicate by canonical URL', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const orchestrator = new DiscoveryShareOrchestrator(createDeps());

    orchestrator.enqueue(sampleDiscovery('d1', { url: 'https://example.com/article' }));
    expect(orchestrator.enqueue(sampleDiscovery('d2', { url: 'https://example.com/article?utm_source=test' }))).toBe(false);
    vi.useRealTimers();
  });

  it('rejects duplicate by normalized title + source', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const orchestrator = new DiscoveryShareOrchestrator(createDeps());

    orchestrator.enqueue(sampleDiscovery('d1', { title: ' PixiJS Desktop Pet Guide ' }));
    expect(orchestrator.enqueue(sampleDiscovery('d2', { title: 'pixijs desktop pet guide!' }))).toBe(false);
    vi.useRealTimers();
  });

  it('interrupted discovery exhausts retries then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const orchestrator = new DiscoveryShareOrchestrator({ ...createDeps(), shouldInterruptShare: () => true });

    orchestrator.enqueue(sampleDiscovery('give_up'));
    await vi.runAllTimersAsync();

    const entry = orchestrator.getQueue().find((q) => q.discovery.id === 'give_up');
    expect(entry?.retryCount).toBeGreaterThanOrEqual(1);
    expect(['interrupted', 'deferred']).toContain(entry?.status);
    expect(orchestrator.getLastAnnouncedId()).toBeUndefined();
    vi.useRealTimers();
  });

  it('partial interrupts leave deferred entry with correct state', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let count = 0;
    const orchestrator = new DiscoveryShareOrchestrator({
      ...createDeps(),
      shouldInterruptShare: () => { count++; return count <= 2; }
    });

    orchestrator.enqueue(sampleDiscovery('partial'));
    await vi.runAllTimersAsync();

    expect(count).toBeGreaterThanOrEqual(1);
    const entry = orchestrator.getQueue().find((q) => q.discovery.id === 'partial');
    expect(entry?.interruptCount).toBeGreaterThanOrEqual(1);
    expect(entry?.retryAfterAt).toBeGreaterThan(Date.now());
    vi.useRealTimers();
  });

  it('queue resumes when canAnnounce becomes true', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let canAnnounce = false;
    const markAnnounced = vi.fn();
    const orchestrator = new DiscoveryShareOrchestrator({ ...createDeps(), canAnnounce: () => canAnnounce, markAnnounced });

    orchestrator.enqueue(sampleDiscovery('wait'));
    await vi.advanceTimersByTimeAsync(500);
    expect(orchestrator.isBusy()).toBe(false);

    canAnnounce = true;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(markAnnounced).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('clearQueue empties the queue', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const orchestrator = new DiscoveryShareOrchestrator(createDeps());

    orchestrator.enqueue(sampleDiscovery('a'));
    orchestrator.enqueue(sampleDiscovery('b'));
    orchestrator.clearQueue();
    expect(orchestrator.getQueueLength()).toBe(0);
    vi.useRealTimers();
  });

  it('reports lastAnnouncedId after completion', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const orchestrator = new DiscoveryShareOrchestrator(createDeps());

    expect(orchestrator.getLastAnnouncedId()).toBeUndefined();
    orchestrator.enqueue(sampleDiscovery('done'));
    await vi.runAllTimersAsync();
    expect(orchestrator.getLastAnnouncedId()).toBe('done');
    vi.useRealTimers();
  });

  it('isProcessing reports single loop guard', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const orchestrator = new DiscoveryShareOrchestrator(createDeps());

    expect(orchestrator.isProcessing()).toBe(false);
    orchestrator.enqueue(sampleDiscovery('p1'));
    await vi.runAllTimersAsync();
    expect(orchestrator.isProcessing()).toBe(false);
    vi.useRealTimers();
  });

  it('interrupted discovery gets deferred with cooldown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const orchestrator = new DiscoveryShareOrchestrator({
      ...createDeps(),
      shouldInterruptShare: () => true
    });

    orchestrator.enqueue(sampleDiscovery('defer'));
    await vi.runAllTimersAsync();

    const queue = orchestrator.getQueue();
    const entry = queue.find((q) => q.discovery.id === 'defer');
    expect(entry?.status).toBe('deferred');
    expect(entry?.interruptCount).toBe(1);
    expect(entry?.retryAfterAt).toBeGreaterThan(Date.now());
    vi.useRealTimers();
  });

  it('duplicate enqueue returns false with skip reason', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const orchestrator = new DiscoveryShareOrchestrator(createDeps());

    orchestrator.enqueue(sampleDiscovery('reason_test'));
    const result = orchestrator.enqueue(sampleDiscovery('reason_test'));
    expect(result).toBe(false);
    expect(orchestrator.getLastSkipReason()).toBe('duplicate');
    vi.useRealTimers();
  });
});
