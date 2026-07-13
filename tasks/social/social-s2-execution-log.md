# Social S2 execution log

- Previous baseline: `b02f048237e9e3c5f3542bbb5f03e06d4bf0c555`.
- Closure-repair commit: pending at log update.
- Files changed: Main-process network connection and its tests, shared Social contracts, and the Social settings UI.
- DELETE token-refresh fix: all authenticated Social GET, POST, and DELETE requests use `authenticatedRequest()`. An authentication rejection performs the existing single refresh-lock flow, then retries the same method and body once. Refresh failure clears the session and returns `AUTHENTICATION_REQUIRED` without a retry loop.
- Activity and invalidation: Main throttles Presence activity to one IPC/socket emission per ten seconds; Renderer reports only in-app focus and pointer interaction. Friend/block invalidations are coalesced for 200 ms, while a typed Presence invalidation updates only that Friend in memory.
- Account-state isolation: Social lists, requests, blocks, lookup input/result, and previous errors clear immediately on account/server/authentication/Online Mode scope changes. In-flight refreshes check their starting scope before applying a result.
- UI: distinguishes disabled Online Mode, required authentication, reconnecting, unavailable server, and incompatible client; provides loading/empty states and disables duplicate actions while an operation is running. Common server codes map to user-facing messages.
- Tests added: DELETE retry after refresh for Remove Friend; refresh failure/session clearing for Unblock. Focused Social Main-process suite: 10/10 passing.
- Commands executed:
  - `npx vitest run apps/desktop/electron/main/networkConnection.test.ts` — passed (10 tests).
  - `npm run arch:check` — passed.
  - `npm run build` — passed.
  - `npm run typecheck` — failed before Social diagnostics because workspace build artifacts are stale/missing and the host is Node `20.17.0` while this project requires Node `>=22 <23`.
  - `npm test` — 41 files / 324 tests passed; 11 suites could not load `node:sqlite` on Node 20; one unrelated companion protocol symlink fixture asserted 403 and received 404.
  - `git diff --check` — passed.
- Scripted integration results: pending a real PostgreSQL database and two accounts.
- Manual two-client desktop smoke test: pending.
- Remaining limitations: client full verification and real PostgreSQL integration must be rerun under Node 22; S3 public identity/assets, S4 invitations, and S5 visual visits remain deferred.
