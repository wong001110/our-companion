import type { UserAttentionContext, UserContext } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';

export function isLateNight(localTime: string): boolean {
  const hour = Number(localTime.slice(11, 13) || localTime.slice(0, 2));
  return Number.isFinite(hour) && (hour >= 23 || hour < 6);
}

export function buildUserAttentionContext(input: {
  conversationActive: boolean;
  companionDragging: boolean;
  explicitMode?: UserAttentionContext['explicitMode'];
  lastInteractionAt?: string;
  localTime?: string;
}): UserAttentionContext {
  const localTime = input.localTime ?? nowIso();
  return {
    explicitMode: input.explicitMode,
    conversationActive: input.conversationActive,
    companionDragging: input.companionDragging,
    recentInputActivity: 'unknown',
    quietHoursActive: isLateNight(localTime),
    lastInteractionAt: input.lastInteractionAt
  };
}

export function attentionToUserContext(
  attention: UserAttentionContext,
  recentActions: string[],
  localTime?: string
): UserContext {
  let mode: UserContext['mode'] = 'idle';
  if (attention.explicitMode === 'focused' || attention.explicitMode === 'do_not_disturb') {
    mode = 'focused';
  } else if (attention.conversationActive) {
    mode = 'chatting';
  }

  return {
    mode,
    localTime: localTime ?? nowIso(),
    recentActions
  };
}
