import {
  filterKnownCuratedFeedIds,
  matchCuratedFeedsToInterests,
} from './curatedDiscoveryFeeds';
import {
  DISCOVERY_PLATFORM_BOOTSTRAP_VERSION,
  MANAGED_DISCOVERY_PLATFORM_PRESETS,
  getDiscoveryPlatformPreset,
  renderDiscoveryPlatformQuery,
  type ManagedDiscoveryPlatformId,
} from './discoveryPlatformPresets';

export const PERSONALITY_SEED_MANAGED_BY = 'personality_seed';
export const PERSONALITY_PLATFORM_SEED_MANAGED_BY = 'personality_platform_seed';

export interface CompanionDiscoveryPlatformQuery {
  platformId: ManagedDiscoveryPlatformId;
  query: string;
}

export interface CompanionDiscoverySeedPlan {
  interests: string[];
  genericQuery: string;
  platformQueries: CompanionDiscoveryPlatformQuery[];
  curatedFeedIds: string[];
}

export interface ManagedDiscoveryPlatformPreference {
  companionId: string;
  platformId: ManagedDiscoveryPlatformId;
  state: 'enabled' | 'suppressed';
  updatedAt: string;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'with', 'about', 'into', 'from', 'that', 'this',
  'these', 'those', 'who', 'whom', 'whose', 'which', 'what', 'when', 'where', 'why', 'how',
  'is', 'are', 'was', 'were', 'be', 'been', 'am', 'to', 'of', 'in', 'on', 'at', 'as', 'by',
  'it', 'its', 'their', 'they', 'them', 'you', 'your', 'we', 'our', 'i', 'my', 'me',
  'likes', 'like', 'love', 'loves', 'enjoy', 'enjoys', 'interested', 'interest', 'curious',
  'companion', 'personality', 'someone', 'person', 'people', 'really', 'very', 'also',
]);

const BROAD_INTERESTS = new Set([
  'technology', 'tech', 'science', 'news', 'life', 'things', 'stuff', 'world', 'general',
  'everything', 'anything', 'ideas', 'topics', 'research',
]);

export function extractDiscoveryInterests(description: string, requested?: readonly string[]): string[] {
  const fromRequested = normalizeInterestList(requested ?? []);
  if (fromRequested.length >= 3) return fromRequested.slice(0, 5);

  const fromDescription = normalizeInterestList(tokenizeInterestCandidates(description));
  const merged = normalizeInterestList([...fromRequested, ...fromDescription]);
  if (merged.length >= 3) return merged.slice(0, 5);

  const fallback = normalizeInterestList([
    ...merged,
    'local-first software',
    'thoughtful product design',
    'practical learning',
  ]);
  return fallback.slice(0, Math.max(3, Math.min(5, fallback.length || 3)));
}

export function buildCompanionDiscoverySeedPlan(input: {
  description: string;
  interests?: readonly string[];
  curatedFeedIds?: readonly string[];
}): CompanionDiscoverySeedPlan {
  const interests = extractDiscoveryInterests(input.description, input.interests);
  const topics = interests.slice(0, 4).join(' ');
  const genericPreset = getDiscoveryPlatformPreset('generic-web');
  const genericQuery = renderDiscoveryPlatformQuery(genericPreset.queryTemplate, topics);
  const platformQueries = MANAGED_DISCOVERY_PLATFORM_PRESETS.map((preset) => ({
    platformId: preset.id,
    query: renderDiscoveryPlatformQuery(preset.queryTemplate, topics),
  }));
  const curatedFromModel = filterKnownCuratedFeedIds(input.curatedFeedIds ?? []);
  const curatedFeedIds = curatedFromModel.length > 0
    ? curatedFromModel
    : matchCuratedFeedsToInterests(interests);

  return {
    interests,
    genericQuery,
    platformQueries,
    curatedFeedIds,
  };
}

export function parseDiscoverySeedPlanFromAnalysis(
  description: string,
  raw: Record<string, unknown>,
): CompanionDiscoverySeedPlan {
  const interests = Array.isArray(raw.interests)
    ? raw.interests.filter((value): value is string => typeof value === 'string')
    : undefined;
  const curatedFeedIds = Array.isArray(raw.curatedFeedIds)
    ? raw.curatedFeedIds.filter((value): value is string => typeof value === 'string')
    : Array.isArray(raw.curated_feed_ids)
      ? raw.curated_feed_ids.filter((value): value is string => typeof value === 'string')
      : undefined;

  // Ignore any model-supplied RSS URLs — only registry feed IDs are allowed.
  return buildCompanionDiscoverySeedPlan({
    description,
    interests,
    curatedFeedIds,
  });
}

export function isManagedPlatformSeed(data: Readonly<Record<string, unknown>> | undefined): boolean {
  return data?.managedBy === PERSONALITY_PLATFORM_SEED_MANAGED_BY;
}

export function isPersonalityGenericSeed(data: Readonly<Record<string, unknown>> | undefined): boolean {
  return data?.managedBy === PERSONALITY_SEED_MANAGED_BY;
}

export function platformIdFromManagedSource(
  data: Readonly<Record<string, unknown>> | undefined,
): ManagedDiscoveryPlatformId | undefined {
  if (!isManagedPlatformSeed(data)) return undefined;
  const platformId = data?.platformId;
  if (typeof platformId !== 'string') return undefined;
  return MANAGED_DISCOVERY_PLATFORM_PRESETS.some((preset) => preset.id === platformId)
    ? platformId as ManagedDiscoveryPlatformId
    : undefined;
}

export function buildManagedPlatformSourceData(input: {
  platformId: ManagedDiscoveryPlatformId;
  personalityRevision: string;
  topicKeys: readonly string[];
  existing?: Readonly<Record<string, unknown>>;
}): Record<string, unknown> {
  const preset = getDiscoveryPlatformPreset(input.platformId);
  return {
    ...(input.existing ?? {}),
    managedBy: PERSONALITY_PLATFORM_SEED_MANAGED_BY,
    platformId: input.platformId,
    platformLabel: preset.label,
    label: preset.label,
    bootstrapVersion: DISCOVERY_PLATFORM_BOOTSTRAP_VERSION,
    personalityRevision: input.personalityRevision,
    topicKeys: [...input.topicKeys],
  };
}

function tokenizeInterestCandidates(description: string): string[] {
  const normalized = description.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\s-]/gi, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);
  const phrases: string[] = [];

  for (let index = 0; index < words.length - 1; index += 1) {
    const left = words[index]!;
    const right = words[index + 1]!;
    if (STOP_WORDS.has(left) || STOP_WORDS.has(right)) continue;
    if (left.length < 3 || right.length < 3) continue;
    phrases.push(`${left} ${right}`);
  }

  for (const word of words) {
    if (word.length < 4 || STOP_WORDS.has(word) || BROAD_INTERESTS.has(word)) continue;
    phrases.push(word);
  }

  return phrases;
}

function normalizeInterestList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized.length < 3 || normalized.length > 80) continue;
    if (BROAD_INTERESTS.has(normalized) || STOP_WORDS.has(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
