# Insight Engine Specification

## Purpose

Insight Engine turns patterns and concepts into meaning.

Discovery says:

```txt
Here is something.
```

Insight says:

```txt
This may matter because...
```

## Insight Type

```ts
type Insight = {
  id: string
  title: string
  explanation: string
  relatedConceptIds: string[]
  relatedPatternIds: string[]
  confidence: number
  growthValue: number
  createdAt: string
  status: 'candidate' | 'accepted' | 'dismissed' | 'archived'
}
```

## LLM Usage

LLM is useful here, but only after:

- duplicate filtering
- concept matching
- pattern detection

## Example Prompt Role

Input:

```json
{
  "concepts": ["SQLite", "local-first", "personal memory"],
  "patterns": ["cross_source_trend"],
  "userJourney": "AI Companion memory architecture"
}
```

Output:

```json
{
  "title": "Local-first memory is becoming a practical architecture for personal AI",
  "explanation": "...",
  "growthValue": 88,
  "confidence": 0.82
}
```

## Events

```txt
InsightCandidateCreated
InsightGenerated
InsightAccepted
InsightDismissed
```

## Rule

Insight is not automatically shown.
It goes to Curiosity and Decision.
