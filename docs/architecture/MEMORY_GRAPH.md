# Memory Graph

## Overview

Memory Engine builds knowledge graphs from memory records, enabling relationship detection and pattern discovery.

---

## Graph Structure

### Nodes
Each memory becomes a graph node:

```typescript
{
  id: memory.id,
  kind: 'experience',
  title: memory.content.slice(0, 80)
}
```

### Edges
Edges are created when memories share attributes:

```typescript
{
  id: edgeId,
  fromId: memoryA.id,
  toId: memoryB.id,
  type: 'related_to',
  confidence: calculatedConfidence
}
```

---

## Edge Creation Rules

### Shared Tags
- Memories with common tags are linked
- Confidence increases with more shared tags

### Shared Entities
- Memories mentioning same entities are linked
- Confidence increases with more shared entities

### Confidence Calculation
```
confidence = min(1, (sharedTags + sharedEntities) * 0.2 + 0.3)
```

---

## Graph Queries

### Get Full Graph
```typescript
engine.getMemoryGraph();
```

### Filter by Tier
```typescript
engine.getMemoryGraph({ tier: 'long_term' });
```

### Limit Results
```typescript
engine.getMemoryGraph({ limit: 50 });
```

### Combined Query
```typescript
engine.getMemoryGraph({
  tier: 'episodic',
  limit: 100,
});
```

---

## Integration with Pattern Engine

Pattern Engine can use the memory graph to:

1. **Detect clusters**: Groups of strongly connected memories
2. **Find bridges**: Memories connecting different topics
3. **Identify孤岛**: Isolated memories needing connection
4. **Track evolution**: How graph structure changes over time

---

## Integration with Insight Engine

Insight Engine can use the memory graph to:

1. **Find related insights**: Connect new insights to existing knowledge
2. **Detect contradictions**: Find conflicting memories
3. **Identify gaps**: Areas with few connections
4. **Suggest connections**: Recommend new edges based on similarity

---

## Future Enhancements

- **Weighted edges**: Track relationship strength over time
- **Typed relations**: Different edge types for different relationships
- **Temporal edges**: Track when relationships formed
- **Semantic similarity**: Use embeddings for edge creation
- **Graph algorithms**: PageRank, community detection, etc.
