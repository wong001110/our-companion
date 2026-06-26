# Curiosity Engine Specification

## Purpose

Curiosity Engine decides whether something contributes to the user's exploration growth.

It does not directly display recommendations.

## Responsibilities

- identify gaps
- score growth value
- maintain curiosity budget
- detect curiosity season
- manage curiosity debt
- track momentum
- reduce fatigue

## Core Question

```txt
Does this help the user explore better?
```

## Curiosity Inputs

- Concept
- Insight
- Journey
- UserAction
- Knowledge
- Reflection

## Curiosity Output

```ts
type CuriosityAssessment = {
  id: string
  targetId: string
  targetType: 'discovery' | 'concept' | 'insight' | 'journey'
  growthValue: number
  gapMatch?: CuriosityGapMatch
  budgetCost: number
  reason: string
}
```

## Events

```txt
CuriosityAssessmentCreated
CuriosityGapFound
CuriosityGapMatched
CuriosityBudgetUpdated
CuriosityMomentumChanged
```

## Rule

Curiosity Engine may recommend that something is valuable.

Decision Engine decides whether now is the right time.
