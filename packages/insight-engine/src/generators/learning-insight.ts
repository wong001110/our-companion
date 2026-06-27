import type { PatternV2, MemoryRecord, InsightV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculateInsightConfidence, calculateInsightImportance, calculateInsightNovelty } from '../scoring';

export function generateLearningInsights(patterns: PatternV2[], memories: MemoryRecord[], userId: string): InsightV2[] {
  const learningPatterns = patterns.filter((p) => p.category === 'learning');
  if (learningPatterns.length === 0) return [];

  const timestamp = nowIso();
  const supportingMemoryIds = learningPatterns.flatMap((p) => p.supportingMemoryIds);

  const confidence = calculateInsightConfidence(learningPatterns);
  const importance = calculateInsightImportance(learningPatterns, memories);
  const novelty = calculateInsightNovelty(learningPatterns);

  return [{
    id: createId('insight'),
    userId,
    category: 'learning',
    title: 'Active learning pattern detected',
    summary: `User is actively learning across ${learningPatterns.length} patterns.`,
    explanation: 'The user is consistently exploring and learning new topics. This indicates growth and curiosity.',
    supportingPatternIds: learningPatterns.map((p) => p.id),
    supportingMemoryIds: [...new Set(supportingMemoryIds)].slice(0, 10),
    confidence,
    importance,
    novelty,
    evidenceCount: learningPatterns.length,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
}
