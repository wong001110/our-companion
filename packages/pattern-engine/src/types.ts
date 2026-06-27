import type { PatternV2, PatternCategory, MemoryRecord } from '@our-companion/shared';

export const MIN_SUPPORTING_MEMORIES = 2;
export const MAX_PATTERNS_PER_DETECTION = 10;
export const CONFIDENCE_WEIGHTS = {
  supportingMemoryCount: 0.3,
  recency: 0.25,
  reinforcement: 0.2,
  consistency: 0.15,
  importance: 0.1,
};

export type PatternDetector = (
  memories: MemoryRecord[],
  userId: string
) => PatternV2[];

export interface PatternEngineInternal {
  patterns: Map<string, PatternV2>;
  detectors: PatternDetector[];
}
