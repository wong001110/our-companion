# Vector Memory Productization

## Purpose

Vector Memory improves local Memory retrieval and Discovery relevance without replacing SQLite. SQLite remains authoritative. sqlite-vec, embeddings and embedding jobs are disposable derived state.

## Product Promise

- Ordinary conversation remains usable without the local embedding model.
- The model is installed only after an explicit user action.
- Installation, indexing, failure and fallback states are visible in normal Settings.
- Vector failure never removes or changes authoritative Memory.
- Structured and lexical retrieval remain available when Vector search is unavailable.

## Fixed Runtime

- Model: `Xenova/multilingual-e5-small`
- Dimensions: 384
- Query prefix: `query: `
- Document prefix: `passage: `
- Pooling: mean
- Normalized vectors
- No remote fallback during ordinary chat

## Product States

| State | Meaning | User action |
| --- | --- | --- |
| `not_installed` | Local model is absent | Install local model |
| `installing` | Explicit model installation is running | Wait or retry after failure |
| `indexing` | Model is ready and local Memory is being indexed | Continue using the app |
| `ready` | Vector search and index are available | None |
| `degraded` | Runtime or index is partly unavailable | Rebuild index; lexical fallback remains active |
| `error` | Installation or runtime failed | Retry installation or rebuild |

## UX Requirements

The normal Settings surface shows:

- current state;
- local model name;
- indexed versus eligible Memory count;
- pending/running and failed job counts;
- explicit install and rebuild actions;
- a clear statement that all data remains local;
- a clear statement that keyword and structured retrieval remain available.

Developer diagnostics may expose deeper health and job details. Normal Settings must not expose local filesystem paths or raw vector rows.

## Privacy and Safety

- No Memory content is sent to a remote embedding service.
- Private/sensitive or inactive/review-pending Memory is not eligible for indexing.
- Model installation may access the network only during the explicit installation operation.
- Normal chat keeps remote model access disabled.
- Rebuild is idempotent and derived-state-only.

## Acceptance Criteria

1. A first-run user sees `not_installed`, not a generic failure.
2. Installing the model changes status without restarting the app.
3. Eligible Memory is queued and indexed after installation.
4. Rebuild never changes SQLite Memory rows.
5. Removing or corrupting the local model produces a degraded/not-installed state and safe lexical fallback.
6. Packaged Windows and macOS builds pass the manual checklist.
