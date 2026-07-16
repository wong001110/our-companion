# UI-QA-001 — Stabilize Windows Electron Test Teardown

## Status

Blocked — a bounded production lifecycle decision is required.

## Origin

Non-blocking follow-up from the ChatGPT reviewer’s `PASS WITH FOLLOW-UP` verdict for UI-008 on 2026-07-16.

## Finding

The Windows failure is not currently attributable to DIPS cleanup. A live Electron main process retains its GPU, Network Service, renderer children, and the `our-companion-ui-*` profile after the product assertions finish.

The strongest code-level cause is the Panel window’s close interception: ordinary Panel close is intentionally prevented and converted to hide, but the same handler can also prevent `app.quit()` from closing that window. Playwright’s `ElectronApplication.close()` calls `app.quit()`, so `window-all-closed`, `will-quit`, service cleanup, and natural process exit can remain unreachable.

Repairing that behavior requires a bounded change to the production Electron lifecycle in `apps/desktop/electron/main/index.ts`: record quit intent in `before-quit`, allow Panel closure while quitting, preserve hide-on-close during ordinary use, and keep cleanup idempotent. The UI-BETA-001 support track is not authorized to make that production lifecycle change.

## Verified Support Fixes

- Windows path expectations now use `path.resolve()` while preserving basename/sibling policy assertions.
- The Notebook selector policy accepts CRLF without weakening adjacency or tape rules.
- Focused portability result: 5 files / 16 tests passed before the consolidated pass continued.
- `UiElectronFixture.close()` now reports bounded close and process-exit timeouts instead of silently turning fallback termination into a pass.
- Diagnostic force termination runs only after the test is already failed and is used only to clean the identified Electron test tree.
- Fixture screenshots use the visible viewport rather than an unbounded `fullPage` capture.

## Reproduction Evidence

- A smallest Settings Electron scenario exceeded both the Playwright timeout and the outer command bound.
- The remaining tree used a unique temporary profile and contained Electron main, GPU, Network Service, and renderer processes.
- The identified stale test tree was terminated explicitly before later diagnostics; no unrelated Node or Codex process was stopped.
- After the bounded fixture diagnostic was installed, `Settings organizes controls into explicit categories` completed its product assertions and failed in 7.9 seconds with the exact error `UI_ELECTRON_CLOSE_TIMEOUT` at `tests/ui/ui-fixture.ts:65`.
- The failed run exited normally as a Playwright aggregate (`1 failed`) and its diagnostic cleanup left no `our-companion-ui-*` Electron process alive.

## Stop Condition

Do not modify production Electron lifecycle behavior under UI-BETA-001 merely to make the suite green. Do not claim a full Electron pass while natural exit is unproven. Resume UI-QA-001 only when the repository owner explicitly authorizes the bounded lifecycle repair and the actual product Exit App route can be tested.

## Required Verification After Authorization

1. Prove natural exit through the product quit route with no fallback termination.
2. Repeat creation-only, hidden Panel, and visible Panel cases five times on Windows.
3. Verify ordinary Panel close still hides rather than quitting.
4. Verify exit code 0, no remaining descendants, and successful temporary-profile deletion.
5. Rerun the focused Quick Actions Panel scenario.
6. Run one authoritative full Electron suite and record exact passed, failed, and skipped totals.
