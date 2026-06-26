# Testing Strategy

## Foundation Tests

### Event Bus

Test:

- emit event
- subscribe handler
- unsubscribe handler
- multiple listeners
- unknown event type
- error isolation

### Shared Models

Test:

- type guards if implemented
- schema validation if implemented
- serialization
- deserialization

### Provider Interfaces

Test:

- mock LLM provider
- mock command executor
- mock source provider

## Migration Tests

Existing features should continue working.

At minimum:

- app starts
- discovery flow still runs
- character can idle
- speech bubble still displays
- action/tool flow still works if already implemented

## Event Bridge Tests

When legacy behavior runs, event should also emit.

Example:

```txt
existing discovery created
  -> DiscoveryCreated event emitted
```

## Regression Rule

No existing user-visible behavior should disappear in Volume 01.
