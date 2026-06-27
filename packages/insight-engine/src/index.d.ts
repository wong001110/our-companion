import type { CharacterProfile, CharacterRuntimeState, CompanionInsight, CuriosityTarget, DiscoveryCandidate, InterestGraph, Insight, MemoryNode, Pattern } from '@our-companion/shared';
export interface GenerateInsightsInput {
    userId: string;
    companionId: string;
    characterState: CharacterRuntimeState;
    characterProfile?: CharacterProfile;
    memoryNodes: MemoryNode[];
    patterns: Pattern[];
    interestGraph: InterestGraph;
    curiosityTarget: CuriosityTarget;
    discoveryCandidates: DiscoveryCandidate[];
}
export interface InsightSelectionScore {
    confidence: number;
    novelty: number;
    emotionalRelevance: number;
    practicalRelevance: number;
    relationshipFit: number;
    finalScore: number;
}
export interface GenerateCognitiveInsightInput {
    concepts: Array<{
        id: string;
        name: string;
        summary: string;
    }>;
    patterns: Pattern[];
    discoveryCandidates: DiscoveryCandidate[];
}
export declare function scoreInsight(input: Omit<InsightSelectionScore, 'finalScore'>): InsightSelectionScore;
export declare function narrateInsight(insight: CompanionInsight): string;
export declare function generateInsights(input: GenerateInsightsInput): CompanionInsight[];
export declare function selectPrimaryInsight(insights: CompanionInsight[]): CompanionInsight | undefined;
export declare function generateCognitiveInsight(input: GenerateCognitiveInsightInput): Insight | undefined;
export { InsightEngine } from './insight-engine';
export { calculateInsightConfidence, calculateInsightImportance, calculateInsightNovelty } from './scoring';
export { generateInterestInsights } from './generators/interest-insight';
export { generateLearningInsights } from './generators/learning-insight';
export { generateProductivityInsights } from './generators/productivity-insight';
export { generateProjectInsights } from './generators/project-insight';
export { generateBehaviourInsights } from './generators/behaviour-insight';
export { generateRelationshipInsights } from './generators/relationship-insight';
export { generateDiscoveryInsights } from './generators/discovery-insight';
export { generateRiskInsights } from './generators/risk-insight';
export { MIN_PATTERNS_FOR_INSIGHT, MAX_INSIGHTS_PER_GENERATION, CONFIDENCE_WEIGHTS, } from './types';
