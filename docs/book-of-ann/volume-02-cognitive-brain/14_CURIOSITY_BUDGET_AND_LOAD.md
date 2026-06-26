# Curiosity Budget and Cognitive Load

## Purpose

The user cannot explore everything.

Curiosity Budget protects mental energy.

## Curiosity Budget

```ts
type CuriosityBudget = {
  date: string
  total: number
  used: number
  remaining: number
  allocations: {
    discovery: number
    journey: number
    reflection: number
    conversation: number
  }
}
```

## Cognitive Load

A score estimating how mentally full the user currently is.

Signals:

- many discoveries shown
- long conversation
- repeated ignores
- late time
- focus mode
- user inactivity
- task completion fatigue

## Rules

### Low Load

Ann may share.

### Medium Load

Ann queues.

### High Load

Ann remembers only or stays silent.

## Example

```txt
Today the user already explored many things.
Ann should say less and organize quietly.
```

## Events

```txt
CuriosityBudgetUpdated
CognitiveLoadChanged
FatigueDetected
```
