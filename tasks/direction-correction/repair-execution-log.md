# Repair Execution Log

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

- Final verification: `npm.cmd run typecheck` passed; `npm.cmd run test` passed (43 files, 322 tests); `npm.cmd run arch:check` passed; `npm.cmd run build` passed. The build retained its pre-existing Vite dynamic/static import warning for `character-engine`, with no build failure.
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
