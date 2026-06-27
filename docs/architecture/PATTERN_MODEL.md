# Pattern Model

## Core Types

### PatternV2

The enhanced pattern unit:

```typescript
interface PatternV2 {
  id: string;
  userId: string;
  category: PatternCategory;
  type: PatternType;
  title: string;
  summary: string;
  confidence: number;
  strength: number;
  supportingMemoryIds: string[];
  firstDetectedAt: string;
  lastUpdatedAt: string;
  reinforcementCount: number;
  evidence: PatternEvidence[];
}
```

### PatternCategory

Categories of patterns:

```typescript
type PatternCategory =
  | 'interest'
  | 'behaviour'
  | 'conversation'
  | 'project'
  | 'learning'
  | 'temporal'
  | 'relationship';
```

### PatternQuery

Query for retrieving patterns:

```typescript
interface PatternQuery {
  categories?: PatternCategory[];
  types?: PatternType[];
  minConfidence?: number;
  limit?: number;
}
```

### PatternDetectionInput

Input for pattern detection:

```typescript
interface PatternDetectionInput {
  userId: string;
  memories: MemoryRecord[];
  discoveries?: Discovery[];
  feedback?: DiscoveryFeedback[];
}
```

### PatternDetectionResult

Result of pattern detection:

```typescript
interface PatternDetectionResult {
  patterns: PatternV2[];
  metadata: {
    memoriesAnalyzed: number;
    patternsDetected: number;
    avgConfidence: number;
  };
}
```

---

## Pattern Lifecycle

1. **Detection**: Analyze memories to find patterns
2. **Storage**: Store detected patterns in engine
3. **Retrieval**: Query patterns by category, type, confidence
4. **Reinforcement**: Increase pattern strength when re-confirmed
5. **Decay**: Patterns naturally decay over time (future)

---

## Evidence Structure

Each pattern includes supporting evidence:

```typescript
interface PatternEvidence {
  sourceType: 'memory' | 'journey_event' | 'conversation' | 'discovery_feedback' | 'saved_discovery' | 'dismissed_discovery';
  sourceId?: string;
  summary: string;
  weight: number;
}
```

---

## Scoring Factors

### Confidence Score
- Higher with more supporting memories
- Higher with recent activity
- Higher with reinforcement
- Higher with consistency

### Strength Score
- Initially equal to confidence
- Increases with reinforcement
- Decreases over time (future decay)
