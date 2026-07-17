import type {
  CuriosityTarget,
  DiscoveryCandidate,
  ResearchCapabilityStatus,
  ResearchEvidenceCoverage,
  ResearchIntent,
  ResearchLimits,
  ResearchPlan,
  ResearchSourceType,
  SelectedResearchPage,
  WebPageEvidence,
  WebSearchResult
} from '@our-companion/shared';
import { createId, nowIso, toUnitScore } from '@our-companion/shared';
import { fingerprintDiscovery, normalizeDiscoveryUrl } from './index';

export type ResearchCapabilityKind = 'structured_connector' | 'open_web_search' | 'web_page_fetcher';

/** Application adapters describe themselves with this pure, credential-free shape. */
export interface ResearchCapability extends ResearchCapabilityStatus {
  kind: ResearchCapabilityKind;
}

export const DEFAULT_RESEARCH_LIMITS: Readonly<ResearchLimits> = {
  maxQueries: 3,
  maxSearchResultsPerQuery: 10,
  maxPagesToRead: 5,
  maxLinkDepth: 1,
  maxTotalCharacters: 250_000,
  timeoutMs: 10_000
};

const MAX_ADDITIONAL_PASSES = 1;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function sourcePreferences(target: CuriosityTarget): {
  objective: ResearchIntent['objective'];
  sources: ResearchSourceType[];
  requirements: ResearchIntent['evidenceRequirements'];
} {
  switch (target.explorationType) {
    case 'practical':
      return {
        objective: 'find_implementation_examples',
        sources: ['official', 'code', 'technical_article'],
        requirements: { minimumSources: 2, requirePrimarySource: true, requireIndependentDomains: 2 }
      };
    case 'deepening':
      return {
        objective: 'find_research_evidence',
        sources: ['official', 'research', 'technical_article'],
        requirements: { minimumSources: 2, requirePrimarySource: true, requireIndependentDomains: 2 }
      };
    case 'challenge':
    case 'opposite':
      return {
        objective: 'find_contrarian_evidence',
        sources: ['research', 'community', 'technical_article', 'open_web'],
        requirements: { minimumSources: 2, requireIndependentDomains: 2, requireContrastingSource: true }
      };
    case 'similar':
      return {
        objective: 'compare_approaches',
        sources: ['technical_article', 'code', 'community'],
        requirements: { minimumSources: 2, requireIndependentDomains: 2 }
      };
    case 'adjacent':
      return {
        objective: 'find_recent_developments',
        sources: ['news', 'rss', 'official', 'open_web'],
        requirements: { minimumSources: 1, requireIndependentDomains: 1 }
      };
  }
}

export function createResearchIntent(input: {
  userId: string;
  companionId: string;
  cycleId: string;
  curiosityTarget: CuriosityTarget;
  now?: string;
}): ResearchIntent {
  const preference = sourcePreferences(input.curiosityTarget);
  return {
    id: createId('research_intent'),
    userId: input.userId,
    companionId: input.companionId,
    cycleId: input.cycleId,
    curiosityTargetId: input.curiosityTarget.id,
    topic: input.curiosityTarget.topic.trim(),
    objective: preference.objective,
    preferredSourceTypes: preference.sources,
    evidenceRequirements: preference.requirements,
    createdAt: input.now ?? nowIso()
  };
}

export function routeResearchSources(intent: ResearchIntent, capabilities: ResearchCapability[]): ResearchCapability[] {
  const available = capabilities.filter((capability) => capability.available && capability.mode !== 'unavailable');
  const selected = available.filter((capability) => capability.kind === 'structured_connector' &&
    capability.sourceTypes.some((sourceType) => intent.preferredSourceTypes.includes(sourceType))
  );
  const needsOpenWeb = intent.preferredSourceTypes.some((sourceType) => sourceType !== 'network_public');
  const search = available.find((capability) => capability.kind === 'open_web_search');
  const fetcher = available.find((capability) => capability.kind === 'web_page_fetcher');
  if (needsOpenWeb && search && fetcher) return unique([...selected, search, fetcher]);
  return unique(selected);
}

function clampLimits(limits: Partial<ResearchLimits> = {}): ResearchLimits {
  const cap = DEFAULT_RESEARCH_LIMITS;
  const clampInteger = (value: number | undefined, max: number, minimum = 1) =>
    Math.min(max, Math.max(minimum, Math.floor(value ?? max)));
  return {
    maxQueries: clampInteger(limits.maxQueries, cap.maxQueries),
    maxSearchResultsPerQuery: clampInteger(limits.maxSearchResultsPerQuery, cap.maxSearchResultsPerQuery),
    maxPagesToRead: clampInteger(limits.maxPagesToRead, cap.maxPagesToRead),
    maxLinkDepth: clampInteger(limits.maxLinkDepth, cap.maxLinkDepth, 0),
    maxTotalCharacters: clampInteger(limits.maxTotalCharacters, cap.maxTotalCharacters, 1_000),
    timeoutMs: clampInteger(limits.timeoutMs, cap.timeoutMs, 1_000)
  };
}

function deterministicQueries(intent: ResearchIntent): string[] {
  const topic = intent.topic;
  const queries = [topic];
  if (intent.objective === 'find_implementation_examples') queries.push(`${topic} implementation example`);
  if (intent.objective === 'find_research_evidence') queries.push(`${topic} research evidence`);
  if (intent.objective === 'find_recent_developments') queries.push(`${topic} recent developments`);
  if (queries.length < 2) queries.push(`${topic} technical overview`);
  return unique(queries).slice(0, DEFAULT_RESEARCH_LIMITS.maxQueries);
}

export function createDeterministicResearchPlan(input: {
  intent: ResearchIntent;
  capabilities: ResearchCapability[];
  limits?: Partial<ResearchLimits>;
  now?: string;
}): ResearchPlan {
  const selected = routeResearchSources(input.intent, input.capabilities);
  return {
    id: createId('research_plan'),
    userId: input.intent.userId,
    companionId: input.intent.companionId,
    cycleId: input.intent.cycleId,
    researchIntentId: input.intent.id,
    queries: deterministicQueries(input.intent),
    selectedCapabilities: selected.map((capability) => capability.id),
    limits: clampLimits(input.limits),
    createdAt: input.now ?? nowIso()
  };
}

/** Invalid optional-AI output is deliberately ignored in favour of deterministic planning. */
export function validateAiResearchPlan(
  candidate: unknown,
  deterministic: ResearchPlan,
  capabilities: ResearchCapability[]
): ResearchPlan {
  if (!candidate || typeof candidate !== 'object') return deterministic;
  const record = candidate as Record<string, unknown>;
  const selectedCapabilities = Array.isArray(record.selectedCapabilities)
    ? record.selectedCapabilities.filter((id): id is string =>
      typeof id === 'string' && capabilities.some((capability) => capability.id === id && capability.available)
    )
    : deterministic.selectedCapabilities;
  const queries = Array.isArray(record.queries)
    ? record.queries.filter((query): query is string => typeof query === 'string' && query.trim().length > 0)
    : deterministic.queries;
  if (queries.length === 0 || selectedCapabilities.length === 0) return deterministic;
  return {
    ...deterministic,
    queries: unique(queries.map((query) => query.trim())).slice(0, DEFAULT_RESEARCH_LIMITS.maxQueries),
    selectedCapabilities,
    limits: clampLimits(typeof record.limits === 'object' && record.limits ? record.limits as Partial<ResearchLimits> : deterministic.limits)
  };
}

function isOfficialResult(result: WebSearchResult): boolean {
  return /(^|\.)(gov|edu|org)$/i.test(result.domain) || /docs|documentation|official/i.test(`${result.title} ${result.url}`);
}

function isContrastingResult(result: WebSearchResult): boolean {
  return /limitation|problem|criticism|risk|drawback|challenge|trade-?off/i.test(`${result.title} ${result.snippet ?? ''}`);
}

function sourceTypeForResult(result: WebSearchResult): ResearchSourceType {
  if (isOfficialResult(result)) return 'official';
  if (/github\.com$/i.test(result.domain)) return 'code';
  if (/arxiv\.org$|doi\.org$|\.edu$/i.test(result.domain)) return 'research';
  if (/reddit\.com$|news\.ycombinator\.com$/i.test(result.domain)) return 'community';
  return 'technical_article';
}

export function selectResearchPages(input: {
  intent: ResearchIntent;
  plan: ResearchPlan;
  results: WebSearchResult[];
  seenCanonicalUrls?: Set<string>;
}): SelectedResearchPage[] {
  const seen = input.seenCanonicalUrls ?? new Set<string>();
  const selected: SelectedResearchPage[] = [];
  const usedDomains = new Set<string>();
  const ranked = [...input.results]
    .filter((result) => !seen.has(normalizeDiscoveryUrl(result.url) ?? result.url))
    .filter((result) => !input.intent.excludedDomains?.some((domain) => result.domain === domain || result.domain.endsWith(`.${domain}`)))
    .sort((left, right) => {
      const priority = (result: WebSearchResult) =>
        (input.intent.evidenceRequirements.requirePrimarySource && isOfficialResult(result) ? 3 : 0) +
        (input.intent.evidenceRequirements.requireContrastingSource && isContrastingResult(result) ? 2 : 0) - result.rank / 100;
      return priority(right) - priority(left);
    });
  for (const result of ranked) {
    if (selected.length >= input.plan.limits.maxPagesToRead) break;
    if (usedDomains.has(result.domain) && usedDomains.size >= (input.intent.evidenceRequirements.requireIndependentDomains ?? 1)) continue;
    selected.push({
      searchResultId: result.id,
      reason: isOfficialResult(result) ? 'primary_source_preferred' : isContrastingResult(result) ? 'contrasting_evidence' : 'relevant_independent_result',
      expectedEvidenceType: sourceTypeForResult(result)
    });
    usedDomains.add(result.domain);
  }
  return selected;
}

export function evaluateEvidenceCoverage(intent: ResearchIntent, evidence: WebPageEvidence[]): ResearchEvidenceCoverage {
  const domains = new Set(evidence.map((item) => item.domain));
  const hasPrimarySource = evidence.some((item) => item.sourceType === 'official');
  const hasContrastingSource = evidence.some((item) => /limitation|problem|criticism|risk|drawback|challenge|trade-?off/i.test(`${item.title} ${item.excerpt}`));
  const missing: string[] = [];
  if (evidence.length < intent.evidenceRequirements.minimumSources) missing.push('minimum_sources');
  if (intent.evidenceRequirements.requirePrimarySource && !hasPrimarySource) missing.push('primary_source');
  if ((intent.evidenceRequirements.requireIndependentDomains ?? 1) > domains.size) missing.push('independent_domains');
  if (intent.evidenceRequirements.requireContrastingSource && !hasContrastingSource) missing.push('contrasting_source');
  return {
    sourceCount: evidence.length,
    independentDomainCount: domains.size,
    hasPrimarySource,
    hasContrastingSource,
    requirementsSatisfied: missing.length === 0,
    missing
  };
}

export function decideResearchContinuation(input: {
  intent: ResearchIntent;
  coverage: ResearchEvidenceCoverage;
  completedAdditionalPasses: number;
}): { action: 'continue' | 'stop'; query?: string; reason: string } {
  if (input.coverage.requirementsSatisfied) return { action: 'stop', reason: 'evidence_requirements_satisfied' };
  if (input.completedAdditionalPasses >= MAX_ADDITIONAL_PASSES) return { action: 'stop', reason: 'additional_pass_limit_reached' };
  if (input.coverage.missing.includes('contrasting_source')) return { action: 'continue', query: `${input.intent.topic} limitations criticism`, reason: 'contrasting_source_missing' };
  return { action: 'stop', reason: 'evidence_requirements_unmet' };
}

export function createDiscoveryCandidatesFromEvidence(input: {
  userId: string;
  companionId: string;
  curiosityTargetId: string;
  researchPlanId: string;
  evidence: WebPageEvidence[];
}): DiscoveryCandidate[] {
  return input.evidence
    .filter((item) => item.extractedText.trim().length > 0 && item.excerpt.trim().length > 0)
    .map((item) => ({
      id: createId('candidate'),
      userId: input.userId,
      companionId: input.companionId,
      title: item.title,
      summary: item.excerpt,
      sourceType: item.sourceType === 'code' ? 'github' : item.sourceType === 'community' ? 'community_discussion' : 'article',
      sourceUrl: item.canonicalUrl,
      sourceName: item.domain,
      agentType: 'research',
      relatedCuriosityTargetId: input.curiosityTargetId,
      relevanceScore: toUnitScore(0.78),
      noveltyScore: toUnitScore(0.72),
      evidenceScore: toUnitScore(0.8),
      usefulnessScore: toUnitScore(0.7),
      fingerprint: fingerprintDiscovery({ title: item.title, canonicalUrl: item.canonicalUrl, sourceType: item.sourceType }),
      researchPlanId: input.researchPlanId,
      evidenceIds: [item.id],
      rawEvidence: JSON.stringify({ evidenceId: item.id, contentHash: item.contentHash, domain: item.domain }),
      collectedAt: item.fetchedAt
    }));
}
