import type { AnimationKey, AnimationRequest, AnnMood, BehaviourState, CharacterPackage, CharacterRuntimeState, CharacterRuntimeDescriptor, CharacterState, CompanionDecision, CoreState, EmotionName, EmotionState, Intent, NormalizedDiscovery, PerformanceScript, ValidationResult } from '@our-companion/shared';
export declare const neutralEmotion: EmotionState;
export declare const requiredCreatorAnimations: string[];
export declare const defaultAnnPackage: CharacterPackage;
export declare function createInitialCharacterState(characterId?: string): CharacterRuntimeState;
export declare function validateCharacterPackage(pkg: CharacterPackage): ValidationResult;
export declare class CharacterPackageRegistry {
    private readonly packages;
    private activePackageId;
    constructor(initialPackages?: CharacterPackage[]);
    register(pkg: CharacterPackage): ValidationResult;
    get(id: string): CharacterPackage | undefined;
    list(): CharacterPackage[];
    activate(id: string): CharacterPackage;
    active(): CharacterPackage;
}
export declare function createRuntimeDescriptor(pkg: CharacterPackage): CharacterRuntimeDescriptor;
export declare function loadCharacterPackage(pkg: CharacterPackage, registry?: CharacterPackageRegistry): {
    package: CharacterPackage;
    validation: ValidationResult;
    runtime: CharacterRuntimeDescriptor;
};
export declare function exportCharacterPackage(pkg: CharacterPackage): string;
export declare function importCharacterPackage(serialized: string): CharacterPackage;
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
export interface CharacterExpressionContext {
    energy?: number;
    focusMode?: boolean;
    availableAnimations?: string[];
}
export declare function emotionForDecision(decision: Pick<CompanionDecision, 'action' | 'priority'>, context?: CharacterExpressionContext): AnnMood;
export declare function behaviourForDecision(decision: Pick<CompanionDecision, 'action'>): BehaviourState;
export declare function resolveCharacterState(decision: Pick<CompanionDecision, 'action' | 'priority'>, context?: CharacterExpressionContext): CharacterState;
export declare function nextAnimationState(current: AnimationKey, requested?: AnimationKey): AnimationKey;
export declare function animationKeyForBehaviour(behaviour: BehaviourState, mood: AnnMood): AnimationKey;
export declare function planAnimationRequest(input: {
    characterId?: string;
    behaviour: BehaviourState;
    mood: AnnMood;
    reason: string;
}): AnimationRequest;
export declare function planPerformanceScript(actionId: string, outcome?: 'success' | 'failure'): PerformanceScript;
export { getDiscoveryFetchDelay, getDiscoveryFetchDelayRange, DISCOVERY_STARTUP_DELAY_MS } from './discoveryTiming';
