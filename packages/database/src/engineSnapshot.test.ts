import { describe, expect, it } from 'vitest';
import { createId, nowIso } from '@our-companion/shared';
import { DatabaseService } from '@our-companion/database';

describe('engine snapshot list helpers', () => {
  it('lists curiosity targets ordered by priority', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const timestamp = nowIso();

    db.insertCuriosityTarget({
      id: createId('curiosity'),
      userId: 'default',
      companionId: 'ann',
      topic: 'Low priority',
      description: 'Test',
      source: 'memory_trigger',
      explorationType: 'adjacent',
      priority: 0.3,
      confidence: 0.5,
      reason: 'low',
      expectedValue: 'low',
      createdAt: timestamp
    });
    db.insertCuriosityTarget({
      id: createId('curiosity'),
      userId: 'default',
      companionId: 'ann',
      topic: 'High priority',
      description: 'Test',
      source: 'pattern_trigger',
      explorationType: 'deepening',
      priority: 0.9,
      confidence: 0.8,
      reason: 'high',
      expectedValue: 'high',
      createdAt: timestamp
    });

    const targets = db.listCuriosityTargets('default', 10);
    expect(targets[0].topic).toBe('High priority');
    expect(targets[1].topic).toBe('Low priority');

    db.close();
  });

  it('lists discovery candidates and companion insights', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const timestamp = nowIso();
    const targetId = createId('curiosity');

    db.insertDiscoveryCandidate({
      id: createId('candidate'),
      userId: 'default',
      companionId: 'ann',
      title: 'Candidate A',
      summary: 'Summary',
      sourceType: 'github',
      agentType: 'scout',
      relatedCuriosityTargetId: targetId,
      relevanceScore: 0.8,
      noveltyScore: 0.7,
      evidenceScore: 0.6,
      usefulnessScore: 0.65,
      collectedAt: timestamp
    });

    db.insertCompanionInsight({
      id: createId('insight'),
      userId: 'default',
      companionId: 'ann',
      title: 'Insight title',
      type: 'observation',
      summary: 'Summary',
      insight: 'Detail',
      whyItMatters: 'Matters',
      whyAnnFoundIt: 'Found it',
      confidence: 0.7,
      novelty: 0.6,
      emotionalRelevance: 0.5,
      practicalRelevance: 0.8,
      supportingCandidateIds: [],
      createdAt: timestamp
    });

    expect(db.listDiscoveryCandidates()).toHaveLength(1);
    expect(db.listCompanionInsights()[0].title).toBe('Insight title');

    db.close();
  });

  it('lists exploration events for a cycle in chronological order', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const cycleId = createId('cycle');
    const timestamp = nowIso();

    db.insertExplorationCycle({
      id: cycleId,
      userId: 'default',
      companionId: 'ann',
      trigger: 'manual',
      state: 'curious',
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
      message: 'First',
      createdAt: timestamp
    });
    db.insertExplorationEvent({
      id: createId('explore_evt'),
      userId: 'default',
      companionId: 'ann',
      cycleId,
      state: 'planning',
      message: 'Second',
      createdAt: timestamp
    });

    const forCycle = db.listExplorationEventsForCycle(cycleId);
    expect(forCycle).toHaveLength(2);
    expect(forCycle[0].state).toBe('curious');
    expect(forCycle[1].state).toBe('planning');

    const filtered = db.listExplorationEvents(cycleId);
    expect(filtered).toHaveLength(2);

    db.close();
  });
});
