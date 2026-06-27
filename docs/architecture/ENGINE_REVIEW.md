# Engine Architecture Review

Overall assessment, identified issues, and recommended improvements.

---

## Architecture Health Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| Circular dependencies | ✅ None | DAG is clean |
| Engine isolation | ⚠️ Good | Most engines depend only on shared |
| God package risk | ⚠️ shared | 1500+ lines covering 15+ domains |
| Character engine size | ⚠️ 489 lines | Multiple concerns in one file |
| Event bus usage | ❌ Underutilized | Events emitted but not consumed |
| Dead code | ⚠️ society-engine | No callers in desktop app |
| Orchestration coupling | ⚠️ services.ts | 1257-line monolith orchestrating everything |

---

## Issue 1: shared is Becoming a God Package

**Current state**: `shared/src/index.ts` (872 lines) + `shared/src/models/index.ts` (571 lines) + `shared/src/interfaces/index.ts` (136 lines) = ~1589 lines of types.

**Problem**: Types for character, discovery, memory, journey, diary, tool, action, AI, speech, and API contracts are all in one package. As the project grows, this becomes a bottleneck — every change touches shared, and unrelated types grow together.

**Recommendation**: Split into domain subdirectories.

```
shared/src/
├── core/          ← createId, nowIso, DEFAULT_CHARACTER_ID, BaseEvent
├── character/     ← CoreState, EmotionState, CharacterRuntimeState, CharacterProfile, Intent, etc.
├── discovery/     ← Discovery, DiscoverySource, NormalizedDiscovery, DiscoveryScores, etc.
├── memory/        ← MemoryNode, MemoryEdge, MemoryGraph, MemoryRelation, etc.
├── decision/      ← CompanionDecision, AttentionAssessment, DecisionInput, UserContext, etc.
├── curiosity/     ← CuriosityTarget, CuriositySource, ExplorationType, etc.
├── insight/       ← CompanionInsight, ExplorationCycle, ExplorationLoopEvent, etc.
├── journey/       ← Journey, JourneyMilestone, CreateJourneyInput, etc.
├── diary/         ← DiaryEntry
├── graph/         ← InterestNode, InterestEdge, InterestGraph, Pattern, PatternType, etc.
├── action/        ← ActionPlan, ActionStep, ActionPermissionState, ToolName, etc.
├── ai/            ← AiSettings, AiDebugEntry, CompanionMessage, ChatInput, etc.
├── speech/        ← SpeechStatus, SpeechSettings, TranscribeAudioInput
├── interfaces/    ← LlmProvider, SourceProvider, CommandExecutor, etc.
├── api/           ← OurCompanionApi, IPC types
└── index.ts       ← re-exports everything (backward compatible)
```

**Impact**: Zero breaking changes — `index.ts` re-exports everything. Existing imports work unchanged.

---

## Issue 2: character-engine is Overloaded

**Current state**: 489 lines mixing emotion, animation, intent, state transitions, package validation, registry, expression mapping, performance scripting, and discovery timing.

**Problem**: Multiple distinct concerns in one file. Hard to navigate, hard to test in isolation, hard to extend.

**Recommendation**: Split into internal modules.

```
character-engine/src/
├── emotion/
│   ├── neutralEmotion.ts
│   ├── decayEmotion.ts
│   ├── applyEmotionEvent.ts
│   └── dominantEmotion.ts
├── animation/
│   ├── animationFor.ts
│   ├── animationKeyForBehaviour.ts
│   ├── nextAnimationState.ts
│   └── planAnimationRequest.ts
├── runtime/
│   ├── createInitialCharacterState.ts
│   ├── transitionState.ts
│   ├── selectIntent.ts
│   └── advanceCharacter.ts
├── performance/
│   └── planPerformanceScript.ts
├── package/
│   ├── validateCharacterPackage.ts
│   ├── CharacterPackageRegistry.ts
│   ├── loadCharacterPackage.ts
│   ├── defaultAnnPackage.ts
│   └── exportCharacterPackage.ts
├── expression/
│   ├── emotionForDecision.ts
│   ├── behaviourForDecision.ts
│   └── resolveCharacterState.ts
├── discoveryTiming.ts
└── index.ts        ← re-exports everything
```

**Impact**: Zero breaking changes — barrel file re-exports.

---

## Issue 3: decision-engine is Underbuilt

**Current state**: Only `assessAttention` and `decideCompanionAction` (156 lines). The decision engine should be the companion brain.

**Problem**: Missing the cognitive pipeline. Decisions are made reactively, not proactively.

**Missing abstractions**:
- `Goal` — what Ann is trying to achieve (learn about frontend, explore new tools, etc.)
- `DecisionContext` — unified input combining memory, patterns, insights, curiosity, character state
- `DecisionPipeline` — sequential processing: Goal → Memory → Pattern → Insight → Curiosity → Character → Decision → Action

**Recommendation**: Document the target pipeline for future development.

```
Goal
  ↓
Memory (what do we know?)
  ↓
Pattern (what trends emerge?)
  ↓
Insight (what does this mean?)
  ↓
Curiosity (what should we explore?)
  ↓
Character (what mood/state are we in?)
  ↓
Decision (speak, remember, ignore, act?)
  ↓
Action (execute the decision)
```

**Impact**: No code changes now — document the vision.

---

## Issue 4: Event Bus is Underutilized

**Current state**: All events are emitted from `services.ts` but no engine subscribes to events. Cross-engine coordination happens via direct function calls.

**Problem**: Tight coupling between services.ts and every engine. Adding a new engine means modifying services.ts.

**Recommendation**: Gradually migrate to event-driven coordination.

**Phase 1** (current): Document event usage ✓

**Phase 2** (future): Replace direct calls with event subscriptions:

| Direct Call in services.ts | Event-Driven Alternative |
|---------------------------|--------------------------|
| `advanceCharacter()` after discovery feedback | character-engine subscribes to `CompanionDecisionMade` |
| `applyEmotionEvent()` on user accept/reject | character-engine subscribes to `DiscoveryFeedback` |
| `detectPatterns()` during exploration | pattern-engine subscribes to `KnowledgeCreated` |
| `generateDailyDiary()` manually triggered | diary-engine subscribes to `ReflectionRequested` |

**Impact**: Reduced services.ts complexity, better engine isolation.

---

## Issue 5: society-engine is Dead Code

**Current state**: 191 lines implementing trust scoring, knowledge exchange, sync conflict detection. No callers in the desktop app.

**Problem**: Code exists but is never used. Creates maintenance burden.

**Recommendation**: Keep for now (Volume 07 cloud society is planned), but document as dormant.

---

## Issue 6: services.ts is a Monolith

**Current state**: 1257 lines orchestrating every engine, managing database, broadcasting events, handling settings.

**Problem**: Single point of complexity. Hard to test, hard to extend.

**Recommendation**: Extract orchestration layers.

```
services.ts (1257 lines)
    ├── CharacterService    (character state management)
    ├── DiscoveryService    (discovery feed, refresh, sharing)
    ├── ExplorationService  (autonomous exploration pipeline)
    ├── MemoryService       (memory CRUD)
    ├── JourneyService      (journey/milestone CRUD)
    ├── DiaryService        (diary generation)
    ├── ToolService         (tool execution)
    ├── ActionService       (action planning, execution)
    ├── AiService           (chat, settings, debug)
    ├── SpeechService       (transcription, settings)
    ├── CompanionService    (turn management, history)
    └── DebugService        (data reset, snapshots)
```

**Impact**: Better testability, clearer responsibilities.

---

## Guiding Principles for Future Development

1. **Engines are pure functions when possible** — side effects belong in services or database
2. **shared is for types only** — no business logic in shared
3. **Event bus for cross-engine communication** — avoid direct engine-to-engine imports
4. **Services orchestrate** — engines don't know about each other
5. **Database is the persistence layer** — engines create data, database stores it

---

## Priority Order

1. ✅ Create documentation (this task)
2. 🔄 Refactor shared into domain subdirectories
3. 🔄 Refactor character-engine into internal modules
4. 📋 Extract database → character-engine dependency
5. 📋 Extract services.ts into service modules
6. 📋 Migrate to event-driven coordination
7. 📋 Build decision pipeline
