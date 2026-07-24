# Phase 0 lifecycle and derived-state closure

SQLite is authoritative for Memory. sqlite-vec is disposable derived state: a failed or interrupted vector operation never changes authoritative Memory, and lexical/structured retrieval remains available while vector search is unavailable or in maintenance.

`OperationTracker` is the application lifecycle authority for externally initiated Companion Turns and permission resolution. Its states are `starting`, `running`, `quiescing`, `shutting_down`, and `disposed`. Quiescing rejects new tracked work; active work receives cancellation, is drained only for a bounded interval, and must pass its write assertion before completing. Late completion is suppressed with `APP_QUIESCING` or `OPERATION_CANCELLED` rather than emitting a new final turn result.

Shutdown enters quiescing, stops schedulers and debug-flush timers, stops embedding/vector work, drains tracked operations with an eight-second bound, aborts remaining tracked work, disposes network/visit resources and providers, closes SQLite last, then marks the application disposed. Repeated shutdown uses the same promise and is harmless.

Vector maintenance serializes rebuild work and rejects new searches while maintenance is active. The vector index marks mappings stale during derived-state rebuild and only exposes ready rows that match active authoritative Memory; jobs are recovered on startup. A model, extension, dimension, or interrupted rebuild failure leaves Memory unchanged and the vector path unavailable rather than advertising partial state.

Diagnostics use the shared sensitive-descriptor classifier. Exportable inspections and debug uploads redact descriptor values; local conversation storage retains the original conversation according to the existing local-first policy.

Post-Phase-0 backlog: broader provider-level cancellation propagation, world-wide address coverage, private Memory vault design, and performance-only lifecycle refinements.
