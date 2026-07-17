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

function createPresentationGateway() {
  return {
    isBusy: vi.fn(() => false),
    hasPending: vi.fn(() => false),
    requestPresentation: vi.fn()
  };
}

describe('DiscoveryScheduler', () => {
  it('queues exactly one when 10 discoveries are generated', async () => {
    vi.useFakeTimers();
    const ten = Array.from({ length: 10 }, (_, i) => sampleDiscovery(`gen_${i}`));
    const refresh = vi.fn(async () => ({ discoveries: ten, newlyInserted: ten }));
    const presentationGateway = createPresentationGateway();
    const getOldestUnannouncedShared = vi.fn(async () => null);

    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      getOldestUnannouncedShared,
      presentationGateway
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    scheduler.stop();

    expect(presentationGateway.requestPresentation).toHaveBeenCalledTimes(1);
    const requested = (presentationGateway.requestPresentation.mock.calls as unknown[][])[0]![0] as Discovery;
    expect(requested.id).toBe('gen_0');

    vi.useRealTimers();
  });

  it('queues exactly one when 20 backlog discoveries exist', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
    const oldest = sampleDiscovery('oldest_backlog');
    const getOldestUnannouncedShared = vi.fn(async () => oldest);
    const presentationGateway = createPresentationGateway();

    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      getOldestUnannouncedShared,
      presentationGateway
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    scheduler.stop();

    expect(getOldestUnannouncedShared).toHaveBeenCalledTimes(1);
    expect(presentationGateway.requestPresentation).toHaveBeenCalledTimes(1);
    const requested = (presentationGateway.requestPresentation.mock.calls as unknown[][])[0]![0] as Discovery;
    expect(requested.id).toBe('oldest_backlog');

    vi.useRealTimers();
  });

  it('queues zero when Ann is busy', async () => {
    vi.useFakeTimers();
    const fresh = [sampleDiscovery('fresh1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));
    const presentationGateway = createPresentationGateway();
    presentationGateway.isBusy.mockReturnValue(true);
    const getOldestUnannouncedShared = vi.fn(async () => null);

    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      getOldestUnannouncedShared,
      presentationGateway
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    scheduler.stop();

    expect(presentationGateway.requestPresentation).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('queues zero when a discovery is already pending', async () => {
    vi.useFakeTimers();
    const fresh = [sampleDiscovery('fresh1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));
    const presentationGateway = createPresentationGateway();
    presentationGateway.hasPending.mockReturnValue(true);
    const getOldestUnannouncedShared = vi.fn(async () => null);

    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      getOldestUnannouncedShared,
      presentationGateway
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    scheduler.stop();

    expect(presentationGateway.requestPresentation).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('queues one after speech finishes and next tick runs', async () => {
    vi.useFakeTimers();
    const fresh = [sampleDiscovery('fresh1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));
    const presentationGateway = createPresentationGateway();

    let busy = true;
    presentationGateway.isBusy.mockImplementation(() => busy);

    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      getOldestUnannouncedShared: async () => null,
      presentationGateway
    });

    scheduler.start();

    // First tick — Ann is busy, nothing queued
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
    expect(presentationGateway.requestPresentation).not.toHaveBeenCalled();

    // Ann finishes speaking
    busy = false;

    // Next tick fires after mocked 100ms delay
    await vi.advanceTimersByTimeAsync(100);
    scheduler.stop();

    expect(presentationGateway.requestPresentation).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('does not request another discovery while the gateway has a pending presentation', async () => {
    vi.useFakeTimers();
    const presentationGateway = createPresentationGateway();

    const fresh = [sampleDiscovery('dup1')];
    const refresh = vi.fn(async () => ({ discoveries: fresh, newlyInserted: fresh }));

    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 35,
      countSharedToday: () => 0,
      getOldestUnannouncedShared: async () => null,
      presentationGateway
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);

    expect(presentationGateway.requestPresentation).toHaveBeenCalledTimes(1);

    presentationGateway.hasPending.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(100);
    scheduler.stop();

    expect(presentationGateway.requestPresentation).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
