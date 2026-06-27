import type { CharacterProfile, CharacterRuntimeState, CuriosityAssessment, CuriosityBudget, CuriosityGap, CuriosityInvestment, CuriosityTarget, DiscoveryFeedback, InterestGraph, MemoryNode, Pattern } from '@our-companion/shared';
export interface GenerateCuriosityTargetsInput {
    userId: string;
    companionId?: string;
    characterState: CharacterRuntimeState;
    characterProfile?: CharacterProfile;
    memoryNodes: MemoryNode[];
    journeySummaries: string[];
    patterns: Pattern[];
    interestGraph: InterestGraph;
    recentFeedback?: DiscoveryFeedback[];
}
export interface CuriosityScoreParts {
    memoryRelevance: number;
    patternStrength: number;
    novelty: number;
    relationshipFit: number;
    characterFit: number;
    surprise: number;
    finalScore: number;
}
export interface AssessCuriosityInput {
    targetId: string;
    targetType: CuriosityAssessment['targetType'];
    growthValue: number;
    gaps?: CuriosityGap[];
    novelty?: number;
    momentum?: number;
    reason?: string;
}
export interface CuriosityMomentumInput {
    savedCount: number;
    ignoredCount: number;
    followUpCount?: number;
}
export declare function scoreCuriosity(parts: Omit<CuriosityScoreParts, 'finalScore'>): CuriosityScoreParts;
export declare function createCuriosityBudget(date: string, total?: number): CuriosityBudget;
export declare function spendCuriosityBudget(budget: CuriosityBudget, cost: number): CuriosityBudget;
export declare function calculateCuriosityMomentum(input: CuriosityMomentumInput): number;
export declare function assessCuriosity(input: AssessCuriosityInput): CuriosityAssessment;
export declare function scoreCuriosityInvestment(input: Omit<CuriosityInvestment, 'id' | 'score' | 'updatedAt'>): CuriosityInvestment;
export declare function generateCuriosityTargets(input: GenerateCuriosityTargetsInput): CuriosityTarget[];
export { CuriosityEngine } from './curiosity-engine';
export { scoreCandidatePriority, rankCandidates } from './curiosity-scoring';
export { generateFromMemories, generateFromPatterns, generateFromInsights, generateDefaultCandidate } from './candidate-generator';
export { addToQueue, removeFromQueue, getTopCandidates, deduplicateQueue, expireStaleCandidates, } from './queue-manager';
export { MIN_CANDIDATE_PRIORITY, MAX_CANDIDATES_IN_QUEUE, CANDIDATE_EXPIRY_DAYS, } from './types';
