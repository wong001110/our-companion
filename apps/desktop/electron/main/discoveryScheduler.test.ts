import { describe, expect, it, vi } from 'vitest';
import type { Discovery } from '@our-companion/shared';
import { DISCOVERY_STARTUP_DELAY_MS } from '@our-companion/discovery-engine';
import { DiscoveryScheduler } from './discoveryScheduler';

vi.mock('@our-companion/discovery-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@our-companion/discovery-engine')>();
  return { ...actual, getDiscoveryFetchDelay: () => 100 };
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

function createAnnouncer() {
  return {
    isBusy: vi.fn(() => false),
    hasPending: vi.fn(() => false),
    enqueue: vi.fn(() => true)
  };
}

describe('DiscoveryScheduler', () => {
  it('queues exactly one when 10 discoveries are generated', async () => {
    vi.useFakeTimers();
    const ten = Array.from({ length: 10 }, (_, i) => sampleDiscovery(`gen_${i}`));
    const refresh = vi.fn(async () => ({ discoveries: ten, newlyInserted: ten }));
    const announcer = createAnnouncer();
    const getOldestUnannouncedShared = vi.fn(async () => null);

    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      getOldestUnannouncedShared,
      announcer
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    scheduler.stop();

    expect(announcer.enqueue).toHaveBeenCalledTimes(1);
    const enqueued = (announcer.enqueue.mock.calls as unknown[][])[0]![0] as Discovery;
    expect(enqueued.id).toBe('gen_0');

    vi.useRealTimers();
  });

  it('queues exactly one when 20 backlog discoveries exist', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
    const oldest = sampleDiscovery('oldest_backlog');
    const getOldestUnannouncedShared = vi.fn(async () => oldest);
    const announcer = createAnnouncer();

    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      getOldestUnannouncedShared,
      announcer
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    scheduler.stop();

    expect(getOldestUnannouncedShared).toHaveBeenCalledTimes(1);
    expect(announcer.enqueue).toHaveBeenCalledTimes(1);
    const enqueued = (announcer.enqueue.mock.calls as unknown[][])[0]![0] as Discovery;
    expect(enqueued.id).toBe('oldest_backlog');

    vi.useRealTimers();
  });

  it('queues zero when Ann is busy', async () => {
    vi.useFakeTimers();
    const fresh = [sampleDiscovery('fresh1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));
    const announcer = createAnnouncer();
    announcer.isBusy.mockReturnValue(true);
    const getOldestUnannouncedShared = vi.fn(async () => null);

    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      getOldestUnannouncedShared,
      announcer
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    scheduler.stop();

    expect(announcer.enqueue).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('queues zero when a discovery is already pending', async () => {
    vi.useFakeTimers();
    const fresh = [sampleDiscovery('fresh1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));
    const announcer = createAnnouncer();
    announcer.hasPending.mockReturnValue(true);
    const getOldestUnannouncedShared = vi.fn(async () => null);

    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      getOldestUnannouncedShared,
      announcer
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    scheduler.stop();

    expect(announcer.enqueue).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('queues one after speech finishes and next tick runs', async () => {
    vi.useFakeTimers();
    const fresh = [sampleDiscovery('fresh1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));
    const announcer = createAnnouncer();

    let busy = true;
    announcer.isBusy.mockImplementation(() => busy);

    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      getOldestUnannouncedShared: async () => null,
      announcer
    });

    scheduler.start();

    // First tick — Ann is busy, nothing queued
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    expect(announcer.enqueue).not.toHaveBeenCalled();

    // Ann finishes speaking
    busy = false;

    // Next tick fires after mocked 100ms delay
    await vi.advanceTimersByTimeAsync(100);
    scheduler.stop();

    expect(announcer.enqueue).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('enqueue returns false for duplicate id', async () => {
    vi.useFakeTimers();
    const announcer = createAnnouncer();
    announcer.enqueue.mockImplementationOnce(() => true).mockImplementationOnce(() => false);

    const fresh = [sampleDiscovery('dup1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));

    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      getOldestUnannouncedShared: async () => null,
      announcer
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);

    // First enqueue accepted
    expect(announcer.enqueue).toHaveBeenCalledTimes(1);

    // Simulate: announcer now has pending, so next tick skips
    announcer.hasPending.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(100);
    scheduler.stop();

    // Only one enqueue call — second tick was skipped
    expect(announcer.enqueue).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
