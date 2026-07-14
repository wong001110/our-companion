# Social S5 execution log

- Previous baseline: `830a5745c18a796125ed708c66270b9374948f9a`.
- S4 reconnect metadata repair: `9e9eb3d` refreshes compatibility metadata before every automatic socket reconnect so Visit reconciliation recreates heartbeat timers using the current server cadence.
- Client implementation SHAs: `113405d90c90345fb4493f839729e44c53a9e6d0` (S5 runtime), `86464dd` (active-Visit asset access hardening), and `36f0e0b1d610330b6be76a8007819a5c892477b5` (renderer-failure cleanup and display-change clamp).
- Protocol: `0.4` / `0.4.0`.
- Main runtime: `VisualVisitService` creates a single sanitized host visitor, owns owner away/home restoration, and reconciles on online state and Visit invalidations.
- Safe assets: `companion-network:` serves only verified cached manifest-declared image bytes; the renderer never receives absolute paths, R2 URLs, object keys, or credentials.
- Renderer: isolated `visit:<sessionId>` layer plays Enter/Idle/Walk/Leave and uses deterministic bounded local movement with diagonal fallback.
- Verification: focused S5 tests (28 assertions), full Client suite (59 files / 436 tests) using the bundled Node runtime with `node:sqlite`, production build, architecture check, and `git diff --check` pass.
- The full workspace typecheck remains blocked by pre-existing project-reference declaration/export errors after generated artifacts are cleaned; the desktop production build succeeds.
- Remaining manual verification: two-client S5 smoke test, host/owner restart recovery, and display-change clamp behavior.

## Automated two-device smoke harness (in progress)

- Previous Client baseline: `c1ab4fef3433f5f17699566124f5836440e7502e`.
- Previous Network baseline: `f77403d816146919216b9498a90a44facbece592`.
- Framework: Playwright Electron launches isolated visitor-owner and host profiles using `OUR_COMPANION_USER_DATA_DIR`.
- Client harness SHA: `74b79ee3b7c256c7a84700be6a65f5444610a1d7`.
- Network cleanup SHA: `6a5eeaa9b4bb4da744b164d1cb8b4419bb98fcea`.
- Test-only IPC is enabled only by `OUR_COMPANION_SMOKE_TEST=1`; it returns sanitized state and provides narrow reconnect, reconciliation, work-area, renderer-failure, and fixture controls.
- The full run requires a dedicated Network database and R2 configuration. It is not recorded as passed until that live logical two-device run completes and writes its sanitized artifact report.
- Local verification: Client full suite (61 files / 441 tests), Playwright harness discovery, Client production build, architecture check, Network full suite (81 tests), Network build, and Network HTTP E2E (3 tests) pass.

## Automated two-device smoke harness closure

- Client implementation commit: `500437f9b6b2fd282823c52aa43811861357bc6c`.
- Network implementation commit: `717c37e8bd17b8b79a385b7321990160022e0825`.
- The harness now validates dedicated-test guards, validates/prepares a managed Network Server, token-protects cleanup, removes all Pack file objects plus manifests, and fails its report on cleanup failure.
- Live managed run passed against the dedicated PostgreSQL/R2 configuration: [sanitized report](/Users/wongjuenan/Desktop/Self%20Project/our-companion/client/artifacts/s5-two-device/1784015385399-f83f5da6b17f/report.json).
- Automated checks passed: account/device isolation, Visit lifecycle, renderer Enter/Idle/Walk, work-area clamp and bounded movement, host/owner restart recovery, socket reconnect, renderer-failure recovery, active and terminal asset authorization, friendship removal, block, unpublish, and remote cleanup.
- Remaining work is physical-only verification from `manual-physical-checklist.md` (separate devices, display topology/DPI, sleep/wake, unstable networks, packaged behavior, and long-run visual quality).
