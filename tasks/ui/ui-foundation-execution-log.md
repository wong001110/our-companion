# UI foundation execution log

- Previous Client baseline: `7e6f16622211777564ed4efb7a85d31c508a7007`.
- Previous UI foundation implementation: `bb117e6fad8f881da04583933f42a5e5748a60d9`.
- UI closure commit: `75994e70b8339bd768f5df9ce1b19a7fd3a54535` (local Client branch; no merged-main or GitHub CI claim).
- Follow-up localized-settings status fix: `89e863d8faaca9ca477dee7de50df2b3489619b2`.
- Overlay exit lifecycle completion: `17e99ea` (speech retention, dialog focus restoration, and More-menu exit).
- Motion-state QA follow-up: pending local commit (Creation and Panel now transition from `entering` to `entered`; the QA report derives covered named checks and fails closed for uncovered ones).
- Network repository: unchanged for this UI-focused task.
- Closure patch is local until committed; no GitHub CI claim is made here.

## Implemented

- `App.tsx` selects isolated Companion, Panel, and Creation shells; pages and shared feature folders own their domains.
- Panel loading uses `Promise.allSettled` so a domain failure does not erase independent data.
- Social is top-level, Settings is categorized, and friend removal/block are separated into a confirmed overflow action.
- UTF-8 English and Simplified Chinese dictionaries have parity/mojibake tests. Settings, Social state labels, Companion creation/edit, and the shared sprite-asset workflow use those dictionaries.
- Memory drafts preserve title, content, and summary independently. `useMemoriesViewModel` owns recoverable memory reads/writes and safe error feedback. Creation and Edit share sprite validation, staging, preview, grid, slot, and bulk-upload components; renderer validation details are localized at the UI boundary.
- `useDiscoveriesViewModel` owns filter state and recoverable refresh, add-to-journey, and feedback mutations; its Electron empty/filter flow is covered by UI QA.
- `useJourneysViewModel` owns recoverable Journey creation; Electron UI QA proves the empty-state-to-created-Journey path.
- `useHomeViewModel` owns recoverable daily-diary generation, preserving the page as a rendering surface and showing safe feedback on failure.
- Bubble Quick Actions have pure edge-aware placement tests and fake-timer timing tests. Creation entry is a real button with an Electron UI flow test.
- Bubble safe-path geometry now controls Electron click-through from forwarded pointer movement, and the More menu flips/clamps inside the work area. This is covered by layout and interaction-region unit tests plus the Electron quick-action flow.
- Feedback foundations include inline notices, loading/empty/error states, a reusable accessible action-progress surface for real Asset Pack publishing, Escape-dismissable confirmation dialogs, and success toasts for diary refresh, Journey creation, and Memory saves. Changing a signed-in Network Server now uses the shared confirmation dialog rather than a browser prompt.
- Styling is now split by ownership: the root sheet contains only global setup and module imports, while Panel/notebook, Companion overlays, Quick Actions, responsive behavior, and developer diagnostics live in dedicated domain modules. The obsolete overlapping Panel rules were removed rather than retained as overrides.
- Screenshot inspection found the notebook seam was competing with Home status text at the Panel width. The status card now uses a responsive single-column, opaque paper surface so the real Companion and its status remain fully readable. UI automation now uses test-only software rendering, which makes repeated canonical Electron captures stable without changing production GPU behavior.
- Companion canvas intent captions, discovery actions, quick-action controls, first-run companion text, generic loading/error feedback, confirmation labels, relative discovery times, and safe voice failure messages localize visible and accessible labels. Normal Settings no longer exposes raw voice-status errors; raw diagnostics remain Developer-only.
- `useSettingsViewModel` now owns independent AI settings, language, attention-mode, and queued-action reads with `Promise.allSettled`. It exposes typed data/loading/error/retry actions, and the AI section presents a localized in-context retry while preserving independently loaded settings data.

## Verified in this working tree

- Closure implementation adds target-tab Panel opening (`Settings` opens Settings directly), visible Talk active state while the composer is open, panel navigation entrance/focus/scroll behavior, lightweight reusable exit presence for dialogs and toasts, and motion/reduced-motion tokens for Panel, Creation, Quick Actions, Composer, Speech Bubble, dialog, and toast surfaces.
- Quick Actions use the explicit-toggle outside-click strategy: because the transparent Companion window cannot reliably receive desktop clicks, the group closes by Companion toggle, Escape, drag, away mode, Panel opening, or action completion. More closes independently on Escape and restores focus to its trigger.
- `npm run qa:ui` writes a machine-readable report under `artifacts/ui-qa/<run-id>/qa-report.json` and does not skip failed commands.
- Local closure verification: Typecheck and architecture checks pass; the full unit suite passes under bundled Node 24 (68 files / 463 tests). The serial Electron suite was exercised in its configured one-worker mode by its independent spec groups: all non-live UI scenarios passed, including axe (zero critical/serious), keyboard navigation, Panel, Settings, localization, Social, Creation, Discoveries, Journeys, Memories, responsive layout, and expanded Quick Actions. The configured live-AI Creation check was skipped because credentials were unavailable.
- Screenshots reviewed in this closure work: `quick-actions/more-menu.png`, `quick-actions/talk-active.png`, and `reduced-motion/quick-actions.png`. They show the menu within bounds, an accessible Talk/composer arrangement, and no visible reduced-motion spatial burst.
- Focused Quick Actions Electron verification was rerun after the overlay-exit patch: hover/pin/Escape, independent More Escape/focus restoration, reduced-motion behavior, and Settings/Talk all passed. The Settings flow now asserts that the More menu is in its `exiting` state before the Quick Actions group closes.

- `npm run typecheck`
- Full Client suite under bundled Node 24: 68 files / 463 tests passed. The default system Node lacks `node:sqlite`, so its direct `npm test` cannot load database suites.
- `npm run arch:check`
- `npm run build`
- All 12 Electron Playwright checks passed in independently reported groups: panel navigation, Settings, Simplified Chinese, Social unavailable state, responsive layouts, Quick Actions, accessibility, Creation, Discoveries, Journey creation, and the full Memory create/edit/cancel/save flow. Axe found zero critical/serious violations, and keyboard-only navigation covers Social, Settings, and category selection. The canonical screenshot set was refreshed and visually reviewed.
- The focused Settings and Simplified Chinese Electron regression checks passed again after the Settings ViewModel extraction.
- The focused Social Electron regression check passed after moving the active Visit Session above the publication controls, so an active visit is visible without scrolling past the published-Companion section.
- A real configured DeepSeek analysis run reached the shared sprite-asset upload stage and produced the reviewed capture at `artifacts/ui-qa/ui-foundation-20260714/en/creation-assets-live-ai.png`. No API value was written to Client configuration, source, logs, or artifacts.
- A managed S5 run used an isolated PostgreSQL database derived from the Network local configuration and the existing configured R2/Cloudflare storage. It passed every automated check and cleanup in `artifacts/s5-two-device/1784037422633-3037390cb469/report.json`. The corresponding active Social capture is `artifacts/s5-two-device/1784037422633-3037390cb469/host/social-active-visit.png`.
- `git diff --check`

## Latest focused verification

- `npm run typecheck` and `npm run build` passed after `17e99ea`.
- Electron needs desktop process services and therefore cannot launch from the filesystem sandbox. The focused Quick Actions spec was rerun with desktop access: all four checks passed, including the new More-menu exit-state assertion.
- Focused Electron Creation and Panel navigation checks passed after their motion-state updates. They assert the final `entered` state and delayed focus placement rather than relying on animation names alone.
- `qa:ui` now runs dedicated focused scenario specs for each currently covered named claim. It deliberately exits non-zero until the remaining explicit scenarios and screenshot review are complete; this prevents a partially covered run from creating a misleading `passed` report.
- Real Electron coverage now also verifies Quick Actions hover grace, drag-close, and an active Listen session using a local synthetic media stream. It confirms Listen is `aria-pressed=true` after reopening Quick Actions, then returns to `false` after stopping.
- Smoke-only visual-presence injection now drives the same renderer publication path used by Visual Visit state, proving that `away_visiting` immediately removes Quick Actions. Five persisted Companion positions are exercised in Electron with measured in-bounds/non-overlap bubbles; the placement resolver now deconflicts bubbles that flip into the same corner.
- The transparent-window screenshot renderer makes the latest corner captures visually ambiguous against its black background despite measured DOM geometry. These captures are retained as automation artifacts, but `screenshotsReviewed` remains false until an unambiguous manual review is recorded.
- Feedback follow-up: `Presence` now starts initially-present content in `entering`, restoring the Toast entrance state that had been skipped. Focused Journey-toast and Settings-dialog Electron tests were added, but their final Electron rerun is pending because desktop-process execution approval became unavailable after the account usage limit was reached. Typecheck and architecture checks passed with those additions; the QA report remains fail-closed for dialog and toast until the Electron assertions are rerun.
- The QA report now runs those dialog and toast specs as dedicated scenario gates. Their report fields remain false unless those exact Electron commands pass; no current report treats the unverified test source as evidence.
- Added a dedicated startup-speech lifecycle spec (enter → exit → unmount) and the corresponding QA gate. It remains unverified until desktop-process execution becomes available again.
- Latest non-desktop verification: the full Client Vitest suite passed under bundled Node 24 (68 files / 463 tests), including Quick Action layout collision coverage and Visual Visit service tests. This does not replace the pending Electron transition checks.

## Dedicated smoke environment details

- The Network repository had legacy Prisma history without an initial table-creation migration. Managed smoke preparation therefore detects that shape and uses idempotent `prisma db push --skip-generate` only for the dedicated smoke database; repositories with an initial migration continue to use `prisma migrate deploy`.
- The live harness uses generated fixture Companions and unique `*.example.invalid` smoke accounts. It does not upload, publish, download, or delete the user's development Companion assets.

## Remaining physical verification

- The S5 report does not replace manual verification on separate physical computers, including cross-platform networking, display/DPI/Dock changes, sleep/wake, firewall/proxy conditions, packaged builds, and long-running visits. The generated checklist in the S5 artifact tracks those checks.
