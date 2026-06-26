# Pattern Engine Specification

## Purpose

The Pattern Engine detects repeated signals, clusters, trends, and relationships.

## Inputs

- DiscoveryCreated
- ConceptUpdated
- JourneyUpdated
- KnowledgeCreated
- UserActionReceived

## Pattern Types

```ts
type PatternType =
  | 'repeated_topic'
  | 'cross_source_trend'
  | 'journey_alignment'
  | 'user_momentum'
  | 'fatigue_signal'
  | 'revival_signal'
```

## Pattern

```ts
type Pattern = {
  id: string
  type: PatternType
  description: string
  relatedConceptIds: string[]
  relatedDiscoveryIds: string[]
  confidence: number
  detectedAt: string
}
```

## Examples

### Cross-source trend

```txt
HN, GitHub, and Reddit all mention MCP this week.
```

### User momentum

```txt
User saved three local-first discoveries this week.
```

### Fatigue

```txt
User ignored four AI-agent recommendations recently.
```

## Events

```txt
PatternDetected
PatternStrengthened
PatternExpired
```

## Rule

Pattern Engine does not decide whether to speak.
It emits PatternDetected.
Decision Engine decides action.
