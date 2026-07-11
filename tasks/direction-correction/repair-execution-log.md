# Repair Execution Log

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
