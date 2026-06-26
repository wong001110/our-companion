# Target Architecture

## Logical Target

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
    personality/
    emotion/
    state/
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

## Important Note

This is a logical architecture, not an immediate folder migration requirement.

Existing packages can map to these layers before being physically moved.

## Layer Responsibilities

### brain/perception

Collect and normalize signals.

### brain/thinking

Discovery, pattern, insight, interpretation.

### brain/curiosity

Gap, debt, season, budget, momentum.

### brain/knowledge

Memory, concept, journey, knowledge graph.

### brain/decision

Whether Ann should act, speak, wait, remember, or ignore.

### brain/reflection

Diary, review, growth summary.

### character

Ann's personality, emotion, mood, behavior, animation state.

### expression

Speech bubbles, cards, notifications, voice-ready output.

### action

Planner, command executor, permissions, performance choreography.

### providers

LLM, embeddings, sources, external APIs.

### platform

Database, event bus, scheduler, config, shared utilities.
