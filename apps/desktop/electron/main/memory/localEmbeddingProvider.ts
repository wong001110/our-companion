import { existsSync } from 'node:fs';
import path from 'node:path';

export interface EmbeddingProvider {
  readonly modelId: string;
  readonly version: number;
  readonly dimensions: number;
  initialize(): Promise<void>;
  embedQuery(text: string): Promise<Float32Array>;
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
  dispose(): Promise<void>;
}

export type EmbeddingModelState = 'not-installed' | 'installing' | 'loading' | 'ready' | 'error';
type FeatureExtractor = (text: string | string[], options?: Record<string, unknown>) => Promise<unknown>;
export const EMBEDDING_TEXT_POLICY = {
  maxTokens: 512,
  queryPrefix: 'query: ',
  documentPrefix: 'passage: ',
  pooling: 'mean' as const,
  normalize: true,
};

/**
 * Local-only ONNX/WASM embedding runtime. It intentionally disables remote
 * model access during ordinary chat; installation is an explicit future UI/CLI
 * action that can temporarily enable it.
 */
export class LocalMultilingualEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = 'Xenova/multilingual-e5-small';
  // Text policy is part of the pipeline interpretation; bumping this triggers
  // a safe re-index by the database's model/version comparison.
  readonly version = 2;
  readonly dimensions = 384;
  private extractor: FeatureExtractor | undefined;
  private state: EmbeddingModelState = 'not-installed';
  private error?: string;
  private initializePromise?: Promise<void>;

  constructor(private readonly cacheDir: string) {}

  getStatus(): { state: EmbeddingModelState; modelId: string; dimensions: number; textPolicy: typeof EMBEDDING_TEXT_POLICY; runtimeReady: boolean; offlineVerified: boolean; manifestValid: boolean; cachePath: string; error?: string } {
    // Runtime readiness proves only this process loaded a model. Packaged,
    // network-blocked verification is recorded separately when that harness is
    // available; never infer it from an ordinary initialization.
    return { state: this.state, modelId: this.modelId, dimensions: this.dimensions, textPolicy: EMBEDDING_TEXT_POLICY, runtimeReady: this.state === 'ready', offlineVerified: false, manifestValid: false, cachePath: this.cacheDir, error: this.error };
  }

  async initialize(): Promise<void> {
    if (this.extractor) return;
    this.initializePromise ??= this.loadInternal(false).finally(() => { this.initializePromise = undefined; });
    return this.initializePromise;
  }

  /** Explicit, user-triggered installation path. Never called during chat. */
  async install(): Promise<void> {
    if (this.extractor) return;
    this.initializePromise ??= this.loadInternal(true).finally(() => { this.initializePromise = undefined; });
    return this.initializePromise;
  }

  private async loadInternal(allowRemoteModels: boolean): Promise<void> {
    if (this.extractor) return;
    this.state = allowRemoteModels ? 'installing' : 'loading';
    let transformers: {
      env: { cacheDir?: string; localModelPath?: string; allowRemoteModels?: boolean; allowLocalModels?: boolean; backends?: { onnx?: { wasm?: { wasmPaths?: string } } } };
      pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<FeatureExtractor>;
    } | undefined;
    try {
      // Ordinary chat must fail closed before importing the heavyweight runtime
      // when its local model files are absent or incomplete. Besides preventing
      // a remote fetch, this keeps memory capture/retrieval workers lightweight
      // on a first-run installation.
      if (!allowRemoteModels && !this.hasCompleteLocalModel()) {
        throw new Error('LOCAL_E5_CACHE_INCOMPLETE');
      }
      // Keep the optional, heavyweight runtime out of the Vite/Vitest module
      // graph. Electron's Node runtime resolves it only after the local cache
      // has been verified (or during the explicit installation command).
      const runtime = await import(/* @vite-ignore */ '@huggingface/transformers') as unknown as NonNullable<typeof transformers>;
      transformers = runtime;
      runtime.env.cacheDir = this.cacheDir;
      runtime.env.localModelPath = this.cacheDir;
      runtime.env.allowLocalModels = true;
      runtime.env.allowRemoteModels = allowRemoteModels;
      this.extractor = await runtime.pipeline('feature-extraction', this.modelId, { dtype: 'q8' });
      this.state = 'ready';
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.state = allowRemoteModels ? 'error' : 'not-installed';
      throw new Error(`${allowRemoteModels ? 'LOCAL_EMBEDDING_MODEL_INSTALL_FAILED' : 'LOCAL_EMBEDDING_MODEL_NOT_INSTALLED'}:${this.error}`);
    } finally {
      // A deliberate install must not leave ordinary chat able to contact the network.
      try {
        if (transformers) {
        transformers.env.allowRemoteModels = false;
        }
      } catch { /* the original load error is more useful */ }
    }
  }

  async embedQuery(text: string): Promise<Float32Array> {
    return (await this.embed([EMBEDDING_TEXT_POLICY.queryPrefix + this.limit(text)]))[0];
  }

  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    return this.embed(texts.map((text) => EMBEDDING_TEXT_POLICY.documentPrefix + this.limit(text)));
  }

  async dispose(): Promise<void> {
    this.extractor = undefined;
    this.state = 'not-installed';
  }

  private async embed(texts: string[]): Promise<Float32Array[]> {
    await this.initialize();
    const result = await this.extractor!(texts, { pooling: EMBEDDING_TEXT_POLICY.pooling, normalize: EMBEDDING_TEXT_POLICY.normalize, truncation: true, max_length: EMBEDDING_TEXT_POLICY.maxTokens }) as { data?: Float32Array | number[]; dims?: number[] };
    const data = result.data instanceof Float32Array ? result.data : new Float32Array(result.data ?? []);
    const width = result.dims?.at(-1) ?? this.dimensions;
    if (width !== this.dimensions || data.length % width !== 0) throw new Error('LOCAL_EMBEDDING_DIMENSION_MISMATCH');
    return Array.from({ length: data.length / width }, (_, index) => data.slice(index * width, (index + 1) * width));
  }

  private limit(value: string): string {
    // The model pipeline owns tokenization. Preserve the prefix above and use
    // its max_length/truncation options instead of a character-count cutoff.
    return value.trim();
  }

  private hasCompleteLocalModel(): boolean {
    const modelRoot = path.join(this.cacheDir, ...this.modelId.split('/'));
    return [
      path.join(modelRoot, 'config.json'),
      path.join(modelRoot, 'tokenizer.json'),
      path.join(modelRoot, 'onnx', 'model_quantized.onnx'),
    ].every(existsSync);
  }
}
