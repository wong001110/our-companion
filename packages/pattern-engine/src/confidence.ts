import { clamp01 } from '@our-companion/shared';
import { CONFIDENCE_WEIGHTS } from './types';

export interface ConfidenceInput {
  supportingMemoryCount: number;
  recency: number;
  reinforcementCount: number;
  consistency: number;
  avgMemoryImportance: number;
}

export function calculatePatternConfidence(input: ConfidenceInput): number {
  const memoryScore = clamp01(input.supportingMemoryCount / 5) * CONFIDENCE_WEIGHTS.supportingMemoryCount;
  const recencyScore = clamp01(input.recency) * CONFIDENCE_WEIGHTS.recency;
  const reinforcementScore = clamp01(input.reinforcementCount / 3) * CONFIDENCE_WEIGHTS.reinforcement;
  const consistencyScore = clamp01(input.consistency) * CONFIDENCE_WEIGHTS.consistency;
  const importanceScore = clamp01(input.avgMemoryImportance / 100) * CONFIDENCE_WEIGHTS.importance;

  return clamp01(
    memoryScore + recencyScore + reinforcementScore + consistencyScore + importanceScore
  );
}
