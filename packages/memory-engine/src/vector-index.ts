import { load as loadSqliteVec } from 'sqlite-vec';

export interface VectorSearchFilter {
  userId: string;
  companionId: string;
  memoryTypes?: string[];
  statuses?: string[];
}

export interface VectorSearchResult {
  memoryId: string;
  distance: number;
  semanticScore: number;
}

export interface VectorIndexHealth {
  available: boolean;
  extensionVersion?: string;
  dimensions: number;
  indexedCount: number;
  reason?: string;
}

export interface VectorIndex {
  initialize(): Promise<void>;
  upsert(input: { memoryId: string; embedding: Float32Array; modelId: string; modelVersion: number; contentHash?: string }): Promise<void>;
  remove(memoryId: string): Promise<void>;
  search(input: { queryEmbedding: Float32Array; filter: VectorSearchFilter; limit: number }): Promise<VectorSearchResult[]>;
  rebuild(): Promise<void>;
  healthCheck(): Promise<VectorIndexHealth>;
}

/** Minimal main-process database surface; renderers never receive this object. */
export interface ExtensionDatabase {
  exec(sql: string): void;
  prepare(sql: string): { run(...values: unknown[]): unknown; get(...values: unknown[]): unknown; all(...values: unknown[]): unknown[] };
  loadExtension(path: string, entrypoint?: string): void;
  enableLoadExtension(enabled: boolean): void;
}

function asVectorBlob(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
}

/**
 * All sqlite-vec SQL is deliberately isolated here. The mapping table keeps
 * authoritative memory text outside the disposable vector index.
 */
export class SqliteVecIndex implements VectorIndex {
  private available = false;
  private extensionVersion?: string;
  private failure?: string;

  constructor(private readonly db: ExtensionDatabase, readonly dimensions: number) {}

  async initialize(): Promise<void> {
    if (this.available || this.failure) return;
    try {
      this.db.enableLoadExtension(true);
      try {
        loadSqliteVec(this.db);
      } finally {
        // Keep extension loading disabled after our pinned extension is loaded.
        this.db.enableLoadExtension(false);
      }
      const version = this.db.prepare('SELECT vec_version() AS version').get() as { version?: unknown } | undefined;
      this.extensionVersion = typeof version?.version === 'string' ? version.version : undefined;
      this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec_index USING vec0(embedding float[${this.dimensions}])`);
      this.available = true;
    } catch (error) {
      this.failure = error instanceof Error ? error.message : String(error);
    }
  }

  async upsert(input: { memoryId: string; embedding: Float32Array; modelId: string; modelVersion: number; contentHash?: string }): Promise<void> {
    await this.initialize();
    if (!this.available) throw new Error(this.failure ?? 'VECTOR_INDEX_UNAVAILABLE');
    if (input.embedding.length !== this.dimensions) throw new Error(`VECTOR_DIMENSION_MISMATCH:${input.embedding.length}`);
    const row = this.db.prepare('SELECT vector_row_id FROM memory_embeddings WHERE memory_id = ?').get(input.memoryId) as { vector_row_id?: number } | undefined;
    if (row?.vector_row_id) {
      this.db.prepare('UPDATE memory_vec_index SET embedding = ? WHERE rowid = ?').run(asVectorBlob(input.embedding), row.vector_row_id);
      this.db.prepare(`UPDATE memory_embeddings SET embedding_model = ?, embedding_version = ?, dimensions = ?, content_hash = ?, status = 'ready', updated_at = datetime('now') WHERE memory_id = ?`)
        .run(input.modelId, input.modelVersion, this.dimensions, input.contentHash ?? '', input.memoryId);
      return;
    }
    const inserted = this.db.prepare('INSERT INTO memory_vec_index (embedding) VALUES (?)').run(asVectorBlob(input.embedding)) as { lastInsertRowid?: number | bigint };
    const vectorRowId = Number(inserted.lastInsertRowid);
    this.db.prepare(`INSERT INTO memory_embeddings (memory_id, vector_row_id, embedding_model, embedding_version, dimensions, content_hash, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'ready', datetime('now'), datetime('now'))
      ON CONFLICT(memory_id) DO UPDATE SET vector_row_id = excluded.vector_row_id, embedding_model = excluded.embedding_model, embedding_version = excluded.embedding_version, dimensions = excluded.dimensions, content_hash = excluded.content_hash, status = 'ready', updated_at = excluded.updated_at`)
      .run(input.memoryId, vectorRowId, input.modelId, input.modelVersion, this.dimensions, input.contentHash ?? '');
  }

  async remove(memoryId: string): Promise<void> {
    await this.initialize();
    const row = this.db.prepare('SELECT vector_row_id FROM memory_embeddings WHERE memory_id = ?').get(memoryId) as { vector_row_id?: number } | undefined;
    if (this.available && row?.vector_row_id) this.db.prepare('DELETE FROM memory_vec_index WHERE rowid = ?').run(row.vector_row_id);
    this.db.prepare("UPDATE memory_embeddings SET status = 'stale', updated_at = datetime('now') WHERE memory_id = ?").run(memoryId);
  }

  async search(input: { queryEmbedding: Float32Array; filter: VectorSearchFilter; limit: number }): Promise<VectorSearchResult[]> {
    await this.initialize();
    if (!this.available || input.queryEmbedding.length !== this.dimensions) return [];
    const rows = this.db.prepare(`SELECT embeddings.memory_id, nearest.distance
      FROM memory_vec_index nearest
      JOIN memory_embeddings embeddings ON embeddings.vector_row_id = nearest.rowid
      JOIN memory_nodes memories ON memories.id = embeddings.memory_id
      WHERE nearest.embedding MATCH ? AND k = ?
        AND embeddings.status = 'ready' AND memories.user_id = ? AND memories.companion_id = ?
        AND COALESCE(memories.memory_status, 'active') = 'active' AND memories.is_marked_wrong = 0`)
      .all(asVectorBlob(input.queryEmbedding), Math.max(1, input.limit), input.filter.userId, input.filter.companionId) as Array<{ memory_id: unknown; distance: unknown }>;
    return rows.map((row) => {
      const distance = Number(row.distance);
      return { memoryId: String(row.memory_id), distance, semanticScore: Math.max(0, 1 - distance) };
    });
  }

  async rebuild(): Promise<void> {
    await this.initialize();
    if (!this.available) return;
    this.db.exec('DELETE FROM memory_vec_index');
    this.db.exec("UPDATE memory_embeddings SET status = 'stale', vector_row_id = NULL, updated_at = datetime('now')");
  }

  async healthCheck(): Promise<VectorIndexHealth> {
    await this.initialize();
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM memory_embeddings WHERE status = 'ready'").get() as { count?: unknown } | undefined;
    return { available: this.available, extensionVersion: this.extensionVersion, dimensions: this.dimensions, indexedCount: Number(row?.count ?? 0), reason: this.failure };
  }
}
