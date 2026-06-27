import type { AttentionAssessment, CompanionDecision, CompanionContext, DecisionInput, UserContext } from '@our-companion/shared';
export interface AssessAttentionInput {
    targetId: string;
    targetType: string;
    noveltyScore?: number;
    growthValue?: number;
    urgency?: number;
    sourceQuality?: number;
    userContext: UserContext;
    companionContext: CompanionContext;
}
export declare function assessAttention(input: AssessAttentionInput): AttentionAssessment;
export declare function decideCompanionAction(input: DecisionInput): CompanionDecision;
export { CompanionBrain } from './companion-brain';
export { buildDecisionContext } from './decision-context-builder';
export { generateCandidates } from './decision-candidate';
export { scoreCandidate } from './decision-scoring';
export { shouldInterrupt } from './interruption-policy';
export type { CompanionBrainProviders, MemoryContextProvider, PatternContextProvider, InsightContextProvider, CuriosityContextProvider, CharacterContextProvider, } from './types';
export { MIN_SCORE_FOR_ACTION, MAX_CANDIDATES, DEFAULT_CONFIDENCE } from './types';
