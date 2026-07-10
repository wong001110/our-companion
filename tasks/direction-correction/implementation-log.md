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
