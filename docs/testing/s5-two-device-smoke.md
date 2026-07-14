# S5 logical two-device smoke harness

This harness starts two independent Electron processes on one machine: `visitor_owner` and `host`. Each receives an explicit `OUR_COMPANION_USER_DATA_DIR` before Electron creates any storage, so its SQLite database, secure session, Device ID, Network cache, settings, logs, and windows are isolated.

## Prerequisites

- Node 22 project runtime and `npm install` in the Client.
- A dedicated Network PostgreSQL database and dedicated R2 bucket or disposable R2 credentials. Never point this harness at production.
- The Network Server must set `OUR_COMPANION_SMOKE_TEST=1` and `SMOKE_TEST_ALLOW_DESTRUCTIVE_ENDPOINTS=1`. Those flags expose only `/api/smoke/cleanup`, which accepts a validated run namespace and deletes only matching `*-s5-<run-id>@example.invalid` users and their associated Pack objects.

Set `OUR_COMPANION_SMOKE_SERVER_URL` to that Server. To have the harness launch the already-built local Network process, also set `OUR_COMPANION_SMOKE_MANAGE_SERVER=1`, `SMOKE_TEST_DATABASE=1`, `DATABASE_URL`, and the dedicated R2 configuration. The managed mode runs `npm run start:prod` from the Network repository.

```bash
npm run smoke:s5:two-device
```

The command builds the Desktop app first and then launches it with Playwright’s Electron launcher. It never shares a Vite server. Use `npm run smoke:s5:two-device:headed` for visible windows.

Set `OUR_COMPANION_SMOKE_SKIP_LIVE_R2=1` only when exercising harness plumbing without real R2. That run writes a `skipped` report and is not an S5 acceptance success.

## What it exercises

The harness creates a deterministic, generated 300px PNG local Companion fixture (never a production asset), registers unique test accounts, establishes friendship, creates/publishes the owner Pack, and uses real client APIs for invitation, acceptance, prepare, start, end, restart, reconnect, asset authorization, and destructive lifecycle cleanup.

The smoke-only preload API exists only when `OUR_COMPANION_SMOKE_TEST=1`. It provides sanitized state, an unexpected-reconnect simulation, explicit Visit reconciliation, a bounded visual work-area override, renderer-failure simulation, and the fixed fixture bootstrap. It cannot export tokens, paths, cache roots, passwords, R2 keys, or arbitrary database/filesystem state.

## Artifacts and cleanup

Artifacts are written to `artifacts/s5-two-device/<run-id>/` and ignored by Git. They contain role-prefixed/redacted logs, lifecycle screenshots, `report.json`, failure context when needed, and `manual-physical-checklist.md`. Absolute profile paths, email addresses, credentials, tokens, object keys, and presigned URLs are omitted.

The harness always closes both Electron processes, clears the visual override, stops a managed Server, removes the temporary profiles, and calls the flag-gated Network cleanup endpoint. It preserves screenshots and reports for investigation.

## CI and remaining physical checks

Run in a logged-in macOS GUI session. Linux may use `xvfb-run -a npm run smoke:s5:two-device`; this validates Electron/DOM behavior, not macOS work-area behavior.

Automated logical devices do not replace manual verification of separate computers, cross-platform connections, monitor hot-plug, mixed DPI, Dock/taskbar changes, sleep/wake, unstable networks, firewall/proxy behavior, GPU modes, packaged builds, long visits, or visual quality. The generated checklist lists those required physical checks.
