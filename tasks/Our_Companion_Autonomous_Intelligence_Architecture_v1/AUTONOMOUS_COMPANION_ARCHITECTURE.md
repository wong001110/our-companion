# Our Companion - Autonomous Companion Architecture v1

## Purpose

This document defines the autonomous intelligence architecture for **Our Companion**.

The goal is not to build a normal AI assistant, recommendation feed, or chatbot.

The goal is to build:

> A companion that remembers, becomes curious, explores the world, forms insights, and returns to the user with meaningful discoveries.

Core flow:

```text
Character
  ↓
Memory
  ↓
Journey
  ↓
Pattern
  ↓
Interest Graph
  ↓
Curiosity
  ↓
Discovery
  ↓
Insight
  ↓
Diary
  ↓
Companion Presentation
```

---

## Existing Package Context

Current packages:

```text
packages/
├─ ai-engine
├─ character-engine
├─ database
├─ diary-engine
├─ discovery-engine
├─ journey-engine
├─ memory-engine
├─ shared
├─ speech-engine
└─ tool-engine
```

Recommended new packages:

```text
packages/
├─ curiosity-engine      # NEW
├─ insight-engine        # NEW
└─ pattern-engine        # OPTIONAL, can start inside journey-engine
```

Recommended architecture:

```text
packages/
├─ ai-engine
├─ character-engine
├─ memory-engine
├─ journey-engine
├─ pattern-engine
├─ curiosity-engine
├─ discovery-engine
├─ insight-engine
├─ diary-engine
├─ tool-engine
├─ speech-engine
├─ database
└─ shared
```

---

## Engine Responsibilities

### character-engine

Owns who the companion is.

Responsibilities:

- Companion personality
- Emotional state
- Relationship state
- Current mood
- Curiosity bias
- Response tone
- Companion behavior tendency

Example output:

```ts
export type CharacterState = {
  companionId: string;
  name: string;
  mood: "calm" | "curious" | "excited" | "tired" | "playful";
  energy: number;
  curiosity: number;
  empathy: number;
  playfulness: number;
  technicalDepth: number;
  riskTolerance: number;
};
```

---

### memory-engine

Owns user memory.

Responsibilities:

- User interests
- Active projects
- Past projects
- Saved discoveries
- Dismissed discoveries
- User preferences
- Long-term relationship memory
- Conversation summaries

Example output:

```ts
export type UserMemoryProfile = {
  userId: string;
  interests: string[];
  activeProjects: string[];
  pastProjects: string[];
  repeatedThemes: string[];
  savedDiscoveries: string[];
  rejectedDiscoveries: string[];
  preferredAesthetic?: string[];
  preferredTechStack?: string[];
  recentContextSummary?: string;
};
```

---

### journey-engine

Owns user evolution over time.

Responsibilities:

- Interest evolution
- Project timeline
- Exploration history
- User growth arcs
- Current user journey stage
- Long-term direction changes

Example:

```text
GuildMaster
  ↓
Our Lantern
  ↓
Our Companion
```

Possible inferred theme:

```text
The user repeatedly explores AI systems that help people think, explore, and feel accompanied.
```

---

### pattern-engine

Owns repeated pattern detection.

Responsibilities:

- Repeated topics
- Repeated abandoned directions
- Recurring emotional themes
- User exploration loops
- Interest decay
- Interest reinforcement
- Contradictions between stated goals and actual behavior

Can start as a module inside `journey-engine`, then split later.

---

### curiosity-engine

Owns what Ann becomes curious about.

Responsibilities:

- Generate curiosity targets
- Decide exploration direction
- Convert memory + patterns into exploration intent
- Decide similar / adjacent / opposite exploration mode
- Prioritize what Ann should explore now

Curiosity Engine does **not** search the web.

It answers:

```text
What should Ann be curious about right now, and why?
```

---

### discovery-engine

Owns external and internal discovery execution.

Responsibilities:

- Search external sources
- Query tools
- Retrieve candidates
- Run discovery agents
- Normalize discovery candidates
- Deduplicate candidates
- Provide candidate evidence

Discovery Engine should not decide final meaning.

It answers:

```text
What did Ann find?
```

---

### insight-engine

Owns meaning-making.

Responsibilities:

- Convert discovery candidates into insights
- Connect findings to memory
- Generate observations
- Generate hypotheses
- Generate questions
- Explain why the discovery matters
- Produce user-facing insight candidates

Insight Engine answers:

```text
What does this discovery mean for this user?
```

---

### diary-engine

Owns Ann's personal reflection record.

Responsibilities:

- Save what Ann learned
- Save how Ann interpreted the user
- Save post-discovery reflections
- Convert events into companion diary entries
- Store relationship-aware observations

Diary is not a raw event log.

Diary should feel like:

```text
Today I noticed the user still cares deeply about AI companionship. I found something about ambient AI that may help them think about Our Companion differently.
```

---

### ai-engine

Owns LLM execution.

Responsibilities:

- Prompt orchestration
- Model routing
- Token budget
- JSON validation
- Retry policy
- Safety guardrails
- Output repair

Other engines should call `ai-engine`, not direct LLM APIs.

---

### tool-engine

Owns external tool access.

Responsibilities:

- Web search
- GitHub search
- RSS source access
- Scraping adapters
- Product Hunt / HN / Reddit source adapters
- Future local file/tool integrations

---

## Domain Event Flow

Recommended event chain:

```text
UserMemoryUpdated
  ↓
PatternDetected
  ↓
CuriosityTargetGenerated
  ↓
ExplorationPlanned
  ↓
DiscoveryStarted
  ↓
DiscoveryCandidateCollected
  ↓
InsightSynthesized
  ↓
CompanionReturned
  ↓
UserFeedbackReceived
  ↓
MemoryUpdated
  ↓
DiaryEntryCreated
```

---

## Package Dependency Rule

Avoid circular dependency.

Recommended direction:

```text
shared
database
ai-engine
tool-engine
memory-engine
character-engine
journey-engine
pattern-engine
curiosity-engine
discovery-engine
insight-engine
diary-engine
```

High-level orchestration can live in:

```text
discovery-engine/orchestrator
```

or a future:

```text
companion-runtime-engine
```

Do not let low-level engines import high-level engines.

---

## Autonomous Discovery Runtime

Core runtime:

```ts
export interface AutonomousDiscoveryRuntime {
  runCycle(input: RunDiscoveryCycleInput): Promise<DiscoveryCycleResult>;
}
```

Input:

```ts
export type RunDiscoveryCycleInput = {
  userId: string;
  companionId: string;
  trigger:
    | "scheduled"
    | "manual"
    | "memory_updated"
    | "journey_shift"
    | "user_idle"
    | "companion_curiosity";
};
```

Output:

```ts
export type DiscoveryCycleResult = {
  cycleId: string;
  curiosityTargets: CuriosityTarget[];
  discoveryCandidates: DiscoveryCandidate[];
  insights: CompanionInsight[];
  selectedInsight?: CompanionInsight;
  diaryEntryId?: string;
};
```

---

## Runtime Steps

```text
1. Load character state
2. Load user memory profile
3. Load journey summary
4. Detect or load patterns
5. Build or update interest graph
6. Generate curiosity targets
7. Plan exploration
8. Run discovery agents
9. Collect candidates
10. Synthesize insights
11. Select best insight
12. Generate companion narration
13. Create diary entry
14. Present to user
15. Capture user feedback
16. Update memory and journey
```

---

## MVP for Phase 3

Since Phase 1 and Phase 2 already exist, proceed directly to Autonomous Discovery.

MVP scope:

1. Add `curiosity-engine`
2. Add `insight-engine`
3. Add exploration loop state machine
4. Wire existing `memory-engine`, `character-engine`, `journey-engine`, and `discovery-engine`
5. Generate one autonomous discovery cycle
6. Let Ann return with one insight
7. Save feedback
8. Save diary reflection

Do not build a generic feed first.

Primary UX should be:

```text
Ann goes exploring.
Ann returns.
Ann shares a meaningful insight.
```
