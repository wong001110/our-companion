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
import {
  actionCapabilityPromptSummary,
  createId,
  getActionCapability,
  normalizeActionUrl,
  nowIso,
  validateActionCapabilityArgs,
} from '@our-companion/shared';

export type { ActionOrchestratorDeps } from '@our-companion/shared';

type ActionPlan = Parameters<OurCompanionApi['action']['executePlan']>[0];
type ProductionPerformanceScript = Parameters<Parameters<OurCompanionApi['action']['onPerformance']>[0]>[0];

// â”€â”€â”€ Permission scope helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PERMISSION_SCOPES = new Set<PermissionScope>([
  'browser',
  'automation',
  'files',
  'clipboard',
  'calendar',
]);

function isSupportedTool(toolName: string): boolean {
  return getActionCapability(toolName)?.enabled === true;
}

function scopesForTool(toolName: string): PermissionScope[] | undefined {
  const capability = getActionCapability(toolName);
  return capability?.enabled ? [...capability.requiredScopes] : undefined;
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
  const validated = validateActionCapabilityArgs(toolName, args);
  if (!validated.ok) throw new Error(validated.reason);
  return {
    id: createId('step'),
    toolName,
    args: validated.args,
    requiredScopes,
  };
}

function makePlan(steps: ActionStep[], opts?: { riskLevel?: 'low' | 'medium' | 'high'; confirmationRequired?: boolean }): ActionPlan {
  const capabilities = steps.map((step) => getActionCapability(step.toolName)).filter(Boolean);
  const riskRank = { low: 0, medium: 1, high: 2 } as const;
  const registryRisk = capabilities.reduce<'low' | 'medium' | 'high'>(
    (highest, capability) => capability && riskRank[capability.riskLevel] > riskRank[highest] ? capability.riskLevel : highest,
    'low',
  );
  const requestedRisk = opts?.riskLevel ?? 'low';
  const effectiveRisk = riskRank[requestedRisk] > riskRank[registryRisk] ? requestedRisk : registryRisk;
  return {
    id: createId('plan'),
    intentId: createId('intent'),
    steps,
    requiredPermissions: [...new Set(steps.flatMap((s) => s.requiredScopes))],
    riskLevel: effectiveRisk,
    confirmationRequired: Boolean(opts?.confirmationRequired)
      || capabilities.some((capability) => capability?.requiresConfirmationByDefault),
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
  const openDirective = trimmed.replace(/^(?:please\s+|could\s+you\s+|帮我|请)\s*/i, '').trim();

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
    const url = normalizeActionUrl(trimmed.slice('open url '.length));
    return url ? makePlan([makeStep('open_url', { url })]) : undefined;
  }

  // Browser navigation commands in English and Chinese.
  if (/^(?:go\s+back|返回上一页)$/i.test(trimmed)) {
    return makePlan([makeStep('browser_navigation', { action: 'go_back' })]);
  }
  if (/^(?:go\s+forward|前进)$/i.test(trimmed)) {
    return makePlan([makeStep('browser_navigation', { action: 'go_forward' })]);
  }
  if (/^(?:reload(?:\s+(?:the\s+)?page)?|刷新页面)$/i.test(trimmed)) {
    return makePlan([makeStep('browser_navigation', { action: 'reload' })]);
  }

  // Opening a tab is deterministic only when its target is a safe public URL.
  const englishTabTarget = trimmed.match(/^open\s+(?:a\s+)?(?:new\s+)?tab(?:\s+to)?\s+(.+)$/i)?.[1];
  const chineseTabTarget = trimmed.match(/^打开(?:一个)?新标签页(?:到)?\s*(.+)$/)?.[1];
  const tabTarget = englishTabTarget ?? chineseTabTarget;
  if (tabTarget) {
    const url = normalizeActionUrl(tabTarget);
    return url
      ? makePlan([makeStep('browser_navigation', { action: 'open_tab', url })])
      : undefined;
  }

  // A small explicit alias set resolves otherwise ambiguous natural names.
  const namedOpen = openDirective.match(/^(?:open|go\s+to|打开)\s+(.+)$/i)?.[1]?.trim();
  const knownApps: Record<string, string> = {
    brave: 'Brave',
    chrome: 'Chrome',
    chromium: 'Chromium',
    edge: 'Edge',
    firefox: 'Firefox',
    safari: 'Safari',
    notepad: 'Notepad',
    calculator: 'Calculator',
    vscode: 'VSCode',
  };
  if (namedOpen?.toLowerCase() === 'youtube') {
    return makePlan([makeStep('open_url', { url: 'youtube.com' })]);
  }
  const knownApp = namedOpen ? knownApps[namedOpen.toLowerCase()] : undefined;
  if (knownApp) {
    return makePlan([makeStep('open_app', { appName: knownApp })]);
  }

  // English and Chinese URL commands, including a safe bare domain.
  const openTarget = openDirective.match(/^(?:open|go\s+to|打开)\s+(.+)$/i);
  if (openTarget) {
    const url = normalizeActionUrl(openTarget[1]);
    if (url) return makePlan([makeStep('open_url', { url })]);
  }

  // Explicit English and Chinese app commands.
  const appName = openDirective.match(/^(?:open\s+(?:app|application)|打开应用)\s*(.+)$/i)?.[1]?.trim();
  if (appName) {
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

  // Chinese search commands preserve the user's query casing and spacing.
  const chineseSearch = trimmed.match(/^(?:帮我)?搜索\s*(.+)$/)?.[1]?.trim();
  if (chineseSearch) {
    return makePlan([makeStep('search_web', { query: chineseSearch, target: 'google' })]);
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
          `Available capabilities:\n${actionCapabilityPromptSummary()}\n` +
          'Respond ONLY with JSON matching: ' +
          '{"summary":"...","steps":[{"tool_name":"enabled registry tool or none","args":{...},"required_scopes":[]}],"requires_confirmation":false}. ' +
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
      const validatedSteps = parsed.steps.map((step) => validateActionCapabilityArgs(step.toolName, step.args));
      if (validatedSteps.some((result) => !result.ok)) return undefined;
      const steps = parsed.steps.map((step, index) => ({
          ...step,
          args: validatedSteps[index].ok ? validatedSteps[index].args : step.args,
          requiredScopes: canonicalScopesForStep(step) ?? [],
        }));
      return makePlan(steps, { confirmationRequired: parsed.confirmationRequired });
    }

    // Handle LlmActionPlanResult (snake_case format)
    const result = parsed as LlmActionPlanResult;
    if (result.steps.length === 0 || result.steps[0].tool_name === 'none') return undefined;
    if (result.steps.some((step) => !isSupportedTool(step.tool_name))) return undefined;
    const validatedSteps = result.steps.map((step) => validateActionCapabilityArgs(step.tool_name, step.args));
    if (validatedSteps.some((step) => !step.ok)) return undefined;
    const steps = result.steps.map((s, index) => {
      const requiredScopes = [
        ...(scopesForTool(s.tool_name) ?? []),
        ...((s.required_scopes ?? []) as PermissionScope[]),
      ];
      return {
        id: createId('step'),
        toolName: s.tool_name,
        args: validatedSteps[index].ok ? validatedSteps[index].args : s.args,
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
