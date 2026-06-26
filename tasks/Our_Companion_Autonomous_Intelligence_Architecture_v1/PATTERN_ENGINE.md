# Pattern Engine

## Purpose

The Pattern Engine detects repeated themes, behaviors, tensions, and long-term signals from the user's memory and journey.

It answers:

```text
What patterns are emerging from this user's behavior over time?
```

Pattern Engine is not a recommendation engine.
It is the system that helps Ann understand the user beyond isolated memories.

---

## Inputs

```ts
export type DetectPatternsInput = {
  userId: string;
  memoryProfile: UserMemoryProfile;
  journeyEvents: JourneyEvent[];
  discoveryHistory: DiscoveryItem[];
  feedbackHistory: DiscoveryFeedback[];
  conversationSummaries?: string[];
};
```

---

## Output

```ts
export type Pattern = {
  id: string;
  userId: string;

  type:
    | "repeated_theme"
    | "interest_cluster"
    | "abandoned_direction"
    | "returning_topic"
    | "contradiction"
    | "interest_shift"
    | "exploration_loop"
    | "aesthetic_preference"
    | "technical_preference";

  title: string;
  summary: string;

  confidence: number;
  strength: number;
  freshness: number;

  evidence: PatternEvidence[];

  createdAt: string;
  updatedAt: string;
};
```

Evidence:

```ts
export type PatternEvidence = {
  sourceType:
    | "memory"
    | "journey_event"
    | "conversation"
    | "discovery_feedback"
    | "saved_discovery"
    | "dismissed_discovery";

  sourceId?: string;
  summary: string;
  weight: number;
};
```

---

## Pattern Types

### Repeated Theme

Example:

```text
The user repeatedly explores AI systems that help people think, explore, or feel accompanied.
```

---

### Interest Cluster

Example:

```text
AI Companion, Desktop Pet, Memory System, Ambient AI all cluster around emotionally present AI.
```

---

### Abandoned Direction

Example:

```text
The user explored video AI and Discord automation, but did not continue them.
```

---

### Returning Topic

Example:

```text
The user keeps returning to desktop companions and character-based AI systems.
```

---

### Contradiction

Example:

```text
The user says they want productivity tools, but their repeated design interest is emotional companionship.
```

---

### Interest Shift

Example:

```text
The user shifted from AI requirement tools to AI companion systems.
```

---

### Exploration Loop

Example:

```text
The user repeatedly enters concept design, asks for architecture, then requests AI-readable specs and ZIP packs.
```

---

### Aesthetic Preference

Example:

```text
The user prefers soft lavender, warm anime-inspired, hand-drawn visual systems.
```

---

### Technical Preference

Example:

```text
The user prefers modular engine/package design and AI-readable markdown specifications.
```

---

## Pattern Detection Prompt

```text
You are the Pattern Engine for an autonomous AI companion.

Your job is to analyze the user's memory, journey, discovery feedback, and conversation summaries.

Find repeated patterns that may help the companion understand the user.

Do not give advice.
Do not write to the user.
Do not generate discoveries.

Return patterns with:
- type
- title
- summary
- confidence
- strength
- freshness
- evidence list

Focus on patterns that can guide future curiosity and discovery.
```

---

## Pattern Scoring

```ts
patternStrength =
  frequency * 0.35 +
  recency * 0.25 +
  emotionalWeight * 0.20 +
  feedbackWeight * 0.20
```

Fields:

```ts
export type PatternScore = {
  frequency: number;
  recency: number;
  emotionalWeight: number;
  feedbackWeight: number;
  finalScore: number;
};
```

---

## Pattern Lifecycle

```text
Detected
  ↓
Confirmed
  ↓
Reinforced
  ↓
Weakening
  ↓
Archived
```

A pattern should not be treated as permanent.
Patterns can decay if no longer reinforced.

---

## Interest Decay

When a topic is repeatedly ignored, reduce its weight.

Example:

```text
User dismissed 5 marketing-related discoveries.
Marketing should become less important in future curiosity generation.
```

---

## Pattern Output Example

```json
{
  "type": "repeated_theme",
  "title": "Exploration Companion Theme",
  "summary": "The user repeatedly explores products where AI helps users discover directions, not just complete tasks.",
  "confidence": 0.91,
  "strength": 0.88,
  "freshness": 0.94,
  "evidence": [
    {
      "sourceType": "memory",
      "summary": "User explored GuildMaster, Our Lantern, and Our Companion.",
      "weight": 0.9
    },
    {
      "sourceType": "conversation",
      "summary": "User wants AI-led discovery based on memory and companion personality.",
      "weight": 0.95
    }
  ]
}
```

---

## Implementation Notes

Recommended package:

```text
packages/pattern-engine/
├─ src/
│  ├─ index.ts
│  ├─ pattern-engine.service.ts
│  ├─ pattern-prompts.ts
│  ├─ pattern-score.ts
│  ├─ pattern-types.ts
│  └─ pattern.repository.ts
└─ README.md
```

If a separate package is too much for now, implement under:

```text
packages/journey-engine/src/pattern/
```

Required first milestone:

```text
Memory + Journey + Feedback → Patterns
```
