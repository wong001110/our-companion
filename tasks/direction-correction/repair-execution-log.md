# Repair Execution Log

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
