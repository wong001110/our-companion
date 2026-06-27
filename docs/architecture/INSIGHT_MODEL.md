# Insight Model

## Core Types

### InsightV2

The enhanced insight unit:

```typescript
interface InsightV2 {
  id: string;
  userId: string;
  category: InsightCategory;
  title: string;
  summary: string;
  explanation: string;
  supportingPatternIds: string[];
  supportingMemoryIds: string[];
  confidence: number;
  importance: number;
  novelty: number;
  evidenceCount: number;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}
```

### InsightCategory

Categories of insights:

```typescript
type InsightCategory =
  | 'interest'
  | 'learning'
  | 'productivity'
  | 'project'
  | 'behaviour'
  | 'relationship'
  | 'discovery'
  | 'risk';
```

### InsightQuery

Query for retrieving insights:

```typescript
interface InsightQuery {
  categories?: InsightCategory[];
  minConfidence?: number;
  minImportance?: number;
  status?: 'active' | 'archived';
  limit?: number;
}
```

### InsightGenerationInput

Input for insight generation:

```typescript
interface InsightGenerationInput {
  userId: string;
  patterns: PatternV2[];
  memories: MemoryRecord[];
}
```

### InsightGenerationResult

Result of insight generation:

```typescript
interface InsightGenerationResult {
  insights: InsightV2[];
  metadata: {
    patternsAnalyzed: number;
    insightsGenerated: number;
    duplicatesPrevented: number;
  };
}
```

---

## Insight Lifecycle

1. **Generation**: Analyze patterns to create insights
2. **Storage**: Store insights in engine
3. **Retrieval**: Query insights by category, confidence, importance
4. **Archival**: Archive old or irrelevant insights
5. **Consumption**: Decision Engine uses insights for reasoning

---

## Scoring Factors

### Confidence Score
- Based on pattern confidence
- Higher with more supporting patterns

### Importance Score
- Based on pattern strength
- Based on memory importance

### Novelty Score
- Higher for new patterns
- Decreases with reinforcement
