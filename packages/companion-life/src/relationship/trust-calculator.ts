import type { RelationshipSignal, RelationshipState } from './types';

export function calculateTrustChange(
  currentTrust: number,
  signal: RelationshipSignal
): number {
  const baseImpact = signal.impact;
  const diminishing = Math.max(0.1, 1 - currentTrust / 100);
  return Math.round(baseImpact * diminishing * 10) / 10;
}

export function calculateTrustFromSignals(
  signals: RelationshipSignal[]
): number {
  let trust = 0;
  for (const signal of signals) {
    trust += calculateTrustChange(trust, signal);
  }
  return Math.min(100, Math.max(0, Math.round(trust)));
}

export function relationshipStrength(state: RelationshipState): number {
  const trustWeight = 0.4;
  const experienceWeight = 0.3;
  const timeWeight = 0.2;
  const interactionWeight = 0.1;

  const trustScore = state.trustScore;
  const experienceScore = Math.min(100, state.sharedExperienceCount * 2);
  const timeScore = Math.min(100, state.timeTogetherDays * 1.5);
  const interactionScore = Math.min(100, state.conversationCount * 3);

  return Math.round(
    trustScore * trustWeight +
    experienceScore * experienceWeight +
    timeScore * timeWeight +
    interactionScore * interactionWeight
  );
}

export function familiarityLevel(state: RelationshipState): number {
  return Math.min(100, Math.round(
    state.sharedExperienceCount * 2 +
    state.conversationCount * 3 +
    state.timeTogetherDays * 0.5
  ));
}
