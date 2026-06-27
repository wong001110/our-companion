import type { PatternV2, MemoryRecord, InsightV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculateInsightConfidence, calculateInsightImportance, calculateInsightNovelty } from '../scoring';

export function generateRiskInsights(patterns: PatternV2[], memories: MemoryRecord[], userId: string): InsightV2[] {
  const riskPatterns = patterns.filter((p) => p.type === 'abandoned_direction');
  if (riskPatterns.length === 0) return [];

  const timestamp = nowIso();
  const supportingMemoryIds = riskPatterns.flatMap((p) => p.supportingMemoryIds);

  const confidence = calculateInsightConfidence(riskPatterns);
  const importance = calculateInsightImportance(riskPatterns, memories);
  const novelty = calculateInsightNovelty(riskPatterns);

  return [{
    id: createId('insight'),
    userId,
    category: 'risk',
    title: 'Potential risk detected',
    summary: `${riskPatterns.length} abandoned directions detected.`,
    explanation: 'Some discovery directions have been dismissed, which may indicate areas to avoid or reconsider.',
    supportingPatternIds: riskPatterns.map((p) => p.id),
    supportingMemoryIds: [...new Set(supportingMemoryIds)].slice(0, 10),
    confidence,
    importance: Math.max(0.5, importance),
    novelty,
    evidenceCount: riskPatterns.length,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
}
