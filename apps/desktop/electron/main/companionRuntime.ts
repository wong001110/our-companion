import { animationFor, dominantEmotion } from '@our-companion/character-engine';
import { decideUnifiedCompanionAction, computeInitiativeBudget } from '@our-companion/decision-engine';
import type { DatabaseService } from '@our-companion/database';
import type {
  CharacterRuntimeState,
  CompanionDecision,
  CompanionLifeActivity,
  CompanionSessionPhase,
  ConversationPhase,
  Discovery,
  TypedMemoryType,
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { createMemoryNode } from '@our-companion/memory-engine';

const LOCAL_USER_ID = 'local';

export class CompanionRuntime {
  private lifeTimer: ReturnType<typeof setTimeout> | undefined;
  private currentActivity: CompanionLifeActivity = 'idle';
  private lastDecision: CompanionDecision | null = null;
  private activeSessionId: string | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly emitState: (state: CharacterRuntimeState) => void,
    private readonly emitDecision: (decision: CompanionDecision) => void
  ) {}

  resolveCompanionId(characterId?: string): string {
    return this.db.resolveActiveCompanionId(characterId);
  }

  getLastDecision(): CompanionDecision | null {
    return this.lastDecision;
  }

  startLifeScheduler(): void {
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
      this.scheduleLifeTick(60_000 + Math.random() * 120_000);
    }, delayMs);
  }

  private tickLife(): void {
    const companionId = this.resolveCompanionId();
    const state = this.db.getCharacterState(companionId);
    if (state.coreState !== 'idle' || state.intent !== 'waiting') return;

    const activities: CompanionLifeActivity[] = ['idle', 'resting', 'thinking', 'listening_music'];
    const next = activities[Math.floor(Math.random() * activities.length)];
    this.setLifeActivity(companionId, next);
  }

  setLifeActivity(companionId: string, activity: CompanionLifeActivity): CharacterRuntimeState {
    this.currentActivity = activity;
    const state = this.db.getCharacterState(companionId);
    const animationIntent = this.animationForActivity(activity);
    const next: CharacterRuntimeState = {
      ...state,
      lifeActivity: activity,
      animationIntent,
      updatedAt: nowIso(),
    };
    this.db.saveCharacterState(next);
    this.emitState(next);
    return next;
  }

  private animationForActivity(activity: CompanionLifeActivity): string {
    const map: Record<CompanionLifeActivity, string> = {
      idle: 'Idle_Neutral',
      resting: 'Idle_Breathe',
      sleeping: 'Sleep',
      working: 'Work_Focus',
      listening_music: 'Music_Idle',
      thinking: 'Think',
      exploring: 'Expedition_Prepare',
      returning: 'Expedition_Return',
      waiting: 'Waiting_Response',
      interacting: 'Listening',
    };
    return map[activity] ?? 'Idle_Neutral';
  }

  setSessionPhase(phase: CompanionSessionPhase): void {
    const companionId = this.resolveCompanionId();
    const convPhase = mapSessionToConversationPhase(phase);

    if (convPhase === 'opening' || convPhase === 'listening') {
      if (!this.activeSessionId) {
        const session = this.db.createConversationSession(companionId, LOCAL_USER_ID);
        this.activeSessionId = session.id;
      }
    }

    if (this.activeSessionId) {
      this.db.updateConversationSessionPhase(this.activeSessionId, convPhase);
      if (convPhase === 'inactive' || convPhase === 'closing') {
        this.activeSessionId = null;
      }
    }

    const state = this.db.getCharacterState(companionId);
    const animationIntent =
      phase === 'listening' ? 'Listening'
      : phase === 'thinking' ? 'Think'
      : phase === 'talking' || phase === 'responding' ? 'Talk'
      : state.animationIntent ?? 'Idle_Neutral';

    const next = this.db.saveCharacterState({
      ...state,
      animationIntent,
      lifeActivity: phase === 'idle' || phase === 'inactive' ? 'idle' : 'interacting',
      updatedAt: nowIso(),
    });
    this.emitState(next);
  }

  advanceWithIntent(
    companionId: string,
    coreState: CharacterRuntimeState['coreState'],
    intent: CharacterRuntimeState['intent'],
    animationIntent?: string
  ): CharacterRuntimeState {
    const current = this.db.getCharacterState(companionId);
    const emotionName = dominantEmotion(current.emotion);
    const resolvedAnimation = animationIntent ?? animationFor(intent, coreState, emotionName, [
      'Idle_Neutral', 'Walk_Right', 'Think', 'Listening', 'Talk_Neutral', 'Expedition_Present', 'Expedition_Return', 'Expedition_Prepare', 'Work_Focus',
    ]);
    const next: CharacterRuntimeState = {
      ...current,
      coreState,
      intent,
      animationIntent: resolvedAnimation,
      updatedAt: nowIso(),
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
    const recentActions = this.db
      .listDiscoveryFeedback(20)
      .map((f) => (f.value === 'not_interested' ? 'ignored_discovery' : f.value));

    const userContext = {
      mode: sessionActive ? ('focused' as const) : ('idle' as const),
      localTime: nowIso(),
      recentActions,
      fatigueScore: sessionActive ? 60 : 15,
    };

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
          topInsightImportance: discovery.finalScore / 100,
        },
        timestamp: nowIso(),
      },
      userContext,
      relationship,
      initiativeBudget,
      discovery,
      sessionActive,
      companionDragging,
    });

    this.lastDecision = decision;
    this.emitDecision(decision);
    return decision;
  }

  shouldPresentDiscovery(decision: CompanionDecision): boolean {
    return decision.action === 'share_discovery' && (decision.timing === 'now' || decision.timing === 'next_idle');
  }

  recordInteraction(signal: 'positive' | 'ignored' | 'correction' | 'not_now' | 'not_interested'): void {
    const companionId = this.resolveCompanionId();
    const rel = this.db.getRelationship(LOCAL_USER_ID, companionId);
    const now = nowIso();

    if (signal === 'positive') {
      rel.recentPositiveInteractions += 1;
      rel.familiarity = Math.min(100, rel.familiarity + 1);
      rel.trust = Math.min(100, rel.trust + 0.5);
    } else if (signal === 'ignored' || signal === 'not_interested') {
      rel.recentIgnoredInteractions += 1;
    } else if (signal === 'correction') {
      rel.recentCorrections += 1;
    } else if (signal === 'not_now') {
      // Timing only — does not affect topic preference
    }

    rel.lastMeaningfulInteractionAt = now;
    rel.updatedAt = now;
    this.db.saveRelationship(rel);
  }

  extractMemoryFromTurn(companionId: string, userMessage: string, assistantReply: string, sessionId?: string): void {
    if (userMessage.length < 20) return;
    const memoryType: TypedMemoryType = 'conversation_episode';
    const node = createMemoryNode({
      type: 'topic',
      title: userMessage.slice(0, 80),
      summary: assistantReply.slice(0, 200),
      importanceScore: 0.4,
      source: 'conversation',
    });
    this.db.insertMemoryNode({
      ...node,
      companionId,
      userId: LOCAL_USER_ID,
      memoryType,
      metadata: {
        ownerCompanionId: companionId,
        ownerUserId: LOCAL_USER_ID,
        sourceType: 'conversation',
        confidence: 0.6,
        sensitivity: 'normal',
        scope: 'companion',
        createdAt: nowIso(),
      },
    });
    if (sessionId) {
      const rel = this.db.getRelationship(LOCAL_USER_ID, companionId);
      rel.recentPositiveInteractions += 1;
      rel.updatedAt = nowIso();
      this.db.saveRelationship(rel);
    }
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }
}

function mapSessionToConversationPhase(phase: CompanionSessionPhase): ConversationPhase {
  const map: Partial<Record<CompanionSessionPhase, ConversationPhase>> = {
    inactive: 'inactive',
    idle: 'inactive',
    opening: 'opening',
    listening: 'listening',
    thinking: 'thinking',
    talking: 'responding',
    responding: 'responding',
    waiting_for_user: 'waiting_for_user',
    paused: 'paused',
    closing: 'closing',
  };
  return map[phase] ?? 'inactive';
}
