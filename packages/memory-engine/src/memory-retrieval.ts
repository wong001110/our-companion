import type { MemoryRecord, MemoryQuery, MemoryRetrievalResult } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';

export function scoreMemory(memory: MemoryRecord, query: MemoryQuery): number {
  let score = 0;

  if (query.text) {
    const textLower = query.text.toLowerCase();
    const contentLower = memory.content.toLowerCase();
    const summaryLower = (memory.summary ?? '').toLowerCase();

    if (contentLower.includes(textLower) || summaryLower.includes(textLower)) {
      score += 30;
    }
  }

  if (query.tags && query.tags.length > 0) {
    const matchingTags = memory.tags.filter((tag) =>
      query.tags!.some((qt) => tag.toLowerCase().includes(qt.toLowerCase()))
    );
    score += matchingTags.length * 20;
  }

  if (query.entities && query.entities.length > 0) {
    const matchingEntities = memory.entities.filter((entity) =>
      query.entities!.some((qe) => entity.toLowerCase().includes(qe.toLowerCase()))
    );
    score += matchingEntities.length * 25;
  }

  if (query.types && query.types.length > 0) {
    if (query.types.includes(memory.type)) {
      score += 15;
    } else {
      return 0;
    }
  }

  score += (memory.importance / 100) * 15;
  score += memory.confidence * 10;

  const hoursSinceAccess = (Date.now() - new Date(memory.lastAccessedAt).getTime()) / (1000 * 60 * 60);
  if (hoursSinceAccess < 24) score += 10;
  else if (hoursSinceAccess < 168) score += 5;

  score += memory.reinforcementCount * 2;

  return score;
}

export function explainRelevance(memory: MemoryRecord, query: MemoryQuery, score: number): string {
  const reasons: string[] = [];

  if (query.text) {
    const textLower = query.text.toLowerCase();
    if (memory.content.toLowerCase().includes(textLower)) {
      reasons.push('content matches query');
    }
  }

  if (query.tags && query.tags.length > 0) {
    const matchingTags = memory.tags.filter((tag) =>
      query.tags!.some((qt) => tag.toLowerCase().includes(qt.toLowerCase()))
    );
    if (matchingTags.length > 0) {
      reasons.push(`matched tags: ${matchingTags.join(', ')}`);
    }
  }

  if (query.entities && query.entities.length > 0) {
    const matchingEntities = memory.entities.filter((entity) =>
      query.entities!.some((qe) => entity.toLowerCase().includes(qe.toLowerCase()))
    );
    if (matchingEntities.length > 0) {
      reasons.push(`matched entities: ${matchingEntities.join(', ')}`);
    }
  }

  if (memory.importance > 70) {
    reasons.push('high importance');
  }

  if (memory.reinforcementCount > 0) {
    reasons.push(`reinforced ${memory.reinforcementCount} times`);
  }

  return reasons.length > 0 ? reasons.join('; ') : 'general relevance';
}

export function retrieveMemories(memories: MemoryRecord[], query: MemoryQuery): MemoryRetrievalResult[] {
  const limit = query.limit ?? 10;

  return memories
    .map((memory) => ({
      memory,
      relevanceScore: scoreMemory(memory, query),
      reason: explainRelevance(memory, query, scoreMemory(memory, query)),
    }))
    .filter((result) => result.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit)
    .map((result) => ({
      ...result,
      memory: {
        ...result.memory,
        lastAccessedAt: nowIso(),
      },
    }));
}
