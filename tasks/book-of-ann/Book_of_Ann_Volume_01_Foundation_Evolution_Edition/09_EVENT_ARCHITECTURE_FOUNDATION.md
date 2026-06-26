# Event Architecture Foundation

## Why Events

Our Companion must support:

- existing local features
- future cloud sync
- future Companion visits
- action performance
- character animation
- long-term memory
- background discovery

Direct engine-to-engine calls will become fragile.

Events allow each engine to react independently.

## Event Rule

Engines should emit events instead of directly controlling other engines.

Bad:

```ts
discoveryEngine.showBubble(discovery)
```

Good:

```ts
eventBus.emit('DiscoveryCreated', discovery)
```

## Core Event Categories

### Signal Events

```txt
SignalCaptured
SignalNormalized
SignalRejected
```

### Thinking Events

```txt
DiscoveryCreated
DuplicateDetected
ConceptMatched
InsightGenerated
PatternDetected
```

### Curiosity Events

```txt
CuriosityGapFound
CuriosityGapMatched
CuriosityBudgetUpdated
CuriositySeasonChanged
```

### Knowledge Events

```txt
KnowledgeCreated
MemoryUpdated
JourneyUpdated
ConceptUpdated
```

### Decision Events

```txt
DecisionRequested
CompanionDecisionMade
AnnMessageQueued
ActionQueued
SilenceChosen
```

### Character Events

```txt
AnnStateChanged
EmotionChanged
AnimationRequested
PerformanceStarted
PerformanceCompleted
```

### Action Events

```txt
ActionRequested
ActionPlanned
PermissionRequired
CommandExecuted
ActionFailed
```

### Reflection Events

```txt
DailyReflectionRequested
DiaryEntryCreated
JourneyReflectionUpdated
```

## Event Payload Rule

Every event must contain:

```ts
type BaseEvent = {
  id: string
  type: string
  timestamp: string
  source: string
  correlationId?: string
  causationId?: string
}
```

## Correlation

Use `correlationId` to track a full flow:

```txt
SignalCaptured
  ↓
DiscoveryCreated
  ↓
DecisionRequested
  ↓
AnnMessageQueued
```

All share the same correlation ID.
