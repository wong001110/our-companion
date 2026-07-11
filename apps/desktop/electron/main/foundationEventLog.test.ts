import { describe, expect, it, vi } from 'vitest';
import { createId, nowIso, type CompanionCommand } from '@our-companion/shared';
import { AppServices } from './services';

vi.mock('electron', () => ({
  app: {
    getPath: () => ':memory:'
  }
}));

describe('foundation event log', () => {
  function command(companionId: string): CompanionCommand {
    return {
      id: createId('cmd'), companionId, issuedAt: nowIso(),
      decision: { id: createId('decision'), action: 'share_discovery', timing: 'now', priority: 'normal', reason: 'test', createdAt: nowIso() },
    };
  }

  it('records emitted foundation events and filters by source', async () => {
    const services = new AppServices(':memory:');

    services.emitFoundationEvent('CompanionDecisionMade', 'decision', { action: 'speak' }, 'corr_1');
    services.emitFoundationEvent('CharacterStateChanged', 'character', { coreState: 'idle' });

    const all = await services.debug.getFoundationLog({ limit: 10 });
    expect(all).toHaveLength(2);
    expect(all[0].type).toBe('CharacterStateChanged');

    const decisions = await services.debug.getFoundationLog({ source: 'decision', limit: 10 });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].correlationId).toBe('corr_1');

    services.db.close();
  });

  it('caps the ring buffer at 200 events', async () => {
    const services = new AppServices(':memory:');

    for (let index = 0; index < 205; index += 1) {
      services.emitFoundationEvent('TestEvent', 'discovery', { index });
    }

    const log = await services.debug.getFoundationLog({ limit: 300 });
    expect(log).toHaveLength(200);
    expect((log[0].payload as { index: number }).index).toBe(204);

    services.db.close();
  });

  it('keeps the first command active and records the real issued lifecycle', async () => {
    const services = new AppServices(':memory:');
    const internals = services as unknown as {
      activeCommand: { command: CompanionCommand; latestStatus: string } | null;
      tryActivateCommand(command: CompanionCommand): boolean;
    };
    const activeCompanionId = services.db.resolveActiveCompanionId();
    const first = command(activeCompanionId);
    const second = command(activeCompanionId);

    expect(internals.tryActivateCommand(first)).toBe(true);
    expect(internals.activeCommand?.latestStatus).toBe('issued');
    expect(internals.tryActivateCommand(second)).toBe(false);
    expect(internals.activeCommand?.command.id).toBe(first.id);

    await services.companion.reportCommandAck({ commandId: first.id, companionId: activeCompanionId, status: 'completed', reportedAt: nowIso() });
    expect(internals.activeCommand?.latestStatus).toBe('issued');
    await services.companion.reportCommandAck({ commandId: first.id, companionId: activeCompanionId, status: 'received', reportedAt: nowIso() });
    await services.companion.reportCommandAck({ commandId: first.id, companionId: activeCompanionId, status: 'received', reportedAt: nowIso() });
    await services.companion.reportCommandAck({ commandId: first.id, companionId: activeCompanionId, status: 'started', reportedAt: nowIso() });
    await services.companion.reportCommandAck({ commandId: first.id, companionId: activeCompanionId, status: 'completed', reportedAt: nowIso() });
    expect(internals.activeCommand).toBeNull();
    expect(internals.tryActivateCommand(second)).toBe(true);

    await services.companion.reportCommandAck({ commandId: second.id, companionId: activeCompanionId, status: 'failed', reportedAt: nowIso() });
    expect(internals.activeCommand).toBeNull();
    const third = command(activeCompanionId);
    expect(internals.tryActivateCommand(third)).toBe(true);
    await services.companion.reportCommandAck({ commandId: third.id, companionId: activeCompanionId, status: 'cancelled', reportedAt: nowIso() });
    expect(internals.activeCommand).toBeNull();

    const acknowledgements = (await services.debug.getFoundationLog({ source: 'companion', limit: 10 }))
      .filter((event) => event.type === 'CompanionCommandAck' && (event.payload as { commandId: string }).commandId === first.id);
    expect(acknowledgements.map((event) => (event.payload as { status: string }).status).reverse()).toEqual(['received', 'started', 'completed']);
    services.db.close();
  });

  it('recovers only a non-expired command for the active Companion', async () => {
    const services = new AppServices(':memory:');
    const internals = services as unknown as {
      activeCommand: { command: CompanionCommand; latestStatus: 'issued' | 'received' | 'started'; updatedAt: string; terminal: boolean } | null;
      tryActivateCommand(command: CompanionCommand): boolean;
    };
    const activeCompanionId = services.db.resolveActiveCompanionId();
    const current = command(activeCompanionId);
    internals.tryActivateCommand(current);
    expect((await services.companion.getActiveCommand())?.id).toBe(current.id);

    const activeNonPrimaryId = 'active-non-primary';
    const activeResolver = vi.spyOn(services.db, 'resolveActiveCompanionId').mockReturnValue(activeNonPrimaryId);
    await services.companion.reportCommandAck({ commandId: current.id, companionId: activeCompanionId, status: 'cancelled', reportedAt: nowIso() });
    const nonPrimary = command(activeNonPrimaryId);
    internals.tryActivateCommand(nonPrimary);
    expect((await services.companion.getActiveCommand())?.id).toBe(nonPrimary.id);
    activeResolver.mockRestore();

    const previous = command('previous-companion');
    internals.activeCommand = { command: previous, latestStatus: 'issued', updatedAt: nowIso(), terminal: false };
    expect(await services.companion.getActiveCommand()).toBeNull();
    expect(internals.activeCommand).toBeNull();

    const switchEvents = (await services.debug.getFoundationLog({ source: 'companion', limit: 10 }))
      .filter((event) => event.type === 'CompanionCommandAck' && (event.payload as { commandId: string }).commandId === previous.id);
    expect((switchEvents[0].payload as { status: string; reason: string }).status).toBe('cancelled');
    expect((switchEvents[0].payload as { status: string; reason: string }).reason).toBe('companion_switched');

    const expired = command(activeCompanionId);
    expired.expiresAt = new Date(Date.now() - 1).toISOString();
    internals.tryActivateCommand(expired);
    expect(await services.companion.getActiveCommand()).toBeNull();
    const expiryEvents = (await services.debug.getFoundationLog({ source: 'companion', limit: 10 }))
      .filter((event) => event.type === 'CompanionCommandAck' && (event.payload as { commandId: string }).commandId === expired.id);
    expect((expiryEvents[0].payload as { status: string; reason: string }).reason).toBe('command_expired');
    services.db.close();
  });

  it('uses one terminal transition for switch and renderer acknowledgement cleanup', async () => {
    const services = new AppServices(':memory:');
    const internals = services as unknown as {
      activeCommand: { command: CompanionCommand; latestStatus: 'issued' | 'received' | 'started'; updatedAt: string; terminal: boolean } | null;
      tryActivateCommand(command: CompanionCommand): boolean;
      cancelCommandForCompanionSwitch(nextCompanionId: string): void;
      companionRuntime: { schedulePendingReevaluation(): void };
    };
    const activeCompanionId = services.db.resolveActiveCompanionId();
    const schedule = vi.spyOn(internals.companionRuntime, 'schedulePendingReevaluation');

    for (const status of ['issued', 'received', 'started'] as const) {
      const current = command(activeCompanionId);
      internals.activeCommand = { command: current, latestStatus: status, updatedAt: nowIso(), terminal: false };
      internals.cancelCommandForCompanionSwitch('next-companion');
      expect(internals.activeCommand).toBeNull();
      await services.companion.reportCommandAck({ commandId: current.id, companionId: activeCompanionId, status: 'cancelled', reportedAt: nowIso() });
    }
    expect(schedule).toHaveBeenCalledTimes(3);
    const cancellations = (await services.debug.getFoundationLog({ source: 'companion', limit: 10 }))
      .filter((event) => event.type === 'CompanionCommandAck');
    expect(cancellations).toHaveLength(3);
    expect(cancellations.every((event) => (event.payload as { reason: string }).reason === 'companion_switched')).toBe(true);
    services.db.close();
  });
});
