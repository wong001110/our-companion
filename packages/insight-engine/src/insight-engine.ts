import type {
  PatternV2,
  MemoryRecord,
  InsightV2,
  InsightQuery,
  InsightGenerationInput,
  InsightGenerationResult,
} from '@our-companion/shared';
import { generateInterestInsights } from './generators/interest-insight';
import { generateLearningInsights } from './generators/learning-insight';
import { generateProductivityInsights } from './generators/productivity-insight';
import { generateProjectInsights } from './generators/project-insight';
import { generateBehaviourInsights } from './generators/behaviour-insight';
import { generateRelationshipInsights } from './generators/relationship-insight';
import { generateDiscoveryInsights } from './generators/discovery-insight';
import { generateRiskInsights } from './generators/risk-insight';
import { MAX_INSIGHTS_PER_GENERATION } from './types';

export class InsightEngine {
  private insights: Map<string, InsightV2> = new Map();

  generateInsights(input: InsightGenerationInput): InsightGenerationResult {
    const allInsights: InsightV2[] = [];
    let duplicatesPrevented = 0;

    const generators = [
      generateInterestInsights,
      generateLearningInsights,
      generateProductivityInsights,
      generateProjectInsights,
      generateBehaviourInsights,
      generateRelationshipInsights,
      generateDiscoveryInsights,
      generateRiskInsights,
    ];

    for (const generator of generators) {
      const generated = generator(input.patterns, input.memories, input.userId);
      for (const insight of generated) {
        if (this.isDuplicate(insight)) {
          duplicatesPrevented++;
          continue;
        }
        allInsights.push(insight);
        this.insights.set(insight.id, insight);
      }
    }

    const sorted = allInsights
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_INSIGHTS_PER_GENERATION);

    return {
      insights: sorted,
      metadata: {
        patternsAnalyzed: input.patterns.length,
        insightsGenerated: sorted.length,
        duplicatesPrevented,
      },
    };
  }

  private isDuplicate(newInsight: InsightV2): boolean {
    for (const existing of this.insights.values()) {
      if (existing.category === newInsight.category && existing.status === 'active') {
        const overlap = newInsight.supportingPatternIds.filter((id) =>
          existing.supportingPatternIds.includes(id)
        );
        if (overlap.length > 0) {
          return true;
        }
      }
    }
    return false;
  }

  getInsights(query?: InsightQuery): InsightV2[] {
    let insights = Array.from(this.insights.values());

    if (query?.categories && query.categories.length > 0) {
      insights = insights.filter((i) => query.categories!.includes(i.category));
    }

    if (query?.minConfidence !== undefined) {
      insights = insights.filter((i) => i.confidence >= query.minConfidence!);
    }

    if (query?.minImportance !== undefined) {
      insights = insights.filter((i) => i.importance >= query.minImportance!);
    }

    if (query?.status) {
      insights = insights.filter((i) => i.status === query.status);
    }

    insights.sort((a, b) => b.confidence - a.confidence);

    if (query?.limit) {
      insights = insights.slice(0, query.limit);
    }

    return insights;
  }

  archiveInsight(insightId: string): void {
    const insight = this.insights.get(insightId);
    if (!insight) return;

    this.insights.set(insightId, {
      ...insight,
      status: 'archived',
      updatedAt: new Date().toISOString(),
    });
  }

  getInsightById(id: string): InsightV2 | undefined {
    return this.insights.get(id);
  }

  getAllInsights(): InsightV2[] {
    return Array.from(this.insights.values());
  }
}
