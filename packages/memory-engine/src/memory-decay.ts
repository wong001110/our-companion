import type { MemoryRecord, MemoryDecayOptions, MemoryDecayResult } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';
import {
  DEFAULT_DECAY_RATE,
  HIGH_IMPORTANCE_THRESHOLD,
  HIGH_CONFIDENCE_THRESHOLD,
} from './types';

export function calculateDecayScore(memory: MemoryRecord): number {
  const hoursSinceAccess = (Date.now() - new Date(memory.lastAccessedAt).getTime()) / (1000 * 60 * 60);
  const daysSinceAccess = hoursSinceAccess / 24;

  let decayRate = DEFAULT_DECAY_RATE;

  if (memory.importance > HIGH_IMPORTANCE_THRESHOLD) {
    decayRate *= 0.5;
  }

  if (memory.confidence > HIGH_CONFIDENCE_THRESHOLD) {
    decayRate *= 0.5;
  }

  const reinforcementBoost = memory.reinforcementCount * 0.05;
  const timeDecay = daysSinceAccess * decayRate;

  return Math.max(0, Math.min(1, memory.decayScore - timeDecay + reinforcementBoost));
}

export function applyDecay(
  memories: MemoryRecord[],
  options?: MemoryDecayOptions
): { updatedMemories: MemoryRecord[]; result: MemoryDecayResult } {
  const minImportance = options?.minImportance ?? 0;
  let decayed = 0;
  let archived = 0;

  const updatedMemories = memories.map((memory) => {
    if (memory.importance < minImportance) {
      return memory;
    }

    const newDecayScore = calculateDecayScore(memory);

    if (newDecayScore < 0.2 && memory.importance < HIGH_IMPORTANCE_THRESHOLD) {
      archived++;
      return {
        ...memory,
        decayScore: newDecayScore,
        updatedAt: nowIso(),
      };
    }

    if (newDecayScore !== memory.decayScore) {
      decayed++;
    }

    return {
      ...memory,
      decayScore: newDecayScore,
      updatedAt: nowIso(),
    };
  });

  return {
    updatedMemories,
    result: { decayed, archived },
  };
}

export function reinforceMemory(memory: MemoryRecord, reason: string): MemoryRecord {
  return {
    ...memory,
    lastAccessedAt: nowIso(),
    reinforcementCount: memory.reinforcementCount + 1,
    importance: Math.min(100, memory.importance + 2),
    confidence: Math.min(1, memory.confidence + 0.02),
    decayScore: Math.min(1, memory.decayScore + 0.1),
    updatedAt: nowIso(),
  };
}
