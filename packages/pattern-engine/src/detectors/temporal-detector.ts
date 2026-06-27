import type { MemoryRecord, PatternV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculatePatternConfidence } from '../confidence';
import { MIN_SUPPORTING_MEMORIES } from '../types';

export function detectTemporalPatterns(memories: MemoryRecord[], userId: string): PatternV2[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();

  const recentMemories = memories.filter((m) => {
    const daysSinceCreation = (Date.now() - new Date(m.createdAt).getTime()) / (24 * 60 * 60 * 1000);
    return daysSinceCreation <= 7;
  });

  const patterns: PatternV2[] = [];
  const timestamp = nowIso();

  if (recentMemories.length >= MIN_SUPPORTING_MEMORIES) {
    const avgImportance = recentMemories.reduce((sum, m) => sum + m.importance, 0) / recentMemories.length;

    const confidence = calculatePatternConfidence({
      supportingMemoryCount: recentMemories.length,
      recency: 0.9,
      reinforcementCount: recentMemories.reduce((sum, m) => sum + m.reinforcementCount, 0),
      consistency: 0.7,
      avgMemoryImportance: avgImportance,
    });

    patterns.push({
      id: createId('pattern'),
      userId,
      category: 'temporal',
      type: 'user_momentum',
      title: 'Recent activity burst',
      summary: `${recentMemories.length} memories created in the last 7 days.`,
      confidence,
      strength: confidence,
      supportingMemoryIds: recentMemories.map((m) => m.id),
      firstDetectedAt: timestamp,
      lastUpdatedAt: timestamp,
      reinforcementCount: 0,
      evidence: recentMemories.slice(0, 5).map((m) => ({
        sourceType: 'memory' as const,
        sourceId: m.id,
        summary: m.content.slice(0, 100),
        weight: m.importance / 100,
      })),
    });
  }

  return patterns.sort((a, b) => b.confidence - a.confidence);
}
