# Cognitive Loop

The Companion system is built around a loop:

```txt
Observe
  ↓
Understand
  ↓
Remember
  ↓
Decide
  ↓
Express
  ↓
Reflect
  ↓
Observe
```

## Observe

Collect signals from sources.

Current sources:

- internet
- user interaction
- local project state

Future sources:

- cloud
- Companion visit
- community
- shared journeys

## Understand

Turn raw signals into discoveries, concepts, patterns, and insights.

## Remember

Store stable knowledge, memory, journeys, and user preferences.

## Decide

Determine whether Ann should:

- speak now
- queue for later
- remember only
- ignore
- perform an action
- stay silent

## Express

Use Ann's character, speech, UI, and animation to communicate.

## Reflect

Summarize what changed, what was learned, and what should matter tomorrow.

## Implementation Rule

No single engine should own the whole loop.

Each stage should be independently testable and event-driven.
