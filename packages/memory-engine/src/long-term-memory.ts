import type { MemoryRecord } from '@our-companion/shared';
import { nowIso } from '@our-companion/shared';

export function promoteToLongTerm(item: MemoryRecord): MemoryRecord {
  return {
    ...item,
    tier: 'long_term',
    updatedAt: nowIso(),
  };
}

export function isEligibleForLongTerm(item: MemoryRecord, minImportance = 30): boolean {
  return item.importance >= minImportance;
}
