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
    const markAnnounced = vi.fn();
    const orchestrator = new DiscoveryShareOrchestrator({ ...createDeps(), shouldInterruptShare: () => true, markAnnounced });

    orchestrator.enqueue(sampleDiscovery('give_up'));
    await vi.runAllTimersAsync();

    expect(orchestrator.getLastAnnouncedId()).toBeUndefined();
    expect(markAnnounced).not.toHaveBeenCalled();
    expect(orchestrator.getQueueLength()).toBe(0);
    vi.useRealTimers();
  });

  it('partial interrupts eventually succeed after cooldown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let count = 0;
    const markAnnounced = vi.fn();
    const orchestrator = new DiscoveryShareOrchestrator({
      ...createDeps(),
      shouldInterruptShare: () => { count++; return count <= 2; },
      markAnnounced
    });

    orchestrator.enqueue(sampleDiscovery('partial'));
    await vi.runAllTimersAsync();

    expect(count).toBeGreaterThanOrEqual(1);
    expect(orchestrator.getLastAnnouncedId()).toBe('partial');
    expect(markAnnounced).toHaveBeenCalledWith('partial');
    expect(orchestrator.getQueueLength()).toBe(0);
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

  it('interrupted discovery retries after cooldown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let interruptCount = 0;
    const markAnnounced = vi.fn();
    const orchestrator = new DiscoveryShareOrchestrator({
      ...createDeps(),
      shouldInterruptShare: () => { interruptCount++; return interruptCount <= 1; },
      markAnnounced
    });

    orchestrator.enqueue(sampleDiscovery('defer'));
    await vi.runAllTimersAsync();

    expect(interruptCount).toBeGreaterThanOrEqual(1);
    expect(orchestrator.getLastAnnouncedId()).toBe('defer');
    expect(markAnnounced).toHaveBeenCalledWith('defer');
    expect(orchestrator.getQueueLength()).toBe(0);
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

  it('queue does not grow forever after completions', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const markAnnounced = vi.fn();
    const orchestrator = new DiscoveryShareOrchestrator({ ...createDeps(), markAnnounced });

    orchestrator.enqueue(sampleDiscovery('a'));
    orchestrator.enqueue(sampleDiscovery('b'));
    orchestrator.enqueue(sampleDiscovery('c'));
    await vi.runAllTimersAsync();

    expect(orchestrator.getQueueLength()).toBe(0);
    expect(orchestrator.getQueue()).toHaveLength(0);
    vi.useRealTimers();
  });

  it('deferred entry blocks duplicate enqueue', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const orchestrator = new DiscoveryShareOrchestrator({
      ...createDeps(),
      shouldInterruptShare: () => true
    });

    orchestrator.enqueue(sampleDiscovery('defer_dedup'));
    await vi.advanceTimersByTimeAsync(10_000);

    const entry = orchestrator.getQueue().find((q) => q.discovery.id === 'defer_dedup');
    expect(entry?.status).toBe('deferred');
    expect(orchestrator.enqueue(sampleDiscovery('defer_dedup'))).toBe(false);
    expect(orchestrator.getLastSkipReason()).toBe('duplicate');
    vi.useRealTimers();
  });

  it('deferred-only queue does not call canAnnounce', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const canAnnounce = vi.fn(() => true);
    const orchestrator = new DiscoveryShareOrchestrator({
      ...createDeps(),
      shouldInterruptShare: () => true,
      canAnnounce
    });

    orchestrator.enqueue(sampleDiscovery('no_can'));
    await vi.advanceTimersByTimeAsync(10_000);

    const entry = orchestrator.getQueue().find((q) => q.discovery.id === 'no_can');
    expect(entry?.status).toBe('deferred');

    const callsBefore = canAnnounce.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(canAnnounce.mock.calls.length).toBe(callsBefore);
    vi.useRealTimers();
  });

  it('queued discovery calls canAnnounce', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const canAnnounce = vi.fn(() => true);
    const markAnnounced = vi.fn();
    const orchestrator = new DiscoveryShareOrchestrator({
      ...createDeps(),
      canAnnounce,
      markAnnounced
    });

    orchestrator.enqueue(sampleDiscovery('yes_can'));
    await vi.runAllTimersAsync();
    expect(canAnnounce).toHaveBeenCalled();
    expect(markAnnounced).toHaveBeenCalledWith('yes_can');
    vi.useRealTimers();
  });

  it('nearest retry time selected across deferred entries', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const orchestrator = new DiscoveryShareOrchestrator({
      ...createDeps(),
      shouldInterruptShare: () => true
    });

    orchestrator.enqueue(sampleDiscovery('near1'));
    orchestrator.enqueue(sampleDiscovery('near2'));
    await vi.advanceTimersByTimeAsync(10_000);

    const deferred = orchestrator.getQueue().filter((q) => q.status === 'deferred');
    expect(deferred.length).toBeGreaterThanOrEqual(1);
    const nearestRetryAt = deferred.reduce((min, q) => q.retryAfterAt! < min ? q.retryAfterAt! : min, Infinity);
    expect(orchestrator.getNextRetryAt()).toBe(nearestRetryAt);
    vi.useRealTimers();
  });

  it('clearQueue cancels retry timer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const orchestrator = new DiscoveryShareOrchestrator({
      ...createDeps(),
      shouldInterruptShare: () => true
    });

    orchestrator.enqueue(sampleDiscovery('cancel'));
    await vi.advanceTimersByTimeAsync(10_000);

    const entry = orchestrator.getQueue().find((q) => q.discovery.id === 'cancel');
    expect(entry?.status).toBe('deferred');
    expect(orchestrator.getNextRetryAt()).toBeDefined();

    orchestrator.clearQueue();
    expect(orchestrator.getNextRetryAt()).toBeUndefined();
    expect(orchestrator.getQueueLength()).toBe(0);
    vi.useRealTimers();
  });

  it('announced item removed from queue', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const orchestrator = new DiscoveryShareOrchestrator(createDeps());

    orchestrator.enqueue(sampleDiscovery('removed'));
    await vi.runAllTimersAsync();

    expect(orchestrator.getQueue()).toHaveLength(0);
    expect(orchestrator.getQueueLength()).toBe(0);
    vi.useRealTimers();
  });

  it('interrupted discovery does not replay immediately', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let interruptCount = 0;
    const orchestrator = new DiscoveryShareOrchestrator({
      ...createDeps(),
      shouldInterruptShare: () => { interruptCount++; return interruptCount <= 1; }
    });

    orchestrator.enqueue(sampleDiscovery('no_immediate'));
    await vi.advanceTimersByTimeAsync(10_000);

    const entry = orchestrator.getQueue().find((q) => q.discovery.id === 'no_immediate');
    expect(entry?.status).toBe('deferred');
    expect(entry?.retryAfterAt).toBeGreaterThan(Date.now());
    vi.useRealTimers();
  });

  it('max interrupts stops retrying', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const markAnnounced = vi.fn();
    const orchestrator = new DiscoveryShareOrchestrator({
      ...createDeps(),
      shouldInterruptShare: () => true,
      markAnnounced
    });

    orchestrator.enqueue(sampleDiscovery('exhaust'));
    await vi.runAllTimersAsync();

    expect(markAnnounced).not.toHaveBeenCalled();
    expect(orchestrator.getQueueLength()).toBe(0);
    vi.useRealTimers();
  });
});
