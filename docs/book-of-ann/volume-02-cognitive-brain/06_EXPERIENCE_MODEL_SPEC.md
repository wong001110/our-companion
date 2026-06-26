# Experience Model Specification

## Purpose

Experience is a broader abstraction than Signal.

A Signal is a raw input.
An Experience is something Ann or the user went through.

## Examples

```txt
Ann found an article.
User ignored three recommendations.
Ann performed a desktop action.
User discussed local-first memory.
Future: Ann visited Karl.
```

## Type

```ts
type Experience = {
  id: string
  type: ExperienceType
  description: string
  relatedSignalIds?: string[]
  relatedDiscoveryIds?: string[]
  privacyLevel: 'private' | 'local' | 'shareable' | 'public'
  occurredAt: string
  metadata?: Record<string, unknown>
}
```

## Why Experience Matters

Future features such as Companion visiting should not require a new pipeline.

They should become:

```txt
CompanionVisitExperience
  ↓
Signal or Knowledge Exchange
  ↓
Same cognitive loop
```

## Events

```txt
ExperienceRecorded
ExperienceLinkedToJourney
ExperienceArchived
```

## Rules

- Every experience has privacy level.
- Future shareable experiences must not include private memory by default.
- Experience is not always shown to the user.
