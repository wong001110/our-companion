# Pattern Engine V2 Architecture

## Overview

Pattern Engine V2 detects recurring structures, habits, relationships, and trends from memory. It transforms raw memories into meaningful patterns without making decisions or generating insights.

---

## Pattern Categories

### Interest Patterns
- Detects repeated topics and entities
- Groups by tags and entities
- Scores by frequency and importance

### Behaviour Patterns
- Detects recurring user actions
- Identifies habits and routines
- Scores by consistency

### Conversation Patterns
- Detects recurring conversation themes
- Identifies preferred discussion topics
- Scores by frequency

### Project Patterns
- Detects project-related patterns
- Identifies active projects
- Scores by recent activity

### Learning Patterns
- Detects learning patterns
- Identifies knowledge gaps being filled
- Scores by progress

### Temporal Patterns
- Detects time-based patterns
- Identifies daily/weekly routines
- Scores by regularity

### Relationship Patterns
- Detects entity relationships
- Identifies connected concepts
- Scores by connection strength

---

## Public API

```typescript
class PatternEngine {
  detectPatterns(input: PatternDetectionInput): PatternDetectionResult;
  getPatterns(query?: PatternQuery): PatternV2[];
  reinforcePattern(patternId: string): void;
  getPatternById(id: string): PatternV2 | undefined;
}
```

---

## Confidence Model

Confidence is calculated from multiple factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| Supporting memories | 0.3 | min(1, count / 5) |
| Recency | 0.25 | How recently pattern was seen |
| Reinforcement | 0.2 | min(1, count / 3) |
| Consistency | 0.15 | How consistent the pattern is |
| Importance | 0.1 | avg(importance) / 100 |

---

## Memory Integration

Pattern Engine consumes memory from Memory Engine:

```
Memory Engine → Pattern Engine → Insight Engine → Decision Engine
```

Pattern Engine:
- Reads memories via `PatternDetectionInput.memories`
- Does not modify memories
- Creates patterns based on memory analysis

---

## Extension Points

### Future Enhancements
- **ML-based detection**: Replace rule-based with trained models
- **Embedding-based similarity**: Use vector embeddings for pattern matching
- **Real-time detection**: Detect patterns as memories are created
- **Cross-session patterns**: Detect patterns across multiple sessions
- **User feedback integration**: Use feedback to improve detection
