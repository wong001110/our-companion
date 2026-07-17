import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompanionCommand, CompanionDecision, Discovery } from '@our-companion/shared';
import { AppServices } from './services';
import type { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => ':memory:') },
  dialog: {}
}));

function discovery(id: string, status: Discovery['status'] = 'candidate'): Discovery {
  return {
    id,
    companionId: 'companion',
    source: 'github',
    title: `Discovery ${id}`,
    tags: ['handoff'],
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

function decision(
  timing: CompanionDecision['timing'],
  action: CompanionDecision['action'] = 'share_discovery'
): CompanionDecision {
  return {
    id: `decision-${timing}`,
    action,
    timing,
    priority: 'normal',
    reason: 'test',
    displayHint: timing === 'now' ? 'present_discovery' : 'show_soft_hint',
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

const openServices: AppServices[] = [];

afterEach(() => {
  for (const services of openServices.splice(0)) services.db.close();
});

function createServices(): AppServices {
  const services = new AppServices(':memory:');
  openServices.push(services);
  return services;
}

describe('AppServices discovery presentation lifecycle gateway', () => {
  it('moves candidate → eligible → queued and evaluates a retained next-idle decision only once', () => {
    const services = createServices();
    const selected = discovery('deferred');
    services.db.insertDiscovery(selected);
    services.db.transitionDiscoveryStatus(selected.id, 'eligible', {
      companionId: selected.companionId,
      reason: 'passed eligibility'
    });
    const decideForDiscovery = vi
      .spyOn(services.runtime, 'decideForDiscovery')
      .mockReturnValue(decision('next_idle'));

    expect(services.requestDiscoveryPresentation(
      services.db.getDiscovery(selected.id)!
    ).timing).toBe('next_idle');
    expect(services.requestDiscoveryPresentation(
      services.db.getDiscovery(selected.id)!
    ).timing).toBe('next_idle');

    expect(decideForDiscovery).toHaveBeenCalledOnce();
    expect(services.db.getDiscovery(selected.id)).toEqual(expect.objectContaining({
      status: 'queued',
      companionId: 'companion',
      statusReason: 'decision_deferred_until_idle'
    }));
    expect(services.hasPendingDiscoveryPresentation()).toBe(true);
  });

  it('keeps a non-presentable discovery eligible and out of the presentation queue', () => {
    const services = createServices();
    const selected = discovery('later', 'eligible');
    services.db.insertDiscovery(selected);
    vi.spyOn(services.runtime, 'decideForDiscovery')
      .mockReturnValue(decision('later', 'stay_silent'));

    services.requestDiscoveryPresentation(selected);

    expect(services.db.getDiscovery(selected.id)?.status).toBe('eligible');
    expect(services.hasPendingDiscoveryPresentation()).toBe(false);
  });

  it('starts payload preparation exactly once with the authoritative command and discovery', () => {
    const services = createServices();
    const selected = discovery('immediate', 'eligible');
    services.db.insertDiscovery(selected);
    vi.spyOn(services.runtime, 'decideForDiscovery').mockReturnValue(decision('now'));
    services.requestDiscoveryPresentation(selected);

    const enqueue = vi.fn(() => true);
    services.attachShareOrchestrator({
      enqueue,
      isBusy: () => false,
      hasPending: () => false
    } as unknown as DiscoveryShareOrchestrator);
    const command: CompanionCommand = {
      id: 'command-immediate',
      companionId: 'companion',
      discoveryId: selected.id,
      decision: decision('now'),
      issuedAt: '2026-01-01T00:00:01.000Z'
    };
    const internals = services as unknown as {
      tryStartDiscoveryPayload(value: CompanionCommand): void;
    };

    internals.tryStartDiscoveryPayload(command);
    internals.tryStartDiscoveryPayload(command);

    expect(enqueue).toHaveBeenCalledOnce();
    expect(services.db.getDiscovery(selected.id)?.status).toBe('queued');
    expect(enqueue).toHaveBeenCalledWith(
      command,
      expect.objectContaining({ id: selected.id })
    );
  });
});
