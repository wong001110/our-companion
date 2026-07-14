# S5 logical two-device smoke harness

This harness starts two independent Electron processes on one machine: `visitor_owner` and `host`. Each receives an explicit `OUR_COMPANION_USER_DATA_DIR` before Electron creates any storage, so its SQLite database, secure session, Device ID, Network cache, settings, logs, and windows are isolated.

## Prerequisites

- Node 22 project runtime and `npm install` in the Client.
- A dedicated Network PostgreSQL database and dedicated R2 bucket or disposable R2 credentials. Never point this harness at production.
- The Network Server must set `OUR_COMPANION_SMOKE_TEST=1`, `SMOKE_TEST_ALLOW_DESTRUCTIVE_ENDPOINTS=1`, and `SMOKE_TEST_DATABASE=1`, with a valid dedicated `DATABASE_URL`. URLs containing `production`, `prod`, `primary`, or `live` are rejected unless `SMOKE_TEST_DATABASE_CONFIRMED=1` is explicitly supplied. These flags expose only `/api/smoke/cleanup`, which requires the matching `X-Smoke-Test-Token` header and deletes only matching `*-s5-<run-id>@example.invalid` users and their associated Pack objects.

Set `OUR_COMPANION_SMOKE_SERVER_URL` to an external dedicated Server. To have the harness prepare and launch a local Network process, set `OUR_COMPANION_SMOKE_MANAGE_SERVER=1` and `OUR_COMPANION_SMOKE_NETWORK_ROOT` to the Network repository. The configured root is validated for `package.json` and `prisma/schema.prisma`; the default fallback is `../our-companion-network`. Managed mode runs dependency installation only when needed, Prisma generation/validation, then `prisma migrate deploy` when an initial schema migration exists (or idempotent `prisma db push --skip-generate` for a legacy repository without one), a production build, health and protocol/R2 preflight, then `npm run start:prod`. This bootstrap is permitted only for the dedicated smoke database. `OUR_COMPANION_SMOKE_SKIP_NETWORK_PREP=1` is an explicit fast mode only.

For a managed run, keep the dedicated `DATABASE_URL` and R2 configuration in the Network repository's local `.env`; never add real values to this document. Then run:

```bash
export OUR_COMPANION_SMOKE_NETWORK_ROOT=/path/to/our-companion-network
export OUR_COMPANION_SMOKE_MANAGE_SERVER=1
export OUR_COMPANION_SMOKE_TEST=1
export SMOKE_TEST_ALLOW_DESTRUCTIVE_ENDPOINTS=1
export SMOKE_TEST_DATABASE=1

# Network .env must provide a dedicated DATABASE_URL and R2_ACCESS_KEY_ID,
# R2_SECRET_ACCESS_KEY, R2_ENDPOINT, and R2_BUCKET_NAME (or R2_BUCKET).
npm run smoke:s5:two-device
```

For an external Server, provide `OUR_COMPANION_SMOKE_SERVER_URL` and the exact `SMOKE_TEST_CLEANUP_TOKEN` configured on that Server. Managed mode generates an ephemeral token and passes it only to its child Server process.

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

The harness always clears the visual override, closes both Electron processes with bounded termination, calls the token-gated Network cleanup endpoint while the Server is still available, then stops a managed Server and removes temporary profiles. Cleanup deletes every linked Pack file plus each Pack manifest with deduplication. A cleanup failure fails the smoke report even if functional checks passed. Screenshots and reports are preserved for investigation.

## CI and remaining physical checks

Run in a logged-in macOS GUI session. Linux may use `xvfb-run -a npm run smoke:s5:two-device`; this validates Electron/DOM behavior, not macOS work-area behavior.

Automated logical devices do not replace manual verification of separate computers, cross-platform connections, monitor hot-plug, mixed DPI, Dock/taskbar changes, sleep/wake, unstable networks, firewall/proxy behavior, GPU modes, packaged builds, long visits, or visual quality. The generated checklist lists those required physical checks.
