# Behavioral Correction Review

## Issue 1 — `next_idle` deferral

| | |
|---|---|
| Root cause | `shouldPresentDiscovery` treated `next_idle` same as `now` |
| Old behavior removed | Immediate enqueue on `next_idle` |
| New behavior | `DecisionCoordinator` queues `PendingCompanionAction`; `shouldPresentNow` gates orchestrator |
| Files changed | `runtime/DecisionCoordinator.ts`, `runtime/CompanionRuntime.ts`, `services.ts`, `database` |
| Tests | `decisionCoordinator.test.ts` |
| Known limitations | Re-eval requires discovery ID on pending row |

## Issue 2 — Per-companion sessions

| | |
|---|---|
| Root cause | Global `activeSessionId` in monolithic runtime |
| Old behavior removed | Single session pointer |
| New behavior | `ConversationCoordinator` with `userId:companionId` cache + DB source of truth |
| Files changed | `runtime/ConversationCoordinator.ts`, `database` |
| Tests | `conversationCoordinator.test.ts` |
| Known limitations | Session timeout policy uses close on inactive phase only |

## Issue 3 — Memory policy

| | |
|---|---|
| Root cause | `userMessage.length >= 20` auto-capture |
| Old behavior removed | Length gate, assistant-only summary, memory-side positive interaction bump |
| New behavior | `MemoryPolicy` candidate pipeline with safety heuristics |
| Files changed | `runtime/MemoryPolicy.ts` |
| Tests | `memoryPolicy.test.ts` |
| Known limitations | Classification is heuristic; LLM-assisted classification deferred |

## Issue 4 — Relationship signals

| | |
|---|---|
| Root cause | Every turn called `recordInteraction('positive')` |
| Old behavior removed | Turn → positive + trust |
| New behavior | `RelationshipPolicy.applySignal` with typed `RelationshipSignal` |
| Files changed | `runtime/RelationshipPolicy.ts`, `services.ts` |
| Tests | `relationshipPolicy.test.ts` |
| Known limitations | `user_correction` not yet wired from chat UI |

## Issue 5 — Feedback domains

| | |
|---|---|
| Root cause | `not_interested` mapped to `ignored_discovery` |
| Old behavior removed | Cross-domain feedback mapping |
| New behavior | `feedbackDomain` on `discovery_feedback`; topic vs interaction separation |
| Files changed | `RelationshipPolicy.ts`, `database`, `decision-engine` |
| Tests | `relationshipPolicy.test.ts` |
| Known limitations | Topic preference store is feedback rows only |

## Issue 6 — User attention context

| | |
|---|---|
| Root cause | Fabricated `fatigueScore: 60/15` and session→focused mode |
| Old behavior removed | Hardcoded fatigue and mode |
| New behavior | `UserAttentionContext` → `attentionToUserContext` boundary |
| Files changed | `runtime/attentionContext.ts`, `CompanionRuntime.ts`, `decision-engine` |
| Tests | `attentionContext.test.ts` |
| Known limitations | `explicitMode` IPC not yet exposed to settings UI |

## Issue 7 — Animation intent

| | |
|---|---|
| Root cause | Raw keys `Sleep`, `Talk`, `Think` emitted from runtime |
| Old behavior removed | `animationForActivity` raw semantic keys |
| New behavior | `AnimationIntent` → `AnimationResolver` → production asset key |
| Files changed | `runtime/AnimationResolver.ts`, `CompanionRuntime.ts` |
| Tests | `animationResolver.test.ts` |
| Known limitations | Renderer personality-weighted idle remains clip fallback only |

## Issue 8 — Command ownership

| | |
|---|---|
| Root cause | `behaviorHint` implied advisory renderer decisions |
| Old behavior removed | Untyped decision-only IPC payload |
| New behavior | `CompanionCommand` + `reportCommandAck`; renderer executes only |
| Files changed | `shared`, `preload`, `services.ts`, `useCompanionBehavior.ts` |
| Tests | `CompanionBehaviorController.test.ts` (existing) |
| Known limitations | Replaced in Phase 1 by the authoritative `companion:command` channel. |

## Issue 9 — Daily life

| | |
|---|---|
| Root cause | Random activity every 60–180s |
| Old behavior removed | `Math.random()` activity selection in `tickLife` |
| New behavior | `LifeCoordinator` with minimum duration, cooldown, injectable clock/RNG |
| Files changed | `runtime/LifeCoordinator.ts` |
| Tests | `lifeCoordinator.test.ts` |
| Known limitations | Personality weights not yet applied to activity selection |

## Issue 10 — Runtime boundaries

| | |
|---|---|
| Root cause | Monolithic `companionRuntime.ts` |
| Old behavior removed | Single-file implementation |
| New behavior | Internal coordinators under `apps/desktop/electron/main/runtime/`; `CompanionRuntime` remains public API |
| Files changed | `runtime/*`, `companionRuntime.ts` (re-export) |
| Tests | All runtime `*.test.ts` |
| Known limitations | No new packages; coordinators are in-process only |

## Grep audit (remaining matches)

| Pattern | Status |
|---------|--------|
| `dailySharedCount >= 3` | V1 `decideCompanionAction` only (`decision-engine/index.ts`) — not production path |
| `ignored_discovery` | Legacy test fixture in `decision-engine.test.ts` only |
| `fatigueScore: 60/15`, `userMessage.length < 20`, `Sleep`/`Talk` keys, `activeSessionId` | Removed from production runtime |

## Verification

All passed: `npm run typecheck`, `npm run test` (307), `npm run arch:check`, `npm run build`.
