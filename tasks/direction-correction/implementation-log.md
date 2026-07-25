# Direction Correction Implementation Log

## Phase 1 — Audit

| Area | Old flow | New flow | Files removed | Verification |
|------|----------|----------|---------------|--------------|
| Documentation | None | Audit + ownership docs | — | Docs created |

## Phase 2 — Companion Core

| Area | Old flow | New flow | Files removed | Verification |
|------|----------|----------|---------------|--------------|
| Active companion | `characters` + dual primary | `companions.resolveActiveCompanionId()` | Legacy character table reads in `getActiveCharacters` | `direction-correction.test.ts` |
| Decision | V1 logging + renderer brain | `decideUnifiedCompanionAction` + `CompanionRuntime` | `emitDecisionEventsForDiscovery`, renderer decision logic | `unified-decision.test.ts` |
| Relationship | Hardcoded 0.75 trust | `companion_relationships` table | Hardcoded trust in decision events | DB tests |
| Memory | Global untyped | Scoped typed `memory_nodes` | — | DB tests |
| Conversation | Flat messages | `conversation_sessions` + session FK | — | Runtime wired |
| Animation intent | `stateToIntent` in renderer | `animationIntent` on `character_state` | Renderer defers to state field | CompanionCanvas update |
| Life scheduler | Renderer-only timers | `CompanionRuntime.startLifeScheduler` | — | Main process timer |

## Phase 3 — Discovery

| Area | Old flow | New flow | Files removed | Verification |
|------|----------|----------|---------------|--------------|
| Announce | Direct broadcaster + event bus duplicate | Orchestrator + event bus only | `characterState`/`discoveryAnnounce` in attachAutonomyBroadcasters | index.ts |
| Autonomy share | Direct `discoveryAnnounceBroadcaster` | Orchestrator enqueue gated by brain | Direct announce call | services.ts |
| Daily cap | `dailySharedCount >= 3` | Initiative budget | V1 rule in production path | unified-decision tests |
| Feedback | `not_interested` only distinction | Added `not_now` type | — | services.ts |

## Phase 4 — Product Surface

| Area | Old flow | New flow | Verification |
|------|----------|----------|--------------|
| Panel Chat/Ask | Duplicate tabs | Single Chat tab | Tab type updated |
| Debug | Always available via localStorage | Gated to `import.meta.env.DEV` | App.tsx |
| Diary | Generic entry | `companion_reflection` perspective | diary-engine |

## Phase 5 — Cleanup

Pending: remove deprecated IPC, stale tests update, full validation run.

## Behavioral Correction Pass

| Issue | Current behavior | Expected behavior | Files involved | Legacy/placeholder removed | Tests added | Verification |
|-------|------------------|-------------------|----------------|----------------------------|-------------|--------------|
| 1 next_idle | `shouldPresentDiscovery` treats `next_idle` same as `now` | Defer to `PendingCompanionAction`; present only on re-eval | `runtime/DecisionCoordinator.ts`, `CompanionRuntime.ts`, `services.ts` | Immediate `next_idle` presentation | `decisionCoordinator.test.ts` | Pass |
| 2 Sessions | Global `activeSessionId` | Per `userId+companionId` via DB + cache | `runtime/ConversationCoordinator.ts`, `database` | Global session field | `conversationCoordinator.test.ts` | Pass |
| 3 Memory | `userMessage.length >= 20` auto-capture | Candidate pipeline with safety checks | `runtime/MemoryPolicy.ts` | Length gate, assistant-only summary | `memoryPolicy.test.ts` | Pass |
| 4 Relationship | Every turn → `positive` + trust | Separate `RelationshipSignal` effects | `runtime/RelationshipPolicy.ts`, `services.ts` | `recordInteraction('positive')` on turn | `relationshipPolicy.test.ts` | Pass |
| 5 Feedback | `not_interested` → `ignored_discovery` | Topic/timing/interaction domains | `RelationshipPolicy.ts`, `database`, `decision-engine` | Cross-domain mapping | `relationshipPolicy.test.ts` | Pass |
| 6 Context | Fabricated fatigue 60/15, mode from session | `UserAttentionContext` real signals only | `CompanionRuntime.ts`, `decision-engine` | Hardcoded fatigue/mode | `attentionContext.test.ts` | Pass |
| 7 Animation | Raw `Sleep`, `Talk`, `Think` keys | `AnimationIntent` → resolver → asset key | `runtime/AnimationResolver.ts` | Raw semantic keys in runtime | `animationResolver.test.ts` | Pass |
| 8 Commands | `behaviorHint` advisory IPC | `CompanionCommand` + lifecycle acks | `index.ts`, `preload`, renderer hooks | Hint-as-decision ambiguity | behavior controller tests | Pass |
| 9 Daily life | Random activity every 60–180s | Duration-aware `LifeCoordinator` | `runtime/LifeCoordinator.ts` | `Math.random()` activity pick | `lifeCoordinator.test.ts` | Pass |
| 10 Boundaries | Monolithic `companionRuntime.ts` | Internal coordinators under `runtime/` | `runtime/*` | Single-file runtime | runtime test suite | Pass |

### Caller audit (pre-change)

| Symbol | Callers |
|--------|---------|
| `shouldPresentDiscovery` | `services.ts` (autonomy share, refresh, canAnnounce) |
| `setSessionPhase` | `services.companion.reportSessionPhase` ← renderer `useCompanionSession` |
| `getActiveSessionId` | `services.companion.turn` |
| `extractMemoryFromTurn` | `services.companion.turn` |
| `recordInteraction` | `services.companion.turn`, `submitDiscoveryFeedback` |
| `decideForDiscovery` | `services.ts` autonomy + refresh |
| `advanceWithIntent` | `services.ts` character + feedback |
| `behaviorHint` IPC | `index.ts`, `services.attachAutonomyBroadcasters`, preload `onBehaviorHint` |

## Phase 6 — Memory and Proactive Productization

| Area | Old surface | New surface | Verification |
| --- | --- | --- | --- |
| Vector Memory | Developer diagnostics only | Normal Settings status/install/rebuild with explicit fallback | Vector status tests + packaged checklist |
| Memory management | Free-form normal-user editor | Read-only review, confirm, ask again and pause use | Review transition tests + UI checklist |
| Proactive behavior | Random life activity + Discovery only | Existing scheduler evaluates unfinished topic, Goal, Journey and quiet presence | Policy tests + runtime-time checklist |
| Documentation | Product decisions scattered across task briefs | Product specs, state ownership, core loop, README and release checklists | Documentation review |
