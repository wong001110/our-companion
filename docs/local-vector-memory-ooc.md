# Local vector memory and OOC guard

SQLite `memory_nodes` remains authoritative. `memory_embeddings`, `embedding_jobs`, and the `sqlite-vec` virtual table are derived state; deleting or rebuilding them does not delete a memory.

The main process loads `sqlite-vec` 0.1.9 behind `SqliteVecIndex`. It maps vector row IDs back to authoritative memory IDs and joins scope, active-status, and legacy correction filters before returning a result. A Unicode FTS5 index and structured/recency ranking remain available when either the extension or model is unavailable.

Embeddings use `Xenova/multilingual-e5-small` (384 dimensions, mean pooling, normalized vectors, `query:`/`passage:` prefixes) through Transformers.js ONNX/WASM. The model is Apache-2.0 and is never downloaded during chat: remote model access is disabled and the cache lives under the application's `userData/models` directory. In Developer use → Engine Observatory → Local memory diagnostics, **Install local model** is the explicit controlled download action. Missing model files leave chat on its structured + FTS fallback.

Memory writes update FTS and queue an embedding job but never fail because embedding fails. Jobs recover from `processing` on startup; failed jobs are durable. The development diagnostics IPC exposes vector health, model readiness, jobs, retrieval trace, and OOC decision through `window.ourCompanion.debug`.

Prompt order is safety/privacy, immutable character contract, knowledge/disclosure boundaries, scene, active contextual records, history, then current input. The deterministic OOC guard runs after draft generation. Identity, prompt/tool leakage, scope/status, and privacy-class violations fall back immediately; it records rule IDs and selected memory IDs, never hidden reasoning.

Vector rebuild is available through `window.ourCompanion.debug.rebuildMemoryVectors()` in a development build. It clears only the virtual index, queues every eligible active memory, and processes the local queue.

## Stabilization notes

The vector schema now uses cosine distance and `user_id` + `companion_id` vec0 partition keys, preventing other companions' nearest vectors from starving the current search. The mapping is confirmed before it becomes `ready`; removal clears the vec0 row and row ID, and authoritative memory deletion synchronously removes vector, FTS, mapping, jobs and edges while retaining a processing-state tombstone for reconciliation.

Embedding jobs use a single-flight main-process drain loop. Memory writes notify the loop, which drains in batches, blocks jobs while the local model is absent, and bounds retries for transient errors. Startup only queues missing/stale/version-mismatched embeddings; it does not recreate jobs for current mappings. Rebuild drains every queued job before returning.

OOC `repair` now executes one bounded repair request and validates the repaired proposal again. A second failure falls back in character, and actions/memory candidates from a rejected draft are discarded.
