# Social S4 execution log

- Bumped desktop Social protocol to `0.3` / `0.3.0`.
- Added typed invitation/session IPC and a main-process coordinator for preparation and heartbeats.
- Reused the existing verified S3 cache machinery for session-scoped immutable Pack downloads.
- Added a Social Visit status section for invitations, preparation, start, and end; no remote Companion is rendered.
- Added focused coordinator tests covering owner/host preparation, heartbeat deduplication, and Offline Mode.

## S4 closure repair (2026-07-13)

- Previous reviewed baseline: `a25526e49973953c54bcf9e38e7efa468722efa3`.
- Closure commits: `7a0414d` (`fix: harden desktop visit lifecycle`) and `1a4cfa6` (`fix: gate visit UI by server capability`).
- Visit Pack preparation is authorization-first: the session manifest is fetched before reusing a verified cache, so a revoked or ended Session cannot use a cache hit to report Host ready.
- A Visit download is owned by its Session and is cancelled on a terminal Session state, while unrelated downloads and verified cache entries remain intact.
- Concurrent preparation is locally coalesced; a participant already marked ready does not redownload or call `markReady` again.
- Heartbeats stop only for authoritative terminal/authentication errors. Transient failures retain the normal timer and reconcile after repeated failures.
- The desktop now carries Visit capability flags from compatibility metadata and disables Visit controls without issuing unavailable Visit requests when private asset storage is unavailable.
- No visual Visit capability was added; `visualVisits` remains `false`.
- Verification: bundled Node 24 runtime, `npm run typecheck` (after project reference rebuild), `npm run arch:check`, full `npm test` (56 files / 416 tests), focused Visit tests, `npm run build`, and `git diff --check` passed.
- Two-client S4 smoke test: passed (reported by the tester).
- Remaining environment limitation: the supplied command runtime did not provide Node 22 specifically; the bundled Node 24 runtime was used because it provides `node:sqlite`, required by the full suite.

## S4 heartbeat configuration closure (2026-07-14)

- Previous reviewed baseline: `8fc124552920f2617564b2043ecef0eed3f0b5cd`.
- The compatibility response now carries sanitized Visit cadence in `NetworkStatus.visit`; malformed or missing timing uses the safe 15-second client fallback.
- Visit timers are created from the current server interval. Reconnect stops existing timers and reconciliation recreates them using the latest compatibility metadata.
- Focused connection/coordinator tests passed (30 tests). Full Client verification passed: typecheck, architecture check, build, and 56 files / 426 tests using the supported bundled runtime.
- Remaining manual verification: two-client default, custom 5/30-second, and reconnect heartbeat smoke tests.
