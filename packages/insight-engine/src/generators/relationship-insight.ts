import type { PatternV2, MemoryRecord, InsightV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculateInsightConfidence, calculateInsightImportance, calculateInsightNovelty } from '../scoring';

export function generateRelationshipInsights(patterns: PatternV2[], memories: MemoryRecord[], userId: string): InsightV2[] {
  const relationshipPatterns = patterns.filter((p) => p.category === 'relationship');
  if (relationshipPatterns.length === 0) return [];

  const timestamp = nowIso();
  const supportingMemoryIds = relationshipPatterns.flatMap((p) => p.supportingMemoryIds);

  const confidence = calculateInsightConfidence(relationshipPatterns);
  const importance = calculateInsightImportance(relationshipPatterns, memories);
  const novelty = calculateInsightNovelty(relationshipPatterns);

  const entities = relationshipPatterns.map((p) => p.title.replace('Relationship: ', '')).join(', ');

  return [{
    id: createId('insight'),
    userId,
    category: 'relationship',
    title: `Entity relationships: ${entities}`,
    summary: `Strong relationships detected between ${entities}.`,
    explanation: 'These entities appear together frequently, suggesting meaningful connections.',
    supportingPatternIds: relationshipPatterns.map((p) => p.id),
    supportingMemoryIds: [...new Set(supportingMemoryIds)].slice(0, 10),
    confidence,
    importance,
    novelty,
    evidenceCount: relationshipPatterns.length,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
}
