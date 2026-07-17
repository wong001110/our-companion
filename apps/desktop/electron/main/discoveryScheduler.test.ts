import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Discovery } from '@our-companion/shared';
import { DISCOVERY_STARTUP_DELAY_MS } from '@our-companion/discovery-engine';
import { DiscoveryScheduler } from './discoveryScheduler';

function sampleDiscovery(id: string, status: Discovery['status'] = 'eligible'): Discovery {
  return {
    id,
    companionId: 'test-companion',
    source: 'github',
    title: `Discovery ${id}`,
    tags: ['frontend'],
    raw: {},
    userInterestScore: 0.8,
    userHistoryScore: 0.7,
    characterExpertiseScore: 0.75,
    noveltyScore: 0.7,
    usefulnessScore: 0.65,
    finalScore: 0.75,
    status,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function presentationGateway() {
  return {
    isBusy: vi.fn(() => false),
    hasPending: vi.fn(() => false),
    requestPresentation: vi.fn()
  };
}

function deps(overrides: Partial<ConstructorParameters<typeof DiscoveryScheduler>[0]> = {}) {
  return {
    refresh: vi.fn(async () => ({ discoveries: [], newlyInserted: [] })),
    getDiscoveryScore: vi.fn(() => 0.5),
    countAnnouncedToday: vi.fn(() => 0),
    getOldestQueuedDiscovery: vi.fn(async () => null),
    presentationGateway: presentationGateway(),
    ...overrides
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DiscoveryScheduler', () => {
  it('waits the full injected 90-second startup boundary: 89 seconds is zero ticks, then 1 second is one', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
    const setTimer = vi.fn((callback: (...args: unknown[]) => void, delay?: number) =>
      setTimeout(callback, delay)
    ) as unknown as typeof setTimeout;
    const clearTimer = vi.fn((timer: ReturnType<typeof setTimeout>) =>
      clearTimeout(timer)
    ) as unknown as typeof clearTimeout;
    const scheduler = new DiscoveryScheduler(deps({ refresh, setTimer, clearTimer }));

    scheduler.start();
    expect(DISCOVERY_STARTUP_DELAY_MS).toBe(90_000);
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 90_000);

    await vi.advanceTimersByTimeAsync(89_000);
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(refresh).toHaveBeenCalledOnce();

    scheduler.stop();
    expect(clearTimer).toHaveBeenCalledOnce();
  });

  it('presents exactly one eligible discovery from a healthy provider refresh', async () => {
    const first = sampleDiscovery('eligible-first');
    const second = sampleDiscovery('eligible-second');
    const refresh = vi.fn(async () => ({
      discoveries: [first, second],
      newlyInserted: [first, second]
    }));
    const gateway = presentationGateway();
    const scheduler = new DiscoveryScheduler(deps({
      refresh,
      presentationGateway: gateway
    }));

    const result = await scheduler.runOnce();

    expect(result).toEqual({
      status: 'completed',
      presentedDiscoveryId: first.id
    });
    expect(gateway.requestPresentation).toHaveBeenCalledOnce();
    expect(gateway.requestPresentation).toHaveBeenCalledWith(first);
  });

  it('completes empty safely when a healthy provider returns no valid discoveries', async () => {
    const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
    const gateway = presentationGateway();
    const scheduler = new DiscoveryScheduler(deps({
      refresh,
      presentationGateway: gateway
    }));

    await expect(scheduler.runOnce()).resolves.toEqual({
      status: 'empty',
      reason: 'no_valid_discoveries'
    });
    expect(gateway.requestPresentation).not.toHaveBeenCalled();
  });

  it('reports provider failure safely without scheduling a presentation', async () => {
    const refresh = vi.fn(async () => {
      throw new Error('provider unavailable');
    });
    const gateway = presentationGateway();
    const scheduler = new DiscoveryScheduler(deps({
      refresh,
      presentationGateway: gateway
    }));

    await expect(scheduler.runOnce()).resolves.toEqual({
      status: 'failed',
      error: 'provider unavailable'
    });
    expect(gateway.requestPresentation).not.toHaveBeenCalled();
  });

  it('presents the oldest queued discovery after the daily announcement cap', async () => {
    const oldest = sampleDiscovery('oldest-queued', 'queued');
    const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
    const getOldestQueuedDiscovery = vi.fn(async () => oldest);
    const gateway = presentationGateway();
    const scheduler = new DiscoveryScheduler(deps({
      refresh,
      countAnnouncedToday: () => 10,
      getOldestQueuedDiscovery,
      presentationGateway: gateway
    }));

    const result = await scheduler.runOnce();

    expect(refresh).not.toHaveBeenCalled();
    expect(getOldestQueuedDiscovery).toHaveBeenCalledOnce();
    expect(gateway.requestPresentation).toHaveBeenCalledWith(oldest);
    expect(result.presentedDiscoveryId).toBe(oldest.id);
  });

  it.each([
    ['busy', { busy: true, pending: false }],
    ['pending', { busy: false, pending: true }]
  ])('skips refresh while the presentation gateway is %s', async (_label, state) => {
    const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
    const gateway = presentationGateway();
    gateway.isBusy.mockReturnValue(state.busy);
    gateway.hasPending.mockReturnValue(state.pending);
    const scheduler = new DiscoveryScheduler(deps({
      refresh,
      presentationGateway: gateway
    }));

    await expect(scheduler.runOnce()).resolves.toEqual({
      status: 'skipped',
      reason: 'presentation_busy'
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(gateway.requestPresentation).not.toHaveBeenCalled();
  });
});
