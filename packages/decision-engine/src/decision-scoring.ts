import type {
  CompanionDecisionCandidate,
  CompanionDecisionContext,
} from '@our-companion/shared';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function scoreCandidate(
  candidate: CompanionDecisionCandidate,
  context: CompanionDecisionContext
): number {
  let score = candidate.score;

  if (context.user.mode === 'focused' || context.user.mode === 'working') {
    score -= candidate.interruptionCost * 0.5;
  }

  if (context.user.fatigueScore > 70) {
    score -= 0.15;
  }

  const hoursSinceInteraction = context.user.lastInteractionAt
    ? (Date.now() - new Date(context.user.lastInteractionAt).getTime()) / (1000 * 60 * 60)
    : 24;

  if (hoursSinceInteraction > 4) {
    score += 0.1;
  }

  if (context.insight.topInsightImportance > 0.7) {
    score += 0.1;
  }

  if (context.curiosity.topCuriosityScore > 0.7) {
    score += 0.05;
  }

  if (context.character.energy < 30) {
    score -= 0.1;
  }

  score += candidate.confidence * 0.1;

  return clamp01(score);
}
