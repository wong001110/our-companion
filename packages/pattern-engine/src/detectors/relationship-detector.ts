import type { MemoryRecord, PatternV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculatePatternConfidence } from '../confidence';
import { MIN_SUPPORTING_MEMORIES } from '../types';

export function detectRelationshipPatterns(memories: MemoryRecord[], userId: string): PatternV2[] {
  const entityPairs = new Map<string, { count: number; memories: MemoryRecord[] }>();

  for (const memory of memories) {
    for (let i = 0; i < memory.entities.length; i++) {
      for (let j = i + 1; j < memory.entities.length; j++) {
        const pair = [memory.entities[i], memory.entities[j]].sort().join('::');
        const existing = entityPairs.get(pair) ?? { count: 0, memories: [] };
        existing.count++;
        existing.memories.push(memory);
        entityPairs.set(pair, existing);
      }
    }
  }

  const patterns: PatternV2[] = [];
  const timestamp = nowIso();

  for (const [pair, data] of entityPairs) {
    if (data.count < MIN_SUPPORTING_MEMORIES) continue;

    const [entityA, entityB] = pair.split('::');
    const avgImportance = data.memories.reduce((sum, m) => sum + m.importance, 0) / data.memories.length;
    const recency = Math.max(...data.memories.map((m) =>
      Math.max(0, 1 - (Date.now() - new Date(m.lastAccessedAt).getTime()) / (7 * 24 * 60 * 60 * 1000))
    ));

    const confidence = calculatePatternConfidence({
      supportingMemoryCount: data.memories.length,
      recency,
      reinforcementCount: data.memories.reduce((sum, m) => sum + m.reinforcementCount, 0),
      consistency: data.count / memories.length,
      avgMemoryImportance: avgImportance,
    });

    patterns.push({
      id: createId('pattern'),
      userId,
      category: 'relationship',
      type: 'interest_cluster',
      title: `Relationship: ${entityA} ↔ ${entityB}`,
      summary: `Entities "${entityA}" and "${entityB}" appear together across ${data.count} memories.`,
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
