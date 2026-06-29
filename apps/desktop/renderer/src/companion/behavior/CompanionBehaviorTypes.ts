export type CompanionMode =
  | 'idle'
  | 'casual'
  | 'discovery'
  | 'work_support'
  | 'reflection'
  | 'debug';

export type CompanionMood =
  | 'calm'
  | 'curious'
  | 'excited'
  | 'tired'
  | 'concerned';

export type CompanionEnergy = 'low' | 'normal' | 'high';

export type CompanionFocus =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'discovering'
  | 'presenting'
  | 'sleeping';

export type InitiativeLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type DiscoveryPresentationState =
  | 'none'
  | 'queued'
  | 'soft_hint'
  | 'presented'
  | 'discussed'
  | 'saved'
  | 'ignored'
  | 'follow_up';

export interface CompanionBehaviorState {
  mode: CompanionMode;
  mood: CompanionMood;
  energy: CompanionEnergy;
  focus: CompanionFocus;
  initiativeLevel: InitiativeLevel;

  discoveryPresentationState: DiscoveryPresentationState;

  lastUserInteractionAt: number | null;
  lastCompanionSpokeAt: number | null;
  lastDiscoveryPresentedAt: number | null;
  lastUserDismissedAt: number | null;

  interruptionSuppressedUntil: number | null;

  debugOverride: boolean;
}

export function createDefaultBehaviorState(): CompanionBehaviorState {
  return {
    mode: 'idle',
    mood: 'calm',
    energy: 'normal',
    focus: 'idle',
    initiativeLevel: 2,
    discoveryPresentationState: 'none',
    lastUserInteractionAt: null,
    lastCompanionSpokeAt: null,
    lastDiscoveryPresentedAt: null,
    lastUserDismissedAt: null,
    interruptionSuppressedUntil: null,
    debugOverride: false,
  };
}
