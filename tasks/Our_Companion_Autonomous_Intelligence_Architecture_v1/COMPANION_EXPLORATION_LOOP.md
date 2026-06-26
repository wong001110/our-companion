# Companion Exploration Loop

## Purpose

This document defines the autonomous exploration state machine for Ann.

The user should feel that:

```text
Ann goes exploring.
Ann finds something.
Ann thinks about it.
Ann returns with something meaningful.
```

Discovery should be experienced as companion behavior, not as a feed.

---

## State Machine

```text
Idle
  ↓
Curious
  ↓
Planning
  ↓
Exploring
  ↓
Collecting
  ↓
Synthesizing
  ↓
Returning
  ↓
Sharing
  ↓
Reflecting
  ↓
Idle
```

---

## States

### Idle

Ann is present but not actively exploring.

Possible UI:

```text
Ann is sitting, blinking, idle animation.
```

Triggers:

```text
scheduled time
user idle
memory update
manual send Ann exploring
new pattern detected
```

---

### Curious

Ann has a curiosity target.

Example:

```text
Ann looks curious.
```

Internal action:

```text
curiosity-engine generates targets
top target selected
```

---

### Planning

Ann decides how to explore.

Internal action:

```text
discovery-engine creates exploration plan
selects discovery agents
creates search queries
```

---

### Exploring

Ann is away or visually searching.

Possible UI:

```text
Ann leaves the desktop area
Ann has "exploring..." status
Ann icon shows small bag/map/magnifier
```

Internal action:

```text
agents begin collection
```

---

### Collecting

Candidates are found.

Internal action:

```text
DiscoveryCandidates are normalized, scored, and deduplicated.
```

Do not notify user yet.

---

### Synthesizing

Ann thinks about what she found.

Internal action:

```text
insight-engine generates insight
primary insight selected
companion narration prepared
```

Possible UI:

```text
Ann thinking animation
```

---

### Returning

Ann comes back.

Possible UI:

```text
Ann returns with small sparkle/item/card
```

Notification:

```text
Ann came back with something.
```

---

### Sharing

Ann presents the insight.

Example:

```text
I found something interesting.

A lot of AI companion projects seem to be moving away from chat-first interfaces.

I think this matters for Our Companion because we are also trying to make Ann feel present, not just like a chat box.
```

Actions:

```text
[Explore]
[Save]
[Not interested]
[Later]
[Talk about this]
```

---

### Reflecting

Ann records what happened.

Internal action:

```text
feedback stored
memory updated
journey updated
diary entry created
interest graph updated
```

---

## Event Model

```ts
export type ExplorationState =
  | "idle"
  | "curious"
  | "planning"
  | "exploring"
  | "collecting"
  | "synthesizing"
  | "returning"
  | "sharing"
  | "reflecting";
```

```ts
export type ExplorationLoopEvent = {
  id: string;
  userId: string;
  companionId: string;
  cycleId: string;
  state: ExplorationState;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};
```

---

## Main Runtime Interface

```ts
export interface CompanionExplorationLoop {
  startCycle(input: StartExplorationCycleInput): Promise<ExplorationCycle>;
  advanceState(cycleId: string): Promise<ExplorationCycle>;
  cancelCycle(cycleId: string): Promise<void>;
  submitFeedback(input: SubmitDiscoveryFeedbackInput): Promise<void>;
}
```

---

## Cycle Data

```ts
export type ExplorationCycle = {
  id: string;
  userId: string;
  companionId: string;

  trigger:
    | "scheduled"
    | "manual"
    | "memory_updated"
    | "pattern_detected"
    | "user_idle"
    | "relationship_moment";

  state: ExplorationState;

  curiosityTargetIds: string[];
  selectedCuriosityTargetId?: string;

  explorationPlanId?: string;
  discoveryCandidateIds: string[];
  insightIds: string[];
  selectedInsightId?: string;

  startedAt: string;
  completedAt?: string;
};
```

---

## Trigger Rules

### Scheduled

Run at configured intervals.

Example:

```text
Once per day
Every few hours
When user is active but not busy
```

---

### Manual

User tells Ann:

```text
Go find something interesting.
```

---

### Memory Updated

If important memory changes, Ann may explore.

Example:

```text
User starts a new project.
```

---

### Pattern Detected

If a strong new pattern appears, Ann explores around it.

---

### User Idle

If the user is idle, Ann can softly explore without interrupting.

---

### Relationship Moment

If Ann has not interacted meaningfully for a while, she can bring back something small.

---

## Interruption Rules

Do not interrupt too often.

Suggested constraints:

```text
Max 1 major discovery per day
Max 3 small discoveries per day
Do not interrupt during focus mode
Do not repeat dismissed topics
Do not show low-confidence insights
```

---

## UX Principle

The main interface is not a discovery feed.

The main interface is:

```text
Ann returned.
```

Archive can exist, but it is secondary.

---

## Animation Mapping

Suggested animation states:

```text
idle
curious
walk_out
exploring
thinking
return
talk_happy
talk_serious
save_reaction
dismiss_reaction
```

---

## MVP Implementation

MVP loop:

```text
Idle
  ↓
Curious
  ↓
Exploring
  ↓
Synthesizing
  ↓
Returning
  ↓
Sharing
  ↓
Reflecting
```

Skip complex Planning and Collecting UI at first.

Required first milestone:

```text
Manual trigger → Ann explores → Insight generated → Ann returns → User feedback stored
```
