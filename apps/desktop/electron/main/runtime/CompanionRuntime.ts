import {
  advanceCharacter,
  applyEmotionEvent,
  dominantEmotion,
  type EmotionEvent
} from '@our-companion/character-engine';
import { decideUnifiedCompanionAction, computeInitiativeBudget } from '@our-companion/decision-engine';
import type { DatabaseService } from '@our-companion/database';
import type {
  CharacterRuntimeState,
  CompanionCommand,
  CompanionDecision,
  CompanionLifeActivity,
  CompanionSessionPhase,
  Discovery,
  NormalizedDiscovery,
  RelationshipSignal,
} from '@our-companion/shared';
import { createId } from '@our-companion/shared';
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
import { LifeCoordinator, type LifeCoordinatorDeps } from './LifeCoordinator';
import { MemoryPolicy } from './MemoryPolicy';
import { RelationshipPolicy } from './RelationshipPolicy';

const LOCAL_USER_ID = 'local';
const LIFE_TICK_BASE_MS = 90_000;

export interface CompanionRuntimeDependencies extends LifeCoordinatorDeps {
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function shouldEmitCompanionCommand(decision: CompanionDecision): boolean {
  return decision.action === 'share_discovery' && decision.timing === 'now';
}

export class CompanionRuntime {
  private lifeTimer: unknown;
  private lastDecision: CompanionDecision | null = null;
  private companionDragging = false;
  private explicitMode?: 'available' | 'focused' | 'do_not_disturb';
  private lastCompanionId: string | null = null;
  private pendingReevaluationScheduled = false;
  private visualPresenceMode: 'home' | 'away_visiting' = 'home';

  private readonly conversation: ConversationCoordinator;
  private readonly decisions: DecisionCoordinator;
  private readonly memory: MemoryPolicy;
  private readonly relationship: RelationshipPolicy;
  private readonly life: LifeCoordinator;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(
    private readonly db: DatabaseService,
    private readonly emitState: (state: CharacterRuntimeState) => void,
    private readonly emitDecision: (decision: CompanionDecision) => void,
    private readonly emitCommand?: (command: CompanionCommand) => boolean | void,
    dependencies: CompanionRuntimeDependencies = {}
  ) {
    this.now = dependencies.now ?? (() => Date.now());
    this.setTimer = dependencies.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = dependencies.clearTimer ?? ((handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.conversation = new ConversationCoordinator(db);
    this.decisions = new DecisionCoordinator(db, { now: this.now });
    this.memory = new MemoryPolicy(db, { now: this.now });
    this.relationship = new RelationshipPolicy(db, { now: this.now });
    this.life = new LifeCoordinator(dependencies);
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
      this.clearTimer(this.lifeTimer);
      this.lifeTimer = undefined;
    }
  }

  /** Local-only presentation state; never persisted or synchronized remotely. */
  setVisualPresenceMode(mode: 'home' | 'away_visiting'): void {
    if (this.visualPresenceMode === mode) return;
    this.visualPresenceMode = mode;
    if (mode === 'away_visiting') {
      this.stopLifeScheduler();
      return;
    }
    this.startLifeScheduler();
  }

  private scheduleLifeTick(delayMs: number): void {
    if (this.lifeTimer !== undefined) this.clearTimer(this.lifeTimer);
    this.lifeTimer = this.setTimer(() => {
      this.lifeTimer = undefined;
      this.tickLife();
      this.scheduleLifeTick(LIFE_TICK_BASE_MS);
    }, delayMs);
  }

  private tickLife(): void {
    if (this.visualPresenceMode === 'away_visiting') return;
    const companionId = this.resolveCompanionId();
    const state = this.db.getCharacterState(companionId);
    if (state.coreState !== 'idle' || state.intent !== 'waiting') return;
    if (!this.life.canTransition(companionId)) return;

    const sessionActive = this.conversation.isConversationActive(companionId, LOCAL_USER_ID);
    if (sessionActive || this.companionDragging) return;

    const hour = new Date(this.now()).getHours();
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
      updatedAt: this.timestamp()
    };
    this.db.saveCharacterState(next);
    this.emitState(next);
    return next;
  }

  updatePosition(companionId: string | undefined, position: { x: number; y: number }): CharacterRuntimeState {
    const current = this.db.getCharacterState(companionId);
    const next = this.db.saveCharacterState({
      ...current,
      position,
      updatedAt: this.timestamp()
    });
    this.emitState(next);
    return next;
  }

  triggerBehavior(companionId: string | undefined, event: string): CharacterRuntimeState {
    const current = this.db.getCharacterState(companionId);
    const next = advanceCharacter(current, {
      userCommand: event === 'user_command' ? event : undefined,
      availableDiscoveries: event === 'discovery' ? ([{}] as NormalizedDiscovery[]) : undefined,
      recentMemoryActivity: event === 'memory',
      reflectionDue: event === 'reflection',
      userActive: true
    });
    const saved = this.db.saveCharacterState({
      ...next,
      updatedAt: this.timestamp()
    });
    this.emitState(saved);
    return saved;
  }

  applyEmotion(companionId: string | undefined, event: EmotionEvent): CharacterRuntimeState {
    const current = this.db.getCharacterState(companionId);
    const next = this.db.saveCharacterState({
      ...current,
      emotion: applyEmotionEvent(current.emotion, event),
      updatedAt: this.timestamp()
    });
    this.emitState(next);
    return next;
  }

  beginDiscoveryPresentation(companionId: string): CharacterRuntimeState {
    this.applyEmotion(companionId, 'new_high_score_discovery');
    return this.advanceWithIntent(companionId, 'talking', 'sharing_discovery', 'Expedition_Present');
  }

  settleDiscoveryPresentation(companionId: string): CharacterRuntimeState {
    return this.advanceWithIntent(companionId, 'idle', 'waiting', 'Idle_Neutral');
  }

  setSessionPhase(phase: CompanionSessionPhase): void {
    const companionId = this.resolveCompanionId();

    let restoredLifeActivity: CompanionLifeActivity | undefined;
    if (phase === 'inactive' || phase === 'idle' || phase === 'closing') {
      const sessionId = this.conversation.getActiveSessionId(companionId, LOCAL_USER_ID);
      if (sessionId) {
        this.conversation.closeSession(sessionId, phase === 'closing' ? 'completed' : 'user_closed', LOCAL_USER_ID, companionId);
        this.relationship.applySignal(LOCAL_USER_ID, companionId, 'conversation_completed');
      }
      restoredLifeActivity = this.life.restoreAfterOverride(companionId);
      this.reevaluatePendingActions(companionId);
    } else if (phase === 'listening' || phase === 'opening' || phase === 'thinking' || phase === 'talking' || phase === 'responding') {
      this.life.interrupt(companionId, 'interacting', 'conversation active');
    }
    else {
      this.conversation.handleSessionPhase(companionId, phase, LOCAL_USER_ID);
    }

    const state = this.db.getCharacterState(companionId);
    const sessionIntent = animationIntentForSessionPhase(phase);
    const sessionState = phase === 'listening' || phase === 'opening'
      ? { coreState: 'listening' as const, intent: 'asking_permission' as const }
      : phase === 'thinking'
        ? { coreState: 'thinking' as const, intent: 'helping_task' as const }
        : phase === 'talking' || phase === 'responding'
          ? { coreState: 'talking' as const, intent: 'helping_task' as const }
          : { coreState: 'idle' as const, intent: 'waiting' as const };
    // Talking is semantic state. The renderer owns its emotional Talk variant.
    const animationIntent = phase === 'talking' || phase === 'responding'
      ? undefined
      : phase === 'waiting_for_user'
        ? 'Waiting_Response'
        : sessionIntent
          ? resolveToAssetKey(sessionIntent)
          : undefined;

    const next = this.db.saveCharacterState({
      ...state,
      ...sessionState,
      animationIntent,
      lifeActivity: restoredLifeActivity ?? (phase === 'idle' || phase === 'inactive' || phase === 'closing' ? 'idle' : 'interacting'),
      updatedAt: this.timestamp()
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
      updatedAt: this.timestamp()
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
    const announcedToday = this.db.countAnnouncedToday(companionId);
    const recentActions = this.buildRecentActions();

    const attention = buildUserAttentionContext({
      conversationActive: sessionActive,
      companionDragging,
      explicitMode: this.explicitMode,
      localTime: this.timestamp()
    });
    const userContext = attentionToUserContext(attention, recentActions, this.timestamp());

    const initiativeBudget = computeInitiativeBudget(
      relationship,
      announcedToday,
      userContext.mode === 'focused'
    );

    const decision = decideUnifiedCompanionAction({
      brainInput: {
        userContext,
        insightContext: {
          recentInsights: [discovery.id],
          insightCount: 1,
          topInsightImportance: discovery.finalScore
        },
        timestamp: this.timestamp()
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
      if (!this.emitCompanionCommand(companionId, decision, discovery.id)) {
        this.decisions.ensureDeferred(decision, companionId, discovery.id, 'active_command_exists', LOCAL_USER_ID);
      }
    }

    return decision;
  }

  shouldPresentNow(decision: CompanionDecision): boolean {
    return shouldPresentNow(decision);
  }

  applyRelationshipSignal(signal: RelationshipSignal): void {
    const companionId = this.resolveCompanionId();
    this.relationship.applySignal(LOCAL_USER_ID, companionId, signal);
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
      announcedToday: this.db.countAnnouncedToday(id),
      recentActions: this.buildRecentActions(),
      explicitMode: this.explicitMode
    };
    const result = this.decisions.reevaluatePending(ctx);
    const decision = result.decision;
    if (decision) {
      this.lastDecision = decision;
      this.emitDecision(decision);
      if (shouldEmitCompanionCommand(decision) && this.emitCompanionCommand(id, decision, result.pendingAction?.discoveryId)) {
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

  private emitCompanionCommand(companionId: string, decision: CompanionDecision, discoveryId?: string): boolean {
    if (!this.emitCommand || !shouldEmitCompanionCommand(decision)) return false;
    const command: CompanionCommand = {
      id: createId('cmd'),
      companionId,
      discoveryId,
      decision,
      issuedAt: this.timestamp()
    };
    return this.emitCommand(command) !== false;
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }
}
