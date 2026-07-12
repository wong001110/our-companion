# Social S0–S1 execution log

## Closure repair (after `6e5cfe4242b6f4accbcde9fe35f95a995e708484`)

- Fixed lifecycle root causes: restored sessions now bind to their issuing server origin, refresh before Socket.IO use, reload the account with `/api/auth/me`, and perform at most one refresh after socket authentication failure. Reconnect delay now grows from 1s to 30s and resets only on a successful connection, manual retry, disable, or logout.
- Logout now exposes whether remote session revocation was confirmed; unavailable servers clear only the local session and leave that distinction visible in status.
- The Online Mode card subscribes to `network:statusChanged`, renders the full lifecycle state, and provides a guarded Network Server URL editor. Switching servers disconnects, clears the old session/account, and never sends old credentials to the new origin.
- Tests added: `apps/desktop/electron/main/networkConnection.test.ts` (offline isolation, refresh-before-connect/account restoration, origin isolation, URL validation, compatibility-before-login, and server-switch session clearing).
- Commands: `npm run typecheck` passed; `npm run arch:check` passed; `npm test` passed (53 files, 382 tests); `npm run build` passed; `git diff --check` passed.
- Manual integration: not run. This workspace has no Docker executable or reachable PostgreSQL/Network Server, so two-isolated-client verification remains required before S1 can be declared closed.
- Deferred unchanged: S2–S5 friends, publishing, assets, visits, and remote AI remain out of scope.

- Baseline: `f501e448fb591c59925a52d439403544b4d0d9a5` (per implementation directive).
- Protocol: client `0.1.0`, protocol `0.1`; no shared package was created.
- Changes: Electron-main `NetworkConnectionService`, encrypted Electron `safeStorage` session adapter, random persisted device ID, protocol/health compatibility check, authenticated REST, authenticated Socket.IO connection, reconnect cancellation, preload-only renderer API, and Online Mode settings wiring.
- Security: access and refresh tokens remain main-process-only; refresh tokens are never exposed through preload. If OS secure storage is unavailable, login fails rather than falling back to plaintext storage.
- Commands run: `npx tsc -p apps\\desktop\\tsconfig.json --noEmit --tsBuildInfoFile <writable temp>` — passed. `git diff --check` — passed. `npm test` — blocked by sandbox EPERM writing `node_modules/.vite-temp`. `npm test -- --runInBand` — invalid Vitest option.
- Manual verification: not run; a reachable Network Server and two isolated application data directories were not available in this workspace.
- Known limitations: test execution and normal emitting builds cannot write into user-owned generated-output paths in this sandbox. S2–S5 features (friends, publishing, assets, invitations, visits, AI relay) remain deferred.
