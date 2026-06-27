# Insight Pipeline

## Overview

The Insight Pipeline transforms patterns into meaningful observations that drive Decision Engine reasoning.

---

## Pipeline Stages

### 1. Pattern Analysis
- Receive patterns from Pattern Engine
- Categorize patterns by type
- Filter relevant patterns

### 2. Evidence Aggregation
- Collect supporting memories
- Aggregate pattern evidence
- Calculate evidence count

### 3. Insight Generation
- Generate insights per category
- Apply scoring model
- Prevent duplicates

### 4. Storage and Retrieval
- Store insights in engine
- Index by category, confidence, importance
- Support query and archival

---

## Integration Diagram

```
┌─────────────────┐
│  Memory Engine  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Pattern Engine  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Insight Engine  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Decision Engine │
└─────────────────┘
```

---

## Dependency Rules

- Memory → Pattern → Insight → Decision
- One-way dependency direction
- Insight Engine consumes Pattern and Memory
- Pattern and Memory do not depend on Insight Engine

---

## Future Extension Points

### LLM-Assisted Explanation
- Use LLM to generate natural language explanations
- Improve insight quality

### Proactive Companion Sharing
- Share insights with user proactively
- Trigger conversation topics

### Discovery Recommendations
- Use insights to recommend new discoveries
- Guide exploration direction

### Decision Support
- Provide insights to Decision Engine
- Inform action decisions

### Reflection Sessions
- Use insights during reflection
- Generate diary entries from insights
