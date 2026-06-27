import type {
  DiscoveryPoolItem,
  DiscoveryShareCandidate,
  AttentionState,
  DiscoveryInterruptionLevel,
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export function evaluateShareCandidate(
  item: DiscoveryPoolItem,
  attention: AttentionState,
  recentDismissals: number
): DiscoveryShareCandidate {
  let priority = item.sharePriority;
  let interruptionCost = 0.3;

  if (attention.doNotDisturb) {
    interruptionCost = 1.0;
  }

  if (!attention.userActive) {
    interruptionCost *= 0.5;
  }

  if (recentDismissals >= 3) {
    priority *= 0.5;
    interruptionCost += 0.2;
  }

  const suggestedTone = item.noveltyScore > 0.7 ? 'excited' : 'soft';
  const suggestedTiming = interruptionCost > 0.6 ? 'later' : 'now';

  return {
    id: createId('share_candidate'),
    poolItemId: item.id,
    reason: `Discovery has ${item.noveltyScore > 0.7 ? 'high novelty' : 'moderate relevance'}.`,
    priority,
    urgency: item.noveltyScore,
    expectedUserValue: item.relevanceScore,
    interruptionCost,
    confidence: item.confidenceScore,
    suggestedTone,
    suggestedTiming,
  };
}

export function determineInterruptionLevel(
  candidate: DiscoveryShareCandidate,
  attention: AttentionState
): DiscoveryInterruptionLevel {
  if (attention.doNotDisturb) {
    return 'none';
  }

  if (candidate.interruptionCost > 0.7) {
    return 'badge_only';
  }

  if (candidate.interruptionCost > 0.4) {
    return 'soft_prompt';
  }

  if (candidate.expectedUserValue > 0.8 && candidate.confidence > 0.7) {
    return 'panel_peek';
  }

  return 'soft_prompt';
}

export function shouldShareNow(candidate: DiscoveryShareCandidate, attention: AttentionState): boolean {
  if (attention.doNotDisturb) return false;
  if (candidate.interruptionCost > 0.6) return false;
  if (candidate.expectedUserValue < 0.4) return false;
  return true;
}
