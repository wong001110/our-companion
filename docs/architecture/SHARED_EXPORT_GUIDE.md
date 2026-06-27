# Shared Export Guide

Import patterns, migration notes, and best practices.

---

## Current Import Patterns

### Pattern 1: Direct Root Import (Most Common)

```typescript
import { MemoryNode, Discovery, CharacterRuntimeState } from '@our-companion/shared';
```

**Used by**: All engines, desktop app
**Status**: Fully supported, backward compatible

### Pattern 2: Models Import (Legacy)

```typescript
import { Insight, CompanionDecision, PerformanceScript } from '@our-companion/shared';
// or
import type { Insight } from '@our-companion/shared/models';
```

**Used by**: Some engines, decision-engine
**Status**: Supported via `export * from './models'`

### Pattern 3: Domain-Specific Import (Future)

```typescript
import { MemoryNode } from '@our-companion/shared/memory';
import { Discovery } from '@our-companion/shared/discovery';
```

**Used by**: New code (recommended for new engines)
**Status**: Supported via domain subdirectories

---

## Import Recommendations

### For New Engines

Use domain-specific imports when available:

```typescript
// Recommended
import { CuriosityTarget, CuriosityAssessment } from '@our-companion/shared/curiosity';
import { Pattern, PatternType } from '@our-companion/shared/graph';

// Also acceptable
import { CuriosityTarget } from '@our-companion/shared';
```

### For Existing Engines

Keep current import patterns. No migration required.

### For Desktop App

Use root imports for simplicity:

```typescript
import type { 
  CharacterRuntimeState, 
  Discovery, 
  OurCompanionApi 
} from '@our-companion/shared';
```

---

## Type Groups

### Core Types (Always Available)

```typescript
import { 
  createId, 
  nowIso, 
  DEFAULT_CHARACTER_ID,
  type BaseEvent 
} from '@our-companion/shared';
```

### Character Types

```typescript
import type {
  CoreState,
  EmotionState,
  CharacterRuntimeState,
  CharacterProfile,
  CharacterBehaviorSettings,
} from '@our-companion/shared';
```

### Memory Types

```typescript
import type {
  MemoryNode,
  MemoryEdge,
  MemoryGraph,
  MemoryNodeType,
  CreateMemoryNodeInput,
} from '@our-companion/shared';
```

### Discovery Types

```typescript
import type {
  Discovery,
  NormalizedDiscovery,
  DiscoveryCandidate,
  DiscoveryFeedback,
  ExplorationPlan,
} from '@our-companion/shared';
```

### Decision Types

```typescript
import type {
  CompanionDecision,
  AttentionAssessment,
  DecisionInput,
  UserContext,
  CompanionContext,
} from '@our-companion/shared';
```

### Curiosity Types

```typescript
import type {
  CuriosityTarget,
  CuriosityAssessment,
  CuriositySource,
  ExplorationType,
} from '@our-companion/shared';
```

### Insight Types

```typescript
import type {
  CompanionInsight,
  ExplorationCycle,
  ExplorationCycleResult,
  ExplorationState,
} from '@our-companion/shared';
```

### Graph Types

```typescript
import type {
  Pattern,
  PatternType,
  InterestNode,
  InterestGraph,
  Concept,
} from '@our-companion/shared';
```

### Journey Types

```typescript
import type {
  Journey,
  JourneyMilestone,
  CreateJourneyInput,
} from '@our-companion/shared';
```

### Action Types

```typescript
import type {
  ToolName,
  ToolExecuteInput,
  ActionPlan,
  ActionPermissionState,
} from '@our-companion/shared';
```

### AI Types

```typescript
import type {
  AiSettings,
  CompanionMessage,
  ChatInput,
  OurCompanionApi,
} from '@our-companion/shared';
```

---

## Common Mistakes to Avoid

### 1. Importing from Wrong Path

```typescript
// Wrong - doesn't exist
import { MemoryNode } from '@our-companion/shared/memory/MemoryNode';

// Correct
import { MemoryNode } from '@our-companion/shared';
// or (future)
import { MemoryNode } from '@our-companion/shared/memory';
```

### 2. Mixing Models and Root Imports

```typescript
// Confusing - both work but different paths
import { Insight } from '@our-companion/shared';        // from index.ts
import { Insight } from '@our-companion/shared/models'; // from models/index.ts

// Prefer one consistent pattern
import { Insight } from '@our-companion/shared';
```

### 3. Importing Non-Exported Types

```typescript
// Wrong - internal types not exported
import { StoredAiSettings } from '@our-companion/shared';

// Correct - only use exported types
import { AiSettings } from '@our-companion/shared';
```

---

## Adding New Types

When adding new types to shared:

1. **Choose the right domain**: Which engine will use this type?
2. **Add to index.ts**: Place in the appropriate domain section
3. **Update domain re-export**: Add to the domain's index.ts if needed
4. **Document in this guide**: Update the type groups section

Example:

```typescript
// In index.ts, under CURIOSITY section:
export interface CuriosityBudget {
  date: string;
  total: number;
  used: number;
  remaining: number;
}

// In curiosity/index.ts:
export type { CuriosityBudget } from '../index';
```

---

## Migration Checklist

If migrating an engine to domain imports:

- [ ] Identify all `@our-companion/shared` imports
- [ ] Group by domain (character, memory, discovery, etc.)
- [ ] Update imports to use domain paths
- [ ] Verify typecheck passes
- [ ] Run tests
- [ ] Update documentation if needed

---

## Backward Compatibility

All existing import patterns continue to work:

| Pattern | Status | Notes |
|---------|--------|-------|
| `from '@our-companion/shared'` | ✅ Supported | Primary pattern |
| `from '@our-companion/shared/models'` | ✅ Supported | Legacy compat |
| `from '@our-companion/shared/interfaces'` | ✅ Supported | Provider interfaces |
| `from '@our-companion/shared/character'` | ✅ Supported | Domain import (new) |
| `from '@our-companion/shared/memory'` | ✅ Supported | Domain import (new) |
