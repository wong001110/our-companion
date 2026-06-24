import type {
  CharacterProfile,
  Discovery,
  DiscoveryScores,
  DiscoverySource,
  NormalizedDiscovery
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export interface DiscoveryFetchInput {
  query?: string;
  limit?: number;
}

export type RawDiscoveryItem = Record<string, unknown>;

export interface DiscoveryConnector {
  source: DiscoverySource;
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
  return Math.min(100, Math.round((matches / Math.max(values.length, 1)) * 100));
}

export function scoreDiscovery(item: NormalizedDiscovery, context: RankingContext): DiscoveryScores {
  const userInterestScore = matchScore(item.tags, context.userInterests, 45);
  const userHistoryScore = matchScore(item.tags, context.recentMemoryTags, 35);
  const characterExpertiseScore = matchScore(item.tags, context.activeCharacter.expertise, 55);
  const noveltyScore = item.url && context.seenUrls?.has(item.url) ? 10 : 70;
  const usefulnessScore = item.summary || item.url ? 65 : 35;
  const finalScore = Math.round(
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
  return {
    ...item,
    ...scores,
    id: createId('disc'),
    status: 'candidate',
    createdAt: nowIso()
  };
}

export function applyDailyCap(discoveries: Discovery[], alreadySharedToday: number, cap = 10): Discovery[] {
  const remaining = Math.max(0, cap - alreadySharedToday);
  return discoveries
    .sort((left, right) => right.finalScore - left.finalScore)
    .slice(0, remaining)
    .map((discovery) => ({
      ...discovery,
      status: 'shared',
      sharedAt: nowIso()
    }));
}

function fallbackItems(source: DiscoverySource): RawDiscoveryItem[] {
  const common = {
    source,
    publishedAt: nowIso()
  };

  const bySource: Record<DiscoverySource, RawDiscoveryItem> = {
    github: {
      ...common,
      id: 'github-pixijs-desktop-pet',
      title: 'Building expressive desktop companions with PixiJS',
      summary: 'A small renderer pattern for animated companion characters.',
      url: 'https://github.com/pixijs/pixijs',
      tags: ['frontend', 'pixijs', 'web', 'ux']
    },
    hackernews: {
      ...common,
      id: 'hn-local-first-memory',
      title: 'Local-first app patterns for personal memory tools',
      summary: 'Discussion about SQLite-backed personal software.',
      url: 'https://news.ycombinator.com/',
      tags: ['sqlite', 'local-first', 'memory']
    },
    reddit: {
      ...common,
      id: 'reddit-cozy-dev-room',
      title: 'Cozy developer room inspiration boards',
      summary: 'Workspace ideas with warm lighting and note-taking systems.',
      url: 'https://www.reddit.com/r/battlestations/',
      tags: ['ux', 'workspace', 'cozy']
    },
    youtube: {
      ...common,
      id: 'youtube-pixijs-tutorial',
      title: 'PixiJS animation basics for character sprites',
      summary: 'A tutorial-style resource for sprite animation loops.',
      url: 'https://www.youtube.com/results?search_query=PixiJS+sprite+animation',
      tags: ['pixijs', 'frontend', 'animation']
    }
  };

  return [bySource[source]];
}

export function createFallbackConnector(source: DiscoverySource): DiscoveryConnector {
  return {
    source,
    async fetch() {
      return fallbackItems(source);
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

export async function runDiscoveryPipeline(
  connectors: DiscoveryConnector[],
  context: RankingContext,
  alreadySharedToday: number
): Promise<Discovery[]> {
  const rawByConnector = await Promise.all(
    connectors.map(async (connector) => {
      const raw = await connector.fetch({ limit: 10 });
      return raw.map((item) => connector.normalize(item));
    })
  );

  const normalized = deduplicateDiscoveries(rawByConnector.flat());
  const ranked = normalized.map((item) => toDiscovery(item, scoreDiscovery(item, context)));
  return applyDailyCap(ranked, alreadySharedToday);
}
