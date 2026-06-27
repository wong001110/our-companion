import { createId } from '@our-companion/shared';
function clamp100(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.min(100, Math.max(0, Math.round(value)));
}
function isLateNight(localTime) {
    const hour = Number(localTime.slice(11, 13) || localTime.slice(0, 2));
    return Number.isFinite(hour) && (hour >= 23 || hour < 6);
}
export function assessAttention(input) {
    const fatiguePenalty = input.userContext.fatigueScore * 0.25;
    const timingPenalty = input.userContext.mode === 'focused' || input.userContext.mode === 'working' ? 20 : 0;
    const latePenalty = isLateNight(input.userContext.localTime) ? 15 : 0;
    const attentionValue = clamp100((input.noveltyScore ?? 50) * 0.25 +
        (input.growthValue ?? 50) * 0.35 +
        (input.urgency ?? 30) * 0.15 +
        (input.sourceQuality ?? 70) * 0.15 +
        input.companionContext.trustScore * 10);
    const attentionCost = clamp100(20 + fatiguePenalty + timingPenalty + latePenalty);
    const deservesAttention = attentionValue >= attentionCost + 20 &&
        input.companionContext.attentionBudgetRemaining >= attentionCost &&
        (input.sourceQuality ?? 70) >= 35;
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
function baseDecision(action, input) {
    return {
        id: createId('decision'),
        action,
        timing: input.timing,
        priority: input.priority,
        reason: input.reason,
        createdAt: new Date().toISOString()
    };
}
function recentIgnores(userContext) {
    return userContext.recentActions.filter((action) => action === 'ignored_discovery' || action === 'not_interested').length;
}
export function decideCompanionAction(input) {
    const novelty = input.discovery?.noveltyScore ?? 50;
    const growth = input.curiosity?.growthValue ?? input.discovery?.growthValue ?? input.insight?.growthValue ?? 50;
    const sourceQuality = input.discovery?.confidenceScore ?? input.discovery?.usefulnessScore ?? 70;
    const attention = input.attention;
    if (sourceQuality < 35) {
        return baseDecision('ignore', {
            timing: 'later',
            priority: 'low',
            reason: 'Source quality is too low to protect trust.'
        });
    }
    if (input.userContext.mode === 'focused' && growth < 90) {
        return baseDecision('queue_for_later', {
            timing: 'next_idle',
            priority: growth >= 75 ? 'normal' : 'low',
            reason: 'User appears focused, so Ann should protect attention.'
        });
    }
    if (input.companionContext.dailySharedCount >= 3) {
        return baseDecision('queue_for_later', {
            timing: 'later',
            priority: 'normal',
            reason: 'Daily proactive share limit has been reached.'
        });
    }
    if (recentIgnores(input.userContext) >= 3) {
        return baseDecision('remember_only', {
            timing: 'later',
            priority: 'low',
            reason: 'Recent ignores suggest proactive sharing should be reduced.'
        });
    }
    if (isLateNight(input.userContext.localTime) || input.userContext.fatigueScore >= 75) {
        return baseDecision(growth >= 85 ? 'queue_for_later' : 'stay_silent', {
            timing: 'later',
            priority: growth >= 85 ? 'normal' : 'low',
            reason: 'Timing or fatigue makes silence kinder right now.'
        });
    }
    if (novelty < 40 && !input.curiosity?.gapMatch) {
        return baseDecision(growth >= 60 ? 'remember_only' : 'ignore', {
            timing: 'later',
            priority: 'low',
            reason: 'Novelty is low and no revival gap was matched.'
        });
    }
    if (growth > 85 && input.userContext.mode === 'idle' && (attention?.deservesAttention ?? true)) {
        return baseDecision('speak', {
            timing: 'now',
            priority: 'high',
            reason: 'High growth value and idle context make this worth attention.'
        });
    }
    if (attention && !attention.deservesAttention) {
        return baseDecision('queue_for_later', {
            timing: 'next_idle',
            priority: 'normal',
            reason: attention.reason
        });
    }
    return baseDecision('stay_silent', {
        timing: 'later',
        priority: 'low',
        reason: 'No rule found a good reason to interrupt.'
    });
}
// ============================================================================
// Companion Brain V2 — Enhanced decision making
// ============================================================================
export { CompanionBrain } from './companion-brain';
export { buildDecisionContext } from './decision-context-builder';
export { generateCandidates } from './decision-candidate';
export { scoreCandidate } from './decision-scoring';
export { shouldInterrupt } from './interruption-policy';
export { MIN_SCORE_FOR_ACTION, MAX_CANDIDATES, DEFAULT_CONFIDENCE } from './types';
