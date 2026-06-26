# ARGENT MASTER — Volume 02 Cognitive Brain

You are implementing the cognitive brain on top of an existing Our Companion codebase.

## Non-Negotiable Rules

1. Do not make LLM calls the controller of the system.
2. Do not let Discovery directly control UI.
3. Do not let Curiosity directly trigger animation.
4. Do not let Decision generate final character text.
5. Do not let source providers leak into core brain logic.
6. Preserve current working behavior while adding the new architecture.
7. Use event-driven migration from Volume 01.

## Required Implementation Style

Each cognitive module should:

- accept typed inputs
- return typed outputs
- emit events
- be testable without UI
- be testable without live LLM
- be compatible with local-first storage
- support future cloud and society origins

## Migration Rule

If the current code already has:

```txt
discovery-engine
curiosity-engine
pattern-engine
insight-engine
memory-engine
journey-engine
diary-engine
```

Do not delete them.

Wrap them behind target interfaces and gradually move behavior.

## Cognitive Brain Target

```txt
Signal Engine
  ↓
Thinking Engine
  ├── Discovery
  ├── Deduplication
  ├── Concept
  ├── Pattern
  └── Insight
  ↓
Curiosity Engine
  ├── Gap
  ├── Debt
  ├── Investment
  ├── Season
  ├── Budget
  └── Momentum
  ↓
Decision Engine
  ├── Attention
  ├── Timing
  ├── Fatigue
  ├── Trust
  └── Action Selection
  ↓
Knowledge + Reflection
```

## Definition of Done

Volume 02 is complete when:

- signals can enter the brain source-agnostically
- discoveries are deduplicated and scored
- concepts can be created and matched
- curiosity gaps can be identified
- decisions can choose speak / queue / remember / ignore
- all core outputs are event-based
- existing UI can still consume compatibility outputs
