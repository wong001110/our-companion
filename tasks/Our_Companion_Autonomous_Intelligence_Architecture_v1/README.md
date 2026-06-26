# Our Companion Autonomous Intelligence Architecture Pack v1

This pack upgrades the previous Discovery system into an autonomous companion intelligence architecture.

## Included Files

- `AUTONOMOUS_COMPANION_ARCHITECTURE.md`
- `CURIOSITY_ENGINE.md`
- `PATTERN_ENGINE.md`
- `INTEREST_GRAPH_SYSTEM.md`
- `DISCOVERY_AGENT_SYSTEM.md`
- `INSIGHT_ENGINE.md`
- `COMPANION_EXPLORATION_LOOP.md`

## Recommended Build Order

Since Phase 1 and Phase 2 already exist, proceed directly to Phase 3.

1. Add `curiosity-engine`
2. Add `insight-engine`
3. Implement exploration loop state machine
4. Connect existing `memory-engine`, `character-engine`, `journey-engine`, and `discovery-engine`
5. Add Pattern Engine as a module or package
6. Add Interest Graph as part of memory/journey
7. Run a full autonomous discovery cycle

## Core Product Principle

Do not build a normal feed.

Build this experience:

```text
Ann becomes curious.
Ann goes exploring.
Ann finds something.
Ann forms an insight.
Ann returns to the user.
Ann reflects and remembers.
```

## Core Architecture

```text
Character
  ↓
Memory
  ↓
Journey
  ↓
Pattern
  ↓
Interest Graph
  ↓
Curiosity
  ↓
Discovery Agents
  ↓
Insight
  ↓
Diary
  ↓
Companion Presentation
```

## Package Recommendation

```text
packages/
├─ curiosity-engine      # add
├─ insight-engine        # add
├─ pattern-engine        # optional, can start inside journey-engine
```

## First MVP Target

Manual trigger:

```text
User clicks "Send Ann exploring"
  ↓
Curiosity target generated
  ↓
Discovery candidates collected
  ↓
Insight generated
  ↓
Ann returns with one meaningful discovery
  ↓
User gives feedback
  ↓
Memory/diary updated
```
