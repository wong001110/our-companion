import type {
  CaptureSignalInput,
  CharacterProfile,
  CuriosityTarget,
  Discovery,
  DiscoveryAgentType,
  DiscoveryCandidate,
  DiscoveryOrigin,
  DiscoveryScores,
  DiscoverySource,
  EngineProviderMode,
  DuplicateResult,
  NormalizedSignal,
  NormalizedDiscovery,
  Signal,
  SignalEngine
} from '@our-companion/shared';
import { createId, nowIso, toUnitScore } from '@our-companion/shared';

export * from './research';
export * from './adaptiveDiscovery';
export * from './discoveryBases';
export * from './discoverySeen';
export * from './discoveryContext';
export * from './sourceManagement';
export * from './discoveryPlatformPresets';
export * from './curatedDiscoveryFeeds';
export * from './companionDiscoverySeed';
export * from './discoveryResearchPlanner';

export interface DiscoveryFetchInput {
  query?: string;
  limit?: number;
}

export type RawDiscoveryItem = Record<string, unknown>;

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'ref_src',
  'fbclid',
  'gclid'
]);

export interface DiscoveryConnector {
  source: DiscoverySource;
  providerMode: EngineProviderMode;
  fetch(input: DiscoveryFetchInput): Promise<RawDiscoveryItem[]>;
  normalize(item: RawDiscoveryItem): NormalizedDiscovery;
}

export interface RankingContext {
  userInterests: string[];
  recentMemoryTags: string[];
  activeCharacter: Pick<CharacterProfile, 'expertise'>;
  seenUrls?: Set<string>;
}

function matchScore(tags: string[], values: string[], fallback: number): number {
  if (values.length === 0 || tags.length === 0) return fallback;
  const normalizedTags = tags.map((tag) => tag.toLowerCase());
  const matches = values.filter((value) => normalizedTags.includes(value.toLowerCase())).length;
  return toUnitScore(matches / Math.max(values.length, 1));
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizedWords(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export function normalizeDiscoveryUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';

    if (parsed.hostname === 'github.com') {
      const [, owner, repo] = parsed.pathname.split('/');
      if (owner && repo) {
        parsed.pathname = `/${owner.toLowerCase()}/${repo.toLowerCase()}`;
        parsed.search = '';
      }
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}

export function fingerprintDiscovery(input: {
  title: string;
  canonicalUrl?: string;
  entities?: string[];
  topics?: string[];
  sourceType?: string;
}): string {
  const parts = [
    normalizedWords(input.title),
    input.canonicalUrl ?? '',
    ...(input.entities ?? []).map(normalizedWords).sort(),
    ...(input.topics ?? []).map(normalizedWords).sort(),
    input.sourceType ?? ''
  ];
  return `fp_${stableHash(parts.join('|'))}`;
}

export function qualityScoreForSignal(signal: Pick<Signal, 'title' | 'summary' | 'url' | 'rawContent'>): number {
  const titleScore = signal.title.trim().length >= 8 ? 0.35 : 0.1;
  const summaryScore = (signal.summary ?? signal.rawContent ?? '').trim().length >= 24 ? 0.35 : 0.1;
  const urlScore = signal.url ? 0.15 : 0;
  const specificityScore = /\b(how|why|guide|release|architecture|pattern|research|example)\b/i.test(
    `${signal.title} ${signal.summary ?? ''}`
  )
    ? 0.15
    : 0.08;
  return toUnitScore(titleScore + summaryScore + urlScore + specificityScore);
}

export function captureSignal(input: CaptureSignalInput): Signal {
  return {
    id: createId('signal'),
    sourceType: input.sourceType,
    provider: input.provider,
    title: input.title.trim(),
    summary: input.summary?.trim(),
    url: input.url,
    rawContent: input.rawContent,
    capturedAt: nowIso(),
    metadata: input.metadata
  };
}

export function normalizeSignal(signal: Signal): NormalizedSignal {
  return {
    ...signal,
    canonicalUrl: normalizeDiscoveryUrl(signal.url),
    normalizedTitle: normalizedWords(signal.title),
    qualityScore: qualityScoreForSignal(signal)
  };
}

export function createSignalEngine(): SignalEngine {
  return {
    async capture(input) {
      return captureSignal(input);
    },
    async normalize(signal) {
      return normalizeSignal(signal);
    }
  };
}

function sourceTypeFromDiscoverySource(source: DiscoverySource): Signal['sourceType'] {
  if (source === 'github') return 'github';
  if (source === 'youtube') return 'youtube';
  if (source === 'reddit' || source === 'hackernews') return 'community';
  return 'internet';
}

export function signalFromNormalizedDiscovery(discovery: NormalizedDiscovery): Signal {
  return captureSignal({
    sourceType: sourceTypeFromDiscoverySource(discovery.source),
    provider: discovery.source,
    title: discovery.title,
    summary: discovery.summary,
    url: discovery.url,
    rawContent: JSON.stringify(discovery.raw),
    metadata: {
      externalId: discovery.externalId,
      tags: discovery.tags,
      publishedAt: discovery.publishedAt
    }
  });
}

export function passesDiscoveryQuality(signal: NormalizedSignal, minimumScore = 0.45): boolean {
  return signal.qualityScore >= minimumScore;
}

export function checkDuplicateDiscovery(
  candidate: Pick<Discovery, 'id' | 'canonicalUrl' | 'fingerprint' | 'title'>,
  existing: Array<Pick<Discovery, 'id' | 'canonicalUrl' | 'fingerprint' | 'title'>>
): DuplicateResult {
  const titleWords = new Set(normalizedWords(candidate.title).split(/\s+/).filter(Boolean));

  for (const item of existing) {
    if (candidate.canonicalUrl && item.canonicalUrl === candidate.canonicalUrl) {
      return { type: 'duplicate', existingDiscoveryId: item.id };
    }
    if (candidate.fingerprint && item.fingerprint === candidate.fingerprint) {
      return { type: 'duplicate', existingDiscoveryId: item.id };
    }

    const overlap = normalizedWords(item.title)
      .split(/\s+/)
      .filter((word) => titleWords.has(word)).length;
    if (overlap >= Math.min(4, titleWords.size)) {
      return { type: 'revival_candidate', existingConceptId: `concept:${stableHash(item.title)}`, reason: 'Similar topic resurfaced with new context.' };
    }
  }

  return { type: 'new' };
}

export function discoveryOriginForSignal(signal: Signal): DiscoveryOrigin {
  const type: DiscoveryOrigin['type'] =
    signal.sourceType === 'user' || signal.sourceType === 'system'
      ? 'user'
      : signal.sourceType === 'companion'
        ? 'companion'
        : signal.sourceType === 'community'
          ? 'community'
          : signal.sourceType === 'local_file'
            ? 'local'
            : 'internet';
  return {
    type,
    provider: signal.provider,
    displayName: signal.provider ?? signal.sourceType
  };
}

export function scoreDiscovery(item: NormalizedDiscovery, context: RankingContext): DiscoveryScores {
  const userInterestScore = matchScore(item.tags, context.userInterests, 0.45);
  const userHistoryScore = matchScore(item.tags, context.recentMemoryTags, 0.35);
  const characterExpertiseScore = matchScore(item.tags, context.activeCharacter.expertise, 0.55);
  const noveltyScore = item.url && context.seenUrls?.has(item.url) ? 0.1 : 0.7;
  const usefulnessScore = item.summary || item.url ? 0.65 : 0.35;
  const finalScore = toUnitScore(
    0.35 * userInterestScore +
      0.25 * userHistoryScore +
      0.2 * characterExpertiseScore +
      0.1 * noveltyScore +
      0.1 * usefulnessScore
  );

  return {
    userInterestScore,
    userHistoryScore,
    characterExpertiseScore,
    noveltyScore,
    usefulnessScore,
    finalScore
  };
}

export function deduplicateDiscoveries(items: NormalizedDiscovery[]): NormalizedDiscovery[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url || `${item.source}:${item.externalId || item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toDiscovery(item: NormalizedDiscovery, scores: DiscoveryScores): Discovery {
  const signal = signalFromNormalizedDiscovery(item);
  const normalizedSignal = normalizeSignal(signal);
  return {
    ...item,
    ...scores,
    id: createId('disc'),
    signalId: signal.id,
    origin: discoveryOriginForSignal(signal),
    status: 'candidate',
    canonicalUrl: normalizedSignal.canonicalUrl,
    fingerprint: fingerprintDiscovery({
      title: item.title,
      canonicalUrl: normalizedSignal.canonicalUrl,
      topics: item.tags,
      sourceType: item.source
    }),
    growthValue: scores.finalScore,
    confidenceScore: toUnitScore((normalizedSignal.qualityScore + scores.finalScore) / 2),
    createdAt: nowIso()
  };
}

export function discoveryFromSignal(signal: NormalizedSignal, scores: DiscoveryScores): Discovery | undefined {
  if (!passesDiscoveryQuality(signal)) return undefined;
  const source = signal.provider === 'github' || signal.provider === 'reddit' || signal.provider === 'hackernews' || signal.provider === 'youtube'
    ? signal.provider
    : 'internet';
  return {
    source,
    externalId: signal.id,
    title: signal.title,
    summary: signal.summary ?? signal.rawContent ?? signal.title,
    url: signal.url,
    tags: Array.isArray(signal.metadata?.tags) ? signal.metadata.tags.map(String) : [signal.sourceType],
    publishedAt: signal.metadata?.publishedAt ? String(signal.metadata.publishedAt) : undefined,
    raw: signal.metadata ?? signal,
    ...scores,
    id: createId('disc'),
    signalId: signal.id,
    origin: discoveryOriginForSignal(signal),
    status: 'candidate',
    canonicalUrl: signal.canonicalUrl,
    fingerprint: fingerprintDiscovery({
      title: signal.title,
      canonicalUrl: signal.canonicalUrl,
      topics: Array.isArray(signal.metadata?.tags) ? signal.metadata.tags.map(String) : [signal.sourceType],
      sourceType: signal.sourceType
    }),
    growthValue: scores.finalScore,
    confidenceScore: toUnitScore((signal.qualityScore + scores.finalScore) / 2),
    createdAt: nowIso()
  };
}

export function selectEligibleDiscoveries(discoveries: Discovery[], alreadyAnnouncedToday: number, cap = 10): Discovery[] {
  const remaining = Math.max(0, cap - alreadyAnnouncedToday);
  const eligibleAt = nowIso();
  return discoveries
    .sort((left, right) => right.finalScore - left.finalScore)
    .slice(0, remaining)
    .map((discovery) => ({
      ...discovery,
      status: 'eligible',
      eligibleAt,
      updatedAt: eligibleAt
    }));
}

export function createUnavailableConnector(source: DiscoverySource): DiscoveryConnector {
  return {
    source,
    providerMode: 'unavailable',
    async fetch() {
      return [];
    },
    normalize(item) {
      return {
        source,
        externalId: String(item.id ?? item.title),
        title: String(item.title),
        summary: item.summary ? String(item.summary) : undefined,
        url: item.url ? String(item.url) : undefined,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [source],
        publishedAt: item.publishedAt ? String(item.publishedAt) : undefined,
        raw: item
      };
    }
  };
}

export function scoreCandidate(candidate: Pick<DiscoveryCandidate, 'relevanceScore' | 'noveltyScore' | 'evidenceScore' | 'usefulnessScore'>): number {
  return (
    candidate.relevanceScore * 0.35 +
    candidate.noveltyScore * 0.2 +
    candidate.evidenceScore * 0.2 +
    candidate.usefulnessScore * 0.15 +
    0.1
  );
}

export function deduplicateCandidates(candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = (candidate.sourceUrl || `${candidate.sourceName ?? candidate.sourceType}:${candidate.title}`).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export { DISCOVERY_STARTUP_DELAY_MS, getDiscoveryFetchDelay, getDiscoveryFetchDelayRange } from './timing';
export * from './discoveryMemory';
