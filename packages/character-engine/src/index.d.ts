import type { CharacterRuntimeState, CoreState, EmotionName, EmotionState, Intent, NormalizedDiscovery } from '@our-companion/shared';
export declare const neutralEmotion: EmotionState;
export declare function createInitialCharacterState(characterId?: string): CharacterRuntimeState;
export declare function dominantEmotion(emotion: EmotionState): EmotionName;
export declare function decayEmotion(emotion: EmotionState, date?: Date): EmotionState;
export type EmotionEvent = 'user_accepts_discovery' | 'user_rejects_discovery' | 'ignored_multiple_discoveries' | 'new_high_score_discovery' | 'task_success' | 'task_failure' | 'late_night' | 'expertise_topic_match';
export declare function applyEmotionEvent(emotion: EmotionState, event: EmotionEvent): EmotionState;
export interface IntentContext {
    userCommand?: string;
    pendingTasks?: number;
    availableDiscoveries?: NormalizedDiscovery[];
    recentMemoryActivity?: boolean;
    reflectionDue?: boolean;
    userActive?: boolean;
    relationshipBond?: number;
    date?: Date;
}
export declare function selectIntent(state: CharacterRuntimeState, context: IntentContext): Intent;
export declare function transitionState(current: CoreState, intent: Intent, emotion: EmotionName): CoreState;
export declare function animationFor(intent: Intent, state: CoreState, emotion: EmotionName, availableAnimations: string[]): string;
export declare function advanceCharacter(state: CharacterRuntimeState, context: IntentContext): CharacterRuntimeState;
export { getDiscoveryFetchDelay, getDiscoveryFetchDelayRange, DISCOVERY_STARTUP_DELAY_MS } from './discoveryTiming';
