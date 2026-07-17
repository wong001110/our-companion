import { describe, expect, it, vi } from 'vitest';
import type { CompanionCommand, Discovery, DiscoveryReason } from '@our-companion/shared';
import { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';

function sampleDiscovery(id: string, overrides: Partial<Discovery> = {}): Discovery {
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
    status: 'queued',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function commandFor(discovery: Discovery, id = `command-${discovery.id}`): CompanionCommand {
  return {
    id,
    companionId: discovery.companionId ?? 'test-companion',
    discoveryId: discovery.id,
    decision: {
      id: `decision-${discovery.id}`,
      action: 'share_discovery',
      timing: 'now',
      priority: 'normal',
      reason: 'eligible discovery',
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    issuedAt: '2026-01-01T00:00:00.000Z'
  };
}

function createDeps(overrides: Partial<ConstructorParameters<typeof DiscoveryShareOrchestrator>[0]> = {}) {
  return {
    performance: {
      begin: vi.fn(),
      settle: vi.fn()
    },
    generateReason: vi.fn(async () => ({
      why_this_matters: 'Useful',
      recommended_action: 'view' as const,
      short_message: 'Found something.',
      card_title: 'A useful find',
      card_body: 'This is worth a look.',
      tags: ['frontend']
    })),
    settleCommand: vi.fn(() => false),
    markPresenting: vi.fn(),
    markAnnounced: vi.fn(),
    markDeferred: vi.fn(),
    canAnnounce: vi.fn(() => true),
    shouldInterruptShare: vi.fn(() => false),
    now: vi.fn(() => '2026-01-01T00:00:01.000Z'),
    ...overrides
  };
}

async function waitUntilPresenting(orchestrator: DiscoveryShareOrchestrator): Promise<void> {
  await vi.waitFor(() => {
    expect(orchestrator.getQueue()[0]?.status).toBe('presenting');
  });
}

describe('DiscoveryShareOrchestrator renderer acknowledgement lifecycle', () => {
  it('moves queued → presenting and announces exactly once only after a completed ACK', async () => {
    const deps = createDeps();
    const orchestrator = new DiscoveryShareOrchestrator(deps);
    const discovery = sampleDiscovery('completed');
    const command = commandFor(discovery);

    expect(orchestrator.enqueue(command, discovery)).toBe(true);
    await waitUntilPresenting(orchestrator);
    expect(deps.performance.begin).toHaveBeenCalledWith('test-companion');
    expect(deps.markAnnounced).not.toHaveBeenCalled();

    expect(orchestrator.acknowledge(command.id, 'started')).toBe(true);
    expect(deps.markPresenting).toHaveBeenCalledOnce();
    expect(deps.markPresenting).toHaveBeenCalledWith(discovery.id, command.id);
    expect(deps.markAnnounced).not.toHaveBeenCalled();

    expect(orchestrator.acknowledge(command.id, 'completed')).toBe(true);
    expect(deps.markAnnounced).toHaveBeenCalledOnce();
    expect(deps.markAnnounced).toHaveBeenCalledWith(discovery.id, command.id);
    expect(deps.performance.settle).toHaveBeenCalledOnce();
    expect(orchestrator.getLastAnnouncedId()).toBe(discovery.id);
    expect(orchestrator.getQueue()).toEqual([]);

    expect(orchestrator.acknowledge(command.id, 'completed')).toBe(false);
    expect(deps.markAnnounced).toHaveBeenCalledOnce();
  });

  it.each(['cancelled', 'failed'] as const)(
    '%s ACK settles presentation, defers the discovery, and never announces it',
    async (status) => {
      const deps = createDeps();
      const orchestrator = new DiscoveryShareOrchestrator(deps);
      const discovery = sampleDiscovery(status);
      const command = commandFor(discovery);

      orchestrator.enqueue(command, discovery);
      await waitUntilPresenting(orchestrator);

      expect(orchestrator.acknowledge(command.id, status, `${status}-by-renderer`)).toBe(true);
      expect(deps.performance.settle).toHaveBeenCalledWith('test-companion');
      expect(deps.markDeferred).toHaveBeenCalledWith(discovery.id, `${status}-by-renderer`);
      expect(deps.markAnnounced).not.toHaveBeenCalled();
      expect(orchestrator.getLastAnnouncedId()).toBeUndefined();
      expect(orchestrator.getQueue()).toEqual([]);
    }
  );

  it('an interruption before presentation defers without beginning or announcing', async () => {
    const deps = createDeps({ shouldInterruptShare: vi.fn(() => true) });
    const orchestrator = new DiscoveryShareOrchestrator(deps);
    const discovery = sampleDiscovery('interrupted-before-start');

    expect(orchestrator.enqueue(commandFor(discovery), discovery)).toBe(true);
    await vi.waitFor(() => {
      expect(deps.markDeferred).toHaveBeenCalledWith(
        discovery.id,
        'interrupted_before_start'
      );
    });

    expect(deps.performance.begin).not.toHaveBeenCalled();
    expect(deps.settleCommand).toHaveBeenCalledWith(
      expect.objectContaining({ discoveryId: discovery.id }),
      'cancelled',
      'interrupted_before_start'
    );
    expect(deps.markPresenting).not.toHaveBeenCalled();
    expect(deps.markAnnounced).not.toHaveBeenCalled();
    expect(orchestrator.getQueue()).toEqual([]);
  });

  it('an interruption during preparation is treated as a cancelled presentation', async () => {
    let interruptChecks = 0;
    const deps = createDeps({
      shouldInterruptShare: vi.fn(() => {
        interruptChecks += 1;
        return interruptChecks > 1;
      })
    });
    const orchestrator = new DiscoveryShareOrchestrator(deps);
    const discovery = sampleDiscovery('interrupted-during-preparation');

    orchestrator.enqueue(commandFor(discovery), discovery);
    await vi.waitFor(() => {
      expect(deps.markDeferred).toHaveBeenCalledWith(
        discovery.id,
        'interrupted_during_preparation'
      );
    });

    expect(deps.performance.begin).toHaveBeenCalledOnce();
    expect(deps.performance.settle).toHaveBeenCalledOnce();
    expect(deps.settleCommand).toHaveBeenCalledWith(
      expect.objectContaining({ discoveryId: discovery.id }),
      'cancelled',
      'interrupted_during_preparation'
    );
    expect(deps.markAnnounced).not.toHaveBeenCalled();
    expect(orchestrator.getQueue()).toEqual([]);
  });

  it('settles a preparation failure through the authoritative command callback', async () => {
    const deps = createDeps({
      generateReason: vi.fn(async () => {
        throw new Error('reason provider failed');
      })
    });
    const orchestrator = new DiscoveryShareOrchestrator(deps);
    const discovery = sampleDiscovery('reason-failure');

    orchestrator.enqueue(commandFor(discovery), discovery);
    await vi.waitFor(() => {
      expect(deps.settleCommand).toHaveBeenCalledWith(
        expect.objectContaining({ discoveryId: discovery.id }),
        'failed',
        'reason provider failed'
      );
    });

    expect(deps.performance.begin).toHaveBeenCalledOnce();
    expect(deps.performance.settle).toHaveBeenCalledOnce();
    expect(deps.markDeferred).toHaveBeenCalledWith(
      discovery.id,
      'reason provider failed'
    );
    expect(deps.markAnnounced).not.toHaveBeenCalled();
    expect(orchestrator.getQueue()).toEqual([]);
  });

  it('settles a cannot-announce deferral through the authoritative command callback', async () => {
    const deps = createDeps({ canAnnounce: vi.fn(() => false) });
    const orchestrator = new DiscoveryShareOrchestrator(deps);
    const discovery = sampleDiscovery('cannot-announce');

    orchestrator.enqueue(commandFor(discovery), discovery);
    await vi.waitFor(() => {
      expect(deps.settleCommand).toHaveBeenCalledWith(
        expect.objectContaining({ discoveryId: discovery.id }),
        'cancelled',
        'cannot_announce'
      );
    });

    expect(deps.performance.begin).not.toHaveBeenCalled();
    expect(deps.markDeferred).toHaveBeenCalledWith(
      discovery.id,
      'cannot_announce'
    );
    expect(deps.markAnnounced).not.toHaveBeenCalled();
    expect(orchestrator.getQueue()).toEqual([]);
  });

  it('rejects duplicate commands and discoveries while one presentation is active', async () => {
    let resolveReason!: (value: DiscoveryReason) => void;
    const deps = createDeps({
      generateReason: vi.fn(() => new Promise<DiscoveryReason>((resolve) => {
        resolveReason = resolve;
      }))
    });
    const orchestrator = new DiscoveryShareOrchestrator(deps);
    const discovery = sampleDiscovery('duplicate');
    const command = commandFor(discovery);

    expect(orchestrator.enqueue(command, discovery)).toBe(true);
    await waitUntilPresenting(orchestrator);
    expect(orchestrator.enqueue(command, discovery)).toBe(false);
    expect(orchestrator.getLastSkipReason()).toBe('duplicate');
    expect(orchestrator.getQueueLength()).toBe(1);

    resolveReason({
      why_this_matters: 'Useful',
      recommended_action: 'view',
      short_message: 'Found something.',
      tags: []
    });
    await vi.waitFor(() => expect(deps.generateReason).toHaveBeenCalledOnce());
  });

  it('rejects already-announced and command-mismatched discoveries', () => {
    const orchestrator = new DiscoveryShareOrchestrator(createDeps());
    const announced = sampleDiscovery('announced', {
      status: 'announced',
      announcedAt: '2026-01-01T00:00:02.000Z'
    });
    expect(orchestrator.enqueue(commandFor(announced), announced)).toBe(false);
    expect(orchestrator.getLastSkipReason()).toBe('already_announced');

    const queued = sampleDiscovery('mismatch');
    expect(orchestrator.enqueue(
      { ...commandFor(queued), discoveryId: 'different-discovery' },
      queued
    )).toBe(false);
    expect(orchestrator.getLastSkipReason()).toBe('command_mismatch');
  });
});
