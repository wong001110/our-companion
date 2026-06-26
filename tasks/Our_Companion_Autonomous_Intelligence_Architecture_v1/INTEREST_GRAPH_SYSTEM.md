# Interest Graph System

## Purpose

The Interest Graph represents the user's interests, projects, themes, and adjacent exploration spaces as a graph.

It should not be a flat list of tags.

It answers:

```text
How are the user's interests connected?
Where can Ann explore next?
```

---

## Why Interest Graph

Bad model:

```json
{
  "interests": ["AI", "Electron", "Desktop Pet", "Memory"]
}
```

Better model:

```text
AI Companion
├─ Desktop Pet
│  ├─ Electron Overlay
│  ├─ Chibi Animation
│  └─ Sprite Sheet
├─ Memory System
│  ├─ User Memory
│  ├─ Relationship Memory
│  └─ Pattern Memory
├─ Ambient AI
│  ├─ Invisible Interface
│  ├─ Context Awareness
│  └─ Calm Computing
└─ Discovery
   ├─ AI-led Discovery
   ├─ Curiosity Engine
   └─ Insight Engine
```

This allows Ann to explore similar, adjacent, and opposite topics.

---

## Graph Node

```ts
export type InterestNode = {
  id: string;
  userId: string;

  label: string;
  description?: string;

  type:
    | "topic"
    | "project"
    | "technology"
    | "aesthetic"
    | "problem"
    | "behavior"
    | "theme"
    | "question"
    | "opposing_view";

  weight: number;
  confidence: number;
  freshness: number;

  source:
    | "memory"
    | "conversation"
    | "journey"
    | "discovery"
    | "manual"
    | "pattern";

  createdAt: string;
  updatedAt: string;
};
```

---

## Graph Edge

```ts
export type InterestEdge = {
  id: string;
  userId: string;

  fromNodeId: string;
  toNodeId: string;

  relation:
    | "similar_to"
    | "part_of"
    | "adjacent_to"
    | "opposes"
    | "supports"
    | "inspired_by"
    | "used_for"
    | "evolved_into"
    | "frequently_appears_with";

  weight: number;
  confidence: number;

  createdAt: string;
};
```

---

## Exploration Expansion

### Similar Expansion

```text
Desktop Pet → Virtual Companion → AI Companion
```

Use for safe recommendations.

---

### Adjacent Expansion

```text
Desktop Pet → Ambient Computing → Calm Technology
```

Use for creative discovery.

---

### Opposite Expansion

```text
Productivity AI → Slow Software → Anti-productivity Design
```

Use for challenging assumptions.

---

### Practical Expansion

```text
Electron Desktop Pet → Frameless Window → Always-on-top Overlay
```

Use for implementation discovery.

---

## Graph Update Sources

The graph should update from:

```text
Memory updates
Discovery feedback
Saved discoveries
Dismissed discoveries
Journey changes
Conversation summaries
Diary reflections
Manual user preferences
```

---

## Interest Weighting

```ts
nodeWeight =
  explicitInterest * 0.30 +
  frequency * 0.25 +
  recency * 0.20 +
  feedback * 0.15 +
  companionDiaryWeight * 0.10
```

---

## Interest Decay

If a node has no reinforcement:

```text
weight decreases over time
freshness decreases over time
```

If user dismisses related discoveries:

```text
weight decreases faster
```

If user saves/explores related discoveries:

```text
weight increases
```

---

## Example Graph Seed for Current Project

```json
{
  "nodes": [
    {
      "label": "Our Companion",
      "type": "project",
      "weight": 1.0
    },
    {
      "label": "Autonomous Discovery",
      "type": "theme",
      "weight": 0.95
    },
    {
      "label": "Curiosity Engine",
      "type": "technology",
      "weight": 0.9
    },
    {
      "label": "Desktop Pet",
      "type": "topic",
      "weight": 0.88
    },
    {
      "label": "Ambient AI",
      "type": "adjacent topic",
      "weight": 0.7
    }
  ]
}
```

---

## Interest Graph Prompt

```text
You are the Interest Graph Builder for an autonomous AI companion.

Given:
- user memory
- journey events
- detected patterns
- discovery feedback
- diary reflections

Build or update an interest graph.

Return:
- nodes
- edges
- recommended expansion paths

Do not create a flat tag list.
Represent meaningful relationships.
Include similar, adjacent, and opposing paths when possible.
```

---

## Recommended Implementation Location

Option A:

```text
packages/memory-engine/src/interest-graph/
```

Option B:

```text
packages/journey-engine/src/interest-graph/
```

Option C:

```text
packages/interest-graph-engine/
```

For MVP, Option A or B is enough.

Required first milestone:

```text
Memory + Patterns → Interest Graph → Curiosity Targets
```
