import type {
  MemoryRecord,
  PatternV2,
  PatternQuery,
  PatternDetectionInput,
  PatternDetectionResult,
  Discovery,
  DiscoveryFeedback,
} from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';
import { detectInterestPatterns } from './detectors/interest-detector';
import { detectBehaviourPatterns } from './detectors/behaviour-detector';
import { detectConversationPatterns } from './detectors/conversation-detector';
import { detectProjectPatterns } from './detectors/project-detector';
import { detectLearningPatterns } from './detectors/learning-detector';
import { detectTemporalPatterns } from './detectors/temporal-detector';
import { detectRelationshipPatterns } from './detectors/relationship-detector';
import { MAX_PATTERNS_PER_DETECTION } from './types';

export class PatternEngine {
  private patterns: Map<string, PatternV2> = new Map();

  detectPatterns(input: PatternDetectionInput): PatternDetectionResult {
    const allPatterns: PatternV2[] = [];

    allPatterns.push(...detectInterestPatterns(input.memories, input.userId));
    allPatterns.push(...detectBehaviourPatterns(input.memories, input.userId));
    allPatterns.push(...detectConversationPatterns(input.memories, input.userId));
    allPatterns.push(...detectProjectPatterns(input.memories, input.userId));
    allPatterns.push(...detectLearningPatterns(input.memories, input.userId));
    allPatterns.push(...detectTemporalPatterns(input.memories, input.userId));
    allPatterns.push(...detectRelationshipPatterns(input.memories, input.userId));

    const sorted = allPatterns
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_PATTERNS_PER_DETECTION);

    for (const pattern of sorted) {
      this.patterns.set(pattern.id, pattern);
    }

    const avgConfidence = sorted.length > 0
      ? sorted.reduce((sum, p) => sum + p.confidence, 0) / sorted.length
      : 0;

    return {
      patterns: sorted,
      metadata: {
        memoriesAnalyzed: input.memories.length,
        patternsDetected: sorted.length,
        avgConfidence,
      },
    };
  }

  getPatterns(query?: PatternQuery): PatternV2[] {
    let patterns = Array.from(this.patterns.values());

    if (query?.categories && query.categories.length > 0) {
      patterns = patterns.filter((p) => query.categories!.includes(p.category));
    }

    if (query?.types && query.types.length > 0) {
      patterns = patterns.filter((p) => query.types!.includes(p.type));
    }

    if (query?.minConfidence !== undefined) {
      patterns = patterns.filter((p) => p.confidence >= query.minConfidence!);
    }

    patterns.sort((a, b) => b.confidence - a.confidence);

    if (query?.limit) {
      patterns = patterns.slice(0, query.limit);
    }

    return patterns;
  }

  reinforcePattern(patternId: string): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    const updated: PatternV2 = {
      ...pattern,
      reinforcementCount: pattern.reinforcementCount + 1,
      lastUpdatedAt: nowIso(),
      confidence: Math.min(1, pattern.confidence + 0.05),
      strength: Math.min(1, pattern.strength + 0.05),
    };

    this.patterns.set(patternId, updated);
  }

  getPatternById(id: string): PatternV2 | undefined {
    return this.patterns.get(id);
  }

  getAllPatterns(): PatternV2[] {
    return Array.from(this.patterns.values());
  }
}
