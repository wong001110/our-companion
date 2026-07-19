/**
 * Local curated RSS / Atom registry.
 *
 * Feeds must be code-maintained public URLs. Character analysis may only
 * select feed IDs from this registry — never invent arbitrary URLs.
 *
 * First version ships empty until publicly verified feeds are added.
 */
export interface CuratedDiscoveryFeed {
  id: string;
  label: string;
  url: string;
  topicTags: string[];
  languages?: string[];
}

export const CURATED_DISCOVERY_FEEDS: readonly CuratedDiscoveryFeed[] = [];

const FEED_BY_ID = new Map(CURATED_DISCOVERY_FEEDS.map((feed) => [feed.id, feed]));

export function getCuratedDiscoveryFeed(feedId: string): CuratedDiscoveryFeed | undefined {
  return FEED_BY_ID.get(feedId);
}

export function listCuratedDiscoveryFeedIds(): string[] {
  return CURATED_DISCOVERY_FEEDS.map((feed) => feed.id);
}

/** Keep only feed IDs that exist in the local registry. */
export function filterKnownCuratedFeedIds(feedIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const matched: string[] = [];
  for (const feedId of feedIds) {
    const normalized = feedId.trim();
    if (!normalized || seen.has(normalized) || !FEED_BY_ID.has(normalized)) continue;
    seen.add(normalized);
    matched.push(normalized);
  }
  return matched;
}

/**
 * Rank curated feeds by overlap with analyzed interests.
 * Returns feed IDs only — never raw URLs for model consumption elsewhere.
 */
export function matchCuratedFeedsToInterests(interests: readonly string[], limit = 3): string[] {
  if (CURATED_DISCOVERY_FEEDS.length === 0 || interests.length === 0) return [];
  const normalizedInterests = interests.map(normalizeTopicToken).filter(Boolean);
  const scored = CURATED_DISCOVERY_FEEDS.map((feed) => {
    const tags = feed.topicTags.map(normalizeTopicToken);
    const score = tags.reduce((total, tag) => {
      if (!tag) return total;
      return total + (normalizedInterests.some((interest) => interest.includes(tag) || tag.includes(interest)) ? 1 : 0);
    }, 0);
    return { id: feed.id, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return scored.slice(0, limit).map((entry) => entry.id);
}

function normalizeTopicToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
