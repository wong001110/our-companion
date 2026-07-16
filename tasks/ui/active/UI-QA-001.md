# UI-QA-001 — Stabilize Windows Electron Test Teardown

## Status

Tracked — not started

## Origin

Non-blocking follow-up from the ChatGPT reviewer’s `PASS WITH FOLLOW-UP` verdict for UI-008 on 2026-07-16.

## Problem

On the current Windows environment, Playwright Electron tests can finish their product assertions while the temporary-profile Electron process remains alive. Focused runs require explicit process termination, and the full suite cannot produce an authoritative aggregate before the command timeout. DIPS/DIPS-wal or related profile cleanup may contribute, but the cause is not yet proven.

## Objective

Identify and repair the test-infrastructure shutdown lifecycle so focused and full Electron runs exit naturally and report authoritative results on Windows.

## Scope

- Reproduce the lingering temporary-profile Electron process with the smallest existing UI test.
- Determine which window, Electron process, fixture, or profile-cleanup operation prevents natural exit.
- Separate product assertions from runner teardown and DIPS/profile cleanup diagnostics.
- Add bounded regression coverage for natural process exit.
- Rerun the full Electron suite after the teardown repair and record exact passed, failed, and skipped totals.

## Out of Scope

- UI-008 product behavior or acceptance.
- Hiding, force-killing, or reclassifying test failures to manufacture a green aggregate.
- Production data, credentials, Network mutation, or unrelated UI refactoring.

## Known Evidence

- UI-008 focused shared-dialog, Reduced Motion, and Chat Electron assertions passed only after each already-asserted Electron process was explicitly ended.
- The required UI-008 full Electron run reached its 15-minute command ceiling and did not produce a valid aggregate.
- No full Electron pass is claimed in `tasks/ui/reviews/UI-008-review-request.md` or `tasks/ui/completed/UI-008.md`.

## Entry Gate

Treat this as a separate test-infrastructure task. Do not reopen UI-008 unless investigation proves a UI-008 product regression.
