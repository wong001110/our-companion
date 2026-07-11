import { dominantEmotion } from '@our-companion/character-engine';
import { decideUnifiedCompanionAction, computeInitiativeBudget } from '@our-companion/decision-engine';
import type { DatabaseService } from '@our-companion/database';
import type {
  CharacterRuntimeState,
  CompanionCommand,
  CompanionDecision,
  CompanionLifeActivity,
  CompanionSessionPhase,
  Discovery,
  RelationshipSignal,
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import {
  animationIntentForLifeActivity,
  animationIntentForSessionPhase,
  resolveToAssetKey
} from './AnimationResolver';
import { attentionToUserContext, buildUserAttentionContext } from './attentionContext';
import { ConversationCoordinator } from './ConversationCoordinator';
import {
  DecisionCoordinator,
  shouldDeferDiscovery,
  shouldPresentNow,
  type ReevaluateContext
} from './DecisionCoordinator';
import { LifeCoordinator } from './LifeCoordinator';
import { MemoryPolicy } from './MemoryPolicy';
import { RelationshipPolicy } from './RelationshipPolicy';

const LOCAL_USER_ID = 'local';
const LIFE_TICK_BASE_MS = 90_000;

export function shouldEmitCompanionCommand(decision: CompanionDecision): boolean {
  return decision.action === 'share_discovery' && decision.timing === 'now';
}

export class CompanionRuntime {
  private lifeTimer: ReturnType<typeof setTimeout> | undefined;
  private lastDecision: CompanionDecision | null = null;
  private companionDragging = false;
  private explicitMode?: 'available' | 'focused' | 'do_not_disturb';
  private lastCompanionId: string | null = null;
  private pendingReevaluationScheduled = false;

  private readonly conversation: ConversationCoordinator;
  private readonly decisions: DecisionCoordinator;
  private readonly memory: MemoryPolicy;
  private readonly relationship: RelationshipPolicy;
  private readonly life: LifeCoordinator;

  constructor(
    private readonly db: DatabaseService,
    private readonly emitState: (state: CharacterRuntimeState) => void,
    private readonly emitDecision: (decision: CompanionDecision) => void,
    private readonly emitCommand?: (command: CompanionCommand) => boolean | void,
    lifeDeps?: ConstructorParameters<typeof LifeCoordinator>[0]
  ) {
    this.conversation = new ConversationCoordinator(db);
    this.decisions = new DecisionCoordinator(db);
    this.memory = new MemoryPolicy(db);
    this.relationship = new RelationshipPolicy(db);
    this.life = new LifeCoordinator(lifeDeps);
  }

  resolveCompanionId(characterId?: string): string {
    const id = this.db.resolveActiveCompanionId(characterId);
    if (this.lastCompanionId && this.lastCompanionId !== id) {
      this.conversation.onCompanionSwitch(this.lastCompanionId, id, LOCAL_USER_ID);
    }
    this.lastCompanionId = id;
    this.conversation.setActiveCompanion(id);
    return id;
  }

  getLastDecision(): CompanionDecision | null {
    return this.lastDecision;
  }

  startLifeScheduler(): void {
    const companionId = this.resolveCompanionId();
    this.life.initialize(companionId, 'idle', 'scheduler start');
    this.scheduleLifeTick(30_000);
  }

  stopLifeScheduler(): void {
    if (this.lifeTimer !== undefined) {
      clearTimeout(this.lifeTimer);
      this.lifeTimer = undefined;
    }
  }

  private scheduleLifeTick(delayMs: number): void {
    if (this.lifeTimer !== undefined) clearTimeout(this.lifeTimer);
    this.lifeTimer = setTimeout(() => {
      this.lifeTimer = undefined;
      this.tickLife();
      this.scheduleLifeTick(LIFE_TICK_BASE_MS);
    }, delayMs);
  }

  private tickLife(): void {
    const companionId = this.resolveCompanionId();
    const state = this.db.getCharacterState(companionId);
    if (state.coreState !== 'idle' || state.intent !== 'waiting') return;
    if (!this.life.canTransition(companionId)) return;

    const sessionActive = this.conversation.isConversationActive(companionId, LOCAL_USER_ID);
    if (sessionActive || this.companionDragging) return;

    const hour = new Date().getHours();
    const hasPending = this.decisions.listReadyForPresentation(companionId, LOCAL_USER_ID).length > 0;
    const next = this.life.selectNextActivity(companionId, {
      conversationActive: sessionActive,
      companionDragging: this.companionDragging,
      hasPendingAction: hasPending,
      localHour: hour
    });
    this.setLifeActivity(companionId, next);
    this.reevaluatePendingActions(companionId);
  }

  setLifeActivity(companionId: string, activity: CompanionLifeActivity): CharacterRuntimeState {
    this.life.transition(companionId, activity, 'life activity change');
    const intent = animationIntentForLifeActivity(activity);
    const animationIntent = resolveToAssetKey(intent);
    const state = this.db.getCharacterState(companionId);
    const next: CharacterRuntimeState = {
      ...state,
      lifeActivity: activity,
      animationIntent,
      updatedAt: nowIso()
    };
    this.db.saveCharacterState(next);
    this.emitState(next);
    return next;
  }

  setSessionPhase(phase: CompanionSessionPhase): void {
    const companionId = this.resolveCompanionId();

    if (phase === 'inactive' || phase === 'closing') {
      const sessionId = this.conversation.getActiveSessionId(companionId, LOCAL_USER_ID);
      if (sessionId) {
        this.conversation.closeSession(sessionId, phase === 'closing' ? 'completed' : 'user_closed', LOCAL_USER_ID, companionId);
        this.relationship.applySignal(LOCAL_USER_ID, companionId, 'conversation_completed');
      }
      this.life.restoreAfterOverride(companionId);
      this.reevaluatePendingActions(companionId);
    } else if (phase === 'listening' || phase === 'opening' || phase === 'thinking' || phase === 'talking' || phase === 'responding') {
      this.life.interrupt(companionId, 'interacting', 'conversation active');
    }
    else {
      this.conversation.handleSessionPhase(companionId, phase, LOCAL_USER_ID);
    }

    const state = this.db.getCharacterState(companionId);
    const sessionIntent = animationIntentForSessionPhase(phase);
    const animationIntent = sessionIntent
      ? resolveToAssetKey(sessionIntent)
      : state.animationIntent ?? resolveToAssetKey({ category: 'idle' });

    const next = this.db.saveCharacterState({
      ...state,
      animationIntent,
      lifeActivity: phase === 'idle' || phase === 'inactive' ? 'idle' : 'interacting',
      updatedAt: nowIso()
    });
    this.emitState(next);
  }

  setDragging(dragging: boolean): void {
    const wasDragging = this.companionDragging;
    this.companionDragging = dragging;
    const companionId = this.resolveCompanionId();
    if (wasDragging && !dragging) {
      this.life.restoreAfterOverride(companionId);
      this.reevaluatePendingActions(companionId);
    } else if (dragging) {
      this.life.interrupt(companionId, 'interacting', 'user dragging');
    }
  }

  setExplicitMode(mode?: 'available' | 'focused' | 'do_not_disturb'): void {
    this.explicitMode = mode;
  }

  advanceWithIntent(
    companionId: string,
    coreState: CharacterRuntimeState['coreState'],
    intent: CharacterRuntimeState['intent'],
    animationIntent?: string
  ): CharacterRuntimeState {
    const current = this.db.getCharacterState(companionId);
    const emotionName = dominantEmotion(current.emotion);
    const resolvedAnimation =
      animationIntent ??
      resolveToAssetKey(
        coreState === 'talking'
          ? { category: 'talk', emotion: emotionName === 'happy' ? 'happy' : 'neutral' }
          : coreState === 'listening'
            ? { category: 'listen' }
            : { category: 'idle' }
      );
    const next: CharacterRuntimeState = {
      ...current,
      coreState,
      intent,
      animationIntent: resolvedAnimation,
      updatedAt: nowIso()
    };
    this.db.saveCharacterState(next);
    this.emitState(next);
    return next;
  }

  decideForDiscovery(
    discovery: Discovery,
    sessionActive: boolean,
    companionDragging: boolean
  ): CompanionDecision {
    const companionId = this.resolveCompanionId();
    const relationship = this.db.getRelationship(LOCAL_USER_ID, companionId);
    const sharedToday = this.db.countSharedToday();
    const recentActions = this.buildRecentActions();

    const attention = buildUserAttentionContext({
      conversationActive: sessionActive,
      companionDragging,
      explicitMode: this.explicitMode
    });
    const userContext = attentionToUserContext(attention, recentActions);

    const initiativeBudget = computeInitiativeBudget(
      relationship,
      sharedToday,
      userContext.mode === 'focused'
    );

    const decision = decideUnifiedCompanionAction({
      brainInput: {
        userContext,
        insightContext: {
          recentInsights: [discovery.id],
          insightCount: 1,
          topInsightImportance: discovery.finalScore / 100
        },
        timestamp: nowIso()
      },
      userContext,
      relationship,
      initiativeBudget,
      discovery,
      sessionActive,
      companionDragging
    });

    this.lastDecision = decision;
    this.emitDecision(decision);

    if (shouldDeferDiscovery(decision)) {
      this.decisions.enqueueDeferred(decision, companionId, discovery.id, LOCAL_USER_ID);
    } else if (shouldEmitCompanionCommand(decision)) {
      if (!this.emitCompanionCommand(companionId, decision)) {
        this.decisions.ensureDeferred(decision, companionId, discovery.id, 'active_command_exists', LOCAL_USER_ID);
      }
    }

    return decision;
  }

  shouldPresentNow(decision: CompanionDecision): boolean {
    return shouldPresentNow(decision);
  }

  /** @deprecated Use shouldPresentNow — next_idle is deferred, not immediately presentable */
  applyRelationshipSignal(signal: RelationshipSignal): void {
    const companionId = this.resolveCompanionId();
    this.relationship.applySignal(LOCAL_USER_ID, companionId, signal);
  }

  /** @deprecated Use applyRelationshipSignal */
  recordInteraction(signal: 'positive' | 'ignored' | 'correction' | 'not_now' | 'not_interested'): void {
    const map: Record<string, RelationshipSignal> = {
      positive: 'positive_feedback',
      ignored: 'ignored',
      correction: 'user_correction',
      not_now: 'not_now',
      not_interested: 'not_interested'
    };
    this.applyRelationshipSignal(map[signal] ?? 'not_now');
  }

  processMemoryFromTurn(companionId: string, userMessage: string, assistantReply: string, sessionId?: string): void {
    this.memory.processTurn({
      userId: LOCAL_USER_ID,
      companionId,
      userMessage,
      assistantReply,
      sessionId
    });
  }

  /** @deprecated Use processMemoryFromTurn */
  extractMemoryFromTurn(companionId: string, userMessage: string, assistantReply: string, sessionId?: string): void {
    this.processMemoryFromTurn(companionId, userMessage, assistantReply, sessionId);
  }

  getActiveSessionId(companionId?: string): string | null {
    const id = this.resolveCompanionId(companionId);
    return this.conversation.getActiveSessionId(id, LOCAL_USER_ID);
  }

  reevaluatePendingActions(companionId?: string): CompanionDecision | null {
    const id = this.resolveCompanionId(companionId);
    const pending = this.db.listPendingActions(id, LOCAL_USER_ID)[0];
    const discovery = pending?.discoveryId ? this.db.getDiscovery(pending.discoveryId) : undefined;
    const ctx: ReevaluateContext = {
      companionId: id,
      userId: LOCAL_USER_ID,
      discovery,
      sessionActive: this.conversation.isConversationActive(id, LOCAL_USER_ID),
      companionDragging: this.companionDragging,
      relationship: this.db.getRelationship(LOCAL_USER_ID, id),
      sharedToday: this.db.countSharedToday(),
      recentActions: this.buildRecentActions(),
      explicitMode: this.explicitMode
    };
    const result = this.decisions.reevaluatePending(ctx);
    const decision = result.decision;
    if (decision) {
      this.lastDecision = decision;
      this.emitDecision(decision);
      if (shouldEmitCompanionCommand(decision) && this.emitCompanionCommand(id, decision)) {
        if (result.pendingAction) this.decisions.completePendingAction(result.pendingAction.id);
      }
    }
    return decision;
  }

  /** Defers a normal pending-action evaluation to avoid nesting command lifecycle transitions. */
  schedulePendingReevaluation(): void {
    if (this.pendingReevaluationScheduled) return;
    this.pendingReevaluationScheduled = true;
    queueMicrotask(() => {
      this.pendingReevaluationScheduled = false;
      this.reevaluatePendingActions();
    });
  }

  feedbackDomainForValue(value: string) {
    return this.relationship.feedbackDomainForValue(value);
  }

  relationshipSignalForFeedback(value: string) {
    return this.relationship.relationshipSignalForFeedback(value);
  }

  shutdown(): void {
    const companionId = this.resolveCompanionId();
    const sessionId = this.conversation.getActiveSessionId(companionId, LOCAL_USER_ID);
    if (sessionId) {
      this.conversation.closeSession(sessionId, 'app_shutdown', LOCAL_USER_ID, companionId);
    }
    this.stopLifeScheduler();
  }

  private buildRecentActions(): string[] {
    return this.db.listInteractionFeedbackActions(20);
  }

  private emitCompanionCommand(companionId: string, decision: CompanionDecision): boolean {
    if (!this.emitCommand || !shouldEmitCompanionCommand(decision)) return false;
    const command: CompanionCommand = {
      id: createId('cmd'),
      companionId,
      decision,
      issuedAt: nowIso()
    };
    return this.emitCommand(command) !== false;
  }
}
