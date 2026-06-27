# Insight Engine V2 Architecture

## Overview

Insight Engine V2 transforms detected patterns into meaningful observations. It explains why patterns matter and generates reusable insights for Decision Engine.

---

## Intelligence Pipeline

```
User Activity → Memory Engine → Pattern Engine → Insight Engine → Decision Engine
```

---

## Insight Categories

### Interest Insights
- Triggered by interest patterns
- Explains user interest trends

### Learning Insights
- Triggered by learning patterns
- Explains knowledge acquisition

### Productivity Insights
- Triggered by behaviour patterns
- Explains productivity trends

### Project Insights
- Triggered by project patterns
- Explains project progress

### Behaviour Insights
- Triggered by behaviour patterns
- Explains user habits

### Relationship Insights
- Triggered by relationship patterns
- Explains entity connections

### Discovery Insights
- Triggered by discovery patterns
- Explains discovery trends

### Risk Insights
- Triggered by abandoned_direction patterns
- Surfaces potential risks

---

## Public API

```typescript
class InsightEngine {
  generateInsights(input: InsightGenerationInput): InsightGenerationResult;
  getInsights(query?: InsightQuery): InsightV2[];
  archiveInsight(insightId: string): void;
  getInsightById(id: string): InsightV2 | undefined;
}
```

---

## Scoring Model

### Confidence
- Based on pattern confidence
- Weighted by pattern strength

### Importance
- Based on pattern strength
- Based on memory importance

### Novelty
- Decreases with reinforcement
- Higher for new patterns

---

## Duplicate Prevention

Insights are deduplicated by:
- Same category + overlapping supporting patterns
- Prevents redundant insight generation

---

## Integration Points

### For Decision Engine
- Use `getInsights()` with category filters
- Check `confidence` and `importance` scores

### For Character Engine
- Use insights to inform character behaviour
- Check `category` for context

### For Reflection Engine
- Use `getInsights()` for reflection sessions
- Archive old insights during reflection
