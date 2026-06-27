# Memory Engine V2 Architecture

## Overview

Memory Engine V2 provides a layered memory architecture supporting short-term, long-term, episodic, and semantic memory types with retrieval, consolidation, decay, and graph integration.

---

## Memory Tiers

### Short-Term Memory (STM)
- **Purpose**: Recent context, session data
- **Capacity**: Max 50 items
- **Retrieval**: Fast, recency-based
- **Consolidation**: Can be promoted to LTM

### Long-Term Memory (LTM)
- **Purpose**: Durable knowledge, important facts
- **Capacity**: Unlimited
- **Retrieval**: Scored by relevance
- **Decay**: Applies over time

### Episodic Memory
- **Purpose**: Events and experiences
- **Examples**: "User explored cloud storage today"
- **Metadata**: Timestamp, actors, emotional tone

### Semantic Memory
- **Purpose**: Concepts, entities, relationships
- **Examples**: "Ann is the primary character"
- **Metadata**: Confidence, strength

---

## Public API

```typescript
class MemoryEngine {
  addMemory(input: AddMemoryInput): MemoryRecord;
  retrieveMemory(query: MemoryQuery): MemoryRetrievalResult[];
  consolidateMemory(input?: ConsolidateMemoryInput): ConsolidationResult;
  reinforceMemory(memoryId: string, reason: string): MemoryRecord | undefined;
  applyMemoryDecay(options?: MemoryDecayOptions): MemoryDecayResult;
  getMemoryGraph(query?: MemoryGraphQuery): KnowledgeGraph;
}
```

---

## Event Hooks

The Memory Engine emits events for future Pattern/Insight/Decision engines:

- `memory.created` — New memory added
- `memory.reinforced` — Memory accessed again
- `memory.decayed` — Memory priority reduced
- `memory.consolidated` — STM promoted to LTM
- `memory.retrieved` — Memory accessed for query
- `memory.graph.updated` — Graph structure changed

---

## Integration Points

### For Pattern Engine
- Use `getMemoryGraph()` to detect patterns
- Subscribe to `memory.created` for real-time updates

### For Insight Engine
- Use `retrieveMemory()` with semantic queries
- Leverage `reinforcementCount` for importance

### For Decision Engine
- Use `retrieveMemory()` with context queries
- Check `importance` and `confidence` scores

### For Reflection Engine
- Use `consolidateMemory()` during reflection cycles
- Analyze `decayScore` for memory health
