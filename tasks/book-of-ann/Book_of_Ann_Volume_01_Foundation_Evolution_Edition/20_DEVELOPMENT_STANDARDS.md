# Development Standards

## TypeScript Rules

- Prefer explicit domain types.
- Avoid `any`.
- Use discriminated unions for states.
- Keep event payloads serializable.
- Validate AI JSON outputs.

## Module Rules

- Modules expose interfaces.
- Avoid circular imports.
- Avoid direct cross-engine calls.
- Prefer event emission.

## Naming Rules

Use domain names:

Good:

```txt
DiscoveryCreated
CompanionDecisionMade
AnnStateChanged
```

Bad:

```txt
DoStuff
HandleData
ProcessThing
```

## Documentation Rules

Every package should include:

```txt
README.md
ARCHITECTURE.md
EVENTS.md
```

## Testing Rules

Each engine should have:

- unit tests
- event tests
- boundary tests
- failure tests

## Migration Rules

Never remove legacy behavior before replacement is tested.

Mark deprecated paths clearly:

```ts
/**
 * @deprecated Use EventBus emit('DiscoveryCreated') instead.
 */
```
