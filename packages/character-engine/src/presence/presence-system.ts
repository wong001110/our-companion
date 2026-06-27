import type {
  PresenceMode,
  AttentionState,
  CharacterRuntimeContext,
} from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';

export function createAttentionState(): AttentionState {
  return {
    userActive: true,
    appFocused: true,
    recentInteraction: true,
    doNotDisturb: false,
    estimatedInterruptCost: 0.2,
    lastUserInputAt: nowIso(),
  };
}

export function determinePresenceMode(
  context: CharacterRuntimeContext,
  attention: AttentionState
): PresenceMode {
  if (attention.doNotDisturb) {
    return 'do_not_disturb';
  }

  if (context.state === 'sleeping') {
    return 'sleeping';
  }

  if (context.state === 'exploring') {
    return 'exploring';
  }

  if (context.state === 'sharing') {
    return 'ready_to_share';
  }

  if (!attention.userActive) {
    return 'quiet';
  }

  if (context.state === 'thinking' || context.state === 'observing') {
    return 'curious';
  }

  if (attention.appFocused && attention.recentInteraction) {
    return 'available';
  }

  return 'observing';
}

export function shouldAllowInterruption(
  attention: AttentionState,
  interruptionCost: number
): boolean {
  if (attention.doNotDisturb) {
    return false;
  }

  if (!attention.userActive && interruptionCost < 0.5) {
    return true;
  }

  if (attention.estimatedInterruptCost + interruptionCost > 0.8) {
    return false;
  }

  if (!attention.recentInteraction && interruptionCost < 0.3) {
    return true;
  }

  return interruptionCost < 0.4;
}

export function updateAttentionState(
  current: AttentionState,
  updates: Partial<AttentionState>
): AttentionState {
  return {
    ...current,
    ...updates,
    lastUserInputAt: updates.lastUserInputAt ? nowIso() : current.lastUserInputAt,
  };
}
