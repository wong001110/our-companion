# Attention Model Specification

## Purpose

Attention is the scarce resource Decision Engine protects.

## Attention Score

Input factors:

- novelty
- growth value
- urgency
- user context
- trust
- fatigue
- timing
- recent interaction pattern

## Type

```ts
type AttentionAssessment = {
  id: string
  targetId: string
  targetType: string
  deservesAttention: boolean
  attentionCost: number
  attentionValue: number
  reason: string
}
```

## Key Question

```txt
Does this deserve the user's attention right now?
```

## Rules

- High relevance but bad timing should queue.
- High novelty but low quality should ignore.
- Low novelty but strong update may revive.
- High growth and idle user may speak.

## Events

```txt
AttentionAssessmentCreated
AttentionBudgetUpdated
AttentionProtected
```
