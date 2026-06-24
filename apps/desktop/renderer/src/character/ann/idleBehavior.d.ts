import type { CharacterRuntimeState } from '@our-companion/shared';
import type { AnimationName } from './animationConfig';
export type IdleAnimationName = Extract<AnimationName, 'idle_laptop' | 'idle_notes' | 'idle_coffee' | 'idle_tired'>;
export declare function isIdleState(state?: Pick<CharacterRuntimeState, 'coreState' | 'intent'>): boolean;
export declare function selectWeightedIdleAnimation(random?: () => number): IdleAnimationName;
export declare function getIdleRotationDelay(random?: () => number): number;
