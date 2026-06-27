import { describe, expect, it } from 'vitest';
import { createId, nowIso } from '@our-companion/shared';
import { DatabaseService } from '@our-companion/database';
import { buildEngineSnapshot } from './engineSnapshot';

describe('buildEngineSnapshot', () => {
  it('assembles patterns, curiosity targets, and exploration events for the active cycle', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const timestamp = nowIso();
    const cycleId = createId('cycle');

    db.insertExplorationCycle({
      id: cycleId,
      userId: 'default',
      companionId: 'ann',
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
      companionId: 'ann',
      cycleId,
      state: 'curious',
      message: 'Ann became curious.',
      createdAt: timestamp
    });

    db.insertCuriosityTarget({
      id: createId('curiosity'),
      userId: 'default',
      companionId: 'ann',
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

    const snapshot = buildEngineSnapshot(db, { cycleId });

    expect(snapshot.currentCycle?.id).toBe(cycleId);
    expect(snapshot.curiosityTargets[0]?.topic).toBe('Desktop companions');
    expect(snapshot.explorationEvents).toHaveLength(1);
    expect(snapshot.characterState?.characterId).toBe('ann');
    expect(snapshot.actionPermissions.browser).toBeDefined();
    expect(snapshot.discoveryScheduling.isBusy).toBe(false);
    expect(snapshot.discoveryScheduling.hasPending).toBe(false);
    expect(snapshot.discoveryScheduling.unannouncedCount).toBe(0);
    expect(snapshot.discoveryScheduling.announcedCount).toBe(0);

    db.close();
  });
});
