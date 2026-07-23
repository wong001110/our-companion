import { load as loadSqliteVec } from 'sqlite-vec';

export interface VectorSearchFilter {
  userId: string;
  companionId: string;
  memoryTypes?: string[];
  statuses?: string[];
}

export interface VectorSearchResult { memoryId: string; distance: number; semanticScore: number; }
export interface VectorRepairResult { vectorOnlyDeleted: number; mappingOnlyMarkedStale: number; invalidMappingsMarkedStale: number; }
export interface VectorIndexHealth {
  available: boolean; extensionVersion?: string; dimensions: number; indexedCount: number;
  readyMappingCount: number; staleMappingCount: number; orphanCount: number; distanceMetric: 'cosine'; reason?: string;
  actualVectorCount: number; mappingWithoutVectorCount: number; vectorWithoutMappingCount: number;
  deletedMappingCount: number; schemaVersion: number; filterableMetadataFields: string[];
  validIndexedCount: number; activeAuthoritativeMemoryCount: number; eligibleAuthoritativeMemoryCount: number;
}
export interface VectorIndex {
  initialize(): Promise<void>;
  upsert(input: VectorUpsertInput): Promise<void>;
  remove(memoryId: string): Promise<void>;
  removeForDeletion(memoryId: string): void;
  search(input: { queryEmbedding: Float32Array; filter: VectorSearchFilter; limit: number }): Promise<VectorSearchResult[]>;
  rebuild(): Promise<void>;
  healthCheck(): Promise<VectorIndexHealth>;
  repairDerivedState(): Promise<VectorRepairResult>;
  beginShutdown(): void;
  stopAndWait(timeoutMs: number): Promise<{ settled: boolean }>;
  detach(): void;
}
export type VectorIndexLifecycle = 'active' | 'stopping' | 'stopped' | 'detached';
export interface VectorUpsertInput {
  memoryId: string; embedding: Float32Array; modelId: string; modelVersion: number; contentHash?: string;
  userId?: string; companionId?: string; memoryType?: string; memoryStatus?: string;
  sourceRevision?: number;
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
  static readonly schemaVersion = 3;
  private available = false;
  private extensionVersion?: string;
  private failure?: string;
  private mutationTail: Promise<void> = Promise.resolve();
  private initializationPromise?: Promise<void>;
  private lifecycle: VectorIndexLifecycle = 'active';

  constructor(private readonly db: ExtensionDatabase, readonly dimensions: number) {}

  async initialize(): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;
    const operation = this.initializeInternal();
    this.initializationPromise = operation.finally(() => { this.initializationPromise = undefined; });
    return this.initializationPromise;
  }
  private async initializeInternal(): Promise<void> {
    this.assertActive();
    if (this.available || this.failure) return;
    try {
      this.db.enableLoadExtension(true);
      try { loadSqliteVec(this.db); } finally { this.db.enableLoadExtension(false); }
      const version = this.db.prepare('SELECT vec_version() AS version').get() as { version?: unknown } | undefined;
      this.extensionVersion = typeof version?.version === 'string' ? version.version : undefined;
      const existing = this.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'memory_vec_index'").get() as { sql?: string } | undefined;
      // v3 makes status/type real vec0 metadata (rather than auxiliary values)
      // so KNN applies them before selecting its k nearest scoped candidates.
      if (existing?.sql && (!/user_id\s+text\s+partition key/i.test(String(existing.sql))
        || /\+memory_type|\+memory_status/i.test(String(existing.sql)))) {
        this.db.exec('DROP TABLE memory_vec_index');
        this.db.exec("UPDATE memory_embeddings SET status = 'stale', vector_row_id = NULL, updated_at = datetime('now')");
      }
      this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec_index USING vec0(
        embedding float[${this.dimensions}] distance_metric=cosine,
        user_id text partition key,
        companion_id text partition key,
        +memory_id text,
        memory_type text,
        memory_status text
      )`);
      this.db.prepare(`INSERT INTO app_settings (key, value_json, updated_at) VALUES ('memory.vector_index_schema_version', ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`)
        .run(JSON.stringify(SqliteVecIndex.schemaVersion));
      this.available = true;
    } catch (error) { this.failure = error instanceof Error ? error.message : String(error); }
  }

  async upsert(input: VectorUpsertInput): Promise<void> {
    this.assertActive();
    await this.initialize();
    if (!this.available) throw new Error(this.failure ?? 'VECTOR_INDEX_UNAVAILABLE');
    if (input.embedding.length !== this.dimensions) throw new Error(`VECTOR_DIMENSION_MISMATCH:${input.embedding.length}`);
    return this.serializeMutation(() => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        if (input.sourceRevision !== undefined) {
          const current = this.db.prepare(`SELECT 1 FROM memory_nodes n JOIN memory_processing_state p ON p.memory_id = n.id
            WHERE n.id = ? AND n.memory_status = 'active' AND n.is_marked_wrong = 0
              AND p.deleted_at IS NULL AND p.revision = ? AND p.content_hash = ?`)
            .get(input.memoryId, input.sourceRevision, input.contentHash ?? '');
          if (!current) throw new Error('MEMORY_REVISION_STALE');
        }
        const mapping = this.db.prepare('SELECT vector_row_id FROM memory_embeddings WHERE memory_id = ?').get(input.memoryId) as { vector_row_id?: number | null } | undefined;
        // sqlite-vec partition keys are immutable. Replacing the row works for
        // both ordinary re-embeds and a user/Companion scope transition, and
        // remains atomic with the authoritative mapping update.
        if (mapping?.vector_row_id) this.db.prepare('DELETE FROM memory_vec_index WHERE rowid = ?').run(mapping.vector_row_id);
        const inserted = this.db.prepare(`INSERT INTO memory_vec_index (embedding, user_id, companion_id, memory_id, memory_type, memory_status)
          VALUES (?, ?, ?, ?, ?, ?)`)
          .run(asVectorBlob(input.embedding), input.userId ?? 'local', input.companionId ?? '', input.memoryId, input.memoryType ?? '', input.memoryStatus ?? 'active') as { lastInsertRowid?: number | bigint };
        const storedRowId = Number(inserted.lastInsertRowid);
        if (!storedRowId) throw new Error('VECTOR_ROW_INSERT_FAILED');
        const confirmed = this.db.prepare('SELECT rowid FROM memory_vec_index WHERE rowid = ?').get(storedRowId) as { rowid?: unknown } | undefined;
        if (!confirmed?.rowid) throw new Error('VECTOR_ROW_CONFIRMATION_FAILED');
        this.db.prepare(`INSERT INTO memory_embeddings (memory_id, vector_row_id, embedding_model, embedding_version, dimensions, content_hash, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'ready', datetime('now'), datetime('now'))
          ON CONFLICT(memory_id) DO UPDATE SET vector_row_id = excluded.vector_row_id, embedding_model = excluded.embedding_model, embedding_version = excluded.embedding_version, dimensions = excluded.dimensions, content_hash = excluded.content_hash, status = 'ready', updated_at = excluded.updated_at`)
          .run(input.memoryId, storedRowId, input.modelId, input.modelVersion, this.dimensions, input.contentHash ?? '');
        this.db.exec('COMMIT');
      } catch (error) {
        try { this.db.exec('ROLLBACK'); } catch { /* transaction was not opened */ }
        throw error;
      }
    });
  }

  async remove(memoryId: string): Promise<void> { this.assertActive(); await this.initialize(); return this.serializeMutation(() => this.removeInternal(memoryId, false)); }
  removeForDeletion(memoryId: string): void { if (this.lifecycle === 'active' && this.available) this.removeInternal(memoryId, true); }
  private removeInternal(memoryId: string, deleting: boolean): void {
    const row = this.db.prepare('SELECT vector_row_id FROM memory_embeddings WHERE memory_id = ?').get(memoryId) as { vector_row_id?: number | null } | undefined;
    if (row?.vector_row_id) this.db.prepare('DELETE FROM memory_vec_index WHERE rowid = ?').run(row.vector_row_id);
    this.db.prepare(`UPDATE memory_embeddings SET vector_row_id = NULL, status = ?, updated_at = datetime('now') WHERE memory_id = ?`)
      .run(deleting ? 'deleted' : 'stale', memoryId);
  }

  async search(input: { queryEmbedding: Float32Array; filter: VectorSearchFilter; limit: number }): Promise<VectorSearchResult[]> {
    if (this.lifecycle !== 'active') return [];
    await this.initialize();
    if (!this.available || input.queryEmbedding.length !== this.dimensions) return [];
    const types = input.filter.memoryTypes ?? [];
    const statuses = input.filter.statuses?.length ? input.filter.statuses : ['active'];
    const typeFilter = types.length ? ` AND nearest.memory_type IN (${types.map(() => '?').join(',')})` : '';
    const statusFilter = ` AND nearest.memory_status IN (${statuses.map(() => '?').join(',')})`;
    const rows = this.db.prepare(`SELECT embeddings.memory_id, nearest.distance
      FROM memory_vec_index nearest JOIN memory_embeddings embeddings ON embeddings.vector_row_id = nearest.rowid
      JOIN memory_nodes memories ON memories.id = embeddings.memory_id
      WHERE nearest.embedding MATCH ? AND k = ? AND nearest.user_id = ? AND nearest.companion_id = ?${typeFilter}${statusFilter}
        AND embeddings.status = 'ready' AND memories.user_id = ? AND memories.companion_id = ?
        AND COALESCE(memories.memory_status, 'active') = nearest.memory_status AND memories.is_marked_wrong = 0`)
      .all(asVectorBlob(input.queryEmbedding), Math.max(1, input.limit), input.filter.userId, input.filter.companionId,
        ...types, ...statuses, input.filter.userId, input.filter.companionId) as Array<{ memory_id: unknown; distance: unknown }>;
    return rows.map((row) => ({ memoryId: String(row.memory_id), distance: Number(row.distance), semanticScore: cosineDistanceToSimilarity(Number(row.distance)) }));
  }

  async rebuild(): Promise<void> { this.assertActive(); await this.initialize(); if (!this.available) return; return this.serializeMutation(() => { this.db.exec('BEGIN IMMEDIATE'); try { this.db.exec('DELETE FROM memory_vec_index'); this.db.exec("UPDATE memory_embeddings SET status = 'stale', vector_row_id = NULL, updated_at = datetime('now')"); this.db.exec('COMMIT'); } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; } }); }
  async healthCheck(): Promise<VectorIndexHealth> {
    if (this.lifecycle === 'detached') return this.detachedHealth();
    await this.initialize();
    const mappings = this.db.prepare("SELECT COUNT(*) AS count FROM memory_embeddings WHERE status = 'ready' AND vector_row_id IS NOT NULL").get() as { count?: unknown } | undefined;
    const actual: { count?: unknown } = this.available ? (this.db.prepare('SELECT COUNT(*) AS count FROM memory_vec_index').get() as { count?: unknown } | undefined) ?? {} : { count: 0 };
    const valid = this.available ? (this.db.prepare(`SELECT COUNT(*) AS count FROM memory_embeddings e
      JOIN memory_vec_index v ON v.rowid = e.vector_row_id
      JOIN memory_nodes n ON n.id = e.memory_id
      WHERE e.status = 'ready' AND n.memory_status = 'active' AND n.is_marked_wrong = 0
        AND n.user_id = v.user_id AND n.companion_id = v.companion_id
        AND COALESCE(n.memory_type, '') = v.memory_type AND COALESCE(n.memory_status, 'active') = v.memory_status`).get() as { count?: unknown } | undefined) ?? {} : { count: 0 };
    const missing = this.available ? (this.db.prepare(`SELECT COUNT(*) AS count FROM memory_embeddings e LEFT JOIN memory_vec_index v ON v.rowid = e.vector_row_id WHERE e.status = 'ready' AND (e.vector_row_id IS NULL OR v.rowid IS NULL)`).get() as { count?: unknown } | undefined) : { count: 0 };
    const vectorOnly = this.available ? (this.db.prepare(`SELECT COUNT(*) AS count FROM memory_vec_index v LEFT JOIN memory_embeddings e ON e.vector_row_id = v.rowid WHERE e.memory_id IS NULL`).get() as { count?: unknown } | undefined) : { count: 0 };
    const stale = this.db.prepare("SELECT COUNT(*) AS count FROM memory_embeddings WHERE status <> 'ready' OR vector_row_id IS NULL").get() as { count?: unknown } | undefined;
    const deleted = this.db.prepare("SELECT COUNT(*) AS count FROM memory_embeddings WHERE status = 'deleted'").get() as { count?: unknown } | undefined;
    const active = this.db.prepare("SELECT COUNT(*) AS count FROM memory_nodes WHERE memory_status = 'active' AND is_marked_wrong = 0").get() as { count?: unknown } | undefined;
    const eligible = this.db.prepare("SELECT COUNT(*) AS count FROM memory_nodes WHERE memory_status = 'active' AND is_marked_wrong = 0 AND memory_type IN ('user_preference', 'user_fact', 'user_boundary', 'goal', 'shared_experience', 'relationship_memory', 'conversation_episode')").get() as { count?: unknown } | undefined;
    return { available: this.available, extensionVersion: this.extensionVersion, dimensions: this.dimensions, distanceMetric: 'cosine', indexedCount: Number(valid.count ?? 0), validIndexedCount: Number(valid.count ?? 0), actualVectorCount: Number(actual.count ?? 0), activeAuthoritativeMemoryCount: Number(active?.count ?? 0), eligibleAuthoritativeMemoryCount: Number(eligible?.count ?? 0), readyMappingCount: Number(mappings?.count ?? 0), staleMappingCount: Number(stale?.count ?? 0), deletedMappingCount: Number(deleted?.count ?? 0), mappingWithoutVectorCount: Number(missing?.count ?? 0), vectorWithoutMappingCount: Number(vectorOnly?.count ?? 0), orphanCount: Number(missing?.count ?? 0) + Number(vectorOnly?.count ?? 0), schemaVersion: SqliteVecIndex.schemaVersion, filterableMetadataFields: ['user_id', 'companion_id', 'memory_type', 'memory_status'], reason: this.failure };
  }

  async repairDerivedState(): Promise<VectorRepairResult> {
    this.assertActive();
    await this.initialize();
    if (!this.available) return { vectorOnlyDeleted: 0, mappingOnlyMarkedStale: 0, invalidMappingsMarkedStale: 0 };
    return this.serializeMutation(() => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const vectorOnly = this.db.prepare('DELETE FROM memory_vec_index WHERE rowid IN (SELECT v.rowid FROM memory_vec_index v LEFT JOIN memory_embeddings e ON e.vector_row_id = v.rowid WHERE e.memory_id IS NULL)').run() as { changes?: number | bigint };
        const invalid = this.db.prepare(`UPDATE memory_embeddings SET status = 'stale', vector_row_id = NULL, updated_at = datetime('now')
          WHERE status = 'ready' AND (vector_row_id IS NULL OR NOT EXISTS (SELECT 1 FROM memory_vec_index v WHERE v.rowid = memory_embeddings.vector_row_id))`).run() as { changes?: number | bigint };
        this.db.exec('COMMIT');
        return { vectorOnlyDeleted: Number(vectorOnly.changes ?? 0), mappingOnlyMarkedStale: Number(invalid.changes ?? 0), invalidMappingsMarkedStale: Number(invalid.changes ?? 0) };
      } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
    });
  }

  private serializeMutation<T>(work: () => T): Promise<T> {
    this.assertActive();
    const guarded = () => { this.assertActive(); return work(); };
    const next = this.mutationTail.then(guarded, guarded);
    this.mutationTail = next.then(() => undefined, () => undefined);
    return next;
  }

  beginShutdown(): void { if (this.lifecycle === 'active') this.lifecycle = 'stopping'; }
  async stopAndWait(timeoutMs: number): Promise<{ settled: boolean }> {
    this.beginShutdown();
    const settled = await Promise.race([
      Promise.all([
        this.mutationTail.then(() => undefined, () => undefined),
        this.initializationPromise?.then(() => undefined, () => undefined) ?? Promise.resolve(),
      ]).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), Math.max(0, timeoutMs))),
    ]);
    if (settled && this.lifecycle === 'stopping') this.lifecycle = 'stopped';
    return { settled };
  }
  detach(): void { this.lifecycle = 'detached'; }
  private assertActive(): void { if (this.lifecycle !== 'active') throw new Error('VECTOR_INDEX_STOPPING'); }
  private detachedHealth(): VectorIndexHealth {
    return { available: false, dimensions: this.dimensions, indexedCount: 0, readyMappingCount: 0, staleMappingCount: 0, orphanCount: 0, distanceMetric: 'cosine', actualVectorCount: 0, mappingWithoutVectorCount: 0, vectorWithoutMappingCount: 0, deletedMappingCount: 0, schemaVersion: SqliteVecIndex.schemaVersion, filterableMetadataFields: ['user_id', 'companion_id', 'memory_type', 'memory_status'], validIndexedCount: 0, activeAuthoritativeMemoryCount: 0, eligibleAuthoritativeMemoryCount: 0, reason: 'VECTOR_INDEX_DETACHED' };
  }
}
