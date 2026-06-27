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
export { PatternEngine } from './pattern-engine';
export { calculatePatternConfidence } from './confidence';
export { detectInterestPatterns } from './detectors/interest-detector';
export { detectBehaviourPatterns } from './detectors/behaviour-detector';
export { detectConversationPatterns } from './detectors/conversation-detector';
export { detectProjectPatterns } from './detectors/project-detector';
export { detectLearningPatterns } from './detectors/learning-detector';
export { detectTemporalPatterns } from './detectors/temporal-detector';
export { detectRelationshipPatterns } from './detectors/relationship-detector';
export { MIN_SUPPORTING_MEMORIES, MAX_PATTERNS_PER_DETECTION, CONFIDENCE_WEIGHTS, } from './types';
