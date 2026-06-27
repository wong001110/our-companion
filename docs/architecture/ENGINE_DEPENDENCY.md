# Engine Dependency Map

Import relationships between all packages. Arrows indicate "depends on".

---

## Package Dependency Graph

```
event-bus ──→ shared
sdk ──→ shared, event-bus
shared ──→ (none)

character-engine ──→ shared
decision-engine ──→ shared
curiosity-engine ──→ shared
pattern-engine ──→ shared
discovery-engine ──→ shared
insight-engine ──→ shared
memory-engine ──→ shared
journey-engine ──→ shared
diary-engine ──→ shared
action-engine ──→ shared, character-engine
tool-engine ──→ shared
ai-engine ──→ shared, zod
speech-engine ──→ shared, ffmpeg-static, @kutalia/whisper-node-addon
society-engine ──→ shared
database ──→ shared, character-engine, node:sqlite
```

---

## Inter-Engine Dependencies

| Source | Target | Import | Justification |
|--------|--------|--------|---------------|
| action-engine | character-engine | `planPerformanceScript` | Generates animation sequence after action execution |
| database | character-engine | `createInitialCharacterState` | Seeds default character state on database init |

All other engines depend **only** on `shared`.

---

## Desktop App Orchestration

`apps/desktop` imports **every engine** and wires them together via `AppServices` class:

```
apps/desktop/electron/main/
├── index.ts           → all engines (via services)
├── services.ts        → all engines (direct imports)
├── discoveryScheduler.ts      → discovery-engine
├── discoveryShareOrchestrator.ts → discovery-engine, character-engine, decision-engine, curiosity-engine
└── engineSnapshot.ts  → database, shared
```

---

## Dependency Classification

### Tier 0: Foundation
- `shared` — no dependencies
- `event-bus` — depends only on shared

### Tier 1: Pure Logic Engines
- `character-engine` → shared
- `decision-engine` → shared
- `curiosity-engine` → shared
- `pattern-engine` → shared
- `discovery-engine` → shared
- `insight-engine` → shared
- `memory-engine` → shared
- `journey-engine` → shared
- `diary-engine` → shared
- `tool-engine` → shared
- `society-engine` → shared

### Tier 2: Engines with External Dependencies
- `ai-engine` → shared, zod
- `speech-engine` → shared, ffmpeg-static, whisper addon
- `action-engine` → shared, character-engine

### Tier 3: Storage
- `database` → shared, character-engine, node:sqlite

### Tier 4: Plugin System
- `sdk` → shared, event-bus

### Tier 5: Application
- `apps/desktop` → all engines

---

## Circular Dependency Check

**No circular dependencies exist.** The dependency graph is a DAG (directed acyclic graph).

The only non-trivial edges:
1. `action-engine → character-engine` — acceptable, `planPerformanceScript` is a pure utility
2. `database → character-engine` — acceptable, `createInitialCharacterState` is a pure utility

---

## Recommended Changes

### Remove: database → character-engine

**Current**: `database/src/index.ts` imports `createInitialCharacterState` from character-engine for `seedAnn()`.

**Problem**: Database should not depend on character-engine. The seed function creates a character state, which is a character concern.

**Solution**: Move `createInitialCharacterState` to shared, or pass initial state as a parameter to `seedAnn()`.

```typescript
// Option A: Move to shared
// shared/src/character/createInitialCharacterState.ts

// Option B: Parameterize
constructor(options: DatabaseServiceOptions = {}, initialState?: CharacterRuntimeState) {
  // ...
  this.seedAnn(initialState ?? createDefaultCharacterState());
}
```

### Monitor: action-engine → character-engine

**Current**: `action-engine` imports `planPerformanceScript` from character-engine.

**Assessment**: This is acceptable for now. `planPerformanceScript` is a pure function that generates animation sequences. If this dependency becomes problematic in the future, it could be moved to shared.

### Future: Introduce event-driven communication

Currently all engine coordination happens in `services.ts` via direct imports. Future phases should introduce event bus subscriptions:
- discovery-engine publishes `DiscoveryCreated` → decision-engine subscribes
- decision-engine publishes `DecisionMade` → character-engine subscribes
- character-engine publishes `StateChanged` → curiosity-engine subscribes
