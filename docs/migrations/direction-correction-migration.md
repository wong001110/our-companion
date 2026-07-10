# Direction Correction Migration

## Tables Changed

| Table | Change |
|-------|--------|
| `character_state` | Added `animation_intent`, `life_activity` |
| `memory_nodes` | Added `companion_id`, `user_id`, `memory_type`, `metadata_json` |
| `companion_messages` | Added `session_id` |
| `conversation_sessions` | **New table** |
| `companion_relationships` | **New table** |
| `companions` | Added `is_builtin`; seeds built-in Ann |

## Deprecated (do not use in new code)

| Item | Replacement | Removal target |
|------|-------------|----------------|
| `characters` table reads in production | `companions` + `resolveActiveCompanionId()` | Phase 5 |
| `character:setPrimary` as canonical API | `companionNew:setPrimary` | Phase 5 |
| `decideCompanionAction` V1 in production | `decideUnifiedCompanionAction` | Complete |
| Direct `discoveryAnnounceBroadcaster` | `DiscoveryShareOrchestrator` + event bus | Complete |
| Renderer `decideCompanionBehavior` decisions | `applyBehaviorHint` + main brain | Complete |
| Fixed `dailySharedCount >= 3` rule | Initiative budget | Complete |

## Data Transformation

- Existing `memory_nodes` without `companion_id` remain readable globally; new writes are scoped.
- Built-in Ann inserted if no companion with id `ann` exists.
- `characters` table data not auto-merged; `companions` is canonical.

## Rollback Notes

- Migration columns use `ALTER TABLE` with pragma checks; rollback requires manual column ignore (SQLite cannot drop columns easily).
- Relationship and session tables can be dropped without affecting core chat.

## Compatibility Window

Deprecated IPC routes remain until Phase 5 cleanup. `character:*` routes delegate to `companions` where applicable.

## Behavioral Correction Pass

| Table/Column | Change |
|--------------|--------|
| `conversation_sessions.close_reason`, `unfinished_topic` | Session lifecycle metadata |
| `pending_companion_actions` | Deferred `next_idle` decisions |
| `discovery_feedback.feedback_domain` | Separates topic / timing / interaction feedback |

Existing relationship and message data preserved. Ambiguous memories are not promoted to stronger facts.
