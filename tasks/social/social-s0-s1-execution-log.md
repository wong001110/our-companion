# Social S0–S1 execution log

- Baseline: `f501e448fb591c59925a52d439403544b4d0d9a5` (per implementation directive).
- Protocol: client `0.1.0`, protocol `0.1`; no shared package was created.
- Changes: Electron-main `NetworkConnectionService`, encrypted Electron `safeStorage` session adapter, random persisted device ID, protocol/health compatibility check, authenticated REST, authenticated Socket.IO connection, reconnect cancellation, preload-only renderer API, and Online Mode settings wiring.
- Security: access and refresh tokens remain main-process-only; refresh tokens are never exposed through preload. If OS secure storage is unavailable, login fails rather than falling back to plaintext storage.
- Commands run: `npx tsc -p apps\\desktop\\tsconfig.json --noEmit --tsBuildInfoFile <writable temp>` — passed. `git diff --check` — passed. `npm test` — blocked by sandbox EPERM writing `node_modules/.vite-temp`. `npm test -- --runInBand` — invalid Vitest option.
- Manual verification: not run; a reachable Network Server and two isolated application data directories were not available in this workspace.
- Known limitations: test execution and normal emitting builds cannot write into user-owned generated-output paths in this sandbox. S2–S5 features (friends, publishing, assets, invitations, visits, AI relay) remain deferred.
