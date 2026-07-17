import { describe, expect, it, vi } from 'vitest';
import type { WebPageEvidence, WebSearchResult } from '@our-companion/shared';
import { ResearchAdapterError, type WebPageFetcher, type WebSearchProvider } from './researchAdapters';
import { ResearchOrchestrator } from './researchOrchestrator';

const target = {
  id: 'target', userId: 'user', companionId: 'owner', topic: 'Local-first AI companion', description: 'Find critical evidence.',
  source: 'memory_trigger' as const, explorationType: 'challenge' as const, priority: 0.8, confidence: 0.7,
  reason: 'Current memory', expectedValue: 'Evaluate limits', createdAt: '2026-07-18T00:00:00.000Z'
};

function result(id: string, domain: string, title: string, query: string): WebSearchResult {
  return { id, query, domain, title, url: `https://${domain}/${id}`, rank: 1, provider: 'fixture' };
}

const fetcher: WebPageFetcher = {
  id: 'fixture-page-fetcher', mode: 'fixture',
  async fetchPage(input) {
    const contrasting = /critical|limitations/i.test(input.searchResult.title);
    return {
      id: `evidence_${input.searchResult.id}`, userId: input.userId, companionId: input.companionId, cycleId: input.cycleId,
      researchIntentId: input.researchIntentId, researchPlanId: input.researchPlanId, searchResultId: input.searchResult.id,
      query: input.searchResult.query, provider: 'fixture', url: input.searchResult.url, canonicalUrl: input.searchResult.url,
      domain: input.searchResult.domain, title: input.searchResult.title,
      extractedText: contrasting ? 'Independent criticism identifies practical limitations and risk.' : 'Official implementation evidence describes offline-first architecture.',
      excerpt: contrasting ? 'Critical limitations and risk.' : 'Implementation evidence.', contentHash: `hash_${input.searchResult.id}`,
      contentType: 'text/html', fetchedAt: '2026-07-18T00:00:00.000Z', sourceType: input.sourceType
    };
  }
};

describe('ResearchOrchestrator', () => {
  it('performs one bounded contrasting-evidence pass and keeps all artifacts owned by the captured Companion', async () => {
    const search = vi.fn<WebSearchProvider['search']>(async ({ query }) => {
      if (/limitations criticism/.test(query)) return [result('critical', 'critique.example', 'Critical limitations', query)];
      return [
        result('official', 'docs.example', 'Official documentation', query),
        result('implementation', 'code.example', 'Implementation example', query)
      ];
    });
    const provider: WebSearchProvider = { id: 'fixture-search', mode: 'fixture', search };
    const orchestrator = new ResearchOrchestrator({ searchProvider: provider, pageFetcher: fetcher, structuredConnectors: [], now: () => new Date('2026-07-18T00:00:00.000Z') });
    const outcome = await orchestrator.run({ userId: 'user', companionId: 'owner', cycleId: 'cycle', curiosityTarget: target });

    expect(outcome.additionalPasses).toBe(1);
    expect(search.mock.calls.map(([input]) => input.query)).toContain('Local-first AI companion limitations criticism');
    expect(outcome.evidence).toHaveLength(3);
    expect(outcome.evidence.every((evidence) => evidence.companionId === 'owner' && evidence.cycleId === 'cycle')).toBe(true);
    expect(outcome.candidates.every((candidate) => candidate.companionId === 'owner' && candidate.evidenceIds?.length === 1)).toBe(true);
    expect(outcome.coverage.requirementsSatisfied).toBe(true);
  });

  it('treats unavailable search as an empty healthy research result without fake candidates', async () => {
    const provider: WebSearchProvider = { id: 'search', mode: 'unavailable', search: async () => [] };
    const orchestrator = new ResearchOrchestrator({ searchProvider: provider, pageFetcher: fetcher, structuredConnectors: [] });
    const outcome = await orchestrator.run({ userId: 'user', companionId: 'owner', cycleId: 'cycle', curiosityTarget: target });

    expect(outcome.evidence).toEqual([]);
    expect(outcome.candidates).toEqual([]);
    expect(outcome.stopReason).toBe('no_compatible_capability');
  });

  it('records a rate-limited provider as an empty evidence cycle without retries or fake candidates', async () => {
    const provider: WebSearchProvider = { id: 'search', mode: 'fixture', search: async () => { throw new ResearchAdapterError('rate_limited'); } };
    const orchestrator = new ResearchOrchestrator({ searchProvider: provider, pageFetcher: fetcher, structuredConnectors: [] });
    const outcome = await orchestrator.run({ userId: 'user', companionId: 'owner', cycleId: 'cycle', curiosityTarget: target });
    expect(outcome.searchRecords).toHaveLength(2);
    expect(outcome.searchRecords.every((record) => record.error === 'rate_limited')).toBe(true);
    expect(outcome.candidates).toEqual([]);
  });
});
