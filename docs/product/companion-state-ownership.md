# Companion State Ownership

Each state field has exactly one owner. Renderers display; they do not invent parallel state.

## Identity and Profile

| Field | Owner | Storage | Consumers |
|-------|-------|---------|-----------|
| Active companion ID | Main `DatabaseService.getPrimaryCompanion()` | `companions.is_primary` | All services via `resolveActiveCompanionId()` |
| Companion profile | Main `companionNew` service | `companions` table | Creation UI, asset resolver |
| Built-in Ann flag | Main DB | `companions.is_builtin` | Ann-first UX gates |

## Relationship (per user-companion pair)

| Field | Owner | Storage | Consumers |
|-------|-------|---------|-----------|
| familiarity, trust, comfort | Main `CompanionRuntime` relationship service | `companion_relationships` | Decision engine, initiative budget |
| preferredInteractionFrequency | Main + settings UI | `companion_relationships` + `app_settings` | Initiative evaluator |
| recentPositive/Ignored/Corrections | Main relationship service | `companion_relationships` | Decision policy gates |

## Memory

| Field | Owner | Storage | Consumers |
|-------|-------|---------|-----------|
| Memory content + type | Main memory service | `memory_nodes` (scoped) | Chat extraction, panel, retrieval |
| Memory metadata | Main memory service | `memory_nodes.metadata_json` | AI context builder (filtered) |
| Corrections/supersedes | Main memory service | metadata fields | Retrieval excludes superseded |

## Conversation

| Field | Owner | Storage | Consumers |
|-------|-------|---------|-----------|
| Session phase | Main `ConversationRuntime` | `conversation_sessions.phase` | Renderer display, discovery gate |
| Messages | Main `companion.turn` | `companion_messages` + `session_id` | History, LLM context |
| Topic continuity | Main `TopicManager` | session metadata | Turn handler |

## Character Runtime

| Field | Owner | Storage | Consumers |
|-------|-------|---------|-----------|
| coreState, intent, emotion | Main character service | `character_state` | Animation, discovery gate |
| animationIntent | Main character service | `character_state` (animation_intent) | Renderer `CompanionCanvas` player |
| position | Renderer reports, main persists | `character_state.position_json` | Window placement |

## Decision

| Field | Owner | Storage | Consumers |
|-------|-------|---------|-----------|
| Final action per cycle | Main `decideUnifiedCompanionAction` | Ephemeral + foundation log | Orchestrator, renderer hints |
| Initiative budget | Main `InitiativeBudget` | `app_settings` + relationship | Share timing |

## Discovery

| Field | Owner | Storage | Consumers |
|-------|-------|---------|-----------|
| Candidate pool | Main discovery pipeline | `discoveries` table | Scheduler |
| Presentation queue | Main `DiscoveryShareOrchestrator` | In-memory (main only) | IPC announce |
| Presentation UI state | Renderer | React state (display only) | Card, soft hint |

## Layers (non-overlapping)

```
Identity     → permanent (companions)
Personality  → stable (personality_json)
Relationship → slow (companion_relationships)
Mood         → medium (emotion_json, decays)
Emotion      → short (emotion peaks)
Context      → immediate (session phase, activity)
```

Relationship does **not** grant tool permissions. Personality does **not** become temporary emotion.
