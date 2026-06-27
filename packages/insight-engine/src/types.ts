import type { InsightV2, InsightCategory, PatternV2, MemoryRecord } from '@our-companion/shared';

export const MIN_PATTERNS_FOR_INSIGHT = 1;
export const MAX_INSIGHTS_PER_GENERATION = 10;
export const CONFIDENCE_WEIGHTS = {
  patternConfidence: 0.4,
  memoryImportance: 0.3,
  evidenceCount: 0.2,
  recency: 0.1,
};

export type InsightGenerator = (
  patterns: PatternV2[],
  memories: MemoryRecord[],
  userId: string
) => InsightV2[];

export interface InsightEngineInternal {
  insights: Map<string, InsightV2>;
  generators: InsightGenerator[];
}
