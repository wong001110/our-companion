export class SpriteAnimator {
    config;
    columns;
    rows;
    onError;
    cacheKey;
    image = null;
    context = null;
    viewport = null;
    frameIndex = 0;
    interval;
    cancelled = false;
    constructor(config, options = {}) {
        this.config = config;
        this.columns = config.columns ?? config.frames;
        this.rows = config.rows ?? 1;
        this.onError = options.onError;
        this.cacheKey = options.cacheKey ?? config.sheet;
    }
    load() {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                if (this.cancelled) {
                    resolve();
                    return;
                }
                this.image = image;
                resolve();
            };
            image.onerror = () => {
                this.onError?.();
                reject(new Error(`Failed to load sprite sheet: ${this.config.sheet}`));
            };
            image.src = `${this.config.sheet}?v=${this.cacheKey}`;
        });
    }
    start(canvas, viewport) {
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
        this.interval = window.setInterval(() => this.drawFrame(), this.config.frameMs);
    }
    stop() {
        if (this.interval !== undefined) {
            window.clearInterval(this.interval);
            this.interval = undefined;
        }
    }
    destroy() {
        this.cancelled = true;
        this.stop();
        this.context = null;
        this.viewport = null;
        this.image = null;
    }
    drawFrame() {
        const { context, viewport, image } = this;
        if (!context || !viewport || !image?.complete || image.naturalWidth === 0) {
            return;
        }
        const { frameWidth, frameHeight } = this.config;
        const column = this.frameIndex % this.columns;
        const row = Math.floor(this.frameIndex / this.columns);
        const sx = column * frameWidth;
        const sy = row * frameHeight;
        context.clearRect(0, 0, viewport.width, viewport.height);
        const scale = Math.min((viewport.width * 0.94) / frameWidth, (viewport.height * 0.94) / frameHeight);
        const dw = frameWidth * scale;
        const dh = frameHeight * scale;
        const dx = (viewport.width - dw) / 2;
        const dy = viewport.height - dh;
        context.drawImage(image, sx, sy, frameWidth, frameHeight, dx, dy, dw, dh);
        this.frameIndex = (this.frameIndex + 1) % this.config.frames;
    }
}
