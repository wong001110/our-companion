# Decision Engine V2

## Core Types

### CompanionDecisionCandidate

A possible next move for the companion:

```typescript
interface CompanionDecisionCandidate {
  id: string;
  type: CompanionDecisionCandidateType;
  score: number;
  reason: string;
  requiredInputs: string[];
  risks: string[];
  expectedUserValue: number;
  interruptionCost: number;
  confidence: number;
}
```

### CompanionDecisionResult

The result of a decision:

```typescript
interface CompanionDecisionResult {
  id: string;
  selectedCandidate: CompanionDecisionCandidate;
  rejectedCandidates: CompanionDecisionCandidate[];
  reasoningSummary: string;
  confidence: number;
  shouldInterruptUser: boolean;
  recommendedNextEngine?: string;
  recommendedAction?: string;
  createdAt: string;
}
```

### CompanionDecisionContext

The full context for decision making:

```typescript
interface CompanionDecisionContext {
  user: UserContextSnapshot;
  conversation: ConversationContextSnapshot;
  memory: MemoryContextSnapshot;
  pattern: PatternContextSnapshot;
  insight: InsightContextSnapshot;
  curiosity: CuriosityContextSnapshot;
  character: CharacterContextSnapshot;
  timestamp: string;
}
```

---

## Decision Lifecycle

1. **Context Building**: Gather all relevant context
2. **Candidate Generation**: Generate possible next moves
3. **Scoring**: Score each candidate
4. **Selection**: Select highest-scored candidate
5. **Interruption Check**: Verify safety policy
6. **Explanation**: Generate reasoning summary

---

## Scoring Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Base score | varies | Initial candidate score |
| User mode | -0.15 | Penalty for focused/working users |
| Fatigue | -0.15 | Penalty for tired users |
| Recency | +0.1 | Bonus for long idle time |
| Insight importance | +0.1 | Bonus for strong insights |
| Curiosity score | +0.05 | Bonus for strong curiosity |
| Character energy | -0.1 | Penalty for low energy |
| Confidence | +0.1 | Bonus for high confidence |
