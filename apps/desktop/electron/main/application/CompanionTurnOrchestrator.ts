import type { DatabaseService } from '@our-companion/database';
import { planActionFromRules, resolvePermissions } from '@our-companion/action-engine';
import type {
  ActionPermissionState,
  ActionPlan,
  ActionResult,
  CompanionMessageSource,
  CompanionReplyLanguage,
  CompanionTurnActionRequest,
  CompanionTurnActionStatus,
  CompanionTurnInput,
  CompanionTurnProposal,
  CompanionTurnResult,
  PermissionScope,
  ResolveCompanionTurnPermissionInput,
  TurnInspectionRecord,
} from '@our-companion/shared';
import {
  actionCapabilityPromptSummary,
  createId,
  getActionCapability,
  validateActionCapabilityArgs,
} from '@our-companion/shared';
import { validateCompanionTurnProposal } from '@our-companion/ai-engine';
import type { MemoryContextProvider } from './MemoryContextProvider';
import type { MemoryPolicy, MemoryCaptureOutcome } from '../runtime/MemoryPolicy';

const TURN_INSPECTION_LIMIT = 50;

interface PendingTurn {
  turnId: string;
  companionId: string;
  source: CompanionMessageSource;
  plan: ActionPlan;
  requiredScopes: PermissionScope[];
  remembered: CompanionTurnResult['remembered'];
}

export interface CompanionTurnOrchestratorDependencies {
  db: DatabaseService;
  memoryContext: MemoryContextProvider;
  memoryPolicy: MemoryPolicy;
  now: () => Date;
  getReplyLanguage: () => CompanionReplyLanguage;
  getSessionId?: () => string | undefined;
  sendToAi: (input: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    source: string;
  }) => Promise<{ content: string }>;
  getPermissions: () => ActionPermissionState;
  setPermissions: (state: ActionPermissionState) => ActionPermissionState;
  executePlan: (plan: ActionPlan, permissions: ActionPermissionState) => Promise<ActionResult>;
  onAssistantMessage?: (input: {
    companionId: string;
    source: CompanionMessageSource;
    message: string;
    status?: 'ok' | 'error';
  }) => void;
}

function sourceFor(input: CompanionTurnInput['source']): CompanionMessageSource {
  return input === 'panel_text' ? 'panel' : input;
}

function highestRisk(actions: CompanionTurnActionRequest[]): ActionPlan['riskLevel'] {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return actions.reduce<ActionPlan['riskLevel']>((current, action) => {
    const risk = getActionCapability(action.toolName)?.riskLevel ?? 'high';
    return rank[risk] > rank[current] ? risk : current;
  }, 'low');
}

function actionPlanFromRequests(
  actions: CompanionTurnActionRequest[],
): { plan?: ActionPlan; validated: CompanionTurnActionRequest[]; rejected: TurnInspectionRecord['rejectedActions'] } {
  const validated: CompanionTurnActionRequest[] = [];
  const rejected: TurnInspectionRecord['rejectedActions'] = [];
  const steps: ActionPlan['steps'] = [];
  for (const action of actions) {
    const capability = getActionCapability(action.toolName);
    const args = validateActionCapabilityArgs(action.toolName, action.args);
    if (!capability?.enabled || !args.ok) {
      rejected.push({ ...action, reason: capability ? (args.ok ? 'ACTION_CAPABILITY_NOT_AVAILABLE' : args.reason) : 'UNSUPPORTED_TOOL' });
      continue;
    }
    const normalized = { ...action, toolName: capability.toolName, args: args.args };
    validated.push(normalized);
    steps.push({
      id: createId('step'),
      toolName: capability.toolName,
      args: args.args,
      requiredScopes: [...capability.requiredScopes],
    });
  }
  if (steps.length === 0 || rejected.length > 0) return { validated, rejected };
  return {
    validated,
    rejected,
    plan: {
      id: createId('plan'),
      intentId: createId('intent'),
      steps,
      requiredPermissions: [...new Set(steps.flatMap((step) => step.requiredScopes))],
      riskLevel: highestRisk(validated),
      confirmationRequired: validated.some((action) => getActionCapability(action.toolName)?.requiresConfirmationByDefault),
      status: 'draft',
    },
  };
}

function proposalForRule(plan: ActionPlan): CompanionTurnProposal {
  return {
    reply: '',
    intent: 'action',
    actions: plan.steps.map((step) => ({
      toolName: step.toolName,
      args: step.args,
      reason: 'Matched a deterministic user command.',
    })),
    memoryCandidates: [],
  };
}

export function buildStructuredTurnPrompt(input: {
  name: string;
  personality: string;
  replyLanguage: CompanionReplyLanguage;
  memoryContext: Awaited<ReturnType<MemoryContextProvider['buildContext']>>;
}): string {
  const section = (title: string, items: typeof input.memoryContext.pinned) =>
    `${title}:\n${items.length ? items.map((item) => `- [${item.memoryId}] ${item.summary} (confidence ${item.confidence.toFixed(2)})`).join('\n') : '- none'}`;
  return [
    `You are ${input.name}, the active Companion. Personality: ${input.personality}.`,
    input.replyLanguage === 'zh-CN' ? 'Reply in Simplified Chinese.' : 'Reply in English.',
    'Memory may be incomplete, outdated, or incorrect. The current user message is authoritative when it conflicts with Memory. Do not claim certainty when Memory confidence is low.',
    section('Pinned Memory', input.memoryContext.pinned),
    section('Known user boundaries', input.memoryContext.boundaries),
    section('Known user preferences', input.memoryContext.preferences),
    section('Current goals', input.memoryContext.goals),
    section('Relevant prior context', [...input.memoryContext.relevant, ...input.memoryContext.recent]),
    `Currently enabled Action capabilities:\n${actionCapabilityPromptSummary()}`,
    'Return ONLY one JSON object with exactly: {"reply":string,"intent":"conversation"|"action"|"conversation_and_action"|"cannot_complete","actions":[{"toolName":string,"args":object,"reason":string}],"memoryCandidates":[{"type":"user_preference"|"user_fact"|"user_boundary"|"goal","summary":string,"evidence":string,"confidence":number}]}.',
    'Only propose enabled tools. Evidence for a Memory candidate must be a verbatim substring of the current user message. Ordinary conversation must not become Memory.',
  ].join('\n\n');
}

export class CompanionTurnOrchestrator {
  private readonly inspections: TurnInspectionRecord[] = [];
  private readonly pending = new Map<string, PendingTurn>();

  constructor(private readonly deps: CompanionTurnOrchestratorDependencies) {}

  getInspections(companionId?: string): TurnInspectionRecord[] {
    return this.inspections
      .filter((record) => !companionId || record.companionId === companionId)
      .map((record) => structuredClone(record));
  }

  async handle(input: CompanionTurnInput): Promise<CompanionTurnResult> {
    const companionId = this.deps.db.resolveActiveCompanionId(input.characterId);
    const companion = this.deps.db.getCompanion(companionId);
    if (!companion) throw new Error(`Companion not found: ${companionId}`);
    const source = sourceFor(input.source);
    const turnId = createId('turn');
    const sessionId = this.deps.getSessionId?.();
    const priorHistory = this.deps.db.listCompanionContext(companionId, 12);
    this.deps.db.insertCompanionMessage({
      role: 'user',
      content: input.message,
      source,
      characterId: companionId,
      sessionId,
    });
    const memoryContext = await this.deps.memoryContext.buildContext({
      companionId,
      message: input.message,
    });
    const inspection: TurnInspectionRecord = {
      turnId,
      companionId,
      inputSource: input.source,
      inputSummary: input.message.slice(0, 300),
      memoryItemsSelected: [
        ...memoryContext.pinned.map((item) => ({ memoryId: item.memoryId, category: 'pinned', selectedBecause: item.selectedBecause })),
        ...memoryContext.boundaries.map((item) => ({ memoryId: item.memoryId, category: 'boundary', selectedBecause: item.selectedBecause })),
        ...memoryContext.preferences.map((item) => ({ memoryId: item.memoryId, category: 'preference', selectedBecause: item.selectedBecause })),
        ...memoryContext.goals.map((item) => ({ memoryId: item.memoryId, category: 'goal', selectedBecause: item.selectedBecause })),
        ...memoryContext.relevant.map((item) => ({ memoryId: item.memoryId, category: 'relevant', selectedBecause: item.selectedBecause })),
        ...memoryContext.recent.map((item) => ({ memoryId: item.memoryId, category: 'recent', selectedBecause: item.selectedBecause })),
      ],
      memoryBudget: {
        itemCount: memoryContext.selectedCount,
        characterCount: memoryContext.characterCount,
        maxItems: memoryContext.maxItems,
        maxCharacters: memoryContext.maxCharacters,
      },
      validatedActions: [],
      rejectedActions: [],
      memoryCandidates: [],
      memoryOutcomes: [],
      createdAt: this.deps.now().toISOString(),
    };
    this.recordInspection(inspection);

    let proposal: CompanionTurnProposal;
    let plan = planActionFromRules(input.message);
    if (plan) {
      inspection.deterministicActionMatch = plan.steps.map((step) => step.toolName).join(', ');
      proposal = proposalForRule(plan);
    } else {
      const messages = [
        {
          role: 'system' as const,
          content: buildStructuredTurnPrompt({
            name: companion.name,
            personality: companion.personalityDescription,
            replyLanguage: this.deps.getReplyLanguage(),
            memoryContext,
          }),
        },
        ...priorHistory
          .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content })),
        { role: 'user' as const, content: input.message },
      ];
      try {
        const ai = await this.deps.sendToAi({ messages, source });
        const structured = validateCompanionTurnProposal(ai.content);
        proposal = structured ?? {
          reply: ai.content.trim().slice(0, 4_000) || this.fallbackReply(),
          intent: 'conversation',
          actions: [],
          memoryCandidates: [],
        };
        inspection.aiStructuredResult = structured;
        if (!structured) inspection.finalReplySource = 'safe_fallback';
      } catch {
        proposal = { reply: this.fallbackReply(), intent: 'cannot_complete', actions: [], memoryCandidates: [] };
        inspection.finalReplySource = 'safe_fallback';
      }
      const actionValidation = actionPlanFromRequests(proposal.actions);
      inspection.validatedActions = actionValidation.validated;
      inspection.rejectedActions = actionValidation.rejected;
      plan = actionValidation.plan;
    }
    if (inspection.deterministicActionMatch) {
      inspection.validatedActions = proposal.actions;
    }
    inspection.memoryCandidates = proposal.memoryCandidates;
    const captured = this.deps.memoryPolicy.captureTurn({
      userId: 'local',
      companionId,
      userMessage: input.message,
      assistantReply: proposal.reply,
      sessionId,
      candidates: proposal.memoryCandidates,
    });
    this.applyMemoryOutcomes(inspection, captured);
    const remembered = captured.flatMap((outcome) => outcome.mutation ? [outcome.mutation] : []);

    if (proposal.actions.length > 0 && !plan) {
      const status: CompanionTurnActionStatus = inspection.rejectedActions.some((action) => action.reason === 'UNSUPPORTED_TOOL')
        ? 'unsupported_tool'
        : 'invalid_arguments';
      return this.finish({
        turnId,
        companionId,
        source,
        inspection,
        message: this.actionFailureReply(status),
        kind: 'action_failed',
        actionStatus: status,
        remembered,
      });
    }
    if (!plan) {
      inspection.finalReplySource ??= 'ai_conversation';
      return this.finish({
        turnId,
        companionId,
        source,
        inspection,
        message: proposal.reply || this.fallbackReply(),
        kind: 'conversation',
        remembered,
      });
    }

    const permission = resolvePermissions(plan, this.deps.getPermissions());
    if (permission === 'denied') {
      inspection.permissionState = 'denied';
      return this.finish({
        turnId,
        companionId,
        source,
        inspection,
        message: this.actionFailureReply('permission_denied'),
        kind: 'action_failed',
        actionPlan: plan,
        actionStatus: 'permission_denied',
        remembered,
      });
    }
    if (Array.isArray(permission)) {
      inspection.permissionState = 'awaiting_permission';
      this.pending.set(turnId, { turnId, companionId, source, plan, requiredScopes: permission, remembered });
      return {
        turnId,
        message: this.awaitingPermissionReply(plan),
        kind: 'awaiting_permission',
        actionPlan: plan,
        requiredScopes: permission,
        remembered,
      };
    }
    inspection.permissionState = 'granted';
    return this.executeAndFinish({
      turnId,
      companionId,
      source,
      plan,
      requiredScopes: [],
      inspection,
      remembered,
      permissions: this.deps.getPermissions(),
    });
  }

  async resolvePermission(input: ResolveCompanionTurnPermissionInput): Promise<CompanionTurnResult> {
    const pending = this.pending.get(input.turnId);
    if (!pending) throw new Error('PENDING_COMPANION_TURN_NOT_FOUND');
    const activeCompanionId = this.deps.db.resolveActiveCompanionId();
    if (activeCompanionId !== pending.companionId) throw new Error('PENDING_COMPANION_TURN_COMPANION_MISMATCH');
    const inspection = this.inspections.find((record) => record.turnId === input.turnId);
    if (!inspection) throw new Error('TURN_INSPECTION_NOT_FOUND');
    this.pending.delete(input.turnId);
    if (input.decision === 'cancel') {
      inspection.permissionState = 'cancelled';
      inspection.executionResult = 'cancelled';
      inspection.finalReplySource = 'permission_cancelled';
      return this.finish({
        turnId: pending.turnId,
        companionId: pending.companionId,
        source: pending.source,
        inspection,
        message: this.actionFailureReply('cancelled'),
        kind: 'action_failed',
        actionPlan: pending.plan,
        actionStatus: 'cancelled',
        remembered: pending.remembered,
      });
    }
    const permissions = { ...this.deps.getPermissions() };
    for (const scope of pending.requiredScopes) permissions[scope] = 'granted';
    if (input.decision === 'always_allow') this.deps.setPermissions(permissions);
    inspection.permissionState = 'granted';
    return this.executeAndFinish({ ...pending, inspection, permissions });
  }

  private async executeAndFinish(input: PendingTurn & {
    inspection: TurnInspectionRecord;
    permissions: ActionPermissionState;
  }): Promise<CompanionTurnResult> {
    const actionResult = await this.deps.executePlan(input.plan, input.permissions);
    const success = actionResult.status === 'success' || actionResult.status === 'partial';
    const actionStatus: CompanionTurnActionStatus = success ? 'executed' : 'adapter_failed';
    input.inspection.executionResult = actionStatus;
    input.inspection.finalReplySource = 'deterministic_action_result';
    return this.finish({
      turnId: input.turnId,
      companionId: input.companionId,
      source: input.source,
      inspection: input.inspection,
      message: success ? this.actionSuccessReply(input.plan) : this.actionFailureReply(actionStatus),
      kind: success ? 'action_completed' : 'action_failed',
      actionPlan: input.plan,
      actionResult,
      actionStatus,
      remembered: input.remembered,
    });
  }

  private finish(input: {
    turnId: string;
    companionId: string;
    source: CompanionMessageSource;
    inspection: TurnInspectionRecord;
    message: string;
    kind: CompanionTurnResult['kind'];
    actionPlan?: ActionPlan;
    actionResult?: ActionResult;
    actionStatus?: CompanionTurnActionStatus;
    remembered?: CompanionTurnResult['remembered'];
  }): CompanionTurnResult {
    this.deps.db.insertCompanionMessage({
      role: 'assistant',
      content: input.message,
      source: input.source,
      characterId: input.companionId,
      metadata: { turnId: input.turnId, kind: input.kind, actionStatus: input.actionStatus },
    });
    input.inspection.finalReply = input.message;
    input.inspection.completedAt = this.deps.now().toISOString();
    input.inspection.executionResult ??= input.actionStatus;
    input.inspection.finalReplySource ??= input.kind === 'conversation' ? 'ai_conversation' : 'deterministic_action_result';
    this.deps.onAssistantMessage?.({
      companionId: input.companionId,
      source: input.source,
      message: input.message,
      status: input.kind === 'action_failed' ? 'error' : 'ok',
    });
    return {
      turnId: input.turnId,
      message: input.message,
      kind: input.kind,
      actionPlan: input.actionPlan,
      actionResult: input.actionResult,
      actionStatus: input.actionStatus,
      remembered: input.remembered,
    };
  }

  private applyMemoryOutcomes(inspection: TurnInspectionRecord, outcomes: MemoryCaptureOutcome[]): void {
    inspection.memoryOutcomes = outcomes.map((outcome) => ({
      memoryId: outcome.memoryId,
      summary: outcome.candidate.summary,
      outcome: outcome.outcome,
      reason: outcome.reason,
    }));
  }

  private recordInspection(record: TurnInspectionRecord): void {
    this.inspections.unshift(record);
    if (this.inspections.length > TURN_INSPECTION_LIMIT) this.inspections.length = TURN_INSPECTION_LIMIT;
  }

  private fallbackReply(): string {
    return this.deps.getReplyLanguage() === 'zh-CN'
      ? '我暂时无法完成这个请求，但我没有执行任何未经验证的操作。'
      : 'I could not complete that request, and I did not execute any unvalidated action.';
  }

  private awaitingPermissionReply(plan: ActionPlan): string {
    const tool = plan.steps[0]?.toolName ?? 'action';
    return this.deps.getReplyLanguage() === 'zh-CN'
      ? `我需要你的许可才能执行 ${tool}。`
      : `I need your permission before I can run ${tool}.`;
  }

  private actionSuccessReply(plan: ActionPlan): string {
    const step = plan.steps[0];
    const zh = this.deps.getReplyLanguage() === 'zh-CN';
    if (step?.toolName === 'open_url') return zh ? `已经为你打开 ${String(step.args.url)}。` : `I opened ${String(step.args.url)}.`;
    if (step?.toolName === 'open_app') return zh ? `已经为你打开 ${String(step.args.appName)}。` : `I opened ${String(step.args.appName)}.`;
    if (step?.toolName === 'search_web') return zh ? `已经为你搜索 ${String(step.args.query)}。` : `I searched the web for ${String(step.args.query)}.`;
    return zh ? '操作已完成。' : 'The action completed.';
  }

  private actionFailureReply(status: CompanionTurnActionStatus): string {
    const zh = this.deps.getReplyLanguage() === 'zh-CN';
    const messages: Record<CompanionTurnActionStatus, [string, string]> = {
      executed: ['操作已完成。', 'The action completed.'],
      blocked: ['这个操作被安全策略阻止了。', 'That action was blocked by the safety policy.'],
      permission_denied: ['我没有执行这个操作，因为所需权限未开启。', 'I did not run that action because the required permission is disabled.'],
      cancelled: ['好的，我已取消这个操作。', 'Okay, I cancelled that action.'],
      adapter_failed: ['我尝试了，但实际操作没有成功。', 'I tried, but the action did not complete successfully.'],
      invalid_arguments: ['我没有执行，因为操作参数无效。', 'I did not run that action because its arguments were invalid.'],
      unsupported_tool: ['这个版本还不支持该操作。', 'That action is not supported in this version.'],
    };
    return messages[status][zh ? 0 : 1];
  }
}
