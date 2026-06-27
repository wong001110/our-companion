import type {
  DiscoveryPoolItem,
  DiscoveryPoolQuery,
  DiscoveryExperienceStatus,
  DiscoveryResult,
  DiscoveryEvidence,
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export function createPoolItem(result: DiscoveryResult): DiscoveryPoolItem {
  return {
    id: createId('pool_item'),
    sourceDiscoveryId: result.jobId,
    title: result.summary.slice(0, 100),
    summary: result.summary,
    detail: result.detailedFindings,
    evidence: result.evidence,
    tags: [],
    relatedTopics: [],
    relatedMemories: result.suggestedMemoryUpdates,
    relatedInsights: result.suggestedInsights,
    noveltyScore: result.novelty,
    relevanceScore: result.confidence,
    confidenceScore: result.confidence,
    sharePriority: result.confidence * 0.8,
    status: 'pooled',
    createdAt: result.createdAt,
    returnedAt: result.createdAt,
    lastUpdatedAt: result.createdAt,
  };
}

export function addToPool(pool: DiscoveryPoolItem[], item: DiscoveryPoolItem): DiscoveryPoolItem[] {
  const existing = pool.find((i) => i.sourceDiscoveryId === item.sourceDiscoveryId);
  if (existing) {
    return pool.map((i) =>
      i.sourceDiscoveryId === item.sourceDiscoveryId
        ? { ...i, sharePriority: Math.max(i.sharePriority, item.sharePriority), lastUpdatedAt: nowIso() }
        : i
    );
  }
  return [...pool, item].sort((a, b) => b.sharePriority - a.sharePriority);
}

export function removeFromPool(pool: DiscoveryPoolItem[], id: string): DiscoveryPoolItem[] {
  return pool.filter((i) => i.id !== id);
}

export function updatePoolItemStatus(pool: DiscoveryPoolItem[], id: string, status: DiscoveryExperienceStatus): DiscoveryPoolItem[] {
  return pool.map((i) =>
    i.id === id ? { ...i, status, lastUpdatedAt: nowIso() } : i
  );
}

export function getShareCandidates(pool: DiscoveryPoolItem[]): DiscoveryPoolItem[] {
  return pool
    .filter((i) => i.status === 'pooled' || i.status === 'ready_to_share')
    .sort((a, b) => b.sharePriority - a.sharePriority);
}

export function filterPool(pool: DiscoveryPoolItem[], query: DiscoveryPoolQuery): DiscoveryPoolItem[] {
  let filtered = [...pool];

  if (query.statuses && query.statuses.length > 0) {
    filtered = filtered.filter((i) => query.statuses!.includes(i.status));
  }

  if (query.minPriority !== undefined) {
    filtered = filtered.filter((i) => i.sharePriority >= query.minPriority!);
  }

  if (query.limit) {
    filtered = filtered.slice(0, query.limit);
  }

  return filtered.sort((a, b) => b.sharePriority - a.sharePriority);
}

export function expireStaleItems(pool: DiscoveryPoolItem[], maxAgeDays = 30): DiscoveryPoolItem[] {
  const now = new Date();
  const expiryMs = maxAgeDays * 24 * 60 * 60 * 1000;

  return pool.map((item) => {
    if (item.status === 'saved' || item.status === 'dismissed') {
      return item;
    }

    const createdAt = new Date(item.createdAt);
    if (now.getTime() - createdAt.getTime() > expiryMs) {
      return {
        ...item,
        status: 'expired' as DiscoveryExperienceStatus,
        lastUpdatedAt: nowIso(),
      };
    }

    return item;
  });
}
