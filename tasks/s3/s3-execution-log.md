# S3 execution log

- Implemented idempotent companion activation and reusable active/superseded asset packs.
- Activation now swaps verified superseded packs atomically and publishes an invalidation.
- Upload/download work in bounded batches of 50, with concurrency 3 and up to two URL re-signs after 401/403.
- Transfers cancel on logout, online-mode disable, server change, session refresh failure, and app shutdown.
- Asset manifests reject unsupported files and include validated portable PNG sprite metadata.
- Added hourly bounded cleanup for expired uploads and retained superseded packs; storage capability retries every five minutes.
- UI polls and displays actual publish phase, files, bytes, percentage, and current file.

## Verification

- `network: npm test -- --runInBand` — 8 suites passed, 31 tests passed, 1 integration suite skipped.
- `client: tsc -b`, targeted tests, full Vitest suite (54 files / 402 tests), architecture check, and production renderer build — passed.
