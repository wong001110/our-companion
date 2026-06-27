import type { PatternV2, MemoryRecord, InsightV2 } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { calculateInsightConfidence, calculateInsightImportance, calculateInsightNovelty } from '../scoring';

export function generateProjectInsights(patterns: PatternV2[], memories: MemoryRecord[], userId: string): InsightV2[] {
  const projectPatterns = patterns.filter((p) => p.category === 'project');
  if (projectPatterns.length === 0) return [];

  const timestamp = nowIso();
  const supportingMemoryIds = projectPatterns.flatMap((p) => p.supportingMemoryIds);

  const confidence = calculateInsightConfidence(projectPatterns);
  const importance = calculateInsightImportance(projectPatterns, memories);
  const novelty = calculateInsightNovelty(projectPatterns);

  return [{
    id: createId('insight'),
    userId,
    category: 'project',
    title: 'Project activity detected',
    summary: `Active project work across ${projectPatterns.length} patterns.`,
    explanation: 'The user is making progress on project-related tasks.',
    supportingPatternIds: projectPatterns.map((p) => p.id),
    supportingMemoryIds: [...new Set(supportingMemoryIds)].slice(0, 10),
    confidence,
    importance,
    novelty,
    evidenceCount: projectPatterns.length,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
}
