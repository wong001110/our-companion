# Decision Foundation

The Decision Engine is the guardian of attention.

It answers:

```txt
Should Ann do something now?
```

## Decision Inputs

- event type
- discovery or insight
- user current mode
- local time
- recent interactions
- fatigue score
- attention budget
- curiosity budget
- trust score
- novelty
- relevance
- urgency
- growth value
- emotional value

## Decision Outputs

```ts
type DecisionAction =
  | 'speak'
  | 'queue_for_later'
  | 'remember_only'
  | 'ignore'
  | 'perform_action'
  | 'stay_silent'
```

## Example Rules

### Focus Protection

If user is focused:

```txt
queue_for_later
```

unless urgency is very high.

### Daily Limit

If proactive shares >= 3:

```txt
queue_for_later
```

### Low Novelty

If novelty < 40:

```txt
remember_only or ignore
```

### High Growth

If growth value > 85 and user is idle:

```txt
speak
```

### Repeated Ignore

If user ignored recent discoveries:

```txt
reduce sharing frequency
```

## Important Boundary

Decision Engine does not write final bubble text.

It only decides action and reason.
