import type {
  CompanionDecision,
  CompanionDecisionInput,
  AttentionAssessment,
  CompanionContext,
  Discovery,
  UserCompanionRelationship,
  UserContext,
} from '@our-companion/shared';
import { createId, nowIso, toUnitScore } from '@our-companion/shared';
import { CompanionBrain } from './companion-brain';

export interface InitiativeBudgetState {
  remaining: number;
  max: number;
  recoveryRate: number;
}

export interface UnifiedDecisionInput {
  brainInput: CompanionDecisionInput;
  userContext: UserContext;
  relationship: UserCompanionRelationship;
  initiativeBudget: InitiativeBudgetState;
  discovery?: Discovery;
  sessionActive: boolean;
  companionDragging: boolean;
}

const HARD_SHARE_MAX = 8;

interface AssessAttentionInput {
  targetId: string;
  targetType: string;
  noveltyScore?: number;
  growthValue?: number;
  urgency?: number;
  sourceQuality?: number;
  userContext: UserContext;
  companionContext: CompanionContext;
}

function assessAttention(input: AssessAttentionInput): AttentionAssessment {
  const fatiguePenalty = (input.userContext.fatigueScore ?? 0) * 0.25;
  const timingPenalty = input.userContext.mode === 'focused' || input.userContext.mode === 'working' ? 0.2 : 0;
  const latePenalty = isLateNight(input.userContext.localTime) ? 0.15 : 0;
  const attentionValue = toUnitScore(
    (input.noveltyScore ?? 0.5) * 0.25 +
      (input.growthValue ?? 0.5) * 0.35 +
      (input.urgency ?? 0.3) * 0.15 +
      (input.sourceQuality ?? 0.7) * 0.15 +
      input.companionContext.trustScore * 0.1
  );
  const attentionCost = toUnitScore(0.2 + fatiguePenalty + timingPenalty + latePenalty);
  const deservesAttention =
    attentionValue >= attentionCost + 0.2 &&
    input.companionContext.attentionBudgetRemaining >= attentionCost &&
    (input.sourceQuality ?? 0.7) >= 0.35;

  return {
    id: createId('attention'),
    targetId: input.targetId,
    targetType: input.targetType,
    deservesAttention,
    attentionCost,
    attentionValue,
    reason: deservesAttention
      ? 'Attention value clears timing, fatigue, quality, and budget gates.'
      : 'Attention is protected by timing, fatigue, quality, or budget gates.'
  };
}

function isLateNight(localTime: string): boolean {
  const hour = Number(localTime.slice(11, 13) || localTime.slice(0, 2));
  return Number.isFinite(hour) && (hour >= 23 || hour < 6);
}

function mapCandidateToAction(type: string): CompanionDecision['action'] {
  const map: Record<string, CompanionDecision['action']> = {
    stay_quiet: 'stay_silent',
    respond: 'respond',
    ask_question: 'continue_conversation',
    share_discovery: 'share_discovery',
    start_discovery: 'start_exploration',
    continue_journey: 'idle_activity',
    suggest_action: 'suggest_action',
    update_memory: 'idle_activity',
    perform_character_reaction: 'idle_activity',
  };
  return map[type] ?? 'stay_silent';
}

function displayHintFor(
  action: CompanionDecision['action'],
  timing: CompanionDecision['timing']
): CompanionDecision['displayHint'] {
  if (action === 'share_discovery' && timing === 'now') return 'present_discovery';
  if (action === 'share_discovery' && timing === 'next_idle') return 'show_soft_hint';
  if (action === 'respond' || action === 'continue_conversation') return 'start_conversation';
  if (action === 'suggest_action') return 'suggest_next_action';
  if (action === 'idle_activity') return 'ambient_reaction';
  return 'stay_silent';
}

function animationIntentFor(action: CompanionDecision['action']): string | undefined {
  const map: Partial<Record<CompanionDecision['action'], string>> = {
    share_discovery: 'Expedition_Present',
    start_exploration: 'Expedition_Prepare',
    respond: 'Listening',
    continue_conversation: 'Listening',
    approach: 'Walk_Right',
    idle_activity: 'Idle_Neutral',
    stay_silent: 'Idle_Neutral',
  };
  return map[action];
}

export function computeInitiativeBudget(
  relationship: UserCompanionRelationship,
  announcedToday: number,
  focusedMode: boolean
): InitiativeBudgetState {
  let base = 3;
  if (relationship.preferredInteractionFrequency === 'high') base += 2;
  if (relationship.preferredInteractionFrequency === 'low') base -= 1;
  base += Math.min(2, Math.floor(relationship.trust / 0.3));
  base -= Math.min(3, relationship.recentIgnoredInteractions);
  if (focusedMode) base -= 2;
  const max = HARD_SHARE_MAX;
  const remaining = Math.max(0, Math.min(max, base - announcedToday));
  return { remaining, max, recoveryRate: 1 };
}

export function decideUnifiedCompanionAction(input: UnifiedDecisionInput): CompanionDecision {
  const brain = new CompanionBrain();
  const result = brain.decide(input.brainInput);
  const candidate = result.selectedCandidate;
  let action = mapCandidateToAction(candidate.type);
  let timing: CompanionDecision['timing'] = result.shouldInterruptUser ? 'now' : 'next_idle';
  let priority: CompanionDecision['priority'] = candidate.score > 0.7 ? 'high' : candidate.score > 0.5 ? 'normal' : 'low';
  let reason = result.reasoningSummary;

  if (input.sessionActive && action === 'share_discovery') {
    action = 'stay_silent';
    timing = 'later';
    reason = 'Conversation is active; discovery deferred.';
  }

  if (input.companionDragging) {
    action = 'stay_silent';
    timing = 'later';
    reason = 'User is dragging companion; deferring action.';
  }

  if (action === 'share_discovery') {
    if (input.initiativeBudget.remaining <= 0) {
      action = 'stay_silent';
      timing = 'later';
      reason = 'Initiative budget exhausted for this window.';
    } else if (input.userContext.mode === 'focused') {
      action = 'stay_silent';
      timing = 'next_idle';
      reason = 'User is focused; discovery queued for idle.';
    } else if (isLateNight(input.userContext.localTime)) {
      action = 'stay_silent';
      timing = 'later';
      reason = 'Late hours; protecting attention.';
    } else if (input.relationship.recentIgnoredInteractions >= 3) {
      action = 'stay_silent';
      timing = 'later';
      reason = 'Recent ignored interactions reduce initiative.';
    }
  }

  if (input.discovery) {
    const attention = assessAttention({
      targetId: input.discovery.id,
      targetType: 'discovery',
      noveltyScore: input.discovery.noveltyScore,
      growthValue: input.discovery.finalScore,
      sourceQuality: input.discovery.usefulnessScore,
      userContext: input.userContext,
      companionContext: {
        dailySharedCount: input.initiativeBudget.max - input.initiativeBudget.remaining,
        attentionBudgetRemaining: toUnitScore(input.initiativeBudget.remaining / input.initiativeBudget.max),
        curiosityBudgetRemaining: 1,
        trustScore: input.relationship.trust,
      },
    });
    if (action === 'share_discovery' && !attention.deservesAttention) {
      action = 'stay_silent';
      timing = 'next_idle';
      reason = attention.reason;
    }
  }

  return {
    id: createId('decision'),
    action,
    timing,
    priority,
    reason,
    createdAt: nowIso(),
    animationIntent: animationIntentFor(action),
    displayHint: displayHintFor(action, timing),
  };
}
