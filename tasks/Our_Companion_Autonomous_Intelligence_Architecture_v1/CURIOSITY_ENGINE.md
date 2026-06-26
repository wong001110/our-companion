# Curiosity Engine

## Purpose

The Curiosity Engine decides what Ann becomes curious about.

It does not search the web.
It does not generate final insights.
It does not talk directly to the user.

It answers:

```text
What should Ann explore next, and why?
```

This is the soul of the autonomous companion system.

---

## Inputs

```ts
export type GenerateCuriosityTargetsInput = {
  userId: string;
  companionId: string;
  characterState: CharacterState;
  memoryProfile: UserMemoryProfile;
  journeySummary: JourneySummary;
  patterns: Pattern[];
  interestGraph: InterestGraph;
  recentDiscoveries?: DiscoveryItem[];
  recentFeedback?: DiscoveryFeedback[];
};
```

---

## Output

```ts
export type CuriosityTarget = {
  id: string;
  userId: string;
  companionId: string;

  topic: string;
  description: string;

  source:
    | "memory_trigger"
    | "pattern_trigger"
    | "journey_trigger"
    | "novelty_trigger"
    | "contradiction_trigger"
    | "relationship_trigger"
    | "character_trigger";

  explorationType:
    | "similar"
    | "adjacent"
    | "opposite"
    | "deepening"
    | "challenge"
    | "practical";

  priority: number;
  confidence: number;

  reason: string;
  expectedValue: string;

  relatedMemoryIds?: string[];
  relatedPatternIds?: string[];
  relatedInterestNodeIds?: string[];

  createdAt: string;
};
```

---

## Curiosity Sources

### 1. Memory Trigger

Generated from active memory.

Example:

```text
User is currently working on Our Companion.
Ann becomes curious about ambient AI companion interaction patterns.
```

---

### 2. Pattern Trigger

Generated from repeated behavior.

Example:

```text
User repeatedly explores desktop pets, AI companions, and memory systems.
Ann becomes curious about emotionally present AI interfaces.
```

---

### 3. Journey Trigger

Generated from long-term direction changes.

Example:

```text
User moved from GuildMaster to Our Lantern to Our Companion.
Ann becomes curious about the repeated theme of AI-guided exploration.
```

---

### 4. Novelty Trigger

Generated when a new external topic appears near the user interest graph.

Example:

```text
A new interaction pattern appears in AI desktop agents.
Ann becomes curious because it is new and adjacent.
```

---

### 5. Contradiction Trigger

Generated when there is tension.

Example:

```text
User says they want productivity, but repeatedly explores companionship and emotional presence.
Ann becomes curious about whether the real goal is not productivity.
```

---

### 6. Relationship Trigger

Generated from relationship growth.

Example:

```text
Ann knows the user likes magical, warm, companion-like experiences.
Ann explores things that feel emotionally aligned.
```

---

### 7. Character Trigger

Generated from Ann's own personality.

Example:

```text
Ann has high curiosity and medium playfulness.
She occasionally explores strange or whimsical topics.
```

---

## Curiosity Scoring

Suggested scoring:

```ts
curiosityScore =
  memoryRelevance * 0.25 +
  patternStrength * 0.25 +
  novelty * 0.15 +
  relationshipFit * 0.15 +
  characterFit * 0.10 +
  surprise * 0.10
```

Score fields:

```ts
export type CuriosityScore = {
  memoryRelevance: number;
  patternStrength: number;
  novelty: number;
  relationshipFit: number;
  characterFit: number;
  surprise: number;
  finalScore: number;
};
```

---

## Curiosity Modes

### Similar

Explore close to current interest.

Example:

```text
AI Companion → Desktop Companion Framework
```

---

### Adjacent

Explore nearby but not obvious.

Example:

```text
Desktop Pet → Ambient Computing
```

---

### Opposite

Explore something that challenges assumptions.

Example:

```text
Productivity AI → Slow Software / Calm Technology
```

---

### Deepening

Explore deeper into the same area.

Example:

```text
Memory System → Long-term Personal Knowledge Graph
```

---

### Challenge

Find counterexamples or opposing views.

Example:

```text
AI Companion → Why AI companions fail
```

---

### Practical

Find directly implementable material.

Example:

```text
Electron Companion → Open-source overlay/window examples
```

---

## Curiosity Generation Prompt

```text
You are the Curiosity Engine for an autonomous AI companion.

Your job is to decide what the companion should become curious about next.

You are not recommending content.
You are not writing to the user.
You are not searching the web.

Given:
- companion personality
- user memory profile
- user journey summary
- detected patterns
- interest graph
- recent user feedback

Generate 3 to 7 curiosity targets.

Each target must include:
- topic
- description
- source
- explorationType
- priority
- confidence
- reason
- expectedValue

Prefer targets that are meaningful for this specific user.
Do not only generate similar topics.
Include at least one adjacent or challenging curiosity target.
```

---

## Example Output

```json
{
  "topic": "Ambient AI Interfaces",
  "description": "Explore AI interfaces that stay present without requiring a chat window.",
  "source": "pattern_trigger",
  "explorationType": "adjacent",
  "priority": 0.92,
  "confidence": 0.86,
  "reason": "The user repeatedly explores desktop pets, AI companions, and companion presence.",
  "expectedValue": "May help Our Companion feel alive rather than like a normal chatbot."
}
```

---

## Implementation Notes

Recommended package:

```text
packages/curiosity-engine/
├─ src/
│  ├─ index.ts
│  ├─ curiosity-engine.service.ts
│  ├─ curiosity-score.ts
│  ├─ curiosity-prompts.ts
│  ├─ curiosity-types.ts
│  └─ curiosity-target.repository.ts
└─ README.md
```

Start without database if needed.

MVP can generate curiosity targets from in-memory mock data.

Required first milestone:

```text
Memory + Character + Journey → Curiosity Targets
```
