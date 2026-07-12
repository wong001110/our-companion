# Repair Execution Log

## Onboarding Recovery Closure and Animation Pipeline Repair

- Issues: completion-event delivery failure could reuse a non-destroyed Companion Window. Renderer animation selection allowed idle overrides and stale intent to mask active behavior; walking always selected `Walk_Right`; optional assets were inferred from configuration rather than persisted files; and sprite playback always looped.
- Root causes: completion-send error handling did not invalidate its window; animation decisions were distributed between App, Canvas, runtime intent, and idle state; `SpriteAnimator` had no loop metadata or completion callback.
- Old behavior: failed completion delivery left the same window available for retry; weighted idle could be passed as an unconditional Canvas override; all movement used `Walk_Right`; one-shot registry entries looped; and the legacy `curious` key was treated as an animation asset.
- New behavior: completion-send failure invalidates the window before recovery. A renderer selection resolver supplies drag/session/performance/movement/runtime/life/interaction/idle precedence, uses XY eight-direction walking, maps emotional talk variants, and follows registry fallbacks against the persisted Companion animation file list. Directional walk clips are not CSS-mirrored. Sprite configs use registry loop metadata; one-shots hold their last frame and signal completion for Drag Release, Enter/Leave-capable performance state, and normal Leave shutdown. Performance uses `startMs`, cancels prior timers, and clears its override. Legacy `curious` resolves to `Think`.
- Animation priority policy: drag, one-shot release/shutdown, performance, session, walking, runtime intent, Life Activity, Waiting Response, weighted idle, then Idle Neutral. Dedicated directional clips retain their canonical orientation; non-directional clips may retain existing facing mirroring.
- Walk direction policy: browser-coordinate `dx`/`dy` is quantized into eight canonical `Walk_` directions with a six-pixel dead zone. Walking preview writes the selected direction into `animationIntent`, then clears it on idle completion.
- Files changed: onboarding coordinator/tests; renderer App, Canvas, animation config, SpriteAnimator, new selection resolver/tests; character-engine compatibility mapping/test; shared legacy animation-key type; and this log.
- Tests added: completion-send invalidation with replacement retry; eight-direction/dead-zone/priority/talk/fallback resolver coverage; SpriteAnimator loop, one-shot, and destruction coverage.
- Manual verification: not performed in this non-interactive automated workspace. Visual checking of every installed Companion asset/trigger remains required before release.
- Command verification: `npm.cmd run typecheck`, `npm.cmd run test` (50 files, 369 tests), `npm.cmd run arch:check`, `npm.cmd run build`, and `git diff --check` all passed. Build retained the existing Vite mixed dynamic/static `character-engine` warning and Node experimental SQLite warnings; diff validation emitted only LF-to-CRLF working-copy warnings.
- Remaining limitations: interactive asset-by-asset verification and expanded renderer integration tests remain outstanding before this repair can be declared fully complete.

### Follow-up runtime and playback audit

- Issues: the legacy Main Process animation resolver still emitted obsolete `Walk_TopLeft`/`TopRight`/`Bottom*` asset names. Session-phase writes could preserve a stale animation intent after returning idle and forced Main Process `Talk_Neutral`, preventing renderer-owned emotional talk selection. Sprite playback accepted invalid non-finite frame counts and could create a second interval if started twice. Performance timers were renderer-local rather than a dedicated cancellable playback unit.
- Root causes: the old resolver’s semantic diagonal directions had not been translated to canonical asset keys; session lifecycle changed only an intent rather than semantic core state; sprite startup assumed a valid successful `load()`; and performance scheduling lived inline in `App`.
- Old behavior: a legacy walk intent could resolve to an asset that cannot exist; session completion could remain visually `Listening` or another stale runtime override; invalid sprite geometry could proceed as `NaN`; a restarted animator could retain its prior interval; and superseding performance scripts could leave the old override visible until a later cue.
- New behavior: all Main Process diagonal outputs now use `Walk_UpLeft`, `Walk_UpRight`, `Walk_DownLeft`, or `Walk_DownRight`. Session transitions persist `listening`, `thinking`, or semantic `talking` core state, use `Waiting_Response` for `waiting_for_user`, restore Life Activity on idle, and clear the session override so the renderer selects emotional Talk variants. Sprite startup rejects non-finite/zero frame geometry and stops an existing interval before restarting. `performancePlayback.ts` owns one cancellable timeline, honors `startMs`, ignores invalid cue keys, immediately clears a superseded override, and releases its override at completion.
- Animation priority policy: unchanged: drag, release/shutdown, active performance, session, movement, runtime intent, Life Activity, waiting interaction, weighted idle, then `Idle_Neutral`. A talking session is now semantic state, so the renderer applies the same emotional Talk policy consistently.
- Walk direction policy: unchanged browser-coordinate XY resolution; legacy semantic `top_*`/`bottom_*` inputs now translate only to canonical `Up*`/`Down*` asset names. Search confirmed no obsolete diagonal asset names remain in TypeScript production code.
- Files changed: `apps/desktop/electron/main/runtime/AnimationResolver.ts`, `CompanionRuntime.ts`, and their tests; renderer `SpriteAnimator.ts`, `CompanionCanvas.tsx`, `App.tsx`, `animationSelection.test.ts`, new `performancePlayback.ts`/test, and this log.
- Tests added: Main Process canonical diagonal mapping; session talking/waiting/idle state ownership; session-over-Life emotional talk priority; invalid sprite-frame rejection; duplicate-start interval cleanup; and Performance cue timing, invalid-cue rejection, cancellation, and completion release.
- Manual verification: still not performed in this non-interactive workspace. The required per-asset visual trigger/loop/transition/fallback checklist remains a release gate.
- Command verification: `npm.cmd run typecheck` passed; focused onboarding, runtime resolver/session, selection, SpriteAnimator, and Performance playback tests passed (5 files, 20 tests); `npm.cmd run test` passed (52 files, 377 tests); `npm.cmd run arch:check` passed; `npm.cmd run build` passed; `git diff --check` passed. Known non-failing warnings are Node experimental SQLite notices, the existing Vite mixed dynamic/static `character-engine` import warning, and Git LF-to-CRLF working-copy warnings.
- Remaining limitations: manual visual verification of every installed Companion animation (including actual fallback image-load behavior) and focused DOM-level renderer integration tests for movement/drag remain outstanding; they cannot be proven by the available non-interactive test environment.

### Canonical animation API follow-up

- Issue: the character engine still exposed `AnimationKey` in live request, transition, and legacy-performance signatures, despite the renderer and registry using `CompanionAnimationName`.
- Root cause: the compatibility type had been deprecated but the production-facing models and character-engine helpers had not been moved to the canonical type.
- New behavior: `AnimationRequest`, `PerformanceStep`, `nextAnimationState()`, and `animationKeyForBehaviour()` use `CompanionAnimationName`. `AnimationKey` remains only as a `@deprecated` alias for source compatibility and is not used by production animation APIs.
- Tests added: canonical directional input coverage for `nextAnimationState`; character-engine and action-engine focused suites pass (2 files, 48 tests).

### Developer Preview asset availability follow-up

- Issue: selecting an animation in Developer Preview did not reliably change the visible clip.
- Root cause: the preview mounted `CompanionCanvas` without the active `companionId`. The canvas correctly treats persisted `listAssets(companionId)` data as authoritative; without an ID it knew only the required `Idle_Neutral` fallback, so preview selections resolved back to idle.
- New behavior: Settings passes the active primary Companion ID through `DeveloperPreview` to `CompanionCanvas`, so preview selection resolves against that Companion's actual animation files and follows the same fallback rules as the live window.
- Verification: `npm.cmd run typecheck`, `npm.cmd run build`, and `git diff --check` passed. The build retained the pre-existing Vite mixed dynamic/static `character-engine` warning.

### Walk animation lifetime follow-up

- Issue: a Companion could still be moving toward its target after its walk clip was replaced by a refreshed runtime, Life Activity, or idle state.
- Root cause: the active walk direction existed only in the mutable shared `CharacterRuntimeState`; an unrelated Main Process state event could overwrite that preview state before the request-animation-frame interpolation finished.
- New behavior: `CompanionShell` owns a local `movementAnimation` for the lifetime of its active interpolation and clears it only in the movement `finally` block or when drag begins. The animation resolver gives this movement source normal walking priority over stale runtime and Life Activity candidates, while drag/session/performance retain their documented higher-priority interruption rules.
- Tests added: a local movement clip defeats stale runtime intent, and drag still overrides a local walk. `npm.cmd run typecheck`, focused selection/SpriteAnimator tests (2 files, 9 tests), `npm.cmd run build`, and `git diff --check` passed.

### Enter and Leave speech follow-up

- New behavior: the existing instantaneous speech bubble appears when the window begins `Enter` and when exit requests `Leave`, with localized English and Simplified Chinese lines. Lifecycle speech remains independent of typewriter/conversation completion state.
- Tests added: deterministic entry and exit speech selection. `npm.cmd run typecheck`, focused companion-behavior/SpriteAnimator tests (2 files, 9 tests), `npm.cmd run build`, and `git diff --check` passed.

## Companion Window Load Recovery Final Patch

- Issue: first-onboarding closed the Creation Window before the Companion Window was known usable. A main-frame load failure, render-process crash, or early close could leave a blank BrowserWindow referenced for reuse, with no reliable recovery surface.
- Root cause: coordinator execution closed Creation before waiting for the completion broadcast; the Electron adapter treated every `did-fail-load` equally, did not remove its heterogeneous event listeners, and had no invalidation/retry contract for a non-destroyed failed BrowserWindow.
- Old behavior: Main Process created/showed the Companion Window, started runtime/automation, and closed Creation before `did-finish-load`. A later failure cleared only coordinator pending state. The same non-destroyed failed window could still be returned by `ensureCompanionWindow()`.
- New behavior: onboarding keeps Creation open while the Companion Window loads. On readiness it sends `creation:completed`, marks the Companion completed, then closes Creation exactly once. Main-frame `did-fail-load`, main-frame `did-fail-provisional-load`, `render-process-gone`, and pre-completion `closed` settle the attempt as unavailable; subframe failures are ignored. The failed BrowserWindow is destroyed and its global reference cleared, persisted Companion data remains untouched, and the Creation renderer receives a recovery message with a Retry action. Retry uses `creation:retryCompletion`, which resolves the persisted primary only in Main Process and makes another deferred coordinator request.
- Files changed: `apps/desktop/electron/main/index.ts`, `apps/desktop/electron/main/platform/onboardingCompletion.ts`, `apps/desktop/electron/main/platform/onboardingCompletion.test.ts`, `apps/desktop/electron/main/platform/onboardingCompanionWindow.ts`, `apps/desktop/electron/main/platform/onboardingCompanionWindow.test.ts`, `apps/desktop/electron/preload/index.ts`, `apps/desktop/renderer/src/ui/App.tsx`, `packages/shared/src/index.ts`, and this log. The small adapter module was added so Electron frame filtering and listener cleanup are testable without importing the application entry point.
- Tests added: Creation-close timing for immediate and loading windows; completion-send failure; listener-registration failure cleanup; failed-load invalidation with late-load suppression and retry to a new window; render-process late-event suppression; main-frame versus subframe failure; main-frame provisional failure and duplicate final-failure suppression; render-process-gone and closed-before-load handling; and adapter listener cleanup. Existing service coverage continues to prove the first persisted Companion is primary and that data persistence occurs before deferred onboarding.
- Recovery policy: no automatic retry loop. Creation stays open with “Starting your Companion…” while Main Process waits. On a failed window transition, Main Process invalidates the failed window, preserves committed data, emits a recovery event, and offers explicit Retry or Quit. Retry cannot supply Companion data and does not repeat profile/assets/personality creation.
- Verification result: `npm.cmd run typecheck` passed; focused recovery tests passed (3 files, 15 tests); `npm.cmd run test` passed (48 files, 363 tests); `npm.cmd run arch:check` passed; `npm.cmd run build` passed; `git diff --check` passed with only Git LF-to-CRLF working-copy warnings. The build retained the existing non-failing Vite warning about `character-engine` being dynamically and statically imported, plus Node experimental SQLite warnings.
- Remaining limitations: readiness coverage is event-driven from Electron's normal navigation events; a late runtime crash after successful completion is intentionally normal Companion Window lifecycle recovery rather than onboarding rollback. Completion/retry coordinator state remains in-memory and normal startup remains the process-restart recovery path.

## Customization Completion and Window Recovery Final Patch

- Issue: compatibility `creation:completed` could bypass deferred first-onboarding scheduling; the renderer invoked it for both first and additional Companion creation (and for explicit switching); and a loading Companion Window could disappear before `did-finish-load`, leaving the in-memory pending broadcast marker set indefinitely.
- Root cause: the coordinator exposed separate `schedule()` and `completeOnce()` entry points, so the compatibility route could run UI work synchronously. The Creation Shell did not distinguish a primary first-create result from a non-primary additional-create result. Loading broadcast handling subscribed only to `did-finish-load`, with no terminal failure signal.
- Old behavior: `companionNew:create` scheduled first onboarding, but `creation:completed` directly executed it. Every creation result and explicit selection also called compatibility completion. A new non-primary Companion could therefore be rejected by the first-onboarding identity check instead of returning to selection. A destroyed or failed-loading Companion Window could leave pending completion stuck until restart.
- New behavior: `OnboardingCompletionCoordinator.request()` is the sole public first-onboarding API and always queues work with `setImmediate`. The generic create route and compatibility IPC both use the same primary-only request path, so neither synchronously closes windows. The renderer makes no compatibility call for first creation; it leaves Main Process scheduling as the one trigger. Additional creation returns to a refreshed selection list without changing primary. Explicit Start uses `setPrimary()` (which already cancels the old Companion command), refreshes/shows the Companion Window, and closes the Creation Window without involving onboarding. Loading completion now observes `closed`, `did-fail-load`, and `render-process-gone`; a first terminal unavailable event clears pending state, logs the reason, and allows a later request to recreate the window and retry. Only a successful completion broadcast marks onboarding complete.
- Files changed: `apps/desktop/electron/main/index.ts`, `apps/desktop/electron/main/platform/onboardingCompletion.ts`, `apps/desktop/electron/main/platform/onboardingCompletion.test.ts`, `apps/desktop/renderer/src/ui/App.tsx`, `apps/desktop/renderer/src/companion/selection/CompanionSelectionPage.tsx`, `apps/desktop/renderer/src/companion/creation/creationCompletionFlow.ts`, `apps/desktop/renderer/src/companion/creation/creationCompletionFlow.test.ts`, and this log. The small renderer flow module was added solely to make the first-create/additional-create and explicit-switch contract directly testable without broad UI refactoring.
- Tests added: deferred IPC ordering with no synchronous close; duplicate and completed request suppression; non-primary rejection before scheduling; loaded-first single broadcast; unavailable-first cleanup with late-load suppression and retry; late-unavailable suppression after load; post-commit window creation failure cleanup/retry; first-create versus additional-create renderer routing; and explicit Start sequencing. Coordinator failure assertions verify no scheduled, in-progress, pending, or completed marker remains after an unsuccessful attempt.
- Verification result: `npm.cmd run typecheck` passed; focused lifecycle tests passed (2 files, 10 tests); `npm.cmd run test` passed (47 files, 358 tests); `npm.cmd run arch:check` passed; `npm.cmd run build` passed; `git diff --check` passed with only Git LF-to-CRLF working-copy warnings. The build retained the existing non-failing Vite warning about `character-engine` being both dynamically and statically imported, plus Node's experimental SQLite warnings.
- Remaining limitations: completion coordination is intentionally in-memory. A process restart continues through the normal persisted-primary startup path. Electron listeners are neutralized with a local terminal-settlement guard because BrowserWindow/WebContents event APIs do not provide a single shared cancellation handle for the heterogeneous failure events.

## Onboarding Completion IPC Ordering and Idempotency

- Issue: first Companion creation could synchronously complete onboarding from inside `AppServices.create()`, closing the Creation Window before the `companionNew:create` IPC response reached the Renderer; duplicate completion calls could also repeat close/window/runtime/broadcast side effects.
- Root cause: the previous patch made Main Process the owner of onboarding completion, but the service layer still invoked the UI transition callback synchronously, and the coordinator relied on lower-level idempotency rather than owning explicit once-per-Companion state.
- Old behavior: `AppServices.create()` persisted the first primary Companion, consumed the analysis, then called `completeFirstCompanionCreation()`, which started runtime and invoked the Electron completion callback before returning the Companion. Compatibility `creation:completed` and automatic completion shared transition logic but not a strong schedule/execute/broadcast guard.
- New behavior: `AppServices.create()` now only performs data validation, persistence, first-primary assignment, asset writes, asset-root update, and analysis consumption, then returns the persisted Companion. The Electron IPC route schedules onboarding completion with `setImmediate` after `companionNew:create` resolves. One `OnboardingCompletionCoordinator` owns scheduling, execution, loading-window broadcast, and compatibility IPC guards: duplicate schedules are ignored, completed Companions cannot be scheduled again, duplicate completion calls are no-ops, and loading windows get one pending `did-finish-load` broadcast callback.
- Files changed: `apps/desktop/electron/main/services.ts`, `apps/desktop/electron/main/index.ts`, `apps/desktop/electron/main/platform/onboardingCompletion.ts`, `apps/desktop/electron/main/platform/onboardingCompletion.test.ts`, `apps/desktop/electron/main/foundationEventLog.test.ts`, and this log. No renderer code change was required because the creation page already uses `create()` followed by `onComplete(companion)` and does not call `setPrimary(companion.id)`.
- Tests added: modeled IPC ordering proving create result availability before scheduled completion closes the Creation Window; schedule guard coverage for duplicate queued callbacks and completed Companions; completion guard coverage for once-only runtime, automation, window ensures, close, and broadcast; loading-window single-listener/single-broadcast coverage; destroyed-window broadcast cleanup; invalid/non-primary compatibility rejection; and post-commit UI failure retry without marking completion. The service test now asserts first creation returns a primary Companion without synchronously starting runtime/UI completion.
- Verification result: `npm.cmd run typecheck` passed; `npm.cmd run test` passed (46 files, 356 tests); `npm.cmd run arch:check` passed; `npm.cmd run build` passed; `git diff --check` passed with only Git LF-to-CRLF working-copy warnings. Build retained the existing non-failing Vite warning about `character-engine` being both dynamically and statically imported.
- Remaining limitations: completion state is intentionally in-memory; a process restart uses persisted primary Companion state and the normal startup path. If a Companion Window is destroyed before a deferred loading broadcast fires, the coordinator logs and leaves onboarding uncompleted so a later retry or restart can recover.

## Onboarding Security and Data Integrity Final Patch

- Issue: final onboarding security review found legacy Ann migration could delete on incomplete ownership evidence, Companion asset paths were built in multiple places, `companion://` could serve unchecked paths, renderer-side asset assumptions were trusted, personality analyses were unbounded, the renderer repeated first-create primary assignment, and onboarding completion still depended on renderer notification.
- Root cause: the previous onboarding pass established the right product flow but left security and lifecycle ownership split across database migration, protocol handling, services, and renderer shell code.
- Old behavior: legacy Ann deletion used a short related-table list; protocol/read/delete/upload/list operations assembled paths independently; unsupported protocol assets could fall through to generic serving; Main Process accepted non-empty animation buffers without PNG/dimension/sprite validation; consumed analyses remained in memory as used entries; first creation could call `setPrimary` twice; and a renderer crash after persistence could leave the app in onboarding until restart.
- New behavior: legacy Ann deletion now requires an exact original built-in profile, no custom assets, no ownership rows discovered through schema identity columns, and no meaningful app activity; uncertainty preserves Ann as user-owned. Asset operations use one resolver with Companion existence, subfolder, basename, relative-path, containment, extension, regular-file, and symlink checks. Main Process validates PNG signature, IHDR dimensions, per-file and total byte limits, and sprite-sheet frame shape before writing. Personality analysis proofs are pruned, capped at 50, deleted on successful consumption, and restored for safe retry after data failure. First creation sets primary only in Main Process; selection remains the explicit switch path. Successful first creation calls an idempotent Main Process onboarding coordinator that starts runtime/automation, creates windows once, closes creation, and broadcasts completion.
- Files changed: `apps/desktop/electron/main/services.ts`, `apps/desktop/electron/main/index.ts`, `apps/desktop/electron/main/platform/companionAssetPaths.ts`, `apps/desktop/electron/main/platform/companionProtocol.ts`, `apps/desktop/electron/main/platform/onboardingCompletion.ts`, `apps/desktop/renderer/src/companion/creation/CompanionCreationPage.tsx`, `apps/desktop/renderer/src/ui/App.tsx`, `packages/database/src/index.ts`, `packages/shared/src/index.ts`, and focused tests. The extra platform helpers were added so protocol behavior and onboarding completion could be tested directly rather than only through `index.ts` wiring.
- Tests added: legacy renamed/personality/data/assets/exploration/relationship/uncertainty/idempotency coverage; asset resolver traversal, containment, subfolder, unknown Companion, directory, extension, and symlink coverage; direct protocol valid/nested/unsupported/missing/malformed/unknown/traversal/directory/symlink coverage; Main Process PNG signature, zero dimensions, size limits, total limit, sprite width, frame count, duplicates, missing required asset, failed-write rollback, analysis pruning/deletion/retry/cap/reuse, and first/second primary ownership coverage.
- Migration behavior: exact untouched legacy Ann is still removed; renamed, personality-modified, memory-bearing, exploration-bearing, relationship-bearing, asset-bearing, or uncertain Ann is preserved with `is_builtin=0`. Table discovery inspects current schema for `companion_id`, `character_id`, `from_companion_id`, and `to_companion_id`; query/filesystem uncertainty fails closed to preservation.
- Security checks: central resolver rejects empty/separator-bearing Companion IDs, arbitrary subfolders, basename traversal, encoded traversal, absolute paths, null bytes, containment escape, unsupported extensions at call sites, non-file read/delete/serve targets, and symlink paths. Protocol rejects raw encoded dot/slash/backslash sequences before URL normalization, then resolves through the same helper. Search review found no remaining exact `setPrimary(companion.id)`, no direct user-controlled `app.getPath('userData')/companions/...input` joins, no `application/octet-stream` protocol fallback, and protocol `url.hostname`/`url.pathname` parsing only in the reviewed helper.
- Verification result: `npm.cmd run typecheck` passed; `npm.cmd run test` passed (46 files, 351 tests); `npm.cmd run arch:check` passed; `npm.cmd run build` passed; `git diff --check` passed with only Git LF-to-CRLF working-copy warnings. Build retained the existing non-failing Vite warning about `character-engine` being both dynamically and statically imported.
- Remaining limitations: protocol URLs still use URL host/path parsing after the raw encoded-traversal guard, which is acceptable because final resolution is centralized and containment-checked. Symlink tests are best-effort on platforms that allow creating symlinks. Main Process validates PNG headers and dimensions without full image decode by design.

## Mandatory First Companion Onboarding

- Issue: fresh installs silently received a built-in Ann profile, and runtime/UI paths assumed a fallback identity and asset package before the user created a Companion.
- Root cause: database bootstrap insertion, permissive identity resolution, eager scheduler startup, renderer-side personality parsing, and hardcoded character/asset fallbacks collectively bypassed onboarding ownership.
- Old behavior: a fresh database contained Ann; missing identity resolved to a default; normal windows and automation could start before creation; renderer input could supply personality values; partial asset writes could leave a profile behind.
- New behavior: fresh databases contain zero Companions; strict resolution throws `NO_ACTIVE_COMPANION` while the nullable resolver supports gates; startup exposes creation only until a primary profile exists; Main Process AI analysis produces a short-lived single-use proof; creation validates the shared required-animation manifest and atomically rolls back profile/assets on failure; the only Companion cannot be deleted; primary selection validates transactionally.
- Files changed: database and shared contracts; character/AI/curiosity/diary/discovery/insight engines where default identity or Ann wording leaked; Electron main/preload services and startup; creation/edit/runtime renderer components; focused tests. This wider scope was required because the legacy default crossed package boundaries rather than existing only in onboarding UI.
- Tests added: fresh-database zero state and strict resolution; untouched/customized/data-bearing/custom-asset legacy migration; invalid primary and only-Companion deletion; runtime gating; untrusted personality rejection; valid/malformed Main Process AI analysis; and atomic profile rollback on asset persistence failure. Existing engine fixtures now create or pass explicit identities.
- Migration behavior: only the exact untouched legacy `id='ann'`, `is_builtin=1` profile with no related data and no custom asset files is removed. Customized, data-bearing, or asset-bearing profiles are preserved and converted to ordinary user-owned profiles (`is_builtin=0`). The `is_builtin` and `why_ann_found_it` database columns and legacy Ann path checks remain solely as historical migration/storage compatibility.
- Verification result: `npm.cmd run typecheck` passed; `npm.cmd run test` passed (43 files, 335 tests); `npm.cmd run arch:check` passed; `npm.cmd run build` passed. `git diff --check` passed. The build retained the existing non-failing Vite warning about mixed dynamic/static `character-engine` imports.
- Search review: no production default character constant/package, built-in creation, fallback character visual, Ann UI label, or Ann runtime identity remains. Exact Ann production matches are restricted to the safe legacy migration and historical asset filenames/schema columns; test fixtures intentionally continue to exercise legacy compatibility.
- Remaining limitations: personality analysis requires configured AI access and fails closed when unavailable or malformed. Creation requires all manifest entries marked `requiredForCreation`; optional animation assets can be added later through editing.

## Command Deferral and Terminal Cleanup

- Issue: a command deferred because another command was active was only logged, while recovery validation could silently discard an active record.
- Root cause: command activation did not report acceptance to the runtime/pending-action owner, and terminal state mutation was split between acknowledgement and recovery paths.
- Old behavior: a blocked immediate decision lost its Discovery intent; Companion mismatch and expiry assigned `activeCommand = null` without a lifecycle event.
- New behavior: pending-action ownership remains in `DecisionCoordinator`; activation acceptance controls completion of a pending action; all internal and renderer terminal outcomes use one AppServices transition method.
- Files changed: `services.ts`, `CompanionRuntime.ts`, `DecisionCoordinator.ts`, focused tests, and this log. Database changes are limited to updating an existing pending action's defer reason where it prevents a duplicate action.
- Tests added: pending deferral/re-evaluation and centralized terminal cleanup coverage.
- Verification result: `npm.cmd run typecheck` passed; `npm.cmd run test` passed (43 files, 325 tests); `npm.cmd run arch:check` passed; `npm.cmd run build` passed. The build retains its pre-existing non-failing Vite dynamic/static import warning for `character-engine`.
- Remaining limitations: no renderer command queue or stale-command replay is introduced; pending actions remain the sole durable intent representation.
- Search review: the only production `activeCommand = null` is inside centralized accepted terminal transition handling. `CompanionCommandDeferred` now coincides with Runtime preservation of a pending action; `getActiveCommand` delegates mismatch/expiry to the same terminal transition. `tryActivateCommand`, acknowledgement, re-evaluation, and deferred-enqueue matches are the intended authoritative path.

## Command Lifecycle Final Stabilization

### Total deadline and cancellation settlement

- Issue: a command could remain forever in `received`, and cancellation could attempt duplicate settlement.
- Root cause: timeout started after `handle.started`; the presentation handle had no phase guard.
- Old behavior: only completion was timed; cancellation rejected both promises indiscriminately.
- New behavior: one deadline races the complete lifecycle from receipt; timeout reports `command_start` or `presentation` accurately. Local handle phases make cancellation, completion, and late callbacks idempotent.
- Files changed: `commandLifecycle.ts`, `commandLifecycle.test.ts`, and `App.tsx`.
- Tests added: timeout before/after start, late start/completion, shutdown/unmount cancellation, and double cancellation.
- Verification result: passed in the final suite.
- Remaining limitations: request-animation-frame is still the visible-start signal by design, now bounded by the total deadline.

### Main activation, recovery, and issued state

- Issue: a second command could replace an active record; recovery used primary identity; records falsely began as `received`.
- Root cause: direct record assignment, primary lookup, and no internal issued state.
- Old behavior: active commands could be overwritten, recovery could cross Companion identity, and a real renderer receipt acknowledgement was discarded.
- New behavior: `tryActivateCommand()` defers a conflicting command, recovery uses `resolveActiveCompanionId()`, and records transition from `issued` through real renderer acknowledgements only.
- Files changed: `services.ts` and `foundationEventLog.test.ts`.
- Tests added: issued/received/started/completed, failure/cancellation, invalid and duplicate transitions, deferred second command, terminal reactivation, active non-primary resolver, previous Companion, and expiry recovery.
- Verification result: passed in the final suite.
- Remaining limitations: commands remain intentionally in-memory for the single-runtime scope.

### Shutdown and temporary prompt cleanup

- Issue: shutdown relied on React cleanup, and the obsolete command-reliability execution prompt remained in the repository.
- Root cause: no explicit renderer shutdown cancellation path and temporary task material was retained after the previous pass.
- Old behavior: exit could bypass a lifecycle acknowledgement; the old prompt remained at `tasks/temp-task/our-companion-command-execution-reliability.md`.
- New behavior: exit animation and `beforeunload` explicitly cancel active work with `window_shutdown`; the temporary prompt is deleted while this durable execution log remains.
- Files changed: `App.tsx`, this log, and the removed temporary prompt.
- Tests added: executor shutdown cancellation coverage.
- Verification result: passed in the final suite.
- Remaining limitations: compatibility-only renderer fields (`mode`, `mood`, `energy`, `focus`, `initiativeLevel`, and `debugOverride`) remain non-decision UI state; broad cleanup is intentionally out of scope.

- Final verification: `npm.cmd run typecheck` passed; `npm.cmd run test` passed (43 files, 335 tests); `npm.cmd run arch:check` passed; `npm.cmd run build` passed. The build retained its pre-existing Vite dynamic/static import warning for `character-engine`, with no build failure.
- Search review: no production `latestStatus: 'received'` or legacy renderer behavior path remains. `getPrimaryCompanion()` matches are unrelated companion/profile, exploration, or presentation code; command recovery uses `resolveActiveCompanionId()`. Remaining `activeCommand` assignments are only activation and terminal discard/clear. `commandCompletionRef`, timeout, busy, unmount, and shutdown matches are intentional lifecycle code and tests. No reference to the removed command-reliability prompt remains; unrelated archived `tasks/temp-task` references in historical documentation were preserved.

## Command Execution Reliability Pass

- Issue: renderer command execution could be duplicated after a render, overwrite a pending presentation resolver, report `started` before rendering, and remain pending if typewriter completion did not fire. Main-process recovery could also return terminal commands and accept invalid acknowledgement ordering.
- Current flow: main process emits one authoritative `CompanionCommand`; IPC event delivery and `getActiveCommand()` recovery both enter the renderer executor; renderer reports lifecycle acknowledgements to the current `CompanionRuntime` coordinator.
- Failure mode: closure-local handled IDs were lost when the executor was recreated; event/recovery races executed twice; the single unkeyed resolver could be overwritten; no timeout or cancellation existed; lifecycle status was accepted without command/Companion/transition validation.
- Files involved: `useCompanionBehavior.ts`, `commandLifecycle.ts`, `commandLifecycle.test.ts`, `App.tsx`, `services.ts`, and this log. No additional production files were required.
- Old behavior removed: closure-local-only idempotency, automatic `started` acknowledgement after invocation, unkeyed `commandCompletionRef`, and status-set-only acknowledgement acceptance.
- New behavior: stable ref-backed handled and active stores unify IPC and recovery; presentation returns a keyed execution handle whose `started` resolves at its first render frame and whose `completed` resolves at the documented endpoint (`show_soft_hint`: rendered; `present_discovery`: typewriter completed). Commands time out after 45 seconds with `failed: command_timeout`; unmount cancels active work; conflicts fail with `renderer_busy`; unsupported hints fail explicitly. Main process accepts only valid forward lifecycle transitions for the current active command and suppresses terminal recovery.
- Tests added: truthful start/completion, duplicate event/recovery delivery, recreation with shared stores, timeout and late completion, and active-command conflict.
- Verification result: `npm.cmd run typecheck` passed. Full test, architecture, and build verification are run after this implementation pass.
- Renderer state ownership: `discoveryPresentationState` and timestamp fields are display-only presentation history; `debugOverride` is debug-only. Legacy `mode`, `mood`, `energy`, `focus`, and `initiativeLevel` remain only for existing UI compatibility and are not consulted for behavioral decisions; their removal is outside this narrowly scoped command repair.

## Phase 1 — True single decision ownership

### P0-1: Deferred command emission

- Issue: `CompanionRuntime.decideForDiscovery()` emitted a renderer command before honoring the decision timing.
- Root cause: command emission preceded deferred-action enqueueing.
- Old flow removed: unconditional command emission for every discovery decision.
- New flow: commands are emitted only when the decision is `share_discovery` with `timing: now`; `next_idle` is stored for re-evaluation, and all other results stay renderer-silent.
- Files changed: `apps/desktop/electron/main/runtime/CompanionRuntime.ts`.
- Tests added: `CompanionRuntime.test.ts` covers `now`, `next_idle`, `later`, and silence.
- Verification result: typecheck and test pass.
- Remaining limitations: pending-action visibility is deliberately deferred to Phase 5.

### P0-2: Remove renderer high-level decision flow

- Issue: the renderer re-evaluated behavior from display hints on a 30-second timer.
- Root cause: `useCompanionBehavior` owned an advisory hint, periodic evaluation, and local suppression decision flow.
- Old flow removed: `CompanionBehaviorController`, `applyBehaviorHint`, `decisionTimerRef`, `companion:behaviorHint`, and polling for behavior hints.
- New flow: main process publishes an authoritative `companion:command`; renderer stores the active command and executes its display action only.
- Files changed: `services.ts`, `index.ts`, preload API, shared IPC types, renderer hook, and `App.tsx`.
- Tests added: legacy-removal test asserts no renderer decision timer or hint path remains.
- Verification result: typecheck and test pass.
- Remaining limitations: only the single present Companion is supported, by product scope.

### P0-3: Truthful command acknowledgement

- Issue: renderer acknowledged `started` merely when a command event arrived.
- Root cause: no command execution lifecycle existed.
- Old flow removed: event-receipt-as-started acknowledgement.
- New flow: renderer reports `received` after validation, `started` after dispatching the first display action, and `completed` only after that action resolves; stale commands report `cancelled`, exceptions report `failed`. Main process de-duplicates acknowledgement status per command.
- Files changed: shared command types, `commandLifecycle.ts`, renderer hook, `AppServices`.
- Tests added: lifecycle ordering, stale cancellation, duplicate delivery, and failed execution.
- Verification result: typecheck and test pass.
- Remaining limitations: command lifecycle is in-memory; persistence is not required for the current single-runtime scope.

## Phase 2 — Memory integrity

- Issue: corrections could invalidate the first unrelated fact; confirmation candidates were not handled.
- Root cause: correction matching selected the first active fact, while confirmation had no product resolution path.
- Old flow removed: automatic first-match supersession.
- New flow: corrections are classified before preference extraction, marked confirmation-required, and safely discarded with a logged reason until a confirmation UI is delivered.
- Files changed: `runtime/MemoryPolicy.ts` and tests.
- Tests added: unrelated memory and ambiguous correction coverage.
- Verification result: focused and repository test suites pass.
- Remaining limitations: the repair brief explicitly permits safe discard until confirmation UI is introduced.

## Phase 3 — Session and life state

- Issue: session close fell through to generic handling; life state and music cooldown were global; sleep was unreachable.
- New flow: closing phases use one close path; life state/cooldown are keyed by Companion; night candidates include sleeping.
- Files changed: `CompanionRuntime.ts`, `LifeCoordinator.ts`, and tests.
- Tests added: per-Companion isolation and night sleep selection.
- Verification result: focused and repository test suites pass.

## Phase 4 — Animation semantics

- Issue: silent thinking resolved to talking-thinking and walking always resolved right.
- New flow: silent thinking resolves to `Think`, speaking-thinking to `Talk_Thinking`, and walk intent has eight directions.
- Files changed: shared animation intent, resolver, and tests.
- Tests added: all direction mappings and thinking distinction.
- Verification result: focused and repository test suites pass.

## Phase 5 — Product integration

- New flow: discovery feedback records a database-backed topic preference aggregate independently from relationship signals; positive topic scores feed future discovery interests. Attention mode is exposed in Settings and persisted in application settings.
- Files changed: shared types, database service, discovery feedback, runtime startup, IPC, preload, and Settings UI.
- Tests added: topic preference aggregation.
- Remaining limitations: deferred-discovery visibility remains in the existing panel/debug path; a dedicated end-user queue card is still future UI work.
