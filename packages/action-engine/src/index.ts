import { planPerformanceScript } from '@our-companion/character-engine';
import type {
  ActionPermissionState,
  ActionPlanV2,
  ActionResult,
  ActionStep,
  PermissionDecision,
  PermissionScope,
  PerformanceScript,
  PerformanceScriptV2,
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

// ─── Permission scope helpers ──────────────────────────────────────────────

const BROWSER_TOOLS = new Set(['open_url', 'search_web', 'browser_navigation']);
const AUTOMATION_TOOLS = new Set(['open_app']);

function scopesForTool(toolName: string): PermissionScope[] {
  if (BROWSER_TOOLS.has(toolName)) return ['browser'];
  if (AUTOMATION_TOOLS.has(toolName)) return ['automation'];
  return [];
}

export function defaultPermissions(): ActionPermissionState {
  return {
    browser: 'ask',
    automation: 'ask',
    files: 'ask',
    clipboard: 'ask',
    calendar: 'ask',
  };
}

// ─── 3a. Rule-based planner ────────────────────────────────────────────────

function makeStep(toolName: string, args: Record<string, unknown>): ActionStep {
  return {
    id: createId('step'),
    toolName,
    args,
    requiredScopes: scopesForTool(toolName),
  };
}

function makePlanV2(steps: ActionStep[], opts?: { riskLevel?: 'low' | 'medium' | 'high'; confirmationRequired?: boolean }): ActionPlanV2 {
  return {
    id: createId('plan'),
    intentId: createId('intent'),
    steps,
    requiredPermissions: [...new Set(steps.flatMap((s) => s.requiredScopes))],
    riskLevel: opts?.riskLevel ?? 'low',
    confirmationRequired: opts?.confirmationRequired ?? false,
    status: 'draft',
  };
}

/**
 * Converts a plain-text command into an ActionPlanV2 using deterministic rules.
 * Returns undefined when no rule matches (fall through to LLM planner).
 */
export function planActionFromRules(text: string): ActionPlanV2 | undefined {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Composite: "open <app> and search <query>"
  const compositeAppSearch = lower.match(/^open\s+(\w+)\s+and\s+search\s+(.+)$/);
  if (compositeAppSearch) {
    const [, appName, query] = compositeAppSearch;
    return makePlanV2([
      makeStep('open_app', { appName }),
      makeStep('search_web', { query, target: 'google' }),
    ]);
  }

  // Composite: "open <url> and search <query>" (less common but valid)
  const compositeUrlSearch = lower.match(/^open\s+(https?:\/\/\S+)\s+and\s+search\s+(.+)$/i);
  if (compositeUrlSearch) {
    const [, url, query] = compositeUrlSearch;
    return makePlanV2([
      makeStep('open_url', { url }),
      makeStep('search_web', { query, target: 'google' }),
    ]);
  }

  // "open url <url>"
  if (lower.startsWith('open url ')) {
    const url = trimmed.slice('open url '.length).trim();
    return makePlanV2([makeStep('open_url', { url })]);
  }

  // "open <http(s)://...>" — bare URL shorthand
  const bareUrl = trimmed.match(/^open\s+(https?:\/\/\S+)$/i);
  if (bareUrl) {
    const url = bareUrl[1];
    return makePlanV2([makeStep('open_url', { url })]);
  }

  // "open app <name>"
  if (lower.startsWith('open app ')) {
    const appName = trimmed.slice('open app '.length).trim();
    return makePlanV2([makeStep('open_app', { appName })]);
  }

  // "search web for <query>"
  if (lower.startsWith('search web for ')) {
    const query = trimmed.slice('search web for '.length).trim();
    return makePlanV2([makeStep('search_web', { query, target: 'google' })]);
  }

  // "search <target> for <query>" (e.g. "search youtube for PixiJS")
  const searchTarget = lower.match(/^search\s+(\w+)\s+for\s+(.+)$/);
  if (searchTarget) {
    const [, target, query] = searchTarget;
    return makePlanV2([makeStep('search_web', { query, target })]);
  }

  return undefined;
}

// ─── 3b. LLM-assisted planner ─────────────────────────────────────────────

export interface LlmPlannerDeps {
  completeJson<T>(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<T>;
  validateActionPlan(raw: string): LlmActionPlanResult | ActionPlanV2 | undefined;
}

export interface LlmActionPlanResult {
  summary: string;
  steps: Array<{ tool_name: string; args: Record<string, unknown>; required_scopes?: string[] }>;
  requires_confirmation?: boolean;
}

export async function planActionFromLlm(
  text: string,
  deps: LlmPlannerDeps,
): Promise<ActionPlanV2 | undefined> {
  try {
    const raw = await deps.completeJson<string>([
      {
        role: 'system',
        content:
          'You are Ann, a desktop companion. Convert the user request into a JSON action plan. ' +
          'Respond ONLY with JSON matching: ' +
          '{"summary":"...","steps":[{"tool_name":"open_url|open_app|search_web|browser_navigation","args":{...},"required_scopes":["browser"|"automation"]}],"requires_confirmation":false}. ' +
          'Use tool_name "none" with empty steps array if the request cannot be performed as a desktop action.',
      },
      { role: 'user', content: text },
    ]);
    const json = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const parsed = deps.validateActionPlan(json);
    if (!parsed) return undefined;

    // Handle ActionPlanV2 directly (from ai-engine validateActionPlan)
    if ('intentId' in parsed) {
      if (parsed.steps.length === 0) return undefined;
      return parsed as ActionPlanV2;
    }

    // Handle LlmActionPlanResult (snake_case format)
    const result = parsed as LlmActionPlanResult;
    if (result.steps.length === 0 || result.steps[0].tool_name === 'none') return undefined;
    const steps = result.steps.map((s) => ({
      id: createId('step'),
      toolName: s.tool_name,
      args: s.args,
      requiredScopes: (s.required_scopes ?? scopesForTool(s.tool_name)) as PermissionScope[],
    }));
    return makePlanV2(steps, { confirmationRequired: result.requires_confirmation ?? false });
  } catch {
    return undefined;
  }
}

/**
 * Top-level planner: tries rules first; falls back to LLM when available.
 */
export async function planAction(
  text: string,
  llm?: LlmPlannerDeps,
): Promise<ActionPlanV2 | undefined> {
  const fromRules = planActionFromRules(text);
  if (fromRules) return fromRules;
  if (llm) return planActionFromLlm(text, llm);
  return undefined;
}

// ─── 3c. Permission manager ───────────────────────────────────────────────

/** Returns 'ok', 'denied', or the list of scopes needing the user to confirm. */
export function resolvePermissions(
  plan: ActionPlanV2,
  stored: ActionPermissionState,
): 'ok' | 'denied' | PermissionScope[] {
  const needed = new Set<PermissionScope>();
  for (const step of plan.steps) {
    for (const scope of step.requiredScopes) {
      const decision: PermissionDecision = stored[scope] ?? 'ask';
      if (decision === 'denied') return 'denied';
      if (decision === 'ask') needed.add(scope);
    }
  }
  if (needed.size === 0) return 'ok';
  return Array.from(needed);
}

// ─── 3d. Action orchestrator + state machine ──────────────────────────────

export interface ActionOrchestratorDeps {
  executeStep(toolName: string, args: Record<string, unknown>): Promise<{ status: string; errorMessage?: string; blockedReason?: string }>;
  emitEvent(type: string, payload?: Record<string, unknown>, correlationId?: string): void;
  getPermissions(): ActionPermissionState;
  directPerformance(actionId: string, outcome: 'success' | 'failure'): PerformanceScriptV2;
  broadcastPerformance(script: PerformanceScriptV2): void;
}

export async function runActionPlan(
  plan: ActionPlanV2,
  deps: ActionOrchestratorDeps,
  correlationId?: string,
): Promise<ActionResult> {
  deps.emitEvent('ActionPlanned', { planId: plan.id, intentId: plan.intentId, riskLevel: plan.riskLevel }, correlationId);

  // Permission check
  const permissions = deps.getPermissions();
  const permResult = resolvePermissions(plan, permissions);
  if (permResult === 'denied') {
    deps.emitEvent('ActionFailed', { planId: plan.id, reason: 'permission_denied' }, correlationId);
    return {
      id: createId('action_result'),
      planId: plan.id,
      status: 'cancelled',
      outputs: {},
      errors: ['Permission denied for this action.'],
      completedAt: nowIso(),
    };
  }
  if (Array.isArray(permResult)) {
    deps.emitEvent('ActionFailed', { planId: plan.id, reason: 'await_permission', requiredScopes: permResult }, correlationId);
    return {
      id: createId('action_result'),
      planId: plan.id,
      status: 'cancelled',
      outputs: {},
      errors: [`Permission needed for: ${permResult.join(', ')}`],
      completedAt: nowIso(),
    };
  }

  deps.emitEvent('PermissionGranted', { planId: plan.id }, correlationId);

  // Execute steps
  let performedSteps = 0;
  const errors: string[] = [];
  for (const step of plan.steps) {
    deps.emitEvent('CommandStarted', { planId: plan.id, stepId: step.id, toolName: step.toolName }, correlationId);
    const result = await deps.executeStep(step.toolName, step.args);
    if (result.status === 'executed') {
      performedSteps++;
      deps.emitEvent('CommandCompleted', { planId: plan.id, stepId: step.id, toolName: step.toolName }, correlationId);
      if (step.waitMs && step.waitMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, step.waitMs));
      }
    } else {
      // Retry once for recoverable errors (app not found, timeout)
      const isRecoverable = result.status === 'failed' && !result.blockedReason;
      if (isRecoverable) {
        const retry = await deps.executeStep(step.toolName, step.args);
        if (retry.status === 'executed') {
          performedSteps++;
          deps.emitEvent('CommandCompleted', { planId: plan.id, stepId: step.id, toolName: step.toolName }, correlationId);
          continue;
        }
      }
      const errorMessage = result.blockedReason ?? result.errorMessage ?? 'Step failed';
      deps.emitEvent('ActionFailed', { planId: plan.id, stepId: step.id, toolName: step.toolName, errorMessage }, correlationId);
      const script = deps.directPerformance(plan.id, 'failure');
      deps.emitEvent('PerformanceStarted', { planId: plan.id, scriptId: script.id }, correlationId);
      deps.broadcastPerformance(script);
      deps.emitEvent('PerformanceCompleted', { planId: plan.id, scriptId: script.id }, correlationId);
      return {
        id: createId('action_result'),
        planId: plan.id,
        status: 'failure',
        outputs: { performedSteps },
        errors: [errorMessage],
        completedAt: nowIso(),
      };
    }
  }

  // All steps succeeded — play performance
  const script = deps.directPerformance(plan.id, 'success');
  deps.emitEvent('PerformanceStarted', { planId: plan.id, scriptId: script.id }, correlationId);
  deps.broadcastPerformance(script);
  deps.emitEvent('PerformanceCompleted', { planId: plan.id, scriptId: script.id }, correlationId);

  return {
    id: createId('action_result'),
    planId: plan.id,
    status: performedSteps === plan.steps.length ? 'success' : 'partial',
    outputs: { performedSteps },
    completedAt: nowIso(),
  };
}

// ─── 3e. Performance director ─────────────────────────────────────────────

function toPerformanceScriptV2(script: PerformanceScript): PerformanceScriptV2 {
  return {
    id: script.id,
    name: script.actionId,
    behaviourType: 'perform_action',
    animationSequence: script.steps.map((s) => ({
      id: s.animationKey,
      type: 'animation' as const,
      startMs: 0,
      durationMs: s.durationMs,
      payload: { label: s.label, animationKey: s.animationKey },
    })),
    interruptible: true,
  };
}

/**
 * Builds a PerformanceScriptV2 for an action outcome.
 * Delegates to character-engine's planPerformanceScript — never executes commands.
 */
export function directPerformance(
  actionId: string,
  outcome: 'success' | 'failure',
): PerformanceScriptV2 {
  const v1Script = planPerformanceScript(actionId, outcome);
  return toPerformanceScriptV2(v1Script);
}

// ============================================================================
// Action Engine V2 — Enhanced action planning
// ============================================================================

export { createActionPlan, approvePlan, cancelPlan } from './action-planner';
export { assessRiskLevel, checkPermissions, requiresConfirmation } from './permission-checker';
export { executeActionPlan } from './action-executor';
