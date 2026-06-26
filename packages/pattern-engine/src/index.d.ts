import type { Concept, Discovery, DiscoveryFeedback, JourneyMilestone, MemoryNode, Pattern } from '@our-companion/shared';
export interface DetectPatternsInput {
    userId: string;
    memoryNodes: MemoryNode[];
    journeyMilestones: JourneyMilestone[];
    discoveryHistory: Discovery[];
    feedbackHistory: DiscoveryFeedback[];
    conversationSummaries?: string[];
}
export interface PatternScore {
    frequency: number;
    recency: number;
    emotionalWeight: number;
    feedbackWeight: number;
    finalScore: number;
}
export interface DetectCognitivePatternsInput {
    userId: string;
    concepts: Concept[];
    discoveries: Discovery[];
}
export declare function scorePattern(input: Omit<PatternScore, 'finalScore'>): PatternScore;
export declare function detectPatterns(input: DetectPatternsInput): Pattern[];
export declare function detectCognitivePatterns(input: DetectCognitivePatternsInput): Pattern[];
