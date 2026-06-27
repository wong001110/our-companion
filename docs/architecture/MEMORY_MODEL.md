# Memory Model

## Core Types

### MemoryRecord

The fundamental memory unit:

```typescript
interface MemoryRecord {
  id: string;
  tier: 'short_term' | 'long_term' | 'episodic' | 'semantic';
  type: 'topic' | 'discovery' | 'resource' | 'question' | 'decision' | 'outcome';
  content: string;
  summary?: string;
  source: string;
  tags: string[];
  entities: string[];
  importance: number;      // 0-100
  confidence: number;      // 0-1
  reinforcementCount: number;
  lastAccessedAt: string;
  createdAt: string;
  updatedAt: string;
  decayScore: number;      // 0-1, lower = more decayed
}
```

### AddMemoryInput

Input for creating new memories:

```typescript
interface AddMemoryInput {
  content: string;
  summary?: string;
  tier: 'short_term' | 'long_term' | 'episodic' | 'semantic';
  type: MemoryNodeType;
  source: string;
  tags?: string[];
  entities?: string[];
  importance?: number;
  confidence?: number;
}
```

### MemoryQuery

Query for retrieving memories:

```typescript
interface MemoryQuery {
  text?: string;
  tags?: string[];
  entities?: string[];
  types?: MemoryNodeType[];
  tiers?: MemoryTier[];
  limit?: number;
  minImportance?: number;
}
```

---

## Scoring Formula

Memory retrieval uses a weighted scoring system:

| Factor | Weight | Description |
|--------|--------|-------------|
| Text match | +30 | Content contains query text |
| Tag match | +20/tag | Matching tags |
| Entity match | +25/entity | Matching entities |
| Type match | +15 | Memory type matches query |
| Importance | +15 * (importance/100) | Higher importance = higher score |
| Confidence | +10 * confidence | Higher confidence = higher score |
| Recency | +10 (24h) / +5 (7d) | Recently accessed memories |
| Reinforcement | +2/count | Each reinforcement boosts score |

---

## Decay Formula

Memory decay reduces priority over time:

```
decayScore = max(0, min(1, currentScore - timeDecay + reinforcementBoost))

timeDecay = daysSinceAccess * decayRate
reinforcementBoost = reinforcementCount * 0.05
```

**Modifiers**:
- High importance (>70): decay rate halved
- High confidence (>0.8): decay rate halved

---

## Consolidation Rules

Short-term to long-term promotion:

1. **Minimum importance**: Items with importance < 20 are discarded
2. **Similarity detection**: Items with >70% content similarity are merged
3. **Merge behavior**: Combined content, union of tags/entities, increased importance
4. **Source preservation**: Original source references maintained

---

## Graph Integration

Memory Engine builds knowledge graphs from memories:

- **Nodes**: Each memory becomes a graph node
- **Edges**: Created when memories share tags or entities
- **Confidence**: Edge confidence based on shared attribute count
- **Relation type**: `related_to` for shared attributes
