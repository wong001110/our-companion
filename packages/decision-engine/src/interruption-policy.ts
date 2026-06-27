import type {
  CompanionDecisionCandidate,
  CompanionDecisionContext,
} from '@our-companion/shared';

export function shouldInterrupt(
  candidate: CompanionDecisionCandidate,
  context: CompanionDecisionContext
): boolean {
  if (candidate.type === 'stay_quiet') {
    return false;
  }

  if (context.user.mode === 'focused' || context.user.mode === 'working') {
    if (candidate.interruptionCost > 0.3) {
      return false;
    }
  }

  if (context.user.fatigueScore > 80) {
    if (candidate.interruptionCost > 0.2) {
      return false;
    }
  }

  const recentIgnores = context.user.recentActions.filter(
    (action) => action === 'ignored_discovery' || action === 'not_interested'
  ).length;

  if (recentIgnores >= 3 && candidate.interruptionCost > 0.3) {
    return false;
  }

  if (candidate.confidence < 0.4) {
    return false;
  }

  if (candidate.expectedUserValue < 0.3) {
    return false;
  }

  return true;
}
