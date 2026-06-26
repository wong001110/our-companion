import { describe, expect, it } from 'vitest';
import {
  advanceVisit,
  canShareKnowledge,
  compareVersionVectors,
  createKnowledgeExchangePackage,
  createSyncEnvelope,
  requestCompanionVisit,
  resolveSyncConflict,
  scoreTrust,
  updateRelationship
} from './index';

const trust = {
  identityId: 'companion_b',
  sourceReputation: 0.8,
  sharedHistory: 0.7,
  userPermission: true,
  confidence: 0.8,
  freshness: 0.9
};

describe('society engine', () => {
  it('blocks private knowledge and allows consented shareable exchange', () => {
    expect(canShareKnowledge({ privacyLevel: 'private', explicitConsent: true, trust })).toBe(false);
    expect(scoreTrust(trust)).toBeGreaterThan(0.6);
    const exchange = createKnowledgeExchangePackage({
      from: { id: 'ann', userId: 'user_1', characterPackageId: 'ann', displayName: 'Ann', createdAt: 'now' },
      knowledge: [
        {
          id: 'knowledge_1',
          title: 'Shared concept',
          summary: 'A safe summary.',
          conceptIds: ['concept_1'],
          insightIds: ['insight_1'],
          journeyIds: [],
          experienceIds: [],
          references: [],
          confidence: 0.8,
          strength: 3,
          status: 'active',
          createdAt: 'now',
          updatedAt: 'now'
        }
      ],
      concepts: [
        {
          id: 'concept_1',
          key: 'shared',
          name: 'Shared concept',
          summary: 'Safe',
          topics: [],
          entities: [],
          relatedDiscoveryIds: [],
          firstSeenAt: 'now',
          lastSeenAt: 'now',
          strength: 1,
          status: 'active'
        }
      ],
      insights: [
        {
          id: 'insight_1',
          title: 'Insight',
          explanation: 'Safe',
          relatedConceptIds: ['concept_1'],
          relatedPatternIds: [],
          confidence: 0.8,
          growthValue: 80,
          createdAt: 'now',
          status: 'candidate'
        }
      ],
      journeySummaries: ['Journey summary only'],
      privacyLevel: 'shareable',
      explicitConsent: true,
      trust
    });

    expect(exchange?.concepts).toHaveLength(1);
    expect(exchange?.journeySummaries[0]).toBe('Journey summary only');
  });

  it('updates relationships from successful interactions and advances visits', () => {
    const relationship = updateRelationship(
      {
        id: 'rel_1',
        fromCompanionId: 'ann',
        toCompanionId: 'mira',
        stage: 'met',
        affinity: 0.45,
        successfulInteractions: 1,
        updatedAt: 'now'
      },
      'successful_exchange'
    );
    const visit = requestCompanionVisit({ fromCompanionId: 'ann', toCompanionId: 'mira', relationship });

    expect(relationship.stage).toBe('familiar');
    expect(advanceVisit(visit, true).state).toBe('permission_requested');
  });

  it('uses encrypted version-vector sync envelopes and detects conflicts', () => {
    const local = createSyncEnvelope<Record<string, unknown>>({ ownerUserId: 'user_1', payload: { title: 'Local', a: 1 }, deviceId: 'a' });
    const remote = createSyncEnvelope<Record<string, unknown>>({ ownerUserId: 'user_1', payload: { title: 'Remote', b: 2 }, deviceId: 'b' });
    const conflict = resolveSyncConflict(local, remote);

    expect(local.encrypted).toBe(true);
    expect(compareVersionVectors(local.versionVector, remote.versionVector)).toBe('conflict');
    expect('requiresReview' in conflict ? conflict.requiresReview : false).toBe(true);
  });
});
