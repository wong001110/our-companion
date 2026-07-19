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
import { createHash } from 'node:crypto';
import { createId, nowIso, toUnitScore } from '@our-companion/shared';
import {
  createDeterministicResearchPlan,
  createDiscoveryCandidatesFromEvidence,
  createResearchIntent,
  decideResearchContinuation,
  evaluateEvidenceCoverage,
  fingerprintDiscovery,
  normalizeDiscoveryUrl,
  routeResearchSources,
  selectResearchPages,
  type DiscoveryBase,
  type DiscoveryConnector,
  type ExplorationIntent,
  type ResearchCapability,
  validateAiResearchPlan
} from '@our-companion/discovery-engine';
import type { WebPageFetcher, WebSearchProvider } from './researchAdapters';

class ResearchCycleTimeoutError extends Error {
  constructor() {
    super('research_cycle_timeout');
    this.name = 'ResearchCycleTimeoutError';
  }
}

function withCycleDeadline<T>(operation: Promise<T>, remainingMs: number): Promise<T> {
  if (remainingMs <= 0) return Promise.reject(new ResearchCycleTimeoutError());
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ResearchCycleTimeoutError()), remainingMs);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

function expandFeedEvidence(page: WebPageEvidence): WebPageEvidence[] {
  if (page.sourceType !== 'rss' || !page.feedItems?.length) return [page];
  return page.feedItems.map((item) => ({
    ...page,
    id: `feed_item:${createHash('sha256').update(`${page.id}:${item.externalId}`).digest('hex')}`,
    url: item.canonicalUrl,
    canonicalUrl: item.canonicalUrl,
    title: item.title,
    extractedText: item.summary,
    excerpt: item.summary.slice(0, 700),
    contentHash: item.contentHash,
    publishedAt: item.publishedAt,
    externalId: item.externalId,
    feedItems: undefined,
  }));
}

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
  /** Structured connector output is reported separately from fetched-page evidence coverage. */
  structuredCandidateCount: number;
  providerOutcomes: ResearchProviderOutcome[];
  stopReason: string;
  additionalPasses: number;
  usedBaseIds: string[];
  searchRecords: Array<{
    id: string; query: string; provider: string; providerMode: EngineProviderMode;
    status: 'completed' | 'empty' | 'failed'; resultCount: number; error?: string;
  }>;
}

function discoveryBaseUrl(base: DiscoveryBase): URL | undefined {
  const locator = base.locator.trim();
  if (!locator || base.scope === 'query') return undefined;
  try {
    const parsed = new URL(locator);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : undefined;
  } catch {
    if (base.scope !== 'domain' || !/^[a-z0-9.-]+$/i.test(locator)) return undefined;
    try {
      return new URL(`https://${locator}`);
    } catch {
      return undefined;
    }
  }
}

function discoveryBaseQuery(base: DiscoveryBase): string | undefined {
  if (base.scope !== 'query') return undefined;
  const query = base.locator.trim().replace(/\s+/g, ' ');
  return query.length >= 3 && query.length <= 500 ? query : undefined;
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

function stableContentValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map((item) => stableContentValue(item, seen));
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const normalized = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableContentValue(item, seen)])
    );
    seen.delete(value);
    return normalized;
  }
  return String(value);
}

function optionalStructuredString(
  value: unknown,
  keys: readonly string[],
): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }
  return undefined;
}

function structuredCandidate(input: {
  userId: string; companionId: string; curiosityTarget: CuriosityTarget; researchPlanId: string;
  connector: DiscoveryConnector; item: Record<string, unknown>; now: string;
}): DiscoveryCandidate | undefined {
  try {
    const normalized = input.connector.normalize(input.item);
    const canonicalUrl = normalizeDiscoveryUrl(normalized.url);
    const sourceType = input.connector.source === 'github' ? 'github' : input.connector.source === 'youtube' ? 'video' : input.connector.source === 'reddit' || input.connector.source === 'hackernews' ? 'community_discussion' : 'article';
    const publishedAt = normalized.publishedAt
      ?? optionalStructuredString(normalized.raw, ['publishedAt', 'published_at', 'updatedAt', 'updated_at']);
    const version = optionalStructuredString(normalized.raw, ['version', 'revision', 'release', 'tag']);
    const eventKey = optionalStructuredString(normalized.raw, ['eventKey', 'event_key', 'eventId', 'event_id']);
    const suppliedContentHash = optionalStructuredString(normalized.raw, ['contentHash', 'content_hash', 'sha', 'digest']);
    const contentHash = suppliedContentHash?.toLowerCase()
      ?? createHash('sha256').update(JSON.stringify(stableContentValue({
        title: normalized.title,
        summary: normalized.summary,
        publishedAt,
        version,
        raw: normalized.raw,
      }))).digest('hex');
    return {
      id: createId('candidate'), userId: input.userId, companionId: input.companionId,
      title: normalized.title, summary: normalized.summary ?? normalized.title,
      sourceType,
      sourceUrl: canonicalUrl ?? normalized.url, sourceName: input.connector.source, agentType: 'research',
      relatedCuriosityTargetId: input.curiosityTarget.id,
      relevanceScore: toUnitScore(0.7), noveltyScore: toUnitScore(0.65),
      evidenceScore: toUnitScore(normalized.summary ? 0.65 : 0.45), usefulnessScore: toUnitScore(0.6),
      researchPlanId: input.researchPlanId,
      fingerprint: fingerprintDiscovery({ title: normalized.title, canonicalUrl, sourceType }),
      rawEvidence: JSON.stringify({
        provider: input.connector.source,
        externalId: normalized.externalId,
        canonicalUrl,
        contentHash,
        publishedAt,
        version,
        eventKey,
      }),
      collectedAt: input.now
    };
  } catch { return undefined; }
}

/** Prefer fetched-page candidates, which retain directly fetched evidence provenance. */
function dedupeResearchCandidates(candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const deduplicated: DiscoveryCandidate[] = [];
  const indexByUrl = new Map<string, number>();
  const indexByFingerprint = new Map<string, number>();
  const indexByExternalId = new Map<string, number>();
  const readRaw = (candidate: DiscoveryCandidate): Record<string, unknown> => {
    try {
      return candidate.rawEvidence
        ? JSON.parse(candidate.rawEvidence) as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  };
  for (const candidate of candidates) {
    const canonicalUrl = normalizeDiscoveryUrl(candidate.sourceUrl);
    const candidateRaw = readRaw(candidate);
    const candidateExternalId = typeof candidateRaw.externalId === 'string'
      ? candidateRaw.externalId
      : undefined;
    // Deliberately omit source type here so the same page from a structured
    // connector and a fetched web page is one research candidate.
    const comparisonFingerprint = fingerprintDiscovery({ title: candidate.title, canonicalUrl });
    const urlIndex = canonicalUrl ? indexByUrl.get(canonicalUrl) : undefined;
    const urlMatchHasDifferentExternalId = urlIndex !== undefined
      && candidateExternalId !== undefined
      && (() => {
        const existingExternalId = readRaw(deduplicated[urlIndex]!).externalId;
        return typeof existingExternalId === 'string' && existingExternalId !== candidateExternalId;
      })();
    const existingIndex = (candidateExternalId ? indexByExternalId.get(candidateExternalId) : undefined)
      ?? (urlMatchHasDifferentExternalId ? undefined : urlIndex)
      ?? (candidateExternalId ? undefined : indexByFingerprint.get(comparisonFingerprint));
    if (existingIndex === undefined) {
      const index = deduplicated.length;
      deduplicated.push({ ...candidate, sourceUrl: canonicalUrl ?? candidate.sourceUrl });
      if (canonicalUrl) indexByUrl.set(canonicalUrl, index);
      if (candidateExternalId) indexByExternalId.set(candidateExternalId, index);
      indexByFingerprint.set(comparisonFingerprint, index);
      continue;
    }

    const existing = deduplicated[existingIndex]!;
    const existingRaw = readRaw(existing);
    const existingBaseIds = Array.isArray(existingRaw.discoveryBaseIds)
      ? existingRaw.discoveryBaseIds.filter((id): id is string => typeof id === 'string')
      : [];
    const candidateBaseIds = Array.isArray(candidateRaw.discoveryBaseIds)
      ? candidateRaw.discoveryBaseIds.filter((id): id is string => typeof id === 'string')
      : [];
    const preferCandidateSource = candidateBaseIds.length > 0
      || typeof candidateRaw.externalId === 'string';
    deduplicated[existingIndex] = {
      ...existing,
      sourceType: preferCandidateSource ? candidate.sourceType : existing.sourceType,
      sourceName: preferCandidateSource ? candidate.sourceName : existing.sourceName,
      fingerprint: preferCandidateSource ? candidate.fingerprint : existing.fingerprint,
      evidenceIds: [...new Set([...(existing.evidenceIds ?? []), ...(candidate.evidenceIds ?? [])])],
      relevanceScore: toUnitScore(Math.max(existing.relevanceScore, candidate.relevanceScore)),
      noveltyScore: toUnitScore(Math.max(existing.noveltyScore, candidate.noveltyScore)),
      evidenceScore: toUnitScore(Math.max(existing.evidenceScore, candidate.evidenceScore)),
      usefulnessScore: toUnitScore(Math.max(existing.usefulnessScore, candidate.usefulnessScore)),
      rawEvidence: JSON.stringify({
        ...existingRaw,
        ...candidateRaw,
        discoveryBaseIds: [...new Set([...existingBaseIds, ...candidateBaseIds])],
        mergedSourceNames: [...new Set(
          [existing.sourceName, candidate.sourceName].filter((value): value is string => Boolean(value))
        )],
      }),
    };
    if (canonicalUrl) indexByUrl.set(canonicalUrl, existingIndex);
    if (candidateExternalId) indexByExternalId.set(candidateExternalId, existingIndex);
    indexByFingerprint.set(comparisonFingerprint, existingIndex);
  }
  return deduplicated;
}

async function fetchSelectedPages(input: {
  selected: ReturnType<typeof selectResearchPages>;
  results: WebSearchResult[];
  fetcher: WebPageFetcher;
  owner: Pick<ResearchIntent, 'userId' | 'companionId' | 'cycleId' | 'id'>;
  plan: ResearchPlan;
  onTrace?: (event: ResearchTraceEvent) => void;
  remainingMs: () => number;
}): Promise<WebPageEvidence[]> {
  const byId = new Map(input.results.map((result) => [result.id, result]));
  const pending = input.selected.flatMap((selection) => {
    const result = byId.get(selection.searchResultId);
    return result ? [{ selection, result }] : [];
  });
  const evidence: WebPageEvidence[] = [];
  // Batches are globally bounded to 3 and contain at most one request per domain.
  while (pending.length > 0) {
    if (input.remainingMs() <= 0) {
      input.onTrace?.({ operation: 'web-page:fetch', status: 'skipped', providerMode: input.fetcher.mode, inputRefs: [], outputRefs: [], skipReason: 'research_cycle_timeout' });
      break;
    }
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
        const page = await withCycleDeadline(input.fetcher.fetchPage({
          searchResult: result, userId: input.owner.userId, companionId: input.owner.companionId,
          cycleId: input.owner.cycleId, researchIntentId: input.owner.id, researchPlanId: input.plan.id,
          sourceType: selection.expectedEvidenceType
        }), input.remainingMs());
        input.onTrace?.({ operation: 'web-page:fetch', status: 'completed', providerMode: input.fetcher.mode, inputRefs: [input.plan.id], outputRefs: [page.id] });
        input.onTrace?.({ operation: 'web-page:extract', status: 'completed', providerMode: input.fetcher.mode, inputRefs: [page.id], outputRefs: [page.contentHash] });
        return page;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        input.onTrace?.({ operation: 'web-page:fetch', status: 'skipped', providerMode: input.fetcher.mode, inputRefs: [input.plan.id], skipReason: reason });
        return undefined;
      }
    }));
    evidence.push(...fetched
      .filter((page): page is WebPageEvidence => Boolean(page))
      .flatMap(expandFeedEvidence));
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
    return toCapabilities(this.deps).map(({ id, kind, sourceTypes, mode, available }) => ({
      id,
      kind,
      sourceTypes,
      mode,
      available,
      reasonUnavailable: available
        ? undefined
        : kind === 'open_web_search'
          ? 'Search provider is not configured.'
          : 'Connector is not configured.',
    }));
  }

  async run(input: {
    userId: string;
    companionId: string;
    cycleId: string;
    curiosityTarget: CuriosityTarget;
    explorationIntent?: ExplorationIntent;
    discoveryBases?: readonly DiscoveryBase[];
    seenCanonicalUrls?: Set<string>;
    materialUpdateProbe?: boolean;
    onTrace?: (event: ResearchTraceEvent) => void;
  }): Promise<ResearchExecution> {
    const capabilities = toCapabilities(this.deps);
    const eligibleBases = (input.discoveryBases ?? [])
      .filter((base) =>
        base.companionId === input.companionId
        && (base.state === 'active' || base.state === 'trial')
      )
      .slice(0, 3);
    const baseUrls = new Map(
      eligibleBases.flatMap((base) => {
        const url = discoveryBaseUrl(base);
        return url ? [[base.id, url] as const] : [];
      })
    );
    const baseDomainHints = [...new Set(
      [...baseUrls.values()].map((url) => url.hostname.toLowerCase()).filter(Boolean)
    )];
    const baseQueries = eligibleBases
      .map(discoveryBaseQuery)
      .filter((query): query is string => Boolean(query));
    const baseIdsByQuery = new Map<string, string[]>();
    for (const base of eligibleBases) {
      const query = discoveryBaseQuery(base);
      if (!query) continue;
      baseIdsByQuery.set(query, [...(baseIdsByQuery.get(query) ?? []), base.id]);
    }
    const baseIntent = createResearchIntent({ ...input, now: this.now().toISOString() });
    const intent: ResearchIntent = input.explorationIntent
      ? {
        ...baseIntent,
        topic: input.explorationIntent.topic,
        objective: input.explorationIntent.mode === 'challenge'
          ? 'find_contrarian_evidence'
          : input.explorationIntent.mode === 'core'
            ? 'find_recent_developments'
            : 'compare_approaches',
        domainHints: [...new Set([...input.explorationIntent.domainHints, ...baseDomainHints])],
        freshnessDays: input.explorationIntent.freshness === 'breaking'
          ? 2
          : input.explorationIntent.freshness === 'recent'
            ? 30
            : undefined,
        evidenceRequirements: {
          minimumSources: input.explorationIntent.trustRequirement === 'open' ? 1 : 2,
          requirePrimarySource: input.explorationIntent.trustRequirement === 'primary',
          requireIndependentDomains: input.explorationIntent.trustRequirement === 'corroborated' ? 2 : 1,
          requireContrastingSource: input.explorationIntent.mode === 'challenge',
        },
      }
      : {
        ...baseIntent,
        domainHints: [...new Set([...(baseIntent.domainHints ?? []), ...baseDomainHints])],
      };
    input.onTrace?.({ operation: 'research-intent:create', status: 'completed', inputRefs: [input.curiosityTarget.id], outputRefs: [intent.id] });
    const deterministicBase = createDeterministicResearchPlan({ intent, capabilities, now: this.now().toISOString() });
    const deterministic = input.explorationIntent
      ? {
        ...deterministicBase,
        queries: [...new Set([...baseQueries, ...input.explorationIntent.searchTasks])]
          .filter(Boolean)
          .slice(0, deterministicBase.limits.maxQueries),
      }
      : {
        ...deterministicBase,
        queries: [...new Set([...baseQueries, ...deterministicBase.queries])]
          .slice(0, deterministicBase.limits.maxQueries),
      };
    let plan = deterministic;
    if (this.deps.refinePlan) {
      try { plan = validateAiResearchPlan(await this.deps.refinePlan({ intent, deterministicPlan: deterministic }), deterministic, capabilities); }
      catch { plan = deterministic; }
    }
    const availableCapabilityIds = new Set(
      capabilities.filter((capability) => capability.available).map((capability) => capability.id)
    );
    const baseCapabilityIds = eligibleBases.flatMap((base) => {
      const structuredId = `structured:${base.connectorId}`;
      if (availableCapabilityIds.has(structuredId)) return [structuredId];
      if (baseUrls.has(base.id) || discoveryBaseQuery(base)) {
        return [this.deps.searchProvider.id, this.deps.pageFetcher.id]
          .filter((id) => availableCapabilityIds.has(id));
      }
      return [];
    });
    plan = {
      ...plan,
      queries: [...new Set([...baseQueries, ...plan.queries])]
        .slice(0, plan.limits.maxQueries),
      selectedCapabilities: [...new Set([...plan.selectedCapabilities, ...baseCapabilityIds])],
    };
    input.onTrace?.({ operation: 'research-plan:create', status: 'completed', inputRefs: [intent.id], outputRefs: [plan.id] });
    const routed = routeResearchSources(intent, capabilities);
    input.onTrace?.({ operation: 'research-source:route', status: routed.length ? 'completed' : 'empty', inputRefs: [intent.id], outputRefs: routed.map((capability) => capability.id), skipReason: routed.length ? undefined : 'no_compatible_capability' });

    const providerOutcomes: ResearchProviderOutcome[] = [];
    const searchRecords: ResearchExecution['searchRecords'] = [];
    const selectedCapabilityIds = new Set(plan.selectedCapabilities);
    const selectedConnectors = this.deps.structuredConnectors.filter((connector) => selectedCapabilityIds.has(`structured:${connector.source}`));
    const structuredCandidates: DiscoveryCandidate[] = [];
    // The cycle deadline covers every external provider, including structured connectors.
    const deadline = Date.now() + plan.limits.timeoutMs;
    const remainingMs = () => deadline - Date.now();
    const usedBaseIds = new Set<string>();
    let searchesStarted = 0;
    let pageFetchesStarted = 0;
    let evidenceCharacters = 0;
    let budgetStopReason: string | undefined;
    for (const connector of selectedConnectors) {
      const matchingBases = eligibleBases.filter((base) => base.connectorId === connector.source);
      const requests = matchingBases.length
        ? matchingBases.map((base) => ({ query: base.locator, baseId: base.id }))
        : [{ query: plan.queries[0], baseId: undefined }];
      for (const request of requests.slice(0, plan.limits.maxQueries)) {
        try {
          if (request.baseId) usedBaseIds.add(request.baseId);
          const raw = await withCycleDeadline(
            connector.fetch({ query: request.query, limit: plan.limits.maxSearchResultsPerQuery }),
            remainingMs()
          );
          const candidates = raw.flatMap((item) => {
            const candidate = structuredCandidate({ userId: input.userId, companionId: input.companionId, curiosityTarget: input.curiosityTarget, researchPlanId: plan.id, connector, item, now: this.now().toISOString() });
            if (!candidate) return [];
            if (!request.baseId) return [candidate];
            const rawEvidence = candidate.rawEvidence
              ? JSON.parse(candidate.rawEvidence) as Record<string, unknown>
              : {};
            return [{
              ...candidate,
              rawEvidence: JSON.stringify({ ...rawEvidence, discoveryBaseIds: [request.baseId] }),
            }];
          });
          structuredCandidates.push(...candidates);
          providerOutcomes.push({ id: connector.source, providerMode: connector.providerMode, status: candidates.length ? 'completed' : 'empty', itemCount: candidates.length });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          if (error instanceof ResearchCycleTimeoutError) budgetStopReason ??= 'research_cycle_timeout';
          providerOutcomes.push({ id: connector.source, providerMode: connector.providerMode, status: 'failed', itemCount: 0, error: reason });
        }
      }
    }

    const baseIdsBySearchResult = new Map<string, string[]>();
    const results: WebSearchResult[] = eligibleBases.flatMap((base, index) => {
      const url = baseUrls.get(base.id);
      if (!url) return [];
      const id = `discovery-base:${base.id}`;
      baseIdsBySearchResult.set(id, [base.id]);
      return [{
        id,
        query: base.locator,
        domain: url.hostname.toLowerCase(),
        title: String(base.data.title ?? `Discovery base: ${url.hostname}`),
        url: url.toString(),
        rank: index,
        provider: `discovery-base:${base.connectorId}`,
      }];
    });
    const priorityBaseResultIds = new Set(baseIdsBySearchResult.keys());
    const evidence: WebPageEvidence[] = [];
    const seenUrls = input.seenCanonicalUrls ?? new Set<string>();
    // Keep the refresh allowlist fixed to URLs known before this cycle. URLs
    // fetched in the first pass join `seenUrls`, but must never be re-fetched
    // as update probes during the optional second pass.
    const historicalSeenUrls = new Set(seenUrls);
    const selectedCanonicalUrlsThisCycle = new Set<string>();
    const canSearch = selectedCapabilityIds.has(this.deps.searchProvider.id) && selectedCapabilityIds.has(this.deps.pageFetcher.id);
    const canFetchBaseUrls = baseIdsBySearchResult.size > 0
      && selectedCapabilityIds.has(this.deps.pageFetcher.id);
    const search = async (query: string) => {
      if (!canSearch) return;
      if (searchesStarted >= plan.limits.maxQueries) {
        budgetStopReason ??= 'query_limit_reached';
        input.onTrace?.({ operation: `web-search:${this.deps.searchProvider.id}`, status: 'skipped', providerMode: this.deps.searchProvider.mode, inputRefs: [plan.id], outputRefs: [], skipReason: budgetStopReason });
        return;
      }
      if (remainingMs() <= 0) {
        budgetStopReason ??= 'research_cycle_timeout';
        input.onTrace?.({ operation: `web-search:${this.deps.searchProvider.id}`, status: 'skipped', providerMode: this.deps.searchProvider.mode, inputRefs: [plan.id], outputRefs: [], skipReason: budgetStopReason });
        return;
      }
      searchesStarted += 1;
      const queryBaseIds = baseIdsByQuery.get(query) ?? [];
      for (const baseId of queryBaseIds) usedBaseIds.add(baseId);
      try {
        const found = await withCycleDeadline(
          this.deps.searchProvider.search({ query, limit: plan.limits.maxSearchResultsPerQuery, freshnessDays: intent.freshnessDays, domainHints: intent.domainHints, excludedDomains: intent.excludedDomains }),
          remainingMs()
        );
        for (const result of found) {
          if (!queryBaseIds.length) continue;
          const known = results.find(
            (item) => normalizeDiscoveryUrl(item.url) === normalizeDiscoveryUrl(result.url)
          );
          const resultId = known?.id ?? result.id;
          baseIdsBySearchResult.set(resultId, [
            ...new Set([...(baseIdsBySearchResult.get(resultId) ?? []), ...queryBaseIds]),
          ]);
        }
        const uniqueResults = found.filter((result) => !results.some((known) => normalizeDiscoveryUrl(known.url) === normalizeDiscoveryUrl(result.url)));
        results.push(...uniqueResults);
        providerOutcomes.push({ id: this.deps.searchProvider.id, providerMode: this.deps.searchProvider.mode, status: uniqueResults.length ? 'completed' : 'empty', itemCount: uniqueResults.length });
        const searchRecord = { id: createId('research_search'), query, provider: this.deps.searchProvider.id, providerMode: this.deps.searchProvider.mode, status: uniqueResults.length ? 'completed' as const : 'empty' as const, resultCount: uniqueResults.length };
        searchRecords.push(searchRecord);
        // Provider result IDs are transient handles. Engine Trace references only
        // the persisted operational record, never a provider result or selection.
        input.onTrace?.({ operation: `web-search:${this.deps.searchProvider.id}`, status: searchRecord.status, providerMode: this.deps.searchProvider.mode, inputRefs: [plan.id], outputRefs: [searchRecord.id], skipReason: uniqueResults.length ? undefined : 'no_search_results' });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (error instanceof ResearchCycleTimeoutError) budgetStopReason ??= 'research_cycle_timeout';
        providerOutcomes.push({ id: this.deps.searchProvider.id, providerMode: this.deps.searchProvider.mode, status: 'failed', itemCount: 0, error: reason });
        searchRecords.push({ id: createId('research_search'), query, provider: this.deps.searchProvider.id, providerMode: this.deps.searchProvider.mode, status: 'failed', resultCount: 0, error: reason });
        input.onTrace?.({ operation: `web-search:${this.deps.searchProvider.id}`, status: 'failed', providerMode: this.deps.searchProvider.mode, inputRefs: [plan.id], outputRefs: [], error: reason });
      }
    };

    if (canSearch) await Promise.all(plan.queries.slice(0, plan.limits.maxQueries).map(search));
    const fetchPass = async () => {
      const remainingPages = plan.limits.maxPagesToRead - pageFetchesStarted;
      const remainingCharacters = plan.limits.maxTotalCharacters - evidenceCharacters;
      if (remainingPages <= 0 || remainingCharacters <= 0 || remainingMs() <= 0) {
        budgetStopReason ??= remainingMs() <= 0 ? 'research_cycle_timeout' : remainingPages <= 0 ? 'page_limit_reached' : 'character_limit_reached';
        input.onTrace?.({ operation: 'web-search:select-results', status: 'skipped', inputRefs: [plan.id], outputRefs: [], skipReason: budgetStopReason });
        return;
      }
      const selectionSeenUrls = new Set([...seenUrls, ...selectedCanonicalUrlsThisCycle]);
      const selectionProbeAllowlist = new Set(
        [...historicalSeenUrls].filter((url) => !selectedCanonicalUrlsThisCycle.has(url))
      );
      const selected = selectResearchPages({
        intent,
        plan: { ...plan, limits: { ...plan.limits, maxPagesToRead: remainingPages } },
        results,
        seenCanonicalUrls: selectionSeenUrls,
        seenCanonicalUrlProbeAllowlist: selectionProbeAllowlist,
        seenCanonicalUrlProbeLimit: 1,
        preferSeenCanonicalUrlProbes: input.materialUpdateProbe,
        prioritySearchResultIds: priorityBaseResultIds,
      });
      for (const selection of selected) {
        const result = results.find((item) => item.id === selection.searchResultId);
        const canonicalUrl = result && (normalizeDiscoveryUrl(result.url) ?? result.url);
        if (canonicalUrl) selectedCanonicalUrlsThisCycle.add(canonicalUrl);
      }
      for (const selection of selected) {
        for (const baseId of baseIdsBySearchResult.get(selection.searchResultId) ?? []) {
          usedBaseIds.add(baseId);
        }
      }
      input.onTrace?.({ operation: 'web-search:select-results', status: selected.length ? 'completed' : 'empty', inputRefs: [plan.id], outputRefs: [], skipReason: selected.length ? undefined : 'no_selectable_results' });
      pageFetchesStarted += selected.length;
      const pages = await fetchSelectedPages({ selected, results, fetcher: this.deps.pageFetcher, owner: intent, plan, onTrace: input.onTrace, remainingMs });
      for (const page of pages) {
        const remaining = plan.limits.maxTotalCharacters - evidenceCharacters;
        if (remaining <= 0) {
          budgetStopReason ??= 'character_limit_reached';
          break;
        }
        const extractedText = page.extractedText.slice(0, remaining);
        if (!extractedText) continue;
        const excerpt = page.excerpt.slice(0, extractedText.length);
        const boundedPage = extractedText === page.extractedText
          ? page
          : { ...page, extractedText, excerpt, contentHash: createHash('sha256').update(extractedText).digest('hex') };
        seenUrls.add(normalizeDiscoveryUrl(boundedPage.canonicalUrl) ?? boundedPage.canonicalUrl);
        evidence.push(boundedPage);
        evidenceCharacters += extractedText.length;
      }
    };
    if (canSearch || canFetchBaseUrls) await fetchPass();
    let coverage = evaluateEvidenceCoverage(intent, evidence);
    input.onTrace?.({ operation: 'research-evidence:evaluate', status: coverage.requirementsSatisfied ? 'completed' : evidence.length ? 'skipped' : 'empty', inputRefs: evidence.map((page) => page.id), outputRefs: [], skipReason: coverage.requirementsSatisfied ? undefined : coverage.missing.join(',') || 'no_valid_external_evidence' });
    const continuation = decideResearchContinuation({ intent, coverage, completedAdditionalPasses: 0 });
    let additionalPasses = 0;
    // A failed provider must not trigger an immediate retry loop. A second pass is
    // allowed only after at least one completed search produced an evaluable result set.
    const hasCompletedSearch = searchRecords.some((record) => record.status === 'completed');
    if (canSearch && hasCompletedSearch && continuation.action === 'continue' && continuation.query &&
      searchesStarted < plan.limits.maxQueries && pageFetchesStarted < plan.limits.maxPagesToRead &&
      evidenceCharacters < plan.limits.maxTotalCharacters && remainingMs() > 0) {
      additionalPasses = 1;
      input.onTrace?.({ operation: 'research-pass:continue', status: 'completed', inputRefs: [plan.id], outputRefs: [], skipReason: continuation.reason });
      await search(continuation.query);
      await fetchPass();
      coverage = evaluateEvidenceCoverage(intent, evidence);
    } else if (canSearch && hasCompletedSearch && continuation.action === 'continue' && continuation.query) {
      budgetStopReason ??= remainingMs() <= 0 ? 'research_cycle_timeout'
        : searchesStarted >= plan.limits.maxQueries ? 'query_limit_reached'
        : pageFetchesStarted >= plan.limits.maxPagesToRead ? 'page_limit_reached'
        : 'character_limit_reached';
    }
    const stop = budgetStopReason
      ? { action: 'stop' as const, reason: budgetStopReason }
      : canSearch || canFetchBaseUrls
      ? decideResearchContinuation({ intent, coverage, completedAdditionalPasses: additionalPasses })
      : structuredCandidates.length > 0
        ? { action: 'stop' as const, reason: 'structured_research_completed' }
      : { action: 'stop' as const, reason: 'RESEARCH_NO_DISCOVERY_PROVIDER' };
    if (stop.reason === 'RESEARCH_NO_DISCOVERY_PROVIDER') {
      input.onTrace?.({
        operation: 'research:no-provider',
        status: 'empty',
        inputRefs: [plan.id],
        outputRefs: [],
        skipReason: 'RESEARCH_NO_DISCOVERY_PROVIDER',
      });
    }
    input.onTrace?.({ operation: 'research-pass:stop', status: 'completed', inputRefs: evidence.map((page) => page.id), outputRefs: [], skipReason: stop.reason });
    const fetchedCandidates = createDiscoveryCandidatesFromEvidence({
      userId: input.userId,
      companionId: input.companionId,
      curiosityTargetId: input.curiosityTarget.id,
      researchPlanId: plan.id,
      evidence,
    }).map((candidate) => {
      const baseIds = (candidate.evidenceIds ?? [])
        .flatMap((evidenceId) => {
          const page = evidence.find((item) => item.id === evidenceId);
          return page ? baseIdsBySearchResult.get(page.searchResultId) ?? [] : [];
        });
      if (!baseIds.length) return candidate;
      const rawEvidence = candidate.rawEvidence
        ? JSON.parse(candidate.rawEvidence) as Record<string, unknown>
        : {};
      return {
        ...candidate,
        rawEvidence: JSON.stringify({ ...rawEvidence, discoveryBaseIds: [...new Set(baseIds)] }),
      };
    });
    const candidates = dedupeResearchCandidates([
      ...fetchedCandidates,
      ...structuredCandidates
    ]);
    const completedPlan: ResearchPlan = {
      ...plan,
      outcome: { stopReason: stop.reason, additionalPasses: additionalPasses as 0 | 1, completedAt: this.now().toISOString() }
    };
    return {
      intent,
      plan: completedPlan,
      capabilities,
      evidence,
      candidates,
      coverage,
      structuredCandidateCount: structuredCandidates.length,
      providerOutcomes,
      stopReason: stop.reason,
      additionalPasses,
      usedBaseIds: [...usedBaseIds],
      searchRecords,
    };
  }
}
