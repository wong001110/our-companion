import type { ActionPermissionState, ActionPlan, ActionRunResult, PermissionScope, PerformanceScript } from '@our-companion/shared';
export declare function defaultPermissions(): ActionPermissionState;
/**
 * Converts a plain-text command into an ActionPlan using deterministic rules.
 * Returns undefined when no rule matches (fall through to LLM planner).
 */
export declare function planActionFromRules(text: string): ActionPlan | undefined;
export interface LlmPlannerDeps {
    completeJson<T>(messages: Array<{
        role: 'system' | 'user';
        content: string;
    }>): Promise<T>;
    validateActionPlan(raw: string): LlmActionPlanResult | undefined;
}
export interface LlmActionPlanResult {
    summary: string;
    steps: Array<{
        tool_name: string;
        args: Record<string, unknown>;
        required_scopes?: string[];
    }>;
    requires_confirmation?: boolean;
}
export declare function planActionFromLlm(text: string, deps: LlmPlannerDeps): Promise<ActionPlan | undefined>;
/**
 * Top-level planner: tries rules first; falls back to LLM when available.
 */
export declare function planAction(text: string, llm?: LlmPlannerDeps): Promise<ActionPlan | undefined>;
/** Returns 'ok', 'denied', or the list of scopes needing the user to confirm. */
export declare function resolvePermissions(plan: ActionPlan, stored: ActionPermissionState): 'ok' | 'denied' | PermissionScope[];
export interface ActionOrchestratorDeps {
    executeStep(toolName: string, args: Record<string, unknown>): Promise<{
        status: string;
        errorMessage?: string;
        blockedReason?: string;
    }>;
    emitEvent(type: string, payload?: Record<string, unknown>, correlationId?: string): void;
    getPermissions(): ActionPermissionState;
    directPerformance(actionId: string, outcome: 'success' | 'failure'): PerformanceScript;
    broadcastPerformance(script: PerformanceScript): void;
}
export declare function runActionPlan(plan: ActionPlan, deps: ActionOrchestratorDeps, correlationId?: string): Promise<ActionRunResult>;
/**
 * Builds a PerformanceScript for an action outcome.
 * Delegates to character-engine's planPerformanceScript — never executes commands.
 */
export declare function directPerformance(actionId: string, outcome: 'success' | 'failure'): PerformanceScript;
export { createActionPlan, approvePlan, cancelPlan } from './action-planner';
export { assessRiskLevel, checkPermissions, requiresConfirmation } from './permission-checker';
export { executeActionPlan } from './action-executor';
