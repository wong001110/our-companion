import type { PatternV2, MemoryRecord, InsightV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculateInsightConfidence, calculateInsightImportance, calculateInsightNovelty } from '../scoring';

export function generateDiscoveryInsights(patterns: PatternV2[], memories: MemoryRecord[], userId: string): InsightV2[] {
  const discoveryPatterns = patterns.filter((p) =>
    p.type === 'returning_topic' || p.type === 'cross_source_trend'
  );
  if (discoveryPatterns.length === 0) return [];

  const timestamp = nowIso();
  const supportingMemoryIds = discoveryPatterns.flatMap((p) => p.supportingMemoryIds);

  const confidence = calculateInsightConfidence(discoveryPatterns);
  const importance = calculateInsightImportance(discoveryPatterns, memories);
  const novelty = calculateInsightNovelty(discoveryPatterns);

  return [{
    id: createId('insight'),
    userId,
    category: 'discovery',
    title: 'Discovery trend detected',
    summary: `Discovery patterns show ${discoveryPatterns.length} trends.`,
    explanation: 'User is discovering content across multiple sources.',
    supportingPatternIds: discoveryPatterns.map((p) => p.id),
    supportingMemoryIds: [...new Set(supportingMemoryIds)].slice(0, 10),
    confidence,
    importance,
    novelty,
    evidenceCount: discoveryPatterns.length,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
}
