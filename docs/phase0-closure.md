# Phase 0 lifecycle and derived-state closure

SQLite is authoritative for Memory. sqlite-vec is disposable derived state: a failed or interrupted vector operation never changes authoritative Memory, and lexical/structured retrieval remains available while vector search is unavailable or in maintenance.

`OperationTracker` is the application-wide runtime supervisor. Its one canonical phase model is `starting`, `running`, `quiescing`, `disposing`, and `disposed`. Every tracked operation receives an epoch-bound token and must pass the supervisor's commit gate immediately before durable mutation or publication. Entering quiescing increments the epoch, rejects new work with `APP_SHUTTING_DOWN`, and makes results from the prior generation unable to commit. `finish()` is idempotent.

The gate covers Companion Turns and permission resolution, direct tool execution, speech transcription, research/discovery, debug upload flushes, embedding work, vector rebuilds/initialization, and network reconnect/event admission. Renderer/debug publication is additionally guarded at the central foundation-event boundary. Network reconnect timers and vector maintenance stop accepting work at quiescing; the embedding runner retains its worker-level SQLite/vector barriers and leaves interrupted jobs recoverable on the next startup.

Shutdown enters quiescing, stops schedulers, timers, reconnect admission and maintenance admission, drains tracked operations with an eight-second bound, aborts remaining tracked work, enters disposing, disposes network/visit resources and providers, closes SQLite last, then marks the runtime disposed. Repeated shutdown uses the same promise and is harmless. The safe lifecycle snapshot exposes only phase, epoch, operation counts by kind, quiescing time, and drain timeout state.

Vector maintenance serializes rebuild work and rejects new searches while maintenance is active. The vector index marks mappings stale during derived-state rebuild and only exposes ready rows that match active authoritative Memory; jobs are recovered on startup. A model, extension, dimension, or interrupted rebuild failure leaves Memory unchanged and the vector path unavailable rather than advertising partial state.

Diagnostics use the shared sensitive-descriptor classifier. Exportable inspections and debug uploads redact descriptor values; local conversation storage retains the original conversation according to the existing local-first policy.

Future offline Companion visits, cloud-hosted execution, durable cloud jobs, and cross-device task ownership remain outside this local-runtime phase.
