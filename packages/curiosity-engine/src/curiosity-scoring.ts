import type { CuriosityCandidate } from '@our-companion/shared';

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function scoreCandidatePriority(candidate: CuriosityCandidate): number {
  return clamp01(
    candidate.novelty * 0.25 +
    candidate.relevance * 0.3 +
    candidate.confidence * 0.2 +
    candidate.freshness * 0.15 +
    0.1
  );
}

export function rankCandidates(candidates: CuriosityCandidate[]): CuriosityCandidate[] {
  return candidates
    .map((c) => ({
      ...c,
      priority: scoreCandidatePriority(c),
    }))
    .sort((a, b) => b.priority - a.priority);
}
