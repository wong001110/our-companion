import { describe, expect, it } from 'vitest';
import { createId, nowIso } from '@our-companion/shared';
import { DatabaseService } from '@our-companion/database';
import { buildEngineSnapshot } from './engineSnapshot';

describe('buildEngineSnapshot', () => {
  it('assembles patterns, curiosity targets, and exploration events for the active cycle', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const companion = db.createCompanion({
      name: 'Test', personalityDescription: 'Test fixture', personalityAnalysisId: 'fixture', assetRoot: 'test',
      personality: { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 },
    });
    db.setPrimaryCompanion(companion.id);
    const timestamp = nowIso();
    const cycleId = createId('cycle');

    db.insertExplorationCycle({
      id: cycleId,
      userId: 'default',
      companionId: companion.id,
      trigger: 'manual',
      state: 'sharing',
      curiosityTargetIds: [],
      discoveryCandidateIds: [],
      insightIds: [],
      startedAt: timestamp
    });

    db.insertExplorationEvent({
      id: createId('explore_evt'),
      userId: 'default',
      companionId: companion.id,
      cycleId,
      state: 'curious',
      message: 'Ann became curious.',
      createdAt: timestamp
    });

    db.insertCuriosityTarget({
      id: createId('curiosity'),
      userId: 'default',
      companionId: companion.id,
      topic: 'Desktop companions',
      description: 'Explore adjacent ideas.',
      source: 'memory_trigger',
      explorationType: 'adjacent',
      priority: 0.82,
      confidence: 0.7,
      reason: 'From memory.',
      expectedValue: 'Useful references.',
      createdAt: timestamp
    });

    const snapshot = buildEngineSnapshot(db, { cycleId }, companion.id);

    expect(snapshot.currentCycle?.id).toBe(cycleId);
    expect(snapshot.curiosityTargets[0]?.topic).toBe('Desktop companions');
    expect(snapshot.explorationEvents).toHaveLength(1);
    expect(snapshot.characterState?.characterId).toBe(companion.id);
    expect(snapshot.actionPermissions.browser).toBeDefined();
    expect(snapshot.discoveryScheduling.isBusy).toBe(false);
    expect(snapshot.discoveryScheduling.hasPending).toBe(false);
    expect(snapshot.discoveryScheduling.unannouncedCount).toBe(0);
    expect(snapshot.discoveryScheduling.announcedCount).toBe(0);

    db.close();
  });
});
