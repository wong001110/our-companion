import type { PatternV2, MemoryRecord, InsightV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculateInsightConfidence, calculateInsightImportance, calculateInsightNovelty } from '../scoring';

export function generateProductivityInsights(patterns: PatternV2[], memories: MemoryRecord[], userId: string): InsightV2[] {
  const behaviourPatterns = patterns.filter((p) => p.category === 'behaviour');
  if (behaviourPatterns.length === 0) return [];

  const timestamp = nowIso();
  const supportingMemoryIds = behaviourPatterns.flatMap((p) => p.supportingMemoryIds);

  const confidence = calculateInsightConfidence(behaviourPatterns);
  const importance = calculateInsightImportance(behaviourPatterns, memories);
  const novelty = calculateInsightNovelty(behaviourPatterns);

  return [{
    id: createId('insight'),
    userId,
    category: 'productivity',
    title: 'Productivity pattern detected',
    summary: `User shows productive behaviour across ${behaviourPatterns.length} patterns.`,
    explanation: 'The user is maintaining consistent productive habits.',
    supportingPatternIds: behaviourPatterns.map((p) => p.id),
    supportingMemoryIds: [...new Set(supportingMemoryIds)].slice(0, 10),
    confidence,
    importance,
    novelty,
    evidenceCount: behaviourPatterns.length,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
}
