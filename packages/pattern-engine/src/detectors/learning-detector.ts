import type { MemoryRecord, PatternV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculatePatternConfidence } from '../confidence';
import { MIN_SUPPORTING_MEMORIES } from '../types';

export function detectLearningPatterns(memories: MemoryRecord[], userId: string): PatternV2[] {
  const learningKeywords = ['learn', 'understand', 'study', 'research', 'explore', 'discover'];
  const learningMemories = memories.filter((m) =>
    m.tags.some((tag) => learningKeywords.some((kw) => tag.toLowerCase().includes(kw))) ||
    m.content.toLowerCase().includes('learn') ||
    m.content.toLowerCase().includes('discover')
  );

  const patterns: PatternV2[] = [];
  const timestamp = nowIso();

  if (learningMemories.length >= MIN_SUPPORTING_MEMORIES) {
    const avgImportance = learningMemories.reduce((sum, m) => sum + m.importance, 0) / learningMemories.length;
    const recency = Math.max(...learningMemories.map((m) =>
      Math.max(0, 1 - (Date.now() - new Date(m.lastAccessedAt).getTime()) / (7 * 24 * 60 * 60 * 1000))
    ));

    const confidence = calculatePatternConfidence({
      supportingMemoryCount: learningMemories.length,
      recency,
      reinforcementCount: learningMemories.reduce((sum, m) => sum + m.reinforcementCount, 0),
      consistency: 0.6,
      avgMemoryImportance: avgImportance,
    });

    patterns.push({
      id: createId('pattern'),
      userId,
      category: 'learning',
      type: 'repeated_topic',
      title: 'Learning exploration pattern',
      summary: `User is actively learning across ${learningMemories.length} memories.`,
      confidence,
      strength: confidence,
      supportingMemoryIds: learningMemories.map((m) => m.id),
      firstDetectedAt: timestamp,
      lastUpdatedAt: timestamp,
      reinforcementCount: 0,
      evidence: learningMemories.slice(0, 5).map((m) => ({
        sourceType: 'memory' as const,
        sourceId: m.id,
        summary: m.content.slice(0, 100),
        weight: m.importance / 100,
      })),
    });
  }

  return patterns.sort((a, b) => b.confidence - a.confidence);
}
