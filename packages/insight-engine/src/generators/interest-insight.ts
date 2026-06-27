import type { PatternV2, MemoryRecord, InsightV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculateInsightConfidence, calculateInsightImportance, calculateInsightNovelty } from '../scoring';

export function generateInterestInsights(patterns: PatternV2[], memories: MemoryRecord[], userId: string): InsightV2[] {
  const interestPatterns = patterns.filter((p) => p.category === 'interest');
  if (interestPatterns.length === 0) return [];

  const timestamp = nowIso();
  const supportingMemoryIds = interestPatterns.flatMap((p) => p.supportingMemoryIds);

  const confidence = calculateInsightConfidence(interestPatterns);
  const importance = calculateInsightImportance(interestPatterns, memories);
  const novelty = calculateInsightNovelty(interestPatterns);

  const topics = interestPatterns.map((p) => p.title.replace('Interest in ', '')).join(', ');

  return [{
    id: createId('insight'),
    userId,
    category: 'interest',
    title: `User interest trend: ${topics}`,
    summary: `User shows recurring interest in ${topics} across ${interestPatterns.length} patterns.`,
    explanation: `The patterns indicate a sustained interest in ${topics}. This could inform future discovery and conversation topics.`,
    supportingPatternIds: interestPatterns.map((p) => p.id),
    supportingMemoryIds: [...new Set(supportingMemoryIds)].slice(0, 10),
    confidence,
    importance,
    novelty,
    evidenceCount: interestPatterns.length,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
}
