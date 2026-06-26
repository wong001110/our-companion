# Decision Engine Specification

## Purpose

Decision Engine turns cognitive assessments into action choices.

## Input

```ts
type DecisionInput = {
  eventType: string
  targetId?: string
  discovery?: Discovery
  insight?: Insight
  curiosity?: CuriosityAssessment
  attention?: AttentionAssessment
  userContext: UserContext
  companionContext: CompanionContext
}
```

## User Context

```ts
type UserContext = {
  mode: 'idle' | 'focused' | 'chatting' | 'working' | 'away'
  localTime: string
  recentActions: string[]
  fatigueScore: number
}
```

## Companion Context

```ts
type CompanionContext = {
  dailySharedCount: number
  lastSpokenAt?: string
  attentionBudgetRemaining: number
  curiosityBudgetRemaining: number
  trustScore: number
}
```

## Output

```ts
type CompanionDecision = {
  id: string
  action:
    | 'speak'
    | 'queue_for_later'
    | 'remember_only'
    | 'ignore'
    | 'perform_action'
    | 'stay_silent'
  timing: 'now' | 'next_idle' | 'later'
  priority: 'low' | 'normal' | 'high'
  reason: string
}
```

## Events

```txt
DecisionRequested
CompanionDecisionMade
SilenceChosen
AnnMessageQueued
ActionQueued
```

## Rule

Decision Engine outputs decision, not final UI.
Expression Engine handles wording.
Character Engine handles mood and animation.
