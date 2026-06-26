# Migration Strategy

This is the high-level migration path for an existing codebase.

## Phase 0 — Audit

Argent should inspect:

```txt
packages/
apps/
database/
shared/
```

and document:

- current modules
- current dependencies
- public exports
- direct engine calls
- LLM usage
- storage access
- animation control
- tool execution

Deliverable:

```txt
docs/current-state-audit.md
```

## Phase 1 — Shared Foundation

Add:

```txt
shared/models
shared/events
shared/interfaces
platform/event-bus
```

Do not move business logic yet.

## Phase 2 — Event Bus Bridge

Keep existing direct calls, but also emit events.

Example:

```ts
await speechEngine.show(message)
eventBus.emit('AnnMessageQueued', payload)
```

This allows future listeners to be added safely.

## Phase 3 — Interface Wrapping

Wrap existing engines:

```txt
ai-engine -> LlmProvider
tool-engine -> CommandExecutor
speech-engine -> SpeechExpression
character-engine -> CharacterRuntime
```

Do not delete old APIs yet.

## Phase 4 — Logical Refactor

Move responsibilities logically:

- source fetching out of discovery
- command execution out of animation
- speech out of decision
- memory writes behind knowledge repository

## Phase 5 — Replace Direct Calls

Once event listeners are stable:

```txt
Direct calls become deprecated.
Events become source of truth.
```

## Phase 6 — Folder Migration

Only after behavior is stable, consider folder reorganization.

Folder reorganization is optional for v1.
Architecture matters more than directory names.

## Rollback Rule

Every phase should be reversible.

If a new event listener fails, existing direct behavior should still work during transition.
