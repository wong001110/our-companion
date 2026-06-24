import type { SpriteSheetConfig } from '../SpriteAnimator';
export declare const ANN_FRAME: {
    readonly width: 300;
    readonly height: 300;
};
export interface AnnAnimationConfig extends SpriteSheetConfig {
    name: string;
}
export declare const annAnimations: {
    readonly idle_laptop: AnnAnimationConfig;
    readonly idle_coffee: AnnAnimationConfig;
    readonly idle_notes: AnnAnimationConfig;
    readonly idle_tired: AnnAnimationConfig;
    readonly walk: AnnAnimationConfig;
    readonly return: AnnAnimationConfig;
    readonly think: AnnAnimationConfig;
    readonly focus_typing: AnnAnimationConfig;
    readonly discovery: AnnAnimationConfig;
    readonly discovery_shy: AnnAnimationConfig;
    readonly talk: AnnAnimationConfig;
    readonly talk_happy: AnnAnimationConfig;
    readonly task_start: AnnAnimationConfig;
    readonly task_success: AnnAnimationConfig;
    readonly task_failed: AnnAnimationConfig;
};
export type AnimationName = keyof typeof annAnimations;
