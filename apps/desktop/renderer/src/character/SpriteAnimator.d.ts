export interface SpriteSheetConfig {
    sheet: string;
    frameWidth: number;
    frameHeight: number;
    frames: number;
    frameMs: number;
    columns?: number;
    rows?: number;
}
export interface SpriteAnimatorViewport {
    width: number;
    height: number;
}
export interface SpriteAnimatorOptions {
    cacheKey?: string;
    onError?: () => void;
}
export declare class SpriteAnimator {
    private readonly config;
    private readonly columns;
    private readonly rows;
    private readonly onError?;
    private readonly cacheKey;
    private image;
    private context;
    private viewport;
    private frameIndex;
    private interval;
    private cancelled;
    constructor(config: SpriteSheetConfig, options?: SpriteAnimatorOptions);
    load(): Promise<void>;
    start(canvas: HTMLCanvasElement, viewport: SpriteAnimatorViewport): void;
    stop(): void;
    destroy(): void;
    private drawFrame;
}
