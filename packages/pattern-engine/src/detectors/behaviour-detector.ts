import type { MemoryRecord, PatternV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculatePatternConfidence } from '../confidence';
import { MIN_SUPPORTING_MEMORIES } from '../types';

export function detectBehaviourPatterns(memories: MemoryRecord[], userId: string): PatternV2[] {
  const sourceGroups = new Map<string, MemoryRecord[]>();

  for (const memory of memories) {
    const source = memory.source.toLowerCase();
    const existing = sourceGroups.get(source) ?? [];
    existing.push(memory);
    sourceGroups.set(source, existing);
  }

  const patterns: PatternV2[] = [];
  const timestamp = nowIso();

  for (const [source, sourceMemories] of sourceGroups) {
    if (sourceMemories.length < MIN_SUPPORTING_MEMORIES) continue;

    const avgImportance = sourceMemories.reduce((sum, m) => sum + m.importance, 0) / sourceMemories.length;
    const recency = Math.max(...sourceMemories.map((m) =>
      Math.max(0, 1 - (Date.now() - new Date(m.lastAccessedAt).getTime()) / (7 * 24 * 60 * 60 * 1000))
    ));

    const confidence = calculatePatternConfidence({
      supportingMemoryCount: sourceMemories.length,
      recency,
      reinforcementCount: sourceMemories.reduce((sum, m) => sum + m.reinforcementCount, 0),
      consistency: 0.7,
      avgMemoryImportance: avgImportance,
    });

    patterns.push({
      id: createId('pattern'),
      userId,
      category: 'behaviour',
      type: 'repeated_theme',
      title: `Recurring behaviour: ${source}`,
      summary: `User repeatedly engages with "${source}" source.`,
      confidence,
      strength: confidence,
      supportingMemoryIds: sourceMemories.map((m) => m.id),
      firstDetectedAt: timestamp,
      lastUpdatedAt: timestamp,
      reinforcementCount: 0,
      evidence: sourceMemories.slice(0, 5).map((m) => ({
        sourceType: 'memory' as const,
        sourceId: m.id,
        summary: m.content.slice(0, 100),
        weight: m.importance / 100,
      })),
    });
  }

  return patterns.sort((a, b) => b.confidence - a.confidence);
}
