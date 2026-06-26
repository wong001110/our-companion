# Insight Engine

## Purpose

The Insight Engine converts discovery candidates into meaning.

It is the most important part of the autonomous discovery system.

Discovery Engine finds materials.
Insight Engine explains why they matter.

It answers:

```text
What does this discovery mean for this specific user?
```

---

## Input

```ts
export type GenerateInsightsInput = {
  userId: string;
  companionId: string;

  characterState: CharacterState;
  memoryProfile: UserMemoryProfile;
  journeySummary: JourneySummary;
  patterns: Pattern[];
  interestGraph: InterestGraph;

  curiosityTarget: CuriosityTarget;
  discoveryCandidates: DiscoveryCandidate[];
};
```

---

## Output

```ts
export type CompanionInsight = {
  id: string;
  userId: string;
  companionId: string;

  title: string;

  type:
    | "observation"
    | "pattern"
    | "hypothesis"
    | "question"
    | "opportunity"
    | "warning"
    | "contradiction"
    | "practical_next_step";

  summary: string;
  insight: string;

  whyItMatters: string;
  whyAnnFoundIt: string;

  confidence: number;
  novelty: number;
  emotionalRelevance: number;
  practicalRelevance: number;

  supportingCandidateIds: string[];
  relatedMemoryIds?: string[];
  relatedPatternIds?: string[];

  suggestedQuestion?: string;
  suggestedAction?: string;

  createdAt: string;
};
```

---

## Insight Types

### Observation

```text
Many AI companion products are moving away from chat-first interfaces.
```

---

### Pattern

```text
The user keeps returning to AI systems that help people explore, not just execute tasks.
```

---

### Hypothesis

```text
The user may care more about emotionally present AI than pure productivity.
```

---

### Question

```text
Should Our Companion be designed as a tool, a pet, or a living presence?
```

---

### Opportunity

```text
There may be a unique product space around AI companions that proactively explore for users.
```

---

### Warning

```text
If Discovery becomes a feed, it may lose the companion feeling.
```

---

### Contradiction

```text
The user says they want a practical feature, but the design direction keeps moving toward emotional presence.
```

---

### Practical Next Step

```text
Build the exploration state machine before adding more discovery sources.
```

---

## Insight Synthesis Prompt

```text
You are the Insight Engine for an autonomous AI companion.

Your job is to turn discovery candidates into meaningful insights for this specific user.

You must consider:
- companion personality
- user memory
- user journey
- detected patterns
- curiosity target
- discovery candidates

Do not simply summarize sources.
Do not produce generic recommendations.
Do not write like a search engine.

Generate 1 to 3 insights.

Each insight must include:
- title
- type
- summary
- insight
- whyItMatters
- whyAnnFoundIt
- confidence
- novelty
- emotionalRelevance
- practicalRelevance
- supportingCandidateIds
- suggestedQuestion
- suggestedAction

The insight should feel like Ann discovered something meaningful after exploring.
```

---

## Insight Selection

If multiple insights are generated, select one primary insight for Ann to bring back.

Selection score:

```ts
selectionScore =
  confidence * 0.20 +
  novelty * 0.20 +
  emotionalRelevance * 0.25 +
  practicalRelevance * 0.20 +
  relationshipFit * 0.15
```

---

## Companion Narration

Insight Engine should produce structured insight.

Companion Narrator converts it into Ann's voice.

Example structured insight:

```text
Many AI teams are trying to make AI less dependent on chat interfaces.
```

Narrated by Ann:

```text
I found something interesting while exploring.

A lot of teams seem to be trying the same thing we are thinking about:
making AI feel present without forcing everything into a chat box.

I think this might matter for Our Companion.
```

---

## Evidence Policy

Do not overload the user with links.

Default presentation:

```text
Insight first
Evidence optional
```

UX:

```text
[Explore Evidence]
[Save]
[Not interested]
[Talk about this]
```

---

## Insight Memory Feedback

When user responds:

- Saved → reinforce related pattern and interest graph nodes
- Explored → increase curiosity confidence
- Dismissed → reduce related node weights
- Not accurate → lower pattern confidence
- Very useful → save as high-value insight

---

## Recommended Implementation

```text
packages/insight-engine/
├─ src/
│  ├─ index.ts
│  ├─ insight-engine.service.ts
│  ├─ insight-prompts.ts
│  ├─ insight-score.ts
│  ├─ insight-selector.ts
│  ├─ narrator-adapter.ts
│  ├─ insight-types.ts
│  └─ insight.repository.ts
└─ README.md
```

Required first milestone:

```text
Discovery Candidates + Memory + Patterns → Companion Insight
```
