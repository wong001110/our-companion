import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CompanionCommand,
  CompanionDecision,
  Discovery,
  DiscoveryReason
} from '@our-companion/shared';
import { AppServices } from './services';
import { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';

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

afterEach(async () => {
  await Promise.all(openServices.splice(0).map((services) => services.dispose()));
});

function createServices(now?: () => Date): AppServices {
  const services = new AppServices(':memory:', undefined, now ? { now } : {});
  openServices.push(services);
  return services;
}

function initializeCompanion(services: AppServices): string {
  const companion = services.db.createCompanion({
    name: 'Presentation Test Companion',
    personalityDescription: 'Deterministic presentation lifecycle fixture.',
    personalityAnalysisId: 'presentation-fixture',
    personality: {
      energy: 50,
      curiosity: 70,
      sociability: 50,
      diligence: 70,
      playfulness: 50,
      confidence: 60,
      calmness: 70,
      shyness: 30
    },
    assetRoot: 'companion://presentation-test/assets'
  });
  services.db.setPrimaryCompanion(companion.id);
  return companion.id;
}

describe('AppServices discovery presentation lifecycle gateway', () => {
  it('moves candidate → eligible → queued and evaluates a retained next-idle decision only once', () => {
    const services = createServices();
    const companionId = initializeCompanion(services);
    const selected = { ...discovery('deferred'), companionId };
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
      companionId,
      statusReason: 'decision_deferred_until_idle'
    }));
    expect(services.hasPendingDiscoveryPresentation()).toBe(true);
  });

  it('keeps a non-presentable discovery eligible and out of the presentation queue', () => {
    const services = createServices();
    const companionId = initializeCompanion(services);
    const selected = { ...discovery('later', 'eligible'), companionId };
    services.db.insertDiscovery(selected);
    vi.spyOn(services.runtime, 'decideForDiscovery')
      .mockReturnValue(decision('later', 'stay_silent'));

    services.requestDiscoveryPresentation(selected);

    expect(services.db.getDiscovery(selected.id)?.status).toBe('eligible');
    expect(services.hasPendingDiscoveryPresentation()).toBe(false);
  });

  it('reuses a later decision during backoff, then reevaluates it into a presentable decision', () => {
    let currentTime = Date.parse('2026-01-01T00:00:00.000Z');
    const services = createServices(() => new Date(currentTime));
    const companionId = initializeCompanion(services);
    const selected = { ...discovery('reevaluate-later', 'eligible'), companionId };
    services.db.insertDiscovery(selected);
    const decideForDiscovery = vi
      .spyOn(services.runtime, 'decideForDiscovery')
      .mockReturnValueOnce(decision('later', 'stay_silent'))
      .mockReturnValueOnce(decision('now'));

    expect(services.requestDiscoveryPresentation(selected).timing).toBe('later');
    expect(services.requestDiscoveryPresentation(selected).timing).toBe('later');
    expect(decideForDiscovery).toHaveBeenCalledOnce();
    expect(services.db.getDiscovery(selected.id)?.status).toBe('eligible');
    expect(services.hasPendingDiscoveryPresentation()).toBe(false);

    currentTime += (2 * 60 * 1000) - 1;
    expect(services.requestDiscoveryPresentation(
      services.db.getDiscovery(selected.id)!
    ).timing).toBe('later');
    expect(decideForDiscovery).toHaveBeenCalledOnce();

    currentTime += 1;
    expect(services.requestDiscoveryPresentation(
      services.db.getDiscovery(selected.id)!
    ).timing).toBe('now');

    expect(decideForDiscovery).toHaveBeenCalledTimes(2);
    expect(services.db.getDiscovery(selected.id)?.status).toBe('queued');
    expect(services.hasPendingDiscoveryPresentation()).toBe(true);
  });

  it('starts payload preparation exactly once with the authoritative command and discovery', () => {
    const services = createServices();
    const companionId = initializeCompanion(services);
    const selected = { ...discovery('immediate', 'eligible'), companionId };
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
      companionId,
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

  it.each(['dragging', 'active-conversation'] as const)(
    'settles an interrupted preparation through AppServices for %s',
    async (interruptKind) => {
      const services = createServices();
      const companionId = initializeCompanion(services);
      const selected = {
        ...discovery(`authoritative-${interruptKind}`, 'eligible'),
        companionId
      };
      services.db.insertDiscovery(selected);
      const queued = services.db.transitionDiscoveryStatus(selected.id, 'queued', {
        companionId,
        reason: 'integration_test'
      });
      const command = {
        id: `command-${interruptKind}`,
        companionId,
        discoveryId: queued.id,
        decision: decision('now'),
        issuedAt: '2026-01-01T00:00:01.000Z'
      } satisfies CompanionCommand;
      let resolveReason!: (reason: DiscoveryReason) => void;
      const generateReason = vi.fn(() => new Promise<DiscoveryReason>((resolve) => {
        resolveReason = resolve;
      }));
      const beginPresentation = vi.spyOn(
        services.runtime,
        'beginDiscoveryPresentation'
      );
      const settlePresentation = vi.spyOn(
        services.runtime,
        'settleDiscoveryPresentation'
      );
      const orchestrator = new DiscoveryShareOrchestrator({
        performance: {
          begin: (id) => {
            services.runtime.beginDiscoveryPresentation(id);
          },
          settle: (id) => {
            services.runtime.settleDiscoveryPresentation(id);
          }
        },
        generateReason,
        settleCommand: (activeCommand, status, reason) =>
          services.settleDiscoveryPresentationCommand(
            activeCommand,
            status,
            reason
          ),
        markPresenting: (id, commandId) => {
          services.db.transitionDiscoveryStatus(id, 'presenting', { commandId });
        },
        markAnnounced: (id, commandId) => {
          services.db.transitionDiscoveryStatus(id, 'announced', { commandId });
        },
        markDeferred: (id, reason) => {
          services.db.transitionDiscoveryStatus(id, 'eligible', { reason });
        },
        canAnnounce: () => services.canAnnounceDiscovery(),
        shouldInterruptShare: () => services.shouldInterruptShare()
      });
      services.attachShareOrchestrator(orchestrator);
      const internals = services as unknown as {
        tryActivateCommand(value: CompanionCommand): boolean;
        tryStartDiscoveryPayload(value: CompanionCommand): void;
      };

      expect(internals.tryActivateCommand(command)).toBe(true);
      internals.tryStartDiscoveryPayload(command);
      await vi.waitFor(() => {
        expect(generateReason).toHaveBeenCalledOnce();
        expect(beginPresentation).toHaveBeenCalledOnce();
        expect(orchestrator.getQueue()[0]?.status).toBe('presenting');
      });

      if (interruptKind === 'dragging') {
        await services.companion.reportDragging({ dragging: true });
      } else {
        await services.companion.reportSessionPhase('talking');
      }
      resolveReason({
        why_this_matters: 'Useful',
        recommended_action: 'view',
        short_message: 'Found something.',
        tags: []
      });

      await vi.waitFor(async () => {
        expect(await services.companion.getActiveCommand()).toBeNull();
        expect(orchestrator.getQueue()).toEqual([]);
      });
      expect(settlePresentation).toHaveBeenCalledOnce();
      expect(services.db.getDiscovery(queued.id)).toEqual(expect.objectContaining({
        status: 'eligible',
        statusReason: 'interrupted_during_preparation',
        announcedAt: undefined
      }));
      expect(services.db.countAnnouncedToday(companionId)).toBe(0);
      const terminalEvents = (await services.debug.getFoundationLog({
        source: 'companion',
        limit: 20
      })).filter((event) =>
        event.type === 'CompanionCommandAck' &&
        (event.payload as { commandId?: string }).commandId === command.id
      );
      expect(terminalEvents).toHaveLength(1);
      expect(terminalEvents[0].payload).toEqual(expect.objectContaining({
        status: 'cancelled',
        reason: 'interrupted_during_preparation'
      }));

      if (interruptKind === 'dragging') {
        await services.companion.reportDragging({ dragging: false });
      } else {
        await services.companion.reportSessionPhase('idle');
      }
      const subsequent = {
        ...command,
        id: `subsequent-${interruptKind}`,
        discoveryId: undefined
      };
      expect(internals.tryActivateCommand(subsequent)).toBe(true);
      expect((await services.companion.getActiveCommand())?.id)
        .toBe(subsequent.id);
    }
  );
});
