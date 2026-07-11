import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { COMPANION_ANIMATION_MANIFEST, createId, nowIso, type CompanionCommand, type CompanionPersonality } from '@our-companion/shared';
import { AppServices } from './services';

vi.mock('electron', () => ({
  app: {
    getPath: () => ':memory:'
  }
}));

describe('foundation event log', () => {
  function initializeCompanion(services: AppServices): string {
    const companion = services.db.createCompanion({
      name: 'Test', personalityDescription: 'A generated test Companion', personalityAnalysisId: 'db-fixture', assetRoot: 'companion://test/assets',
      personality: { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 },
    });
    services.db.setPrimaryCompanion(companion.id);
    return companion.id;
  }
  function command(companionId: string): CompanionCommand {
    return {
      id: createId('cmd'), companionId, issuedAt: nowIso(),
      decision: { id: createId('decision'), action: 'share_discovery', timing: 'now', priority: 'normal', reason: 'test', createdAt: nowIso() },
    };
  }

  it('keeps runtime gated until a primary Companion exists', async () => {
    const services = new AppServices(':memory:');
    const internals = services as unknown as { runtimeStarted: boolean; companionRuntime: { startLifeScheduler(): void; stopLifeScheduler(): void } };
    const start = vi.spyOn(internals.companionRuntime, 'startLifeScheduler');
    expect(services.db.listCompanions()).toEqual([]);
    expect(services.hasActiveCompanion()).toBe(false);
    expect(services.startRuntimeIfReady()).toBe(false);
    expect(start).not.toHaveBeenCalled();
    initializeCompanion(services);
    expect(services.startRuntimeIfReady()).toBe(true);
    expect(services.startRuntimeIfReady()).toBe(false);
    expect(start).toHaveBeenCalledTimes(1);
    internals.companionRuntime.stopLifeScheduler();
    services.db.close();
  });

  it('rejects arbitrary personality input without a Main Process AI analysis', async () => {
    const services = new AppServices(':memory:');
    await expect(services.companionNew.create({
      name: 'Untrusted', personalityDescription: 'Renderer supplied values', personalityAnalysisId: 'missing', assetRoot: '', assets: [],
      personality: { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 },
    })).rejects.toThrow('invalid, expired, or already used');
    services.db.close();
  });

  it('accepts only a validated Main Process AI personality result', async () => {
    const services = new AppServices(':memory:');
    const internals = services as unknown as {
      getAiSettings(): { apiKeyConfigured: boolean };
      sendToAi(): Promise<{ content: string }>;
    };
    vi.spyOn(internals, 'getAiSettings').mockReturnValue({ apiKeyConfigured: true });
    vi.spyOn(internals, 'sendToAi').mockResolvedValue({
      content: JSON.stringify({ energy: 61, curiosity: 82, sociability: 43, diligence: 74, playfulness: 68, confidence: 55, calmness: 71, shyness: 29 }),
    });
    const analysis = await services.companionNew.analyzePersonality('Warm, curious, and quietly confident');
    expect(analysis.analysisId).toMatch(/^personality_analysis_/);
    expect(analysis.personality).toEqual(expect.objectContaining({ curiosity: 82, calmness: 71 }));
    expect(analysis.description).toBe('Warm, curious, and quietly confident');
    services.db.close();
  });

  it('rejects malformed AI personality analysis output', async () => {
    const services = new AppServices(':memory:');
    const internals = services as unknown as {
      getAiSettings(): { apiKeyConfigured: boolean };
      sendToAi(): Promise<{ content: string }>;
    };
    vi.spyOn(internals, 'getAiSettings').mockReturnValue({ apiKeyConfigured: true });
    vi.spyOn(internals, 'sendToAi').mockResolvedValue({
      content: JSON.stringify({ energy: 101, curiosity: 50 }),
    });
    await expect(services.companionNew.analyzePersonality('Invalid output fixture')).rejects.toThrow('invalid energy');
    services.db.close();
  });

  it('rolls back the profile when required asset persistence fails', async () => {
    const services = new AppServices(':memory:');
    const personality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const analyses = (services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
    }).personalityAnalyses;
    analyses.set('analysis-fixture', { personality, description: 'Atomic fixture', expiresAt: Date.now() + 60_000, used: false });
    const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => { throw new Error('asset write failure'); });
    const assets = COMPANION_ANIMATION_MANIFEST
      .filter((entry) => entry.requiredForCreation)
      .map((entry) => ({ animationKey: entry.key, buffer: new Uint8Array([1]) }));
    await expect(services.companionNew.create({
      name: 'Rollback', personalityDescription: 'Atomic fixture', personalityAnalysisId: 'analysis-fixture', assetRoot: '', assets,
    })).rejects.toThrow('asset write failure');
    expect(services.db.listCompanions()).toEqual([]);
    expect(analyses.get('analysis-fixture')?.used).toBe(false);
    mkdir.mockRestore();
    services.db.close();
  });

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
    initializeCompanion(services);
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
    initializeCompanion(services);
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
    initializeCompanion(services);
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
