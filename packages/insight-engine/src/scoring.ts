import type { PatternV2, MemoryRecord } from '@our-companion/shared';
import { CONFIDENCE_WEIGHTS } from './types';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function calculateInsightConfidence(patterns: PatternV2[]): number {
  if (patterns.length === 0) return 0;

  const avgPatternConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
  const confidenceScore = clamp01(avgPatternConfidence) * CONFIDENCE_WEIGHTS.patternConfidence;

  return clamp01(confidenceScore + 0.3);
}

export function calculateInsightImportance(patterns: PatternV2[], memories: MemoryRecord[]): number {
  const patternImportance = patterns.length > 0
    ? patterns.reduce((sum, p) => sum + p.strength, 0) / patterns.length
    : 0;

  const memoryImportance = memories.length > 0
    ? memories.reduce((sum, m) => sum + m.importance, 0) / memories.length / 100
    : 0;

  return clamp01(
    patternImportance * CONFIDENCE_WEIGHTS.patternConfidence +
    memoryImportance * CONFIDENCE_WEIGHTS.memoryImportance +
    0.2
  );
}

export function calculateInsightNovelty(patterns: PatternV2[]): number {
  if (patterns.length === 0) return 0.5;

  const avgReinforcement = patterns.reduce((sum, p) => sum + p.reinforcementCount, 0) / patterns.length;
  const novelty = Math.max(0.2, 1 - avgReinforcement * 0.1);

  return clamp01(novelty);
}
