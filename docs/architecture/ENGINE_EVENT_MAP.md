# Engine Event Map

All events emitted in the system, their sources, triggers, and potential consumers.

---

## Event Bus Architecture

Events flow through `@our-companion/event-bus` (in-process pub/sub). Currently, all events are emitted from `apps/desktop/electron/main/services.ts` — no engine subscribes to events directly.

---

## Current Event Catalog

### Character Events

| Event Type | Emitted By | Trigger | Payload |
|-----------|-----------|---------|---------|
| `AnnStateChanged` | services.ts | Character state/intent/position changes | `{ characterId, coreState, intent, position? }` |
| `EmotionChanged` | services.ts | Emotion event applied (discovery accepted/rejected, voice turn) | `{ characterId, reason }` |

**Potential Consumers**:
- `curiosity-engine` — adjust curiosity targets based on character mood
- `diary-engine` — record emotional milestones

### Discovery Events

| Event Type | Emitted By | Trigger | Payload |
|-----------|-----------|---------|---------|
| `SignalCaptured` | services.ts | New discovery inserted or audio transcribed | `{ sourceType, title, summary, url? }` |
| `DiscoveryCreated` | services.ts | New discovery inserted into database | `{ discoveryId, title, status, url }` |

**Potential Consumers**:
- `decision-engine` — trigger decision pipeline for new discovery
- `pattern-engine` — re-detect patterns when new data arrives

### Knowledge Events

| Event Type | Emitted By | Trigger | Payload |
|-----------|-----------|---------|---------|
| `KnowledgeCreated` | services.ts | Memory node created from discovery | `{ memoryId, discoveryId, title }` |

**Potential Consumers**:
- `pattern-engine` — pattern detection on new knowledge
- `interest-engine` (future) — update interest graph

### Journey Events

| Event Type | Emitted By | Trigger | Payload |
|-----------|-----------|---------|---------|
| `JourneyUpdated` | services.ts | Milestone added to journey | `{ journeyId, milestoneId, discoveryId }` |

**Potential Consumers**:
- `pattern-engine` — detect journey alignment patterns
- `diary-engine` — include in daily reflections

### Reflection Events

| Event Type | Emitted By | Trigger | Payload |
|-----------|-----------|---------|---------|
| `ReflectionRequested` | services.ts | Diary generation starting | `{ characterId }` |
| `ReflectionCreated` | services.ts | Diary entry saved | `{ diaryEntryId, characterId, title }` |

**Potential Consumers**:
- `memory-engine` — update memory from reflections

### Decision Events

| Event Type | Emitted By | Trigger | Payload |
|-----------|-----------|---------|---------|
| `CuriosityAssessmentCreated` | services.ts | Curiosity scored for a target | `{ assessmentId, targetId, growthValue, budgetCost }` |
| `AttentionAssessmentCreated` | services.ts | Attention gate evaluated | `{ assessmentId, targetId, deservesAttention, attentionValue, attentionCost }` |
| `DecisionRequested` | services.ts | Decision pipeline triggered | `{ eventType, targetId }` |
| `CompanionDecisionMade` | services.ts | Decision reached | `{ decisionId, targetId, action, timing, priority, reason }` |
| `SilenceChosen` | services.ts | Decided to stay silent | `{ decisionId, targetId }` |

**Potential Consumers**:
- `character-engine` — apply decision to character state
- `diary-engine` — record decision outcomes

### Action Events

| Event Type | Emitted By | Trigger | Payload |
|-----------|-----------|---------|---------|
| `ActionRequested` | services.ts | Tool or action plan executing | `{ toolName, args }` or `{ planId, summary }` |
| `CommandExecuted` | services.ts | Tool execution completed | `{ toolName, status, errorMessage? }` |
| `ActionFailed` | services.ts | Tool execution failed | `{ toolName, status, errorMessage, blockedReason? }` |

**Potential Consumers**:
- `character-engine` — apply task success/failure emotion
- `diary-engine` — record completed tasks

### Speech Events

| Event Type | Emitted By | Trigger | Payload |
|-----------|-----------|---------|---------|
| `AnnMessageQueued` | services.ts | AI reply generated (chat, turn, or discovery) | `{ characterId, source, message }` |

**Potential Consumers**:
- `character-engine` — update talking state

### Exploration Events

| Event Type | Emitted By | Trigger | Payload |
|-----------|-----------|---------|---------|
| `DiscoveryCreated` (exploration) | services.ts | Exploration cycle state change | `{ cycleId, state, message }` |

**Potential Consumers**:
- `diary-engine` — record exploration milestones

---

## Event Flow Diagram

```
User Action (voice/text)
    │
    ▼
Speech Engine ──→ SignalCaptured
    │
    ▼
AI Engine ──→ AnnMessageQueued
    │
    ▼
Discovery Engine ──→ DiscoveryCreated ──→ SignalCaptured
    │
    ▼
Curiosity Engine ──→ CuriosityAssessmentCreated
    │
    ▼
Decision Engine ──→ AttentionAssessmentCreated
    │              ──→ DecisionRequested
    │              ──→ CompanionDecisionMade
    │              ──→ SilenceChosen
    │
    ▼
Character Engine ──→ AnnStateChanged
    │              ──→ EmotionChanged
    │
    ▼
Action Engine ──→ ActionRequested ──→ CommandExecuted / ActionFailed
    │
    ▼
Memory/Journey ──→ KnowledgeCreated ──→ JourneyUpdated
    │
    ▼
Diary Engine ──→ ReflectionRequested ──→ ReflectionCreated
```

---

## Migration Recommendations

### Phase 1: Document Current Usage (this task)
- All events are emitted but none are consumed by engines
- Services.ts is the sole orchestrator

### Phase 2: Event-Driven Coordination (future)

Replace direct calls in services.ts with event subscriptions:

| Direct Call | Replace With |
|------------|-------------|
| `advanceCharacter()` after discovery | Subscribe to `DiscoveryCreated` in character-engine |
| `applyEmotionEvent()` after feedback | Subscribe to `CompanionDecisionMade` in character-engine |
| `detectPatterns()` in exploration | Subscribe to `KnowledgeCreated` in pattern-engine |
| `generateDailyDiary()` manually | Subscribe to `ReflectionRequested` in diary-engine |

### Phase 3: Engine Self-Coordination (future)

Engines subscribe to events and react autonomously:
- `decision-engine` subscribes to `DiscoveryCreated` → triggers decision pipeline
- `character-engine` subscribes to `CompanionDecisionMade` → updates state
- `pattern-engine` subscribes to `KnowledgeCreated` → re-detects patterns
- `curiosity-engine` subscribes to `AnnStateChanged` → adjusts targets
