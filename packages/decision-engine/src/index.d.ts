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
