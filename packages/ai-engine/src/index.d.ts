import { z } from 'zod';
import type { DiscoveryReason, MemorySummary, ToolIntent } from '@our-companion/shared';
export declare const deepSeekDefaultModel = "deepseek-v4-flash";
export declare const deepSeekDefaultEndpoint = "https://api.deepseek.com";
export declare function getConfiguredModel(env?: Pick<NodeJS.ProcessEnv, string>): string;
export declare function normalizeDeepSeekModel(model: string): string;
export declare function normalizeDeepSeekEndpoint(endpoint: string): string;
export declare const discoveryReasonSchema: z.ZodObject<{
    why_this_matters: z.ZodString;
    recommended_action: z.ZodEnum<["view", "save", "ignore", "add_to_journey"]>;
    short_message: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    why_this_matters: string;
    recommended_action: "view" | "save" | "ignore" | "add_to_journey";
    short_message: string;
    tags: string[];
}, {
    why_this_matters: string;
    recommended_action: "view" | "save" | "ignore" | "add_to_journey";
    short_message: string;
    tags: string[];
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
export declare function parseJsonObject(text: string): unknown;
export declare function validateDiscoveryReason(text: string): DiscoveryReason;
export declare function validateMemorySummary(text: string): MemorySummary;
export declare function validateToolIntent(text: string): ToolIntent;
export interface DeepSeekClientOptions {
    apiKey?: string;
    model?: string;
    endpoint?: string;
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
}
