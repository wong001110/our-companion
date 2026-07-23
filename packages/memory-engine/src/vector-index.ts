import { load as loadSqliteVec } from 'sqlite-vec';

export interface VectorSearchFilter {
  userId: string;
  companionId: string;
  memoryTypes?: string[];
  statuses?: string[];
}

export interface VectorSearchResult { memoryId: string; distance: number; semanticScore: number; }
export interface VectorIndexHealth {
  available: boolean; extensionVersion?: string; dimensions: number; indexedCount: number;
  readyMappingCount: number; staleMappingCount: number; orphanCount: number; distanceMetric: 'cosine'; reason?: string;
}
export interface VectorIndex {
  initialize(): Promise<void>;
  upsert(input: VectorUpsertInput): Promise<void>;
  remove(memoryId: string): Promise<void>;
  removeForDeletion(memoryId: string): void;
  search(input: { queryEmbedding: Float32Array; filter: VectorSearchFilter; limit: number }): Promise<VectorSearchResult[]>;
  rebuild(): Promise<void>;
  healthCheck(): Promise<VectorIndexHealth>;
}
export interface VectorUpsertInput {
  memoryId: string; embedding: Float32Array; modelId: string; modelVersion: number; contentHash?: string;
  userId?: string; companionId?: string; memoryType?: string; memoryStatus?: string;
}
export interface ExtensionDatabase {
  exec(sql: string): void;
  prepare(sql: string): { run(...values: unknown[]): unknown; get(...values: unknown[]): unknown; all(...values: unknown[]): unknown[] };
  loadExtension(path: string, entrypoint?: string): void;
  enableLoadExtension(enabled: boolean): void;
}

export function cosineDistanceToSimilarity(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance));
}
function asVectorBlob(vector: Float32Array): Uint8Array { return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength); }

/** sqlite-vec SQL lives here; the vector table is disposable derived state. */
export class SqliteVecIndex implements VectorIndex {
  private available = false;
  private extensionVersion?: string;
  private failure?: string;

  constructor(private readonly db: ExtensionDatabase, readonly dimensions: number) {}

  async initialize(): Promise<void> {
    if (this.available || this.failure) return;
    try {
      this.db.enableLoadExtension(true);
      try { loadSqliteVec(this.db); } finally { this.db.enableLoadExtension(false); }
      const version = this.db.prepare('SELECT vec_version() AS version').get() as { version?: unknown } | undefined;
      this.extensionVersion = typeof version?.version === 'string' ? version.version : undefined;
      const existing = this.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'memory_vec_index'").get() as { sql?: string } | undefined;
      // v1 stored only a vector; v2 uses scoped partition keys so foreign nearest
      // neighbours cannot starve the current companion's KNN result.
      if (existing?.sql && !/partition key/i.test(String(existing.sql))) {
        this.db.exec('DROP TABLE memory_vec_index');
        this.db.exec("UPDATE memory_embeddings SET status = 'stale', vector_row_id = NULL, updated_at = datetime('now')");
      }
      this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec_index USING vec0(
        embedding float[${this.dimensions}] distance_metric=cosine,
        user_id text partition key,
        companion_id text partition key,
        +memory_id text,
        +memory_type text,
        +memory_status text
      )`);
      this.available = true;
    } catch (error) { this.failure = error instanceof Error ? error.message : String(error); }
  }

  async upsert(input: VectorUpsertInput): Promise<void> {
    await this.initialize();
    if (!this.available) throw new Error(this.failure ?? 'VECTOR_INDEX_UNAVAILABLE');
    if (input.embedding.length !== this.dimensions) throw new Error(`VECTOR_DIMENSION_MISMATCH:${input.embedding.length}`);
    const mapping = this.db.prepare('SELECT vector_row_id FROM memory_embeddings WHERE memory_id = ?').get(input.memoryId) as { vector_row_id?: number | null } | undefined;
    const rowId = Number(mapping?.vector_row_id ?? 0);
    let storedRowId = rowId;
    if (rowId) {
      const updated = this.db.prepare(`UPDATE memory_vec_index SET embedding = ?, user_id = ?, companion_id = ?, memory_id = ?, memory_type = ?, memory_status = ? WHERE rowid = ?`)
        .run(asVectorBlob(input.embedding), input.userId ?? 'local', input.companionId ?? '', input.memoryId, input.memoryType ?? '', input.memoryStatus ?? 'active', rowId) as { changes?: number | bigint };
      if (Number(updated.changes ?? 0) === 0) storedRowId = 0;
    }
    if (!storedRowId) {
      const inserted = this.db.prepare(`INSERT INTO memory_vec_index (embedding, user_id, companion_id, memory_id, memory_type, memory_status)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(asVectorBlob(input.embedding), input.userId ?? 'local', input.companionId ?? '', input.memoryId, input.memoryType ?? '', input.memoryStatus ?? 'active') as { lastInsertRowid?: number | bigint };
      storedRowId = Number(inserted.lastInsertRowid);
      if (!storedRowId) throw new Error('VECTOR_ROW_INSERT_FAILED');
    }
    const confirmed = this.db.prepare('SELECT rowid FROM memory_vec_index WHERE rowid = ?').get(storedRowId) as { rowid?: unknown } | undefined;
    if (!confirmed?.rowid) throw new Error('VECTOR_ROW_CONFIRMATION_FAILED');
    this.db.prepare(`INSERT INTO memory_embeddings (memory_id, vector_row_id, embedding_model, embedding_version, dimensions, content_hash, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'ready', datetime('now'), datetime('now'))
      ON CONFLICT(memory_id) DO UPDATE SET vector_row_id = excluded.vector_row_id, embedding_model = excluded.embedding_model, embedding_version = excluded.embedding_version, dimensions = excluded.dimensions, content_hash = excluded.content_hash, status = 'ready', updated_at = excluded.updated_at`)
      .run(input.memoryId, storedRowId, input.modelId, input.modelVersion, this.dimensions, input.contentHash ?? '');
  }

  async remove(memoryId: string): Promise<void> { await this.initialize(); this.removeInternal(memoryId, false); }
  removeForDeletion(memoryId: string): void { if (this.available) this.removeInternal(memoryId, true); }
  private removeInternal(memoryId: string, deleting: boolean): void {
    const row = this.db.prepare('SELECT vector_row_id FROM memory_embeddings WHERE memory_id = ?').get(memoryId) as { vector_row_id?: number | null } | undefined;
    if (row?.vector_row_id) this.db.prepare('DELETE FROM memory_vec_index WHERE rowid = ?').run(row.vector_row_id);
    this.db.prepare(`UPDATE memory_embeddings SET vector_row_id = NULL, status = ?, updated_at = datetime('now') WHERE memory_id = ?`)
      .run(deleting ? 'deleted' : 'stale', memoryId);
  }

  async search(input: { queryEmbedding: Float32Array; filter: VectorSearchFilter; limit: number }): Promise<VectorSearchResult[]> {
    await this.initialize();
    if (!this.available || input.queryEmbedding.length !== this.dimensions) return [];
    const typeFilter = input.filter.memoryTypes?.length ? ` AND nearest.memory_type IN (${input.filter.memoryTypes.map(() => '?').join(',')})` : '';
    const statusFilter = input.filter.statuses?.length ? ` AND nearest.memory_status IN (${input.filter.statuses.map(() => '?').join(',')})` : '';
    const rows = this.db.prepare(`SELECT embeddings.memory_id, nearest.distance
      FROM memory_vec_index nearest JOIN memory_embeddings embeddings ON embeddings.vector_row_id = nearest.rowid
      JOIN memory_nodes memories ON memories.id = embeddings.memory_id
      WHERE nearest.embedding MATCH ? AND k = ? AND nearest.user_id = ? AND nearest.companion_id = ?${typeFilter}${statusFilter}
        AND embeddings.status = 'ready' AND memories.user_id = ? AND memories.companion_id = ?
        AND COALESCE(memories.memory_status, 'active') = 'active' AND memories.is_marked_wrong = 0`)
      .all(asVectorBlob(input.queryEmbedding), Math.max(1, input.limit), input.filter.userId, input.filter.companionId,
        ...(input.filter.memoryTypes ?? []), ...(input.filter.statuses ?? []), input.filter.userId, input.filter.companionId) as Array<{ memory_id: unknown; distance: unknown }>;
    return rows.map((row) => ({ memoryId: String(row.memory_id), distance: Number(row.distance), semanticScore: cosineDistanceToSimilarity(Number(row.distance)) }));
  }

  async rebuild(): Promise<void> { await this.initialize(); if (!this.available) return; this.db.exec('DELETE FROM memory_vec_index'); this.db.exec("UPDATE memory_embeddings SET status = 'stale', vector_row_id = NULL, updated_at = datetime('now')"); }
  async healthCheck(): Promise<VectorIndexHealth> {
    await this.initialize();
    const mappings = this.db.prepare("SELECT COUNT(*) AS count FROM memory_embeddings WHERE status = 'ready' AND vector_row_id IS NOT NULL").get() as { count?: unknown } | undefined;
    const actual: { count?: unknown } = this.available ? (this.db.prepare(`SELECT COUNT(*) AS count FROM memory_embeddings e JOIN memory_vec_index v ON v.rowid = e.vector_row_id WHERE e.status = 'ready'`).get() as { count?: unknown } | undefined) ?? {} : { count: 0 };
    const stale = this.db.prepare("SELECT COUNT(*) AS count FROM memory_embeddings WHERE status <> 'ready' OR vector_row_id IS NULL").get() as { count?: unknown } | undefined;
    return { available: this.available, extensionVersion: this.extensionVersion, dimensions: this.dimensions, distanceMetric: 'cosine', indexedCount: Number(actual.count ?? 0), readyMappingCount: Number(mappings?.count ?? 0), staleMappingCount: Number(stale?.count ?? 0), orphanCount: Math.max(0, Number(mappings?.count ?? 0) - Number(actual.count ?? 0)), reason: this.failure };
  }
}
