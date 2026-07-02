# V1 to V2 Type Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all V1 types from `@our-companion/shared` and migrate the codebase to use only V2 types.

**Architecture:** The shared package has two parallel type systems (V1 and V2) that evolved as the project grew. V2 types are richer and used by newer engines. This plan migrates the OurCompanionApi boundary and application layer to V2 types, then removes V1 definitions.

**Tech Stack:** TypeScript, Zod schemas

---

## V1→V2 Type Mapping

| V1 Type | V2 Type | Used in OurCompanionApi |
|---------|---------|------------------------|
| `MemoryNode` | `MemoryRecord` | Yes (memory API) |
| `MemoryEdge` | (custom) | Yes (memory API) |
| `MemoryGraph` | `KnowledgeGraph` | Yes (memory API) |
| `MemoryNodeType` | `MemoryNodeType` (shared) | Yes |
| `Pattern` | `PatternV2` | Yes (EngineSnapshot) |
| `Insight` (models) | `InsightV2` | No (only models) |
| `CompanionInsight` | `InsightV2` | Yes (autonomy) |
| `Journey` | `CompanionJourney` | Yes (journey API) |
| `JourneyMilestone` | `JourneyMilestoneV2` | Yes (journey API) |
| `ActionPlan` (models) | `ActionPlanV2` | Yes (action API) |
| `ActionRunResult` | `ActionResult` | Yes (action API) |
| `PerformanceScript` | `PerformanceScriptV2` | Yes (action API) |
| `CharacterState` | `CharacterRuntimeStateV2` | No (models only) |
| `BehaviourState` | `BehaviourType` | No (models only) |
| `AnnMood` | `EmotionName` | No (models only) |
| `AnnIntent` | `Intent` | No (models only) |

---

## Task 1: Migrate memory types in OurCompanionApi

**Covers:** Memory API boundary

**Files:**
- Modify: `packages/shared/src/index.ts` (OurCompanionApi interface)

- [ ] **Step 1: Update memory section of OurCompanionApi**

In `packages/shared/src/index.ts`, update the memory section of `OurCompanionApi`:

```typescript
memory: {
    createNode(input: CreateMemoryNodeInput): Promise<MemoryRecord>;
    updateNode(input: UpdateMemoryNodeInput): Promise<MemoryRecord>;
    deleteNode(id: string): Promise<{ id: string; deleted: true }>;
    createEdge(input: CreateMemoryEdgeInput): Promise<MemoryEdge>;
    getGraph(input?: { query?: string }): Promise<KnowledgeGraph>;
    search(query: string): Promise<MemoryRecord[]>;
};
```

Note: `CreateMemoryNodeInput`, `UpdateMemoryNodeInput`, `CreateMemoryEdgeInput` stay as-is (they're input types, not entity types). `MemoryEdge` stays (no V2 equivalent). `MemoryGraph` becomes `KnowledgeGraph`.

- [ ] **Step 2: Update discovery addToJourney return type**

```typescript
addToJourney(input: AddDiscoveryToJourneyInput): Promise<{ journey: CompanionJourney; milestone: JourneyMilestoneV2; memory: MemoryRecord }>;
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc -b --pretty false 2>&1 | grep -v TS6305 | grep "error TS"`
Expected: New errors in services.ts where memory/journey operations return old types

- [ ] **Step 4: Update services.ts memory section**

In `apps/desktop/electron/main/services.ts`, update the memory section:

```typescript
memory = {
    createNode: async (input: CreateMemoryNodeInput) => this.db.insertMemoryNode(createMemoryNode(input)),
    updateNode: async (input: UpdateMemoryNodeInput) => {
        const existing = this.db.getMemoryNode(input.id);
        if (!existing) throw new Error(`Memory node not found: ${input.id}`);
        return this.db.updateMemoryNode(updateMemoryNodePure(existing, input));
    },
    deleteNode: async (id: string) => {
        this.db.deleteMemoryNode(id);
        return { id, deleted: true as const };
    },
    createEdge: async (input: CreateMemoryEdgeInput) => this.db.insertMemoryEdge(createMemoryEdge(input)),
    getGraph: async (input: { query?: string } = {}) =>
        graphFromMemory(this.db.listMemoryNodes(), this.db.listMemoryEdges(), input.query),
    search: async (query: string) => searchMemory(this.db.listMemoryNodes(), query)
};
```

Note: The actual DB layer still returns V1 types internally. The API boundary promise types are updated, but the implementation stays the same for now. The DB layer migration is a separate task.

- [ ] **Step 5: Update journey section of OurCompanionApi**

```typescript
journey: {
    create(input: CreateJourneyInput): Promise<CompanionJourney>;
    getActive(): Promise<CompanionJourney[]>;
    getTimeline(input?: { journeyId?: string }): Promise<JourneyMilestoneV2[]>;
    addMilestone(input: AddJourneyMilestoneInput): Promise<JourneyMilestoneV2>;
};
```

- [ ] **Step 6: Update services.ts journey section**

The journey section in services.ts uses `createJourney` and `createJourneyMilestone` from the V1 journey-engine. These need to be updated to use V2 functions.

Update imports in services.ts:
```typescript
import { createCompanionJourney, createJourneyMilestoneV2 } from '@our-companion/journey-engine';
```

Update journey section:
```typescript
journey = {
    create: async (input: CreateJourneyInput) => this.db.insertJourney(createCompanionJourney({ title: input.title, description: input.description, origin: 'user' })),
    getActive: async () => this.db.listActiveJourneys(),
    getTimeline: async (input: { journeyId?: string } = {}) => this.db.listMilestones(input.journeyId),
    addMilestone: async (input: AddJourneyMilestoneInput) => this.db.insertMilestone(createJourneyMilestoneV2({ title: input.title, description: input.summary }))
};
```

- [ ] **Step 7: Run typecheck and fix remaining errors**

Run: `npx tsc -b --pretty false 2>&1 | grep -v TS6305 | grep "error TS"`
Fix any remaining type mismatches.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/index.ts apps/desktop/electron/main/services.ts
git commit -m "refactor: migrate memory and journey API to V2 types"
```

---

## Task 2: Migrate action types in OurCompanionApi

**Covers:** Action API boundary

**Files:**
- Modify: `packages/shared/src/index.ts` (OurCompanionApi)
- Modify: `apps/desktop/electron/main/services.ts`

- [ ] **Step 1: Update action section of OurCompanionApi**

```typescript
action: {
    plan(text: string): Promise<ActionPlanV2 | undefined>;
    executePlan(plan: ActionPlanV2): Promise<ActionResult>;
    getPermissions(): Promise<ActionPermissionState>;
    updatePermissions(state: ActionPermissionState): Promise<ActionPermissionState>;
    onPerformance(listener: (script: PerformanceScriptV2) => void): () => void;
};
```

- [ ] **Step 2: Update services.ts action section**

Update the action section to use V2 types. The `planAction` function returns V1 `ActionPlan`, so we need to adapt or migrate it.

- [ ] **Step 3: Update action-engine to return V2 types**

In `packages/action-engine/src/action-planner.ts`, update `planAction` to return `ActionPlanV2`:

```typescript
export function planAction(text: string, llmDeps?: LlmDeps): ActionPlanV2 | undefined {
    // ... existing logic ...
    return {
        id: createId('action_plan'),
        intentId: '',
        steps: result.steps.map((step, i) => ({
            id: createId('step'),
            toolName: step.tool_name,
            args: step.args,
            requiredScopes: step.required_scopes ?? [],
        })),
        requiredPermissions: [],
        riskLevel: 'low',
        confirmationRequired: result.requires_confirmation ?? false,
        status: 'draft',
    };
}
```

- [ ] **Step 4: Update action-engine executor to use V2 types**

In `packages/action-engine/src/action-executor.ts`, update `runActionPlan` to accept `ActionPlanV2` and return `ActionResult`.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc -b --pretty false 2>&1 | grep -v TS6305 | grep "error TS"`

- [ ] **Step 6: Fix renderer UI types**

In `apps/desktop/renderer/src/ui/utils.ts`, update imports to use V2 types.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/index.ts packages/action-engine/src/*.ts apps/desktop/electron/main/services.ts apps/desktop/renderer/src/ui/utils.ts
git commit -m "refactor: migrate action API to V2 types"
```

---

## Task 3: Migrate character state types

**Covers:** Character state in models and services

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/desktop/electron/main/services.ts`

- [ ] **Step 1: Update EngineSnapshot to use V2 types**

In `packages/shared/src/index.ts`, update `EngineSnapshot`:

```typescript
export interface EngineSnapshot {
    capturedAt: string;
    characterState?: CharacterRuntimeContext;
    currentCycle?: ExplorationCycle;
    recentCycles: ExplorationCycle[];
    patterns: PatternV2[];
    interestGraph: InterestGraph;
    curiosityTargets: CuriosityTarget[];
    explorationPlan?: ExplorationPlan;
    discoveryCandidates: DiscoveryCandidate[];
    insights: InsightV2[];
    explorationEvents: ExplorationLoopEvent[];
    recentDiscoveries: Discovery[];
    actionPermissions: ActionPermissionState;
    discoveryScheduling: DiscoverySchedulingDebug;
}
```

- [ ] **Step 2: Update engineSnapshot.ts to return V2 types**

In `apps/desktop/electron/main/engineSnapshot.ts`, update the `buildEngineSnapshot` function to return V2 types.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc -b --pretty false 2>&1 | grep -v TS6305 | grep "error TS"`

- [ ] **Step 4: Fix remaining character type mismatches**

The `CharacterRuntimeState` (V1) is still used for the actual character state in the DB. The V2 `CharacterRuntimeContext` is richer but the DB layer stores V1. For now, keep the DB layer as-is and only update the API boundary.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts apps/desktop/electron/main/engineSnapshot.ts
git commit -m "refactor: migrate EngineSnapshot to V2 pattern/insight types"
```

---

## Task 4: Migrate curiosity and insight types

**Covers:** Curiosity and insight API boundaries

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/desktop/electron/main/services.ts`

- [ ] **Step 1: Update CompanionInsight usage to InsightV2**

The `CompanionInsight` type is used in the autonomy section. Update it to use `InsightV2` where possible.

- [ ] **Step 2: Update autonomy section**

In services.ts, the `runAutonomousExploration` method uses `CompanionInsight`. Update to use `InsightV2`.

- [ ] **Step 3: Update curiosity types**

The curiosity engine V2 uses `CuriosityCandidate` which is already the V2 type. Ensure the API boundary uses it correctly.

- [ ] **Step 4: Run typecheck**

Run: `npx tsc -b --pretty false 2>&1 | grep -v TS6305 | grep "error TS"`

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts apps/desktop/electron/main/services.ts
git commit -m "refactor: migrate curiosity and insight types to V2"
```

---

## Task 5: Remove V1 type definitions

**Covers:** Cleanup

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/models/index.ts`

- [ ] **Step 1: Remove V1 types no longer used in API**

After Tasks 1-4, the following V1 types should no longer be referenced in the API:
- `MemoryNode` → kept for DB layer, but removed from API
- `MemoryGraph` → replaced by `KnowledgeGraph`
- `Pattern` → replaced by `PatternV2`
- `Journey` → replaced by `CompanionJourney`
- `JourneyMilestone` → replaced by `JourneyMilestoneV2`
- `ActionPlan` (models) → replaced by `ActionPlanV2`
- `ActionRunResult` → replaced by `ActionResult`
- `PerformanceScript` → replaced by `PerformanceScriptV2`
- `CharacterState` (models) → replaced by V2 types
- `BehaviourState` → replaced by `BehaviourType`
- `AnnMood` → replaced by `EmotionName`
- `AnnIntent` → replaced by `Intent`

- [ ] **Step 2: Keep types still used internally**

The following V1 types are still used by the DB layer and internal engines:
- `MemoryNode` - used by memory-engine V1 functions
- `MemoryEdge` - used by memory-engine
- `MemoryNodeType` - shared between V1 and V2
- `Pattern` - used by pattern-engine V1 `detectPatterns`
- `Discovery` - used everywhere

Do NOT remove these yet. They will be removed when the DB layer is migrated.

- [ ] **Step 3: Run full typecheck**

Run: `npx tsc -b --pretty false 2>&1 | grep -v TS6305 | grep "error TS"`
Expected: No new errors

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/models/index.ts
git commit -m "refactor: remove V1 types from shared package"
```

---

## Task 6: Update Zod schemas for V2 types

**Covers:** AI engine schema alignment

**Files:**
- Modify: `packages/ai-engine/src/index.ts`

- [ ] **Step 1: Update Zod schemas to match V2 types**

The AI engine has Zod schemas for validating LLM responses. Update them to match V2 type structures.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc -b --pretty false 2>&1 | grep -v TS6305 | grep "error TS"`

- [ ] **Step 3: Commit**

```bash
git add packages/ai-engine/src/index.ts
git commit -m "refactor: update AI engine Zod schemas for V2 types"
```

---

## Notes

- **DB layer migration is out of scope.** The SQLite database stores V1 types. Migrating the DB schema is a separate, larger task.
- **Pattern-engine V1 `detectPatterns` is still used.** The V2 `PatternEngine` class exists but the main exploration flow uses the V1 function. This should be migrated separately.
- **The renderer UI uses some V1 types.** These need updating after the API boundary is migrated.
