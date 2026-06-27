import type { AddMemoryInput, MemoryRecord, MemoryNodeType } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { STM_MAX_SIZE } from './types';

export function createShortTermMemory(input: AddMemoryInput): MemoryRecord {
  const timestamp = nowIso();
  return {
    id: createId('mem'),
    tier: input.tier,
    type: input.type,
    content: input.content,
    summary: input.summary,
    source: input.source,
    tags: input.tags ?? [],
    entities: input.entities ?? [],
    importance: input.importance ?? classifyImportance(input.content, input.type),
    confidence: input.confidence ?? 0.7,
    reinforcementCount: 0,
    lastAccessedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    decayScore: 1.0,
  };
}

export function addToBuffer(buffer: MemoryRecord[], item: MemoryRecord): MemoryRecord[] {
  const newBuffer = [item, ...buffer];
  if (newBuffer.length > STM_MAX_SIZE) {
    return newBuffer.slice(0, STM_MAX_SIZE);
  }
  return newBuffer;
}

export function getRecentContext(buffer: MemoryRecord[], limit = 10): MemoryRecord[] {
  return buffer
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function isBufferFull(buffer: MemoryRecord[]): boolean {
  return buffer.length >= STM_MAX_SIZE;
}

export function classifyImportance(content: string, type: MemoryNodeType): number {
  let score = 50;

  if (type === 'decision' || type === 'outcome') score += 25;
  if (type === 'discovery') score += 10;
  if (type === 'resource') score += 5;

  if (content.length > 200) score += 10;
  if (content.length > 500) score += 10;

  return Math.min(100, score);
}
