export interface EmbeddingProvider {
  readonly modelId: string;
  readonly version: number;
  readonly dimensions: number;
  initialize(): Promise<void>;
  embedQuery(text: string): Promise<Float32Array>;
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
  dispose(): Promise<void>;
}

export type EmbeddingModelState = 'not-installed' | 'loading' | 'ready' | 'error';
type FeatureExtractor = (text: string | string[], options?: Record<string, unknown>) => Promise<unknown>;

/**
 * Local-only ONNX/WASM embedding runtime. It intentionally disables remote
 * model access during ordinary chat; installation is an explicit future UI/CLI
 * action that can temporarily enable it.
 */
export class LocalMultilingualEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = 'Xenova/multilingual-e5-small';
  readonly version = 1;
  readonly dimensions = 384;
  private extractor: FeatureExtractor | undefined;
  private state: EmbeddingModelState = 'not-installed';
  private error?: string;

  constructor(private readonly cacheDir: string) {}

  getStatus(): { state: EmbeddingModelState; modelId: string; dimensions: number; error?: string } {
    return { state: this.state, modelId: this.modelId, dimensions: this.dimensions, error: this.error };
  }

  async initialize(): Promise<void> {
    await this.load(false);
  }

  /** Explicit, user-triggered installation path. Never called during chat. */
  async install(): Promise<void> {
    await this.load(true);
  }

  private async load(allowRemoteModels: boolean): Promise<void> {
    if (this.extractor) return;
    if (this.state === 'loading') return;
    this.state = 'loading';
    try {
      const transformers = await import('@huggingface/transformers') as unknown as {
        env: { cacheDir?: string; localModelPath?: string; allowRemoteModels?: boolean; allowLocalModels?: boolean };
        pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<FeatureExtractor>;
      };
      transformers.env.cacheDir = this.cacheDir;
      transformers.env.localModelPath = this.cacheDir;
      transformers.env.allowLocalModels = true;
      transformers.env.allowRemoteModels = allowRemoteModels;
      this.extractor = await transformers.pipeline('feature-extraction', this.modelId, { dtype: 'q8' });
      this.state = 'ready';
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.state = 'not-installed';
      throw new Error(`${allowRemoteModels ? 'LOCAL_EMBEDDING_MODEL_INSTALL_FAILED' : 'LOCAL_EMBEDDING_MODEL_NOT_INSTALLED'}:${this.error}`);
    }
  }

  async embedQuery(text: string): Promise<Float32Array> {
    return (await this.embed(['query: ' + this.limit(text)]))[0];
  }

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    return this.embed(texts.map((text) => `passage: ${this.limit(text)}`));
  }

  async dispose(): Promise<void> {
    this.extractor = undefined;
    this.state = 'not-installed';
  }

  private async embed(texts: string[]): Promise<Float32Array[]> {
    await this.initialize();
    const result = await this.extractor!(texts, { pooling: 'mean', normalize: true }) as { data?: Float32Array | number[]; dims?: number[] };
    const data = result.data instanceof Float32Array ? result.data : new Float32Array(result.data ?? []);
    const width = result.dims?.at(-1) ?? this.dimensions;
    if (width !== this.dimensions || data.length % width !== 0) throw new Error('LOCAL_EMBEDDING_DIMENSION_MISMATCH');
    return Array.from({ length: data.length / width }, (_, index) => data.slice(index * width, (index + 1) * width));
  }

  private limit(value: string): string {
    return value.trim().slice(0, 2_000);
  }
}
