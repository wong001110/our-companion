# ARGENT MASTER INSTRUCTIONS
# Volume 01 — Foundation

You are working on an existing Our Companion codebase.

Your job is not to rebuild the project from scratch.
Your job is to evolve it safely toward the Book of Ann architecture.

## Golden Rule

Do not break existing working behavior unless the task explicitly says to replace it.

## Required Working Style

For every implementation task:

1. Inspect the current project structure.
2. Identify existing packages, modules, exports, and dependencies.
3. Add compatibility layers before moving logic.
4. Prefer additive changes first.
5. Emit events while keeping existing direct calls temporarily.
6. Only remove legacy paths after replacement is verified.
7. Keep names readable and domain-oriented.
8. Update documentation inside the modified package.

## Architecture Direction

The project should evolve toward:

```txt
packages/
  brain/
    perception/
    thinking/
    curiosity/
    knowledge/
    decision/
    reflection/
    orchestrator/

  character/
    state/
    emotion/
    behavior/
    animation/

  expression/
    speech/
    ui/
    notification/

  action/
    planner/
    executor/
    performance/
    permissions/

  providers/
    llm/
    embeddings/
    sources/

  platform/
    database/
    event-bus/
    scheduler/
    shared/
```

However, do not force folder migration immediately.

Existing packages may remain while being wrapped with the new logical architecture.

## Compatibility Rule

If the current project has:

```txt
packages/discovery-engine
packages/character-engine
packages/memory-engine
packages/speech-engine
packages/tool-engine
packages/ai-engine
```

Then initially map them logically:

```txt
discovery-engine -> brain/thinking/discovery
character-engine -> character/*
memory-engine -> brain/knowledge
speech-engine -> expression/speech
tool-engine -> action/executor
ai-engine -> providers/llm
```

Do not rename packages until all imports are stable.

## Definition of Done for Volume 01

- A shared architecture vocabulary exists.
- Event bus interface exists.
- Core shared models exist.
- Migration path is documented.
- Existing modules can map to the new architecture.
- Future volumes can depend on this foundation.
