import type { MemoryRecord, PatternV2, PatternEvidence } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculatePatternConfidence } from '../confidence';
import { MIN_SUPPORTING_MEMORIES } from '../types';

export function detectInterestPatterns(memories: MemoryRecord[], userId: string): PatternV2[] {
  const tagGroups = new Map<string, { memories: MemoryRecord[]; weight: number }>();
  const entityGroups = new Map<string, { memories: MemoryRecord[]; weight: number }>();

  for (const memory of memories) {
    for (const tag of memory.tags) {
      const key = tag.toLowerCase();
      const existing = tagGroups.get(key) ?? { memories: [], weight: 0 };
      existing.memories.push(memory);
      existing.weight += memory.importance / 100;
      tagGroups.set(key, existing);
    }

    for (const entity of memory.entities) {
      const key = entity.toLowerCase();
      const existing = entityGroups.get(key) ?? { memories: [], weight: 0 };
      existing.memories.push(memory);
      existing.weight += memory.importance / 100;
      entityGroups.set(key, existing);
    }
  }

  const patterns: PatternV2[] = [];
  const timestamp = nowIso();

  for (const [tag, data] of tagGroups) {
    if (data.memories.length < MIN_SUPPORTING_MEMORIES) continue;

    const avgImportance = data.memories.reduce((sum, m) => sum + m.importance, 0) / data.memories.length;
    const recency = Math.max(...data.memories.map((m) =>
      Math.max(0, 1 - (Date.now() - new Date(m.lastAccessedAt).getTime()) / (7 * 24 * 60 * 60 * 1000))
    ));

    const confidence = calculatePatternConfidence({
      supportingMemoryCount: data.memories.length,
      recency,
      reinforcementCount: data.memories.reduce((sum, m) => sum + m.reinforcementCount, 0),
      consistency: data.weight / data.memories.length,
      avgMemoryImportance: avgImportance,
    });

    patterns.push({
      id: createId('pattern'),
      userId,
      category: 'interest',
      type: 'interest_cluster',
      title: `Interest in ${tag}`,
      summary: `User shows interest in "${tag}" across ${data.memories.length} memories.`,
      confidence,
      strength: confidence,
      supportingMemoryIds: data.memories.map((m) => m.id),
      firstDetectedAt: timestamp,
      lastUpdatedAt: timestamp,
      reinforcementCount: 0,
      evidence: data.memories.slice(0, 5).map((m) => ({
        sourceType: 'memory' as const,
        sourceId: m.id,
        summary: m.content.slice(0, 100),
        weight: m.importance / 100,
      })),
    });
  }

  return patterns.sort((a, b) => b.confidence - a.confidence);
}
