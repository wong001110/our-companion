# Decision Rules

## Rule 1 — Focus Protection

If user mode is focused:

```txt
queue_for_later
```

unless urgency is high.

## Rule 2 — Daily Limit

If proactive share count >= 3:

```txt
queue_for_later
```

## Rule 3 — Low Novelty

If novelty < 40 and no revival signal:

```txt
remember_only or ignore
```

## Rule 4 — High Growth

If growthValue > 85 and user is idle:

```txt
speak
```

## Rule 5 — Repeated Ignore

If user ignored 3 recent proactive discoveries:

```txt
reduce proactive sharing
```

## Rule 6 — Bad Timing

Late night or high fatigue:

```txt
queue_for_later or stay_silent
```

## Rule 7 — Trust Protection

If source quality is low:

```txt
ignore
```

even if topic is relevant.

## Rule 8 — Revival

If old concept has meaningful new update:

```txt
speak or queue
```

with revival framing.

## Rule 9 — Wildcard Control

Wildcard discoveries must pass quality and timing gates.

## Rule 10 — Silence

If nothing is worth attention:

```txt
stay_silent
```

Silence is valid behavior.
