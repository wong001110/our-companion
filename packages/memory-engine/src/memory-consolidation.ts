import type { MemoryRecord, ConsolidateMemoryInput, ConsolidationResult } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';
import { MIN_IMPORTANCE_FOR_LTM, SIMILARITY_THRESHOLD_FOR_MERGE } from './types';
import { promoteToLongTerm, isEligibleForLongTerm } from './long-term-memory';

function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function mergeMemories(existing: MemoryRecord, incoming: MemoryRecord): MemoryRecord {
  const allTags = new Set([...existing.tags, ...incoming.tags]);
  const allEntities = new Set([...existing.entities, ...incoming.entities]);

  return {
    ...existing,
    content: `${existing.content}\n\n${incoming.content}`,
    tags: [...allTags],
    entities: [...allEntities],
    importance: Math.min(100, Math.max(existing.importance, incoming.importance) + 5),
    confidence: Math.min(1, (existing.confidence + incoming.confidence) / 2 + 0.05),
    reinforcementCount: existing.reinforcementCount + incoming.reinforcementCount + 1,
    updatedAt: nowIso(),
  };
}

export function consolidateMemories(
  shortTerm: MemoryRecord[],
  longTerm: MemoryRecord[],
  options?: ConsolidateMemoryInput
): { result: ConsolidationResult; longTerm: MemoryRecord[] } {
  const minImportance = options?.minImportance ?? MIN_IMPORTANCE_FOR_LTM;
  let consolidated = 0;
  let merged = 0;
  let discarded = 0;

  const updatedLongTerm = [...longTerm];

  for (const item of shortTerm) {
    if (!isEligibleForLongTerm(item, minImportance)) {
      discarded++;
      continue;
    }

    const similarIndex = updatedLongTerm.findIndex(
      (lt) => calculateSimilarity(lt.content, item.content) >= SIMILARITY_THRESHOLD_FOR_MERGE
    );

    if (similarIndex >= 0) {
      updatedLongTerm[similarIndex] = mergeMemories(updatedLongTerm[similarIndex], item);
      merged++;
    } else {
      updatedLongTerm.push(promoteToLongTerm(item));
    }
    consolidated++;
  }

  return {
    result: { consolidated, merged, discarded },
    longTerm: updatedLongTerm,
  };
}
