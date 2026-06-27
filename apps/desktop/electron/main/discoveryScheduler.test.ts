import { describe, expect, it, vi } from 'vitest';
import type { Discovery } from '@our-companion/shared';
import { DISCOVERY_STARTUP_DELAY_MS } from '@our-companion/discovery-engine';
import { DiscoveryScheduler } from './discoveryScheduler';

describe('DiscoveryScheduler', () => {
  it('uses startup delay for the first scheduled tick', () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
    const shareOrchestrator = { enqueue: vi.fn() };

    const scheduler = new DiscoveryScheduler({
      refresh,
      listUnannouncedShared: () => [],
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      shareOrchestrator
    });

    scheduler.start();
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DISCOVERY_STARTUP_DELAY_MS - 1);
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    vi.runOnlyPendingTimers();

    scheduler.stop();
    vi.useRealTimers();
  });

  it('skips refresh at cap and enqueues exactly one backlog item', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
    const listUnannouncedShared = vi.fn(() => [sampleDiscovery('b1'), sampleDiscovery('b2'), sampleDiscovery('b3')]);
    const shareOrchestrator = { enqueue: vi.fn() };

    const scheduler = new DiscoveryScheduler({
      refresh,
      listUnannouncedShared,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 10,
      shareOrchestrator
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);

    expect(refresh).not.toHaveBeenCalled();
    expect(listUnannouncedShared).toHaveBeenCalledWith(1);
    expect(shareOrchestrator.enqueue).toHaveBeenCalledTimes(1);
    const enqueued = shareOrchestrator.enqueue.mock.calls[0][0];
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].id).toBe('b1');

    scheduler.stop();
    vi.useRealTimers();
  });

  it('enqueues only one discovery per tick even when multiple are newly inserted', async () => {
    vi.useFakeTimers();
    const multi = [sampleDiscovery('d1'), sampleDiscovery('d2'), sampleDiscovery('d3')];
    const refresh = vi.fn(async () => ({ discoveries: multi, newlyInserted: multi }));
    const shareOrchestrator = { enqueue: vi.fn() };

    const scheduler = new DiscoveryScheduler({
      refresh,
      listUnannouncedShared: () => [],
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      shareOrchestrator
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);

    expect(shareOrchestrator.enqueue).toHaveBeenCalledTimes(1);
    const enqueued = shareOrchestrator.enqueue.mock.calls[0][0];
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].id).toBe('d1');

    scheduler.stop();
    vi.useRealTimers();
  });

  it('prefers newly inserted over backlog and does not enqueue both', async () => {
    vi.useFakeTimers();
    const fresh = [sampleDiscovery('fresh1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));
    const shareOrchestrator = { enqueue: vi.fn() };

    const scheduler = new DiscoveryScheduler({
      refresh,
      listUnannouncedShared: () => [sampleDiscovery('old1'), sampleDiscovery('old2')],
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      shareOrchestrator
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);

    expect(shareOrchestrator.enqueue).toHaveBeenCalledTimes(1);
    const enqueued = shareOrchestrator.enqueue.mock.calls[0][0];
    expect(enqueued[0].id).toBe('fresh1');

    scheduler.stop();
    vi.useRealTimers();
  });

  it('enqueues exactly one backlog item when no new discoveries arrive', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
    const shareOrchestrator = { enqueue: vi.fn() };

    const scheduler = new DiscoveryScheduler({
      refresh,
      listUnannouncedShared: () => [sampleDiscovery('b1'), sampleDiscovery('b2'), sampleDiscovery('b3')],
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      shareOrchestrator
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);

    expect(shareOrchestrator.enqueue).toHaveBeenCalledTimes(1);
    const enqueued = shareOrchestrator.enqueue.mock.calls[0][0];
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].id).toBe('b1');

    scheduler.stop();
    vi.useRealTimers();
  });

  it('does not enqueue when there are no new discoveries and no backlog', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
    const shareOrchestrator = { enqueue: vi.fn() };

    const scheduler = new DiscoveryScheduler({
      refresh,
      listUnannouncedShared: () => [],
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      shareOrchestrator
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);

    expect(shareOrchestrator.enqueue).not.toHaveBeenCalled();

    scheduler.stop();
    vi.useRealTimers();
  });
});

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
