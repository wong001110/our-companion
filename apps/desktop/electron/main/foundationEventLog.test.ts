import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COMPANION_ANIMATION_MANIFEST, createId, nowIso, type CompanionCommand, type CompanionPersonality, type GeneratedInsight } from '@our-companion/shared';
import { app } from 'electron';
import { AppServices, MAX_COMPANION_ASSET_BYTES, MAX_COMPANION_TOTAL_ASSET_BYTES, toPersistedCompanionInsight } from './services';
import { createPngFixture } from './platform/smokeFixture';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => process.env.OUR_COMPANION_TEST_USER_DATA ?? ':memory:')
  }
}));

describe('foundation event log', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    delete process.env.OUR_COMPANION_TEST_USER_DATA;
    vi.mocked(app.getPath).mockClear();
  });

  it('maps generated insight output to SQLite-bindable persisted Companion insight fields', () => {
    const insight: GeneratedInsight = {
      id: 'insight_1', userId: 'local', category: 'discovery', title: 'Title', summary: 'Summary', explanation: 'Explanation',
      supportingPatternIds: ['pattern_1'], supportingMemoryIds: ['memory_1'], confidence: 0.8, importance: 0.7,
      novelty: 0.6, evidenceCount: 1, status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const persisted = toPersistedCompanionInsight(insight, 'companion_1', 'Curiosity target reason', ['candidate_1']);
    expect(persisted.companionId).toBe('companion_1');
    expect(persisted.insight).toBe('Explanation');
    expect(persisted.supportingCandidateIds).toEqual(['candidate_1']);
  });

  function useTempUserData(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'our-companion-main-'));
    tempRoots.push(root);
    process.env.OUR_COMPANION_TEST_USER_DATA = root;
    return root;
  }

  function png(width: number, height: number): Uint8Array {
    return new Uint8Array(createPngFixture(width, height));
  }

  function requiredAssets(bytes = png(300, 300)) {
    return COMPANION_ANIMATION_MANIFEST
      .filter((entry) => entry.requiredForCreation)
      .map((entry) => ({ animationKey: entry.key, buffer: bytes }));
  }

  function allAssets(bytes = png(300, 300)) {
    return COMPANION_ANIMATION_MANIFEST.map((entry) => ({ animationKey: entry.key, buffer: bytes }));
  }

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
    await services.dispose();
  });

  it('rejects arbitrary personality input without a Main Process AI analysis', async () => {
    const services = new AppServices(':memory:');
    await expect(services.companionNew.create({
      name: 'Untrusted', personalityDescription: 'Renderer supplied values', personalityAnalysisId: 'missing', assetRoot: '', assets: [],
      personality: { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 },
    })).rejects.toThrow('invalid, expired, or already used');
    await services.dispose();
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
    await services.dispose();
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
    await services.dispose();
  });

  it('rolls back the profile when required asset persistence fails', async () => {
    useTempUserData();
    const services = new AppServices(':memory:');
    const personality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const analyses = (services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
    }).personalityAnalyses;
    analyses.set('analysis-fixture', { personality, description: 'Atomic fixture', expiresAt: Date.now() + 60_000, used: false });
    const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => { throw new Error('asset write failure'); });
    await expect(services.companionNew.create({
      name: 'Rollback', personalityDescription: 'Atomic fixture', personalityAnalysisId: 'analysis-fixture', assetRoot: '', assets: requiredAssets(),
    })).rejects.toThrow('asset write failure');
    expect(services.db.listCompanions()).toEqual([]);
    expect(analyses.get('analysis-fixture')?.used).toBe(false);
    mkdir.mockRestore();
    await services.dispose();
  });

  it('validates required PNG animation assets before creation', async () => {
    useTempUserData();
    const services = new AppServices(':memory:');
    const personality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const analyses = (services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
    }).personalityAnalyses;
    analyses.set('analysis-fixture', { personality, description: 'PNG fixture', expiresAt: Date.now() + 60_000, used: false });

    await expect(services.companionNew.create({
      name: 'Bad', personalityDescription: 'PNG fixture', personalityAnalysisId: 'analysis-fixture', assetRoot: '', assets: requiredAssets(new Uint8Array([1])),
    })).rejects.toThrow('not a valid PNG');

    analyses.set('analysis-fixture-truncated', { personality, description: 'PNG fixture', expiresAt: Date.now() + 60_000, used: false });
    const truncated = createPngFixture(300, 300).subarray(0, -8);
    await expect(services.companionNew.create({
      name: 'Truncated', personalityDescription: 'PNG fixture', personalityAnalysisId: 'analysis-fixture-truncated', assetRoot: '', assets: requiredAssets(truncated),
    })).rejects.toThrow('not a valid PNG');

    analyses.set('analysis-fixture-corrupt', { personality, description: 'PNG fixture', expiresAt: Date.now() + 60_000, used: false });
    const corrupt = Buffer.from(createPngFixture(300, 300));
    corrupt[corrupt.length - 5] ^= 0xff;
    await expect(services.companionNew.create({
      name: 'Corrupt', personalityDescription: 'PNG fixture', personalityAnalysisId: 'analysis-fixture-corrupt', assetRoot: '', assets: requiredAssets(corrupt),
    })).rejects.toThrow('not a valid PNG');

    analyses.set('analysis-fixture-2', { personality, description: 'PNG fixture', expiresAt: Date.now() + 60_000, used: false });
    await expect(services.companionNew.create({
      name: 'Zero', personalityDescription: 'PNG fixture', personalityAnalysisId: 'analysis-fixture-2', assetRoot: '', assets: requiredAssets(png(0, 300)),
    })).rejects.toThrow('invalid PNG dimensions');

    analyses.set('analysis-fixture-frame-size', { personality, description: 'PNG fixture', expiresAt: Date.now() + 60_000, used: false });
    await expect(services.companionNew.create({
      name: 'SmallFrame', personalityDescription: 'PNG fixture', personalityAnalysisId: 'analysis-fixture-frame-size', assetRoot: '', assets: requiredAssets(png(299, 299)),
    })).rejects.toThrow('frame size is outside the allowed range');

    analyses.set('analysis-fixture-3', { personality, description: 'PNG fixture', expiresAt: Date.now() + 60_000, used: false });
    await expect(services.companionNew.create({
      name: 'BadSheet', personalityDescription: 'PNG fixture', personalityAnalysisId: 'analysis-fixture-3', assetRoot: '', assets: requiredAssets(png(301, 300)),
    })).rejects.toThrow('invalid sprite-sheet width');

    analyses.set('analysis-fixture-4', { personality, description: 'PNG fixture', expiresAt: Date.now() + 60_000, used: false });
    await expect(services.companionNew.create({
      name: 'HugeFrames', personalityDescription: 'PNG fixture', personalityAnalysisId: 'analysis-fixture-4', assetRoot: '', assets: requiredAssets(png(300 * 121, 300)),
    })).rejects.toThrow('invalid sprite-sheet frame count');
    await services.dispose();
  });

  it('persists every validated required and optional animation before reporting success', async () => {
    useTempUserData();
    const services = new AppServices(':memory:');
    const personality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const analyses = (services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
    }).personalityAnalyses;
    analyses.set('all-assets-fixture', {
      personality,
      description: 'All asset fixture',
      expiresAt: Date.now() + 60_000,
      used: false,
    });

    const created = await services.companionNew.create({
      name: 'Complete',
      personalityDescription: 'All asset fixture',
      personalityAnalysisId: 'all-assets-fixture',
      assetRoot: '',
      assets: allAssets(),
    });
    const stored = await services.companionNew.listAssets(created.id);
    expect(stored.filter((asset) => asset.subfolder === 'animations').map((asset) => asset.name).sort())
      .toEqual(COMPANION_ANIMATION_MANIFEST.map((entry) => entry.fileName).sort());
    await services.dispose();
  });

  it('atomically saves profile edits, sprite replacements, and optional deletions', async () => {
    const userDataRoot = useTempUserData();
    const services = new AppServices(':memory:');
    const personality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const analyses = (services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
    }).personalityAnalyses;
    analyses.set('edit-create-fixture', {
      personality,
      description: 'Edit creation fixture',
      expiresAt: Date.now() + 60_000,
      used: false,
    });
    const created = await services.companionNew.create({
      name: 'Before Edit',
      personalityDescription: 'Edit creation fixture',
      personalityAnalysisId: 'edit-create-fixture',
      assetRoot: '',
      assets: allAssets(),
    });

    const replacement = png(600, 300);
    const updated = await services.companionNew.update({
      id: created.id,
      name: 'After Edit',
      assets: [{ animationKey: 'Idle_Neutral', buffer: replacement }],
      deleteAnimationKeys: ['Idle_Breathe'],
    });

    expect(updated.name).toBe('After Edit');
    const animationsDir = path.join(userDataRoot, 'companions', created.id, 'assets', 'animations');
    expect(fs.readFileSync(path.join(animationsDir, 'Idle_Neutral.png'))).toEqual(Buffer.from(replacement));
    expect(fs.existsSync(path.join(animationsDir, 'Idle_Breathe.png'))).toBe(false);
    expect(fs.existsSync(path.join(animationsDir, 'Enter.png'))).toBe(true);
    await services.dispose();
  });

  it('replaces an existing Optional animation through the public edit service', async () => {
    useTempUserData();
    const services = new AppServices(':memory:');
    const personality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const analyses = (services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
    }).personalityAnalyses;
    analyses.set('optional-replacement-create', {
      personality,
      description: 'Optional replacement fixture',
      expiresAt: Date.now() + 60_000,
      used: false,
    });
    const created = await services.companionNew.create({
      name: 'Optional Replacement',
      personalityDescription: 'Optional replacement fixture',
      personalityAnalysisId: 'optional-replacement-create',
      assetRoot: '',
      assets: allAssets(),
    });
    const replacement = png(600, 300);

    await services.companionNew.update({
      id: created.id,
      assets: [{ animationKey: 'Idle_Breathe', buffer: replacement }],
    });

    const persisted = await services.companionNew.readAsset({
      companionId: created.id,
      subfolder: 'animations',
      fileName: 'Idle_Breathe.png',
    });
    expect(persisted?.dataUrl).toBe(`data:image/png;base64,${Buffer.from(replacement).toString('base64')}`);
    await services.dispose();
  });

  it('synchronizes the managed seed after Personality Edit while preserving user and muted/blocked Sources', async () => {
    useTempUserData();
    const services = new AppServices(':memory:');
    const originalPersonality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const nextPersonality: CompanionPersonality = { ...originalPersonality, curiosity: 91 };
    const analyses = (services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
    }).personalityAnalyses;
    analyses.set('personality-edit-create', {
      personality: originalPersonality,
      description: 'Calm local-first product design research',
      expiresAt: Date.now() + 60_000,
      used: false,
    });
    const created = await services.companionNew.create({
      name: 'Seed Editor',
      personalityDescription: 'Calm local-first product design research',
      personalityAnalysisId: 'personality-edit-create',
      assetRoot: '',
      assets: requiredAssets(),
    });
    const originalSeed = (await services.discovery.listChannels()).find((channel) => channel.platformId === 'generic-web')!;
    await services.discovery.updateChannelState({ platformId: 'generic-web', state: 'blocked' });
    const manual = await services.discovery.addBase({
      sourceType: 'query',
      locator: 'manual accessibility research',
      initialState: 'active',
    });
    const muted = await services.discovery.addBase({
      sourceType: 'query',
      locator: 'quiet interaction archives',
    });
    await services.discovery.updateBaseState({ baseId: muted.id, state: 'muted' });
    analyses.set('personality-edit-success', {
      personality: nextPersonality,
      description: 'Curious accessibility and interaction research',
      expiresAt: Date.now() + 60_000,
      used: false,
    });

    const updated = await services.companionNew.update({
      id: created.id,
      personalityDescription: 'Curious accessibility and interaction research',
      personalityAnalysisId: 'personality-edit-success',
    });
    const bases = await services.discovery.listBases();
    const channels = await services.discovery.listChannels();
    const updatedChannel = channels.find((channel) => channel.platformId === 'generic-web');
    const preservedManual = bases.find((base) => base.id === manual.id);
    const preservedMuted = bases.find((base) => base.id === muted.id);
    const profile = await services.discovery.getDiscoveryProfile();

    expect(updated.personalityDescription).toBe('Curious accessibility and interaction research');
    expect(updated.personality).toEqual(nextPersonality);
    expect(updatedChannel).toMatchObject({
      platformId: 'generic-web',
      state: 'blocked',
    });
    expect(profile?.interests.some((interest) => interest.includes('accessibility'))).toBe(true);
    expect(profile?.personalityRevision).not.toBeUndefined();
    expect(preservedManual).toMatchObject({
      id: manual.id,
      locator: manual.locator,
      origin: 'user',
      state: 'active',
    });
    expect(preservedMuted).toMatchObject({
      id: muted.id,
      locator: muted.locator,
      origin: 'user',
      state: 'muted',
    });
    expect(bases.some((base) => String(base.locator).includes('site:'))).toBe(false);
    expect(channels.filter((channel) => channel.platformId !== 'generic-web' && channel.state === 'enabled').length).toBeGreaterThanOrEqual(4);
    await services.dispose();
  });

  it('rejects required animation deletion without changing profile or files', async () => {
    const userDataRoot = useTempUserData();
    const services = new AppServices(':memory:');
    const personality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const analyses = (services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
    }).personalityAnalyses;
    analyses.set('required-delete-fixture', {
      personality,
      description: 'Required deletion fixture',
      expiresAt: Date.now() + 60_000,
      used: false,
    });
    const created = await services.companionNew.create({
      name: 'Protected',
      personalityDescription: 'Required deletion fixture',
      personalityAnalysisId: 'required-delete-fixture',
      assetRoot: '',
      assets: requiredAssets(),
    });
    const requiredPath = path.join(userDataRoot, 'companions', created.id, 'assets', 'animations', 'Idle_Neutral.png');

    await expect(services.companionNew.update({
      id: created.id,
      name: 'Must Not Persist',
      deleteAnimationKeys: ['Idle_Neutral'],
    })).rejects.toThrow('Required Companion animation cannot be deleted: Idle_Neutral');
    await expect(services.companionNew.deleteAsset({
      companionId: created.id,
      subfolder: 'animations',
      fileName: 'Idle_Neutral.png',
    })).rejects.toThrow('Required Companion animation cannot be deleted: Idle_Neutral');

    expect(services.db.getCompanion(created.id)?.name).toBe('Protected');
    expect(fs.existsSync(requiredPath)).toBe(true);
    await services.dispose();
  });

  it('restores profile, personality seed, assets, and AI analysis when an edit fails', async () => {
    const userDataRoot = useTempUserData();
    const services = new AppServices(':memory:');
    const originalPersonality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const nextPersonality: CompanionPersonality = { ...originalPersonality, curiosity: 91 };
    const internals = services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
      syncPersonalityDiscoverySeed(companion: { personality: CompanionPersonality }): void;
    };
    internals.personalityAnalyses.set('edit-rollback-create', {
      personality: originalPersonality,
      description: 'Original personality fixture',
      expiresAt: Date.now() + 60_000,
      used: false,
    });
    const created = await services.companionNew.create({
      name: 'Original',
      personalityDescription: 'Original personality fixture',
      personalityAnalysisId: 'edit-rollback-create',
      assetRoot: '',
      assets: requiredAssets(),
    });
    internals.personalityAnalyses.set('edit-rollback-analysis', {
      personality: nextPersonality,
      description: 'Updated personality fixture',
      expiresAt: Date.now() + 60_000,
      used: false,
    });
    const originalAsset = fs.readFileSync(path.join(userDataRoot, 'companions', created.id, 'assets', 'animations', 'Idle_Neutral.png'));
    const seedSync = vi.spyOn(internals, 'syncPersonalityDiscoverySeed').mockImplementationOnce(() => {
      throw new Error('edit seed synchronization failure');
    });

    await expect(services.companionNew.update({
      id: created.id,
      name: 'Changed',
      personalityDescription: 'Updated personality fixture',
      personality: nextPersonality,
      personalityAnalysisId: 'edit-rollback-analysis',
      assets: [{ animationKey: 'Idle_Neutral', buffer: png(600, 300) }],
    })).rejects.toThrow('edit seed synchronization failure');

    const restored = services.db.getCompanion(created.id);
    expect(restored).toEqual(expect.objectContaining({
      name: 'Original',
      personalityDescription: 'Original personality fixture',
      personality: originalPersonality,
    }));
    expect(fs.readFileSync(path.join(userDataRoot, 'companions', created.id, 'assets', 'animations', 'Idle_Neutral.png')))
      .toEqual(originalAsset);
    expect(internals.personalityAnalyses.get('edit-rollback-analysis')?.used).toBe(false);
    expect(seedSync).toHaveBeenCalledTimes(2);
    await services.dispose();
  });

  it('keeps legacy companions usable for profile edits and requires missing assets only when assets change', async () => {
    useTempUserData();
    const services = new AppServices(':memory:');
    const id = initializeCompanion(services);

    const updated = await services.companionNew.update({ id, name: 'Legacy Renamed' });
    expect(updated.name).toBe('Legacy Renamed');
    await expect(services.companionNew.update({
      id,
      assets: [{ animationKey: 'Idle_Neutral', buffer: png(300, 300) }],
    })).rejects.toThrow('Missing required Companion animations');
    expect(services.db.getCompanion(id)?.name).toBe('Legacy Renamed');
    await services.dispose();
  });

  it('rolls back a newly primary Companion and promoted assets when seed synchronization fails', async () => {
    const userDataRoot = useTempUserData();
    const services = new AppServices(':memory:');
    const personality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const internals = services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
      syncPersonalityDiscoverySeed(): void;
    };
    internals.personalityAnalyses.set('seed-failure-fixture', {
      personality,
      description: 'Seed failure fixture',
      expiresAt: Date.now() + 60_000,
      used: false,
    });
    vi.spyOn(internals, 'syncPersonalityDiscoverySeed').mockImplementation(() => {
      throw new Error('seed synchronization failure');
    });

    await expect(services.companionNew.create({
      name: 'Rollback Primary',
      personalityDescription: 'Seed failure fixture',
      personalityAnalysisId: 'seed-failure-fixture',
      assetRoot: '',
      assets: requiredAssets(),
    })).rejects.toThrow('seed synchronization failure');

    expect(services.db.listCompanions()).toEqual([]);
    expect(services.db.getPrimaryCompanion()).toBeNull();
    expect(services.db.listDiscoveryBases('missing-companion')).toEqual([]);
    expect(internals.personalityAnalyses.get('seed-failure-fixture')?.used).toBe(false);
    const companionRoot = path.join(userDataRoot, 'companions');
    expect(fs.existsSync(companionRoot) ? fs.readdirSync(companionRoot) : []).toEqual([]);
    await services.dispose();
  });

  it('enforces asset size limits, duplicate keys, and missing required animations', async () => {
    useTempUserData();
    const services = new AppServices(':memory:');
    const personality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const analyses = (services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
    }).personalityAnalyses;
    const create = (id: string, assets: ReturnType<typeof requiredAssets>) => services.companionNew.create({
      name: id, personalityDescription: 'Limit fixture', personalityAnalysisId: id, assetRoot: '', assets,
    });

    analyses.set('duplicate-fixture', { personality, description: 'Limit fixture', expiresAt: Date.now() + 60_000, used: false });
    await expect(create('duplicate-fixture', [requiredAssets()[0], requiredAssets()[0]])).rejects.toThrow('Duplicate');

    analyses.set('missing-fixture', { personality, description: 'Limit fixture', expiresAt: Date.now() + 60_000, used: false });
    await expect(create('missing-fixture', requiredAssets().slice(1)))
      .rejects.toThrow(`Missing required Companion animations: ${requiredAssets()[0]!.animationKey}`);

    const overFile = new Uint8Array(MAX_COMPANION_ASSET_BYTES + 1);
    png(300, 300).forEach((value, index) => { overFile[index] = value; });
    analyses.set('large-fixture', { personality, description: 'Limit fixture', expiresAt: Date.now() + 60_000, used: false });
    await expect(create('large-fixture', requiredAssets(overFile))).rejects.toThrow('maximum file size');

    const overTotal = new Uint8Array(createPngFixture(
      300,
      300,
      Math.floor(MAX_COMPANION_TOTAL_ASSET_BYTES / 15) + 1,
    ));
    analyses.set('total-fixture', { personality, description: 'Limit fixture', expiresAt: Date.now() + 60_000, used: false });
    await expect(create('total-fixture', requiredAssets(overTotal))).rejects.toThrow('maximum total size');
    await services.dispose();
  });

  it('deletes consumed personality analyses, restores failed attempts, prunes expired entries, and caps the cache', async () => {
    useTempUserData();
    const services = new AppServices(':memory:');
    const personality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const internals = services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
      prunePersonalityAnalyses(): void;
    };
    internals.personalityAnalyses.set('expired-fixture', { personality, description: 'expired', expiresAt: Date.now() - 1, used: false });
    internals.prunePersonalityAnalyses();
    expect(internals.personalityAnalyses.has('expired-fixture')).toBe(false);

    internals.personalityAnalyses.set('success-fixture', { personality, description: 'Success fixture', expiresAt: Date.now() + 60_000, used: false });
    const created = await services.companionNew.create({
      name: 'Success', personalityDescription: 'Success fixture', personalityAnalysisId: 'success-fixture', assetRoot: '', assets: requiredAssets(),
    });
    expect(created.isPrimary).toBe(true);
    expect(internals.personalityAnalyses.has('success-fixture')).toBe(false);
    expect(services.db.listDiscoveryBases(created.id, 'trial')).toEqual([]);
    const channels = await services.discovery.listChannels();
    expect(channels.map((channel) => channel.platformId).sort()).toEqual([
      'bilibili',
      'generic-web',
      'github',
      'reddit',
      'youtube',
    ]);
    const profile = await services.discovery.getDiscoveryProfile();
    expect(profile?.interests.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(profile)).not.toContain('site:');
    await expect(services.companionNew.create({
      name: 'Reuse', personalityDescription: 'Success fixture', personalityAnalysisId: 'success-fixture', assetRoot: '', assets: requiredAssets(),
    })).rejects.toThrow('invalid, expired, or already used');

    internals.personalityAnalyses.set('failed-fixture', { personality, description: 'Failed fixture', expiresAt: Date.now() + 60_000, used: false });
    const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => { throw new Error('asset write failure'); });
    await expect(services.companionNew.create({
      name: 'Failed', personalityDescription: 'Failed fixture', personalityAnalysisId: 'failed-fixture', assetRoot: '', assets: requiredAssets(),
    })).rejects.toThrow('asset write failure');
    expect(internals.personalityAnalyses.get('failed-fixture')?.used).toBe(false);
    mkdir.mockRestore();

    for (let index = 0; index < 55; index += 1) {
      internals.personalityAnalyses.set(`analysis-${index}`, { personality, description: `${index}`, expiresAt: Date.now() + index + 1_000, used: false });
    }
    internals.prunePersonalityAnalyses();
    expect(internals.personalityAnalyses.size).toBeLessThanOrEqual(50);
    await services.dispose();
  });

  it('sets only the first Companion primary and leaves later creation non-primary without starting onboarding UI synchronously', async () => {
    useTempUserData();
    const services = new AppServices(':memory:');
    const internals = services as unknown as { runtimeStarted: boolean };
    const personality: CompanionPersonality = { energy: 50, curiosity: 60, sociability: 40, diligence: 70, playfulness: 55, confidence: 45, calmness: 75, shyness: 25 };
    const analyses = (services as unknown as {
      personalityAnalyses: Map<string, { personality: CompanionPersonality; description: string; expiresAt: number; used: boolean }>;
    }).personalityAnalyses;
    analyses.set('first-fixture', { personality, description: 'First fixture', expiresAt: Date.now() + 60_000, used: false });
    analyses.set('second-fixture', { personality, description: 'Second fixture', expiresAt: Date.now() + 60_000, used: false });

    const first = await services.companionNew.create({
      name: 'First', personalityDescription: 'First fixture', personalityAnalysisId: 'first-fixture', assetRoot: '', assets: requiredAssets(),
    });
    const second = await services.companionNew.create({
      name: 'Second', personalityDescription: 'Second fixture', personalityAnalysisId: 'second-fixture', assetRoot: '', assets: requiredAssets(),
    });
    expect(first.isPrimary).toBe(true);
    expect(second.isPrimary).toBe(false);
    expect(services.db.getPrimaryCompanion()?.id).toBe(first.id);
    expect(internals.runtimeStarted).toBe(false);
    expect(analyses.has('first-fixture')).toBe(false);

    const switched = await services.companionNew.setPrimary(second.id);
    expect(switched.isPrimary).toBe(true);
    expect(services.db.getPrimaryCompanion()?.id).toBe(second.id);
    await services.dispose();
  });

  it('records emitted foundation events and filters by source', async () => {
    const services = new AppServices(':memory:');

    services.emitFoundationEvent('CompanionDecisionMade', 'decision', { action: 'respond' }, 'corr_1');
    services.emitFoundationEvent('CharacterStateChanged', 'character', { coreState: 'idle' });

    const all = await services.debug.getFoundationLog({ limit: 10 });
    expect(all).toHaveLength(2);
    expect(all[0].type).toBe('CharacterStateChanged');

    const decisions = await services.debug.getFoundationLog({ source: 'decision', limit: 10 });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].correlationId).toBe('corr_1');

    await services.dispose();
  });

  it('caps the ring buffer at 200 events', async () => {
    const services = new AppServices(':memory:');

    for (let index = 0; index < 205; index += 1) {
      services.emitFoundationEvent('TestEvent', 'discovery', { index });
    }

    const log = await services.debug.getFoundationLog({ limit: 300 });
    expect(log).toHaveLength(200);
    expect((log[0].payload as { index: number }).index).toBe(204);

    await services.dispose();
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
    await services.dispose();
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
    await services.dispose();
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
    await services.dispose();
  });
});
