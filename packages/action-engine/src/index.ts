import { planPerformanceScript } from '@our-companion/character-engine';
import type {
  ActionOrchestratorDeps,
  ActionPermissionState,
  ActionResult,
  ActionStep,
  OurCompanionApi,
  PermissionDecision,
  PermissionScope,
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export type { ActionOrchestratorDeps } from '@our-companion/shared';

type ActionPlan = Parameters<OurCompanionApi['action']['executePlan']>[0];
type ProductionPerformanceScript = Parameters<Parameters<OurCompanionApi['action']['onPerformance']>[0]>[0];

// â”€â”€â”€ Permission scope helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TOOL_SCOPES = {
  open_url: ['browser'],
  search_web: ['browser'],
  browser_navigation: ['browser'],
  open_app: ['automation'],
} as const satisfies Record<string, readonly PermissionScope[]>;
const PERMISSION_SCOPES = new Set<PermissionScope>([
  'browser',
  'automation',
  'files',
  'clipboard',
  'calendar',
]);

type SupportedToolName = keyof typeof TOOL_SCOPES;

function isSupportedTool(toolName: string): toolName is SupportedToolName {
  return Object.hasOwn(TOOL_SCOPES, toolName);
}

function scopesForTool(toolName: string): PermissionScope[] | undefined {
  return isSupportedTool(toolName) ? [...TOOL_SCOPES[toolName]] : undefined;
}

function canonicalScopesForStep(step: ActionStep): PermissionScope[] | undefined {
  const toolScopes = scopesForTool(step.toolName);
  if (!toolScopes) return undefined;

  const declaredScopes = step.requiredScopes;
  if (!Array.isArray(declaredScopes)) return undefined;
  if (declaredScopes.some((scope) => !PERMISSION_SCOPES.has(scope))) return undefined;

  // Tool-derived scopes are authoritative. LLM output may add a narrower
  // security constraint, but it can never remove the tool's required scope.
  return [...new Set([...toolScopes, ...declaredScopes])];
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

// â”€â”€â”€ 3a. Rule-based planner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeStep(toolName: string, args: Record<string, unknown>): ActionStep {
  const requiredScopes = scopesForTool(toolName);
  if (!requiredScopes) throw new Error(`Unsupported tool: ${toolName}`);
  return {
    id: createId('step'),
    toolName,
    args,
    requiredScopes,
  };
}

function makePlan(steps: ActionStep[], opts?: { riskLevel?: 'low' | 'medium' | 'high'; confirmationRequired?: boolean }): ActionPlan {
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
 * Converts a plain-text command into an action plan using deterministic rules.
 * Returns undefined when no rule matches (fall through to LLM planner).
 */
export function planActionFromRules(text: string): ActionPlan | undefined {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Composite: "open <app> and search <query>"
  const compositeAppSearch = lower.match(/^open\s+(\w+)\s+and\s+search\s+(.+)$/);
  if (compositeAppSearch) {
    const [, appName, query] = compositeAppSearch;
    return makePlan([
      makeStep('open_app', { appName }),
      makeStep('search_web', { query, target: 'google' }),
    ]);
  }

  // Composite: "open <url> and search <query>" (less common but valid)
  const compositeUrlSearch = lower.match(/^open\s+(https?:\/\/\S+)\s+and\s+search\s+(.+)$/i);
  if (compositeUrlSearch) {
    const [, url, query] = compositeUrlSearch;
    return makePlan([
      makeStep('open_url', { url }),
      makeStep('search_web', { query, target: 'google' }),
    ]);
  }

  // "open url <url>"
  if (lower.startsWith('open url ')) {
    const url = trimmed.slice('open url '.length).trim();
    return makePlan([makeStep('open_url', { url })]);
  }

  // "open <http(s)://...>" â€” bare URL shorthand
  const bareUrl = trimmed.match(/^open\s+(https?:\/\/\S+)$/i);
  if (bareUrl) {
    const url = bareUrl[1];
    return makePlan([makeStep('open_url', { url })]);
  }

  // "open app <name>"
  if (lower.startsWith('open app ')) {
    const appName = trimmed.slice('open app '.length).trim();
    return makePlan([makeStep('open_app', { appName })]);
  }

  // "search web for <query>"
  if (lower.startsWith('search web for ')) {
    const query = trimmed.slice('search web for '.length).trim();
    return makePlan([makeStep('search_web', { query, target: 'google' })]);
  }

  // "search <target> for <query>" (e.g. "search youtube for PixiJS")
  const searchTarget = lower.match(/^search\s+(\w+)\s+for\s+(.+)$/);
  if (searchTarget) {
    const [, target, query] = searchTarget;
    return makePlan([makeStep('search_web', { query, target })]);
  }

  return undefined;
}

// â”€â”€â”€ 3b. LLM-assisted planner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface LlmPlannerDeps {
  completeJson<T>(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<T>;
  validateActionPlan(raw: string): LlmActionPlanResult | ActionPlan | undefined;
}

export interface LlmActionPlanResult {
  summary: string;
  steps: Array<{ tool_name: string; args: Record<string, unknown>; required_scopes?: string[] }>;
  requires_confirmation?: boolean;
}

export async function planActionFromLlm(
  text: string,
  deps: LlmPlannerDeps,
): Promise<ActionPlan | undefined> {
  try {
    const raw = await deps.completeJson<string>([
      {
        role: 'system',
        content:
          'You are Companion, a desktop companion. Convert the user request into a JSON action plan. ' +
          'Respond ONLY with JSON matching: ' +
          '{"summary":"...","steps":[{"tool_name":"open_url|open_app|search_web|browser_navigation","args":{...},"required_scopes":["browser"|"automation"]}],"requires_confirmation":false}. ' +
          'Use tool_name "none" with empty steps array if the request cannot be performed as a desktop action.',
      },
      { role: 'user', content: text },
    ]);
    const json = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const parsed = deps.validateActionPlan(json);
    if (!parsed) return undefined;

    // Handle a validated action plan directly.
    if ('intentId' in parsed) {
      if (parsed.steps.length === 0) return undefined;
      if (parsed.steps.some((step) => !isSupportedTool(step.toolName))) return undefined;
      return {
        ...parsed,
        steps: parsed.steps.map((step) => ({
          ...step,
          requiredScopes: canonicalScopesForStep(step) ?? [],
        })),
      } as ActionPlan;
    }

    // Handle LlmActionPlanResult (snake_case format)
    const result = parsed as LlmActionPlanResult;
    if (result.steps.length === 0 || result.steps[0].tool_name === 'none') return undefined;
    if (result.steps.some((step) => !isSupportedTool(step.tool_name))) return undefined;
    const steps = result.steps.map((s) => {
      const requiredScopes = [
        ...(scopesForTool(s.tool_name) ?? []),
        ...((s.required_scopes ?? []) as PermissionScope[]),
      ];
      return {
        id: createId('step'),
        toolName: s.tool_name,
        args: s.args,
        requiredScopes: [...new Set(requiredScopes)],
      };
    });
    return makePlan(steps, { confirmationRequired: result.requires_confirmation ?? false });
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
): Promise<ActionPlan | undefined> {
  const fromRules = planActionFromRules(text);
  if (fromRules) return fromRules;
  if (llm) return planActionFromLlm(text, llm);
  return undefined;
}

// â”€â”€â”€ 3c. Permission manager â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Returns 'ok', 'denied', or the list of scopes needing the user to confirm. */
export function resolvePermissions(
  plan: ActionPlan,
  stored: ActionPermissionState,
): 'ok' | 'denied' | PermissionScope[] {
  const needed = new Set<PermissionScope>();
  for (const step of plan.steps) {
    const requiredScopes = canonicalScopesForStep(step);
    if (!requiredScopes) return 'denied';
    for (const scope of requiredScopes) {
      const decision: PermissionDecision = stored[scope] ?? 'ask';
      if (decision === 'denied') return 'denied';
      if (decision === 'ask') needed.add(scope);
    }
  }
  if (needed.size === 0) return 'ok';
  return Array.from(needed);
}

// â”€â”€â”€ 3d. Action orchestrator + state machine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function runActionPlan(
  plan: ActionPlan,
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
      let finalResult = result;
      // Retry only when the execution boundary explicitly classifies the
      // failure as recoverable. An arbitrary failure message is not enough.
      const isRecoverable =
        result.status === 'failed'
        && (result as typeof result & { recoverable?: boolean }).recoverable === true;
      if (isRecoverable) {
        const retry = await deps.executeStep(step.toolName, step.args);
        if (retry.status === 'executed') {
          performedSteps++;
          deps.emitEvent('CommandCompleted', { planId: plan.id, stepId: step.id, toolName: step.toolName }, correlationId);
          continue;
        }
        finalResult = retry;
      }
      const errorMessage = finalResult.blockedReason ?? finalResult.errorMessage ?? 'Step failed';
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

  // All steps succeeded â€” play performance
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

// â”€â”€â”€ 3e. Performance director â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function toPerformanceScript(
  script: ReturnType<typeof planPerformanceScript>
): ProductionPerformanceScript {
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
 * Builds a performance script for an action outcome.
 * Delegates to character-engine's planPerformanceScript â€” never executes commands.
 */
export function directPerformance(
  actionId: string,
  outcome: 'success' | 'failure',
): ProductionPerformanceScript {
  const script = planPerformanceScript(actionId, outcome);
  return toPerformanceScript(script);
}
