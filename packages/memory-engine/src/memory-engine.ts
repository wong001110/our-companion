import type {
  AddMemoryInput,
  MemoryRecord,
  MemoryQuery,
  MemoryRetrievalResult,
  ConsolidateMemoryInput,
  ConsolidationResult,
  MemoryDecayOptions,
  MemoryDecayResult,
  MemoryGraphQuery,
  KnowledgeGraph,
  MemoryEvent,
} from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';
import { createMemoryEngineInternal, type MemoryEngineInternal, type MemoryEventHandler } from './types';
import { createShortTermMemory, addToBuffer } from './short-term-memory';
import { retrieveMemories } from './memory-retrieval';
import { consolidateMemories } from './memory-consolidation';
import { applyDecay, reinforceMemory } from './memory-decay';
import { buildMemoryGraph } from './memory-graph';

export class MemoryEngine {
  private internal: MemoryEngineInternal;

  constructor(initialState?: Partial<MemoryEngineInternal>) {
    this.internal = {
      ...createMemoryEngineInternal(),
      ...initialState,
    };
  }

  onEvent(handler: MemoryEventHandler): () => void {
    this.internal.eventHandlers.push(handler);
    return () => {
      const index = this.internal.eventHandlers.indexOf(handler);
      if (index >= 0) {
        this.internal.eventHandlers.splice(index, 1);
      }
    };
  }

  private emit(type: MemoryEvent['type'], memoryId: string, metadata?: Record<string, unknown>): void {
    const event: MemoryEvent = {
      type,
      memoryId,
      timestamp: nowIso(),
      metadata,
    };
    for (const handler of this.internal.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Handler error should not break memory operations
      }
    }
  }

  addMemory(input: AddMemoryInput): MemoryRecord {
    const memory = createShortTermMemory(input);
    this.internal.shortTermBuffer = addToBuffer(this.internal.shortTermBuffer, memory);
    this.emit('memory.created', memory.id, { tier: memory.tier, type: memory.type });
    return memory;
  }

  retrieveMemory(query: MemoryQuery): MemoryRetrievalResult[] {
    const allMemories = [...this.internal.shortTermBuffer, ...this.internal.longTermMemory];
    const results = retrieveMemories(allMemories, query);

    for (const result of results) {
      this.emit('memory.retrieved', result.memory.id, { relevanceScore: result.relevanceScore });
    }

    return results;
  }

  consolidateMemory(input?: ConsolidateMemoryInput): ConsolidationResult {
    const { result, longTerm } = consolidateMemories(
      this.internal.shortTermBuffer,
      this.internal.longTermMemory,
      input
    );

    this.internal.shortTermBuffer = [];
    this.internal.longTermMemory = longTerm;

    this.emit('memory.consolidated', 'batch', {
      consolidated: result.consolidated,
      merged: result.merged,
      discarded: result.discarded,
    });

    return result;
  }

  reinforceMemory(memoryId: string, reason: string): MemoryRecord | undefined {
    const allMemories = [...this.internal.shortTermBuffer, ...this.internal.longTermMemory];
    const memory = allMemories.find((m) => m.id === memoryId);

    if (!memory) {
      return undefined;
    }

    const reinforced = reinforceMemory(memory, reason);

    const stIndex = this.internal.shortTermBuffer.findIndex((m) => m.id === memoryId);
    if (stIndex >= 0) {
      this.internal.shortTermBuffer[stIndex] = reinforced;
    } else {
      const ltIndex = this.internal.longTermMemory.findIndex((m) => m.id === memoryId);
      if (ltIndex >= 0) {
        this.internal.longTermMemory[ltIndex] = reinforced;
      }
    }

    this.emit('memory.reinforced', memoryId, { reason, reinforcementCount: reinforced.reinforcementCount });
    return reinforced;
  }

  applyMemoryDecay(options?: MemoryDecayOptions): MemoryDecayResult {
    const { updatedMemories: updatedLT, result: ltResult } = applyDecay(this.internal.longTermMemory, options);

    this.internal.longTermMemory = updatedLT;

    this.emit('memory.decayed', 'batch', {
      decayed: ltResult.decayed,
      archived: ltResult.archived,
    });

    return ltResult;
  }

  getMemoryGraph(query?: MemoryGraphQuery): KnowledgeGraph {
    let memories = [...this.internal.shortTermBuffer, ...this.internal.longTermMemory];

    if (query?.tier) {
      memories = memories.filter((m) => m.tier === query.tier);
    }

    if (query?.limit) {
      memories = memories.slice(0, query.limit);
    }

    return buildMemoryGraph(memories);
  }

  getShortTermBuffer(): MemoryRecord[] {
    return [...this.internal.shortTermBuffer];
  }

  getLongTermMemory(): MemoryRecord[] {
    return [...this.internal.longTermMemory];
  }

  getAllMemories(): MemoryRecord[] {
    return [...this.internal.shortTermBuffer, ...this.internal.longTermMemory];
  }
}
