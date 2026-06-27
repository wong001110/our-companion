---
feature: volume-5-sprint-1-experience-engine
status: delivered
specs:
  - engineering/capabilities/Volume-5-v5.0.0-Adaptive-Memory-Learning/Implementation/TASK_BREAKDOWN.md
  - engineering/capabilities/Volume-5-v5.0.0-Adaptive-Memory-Learning/Implementation/SPRINT_PLAN.md
plans:
  - .mimocode/plans/1782521848146-eager-forest.md
---

# Volume 5 Sprint 1 — Experience Engine Foundation — Final Report

## What Was Built

The `@our-companion/experience-engine` package provides the normalized experience layer for Volume 5's adaptive learning system. It captures, stores, and queries raw experience records — what happened in the system. Experiences are lightweight event records with type, description, source, timestamp, and privacy level. The engine follows the established engine pattern: flat `src/` directory, V2 class with typed events, dependency on `@our-companion/shared` only.

This is the foundation for the learning loop: Experience → Reflection → Memory Candidate → Memory Update → Knowledge Graph → Preference Evolution → Future Decision.

## Architecture

```
@our-companion/experience-engine
├── src/
│   ├── index.ts                    # Public API barrel
│   ├── experience-engine.ts        # ExperienceEngine class
│   ├── experience-engine.test.ts   # 10 tests
│   └── types.ts                    # Internal types and constants
├── package.json                    # @our-companion/experience-engine
└── tsconfig.json                   # References shared only
```

### Key Interfaces

| Interface | File | Purpose |
|-----------|------|---------|
| `ExperienceEngine` | `experience-engine.ts` | Main class — capture, query, count |
| `CaptureExperienceInput` | `experience-engine.ts` | Input for `captureExperience()` |
| `ExperienceQuery` | `experience-engine.ts` | Filter parameters for `listExperiences()` |
| `ExperienceEvent` | `types.ts` | Internal event emitted on capture |
| `ExperienceCapturedPayload` | `shared/domain-events.ts` | Domain event payload |

### Data Flow

```
Caller
  → ExperienceEngine.captureExperience(input)
  → Experience stored in memory
  → experience.captured event emitted
  → Downstream consumers (Reflection Engine, Timeline Engine) react
```

### Design Decisions

- **Uses existing `Experience` type from shared**: The shared package already defined `ExperienceType` and `Experience` interface. Rather than duplicating, the engine imports and uses these directly.
- **Reverse chronological storage**: New experiences are prepended (`unshift`) so `listExperiences()` returns most recent first by default.
- **In-memory only for Sprint 1**: The spec allows in-memory adapters for Sprint 1. Database persistence will come in later sprints.
- **Typed internal events**: The engine emits `ExperienceEvent` objects (with type, experienceId, timestamp) rather than raw strings, matching the established pattern from memory-engine.

## Usage

```typescript
import { ExperienceEngine } from '@our-companion/experience-engine';

const engine = new ExperienceEngine();

// Capture an experience
const exp = engine.captureExperience({
  type: 'internet_discovery',
  description: 'Found a useful article about TypeScript',
  source: 'github',
});

// Query experiences
const discoveries = engine.listExperiences({ type: 'internet_discovery', limit: 10 });

// Subscribe to events
engine.onEvent((event) => {
  if (event.type === 'experience.captured') {
    console.log(`New experience: ${event.experienceId}`);
  }
});
```

## Verification

```bash
npm run typecheck    # PASS
npm test             # PASS (210 tests: 10 new + 200 existing)
npm run arch:check   # PASS (Architecture boundaries OK)
```

Boundary checks:
- Experience Engine has no Electron import
- Experience Engine has no Renderer import
- Experience Engine depends only on `@our-companion/shared`

## Journey Log

- [lesson] The existing `Experience` type in shared already had the fields needed for Sprint 1 — no need to create duplicate types. Always check shared/types before defining new domain types.
- [lesson] Index barrel must be updated incrementally as new files are added — referencing a file that doesn't exist yet causes typecheck failures even if the file will be created later.

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `engineering/capabilities/Volume-5-v5.0.0-Adaptive-Memory-Learning/Implementation/SPRINT_PLAN.md` | Sprint plan | Sprint 1 tasks covered |
| `engineering/capabilities/Volume-5-v5.0.0-Adaptive-Memory-Learning/Implementation/TASK_BREAKDOWN.md` | Task checklist | All tasks completed |
| `engineering/capabilities/Volume-5-v5.0.0-Adaptive-Memory-Learning/Domain/DOMAIN_MODEL.md` | Domain model | Experience entity defined |
| `.mimocode/plans/1782521848146-eager-forest.md` | Implementation plan | 5 tasks, all completed |
