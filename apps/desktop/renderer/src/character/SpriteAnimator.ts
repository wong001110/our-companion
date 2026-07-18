export interface SpriteSheetConfig {
  sheet: string;
  frameWidth: number;
  frameHeight: number;
  frameMs: number;
  columns?: number;
  rows?: number;
  loop?: boolean;
}

export interface SpriteAnimatorViewport {
  width: number;
  height: number;
}

export interface SpriteAnimatorOptions {
  cacheKey?: string;
  onError?: () => void;
  onComplete?: () => void;
}

export class SpriteAnimator {
  private readonly config: SpriteSheetConfig;
  private columns: number;
  private rows: number;
  private frameWidth: number;
  private frameHeight: number;
  private totalFrames: number;
  private readonly onError?: () => void;
  private readonly onComplete?: () => void;
  private readonly cacheKey: string;

  private image: HTMLImageElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private viewport: SpriteAnimatorViewport | null = null;
  private frameIndex = 0;
  private interval: number | undefined;
  private playbackRate = 1;
  private running = false;
  private cancelled = false;
  private completed = false;

  constructor(config: SpriteSheetConfig, options: SpriteAnimatorOptions = {}) {
    this.config = config;
    this.frameWidth = config.frameWidth;
    this.frameHeight = config.frameHeight;
    this.columns = config.columns ?? 0;
    this.rows = config.rows ?? 1;
    this.totalFrames = 0;
    this.onError = options.onError;
    this.onComplete = options.onComplete;
    this.cacheKey = options.cacheKey ?? config.sheet;
  }

  load(): Promise<void> {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        if (this.cancelled) {
          resolve();
          return;
        }
        this.image = image;
        this.frameHeight = image.naturalHeight;
        this.frameWidth = image.naturalHeight;

        this.columns = this.columns || Math.floor(image.naturalWidth / image.naturalHeight);
        this.rows = this.rows || 1;
        this.totalFrames = this.columns * this.rows;
        if (!Number.isFinite(this.columns) || !Number.isFinite(this.totalFrames) || this.columns <= 0 || this.totalFrames <= 0) {
          this.onError?.();
          reject(new Error(`Invalid sprite sheet frame count: ${this.config.sheet}`));
          return;
        }

        resolve();
      };

      image.onerror = () => {
        this.onError?.();
        reject(new Error(`Failed to load sprite sheet: ${this.config.sheet}`));
      };

      image.src = `${this.config.sheet}?v=${this.cacheKey}`;
    });
  }

  start(canvas: HTMLCanvasElement, viewport: SpriteAnimatorViewport): void {
    this.stop();
    if (!Number.isFinite(this.totalFrames) || this.totalFrames <= 0 || this.columns <= 0) {
      this.onError?.();
      return;
    }
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const context = canvas.getContext('2d');
    if (!context) {
      this.onError?.();
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    this.context = context;
    this.viewport = viewport;
    this.frameIndex = 0;

    this.drawFrame();
    this.running = this.totalFrames > 1;
    if (this.running) this.startFrameInterval();
  }

  setPlaybackRate(rate: number): void {
    const next = Math.max(0.1, Math.min(4, Number.isFinite(rate) ? rate : 1));
    if (next === this.playbackRate) return;
    this.playbackRate = next;
    if (this.running) {
      if (this.interval !== undefined) window.clearInterval(this.interval);
      this.startFrameInterval();
    }
  }

  stop(): void {
    this.running = false;
    if (this.interval !== undefined) {
      window.clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private startFrameInterval(): void {
    this.interval = window.setInterval(
      () => this.drawFrame(),
      Math.max(16, this.config.frameMs / this.playbackRate),
    );
  }

  destroy(): void {
    this.cancelled = true;
    this.stop();
    this.context = null;
    this.viewport = null;
    this.image = null;
  }

  private drawFrame(): void {
    const { context, viewport, image } = this;
    if (!context || !viewport || !image?.complete || image.naturalWidth === 0) {
      return;
    }

    const column = this.frameIndex % this.columns;
    const row = Math.floor(this.frameIndex / this.columns);
    const sx = Math.floor(column * this.frameWidth);
    const sy = Math.floor(row * this.frameHeight);

    context.clearRect(0, 0, viewport.width, viewport.height);

    const scale = Math.min(
      viewport.width / this.frameWidth,
      viewport.height / this.frameHeight
    );
    const dw = this.frameWidth * scale;
    const dh = this.frameHeight * scale;
    const dx = (viewport.width - dw) / 2;
    const dy = viewport.height - dh;

    context.drawImage(
      image,
      sx, sy, this.frameWidth - 1, this.frameHeight - 1,
      dx, dy, dw, dh
    );
    if (this.frameIndex < this.totalFrames - 1) {
      this.frameIndex += 1;
      return;
    }
    if (this.config.loop !== false) {
      this.frameIndex = 0;
      return;
    }
    this.stop();
    if (!this.completed && !this.cancelled) {
      this.completed = true;
      this.onComplete?.();
    }
  }
}
