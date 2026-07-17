import type { DatabaseService } from '@our-companion/database';
import type {
  CompanionDecision,
  Discovery,
  PendingCompanionAction,
  UserCompanionRelationship
} from '@our-companion/shared';
import { createId } from '@our-companion/shared';
import { decideUnifiedCompanionAction, computeInitiativeBudget, type UnifiedDecisionInput } from '@our-companion/decision-engine';
import { attentionToUserContext, buildUserAttentionContext } from './attentionContext';

const PENDING_TTL_MS = 4 * 60 * 60 * 1000;

export function shouldPresentNow(decision: CompanionDecision): boolean {
  return decision.action === 'share_discovery' && decision.timing === 'now';
}

export function shouldDeferDiscovery(decision: CompanionDecision): boolean {
  return decision.timing === 'next_idle';
}

export interface ReevaluateContext {
  companionId: string;
  userId: string;
  discovery?: Discovery;
  sessionActive: boolean;
  companionDragging: boolean;
  relationship: UserCompanionRelationship;
  announcedToday: number;
  recentActions: string[];
  explicitMode?: 'available' | 'focused' | 'do_not_disturb';
}

export interface ReevaluateResult {
  decision: CompanionDecision | null;
  pendingAction?: PendingCompanionAction;
}

export class DecisionCoordinator {
  private readonly now: () => number;

  constructor(private readonly db: DatabaseService, deps: { now?: () => number } = {}) {
    this.now = deps.now ?? (() => Date.now());
  }

  enqueueDeferred(decision: CompanionDecision, companionId: string, discoveryId?: string, userId = 'local'): PendingCompanionAction {
    const action: PendingCompanionAction = {
      id: createId('pending'),
      companionId,
      decision,
      discoveryId,
      createdAt: new Date(this.now()).toISOString(),
      expiresAt: new Date(this.now() + PENDING_TTL_MS).toISOString(),
      status: 'pending',
      deferReason: decision.reason
    };
    this.db.insertPendingAction(action, userId);
    return action;
  }

  /** Preserves an intent, not a stale renderer command, when execution is currently busy. */
  ensureDeferred(decision: CompanionDecision, companionId: string, discoveryId?: string, deferReason = 'active_command_exists', userId = 'local'): PendingCompanionAction {
    const existing = this.db.listPendingActions(companionId, userId).find((action) =>
      (discoveryId !== undefined && action.discoveryId === discoveryId) || action.decision.id === decision.id
    );
    if (existing) {
      this.db.updatePendingActionDeferReason(existing.id, deferReason);
      return { ...existing, deferReason };
    }
    const action = this.enqueueDeferred(decision, companionId, discoveryId, userId);
    this.db.updatePendingActionDeferReason(action.id, deferReason);
    return { ...action, deferReason };
  }

  expireStale(companionId: string, userId = 'local'): void {
    const now = this.now();
    for (const action of this.db.listPendingActions(companionId, userId)) {
      if (new Date(action.expiresAt).getTime() <= now) {
        this.db.updatePendingActionStatus(action.id, 'expired');
      }
    }
  }

  cancelAll(companionId: string, userId = 'local'): void {
    for (const action of this.db.listPendingActions(companionId, userId)) {
      this.db.updatePendingActionStatus(action.id, 'cancelled');
    }
  }

  reevaluatePending(ctx: ReevaluateContext): ReevaluateResult {
    this.expireStale(ctx.companionId, ctx.userId);
    const pending = this.db.listPendingActions(ctx.companionId, ctx.userId);
    if (pending.length === 0) return { decision: null };

    const action = pending[0];
    if (action.status === 'cancelled' || action.status === 'expired') return { decision: null };

    const attention = buildUserAttentionContext({
      conversationActive: ctx.sessionActive,
      companionDragging: ctx.companionDragging,
      explicitMode: ctx.explicitMode,
      localTime: new Date(this.now()).toISOString()
    });
    const timestamp = new Date(this.now()).toISOString();
    const userContext = attentionToUserContext(attention, ctx.recentActions, timestamp);

    const initiativeBudget = computeInitiativeBudget(
      ctx.relationship,
      ctx.announcedToday,
      userContext.mode === 'focused'
    );

    const input: UnifiedDecisionInput = {
      brainInput: {
        userContext,
        insightContext: ctx.discovery
          ? { recentInsights: [ctx.discovery.id], insightCount: 1, topInsightImportance: ctx.discovery.finalScore }
          : { recentInsights: [], insightCount: 0, topInsightImportance: 0 },
        timestamp
      },
      userContext,
      relationship: ctx.relationship,
      initiativeBudget,
      discovery: ctx.discovery,
      sessionActive: ctx.sessionActive,
      companionDragging: ctx.companionDragging
    };

    const decision = decideUnifiedCompanionAction(input);

    if (shouldPresentNow(decision)) {
      return { decision, pendingAction: action };
    }

    if (decision.action === 'stay_silent' || decision.timing === 'later') {
      return { decision: null, pendingAction: action };
    }

    return { decision, pendingAction: action };
  }

  completePendingAction(id: string): void {
    this.db.updatePendingActionStatus(id, 'completed');
  }

  listReadyForPresentation(companionId: string, userId = 'local'): PendingCompanionAction[] {
    this.expireStale(companionId, userId);
    return this.db.listPendingActions(companionId, userId).filter((a) => a.status === 'pending' || a.status === 'ready');
  }
}
