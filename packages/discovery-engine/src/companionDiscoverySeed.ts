import {
  filterKnownCuratedFeedIds,
  matchCuratedFeedsToInterests,
} from './curatedDiscoveryFeeds';
import {
  DISCOVERY_PLATFORM_BOOTSTRAP_VERSION,
  DEFAULT_DISCOVERY_PLATFORM_PRESETS,
  isDiscoveryPlatformId,
  type DiscoveryPlatformId,
} from './discoveryPlatformPresets';

export const PERSONALITY_SEED_MANAGED_BY = 'personality_seed';
export const PERSONALITY_PLATFORM_SEED_MANAGED_BY = 'personality_platform_seed';

export type DiscoveryPreferredContentType =
  | 'articles'
  | 'discussion'
  | 'video'
  | 'code'
  | 'feeds';

export type DiscoveryChannelState = 'enabled' | 'muted' | 'blocked' | 'suppressed';

export interface CompanionDiscoverySeedPlan {
  interests: string[];
  preferredContentTypes: DiscoveryPreferredContentType[];
  platformAffinities: Partial<Record<DiscoveryPlatformId, number>>;
  curatedFeedIds: string[];
}

export interface CompanionDiscoveryProfile {
  version: number;
  companionId: string;
  personalityRevision: string;
  interests: string[];
  preferredContentTypes: DiscoveryPreferredContentType[];
  platformAffinities: Partial<Record<DiscoveryPlatformId, number>>;
  updatedAt: string;
}

export interface CompanionDiscoveryChannel {
  companionId: string;
  platformId: DiscoveryPlatformId;
  state: DiscoveryChannelState;
  source: 'default' | 'user';
  updatedAt: string;
  lastUsedAt?: string;
  lastPlanningReason?: string;
}

/** @deprecated Prefer CompanionDiscoveryChannel.state. */
export interface ManagedDiscoveryPlatformPreference {
  companionId: string;
  platformId: DiscoveryPlatformId;
  state: 'enabled' | 'suppressed' | 'muted' | 'blocked';
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

const CONTENT_TYPES: DiscoveryPreferredContentType[] = [
  'articles',
  'discussion',
  'video',
  'code',
  'feeds',
];

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
  preferredContentTypes?: readonly string[];
  platformAffinities?: Partial<Record<string, number>>;
  curatedFeedIds?: readonly string[];
}): CompanionDiscoverySeedPlan {
  const interests = extractDiscoveryInterests(input.description, input.interests);
  const preferredContentTypes = normalizePreferredContentTypes(input.preferredContentTypes);
  const platformAffinities = normalizePlatformAffinities(input.platformAffinities);
  const curatedFromModel = filterKnownCuratedFeedIds(input.curatedFeedIds ?? []);
  const curatedFeedIds = curatedFromModel.length > 0
    ? curatedFromModel
    : matchCuratedFeedsToInterests(interests);

  return {
    interests,
    preferredContentTypes,
    platformAffinities,
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
  const preferredContentTypes = Array.isArray(raw.preferredContentTypes)
    ? raw.preferredContentTypes.filter((value): value is string => typeof value === 'string')
    : Array.isArray(raw.preferred_content_types)
      ? raw.preferred_content_types.filter((value): value is string => typeof value === 'string')
      : undefined;
  const platformAffinities = parsePlatformAffinities(raw.platformAffinities ?? raw.platform_affinities);
  const curatedFeedIds = Array.isArray(raw.curatedFeedIds)
    ? raw.curatedFeedIds.filter((value): value is string => typeof value === 'string')
    : Array.isArray(raw.curated_feed_ids)
      ? raw.curated_feed_ids.filter((value): value is string => typeof value === 'string')
      : undefined;

  // Ignore model-supplied platformQueries / RSS URLs — channels and feeds are app-owned.
  return buildCompanionDiscoverySeedPlan({
    description,
    interests,
    preferredContentTypes,
    platformAffinities,
    curatedFeedIds,
  });
}

export function buildCompanionDiscoveryProfile(input: {
  companionId: string;
  personalityRevision: string;
  seedPlan: CompanionDiscoverySeedPlan;
  updatedAt: string;
}): CompanionDiscoveryProfile {
  return {
    version: DISCOVERY_PLATFORM_BOOTSTRAP_VERSION,
    companionId: input.companionId,
    personalityRevision: input.personalityRevision,
    interests: input.seedPlan.interests,
    preferredContentTypes: input.seedPlan.preferredContentTypes,
    platformAffinities: input.seedPlan.platformAffinities,
    updatedAt: input.updatedAt,
  };
}

export function isManagedPlatformSeed(data: Readonly<Record<string, unknown>> | undefined): boolean {
  return data?.managedBy === PERSONALITY_PLATFORM_SEED_MANAGED_BY
    && typeof data.platformId === 'string'
    && data.platformId !== 'generic-web'
    && !data.curatedFeedId;
}

export function isPersonalityGenericSeed(data: Readonly<Record<string, unknown>> | undefined): boolean {
  return data?.managedBy === PERSONALITY_SEED_MANAGED_BY;
}

export function platformIdFromManagedSource(
  data: Readonly<Record<string, unknown>> | undefined,
): DiscoveryPlatformId | undefined {
  if (!isManagedPlatformSeed(data) && data?.managedBy !== PERSONALITY_SEED_MANAGED_BY) return undefined;
  const platformId = data?.platformId;
  if (typeof platformId !== 'string' || !isDiscoveryPlatformId(platformId)) return undefined;
  if (data?.managedBy === PERSONALITY_PLATFORM_SEED_MANAGED_BY && platformId === 'generic-web') {
    return undefined;
  }
  return platformId;
}

export function mapV1BaseStateToChannelState(
  state: string,
): Exclude<DiscoveryChannelState, 'suppressed'> {
  if (state === 'muted') return 'muted';
  if (state === 'blocked') return 'blocked';
  // trial / active / expired / rejected → enabled (expired is not deliberate suppression)
  return 'enabled';
}

export function buildDefaultDiscoveryChannels(input: {
  companionId: string;
  updatedAt: string;
  existing?: readonly CompanionDiscoveryChannel[];
  autoManage: boolean;
}): CompanionDiscoveryChannel[] {
  const byId = new Map(input.existing?.map((channel) => [channel.platformId, channel]));
  const next: CompanionDiscoveryChannel[] = [];
  for (const preset of DEFAULT_DISCOVERY_PLATFORM_PRESETS) {
    const existing = byId.get(preset.id);
    if (existing) {
      next.push(existing);
      continue;
    }
    if (!input.autoManage && preset.id !== 'generic-web') continue;
    next.push({
      companionId: input.companionId,
      platformId: preset.id,
      state: 'enabled',
      source: 'default',
      updatedAt: input.updatedAt,
    });
  }
  return next;
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

function normalizePreferredContentTypes(values?: readonly string[]): DiscoveryPreferredContentType[] {
  const seen = new Set<DiscoveryPreferredContentType>();
  for (const value of values ?? []) {
    const normalized = value.trim().toLowerCase() as DiscoveryPreferredContentType;
    if (CONTENT_TYPES.includes(normalized)) seen.add(normalized);
  }
  if (seen.size === 0) {
    return ['articles', 'discussion', 'code'];
  }
  return CONTENT_TYPES.filter((type) => seen.has(type));
}

function normalizePlatformAffinities(
  values?: Partial<Record<string, number>>,
): Partial<Record<DiscoveryPlatformId, number>> {
  if (!values) return {};
  const result: Partial<Record<DiscoveryPlatformId, number>> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!isDiscoveryPlatformId(key)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    result[key] = Math.max(0, Math.min(1, value));
  }
  return result;
}

function parsePlatformAffinities(raw: unknown): Partial<Record<string, number>> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: Partial<Record<string, number>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number') result[key] = value;
  }
  return result;
}
