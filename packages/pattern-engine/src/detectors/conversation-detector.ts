import type { MemoryRecord, PatternV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculatePatternConfidence } from '../confidence';
import { MIN_SUPPORTING_MEMORIES } from '../types';

export function detectConversationPatterns(memories: MemoryRecord[], userId: string): PatternV2[] {
  const questionMemories = memories.filter((m) => m.type === 'question');
  const topicMemories = memories.filter((m) => m.type === 'topic');

  const patterns: PatternV2[] = [];
  const timestamp = nowIso();

  if (questionMemories.length >= MIN_SUPPORTING_MEMORIES) {
    const avgImportance = questionMemories.reduce((sum, m) => sum + m.importance, 0) / questionMemories.length;
    const recency = Math.max(...questionMemories.map((m) =>
      Math.max(0, 1 - (Date.now() - new Date(m.lastAccessedAt).getTime()) / (7 * 24 * 60 * 60 * 1000))
    ));

    const confidence = calculatePatternConfidence({
      supportingMemoryCount: questionMemories.length,
      recency,
      reinforcementCount: questionMemories.reduce((sum, m) => sum + m.reinforcementCount, 0),
      consistency: 0.65,
      avgMemoryImportance: avgImportance,
    });

    patterns.push({
      id: createId('pattern'),
      userId,
      category: 'conversation',
      type: 'repeated_theme',
      title: 'Recurring questions',
      summary: `User asks questions across ${questionMemories.length} conversations.`,
      confidence,
      strength: confidence,
      supportingMemoryIds: questionMemories.map((m) => m.id),
      firstDetectedAt: timestamp,
      lastUpdatedAt: timestamp,
      reinforcementCount: 0,
      evidence: questionMemories.slice(0, 5).map((m) => ({
        sourceType: 'memory' as const,
        sourceId: m.id,
        summary: m.content.slice(0, 100),
        weight: m.importance / 100,
      })),
    });
  }

  return patterns.sort((a, b) => b.confidence - a.confidence);
}
