# Companion Core Loop

## Primary Loop (companion-first)

```
Observe user and system context
→ CompanionBrain + policy gates decide one action
→ Execute coherent character action (animation + optional speech/card)
→ Maintain conversation continuity
→ Interpret user response
→ Update relationship and typed memory safely
→ Return to daily life activity
```

## Secondary Loop (exploration as activity)

```
Curiosity signal during suitable life state
→ Schedule exploration activity (not background agent identity)
→ Collect and dedupe candidates
→ Brain decides whether/when to share (queue does not guarantee presentation)
→ Return + present one concise discovery
→ Capture feedback (not_now ≠ not_interested)
→ Update relationship + memory (discovery ≠ user fact)
```

## What We Do Not Do

```
timer → fetch → score → notify
```

without companion-life context, relationship awareness, and initiative budget.

## Decision Output Shape

One `CompanionDecision` per cycle:

- `action`: stay_silent | idle_activity | respond | approach | share_discovery | start_exploration | continue_conversation | end_conversation | suggest_action | execute_approved_action
- `timing`: now | next_idle | later
- Optional: expression, animationIntent, speechIntent, memoryEffects, relationshipEffects

## Animation Flow

```
decision
→ semantic AnimationIntent (main runtime)
→ AnimationResolver → production asset key
→ animation start (renderer player)
→ optional speech/card
→ animation completion
→ next state
```

## Behavioral Correction (2026)

- `next_idle` discoveries queue in `pending_companion_actions` and re-evaluate on idle/drag/session end — not immediate presentation.
- Conversation sessions are scoped per `userId + companionId`.
- Memory uses candidate → classify → safety → retention pipeline (no message-length heuristic).
- Relationship signals are separate (`conversation_completed` ≠ `positive_feedback`; `not_interested` ≠ `ignored`).
- User attention context uses real signals only — no fabricated fatigue.
- Renderer receives authoritative `CompanionCommand` payloads (channel `companion:behaviorHint` retained for compatibility).

## Initiative Budget (replaces fixed 3/day)

```
base budget
+ high-interaction preference
+ active engagement
- focused mode
- recent ignored interactions
- repeated topic
- late hours
```

Hard safety maximum retained.

## Memory and Proactive Productization

`active Memory → structured/FTS/Vector retrieval → conversation and Discovery` remains the Memory path. Review-pending Memory is visible to the user but excluded from active use.

The existing life scheduler now also evaluates one bounded proactive opportunity. It may choose an unfinished-topic follow-up, Goal check-in, Journey reflection or quiet presence. It must pass user attention, time-of-day, cooldown, daily-budget and repeated-ignore gates before emitting a typed prompt.
