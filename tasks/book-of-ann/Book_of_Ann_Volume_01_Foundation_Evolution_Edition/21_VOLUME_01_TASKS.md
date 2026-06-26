# Volume 01 Implementation Tasks

## Task 01 — Current State Audit

Create:

```txt
docs/current-state-audit.md
```

Include:

- package list
- module responsibilities
- direct dependencies
- LLM call locations
- storage access points
- animation control paths
- action/tool execution paths

## Task 02 — Add Shared Models

Create:

```txt
packages/shared/models
```

Add:

- Signal
- Experience
- Discovery
- CompanionDecision
- CharacterState
- BaseEvent

## Task 03 — Add Event Bus Interface

Create:

```txt
packages/platform/event-bus
```

Provide:

```ts
emit(event)
subscribe(type, handler)
unsubscribe()
```

In-process implementation is enough for now.

## Task 04 — Add Provider Interfaces

Create interfaces for:

- LlmProvider
- EmbeddingProvider
- SourceProvider
- CommandExecutor

Do not replace implementations yet.

## Task 05 — Add Compatibility Mapping

Document current packages to target logical layers.

## Task 06 — Emit Events Alongside Existing Calls

Start with discovery, speech, character, and action paths.

## Task 07 — Add Architecture Docs

Add docs:

```txt
docs/book-of-ann/volume-01-foundation
```

Copy this volume into the repo.

## Task 08 — Prepare Next Volume

After Volume 01, implement Volume 02 Cognitive Brain.
