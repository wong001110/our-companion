# JSON Schemas

## DiscoveryUnderstandingSchema

```ts
type DiscoveryUnderstandingSchema = {
  summary: string
  concepts: string[]
  entities: string[]
  tags: string[]
  growth_value: number
  confidence: number
  reason: string
}
```

## InsightSchema

```ts
type InsightSchema = {
  title: string
  explanation: string
  related_concepts: string[]
  growth_value: number
  confidence: number
}
```

## CuriosityAssessmentSchema

```ts
type CuriosityAssessmentSchema = {
  target_id: string
  target_type: string
  growth_value: number
  budget_cost: number
  gap_match?: {
    gap_id: string
    strength: number
    reason: string
  }
  reason: string
}
```

## DecisionSchema

Decision should usually be rule-based, not LLM-based.

```ts
type DecisionSchema = {
  action: 'speak' | 'queue_for_later' | 'remember_only' | 'ignore' | 'perform_action' | 'stay_silent'
  timing: 'now' | 'next_idle' | 'later'
  priority: 'low' | 'normal' | 'high'
  reason: string
}
```
