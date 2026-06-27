import type {
  MemoryRecord,
  MemoryQuery,
  MemoryRetrievalResult,
  ConsolidateMemoryInput,
  ConsolidationResult,
  MemoryDecayOptions,
  MemoryDecayResult,
  MemoryGraphQuery,
  MemoryEvent,
} from '@our-companion/shared';

export const STM_MAX_SIZE = 50;

export const DEFAULT_DECAY_RATE = 0.02;
export const HIGH_IMPORTANCE_THRESHOLD = 70;
export const HIGH_CONFIDENCE_THRESHOLD = 0.8;
export const MIN_IMPORTANCE_FOR_LTM = 20;
export const SIMILARITY_THRESHOLD_FOR_MERGE = 0.7;

export type MemoryEventHandler = (event: MemoryEvent) => void;

export interface MemoryEngineInternal {
  shortTermBuffer: MemoryRecord[];
  longTermMemory: MemoryRecord[];
  eventHandlers: MemoryEventHandler[];
}

export function createMemoryEngineInternal(): MemoryEngineInternal {
  return {
    shortTermBuffer: [],
    longTermMemory: [],
    eventHandlers: [],
  };
}
