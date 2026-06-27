import type {
  DiscoveryUserReaction,
  DiscoveryPoolItem,
  MemoryRecord,
} from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';

export function processReaction(
  item: DiscoveryPoolItem,
  reaction: DiscoveryUserReaction
): {
  updatedItem: DiscoveryPoolItem;
  memoryUpdates: Array<{ action: 'reinforce' | 'weaken'; memoryId: string }>;
  shouldCreateFollowUp: boolean;
} {
  const memoryUpdates: Array<{ action: 'reinforce' | 'weaken'; memoryId: string }> = [];
  let shouldCreateFollowUp = false;

  switch (reaction.action) {
    case 'saved':
    case 'discussed':
    case 'explore_more':
      for (const memoryId of item.relatedMemories) {
        memoryUpdates.push({ action: 'reinforce', memoryId });
      }
      shouldCreateFollowUp = reaction.action === 'explore_more';
      break;

    case 'dismissed':
    case 'not_interested':
      for (const memoryId of item.relatedMemories) {
        memoryUpdates.push({ action: 'weaken', memoryId });
      }
      break;

    case 'converted_to_journey':
      for (const memoryId of item.relatedMemories) {
        memoryUpdates.push({ action: 'reinforce', memoryId });
      }
      shouldCreateFollowUp = true;
      break;
  }

  return {
    updatedItem: {
      ...item,
      userReaction: reaction,
      status: mapReactionToStatus(reaction.action),
      lastUpdatedAt: nowIso(),
    },
    memoryUpdates,
    shouldCreateFollowUp,
  };
}

function mapReactionToStatus(action: string): import('@our-companion/shared').DiscoveryExperienceStatus {
  const statusMap: Record<string, import('@our-companion/shared').DiscoveryExperienceStatus> = {
    saved: 'saved',
    dismissed: 'dismissed',
    not_interested: 'dismissed',
    discussed: 'discussing',
    explore_more: 'follow_up_requested',
    converted_to_journey: 'converted_to_journey',
    opened_source: 'shared',
    viewed: 'shared',
  };
  return statusMap[action] ?? 'pooled';
}

export function shouldSuppressFutureShares(
  reactions: DiscoveryUserReaction[],
  topic: string,
  threshold = 3
): boolean {
  const recentDismissals = reactions.filter(
    (r) => (r.action === 'dismissed' || r.action === 'not_interested') &&
           r.timestamp > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  ).length;

  return recentDismissals >= threshold;
}
