import { describe, expect, it, vi } from 'vitest';
import type { WebPageEvidence, WebSearchResult } from '@our-companion/shared';
import type { DiscoveryBase, DiscoveryConnector } from '@our-companion/discovery-engine';
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
  it('executes a bounded durable structured base and records its lineage', async () => {
    const fetch = vi.fn(async () => [{
      id: 'rss-entry',
      title: 'Durable feed update',
      url: 'https://feed.example/items/1',
    }]);
    const connector: DiscoveryConnector = {
      source: 'rss',
      providerMode: 'fixture',
      fetch,
      normalize: (item) => ({
        source: 'rss',
        externalId: String(item.id),
        title: String(item.title),
        summary: 'A durable feed update.',
        url: String(item.url),
        tags: [],
        raw: item,
      }),
    };
    const base: DiscoveryBase = {
      id: 'base-rss',
      companionId: 'owner',
      connectorId: 'rss',
      scope: 'feed',
      locator: 'https://feed.example/rss.xml',
      data: {},
      origin: 'feed_detection',
      state: 'active',
      discoveredAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: { id: 'search', mode: 'unavailable', search: async () => [] },
      pageFetcher: { id: 'fetcher', mode: 'unavailable', fetchPage: async () => { throw new Error('unavailable'); } },
      structuredConnectors: [connector],
    });

    const outcome = await orchestrator.run({
      userId: 'user',
      companionId: 'owner',
      cycleId: 'cycle',
      curiosityTarget: target,
      discoveryBases: [base],
    });

    expect(fetch).toHaveBeenCalledWith({ query: base.locator, limit: 10 });
    expect(outcome.plan.selectedCapabilities).toContain('structured:rss');
    expect(outcome.usedBaseIds).toEqual(['base-rss']);
    expect(JSON.parse(outcome.candidates[0]?.rawEvidence ?? '{}')).toMatchObject({
      discoveryBaseIds: ['base-rss'],
    });
  });

  it('uses active generic-web bases as fetch targets and domain hints while ignoring inactive bases', async () => {
    const search = vi.fn<WebSearchProvider['search']>(async () => []);
    const provider: WebSearchProvider = { id: 'fixture-search', mode: 'fixture', search };
    const active: DiscoveryBase = {
      id: 'base-active',
      companionId: 'owner',
      connectorId: 'generic-web',
      scope: 'domain',
      locator: 'base.example',
      data: { title: 'Durable source' },
      origin: 'user',
      state: 'trial',
      discoveredAt: '2026-07-17T00:00:00.000Z',
      trialStartedAt: '2026-07-17T00:00:00.000Z',
      trialExpiresAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z',
    };
    const muted: DiscoveryBase = {
      ...active,
      id: 'base-muted',
      locator: 'muted.example',
      state: 'muted',
    };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: provider,
      pageFetcher: fetcher,
      structuredConnectors: [],
    });

    const outcome = await orchestrator.run({
      userId: 'user',
      companionId: 'owner',
      cycleId: 'cycle',
      curiosityTarget: target,
      discoveryBases: [active, muted],
    });

    expect(search).toHaveBeenCalled();
    expect(search.mock.calls.every(([input]) => input.domainHints?.includes('base.example'))).toBe(true);
    expect(search.mock.calls.every(([input]) => !input.domainHints?.includes('muted.example'))).toBe(true);
    expect(outcome.usedBaseIds).toEqual(['base-active']);
    expect(outcome.evidence).toEqual([
      expect.objectContaining({ canonicalUrl: 'https://base.example/' }),
    ]);
  });

  it('executes query-scoped generic-web bases and attaches their lineage to fetched candidates', async () => {
    const query = 'durable local-first research base';
    const search = vi.fn<WebSearchProvider['search']>(async (input) => [
      result('query-base-result', 'query-base.example', 'Query base evidence', input.query),
    ]);
    const base: DiscoveryBase = {
      id: 'base-query',
      companionId: 'owner',
      connectorId: 'generic-web',
      scope: 'query',
      locator: query,
      data: { purpose: 'personality-seed' },
      origin: 'personality',
      state: 'trial',
      discoveredAt: '2026-07-17T00:00:00.000Z',
      trialStartedAt: '2026-07-17T00:00:00.000Z',
      trialExpiresAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z',
    };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: { id: 'fixture-search', mode: 'fixture', search },
      pageFetcher: fetcher,
      structuredConnectors: [],
    });

    const outcome = await orchestrator.run({
      userId: 'user',
      companionId: 'owner',
      cycleId: 'cycle',
      curiosityTarget: target,
      discoveryBases: [base],
    });

    expect(outcome.plan.queries[0]).toBe(query);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query }));
    expect(outcome.usedBaseIds).toEqual(['base-query']);
    expect(JSON.parse(outcome.candidates[0]?.rawEvidence ?? '{}')).toMatchObject({
      discoveryBaseIds: ['base-query'],
    });
  });

  it('expands a fetched RSS document into independently identified item candidates', async () => {
    const feedUrl = 'https://feed.example.test/rss.xml';
    const feedBase: DiscoveryBase = {
      id: 'base-feed-items',
      companionId: 'owner',
      connectorId: 'rss',
      scope: 'feed',
      locator: feedUrl,
      data: {},
      origin: 'user',
      state: 'active',
      discoveredAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    };
    const feedFetcher: WebPageFetcher = {
      id: 'fixture-feed-fetcher',
      mode: 'fixture',
      async fetchPage(input) {
        return {
          id: 'feed-document',
          userId: input.userId,
          companionId: input.companionId,
          cycleId: input.cycleId,
          researchIntentId: input.researchIntentId,
          researchPlanId: input.researchPlanId,
          searchResultId: input.searchResult.id,
          query: input.searchResult.query,
          provider: 'fixture-feed',
          url: feedUrl,
          canonicalUrl: feedUrl,
          domain: 'feed.example.test',
          title: 'Fixture Feed',
          extractedText: 'Two independent entries.',
          excerpt: 'Two independent entries.',
          contentHash: 'feed-document-hash',
          contentType: 'application/rss+xml',
          fetchedAt: '2026-07-18T00:00:00.000Z',
          sourceType: 'rss',
          feedItems: [
            {
              externalId: 'entry-1',
              canonicalUrl: feedUrl,
              title: 'Same headline',
              summary: 'First independently tracked feed item.',
              contentHash: 'entry-1-hash',
            },
            {
              externalId: 'entry-2',
              canonicalUrl: feedUrl,
              title: 'Same headline',
              summary: 'Second independently tracked feed item.',
              contentHash: 'entry-2-hash',
            },
          ],
        };
      },
    };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: { id: 'fixture-search', mode: 'fixture', search: async () => [] },
      pageFetcher: feedFetcher,
      structuredConnectors: [],
    });

    const outcome = await orchestrator.run({
      userId: 'user',
      companionId: 'owner',
      cycleId: 'cycle',
      curiosityTarget: target,
      discoveryBases: [feedBase],
    });

    expect(outcome.usedBaseIds).toEqual(['base-feed-items']);
    expect(outcome.evidence).toHaveLength(2);
    expect(outcome.candidates).toHaveLength(2);
    expect(outcome.candidates.map((candidate) => JSON.parse(candidate.rawEvidence ?? '{}').externalId))
      .toEqual(['entry-1', 'entry-2']);
    expect(outcome.candidates.every((candidate) => (
      JSON.parse(candidate.rawEvidence ?? '{}').discoveryBaseIds?.[0] === feedBase.id
    ))).toBe(true);
  });

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
      fetch: async () => [{ id: 'github-item', title: 'Shared implementation', url: duplicateUrl, version: 'v2' }],
      normalize: (item) => ({
        source: 'github',
        externalId: String(item.id),
        title: String(item.title),
        summary: 'Structured summary.',
        url: String(item.url),
        tags: [],
        raw: item,
      })
    };
    const base: DiscoveryBase = {
      id: 'duplicate-structured-base',
      companionId: 'owner',
      connectorId: 'github',
      scope: 'query',
      locator: 'shared implementation',
      data: {},
      origin: 'user',
      state: 'active',
      discoveredAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    };
    const provider: WebSearchProvider = {
      id: 'fixture-search', mode: 'fixture',
      search: async (input) => [{ ...result('web', 'example.test', 'Shared implementation', input.query), url: duplicateUrl }]
    };
    const orchestrator = new ResearchOrchestrator({ searchProvider: provider, pageFetcher: fetcher, structuredConnectors: [connector] });

    const outcome = await orchestrator.run({
      userId: 'user', companionId: 'owner', cycleId: 'cycle',
      curiosityTarget: { ...target, explorationType: 'practical' },
      discoveryBases: [base],
    });

    expect(outcome.candidates).toHaveLength(1);
    expect(outcome.candidates[0]?.evidenceIds).toHaveLength(1);
    expect(outcome.candidates[0]).toEqual(expect.objectContaining({
      sourceName: 'github',
      sourceType: 'github',
    }));
    expect(JSON.parse(outcome.candidates[0]?.rawEvidence ?? '{}')).toEqual(expect.objectContaining({
      externalId: 'github-item',
      discoveryBaseIds: ['duplicate-structured-base'],
      mergedSourceNames: expect.arrayContaining(['github']),
    }));
    expect(outcome.usedBaseIds).toContain('duplicate-structured-base');
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

  it.each([
    { label: 'historical', seenCanonicalUrls: new Set(['https://base.example/feed']) },
    { label: 'new', seenCanonicalUrls: new Set<string>() },
  ])('fetches a $label selected Base only once across a forced second pass', async ({ seenCanonicalUrls }) => {
    const baseUrl = 'https://base.example/feed';
    const search = vi.fn<WebSearchProvider['search']>(async ({ query }) => {
      if (/limitations criticism/.test(query)) {
        return [result('critical', 'critique.example', 'Critical limitations', query)];
      }
      return [result('implementation', 'code.example', 'Implementation example', query)];
    });
    const fetchPage = vi.fn(fetcher.fetchPage);
    const base: DiscoveryBase = {
      id: 'base-page',
      companionId: 'owner',
      connectorId: 'generic-web',
      scope: 'page',
      locator: baseUrl,
      data: { title: 'Selected durable page' },
      origin: 'user',
      state: 'active',
      discoveredAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: { id: 'fixture-search', mode: 'fixture', search },
      pageFetcher: { ...fetcher, fetchPage },
      structuredConnectors: [],
    });

    const outcome = await orchestrator.run({
      userId: 'user',
      companionId: 'owner',
      cycleId: 'cycle',
      curiosityTarget: target,
      discoveryBases: [base],
      seenCanonicalUrls,
      materialUpdateProbe: true,
    });

    expect(outcome.additionalPasses).toBe(1);
    expect(fetchPage.mock.calls.filter(([input]) => input.searchResult.url === baseUrl)).toHaveLength(1);
    expect(outcome.usedBaseIds).toContain(base.id);
  });

  it('treats unavailable search as an empty healthy research result without fake candidates', async () => {
    const provider: WebSearchProvider = { id: 'search', mode: 'unavailable', search: async () => [] };
    const orchestrator = new ResearchOrchestrator({ searchProvider: provider, pageFetcher: fetcher, structuredConnectors: [] });
    const outcome = await orchestrator.run({ userId: 'user', companionId: 'owner', cycleId: 'cycle', curiosityTarget: target });

    expect(outcome.evidence).toEqual([]);
    expect(outcome.candidates).toEqual([]);
    expect(outcome.stopReason).toBe('RESEARCH_NO_DISCOVERY_PROVIDER');
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

  it('emits research_page_fetch debug event with bounded fields on success', async () => {
    const search = vi.fn<WebSearchProvider['search']>(async ({ query }) => [
      result('page-test', 'page.example', 'Test Page', query),
    ]);
    const provider: WebSearchProvider = { id: 'fixture-search', mode: 'fixture', search };
    const longFetcher: WebPageFetcher = {
      ...fetcher,
      fetchPage: vi.fn(async (input) => ({
        ...await fetcher.fetchPage(input),
        url: 'https://page.example/redirected',
        canonicalUrl: 'https://page.example/canonical',
        title: 'Test Page Title',
        publishedAt: '2026-07-20T00:00:00.000Z',
        extractedText: 'A'.repeat(5000),
        excerpt: 'B'.repeat(800),
        contentHash: 'abc123',
        contentType: 'text/html',
      })),
    };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: provider, pageFetcher: longFetcher, structuredConnectors: [],
    });
    const debugEvents: Array<import('@our-companion/shared').DeveloperDebugEventInput> = [];

    await orchestrator.run({
      userId: 'user', companionId: 'owner', cycleId: 'cycle',
      curiosityTarget: target,
      onDebugEvent: (event) => debugEvents.push(event),
    });

    const fetchEvent = debugEvents.find(
      (e) => e.kind === 'research_page_fetch' && e.status === 'completed'
    );
    expect(fetchEvent).toBeDefined();
    expect(fetchEvent!.summary).toBe('Fetched Test Page Title');
    const payload = fetchEvent!.payload!;
    expect(payload.searchResultId).toBe('page-test');
    expect(payload.requestedUrl).toBe('https://page.example/page-test');
    expect(payload.finalUrl).toBe('https://page.example/redirected');
    expect(payload.canonicalUrl).toBe('https://page.example/canonical');
    expect(payload.title).toBe('Test Page Title');
    expect(payload.publishedAt).toBe('2026-07-20T00:00:00.000Z');
    expect(payload.excerpt).toBe('B'.repeat(700));
    expect(payload.extractedText).toBe('A'.repeat(4000));
    expect(payload.characterCount).toBe(5000);
    expect(payload.truncated).toBe(true);
    expect(payload.contentHash).toBe('abc123');
    expect(payload.contentType).toBe('text/html');
    expect(typeof payload.durationMs).toBe('number');
    expect(String(payload.durationMs)).not.toMatch(/[<>]/);
  });

  it('emits research_page_fetch debug event with error fields on failure', async () => {
    const search = vi.fn<WebSearchProvider['search']>(async ({ query }) => [
      result('fail-test', 'fail.example', 'Fail Page', query),
    ]);
    const provider: WebSearchProvider = { id: 'fixture-search', mode: 'fixture', search };
    const failingFetcher: WebPageFetcher = {
      id: 'fixture-page-fetcher', mode: 'fixture',
      fetchPage: vi.fn(async () => { throw new ResearchAdapterError('rate_limited', 'Too many requests'); }),
    };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: provider, pageFetcher: failingFetcher, structuredConnectors: [],
    });
    const debugEvents: Array<import('@our-companion/shared').DeveloperDebugEventInput> = [];

    await orchestrator.run({
      userId: 'user', companionId: 'owner', cycleId: 'cycle',
      curiosityTarget: target,
      onDebugEvent: (event) => debugEvents.push(event),
    });

    const failEvent = debugEvents.find(
      (e) => e.kind === 'research_page_fetch' && e.status === 'failed'
    );
    expect(failEvent).toBeDefined();
    expect(failEvent!.summary).toBe('Failed to fetch https://fail.example/fail-test');
    expect(failEvent!.errorCode).toBe('rate_limited');
    expect(failEvent!.errorMessage).toBe('Too many requests');
    const payload = failEvent!.payload!;
    expect(payload.searchResultId).toBe('fail-test');
    expect(payload.requestedUrl).toBe('https://fail.example/fail-test');
    expect(typeof payload.durationMs).toBe('number');
  });

  it('truncates extractedText to 4000 chars and excerpt to 700 chars in debug event', async () => {
    const search = vi.fn<WebSearchProvider['search']>(async ({ query }) => [
      result('truncate', 'truncate.example', 'Truncate Page', query),
    ]);
    const provider: WebSearchProvider = { id: 'fixture-search', mode: 'fixture', search };
    const longTextFetcher: WebPageFetcher = {
      ...fetcher,
      fetchPage: vi.fn(async (input) => ({
        ...await fetcher.fetchPage(input),
        extractedText: 'X'.repeat(6000),
        excerpt: 'Y'.repeat(900),
        contentHash: 'truncate-hash',
        contentType: 'text/html',
      })),
    };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: provider, pageFetcher: longTextFetcher, structuredConnectors: [],
    });
    const debugEvents: Array<import('@our-companion/shared').DeveloperDebugEventInput> = [];

    await orchestrator.run({
      userId: 'user', companionId: 'owner', cycleId: 'cycle',
      curiosityTarget: target,
      onDebugEvent: (event) => debugEvents.push(event),
    });

    const fetchEvent = debugEvents.find(
      (e) => e.kind === 'research_page_fetch' && e.status === 'completed'
    );
    expect(fetchEvent).toBeDefined();
    expect((fetchEvent!.payload!.extractedText as string).length).toBe(4000);
    expect((fetchEvent!.payload!.excerpt as string).length).toBe(700);
    expect(fetchEvent!.payload!.characterCount).toBe(6000);
    expect(fetchEvent!.payload!.truncated).toBe(true);
  });

  it('captures requestedUrl vs finalUrl for redirected pages', async () => {
    const search = vi.fn<WebSearchProvider['search']>(async ({ query }) => [
      result('redirect', 'redirect.example', 'Redirect Page', query),
    ]);
    const provider: WebSearchProvider = { id: 'fixture-search', mode: 'fixture', search };
    const redirectFetcher: WebPageFetcher = {
      ...fetcher,
      fetchPage: vi.fn(async (input) => ({
        ...await fetcher.fetchPage(input),
        url: 'https://redirect.example/final-destination',
        canonicalUrl: 'https://redirect.example/canonical',
        extractedText: 'Redirected content.',
        excerpt: 'Redirected excerpt.',
        contentHash: 'redirect-hash',
        contentType: 'text/html',
      })),
    };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: provider, pageFetcher: redirectFetcher, structuredConnectors: [],
    });
    const debugEvents: Array<import('@our-companion/shared').DeveloperDebugEventInput> = [];

    await orchestrator.run({
      userId: 'user', companionId: 'owner', cycleId: 'cycle',
      curiosityTarget: target,
      onDebugEvent: (event) => debugEvents.push(event),
    });

    const fetchEvent = debugEvents.find(
      (e) => e.kind === 'research_page_fetch' && e.status === 'completed'
    );
    expect(fetchEvent).toBeDefined();
    expect(fetchEvent!.payload!.requestedUrl).toBe('https://redirect.example/redirect');
    expect(fetchEvent!.payload!.finalUrl).toBe('https://redirect.example/final-destination');
    expect(fetchEvent!.payload!.canonicalUrl).toBe('https://redirect.example/canonical');
  });

  it('does not include raw HTML in debug event payload', async () => {
    const search = vi.fn<WebSearchProvider['search']>(async ({ query }) => [
      result('html', 'html.example', 'HTML Page', query),
    ]);
    const provider: WebSearchProvider = { id: 'fixture-search', mode: 'fixture', search };
    const htmlFetcher: WebPageFetcher = {
      ...fetcher,
      fetchPage: vi.fn(async (input) => ({
        ...await fetcher.fetchPage(input),
        extractedText: 'Extracted text only',
        excerpt: 'Short excerpt',
        contentHash: 'html-hash',
        contentType: 'text/html',
      })),
    };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: provider, pageFetcher: htmlFetcher, structuredConnectors: [],
    });
    const debugEvents: Array<import('@our-companion/shared').DeveloperDebugEventInput> = [];

    await orchestrator.run({
      userId: 'user', companionId: 'owner', cycleId: 'cycle',
      curiosityTarget: target,
      onDebugEvent: (event) => debugEvents.push(event),
    });

    const fetchEvent = debugEvents.find(
      (e) => e.kind === 'research_page_fetch' && e.status === 'completed'
    );
    expect(fetchEvent).toBeDefined();
    const payloadJson = JSON.stringify(fetchEvent!.payload);
    expect(payloadJson).not.toMatch(/<html/i);
    expect(payloadJson).not.toMatch(/<body/i);
    expect(payloadJson).not.toMatch(/<div/i);
  });

  it('prefilters seen articles and never starts more than three web searches', async () => {
    const oldUrl = 'https://seen.example/article';
    const repeatedTitle = '温柔护理中的耐心观察与沟通方法';
    const freshUrl = 'https://fresh.example/new';
    const search = vi.fn<WebSearchProvider['search']>(async ({ query }) => [
      { id: `old-${query}`, query, domain: 'seen.example', title: 'Already seen article', url: `${oldUrl}?utm_source=again`, rank: 1, provider: 'fixture' },
      { id: `repeat-${query}`, query, domain: 'mirror.example', title: repeatedTitle, url: `https://mirror.example/${encodeURIComponent(query)}`, rank: 2, provider: 'fixture' },
      { id: `fresh-${query}`, query, domain: 'fresh.example', title: '急诊护理中的交接流程与风险管理', url: freshUrl, rank: 3, provider: 'fixture' },
    ]);
    const fetchedUrls: string[] = [];
    const pageFetcher: WebPageFetcher = {
      ...fetcher,
      fetchPage: vi.fn(async (input) => {
        fetchedUrls.push(input.searchResult.url);
        return fetcher.fetchPage(input);
      }),
    };
    const orchestrator = new ResearchOrchestrator({
      searchProvider: { id: 'fixture-search', mode: 'fixture', search },
      pageFetcher,
      structuredConnectors: [],
    });
    const outcome = await orchestrator.run({
      userId: 'user', companionId: 'owner', cycleId: 'cycle', curiosityTarget: target,
      dynamicPlatformTasks: Array.from({ length: 5 }, (_, index) => ({
        id: `task-${index}`, platformId: 'generic-web', query: `nursing query ${index}`,
        semanticQuery: `nursing query ${index}`, rationale: 'Find a different reliable source.',
      })),
      seenCanonicalUrls: new Set([oldUrl]),
      seenDiscoveryEntries: [
        { canonicalUrl: oldUrl, title: 'Already seen article' },
        { canonicalUrl: 'https://old.example/repeated', title: '温柔护理：耐心观察与沟通方法' },
      ],
      maxSearchAttempts: 99,
    });
    expect(search).toHaveBeenCalledTimes(3);
    expect(fetchedUrls).toContain(freshUrl);
    expect(fetchedUrls.some((url) => url.startsWith('https://mirror.example/'))).toBe(false);
    expect(fetchedUrls.filter((url) => normalizeDiscoveryUrl(url) === oldUrl)).toHaveLength(1);
    expect(outcome.candidates.some((candidate) => candidate.sourceUrl === freshUrl)).toBe(true);
    expect(outcome.candidates.some((candidate) => candidate.sourceUrl?.startsWith('https://mirror.example/'))).toBe(false);
    expect(outcome.searchRecords.every((record) => record.resultCount <= 2)).toBe(true);
  });

});
