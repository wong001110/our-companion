# Discovery Agent System

## Purpose

Discovery Agents collect candidate materials based on curiosity targets and exploration plans.

They do not decide final meaning.
They do not directly talk to the user.
They do not replace the Insight Engine.

They answer:

```text
What did Ann find while exploring this curiosity target?
```

---

## Input

```ts
export type RunDiscoveryAgentsInput = {
  userId: string;
  companionId: string;
  curiosityTarget: CuriosityTarget;
  explorationPlan: ExplorationPlan;
  sourceConfig: DiscoverySourceConfig;
};
```

---

## Output

```ts
export type DiscoveryCandidate = {
  id: string;
  userId: string;
  companionId: string;

  title: string;
  summary: string;

  sourceType:
    | "github"
    | "article"
    | "blog"
    | "paper"
    | "video"
    | "website"
    | "product"
    | "community_discussion"
    | "internal_memory"
    | "generated_idea";

  sourceUrl?: string;
  sourceName?: string;

  agentType:
    | "scout"
    | "research"
    | "builder"
    | "trend"
    | "contrarian"
    | "memory_scout";

  relatedCuriosityTargetId: string;

  relevanceScore: number;
  noveltyScore: number;
  evidenceScore: number;
  usefulnessScore: number;

  rawEvidence?: string;
  collectedAt: string;
};
```

---

## Agent Types

### 1. Scout Agent

Goal:

```text
Find new and interesting things near the curiosity target.
```

Best sources:

```text
Product Hunt
Hacker News
Blogs
Reddit
GitHub trending
News
```

Example:

```text
Find new examples of ambient AI companion interfaces.
```

---

### 2. Research Agent

Goal:

```text
Find deeper conceptual, academic, or theoretical materials.
```

Best sources:

```text
arXiv
Google Scholar style search
Research blogs
Long-form essays
Papers
```

Example:

```text
Find research related to calm technology and ambient computing.
```

---

### 3. Builder Agent

Goal:

```text
Find practical implementation references.
```

Best sources:

```text
GitHub
NPM
Docs
Tutorials
Framework examples
```

Example:

```text
Find Electron overlay or desktop pet implementation examples.
```

---

### 4. Trend Agent

Goal:

```text
Find emerging patterns across multiple sources.
```

Best sources:

```text
News
Hacker News
Product Hunt
Twitter/X summaries if available
Reddit
Tech blogs
```

Example:

```text
Are AI companions moving away from chat UI?
```

---

### 5. Contrarian Agent

Goal:

```text
Find arguments against the user's current assumptions.
```

Best sources:

```text
Essays
Critical articles
Forum debates
Negative reviews
Failure postmortems
```

Example:

```text
Find why AI companions fail or why users abandon them.
```

---

### 6. Memory Scout Agent

Goal:

```text
Find internal memory connections instead of external web materials.
```

Best sources:

```text
User memory
Journey history
Diary entries
Past discoveries
Conversation summaries
```

Example:

```text
Find older user ideas related to the current curiosity target.
```

---

## Exploration Plan

```ts
export type ExplorationPlan = {
  id: string;
  curiosityTargetId: string;

  objective:
    | "find_new_examples"
    | "find_practical_references"
    | "find_related_research"
    | "find_trends"
    | "challenge_assumption"
    | "connect_to_memory";

  agents: DiscoveryAgentType[];

  searchQueries: string[];
  constraints?: string[];

  maxCandidatesPerAgent: number;
  createdAt: string;
};
```

---

## Planner Prompt

```text
You are the Exploration Planner for an autonomous AI companion.

Given a curiosity target, generate an exploration plan.

Return:
- objective
- agents to run
- search queries
- constraints
- what kind of candidates are valuable

Do not generate final insights.
Do not write to the user.
```

---

## Agent Prompt Template

```text
You are a Discovery Agent for an autonomous AI companion.

Agent type: {{agentType}}
Curiosity target: {{curiosityTarget}}
Exploration objective: {{objective}}
User memory summary: {{memorySummary}}
Companion personality: {{characterSummary}}

Find candidate discoveries.

Return candidates with:
- title
- summary
- sourceType
- sourceUrl if available
- relevanceScore
- noveltyScore
- evidenceScore
- usefulnessScore
- why this candidate was collected

Do not create user-facing narration.
Do not over-explain.
```

---

## Candidate Scoring

```ts
candidateScore =
  relevanceScore * 0.35 +
  noveltyScore * 0.20 +
  evidenceScore * 0.20 +
  usefulnessScore * 0.15 +
  sourceQualityScore * 0.10
```

---

## Candidate Deduplication

Deduplicate by:

```text
same URL
same title
same source
semantic similarity
same project/tool/article
```

If duplicates exist, merge evidence.

---

## Important Design Rule

Discovery Candidates are raw materials.

Do not show raw candidates as the main UX.

The main UX should show:

```text
Insight
+
Why Ann brought it back
+
Optional evidence/candidates
```

---

## Recommended Implementation

```text
packages/discovery-engine/
├─ src/
│  ├─ agents/
│  │  ├─ scout-agent.ts
│  │  ├─ research-agent.ts
│  │  ├─ builder-agent.ts
│  │  ├─ trend-agent.ts
│  │  ├─ contrarian-agent.ts
│  │  └─ memory-scout-agent.ts
│  ├─ planner/
│  │  ├─ exploration-planner.ts
│  │  └─ exploration-prompts.ts
│  ├─ scoring/
│  │  └─ candidate-score.ts
│  ├─ discovery-engine.service.ts
│  └─ discovery-types.ts
└─ README.md
```

Required first milestone:

```text
Curiosity Target → Exploration Plan → Discovery Candidates
```
