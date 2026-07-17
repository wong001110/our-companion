import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompanionCommand, CompanionDecision, Discovery } from '@our-companion/shared';
import { AppServices } from './services';
import type { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => ':memory:') },
  dialog: {},
}));

function discovery(id: string): Discovery {
  return {
    id,
    source: 'github',
    title: `Discovery ${id}`,
    tags: ['handoff'],
    raw: {},
    userInterestScore: 80,
    userHistoryScore: 70,
    characterExpertiseScore: 75,
    noveltyScore: 70,
    usefulnessScore: 65,
    finalScore: 75,
    status: 'shared',
    createdAt: new Date().toISOString(),
  };
}

function decision(timing: CompanionDecision['timing'], action: CompanionDecision['action'] = 'share_discovery'): CompanionDecision {
  return {
    id: `decision-${timing}`,
    action,
    timing,
    priority: 'normal',
    reason: 'test',
    displayHint: timing === 'now' ? 'present_discovery' : 'show_soft_hint',
    createdAt: new Date().toISOString(),
  };
}

const openServices: AppServices[] = [];

afterEach(() => {
  for (const services of openServices.splice(0)) services.db.close();
});

describe('AppServices Discovery presentation gateway', () => {
  it('evaluates a selected Discovery once and retains next_idle as pending', () => {
    const services = new AppServices(':memory:');
    openServices.push(services);
    const runtime = (services as unknown as {
      companionRuntime: { decideForDiscovery: (value: Discovery, sessionActive: boolean, dragging: boolean) => CompanionDecision };
    }).companionRuntime;
    const decideForDiscovery = vi.spyOn(runtime, 'decideForDiscovery').mockReturnValue(decision('next_idle'));
    const selected = discovery('deferred');

    expect(services.requestDiscoveryPresentation(selected).timing).toBe('next_idle');
    expect(services.requestDiscoveryPresentation(selected).timing).toBe('next_idle');
    expect(decideForDiscovery).toHaveBeenCalledTimes(1);
    expect(services.hasPendingDiscoveryPresentation()).toBe(true);
  });

  it('ignores a non-presentable result and removes it from the shared backlog', () => {
    const services = new AppServices(':memory:');
    openServices.push(services);
    const selected = discovery('later');
    services.db.insertDiscovery(selected);
    const runtime = (services as unknown as {
      companionRuntime: { decideForDiscovery: (value: Discovery, sessionActive: boolean, dragging: boolean) => CompanionDecision };
    }).companionRuntime;
    vi.spyOn(runtime, 'decideForDiscovery').mockReturnValue(decision('later', 'stay_silent'));

    services.requestDiscoveryPresentation(selected);

    expect(services.db.getDiscovery(selected.id)?.status).toBe('candidate');
    expect(services.hasPendingDiscoveryPresentation()).toBe(false);
  });

  it('starts payload preparation exactly once for the accepted authoritative command', () => {
    const services = new AppServices(':memory:');
    openServices.push(services);
    const selected = discovery('immediate');
    services.db.insertDiscovery(selected);
    const enqueue = vi.fn(() => true);
    services.attachShareOrchestrator({ enqueue, isBusy: () => false, hasPending: () => false } as unknown as DiscoveryShareOrchestrator);
    const command: CompanionCommand = {
      id: 'command-immediate',
      companionId: 'companion',
      discoveryId: selected.id,
      decision: decision('now'),
      issuedAt: new Date().toISOString(),
    };
    const internals = services as unknown as { tryStartDiscoveryPayload(value: CompanionCommand): void };

    internals.tryStartDiscoveryPayload(command);
    internals.tryStartDiscoveryPayload(command);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ id: selected.id }));
  });
});
