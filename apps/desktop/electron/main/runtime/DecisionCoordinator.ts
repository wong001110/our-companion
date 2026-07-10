import type { DatabaseService } from '@our-companion/database';
import type {
  CompanionDecision,
  Discovery,
  PendingCompanionAction,
  UserCompanionRelationship
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { decideUnifiedCompanionAction, computeInitiativeBudget, type UnifiedDecisionInput } from '@our-companion/decision-engine';
import { attentionToUserContext, buildUserAttentionContext } from './attentionContext';

const PENDING_TTL_MS = 4 * 60 * 60 * 1000;

export function shouldPresentNow(decision: CompanionDecision): boolean {
  return decision.action === 'share_discovery' && decision.timing === 'now';
}

export function shouldDeferDiscovery(decision: CompanionDecision): boolean {
  return decision.action === 'share_discovery' && decision.timing === 'next_idle';
}

export interface ReevaluateContext {
  companionId: string;
  userId: string;
  discovery?: Discovery;
  sessionActive: boolean;
  companionDragging: boolean;
  relationship: UserCompanionRelationship;
  sharedToday: number;
  recentActions: string[];
  explicitMode?: 'available' | 'focused' | 'do_not_disturb';
}

export class DecisionCoordinator {
  constructor(private readonly db: DatabaseService) {}

  enqueueDeferred(decision: CompanionDecision, companionId: string, discoveryId?: string, userId = 'local'): PendingCompanionAction {
    const action: PendingCompanionAction = {
      id: createId('pending'),
      companionId,
      decision,
      discoveryId,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
      status: 'pending',
      deferReason: decision.reason
    };
    this.db.insertPendingAction(action, userId);
    return action;
  }

  expireStale(companionId: string, userId = 'local'): void {
    const now = Date.now();
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

  reevaluatePending(ctx: ReevaluateContext): CompanionDecision | null {
    this.expireStale(ctx.companionId, ctx.userId);
    const pending = this.db.listPendingActions(ctx.companionId, ctx.userId);
    if (pending.length === 0) return null;

    const action = pending[0];
    if (action.status === 'cancelled' || action.status === 'expired') return null;

    const attention = buildUserAttentionContext({
      conversationActive: ctx.sessionActive,
      companionDragging: ctx.companionDragging,
      explicitMode: ctx.explicitMode
    });
    const userContext = attentionToUserContext(attention, ctx.recentActions);

    const initiativeBudget = computeInitiativeBudget(
      ctx.relationship,
      ctx.sharedToday,
      userContext.mode === 'focused'
    );

    const input: UnifiedDecisionInput = {
      brainInput: {
        userContext,
        insightContext: ctx.discovery
          ? { recentInsights: [ctx.discovery.id], insightCount: 1, topInsightImportance: ctx.discovery.finalScore / 100 }
          : { recentInsights: [], insightCount: 0, topInsightImportance: 0 },
        timestamp: nowIso()
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
      this.db.updatePendingActionStatus(action.id, 'completed');
      return decision;
    }

    if (decision.action === 'stay_silent' || decision.timing === 'later') {
      return null;
    }

    return null;
  }

  listReadyForPresentation(companionId: string, userId = 'local'): PendingCompanionAction[] {
    this.expireStale(companionId, userId);
    return this.db.listPendingActions(companionId, userId).filter((a) => a.status === 'pending' || a.status === 'ready');
  }
}
