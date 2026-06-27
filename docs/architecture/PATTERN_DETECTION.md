# Pattern Detection

## Overview

Pattern detection analyzes memories to find recurring structures, habits, relationships, and trends.

---

## Detection Process

1. **Input**: Receive memories, discoveries, feedback
2. **Analysis**: Run each detector on memories
3. **Scoring**: Calculate confidence for each pattern
4. **Ranking**: Sort by confidence descending
5. **Limiting**: Return top N patterns
6. **Storage**: Store patterns in engine

---

## Detectors

### Interest Detector
- Groups memories by tags and entities
- Detects repeated topics
- Scores by frequency and importance

### Behaviour Detector
- Groups memories by source
- Detects recurring actions
- Scores by consistency

### Conversation Detector
- Filters for question-type memories
- Detects recurring questions
- Scores by frequency

### Project Detector
- Filters for project-related memories
- Detects active projects
- Scores by recent activity

### Learning Detector
- Filters for learning-related memories
- Detects learning patterns
- Scores by progress

### Temporal Detector
- Analyzes recent memories (7 days)
- Detects activity bursts
- Scores by recency

### Relationship Detector
- Analyzes entity co-occurrence
- Detects entity relationships
- Scores by connection strength

---

## Confidence Calculation

```
confidence = memoryScore + recencyScore + reinforcementScore + consistencyScore + importanceScore

memoryScore = min(1, count / 5) * 0.3
recencyScore = recency * 0.25
reinforcementScore = min(1, count / 3) * 0.2
consistencyScore = consistency * 0.15
importanceScore = (avgImportance / 100) * 0.1
```

---

## Example Detections

### Interest Pattern
**Input**: 3 memories about PixiJS
**Output**:
```
Interest in pixijs
Category: interest
Confidence: 0.75
Supporting memories: 3
```

### Relationship Pattern
**Input**: 3 memories mentioning Ann and PixiJS together
**Output**:
```
Relationship: Ann ↔ PixiJS
Category: relationship
Confidence: 0.65
Supporting memories: 3
```

### Behaviour Pattern
**Input**: 3 memories from voice_input source
**Output**:
```
Recurring behaviour: voice_input
Category: behaviour
Confidence: 0.60
Supporting memories: 3
```

---

## Future Enhancements

- **ML-based detection**: Replace rules with trained models
- **Embedding similarity**: Use vector embeddings for pattern matching
- **Real-time detection**: Detect patterns as memories are created
- **Cross-session patterns**: Detect patterns across sessions
- **User feedback**: Use feedback to improve detection
- **Pattern decay**: Patterns naturally decay over time
