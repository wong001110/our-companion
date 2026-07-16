# Review Request — UI-008

## Verdict Requested

Return exactly one verdict: PASS, PASS WITH FOLLOW-UP, CHANGES REQUIRED, or BLOCKED.

## Objective

Replace Chat's inline clear-history confirmation with the shared destructive `ConfirmDialog`, using truthful device-wide scope, explicit irreversible-action copy, recoverable failure handling, and preserved keyboard/focus behavior.

## Commits

- Starting main: `5703f1f85edf8d9b1cbfdc990f4414e3fd3defa6`
- Reviewer-authorized shared prerequisite: `fa62f08f37a855a70792999b3769194eb541a710`
- UI-008 implementation: `a00cf78cb6389c353b38dab58d2f84032c6e4d10`
- Current main before this review-record follow-up: `a00cf78cb6389c353b38dab58d2f84032c6e4d10`

## Changed Files

Shared prerequisite:

- `apps/desktop/renderer/src/components/feedback/ConfirmDialog.tsx`
- `apps/desktop/renderer/src/components/feedback/ConfirmDialog.contract.test.ts`
- `tests/ui/feedback-transitions.spec.ts`
- `tests/ui/reduced-motion.spec.ts`

UI-008:

- `apps/desktop/renderer/src/pages/ChatPage.tsx`
- `apps/desktop/renderer/src/pages/ChatPage.contract.test.ts`
- `apps/desktop/renderer/src/i18n/en.ts`
- `apps/desktop/renderer/src/i18n/zh-CN.ts`
- `tests/ui/chat-clear-history.spec.ts`
- `tasks/ui/active/UI-008.md`
- `artifacts/ui-ux/UI-008/2026-07-16-ui008-1/*`
- this review request and exact-SHA evidence follow-up

## Reviewer Clarifications Applied

The current Chat page loads and clears history without a `characterId`; database behavior is device-wide. The reviewer directed UI-008 to keep that contract unchanged and use truthful copy:

- English: “This permanently removes all stored Chat history from this device. This cannot be undone.”
- Simplified Chinese: “这会从此设备永久删除所有已保存的聊天记录，且无法撤销。”

No per-Companion behavior is claimed.

The first Electron run then proved the existing shared dialog's two-frame focus attempt could run before `Presence` mounted Cancel. Under the task's stop condition, the reviewer explicitly authorized a prerequisite repair inside `ConfirmDialog.tsx`. Commit `fa62f08` replaces the arbitrary frame-count assumption with a pending-focus ref and mount-aware callback ref. `Presence`, shared motion APIs, CSS, IPC, preload, database, Network, and Chat history scope were not modified.

## Behavior

- Clear history remains in the existing Chat composer action row.
- It opens one `danger` shared alertdialog; the old inline prompt and Yes/Cancel branch are gone.
- Cancel receives initial focus after the `Presence` child mounts.
- Tab and Shift+Tab remain contained; Escape and Cancel restore focus to Clear history.
- Reopening focuses Cancel again; moving focus to Confirm is not overridden by later rerenders.
- Confirm uses the existing unscoped `window.ourCompanion.companion.clearHistory()` call and shows the existing empty state.
- `busy={clearing}` preserves duplicate-action and dismissal protection.
- On rejection, displayed messages are retained, the dialog closes, and a localized assertive `InlineNotice` explains that messages remain and the user can retry.
- Filter, search, composer, send keyboard behavior, and retention code are unchanged.

## Focused Verification

All commands used Node `v22.23.1` on Windows.

| Check | Result |
|---|---|
| Shared + Chat contract Vitest | PASS — 2 files, 5 tests |
| Shared ConfirmDialog Electron focus/reopen/restoration | PASS — 1 test |
| Shared Reduced Motion feedback Electron scenario | PASS — 1 test |
| Focused Chat Electron spec | PASS — 4 tests |
| Chat dialog axe scan | PASS — 0 critical, 0 serious |
| Simplified Chinese 760 × 720 bounds/overflow | PASS |
| Typecheck | PASS |
| Architecture check | PASS |
| Production build | PASS |

The focused Electron runs completed only after explicitly ending each already-asserted Electron process because Windows test-profile teardown did not exit naturally. Product assertions and cleanup behavior are reported separately.

## Full Unit Suite

Result: 75 files / 499 tests; 496 passed and 3 failed.

The failures are the unchanged Windows portability baseline:

1. `apps/desktop/electron/main/platform/smokeRuntime.test.ts` — POSIX path expectation.
2. `tests/smoke/network-process.test.ts` — POSIX path expectation.
3. `apps/desktop/renderer/src/ui/NotebookPrimitives.test.ts` — LF-only CSS string expectation.

No UI-008 or shared-dialog unit test failed. The full unit suite is not reported as passing.

## Full Electron Suite

Required because the reviewer-authorized prerequisite changed a shared feedback component.

Result: attempted, incomplete; no passing aggregate is claimed.

The direct Windows run continued for the command's 15-minute ceiling. Individual temporary-profile Electron processes did not exit after their test windows, so they required explicit termination to let the runner advance. The aggregate run timed out and left additional temporary-profile processes, which were identified and terminated. Because intervention invalidated an authoritative aggregate count, no passed/failed total is inferred. The focused shared-dialog, Reduced Motion, and Chat Electron tests above are the verified product assertions. Windows profile cleanup was not changed inside UI-008.

## Screenshot Evidence

- Index: `artifacts/ui-ux/UI-008/2026-07-16-ui008-1/screenshot-index.md`
- English populated dialog: `en-chat-clear-dialog-1180.png`
- Simplified Chinese 760 × 720 dialog: `zh-CN-chat-clear-dialog-760.png`
- English cleared empty state: `en-chat-cleared-empty-1180.png`
- Supplementary Reduced Motion focus state: `reduced-motion-chat-clear-focus.png`

All required screenshots were visually reviewed. Copy, wrapping, destructive hierarchy, focus treatment, and supported viewport bounds are complete, with no clipping or horizontal overflow.

## Out of Scope Preserved

- Per-Companion history or character-scoped loading/clearing.
- IPC, preload, services, database, Network, and data migration.
- `Presence`, dialog CSS, global CSS, tokens, navigation, and window behavior.
- Chat layout, auto-scroll, retention, send failure, and composer redesign.
- Windows DIPS/profile-cleanup repair.

## Known Limitations and Unverified Areas

- The actual renderer IPC-rejection path was not injected in Electron because the context-bridge API is immutable and adding a smoke failure IPC would violate task scope. Failure safety is enforced by the Chat source contract test and implementation structure; a real injected rejection remains unverified.
- The full Electron suite did not complete because of the disclosed Windows teardown condition.
- Production accounts, live AI, credentials, Network mutation, and personal user data were not used.

## Deviations

- The reviewer-authorized shared `ConfirmDialog` focus prerequisite is the only scope expansion. It is isolated in commit `fa62f08`.
- The full Electron suite was required and attempted but is not reported as passed.

## Product Decisions Required

None.
