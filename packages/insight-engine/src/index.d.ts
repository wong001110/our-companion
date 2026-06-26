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
