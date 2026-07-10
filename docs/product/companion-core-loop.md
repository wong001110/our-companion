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
→ activity/state transition
→ animationIntent (main runtime)
→ animation start (renderer player)
→ optional speech/card
→ animation completion
→ next state
```

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
