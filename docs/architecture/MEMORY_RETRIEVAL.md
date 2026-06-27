# Memory Retrieval

## Overview

Memory retrieval ranks memories by relevance to a query, returning results with scores and explanations.

---

## Retrieval Process

1. **Query parsing**: Extract text, tags, entities, types from query
2. **Scoring**: Calculate relevance score for each memory
3. **Filtering**: Remove memories with score ≤ 0
4. **Ranking**: Sort by score descending
5. **Limiting**: Return top N results
6. **Access update**: Update `lastAccessedAt` for retrieved memories

---

## Score Calculation

### Text Matching
- Case-insensitive substring match in content or summary
- Score: +30 if matched

### Tag Matching
- Case-insensitive partial match
- Score: +20 per matching tag

### Entity Matching
- Case-insensitive partial match
- Score: +25 per matching entity

### Type Matching
- Exact type match required
- Score: +15 if matched
- Score: 0 if not matched (filters out memory)

### Base Factors
- Importance: +(importance/100) * 15
- Confidence: +confidence * 10
- Recency: +10 (24h), +5 (7d)
- Reinforcement: +count * 2

---

## Relevance Explanation

Each result includes a human-readable explanation:

```
"matched tags: pixijs, frontend; high importance; reinforced 3 times"
```

---

## Query Examples

### Text Query
```typescript
engine.retrieveMemory({ text: 'PixiJS tutorials' });
```

### Tag Query
```typescript
engine.retrieveMemory({ tags: ['pixijs', 'frontend'] });
```

### Type Query
```typescript
engine.retrieveMemory({ types: ['decision', 'outcome'] });
```

### Combined Query
```typescript
engine.retrieveMemory({
  text: 'cloud storage',
  tags: ['architecture'],
  types: ['topic', 'resource'],
  limit: 5,
  minImportance: 50,
});
```

---

## Future Enhancements

- **Embedding-based retrieval**: Vector similarity search
- **Semantic matching**: Understanding meaning beyond keywords
- **Context-aware ranking**: Adjust scores based on current session
- **Temporal relevance**: Weight recent memories higher for time-sensitive queries
