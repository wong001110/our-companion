import { describe, expect, it } from 'vitest';
import { DatabaseService } from './index';

describe('DatabaseService adaptive Discovery integration', () => {
  it('initializes the additive tables and clears them in dependency-safe reset order', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const companion = db.createCompanion({
      name: 'Discovery Test',
      personalityDescription: 'A curious test Companion.',
      personalityAnalysisId: 'adaptive-discovery-test',
      assetRoot: 'companion://test/assets',
      personality: {
        energy: 50,
        curiosity: 50,
        sociability: 50,
        diligence: 50,
        playfulness: 50,
        confidence: 50,
        calmness: 50,
        shyness: 50,
      },
    });
    db.setPrimaryCompanion(companion.id);
    const companionId = companion.id;
    db.upsertDiscoveryBase({
      id: 'base',
      companionId,
      connectorId: 'rss',
      scope: 'feed',
      locator: 'https://example.test/feed',
      data: {},
      origin: 'feed_detection',
      state: 'trial',
      discoveredAt: '2026-07-18T00:00:00.000Z',
      trialStartedAt: '2026-07-18T00:00:00.000Z',
      trialExpiresAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    });
    db.insertDiscoveryBaseFeedback({
      id: 'feedback',
      companionId,
      discoveryBaseId: 'base',
      value: 'useful',
      createdAt: '2026-07-18T00:00:00.000Z',
    });
    db.upsertDiscoverySeenIdentity({
      id: 'seen',
      companionId,
      type: 'canonical_url',
      hash: 'hash',
      firstSeenAt: '2026-07-18T00:00:00.000Z',
      lastSeenAt: '2026-07-18T00:00:00.000Z',
      metadata: {},
    });

    const reset = db.resetDebugData({ targets: ['discoveries', 'autonomy'] });
    expect(reset.clearedTables).toEqual(expect.arrayContaining([
      'discovery_seen_identity',
      'discovery_base_feedback',
      'discovery_bases',
    ]));
    expect(db.listDiscoverySeenIdentities(companionId)).toEqual([]);
    expect(db.listDiscoveryBases(companionId)).toEqual([]);
    db.close();
  });
});
