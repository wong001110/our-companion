import type {
  CuriosityTarget,
  DiscoveryCandidate,
  EngineProviderMode,
  ResearchCapabilityStatus,
  ResearchEvidenceCoverage,
  ResearchIntent,
  ResearchPlan,
  WebPageEvidence,
  WebSearchResult
} from '@our-companion/shared';
import { createId, nowIso, toUnitScore } from '@our-companion/shared';
import {
  createDeterministicResearchPlan,
  createDiscoveryCandidatesFromEvidence,
  createResearchIntent,
  decideResearchContinuation,
  evaluateEvidenceCoverage,
  normalizeDiscoveryUrl,
  routeResearchSources,
  selectResearchPages,
  type DiscoveryConnector,
  type ResearchCapability,
  validateAiResearchPlan
} from '@our-companion/discovery-engine';
import type { WebPageFetcher, WebSearchProvider } from './researchAdapters';

export interface ResearchProviderOutcome {
  id: string;
  providerMode: EngineProviderMode;
  status: 'completed' | 'empty' | 'failed' | 'skipped';
  itemCount: number;
  error?: string;
}

export interface ResearchTraceEvent {
  operation: string;
  status: 'completed' | 'empty' | 'failed' | 'skipped';
  providerMode?: EngineProviderMode;
  inputRefs?: string[];
  outputRefs?: string[];
  skipReason?: string;
  error?: string;
}

export interface ResearchExecution {
  intent: ResearchIntent;
  plan: ResearchPlan;
  capabilities: ResearchCapabilityStatus[];
  evidence: WebPageEvidence[];
  candidates: DiscoveryCandidate[];
  coverage: ResearchEvidenceCoverage;
  providerOutcomes: ResearchProviderOutcome[];
  stopReason: string;
  additionalPasses: number;
  searchRecords: Array<{
    id: string; query: string; provider: string; providerMode: EngineProviderMode;
    status: 'completed' | 'empty' | 'failed'; resultCount: number; domains: string[]; error?: string;
  }>;
}

export interface ResearchOrchestratorDependencies {
  searchProvider: WebSearchProvider;
  pageFetcher: WebPageFetcher;
  structuredConnectors: DiscoveryConnector[];
  now?: () => Date;
  refinePlan?: (input: { intent: ResearchIntent; deterministicPlan: ResearchPlan }) => Promise<unknown>;
}

function connectorSourceTypes(connector: DiscoveryConnector): ResearchCapability['sourceTypes'] {
  switch (connector.source) {
    case 'github': return ['code'];
    case 'hackernews': return ['community', 'news'];
    case 'reddit': return ['community'];
    case 'youtube': return ['video'];
    case 'rss': return ['rss', 'technical_article'];
    default: return ['technical_article'];
  }
}

function toCapabilities(deps: ResearchOrchestratorDependencies): ResearchCapability[] {
  return [
    ...deps.structuredConnectors.map((connector) => ({
      id: `structured:${connector.source}`, kind: 'structured_connector' as const,
      sourceTypes: connectorSourceTypes(connector), mode: connector.providerMode,
      available: connector.providerMode !== 'unavailable'
    })),
    {
      id: deps.searchProvider.id, kind: 'open_web_search' as const, sourceTypes: ['official', 'code', 'research', 'technical_article', 'news', 'community', 'video', 'rss', 'open_web'],
      mode: deps.searchProvider.mode, available: deps.searchProvider.mode !== 'unavailable'
    },
    {
      id: deps.pageFetcher.id, kind: 'web_page_fetcher' as const, sourceTypes: ['official', 'code', 'research', 'technical_article', 'news', 'community', 'video', 'rss', 'open_web'],
      mode: deps.pageFetcher.mode, available: deps.pageFetcher.mode !== 'unavailable'
    }
  ];
}

function structuredCandidate(input: {
  userId: string; companionId: string; curiosityTarget: CuriosityTarget; researchPlanId: string;
  connector: DiscoveryConnector; item: Record<string, unknown>; now: string;
}): DiscoveryCandidate | undefined {
  try {
    const normalized = input.connector.normalize(input.item);
    const canonicalUrl = normalizeDiscoveryUrl(normalized.url);
    return {
      id: createId('candidate'), userId: input.userId, companionId: input.companionId,
      title: normalized.title, summary: normalized.summary ?? normalized.title,
      sourceType: input.connector.source === 'github' ? 'github' : input.connector.source === 'youtube' ? 'video' : input.connector.source === 'reddit' || input.connector.source === 'hackernews' ? 'community_discussion' : 'article',
      sourceUrl: canonicalUrl ?? normalized.url, sourceName: input.connector.source, agentType: 'research',
      relatedCuriosityTargetId: input.curiosityTarget.id,
      relevanceScore: toUnitScore(0.7), noveltyScore: toUnitScore(0.65),
      evidenceScore: toUnitScore(normalized.summary ? 0.65 : 0.45), usefulnessScore: toUnitScore(0.6),
      researchPlanId: input.researchPlanId,
      rawEvidence: JSON.stringify({ provider: input.connector.source, externalId: normalized.externalId, canonicalUrl }),
      collectedAt: input.now
    };
  } catch { return undefined; }
}

async function fetchSelectedPages(input: {
  selected: ReturnType<typeof selectResearchPages>;
  results: WebSearchResult[];
  fetcher: WebPageFetcher;
  owner: Pick<ResearchIntent, 'userId' | 'companionId' | 'cycleId' | 'id'>;
  plan: ResearchPlan;
  onTrace?: (event: ResearchTraceEvent) => void;
}): Promise<WebPageEvidence[]> {
  const byId = new Map(input.results.map((result) => [result.id, result]));
  const pending = input.selected.flatMap((selection) => {
    const result = byId.get(selection.searchResultId);
    return result ? [{ selection, result }] : [];
  });
  const evidence: WebPageEvidence[] = [];
  // Batches are globally bounded to 3 and contain at most one request per domain.
  while (pending.length > 0) {
    const domains = new Set<string>();
    const batch: typeof pending = [];
    for (let index = 0; index < pending.length && batch.length < 3;) {
      const item = pending[index]!;
      if (domains.has(item.result.domain)) { index += 1; continue; }
      pending.splice(index, 1);
      domains.add(item.result.domain);
      batch.push(item);
    }
    const fetched = await Promise.all(batch.map(async ({ selection, result }) => {
      try {
        const page = await input.fetcher.fetchPage({
          searchResult: result, userId: input.owner.userId, companionId: input.owner.companionId,
          cycleId: input.owner.cycleId, researchIntentId: input.owner.id, researchPlanId: input.plan.id,
          sourceType: selection.expectedEvidenceType
        });
        input.onTrace?.({ operation: 'web-page:fetch', status: 'completed', providerMode: input.fetcher.mode, inputRefs: [result.id], outputRefs: [page.id] });
        input.onTrace?.({ operation: 'web-page:extract', status: 'completed', providerMode: input.fetcher.mode, inputRefs: [page.id], outputRefs: [page.contentHash] });
        return page;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        input.onTrace?.({ operation: 'web-page:fetch', status: 'skipped', providerMode: input.fetcher.mode, inputRefs: [result.id], skipReason: reason });
        return undefined;
      }
    }));
    evidence.push(...fetched.filter((page): page is WebPageEvidence => Boolean(page)));
  }
  return evidence;
}

/** The sole application-layer executor for autonomous, read-only external research. */
export class ResearchOrchestrator {
  private readonly now: () => Date;
  constructor(private readonly deps: ResearchOrchestratorDependencies) {
    this.now = deps.now ?? (() => new Date());
  }

  getCapabilities(): ResearchCapabilityStatus[] {
    return toCapabilities(this.deps).map(({ id, sourceTypes, mode, available }) => ({ id, sourceTypes, mode, available }));
  }

  async run(input: {
    userId: string;
    companionId: string;
    cycleId: string;
    curiosityTarget: CuriosityTarget;
    seenCanonicalUrls?: Set<string>;
    onTrace?: (event: ResearchTraceEvent) => void;
  }): Promise<ResearchExecution> {
    const capabilities = toCapabilities(this.deps);
    const intent = createResearchIntent({ ...input, now: this.now().toISOString() });
    input.onTrace?.({ operation: 'research-intent:create', status: 'completed', inputRefs: [input.curiosityTarget.id], outputRefs: [intent.id] });
    const deterministic = createDeterministicResearchPlan({ intent, capabilities, now: this.now().toISOString() });
    let plan = deterministic;
    if (this.deps.refinePlan) {
      try { plan = validateAiResearchPlan(await this.deps.refinePlan({ intent, deterministicPlan: deterministic }), deterministic, capabilities); }
      catch { plan = deterministic; }
    }
    input.onTrace?.({ operation: 'research-plan:create', status: 'completed', inputRefs: [intent.id], outputRefs: [plan.id] });
    const routed = routeResearchSources(intent, capabilities);
    input.onTrace?.({ operation: 'research-source:route', status: routed.length ? 'completed' : 'empty', inputRefs: [intent.id], outputRefs: routed.map((capability) => capability.id), skipReason: routed.length ? undefined : 'no_compatible_capability' });

    const providerOutcomes: ResearchProviderOutcome[] = [];
    const searchRecords: ResearchExecution['searchRecords'] = [];
    const selectedCapabilityIds = new Set(plan.selectedCapabilities);
    const selectedConnectors = this.deps.structuredConnectors.filter((connector) => selectedCapabilityIds.has(`structured:${connector.source}`));
    const structuredCandidates: DiscoveryCandidate[] = [];
    for (const connector of selectedConnectors) {
      try {
        const raw = await connector.fetch({ query: plan.queries[0], limit: plan.limits.maxSearchResultsPerQuery });
        const candidates = raw.flatMap((item) => {
          const candidate = structuredCandidate({ userId: input.userId, companionId: input.companionId, curiosityTarget: input.curiosityTarget, researchPlanId: plan.id, connector, item, now: this.now().toISOString() });
          return candidate ? [candidate] : [];
        });
        structuredCandidates.push(...candidates);
        providerOutcomes.push({ id: connector.source, providerMode: connector.providerMode, status: candidates.length ? 'completed' : 'empty', itemCount: candidates.length });
      } catch (error) {
        providerOutcomes.push({ id: connector.source, providerMode: connector.providerMode, status: 'failed', itemCount: 0, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const results: WebSearchResult[] = [];
    const evidence: WebPageEvidence[] = [];
    const seenUrls = input.seenCanonicalUrls ?? new Set<string>();
    const canSearch = selectedCapabilityIds.has(this.deps.searchProvider.id) && selectedCapabilityIds.has(this.deps.pageFetcher.id);
    const search = async (query: string) => {
      if (!canSearch) return;
      try {
        const found = await this.deps.searchProvider.search({ query, limit: plan.limits.maxSearchResultsPerQuery, freshnessDays: intent.freshnessDays, domainHints: intent.domainHints, excludedDomains: intent.excludedDomains });
        const uniqueResults = found.filter((result) => !results.some((known) => normalizeDiscoveryUrl(known.url) === normalizeDiscoveryUrl(result.url)));
        results.push(...uniqueResults);
        providerOutcomes.push({ id: this.deps.searchProvider.id, providerMode: this.deps.searchProvider.mode, status: uniqueResults.length ? 'completed' : 'empty', itemCount: uniqueResults.length });
        searchRecords.push({ id: createId('research_search'), query, provider: this.deps.searchProvider.id, providerMode: this.deps.searchProvider.mode, status: uniqueResults.length ? 'completed' : 'empty', resultCount: uniqueResults.length, domains: [...new Set(uniqueResults.map((result) => result.domain))] });
        input.onTrace?.({ operation: `web-search:${this.deps.searchProvider.id}`, status: uniqueResults.length ? 'completed' : 'empty', providerMode: this.deps.searchProvider.mode, inputRefs: [plan.id], outputRefs: uniqueResults.map((result) => result.id), skipReason: uniqueResults.length ? undefined : 'no_search_results' });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        providerOutcomes.push({ id: this.deps.searchProvider.id, providerMode: this.deps.searchProvider.mode, status: 'failed', itemCount: 0, error: reason });
        searchRecords.push({ id: createId('research_search'), query, provider: this.deps.searchProvider.id, providerMode: this.deps.searchProvider.mode, status: 'failed', resultCount: 0, domains: [], error: reason });
        input.onTrace?.({ operation: `web-search:${this.deps.searchProvider.id}`, status: 'failed', providerMode: this.deps.searchProvider.mode, inputRefs: [plan.id], outputRefs: [], error: reason });
      }
    };

    if (canSearch) await Promise.all(plan.queries.slice(0, plan.limits.maxQueries).map(search));
    const fetchPass = async () => {
      const selected = selectResearchPages({ intent, plan, results, seenCanonicalUrls: seenUrls });
      input.onTrace?.({ operation: 'web-search:select-results', status: selected.length ? 'completed' : 'empty', inputRefs: results.map((result) => result.id), outputRefs: selected.map((selection) => selection.searchResultId), skipReason: selected.length ? undefined : 'no_selectable_results' });
      const pages = await fetchSelectedPages({ selected, results, fetcher: this.deps.pageFetcher, owner: intent, plan, onTrace: input.onTrace });
      for (const page of pages) seenUrls.add(normalizeDiscoveryUrl(page.canonicalUrl) ?? page.canonicalUrl);
      evidence.push(...pages);
    };
    if (canSearch) await fetchPass();
    let coverage = evaluateEvidenceCoverage(intent, evidence);
    input.onTrace?.({ operation: 'research-evidence:evaluate', status: coverage.requirementsSatisfied ? 'completed' : evidence.length ? 'skipped' : 'empty', inputRefs: evidence.map((page) => page.id), outputRefs: [], skipReason: coverage.requirementsSatisfied ? undefined : coverage.missing.join(',') || 'no_valid_external_evidence' });
    const continuation = decideResearchContinuation({ intent, coverage, completedAdditionalPasses: 0 });
    let additionalPasses = 0;
    // A failed provider must not trigger an immediate retry loop. A second pass is
    // allowed only after at least one completed search produced an evaluable result set.
    const hasCompletedSearch = searchRecords.some((record) => record.status === 'completed');
    if (canSearch && hasCompletedSearch && continuation.action === 'continue' && continuation.query) {
      additionalPasses = 1;
      input.onTrace?.({ operation: 'research-pass:continue', status: 'completed', inputRefs: [plan.id], outputRefs: [], skipReason: continuation.reason });
      await search(continuation.query);
      await fetchPass();
      coverage = evaluateEvidenceCoverage(intent, evidence);
    }
    const stop = canSearch
      ? decideResearchContinuation({ intent, coverage, completedAdditionalPasses: additionalPasses })
      : { action: 'stop' as const, reason: 'no_compatible_capability' };
    input.onTrace?.({ operation: 'research-pass:stop', status: 'completed', inputRefs: evidence.map((page) => page.id), outputRefs: [], skipReason: stop.reason });
    const candidates = [
      ...structuredCandidates,
      ...createDiscoveryCandidatesFromEvidence({ userId: input.userId, companionId: input.companionId, curiosityTargetId: input.curiosityTarget.id, researchPlanId: plan.id, evidence })
    ];
    const completedPlan: ResearchPlan = {
      ...plan,
      outcome: { stopReason: stop.reason, additionalPasses: additionalPasses as 0 | 1, completedAt: this.now().toISOString() }
    };
    return { intent, plan: completedPlan, capabilities, evidence, candidates, coverage, providerOutcomes, stopReason: stop.reason, additionalPasses, searchRecords };
  }
}
