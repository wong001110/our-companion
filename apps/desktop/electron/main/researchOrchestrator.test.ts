import { describe, expect, it, vi } from 'vitest';
import type { WebPageEvidence, WebSearchResult } from '@our-companion/shared';
import type { DiscoveryConnector } from '@our-companion/discovery-engine';
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
      researchIntentId: input.researchIntentId, researchPlanId: input.researchPlanId,
      searchResultId: input.searchResult.id, query: input.searchResult.query, provider: 'fixture', url: input.searchResult.url, canonicalUrl: input.searchResult.url,
      domain: input.searchResult.domain, title: input.searchResult.title,
      extractedText: contrasting ? 'Independent criticism identifies practical limitations and risk.' : 'Official implementation evidence describes offline-first architecture.',
      excerpt: contrasting ? 'Critical limitations and risk.' : 'Implementation evidence.', contentHash: `hash_${input.searchResult.id}`,
      contentType: 'text/html', fetchedAt: '2026-07-18T00:00:00.000Z', sourceType: input.sourceType
    };
  }
};

describe('ResearchOrchestrator', () => {
  it('treats successful structured-only output as compatible while keeping page coverage separate', async () => {
    const connector: DiscoveryConnector = {
      source: 'github', providerMode: 'fixture',
      fetch: async () => [{ id: 'structured', title: 'Typed local-first implementation', url: 'https://github.com/example/companion' }],
      normalize: (item) => ({
        source: 'github', title: String(item.title), summary: 'A structured implementation reference.',
        url: String(item.url), tags: ['typescript'], raw: item
      })
    };
    const unavailableSearch: WebSearchProvider = { id: 'brave-web-search', mode: 'unavailable', search: async () => [] };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: unavailableSearch,
      pageFetcher: { id: 'safe-web-page-fetcher', mode: 'unavailable', fetchPage: async () => { throw new Error('unavailable'); } },
      structuredConnectors: [connector]
    });

    const outcome = await orchestrator.run({
      userId: 'user', companionId: 'owner', cycleId: 'cycle',
      curiosityTarget: { ...target, explorationType: 'practical' }
    });

    expect(outcome.stopReason).toBe('structured_research_completed');
    expect(outcome.structuredCandidateCount).toBe(1);
    expect(outcome.coverage.sourceCount).toBe(0);
    expect(outcome.candidates).toEqual([expect.objectContaining({ sourceUrl: 'https://github.com/example/companion' })]);
  });

  it('deduplicates structured and fetched-page candidates by canonical URL', async () => {
    const duplicateUrl = 'https://example.test/implementation?utm_source=structured';
    const connector: DiscoveryConnector = {
      source: 'github', providerMode: 'fixture',
      fetch: async () => [{ title: 'Shared implementation', url: duplicateUrl }],
      normalize: (item) => ({ source: 'github', title: String(item.title), summary: 'Structured summary.', url: String(item.url), tags: [], raw: item })
    };
    const provider: WebSearchProvider = {
      id: 'fixture-search', mode: 'fixture',
      search: async (input) => [{ ...result('web', 'example.test', 'Shared implementation', input.query), url: duplicateUrl }]
    };
    const orchestrator = new ResearchOrchestrator({ searchProvider: provider, pageFetcher: fetcher, structuredConnectors: [connector] });

    const outcome = await orchestrator.run({
      userId: 'user', companionId: 'owner', cycleId: 'cycle',
      curiosityTarget: { ...target, explorationType: 'practical' }
    });

    expect(outcome.candidates).toHaveLength(1);
    expect(outcome.candidates[0]?.evidenceIds).toHaveLength(1);
  });

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

  it('keeps successful structured research distinct from web evidence coverage', async () => {
    const connector: DiscoveryConnector = {
      source: 'hackernews',
      providerMode: 'fixture',
      fetch: async () => [{ id: 'hn-1' }],
      normalize: () => ({
        source: 'hackernews', externalId: 'hn-1', title: 'A community perspective',
        summary: 'A useful independent perspective.', url: 'https://news.example/item/hn-1', tags: [], raw: {}
      })
    };
    const provider: WebSearchProvider = { id: 'search', mode: 'unavailable', search: async () => [] };
    const unavailableFetcher: WebPageFetcher = { id: 'fetcher', mode: 'unavailable', fetchPage: async () => { throw new Error('unavailable'); } };
    const orchestrator = new ResearchOrchestrator({ searchProvider: provider, pageFetcher: unavailableFetcher, structuredConnectors: [connector] });

    const outcome = await orchestrator.run({ userId: 'user', companionId: 'owner', cycleId: 'cycle', curiosityTarget: target });

    expect(outcome.stopReason).toBe('structured_research_completed');
    expect(outcome.structuredCandidateCount).toBe(1);
    expect(outcome.coverage.sourceCount).toBe(0);
    expect(outcome.candidates[0]?.fingerprint).toMatch(/^fp_/);
  });

  it('records a rate-limited provider as an empty evidence cycle without retries or fake candidates', async () => {
    const provider: WebSearchProvider = { id: 'search', mode: 'fixture', search: async () => { throw new ResearchAdapterError('rate_limited'); } };
    const orchestrator = new ResearchOrchestrator({ searchProvider: provider, pageFetcher: fetcher, structuredConnectors: [] });
    const outcome = await orchestrator.run({ userId: 'user', companionId: 'owner', cycleId: 'cycle', curiosityTarget: target });
    expect(outcome.searchRecords).toHaveLength(2);
    expect(outcome.searchRecords.every((record) => record.error === 'rate_limited')).toBe(true);
    expect(outcome.candidates).toEqual([]);
  });

  it('enforces query, page, and character limits across the entire cycle, including a possible second pass', async () => {
    const search = vi.fn<WebSearchProvider['search']>(async ({ query }) => [
      result('official', 'docs.example', 'Official documentation', query),
      result('implementation', 'code.example', 'Implementation example', query)
    ]);
    const limitedFetcher: WebPageFetcher = {
      ...fetcher,
      fetchPage: vi.fn(async (input) => ({
        ...await fetcher.fetchPage(input),
        extractedText: 'x'.repeat(1_200),
        excerpt: 'x'.repeat(700),
        contentHash: 'unbounded'
      }))
    };
    const provider: WebSearchProvider = { id: 'search', mode: 'fixture', search };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: provider,
      pageFetcher: limitedFetcher,
      structuredConnectors: [],
      refinePlan: async ({ deterministicPlan }) => ({
        queries: deterministicPlan.queries,
        selectedCapabilities: deterministicPlan.selectedCapabilities,
        limits: { maxQueries: 1, maxPagesToRead: 1, maxTotalCharacters: 1_000 }
      })
    });

    const outcome = await orchestrator.run({ userId: 'user', companionId: 'owner', cycleId: 'cycle', curiosityTarget: target });

    expect(search).toHaveBeenCalledTimes(1);
    expect(limitedFetcher.fetchPage).toHaveBeenCalledTimes(1);
    expect(outcome.additionalPasses).toBe(0);
    expect(outcome.stopReason).toBe('query_limit_reached');
    expect(outcome.evidence).toHaveLength(1);
    expect(outcome.evidence.reduce((total, page) => total + page.extractedText.length, 0)).toBeLessThanOrEqual(1_000);
  });

  it('stops provider work when the cycle timeout expires', async () => {
    vi.useFakeTimers();
    try {
      const search = vi.fn<WebSearchProvider['search']>(() => new Promise<WebSearchResult[]>(() => undefined));
      const provider: WebSearchProvider = { id: 'search', mode: 'fixture', search };
      const orchestrator = new ResearchOrchestrator({
        searchProvider: provider,
        pageFetcher: fetcher,
        structuredConnectors: [],
        refinePlan: async ({ deterministicPlan }) => ({
          queries: deterministicPlan.queries,
          selectedCapabilities: deterministicPlan.selectedCapabilities,
          limits: { timeoutMs: 1_000 }
        })
      });

      const pending = orchestrator.run({ userId: 'user', companionId: 'owner', cycleId: 'cycle', curiosityTarget: target });
      await vi.advanceTimersByTimeAsync(1_000);
      const outcome = await pending;

      expect(search).toHaveBeenCalledTimes(2);
      expect(outcome.stopReason).toBe('research_cycle_timeout');
      expect(outcome.searchRecords.every((record) => record.error === 'research_cycle_timeout')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts the cycle deadline before structured connector work', async () => {
    vi.useFakeTimers();
    try {
      const connector: DiscoveryConnector = {
        source: 'hackernews',
        providerMode: 'fixture',
        fetch: () => new Promise<Record<string, unknown>[]>(() => undefined),
        normalize: () => { throw new Error('not reached'); }
      };
      const provider: WebSearchProvider = { id: 'search', mode: 'unavailable', search: async () => [] };
      const unavailableFetcher: WebPageFetcher = { id: 'fetcher', mode: 'unavailable', fetchPage: async () => { throw new Error('unavailable'); } };
      const orchestrator = new ResearchOrchestrator({
        searchProvider: provider,
        pageFetcher: unavailableFetcher,
        structuredConnectors: [connector],
        refinePlan: async ({ deterministicPlan }) => ({
          queries: deterministicPlan.queries,
          selectedCapabilities: deterministicPlan.selectedCapabilities,
          limits: { timeoutMs: 1_000 }
        })
      });

      const pending = orchestrator.run({ userId: 'user', companionId: 'owner', cycleId: 'cycle', curiosityTarget: target });
      await vi.advanceTimersByTimeAsync(1_000);
      const outcome = await pending;

      expect(outcome.stopReason).toBe('research_cycle_timeout');
      expect(outcome.providerOutcomes).toEqual([expect.objectContaining({ id: 'hackernews', status: 'failed', error: 'research_cycle_timeout' })]);
    } finally {
      vi.useRealTimers();
    }
  });
});
