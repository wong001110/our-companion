import { z } from 'zod';
import type { CompanionDecision, CompanionInsight, CuriosityAssessment, CuriosityTarget, DiscoveryReason, DiscoveryUnderstanding, Insight, MemorySummary, ToolIntent } from '@our-companion/shared';
export declare const deepSeekDefaultModel = "deepseek-v4-flash";
export declare const deepSeekDefaultEndpoint = "https://api.deepseek.com";
export declare function getConfiguredModel(env?: Pick<NodeJS.ProcessEnv, string>): string;
export declare function normalizeDeepSeekModel(model: string): string;
export declare function normalizeDeepSeekEndpoint(endpoint: string): string;
export declare const discoveryReasonSchema: z.ZodObject<{
    why_this_matters: z.ZodString;
    recommended_action: z.ZodEnum<["view", "save", "ignore", "add_to_journey"]>;
    short_message: z.ZodString;
    card_title: z.ZodOptional<z.ZodString>;
    card_body: z.ZodOptional<z.ZodString>;
    tags: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    why_this_matters: string;
    recommended_action: "view" | "save" | "ignore" | "add_to_journey";
    short_message: string;
    tags: string[];
    card_title?: string | undefined;
    card_body?: string | undefined;
}, {
    why_this_matters: string;
    recommended_action: "view" | "save" | "ignore" | "add_to_journey";
    short_message: string;
    tags: string[];
    card_title?: string | undefined;
    card_body?: string | undefined;
}>;
export declare const memorySummarySchema: z.ZodObject<{
    type: z.ZodEnum<["topic", "discovery", "resource", "question", "decision", "outcome"]>;
    title: z.ZodString;
    summary: z.ZodString;
    importance_score: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "topic" | "discovery" | "resource" | "question" | "decision" | "outcome";
    title: string;
    summary: string;
    importance_score: number;
}, {
    type: "topic" | "discovery" | "resource" | "question" | "decision" | "outcome";
    title: string;
    summary: string;
    importance_score: number;
}>;
export declare const toolIntentSchema: z.ZodObject<{
    tool_name: z.ZodEnum<["open_url", "open_app", "search_web", "browser_navigation", "none"]>;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    requires_confirmation: z.ZodBoolean;
    user_facing_summary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    tool_name: "open_url" | "open_app" | "search_web" | "browser_navigation" | "none";
    args: Record<string, unknown>;
    requires_confirmation: boolean;
    user_facing_summary: string;
}, {
    tool_name: "open_url" | "open_app" | "search_web" | "browser_navigation" | "none";
    args: Record<string, unknown>;
    requires_confirmation: boolean;
    user_facing_summary: string;
}>;
export declare const actionStepSchema: z.ZodObject<{
    tool_name: z.ZodEnum<["open_url", "open_app", "search_web", "browser_navigation", "none"]>;
    args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    required_scopes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    tool_name: "open_url" | "open_app" | "search_web" | "browser_navigation" | "none";
    args: Record<string, unknown>;
    required_scopes?: string[] | undefined;
}, {
    tool_name: "open_url" | "open_app" | "search_web" | "browser_navigation" | "none";
    args: Record<string, unknown>;
    required_scopes?: string[] | undefined;
}>;
export declare const actionPlanSchema: z.ZodObject<{
    summary: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        tool_name: z.ZodEnum<["open_url", "open_app", "search_web", "browser_navigation", "none"]>;
        args: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        required_scopes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        tool_name: "open_url" | "open_app" | "search_web" | "browser_navigation" | "none";
        args: Record<string, unknown>;
        required_scopes?: string[] | undefined;
    }, {
        tool_name: "open_url" | "open_app" | "search_web" | "browser_navigation" | "none";
        args: Record<string, unknown>;
        required_scopes?: string[] | undefined;
    }>, "many">;
    requires_confirmation: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    summary: string;
    steps: {
        tool_name: "open_url" | "open_app" | "search_web" | "browser_navigation" | "none";
        args: Record<string, unknown>;
        required_scopes?: string[] | undefined;
    }[];
    requires_confirmation?: boolean | undefined;
}, {
    summary: string;
    steps: {
        tool_name: "open_url" | "open_app" | "search_web" | "browser_navigation" | "none";
        args: Record<string, unknown>;
        required_scopes?: string[] | undefined;
    }[];
    requires_confirmation?: boolean | undefined;
}>;
export type ActionPlanLlmResult = z.infer<typeof actionPlanSchema>;
export declare function validateActionPlan(raw: string): ActionPlanLlmResult | undefined;
export declare const curiosityTargetSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
    companionId: z.ZodOptional<z.ZodString>;
    topic: z.ZodString;
    description: z.ZodString;
    source: z.ZodEnum<["memory_trigger", "pattern_trigger", "journey_trigger", "novelty_trigger", "contradiction_trigger", "relationship_trigger", "character_trigger"]>;
    explorationType: z.ZodEnum<["similar", "adjacent", "opposite", "deepening", "challenge", "practical"]>;
    priority: z.ZodNumber;
    confidence: z.ZodNumber;
    reason: z.ZodString;
    expectedValue: z.ZodString;
    relatedMemoryIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    relatedPatternIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    relatedInterestNodeIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    createdAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    topic: string;
    description: string;
    source: "memory_trigger" | "pattern_trigger" | "journey_trigger" | "novelty_trigger" | "contradiction_trigger" | "relationship_trigger" | "character_trigger";
    explorationType: "similar" | "adjacent" | "opposite" | "deepening" | "challenge" | "practical";
    priority: number;
    confidence: number;
    reason: string;
    expectedValue: string;
    id?: string | undefined;
    userId?: string | undefined;
    companionId?: string | undefined;
    relatedMemoryIds?: string[] | undefined;
    relatedPatternIds?: string[] | undefined;
    relatedInterestNodeIds?: string[] | undefined;
    createdAt?: string | undefined;
}, {
    topic: string;
    description: string;
    source: "memory_trigger" | "pattern_trigger" | "journey_trigger" | "novelty_trigger" | "contradiction_trigger" | "relationship_trigger" | "character_trigger";
    explorationType: "similar" | "adjacent" | "opposite" | "deepening" | "challenge" | "practical";
    priority: number;
    confidence: number;
    reason: string;
    expectedValue: string;
    id?: string | undefined;
    userId?: string | undefined;
    companionId?: string | undefined;
    relatedMemoryIds?: string[] | undefined;
    relatedPatternIds?: string[] | undefined;
    relatedInterestNodeIds?: string[] | undefined;
    createdAt?: string | undefined;
}>;
export declare const discoveryUnderstandingSchema: z.ZodObject<{
    summary: z.ZodString;
    concepts: z.ZodArray<z.ZodString, "many">;
    entities: z.ZodArray<z.ZodString, "many">;
    tags: z.ZodArray<z.ZodString, "many">;
    growth_value: z.ZodNumber;
    confidence: z.ZodNumber;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    tags: string[];
    summary: string;
    confidence: number;
    reason: string;
    concepts: string[];
    entities: string[];
    growth_value: number;
}, {
    tags: string[];
    summary: string;
    confidence: number;
    reason: string;
    concepts: string[];
    entities: string[];
    growth_value: number;
}>;
export declare const cognitiveInsightSchema: z.ZodObject<{
    title: z.ZodString;
    explanation: z.ZodString;
    related_concepts: z.ZodArray<z.ZodString, "many">;
    growth_value: z.ZodNumber;
    confidence: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    title: string;
    confidence: number;
    growth_value: number;
    explanation: string;
    related_concepts: string[];
}, {
    title: string;
    confidence: number;
    growth_value: number;
    explanation: string;
    related_concepts: string[];
}>;
export declare const curiosityAssessmentSchema: z.ZodObject<{
    target_id: z.ZodString;
    target_type: z.ZodString;
    growth_value: z.ZodNumber;
    budget_cost: z.ZodNumber;
    gap_match: z.ZodOptional<z.ZodObject<{
        gap_id: z.ZodString;
        strength: z.ZodNumber;
        reason: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        gap_id: string;
        strength: number;
    }, {
        reason: string;
        gap_id: string;
        strength: number;
    }>>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    growth_value: number;
    target_id: string;
    target_type: string;
    budget_cost: number;
    gap_match?: {
        reason: string;
        gap_id: string;
        strength: number;
    } | undefined;
}, {
    reason: string;
    growth_value: number;
    target_id: string;
    target_type: string;
    budget_cost: number;
    gap_match?: {
        reason: string;
        gap_id: string;
        strength: number;
    } | undefined;
}>;
export declare const decisionSchema: z.ZodObject<{
    action: z.ZodEnum<["speak", "queue_for_later", "remember_only", "ignore", "perform_action", "stay_silent"]>;
    timing: z.ZodEnum<["now", "next_idle", "later"]>;
    priority: z.ZodEnum<["low", "normal", "high"]>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    priority: "low" | "normal" | "high";
    reason: string;
    action: "ignore" | "speak" | "queue_for_later" | "remember_only" | "perform_action" | "stay_silent";
    timing: "now" | "next_idle" | "later";
}, {
    priority: "low" | "normal" | "high";
    reason: string;
    action: "ignore" | "speak" | "queue_for_later" | "remember_only" | "perform_action" | "stay_silent";
    timing: "now" | "next_idle" | "later";
}>;
export declare const companionInsightSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
    companionId: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    type: z.ZodEnum<["observation", "pattern", "hypothesis", "question", "opportunity", "warning", "contradiction", "practical_next_step"]>;
    summary: z.ZodString;
    insight: z.ZodString;
    whyItMatters: z.ZodString;
    whyAnnFoundIt: z.ZodString;
    confidence: z.ZodNumber;
    novelty: z.ZodNumber;
    emotionalRelevance: z.ZodNumber;
    practicalRelevance: z.ZodNumber;
    supportingCandidateIds: z.ZodArray<z.ZodString, "many">;
    relatedMemoryIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    relatedPatternIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    suggestedQuestion: z.ZodOptional<z.ZodString>;
    suggestedAction: z.ZodOptional<z.ZodString>;
    narration: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "question" | "observation" | "pattern" | "hypothesis" | "opportunity" | "warning" | "contradiction" | "practical_next_step";
    title: string;
    summary: string;
    confidence: number;
    insight: string;
    whyItMatters: string;
    whyAnnFoundIt: string;
    novelty: number;
    emotionalRelevance: number;
    practicalRelevance: number;
    supportingCandidateIds: string[];
    id?: string | undefined;
    userId?: string | undefined;
    companionId?: string | undefined;
    relatedMemoryIds?: string[] | undefined;
    relatedPatternIds?: string[] | undefined;
    createdAt?: string | undefined;
    suggestedQuestion?: string | undefined;
    suggestedAction?: string | undefined;
    narration?: string | undefined;
}, {
    type: "question" | "observation" | "pattern" | "hypothesis" | "opportunity" | "warning" | "contradiction" | "practical_next_step";
    title: string;
    summary: string;
    confidence: number;
    insight: string;
    whyItMatters: string;
    whyAnnFoundIt: string;
    novelty: number;
    emotionalRelevance: number;
    practicalRelevance: number;
    supportingCandidateIds: string[];
    id?: string | undefined;
    userId?: string | undefined;
    companionId?: string | undefined;
    relatedMemoryIds?: string[] | undefined;
    relatedPatternIds?: string[] | undefined;
    createdAt?: string | undefined;
    suggestedQuestion?: string | undefined;
    suggestedAction?: string | undefined;
    narration?: string | undefined;
}>;
export declare function parseJsonObject(text: string): unknown;
export declare function validateDiscoveryReason(text: string): DiscoveryReason;
export declare function validateMemorySummary(text: string): MemorySummary;
export declare function validateToolIntent(text: string): ToolIntent;
export declare function validateCuriosityTargets(text: string): Array<Partial<CuriosityTarget> & Pick<CuriosityTarget, 'topic' | 'description' | 'source' | 'explorationType' | 'priority' | 'confidence' | 'reason' | 'expectedValue'>>;
export declare function validateDiscoveryUnderstanding(text: string): DiscoveryUnderstanding;
export declare function validateCognitiveInsight(text: string): Pick<Insight, 'title' | 'explanation' | 'growthValue' | 'confidence'> & {
    relatedConcepts: string[];
};
export declare function validateCuriosityAssessment(text: string): Pick<CuriosityAssessment, 'targetId' | 'targetType' | 'growthValue' | 'budgetCost' | 'reason'> & {
    gapMatch?: CuriosityAssessment['gapMatch'];
};
export declare function validateDecision(text: string): Pick<CompanionDecision, 'action' | 'timing' | 'priority' | 'reason'>;
export declare function validateCompanionInsights(text: string): Array<Partial<CompanionInsight> & Pick<CompanionInsight, 'title' | 'type' | 'summary' | 'insight' | 'whyItMatters' | 'whyAnnFoundIt' | 'confidence' | 'novelty' | 'emotionalRelevance' | 'practicalRelevance' | 'supportingCandidateIds'>>;
export interface DeepSeekClientOptions {
    apiKey?: string;
    model?: string;
    endpoint?: string;
}
export declare class DeepSeekRequestError extends Error {
    readonly status: number;
    readonly statusText: string;
    readonly requestBody: unknown;
    readonly responseBody: unknown;
    constructor(input: {
        status: number;
        statusText: string;
        requestBody: unknown;
        responseBody: unknown;
    });
}
export declare class DeepSeekClient {
    private readonly apiKey?;
    private readonly model;
    private readonly endpoint;
    constructor(options?: DeepSeekClientOptions);
    chat(messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>): Promise<string>;
    chatDebug(messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>): Promise<{
        content: string;
        raw: unknown;
        requestBody: unknown;
    }>;
}
