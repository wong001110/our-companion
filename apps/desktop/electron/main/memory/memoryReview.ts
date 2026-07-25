import type {
  MemoryNode,
  MemoryReviewItem,
  MemoryReviewQuery,
  MemoryReviewState,
  MemoryReviewUpdateInput,
} from '@our-companion/shared';

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim();
}

export function toMemoryReviewItem(memory: MemoryNode): MemoryReviewItem {
  const metadata = memory.metadata;
  return {
    id: memory.id,
    title: memory.title,
    summary: memory.summary,
    memoryType: memory.memoryType,
    nodeType: memory.type,
    status: memory.status ?? (memory.isMarkedWrong ? 'superseded' : 'active'),
    reviewState: metadata?.reviewState ?? 'unreviewed',
    reviewNote: metadata?.reviewNote,
    confidence: memory.confidence ?? metadata?.confidence ?? 0.5,
    importance: memory.importance,
    sensitivity: metadata?.sensitivity ?? 'normal',
    sourceType: metadata?.sourceType,
    canonicalSource: metadata?.canonicalSource,
    sourceUrl: memory.sourceUrl,
    isPinned: Boolean(memory.isPinned),
    observationCount: memory.observationCount ?? 1,
    sourceMessageCount: memory.sourceMessageIds?.length ?? metadata?.sourceMessageIds?.length ?? 0,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    lastUsedAt: memory.lastAccessedAt,
  };
}

export function filterMemoryReviewItems(
  items: readonly MemoryReviewItem[],
  query: MemoryReviewQuery = {},
): MemoryReviewItem[] {
  const search = normalize(query.search ?? '');
  const typeSet = query.memoryTypes?.length ? new Set(query.memoryTypes) : undefined;
  const stateSet = query.reviewStates?.length ? new Set(query.reviewStates) : undefined;
  const statusSet = query.statuses?.length ? new Set(query.statuses) : undefined;
  const limit = Math.max(1, Math.min(500, Math.floor(query.limit ?? 200)));
  return items
    .filter((item) => !typeSet || (item.memoryType ? typeSet.has(item.memoryType) : false))
    .filter((item) => !stateSet || stateSet.has(item.reviewState))
    .filter((item) => !statusSet || statusSet.has(item.status))
    .filter((item) => !search || normalize(`${item.title} ${item.summary ?? ''}`).includes(search))
    .sort((left, right) => Number(right.isPinned) - Number(left.isPinned)
      || right.updatedAt.localeCompare(left.updatedAt)
      || left.id.localeCompare(right.id))
    .slice(0, limit);
}

export function applyMemoryReviewUpdate(
  memory: MemoryNode,
  input: MemoryReviewUpdateInput,
  reviewedAt: string,
): MemoryNode {
  const reviewState: MemoryReviewState = input.state;
  const active = reviewState === 'confirmed' || reviewState === 'unreviewed';
  return {
    ...memory,
    status: active ? 'active' : 'review_pending',
    updatedAt: reviewedAt,
    metadata: {
      ...(memory.metadata ?? {
        sourceType: 'system',
        confidence: memory.confidence ?? 0.5,
        sensitivity: 'normal',
        scope: 'companion',
        createdAt: memory.createdAt,
      }),
      reviewState,
      reviewNote: input.note?.trim().slice(0, 240) || undefined,
      reviewedAt,
      ...(reviewState === 'confirmed' ? { lastConfirmedAt: reviewedAt } : {}),
    },
  };
}
