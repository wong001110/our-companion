import { describe, expect, it } from 'vitest';
import type { DiscoveryCandidate, ExplorationCycle, ResearchIntent, ResearchPlan, ResearchSearchRecord, WebPageEvidence } from '@our-companion/shared';
import { DatabaseService } from './index';

const createdAt = '2026-07-18T00:00:00.000Z';

function intent(companionId: string, cycleId: string): ResearchIntent {
  return {
    id: `intent-${companionId}`,
    userId: 'default',
    companionId,
    cycleId,
    curiosityTargetId: `target-${companionId}`,
    topic: 'Local-first companion architecture',
    objective: 'find_implementation_examples',
    preferredSourceTypes: ['official', 'code'],
    domainHints: ['docs.example.test'],
    excludedDomains: ['excluded.example.test'],
    freshnessDays: 30,
    evidenceRequirements: { minimumSources: 2, requirePrimarySource: true, requireIndependentDomains: 2 },
    createdAt
  };
}

function plan(researchIntent: ResearchIntent): ResearchPlan {
  return {
    id: `plan-${researchIntent.companionId}`,
    userId: researchIntent.userId,
    companionId: researchIntent.companionId,
    cycleId: researchIntent.cycleId,
    researchIntentId: researchIntent.id,
    queries: ['local-first companion architecture'],
    selectedCapabilities: ['open-web-search', 'web-page-fetcher'],
    limits: {
      maxQueries: 3,
      maxSearchResultsPerQuery: 10,
      maxPagesToRead: 5,
      maxLinkDepth: 1,
      maxTotalCharacters: 50_000,
      timeoutMs: 10_000
    },
    createdAt
  };
}

function evidence(researchPlan: ResearchPlan): WebPageEvidence {
  return {
    id: `evidence-${researchPlan.companionId}`,
    userId: researchPlan.userId,
    companionId: researchPlan.companionId,
    cycleId: researchPlan.cycleId,
    researchIntentId: researchPlan.researchIntentId,
    researchPlanId: researchPlan.id,
    searchResultId: `result-${researchPlan.companionId}`,
    query: researchPlan.queries[0]!,
    provider: 'fixture-search',
    url: 'https://docs.example.test/article?ref=search',
    canonicalUrl: 'https://docs.example.test/article',
    domain: 'docs.example.test',
    title: 'A local-first companion implementation',
    extractedText: 'Readable evidence from the actual fetched page.',
    excerpt: 'Readable evidence from the actual fetched page.',
    contentHash: 'sha256:fixture',
    contentType: 'text/html',
    fetchedAt: createdAt,
    sourceType: 'official'
  };
}

function searchRecord(researchPlan: ResearchPlan): ResearchSearchRecord {
  return {
    id: `search-${researchPlan.companionId}`,
    userId: researchPlan.userId,
    companionId: researchPlan.companionId,
    cycleId: researchPlan.cycleId,
    researchIntentId: researchPlan.researchIntentId,
    researchPlanId: researchPlan.id,
    query: researchPlan.queries[0]!,
    provider: 'fixture-search',
    mode: 'fixture',
    status: 'completed',
    resultCount: 3,
    createdAt
  };
}

describe('research persistence', () => {
  it('round-trips research artifacts, preserves candidate provenance, and scopes reads to the cycle owner', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const aIntent = intent('companion-a', 'cycle-a');
    const aPlan = plan(aIntent);
    const aEvidence = evidence(aPlan);
    const aSearch = searchRecord(aPlan);
    const bIntent = intent('companion-b', 'cycle-b');

    db.insertResearchIntent(aIntent);
    db.insertResearchPlan(aPlan);
    db.insertResearchSearchRecord(aSearch);
    db.insertWebPageEvidence(aEvidence);
    db.insertResearchIntent(bIntent);

    const candidate: DiscoveryCandidate = {
      id: 'candidate-a',
      userId: 'default',
      companionId: 'companion-a',
      title: 'Evidence-backed candidate',
      summary: 'Built from readable page evidence.',
      sourceType: 'website',
      sourceUrl: aEvidence.canonicalUrl,
      sourceName: aEvidence.domain,
      agentType: 'research',
      relatedCuriosityTargetId: aIntent.curiosityTargetId,
      relevanceScore: 0.8,
      noveltyScore: 0.7,
      evidenceScore: 0.9,
      usefulnessScore: 0.8,
      researchPlanId: aPlan.id,
      evidenceIds: [aEvidence.id],
      collectedAt: createdAt
    };
    db.insertDiscoveryCandidate(candidate);

    const cycle: ExplorationCycle = {
      id: aIntent.cycleId,
      userId: 'default',
      companionId: aIntent.companionId,
      trigger: 'manual',
      state: 'collecting',
      curiosityTargetIds: [aIntent.curiosityTargetId],
      researchIntentId: aIntent.id,
      researchPlanId: aPlan.id,
      discoveryCandidateIds: [candidate.id],
      insightIds: [],
      startedAt: createdAt
    };
    db.insertExplorationCycle(cycle);

    expect(db.getResearchIntent(aIntent.id, 'companion-a')).toEqual(aIntent);
    expect(db.getResearchIntent(aIntent.id, 'companion-b')).toBeUndefined();
    expect(db.getResearchPlan(aPlan.id, 'companion-a')).toEqual(aPlan);
    expect(db.getResearchPlan(aPlan.id, 'companion-b')).toBeUndefined();
    expect(db.getResearchSearchRecord(aSearch.id, 'companion-a')).toEqual(aSearch);
    expect(db.getResearchSearchRecord(aSearch.id, 'companion-b')).toBeUndefined();
    expect(db.getWebPageEvidence(aEvidence.id, 'companion-a')).toEqual(aEvidence);
    expect(db.getWebPageEvidence(aEvidence.id, 'companion-b')).toBeUndefined();
    expect(db.listResearchIntents({ companionId: 'companion-a', cycleId: 'cycle-a' })).toEqual([aIntent]);
    expect(db.listResearchPlans({ companionId: 'companion-a', cycleId: 'cycle-a' })).toEqual([aPlan]);
    expect(db.listResearchSearchRecords({ companionId: 'companion-a', cycleId: 'cycle-a' })).toEqual([aSearch]);
    expect(db.listWebPageEvidence({ companionId: 'companion-a', cycleId: 'cycle-a' })).toEqual([aEvidence]);
    expect(db.listWebPageEvidence({ companionId: 'companion-b' })).toEqual([]);
    expect(db.getDiscoveryCandidate(candidate.id)).toEqual(candidate);
    expect(db.getExplorationCycle(cycle.id)).toEqual(cycle);
    db.close();
  });

  it('clears research artifacts as part of the autonomy debug reset', () => {
    const db = new DatabaseService({ path: ':memory:' });
    const researchIntent = intent('companion-a', 'cycle-a');
    const researchPlan = plan(researchIntent);
    db.insertResearchIntent(researchIntent);
    db.insertResearchPlan(researchPlan);
    db.insertResearchSearchRecord(searchRecord(researchPlan));
    db.insertWebPageEvidence(evidence(researchPlan));

    db.resetDebugData({ targets: ['autonomy'] });

    expect(db.listResearchIntents({ companionId: 'companion-a' })).toEqual([]);
    expect(db.listResearchPlans({ companionId: 'companion-a' })).toEqual([]);
    expect(db.listResearchSearchRecords({ companionId: 'companion-a' })).toEqual([]);
    expect(db.listWebPageEvidence({ companionId: 'companion-a' })).toEqual([]);
    db.close();
  });
});
