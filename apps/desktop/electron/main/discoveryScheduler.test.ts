import { describe, expect, it, vi } from 'vitest';
import type { Discovery } from '@our-companion/shared';
import { DISCOVERY_STARTUP_DELAY_MS } from '@our-companion/discovery-engine';
import { DiscoveryScheduler } from './discoveryScheduler';

vi.mock('@our-companion/discovery-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@our-companion/discovery-engine')>();
  return { ...actual, getDiscoveryFetchDelay: () => 100 };
});

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

function createSelector() {
  return {
    isBusy: vi.fn(() => false),
    hasPending: vi.fn(() => false),
    queue: vi.fn()
  };
}

describe('DiscoveryScheduler', () => {
  it('queues exactly one when 10 discoveries are generated', async () => {
    vi.useFakeTimers();
    const ten = Array.from({ length: 10 }, (_, i) => sampleDiscovery(`gen_${i}`));
    const refresh = vi.fn(async () => ({ discoveries: ten, newlyInserted: ten }));
    const selector = createSelector();
    const listUnannouncedShared = vi.fn(() => []);

    const scheduler = new DiscoveryScheduler({
      refresh,
      listUnannouncedShared,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      selector
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    scheduler.stop();

    expect(selector.queue).toHaveBeenCalledTimes(1);
    const queued = selector.queue.mock.calls[0][0] as Discovery;
    expect(queued.id).toBe('gen_0');

    vi.useRealTimers();
  });

  it('queues exactly one when 20 backlog discoveries exist', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
    const twenty = Array.from({ length: 20 }, (_, i) => sampleDiscovery(`backlog_${i}`));
    const listUnannouncedShared = vi.fn(() => twenty);
    const selector = createSelector();

    const scheduler = new DiscoveryScheduler({
      refresh,
      listUnannouncedShared,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      selector
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    scheduler.stop();

    expect(listUnannouncedShared).toHaveBeenCalledWith(1);
    expect(selector.queue).toHaveBeenCalledTimes(1);
    const queued = selector.queue.mock.calls[0][0] as Discovery;
    expect(queued.id).toBe('backlog_0');

    vi.useRealTimers();
  });

  it('queues zero when Ann is busy', async () => {
    vi.useFakeTimers();
    const fresh = [sampleDiscovery('fresh1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));
    const selector = createSelector();
    selector.isBusy.mockReturnValue(true);

    const scheduler = new DiscoveryScheduler({
      refresh,
      listUnannouncedShared: () => [],
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      selector
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    scheduler.stop();

    expect(selector.queue).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('queues zero when a discovery is already pending', async () => {
    vi.useFakeTimers();
    const fresh = [sampleDiscovery('fresh1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));
    const selector = createSelector();
    selector.hasPending.mockReturnValue(true);

    const scheduler = new DiscoveryScheduler({
      refresh,
      listUnannouncedShared: () => [],
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      selector
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    scheduler.stop();

    expect(selector.queue).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('queues one after speech finishes and next tick runs', async () => {
    vi.useFakeTimers();
    const fresh = [sampleDiscovery('fresh1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));
    const selector = createSelector();

    let busy = true;
    selector.isBusy.mockImplementation(() => busy);

    const scheduler = new DiscoveryScheduler({
      refresh,
      listUnannouncedShared: () => [],
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      selector
    });

    scheduler.start();

    // First tick — Ann is busy, nothing queued
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    expect(selector.queue).not.toHaveBeenCalled();

    // Ann finishes speaking
    busy = false;

    // Next tick fires after mocked 100ms delay
    await vi.advanceTimersByTimeAsync(100);
    scheduler.stop();

    expect(selector.queue).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('ignores duplicate discovery id', async () => {
    vi.useFakeTimers();
    const fresh = [sampleDiscovery('dup1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));
    const selector = createSelector();

    const scheduler = new DiscoveryScheduler({
      refresh,
      listUnannouncedShared: () => [],
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      selector
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);

    // First queue call
    expect(selector.queue).toHaveBeenCalledTimes(1);
    const firstQueued = selector.queue.mock.calls[0][0] as Discovery;
    expect(firstQueued.id).toBe('dup1');

    // Reset for next tick
    selector.hasPending.mockReturnValue(false);
    selector.queue.mockClear();

    // Next tick fires after mocked 100ms delay
    await vi.advanceTimersByTimeAsync(100);
    scheduler.stop();

    expect(selector.queue).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
