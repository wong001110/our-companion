# Shared Domain Map

Visual mapping of the shared package organization with folder rationale.

---

## Package Structure

```
packages/shared/
├── src/
│   ├── index.ts              ← Main exports (grouped by domain)
│   ├── models/
│   │   └── index.ts          ← Legacy model types (backward compat)
│   ├── interfaces/
│   │   └── index.ts          ← Provider interfaces
│   │
│   ├── core/                 ← Utilities and constants
│   │   └── index.ts          ← Re-exports createId, nowIso, DEFAULT_CHARACTER_ID
│   │
│   ├── character/            ← Character state, emotion, animation
│   │   └── index.ts          ← Re-exports CoreState, EmotionState, etc.
│   │
│   ├── memory/               ← Memory graph types
│   │   └── index.ts          ← Re-exports MemoryNode, MemoryEdge, etc.
│   │
│   ├── discovery/            ← Discovery sources, candidates, feedback
│   │   └── index.ts          ← Re-exports Discovery, DiscoveryCandidate, etc.
│   │
│   ├── decision/             ← Attention and action decisions
│   │   └── index.ts          ← Re-exports CompanionDecision, AttentionAssessment, etc.
│   │
│   ├── curiosity/            ← Curiosity targets and gaps
│   │   └── index.ts          ← Re-exports CuriosityTarget, CuriosityAssessment, etc.
│   │
│   ├── insight/              ← Insights and exploration cycles
│   │   └── index.ts          ← Re-exports CompanionInsight, ExplorationCycle, etc.
│   │
│   ├── graph/                ← Patterns, interest graphs, knowledge
│   │   └── index.ts          ← Re-exports Pattern, InterestGraph, etc.
│   │
│   ├── journey/              ← Journey and milestone types
│   │   └── index.ts          ← Re-exports Journey, JourneyMilestone, etc.
│   │
│   ├── diary/                ← Diary entries and reflections
│   │   └── index.ts          ← Re-exports DiaryEntry
│   │
│   ├── action/               ← Tool execution and permissions
│   │   └── index.ts          ← Re-exports ToolName, ActionPlan, etc.
│   │
│   ├── ai/                   ← AI settings and chat types
│   │   └── index.ts          ← Re-exports AiSettings, CompanionMessage, etc.
│   │
│   ├── speech/               ← Speech and audio types
│   │   └── index.ts          ← Re-exports SpeechStatus, SpeechSettings
│   │
│   ├── society/              ← Companion identity and relationships (future)
│   │   └── index.ts          ← Re-exports CompanionIdentity, TrustProfile, etc.
│   │
│   └── api/                  ← Window and debug types
│       └── index.ts          ← Re-exports WindowBounds, EngineSnapshot, etc.
```

---

## Domain Rationale

### Why These Domains?

Each domain maps to an engine or feature area:

| Domain | Primary Engine | Rationale |
|--------|---------------|-----------|
| `core/` | None (shared utilities) | Foundational functions used everywhere |
| `character/` | character-engine | Character state, emotion, animation |
| `memory/` | memory-engine | Memory graph operations |
| `discovery/` | discovery-engine | Discovery lifecycle |
| `decision/` | decision-engine | Action decisions |
| `curiosity/` | curiosity-engine | Exploration targets |
| `insight/` | insight-engine | Autonomous insights |
| `graph/` | pattern-engine, memory-engine | Patterns and interest graphs |
| `journey/` | journey-engine | Exploration trails |
| `diary/` | diary-engine | Reflections |
| `action/` | action-engine, tool-engine | Tool execution |
| `ai/` | ai-engine | LLM integration |
| `speech/` | speech-engine | Voice processing |
| `society/` | society-engine | Multi-companion (future) |
| `api/` | desktop app | IPC and window types |

### Why Re-Export Files?

Domain subdirectories use re-export index.ts files to:
1. Provide domain-specific import paths for new code
2. Maintain backward compatibility with `@our-companion/shared`
3. Enable gradual migration to domain imports

**Current import pattern** (backward compatible):
```typescript
import { MemoryNode, Discovery } from '@our-companion/shared';
```

**Future import pattern** (domain-specific):
```typescript
import { MemoryNode } from '@our-companion/shared/memory';
import { Discovery } from '@our-companion/shared/discovery';
```

---

## Migration Notes

### Phase 1: Current (Complete)
- All types exported from root `index.ts`
- Domain subdirectories with re-exports exist
- No breaking changes

### Phase 2: Future (Optional)
- Update engine imports to use domain paths
- Gradually reduce root exports
- Maintain re-exports for external consumers

### Phase 3: Long-term (If needed)
- Move types into domain files directly
- Remove root re-exports
- Full domain isolation

---

## Compatibility Considerations

1. **Root exports preserved**: All existing `import from '@our-companion/shared'` continues to work
2. **Models backward compat**: `export * from './models'` maintains legacy type access
3. **Interfaces backward compat**: `export * from './interfaces'` maintains provider interfaces
4. **No circular dependencies**: Domain directories import from root only
5. **No breaking changes**: All changes are additive
