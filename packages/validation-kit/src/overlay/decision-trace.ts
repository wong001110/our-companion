import { createId, nowIso } from '@our-companion/shared';
import type { DecisionTraceEntry } from './types';

export class DecisionTrace {
  private entries: DecisionTraceEntry[] = [];
  private maxEntries = 100;

  record(
    inputs: Record<string, unknown>,
    candidates: string[],
    selected: string,
    rejected: string[],
    reason: string
  ): DecisionTraceEntry {
    const entry: DecisionTraceEntry = {
      id: createId('trace'),
      timestamp: nowIso(),
      inputs,
      candidates,
      selected,
      rejected,
      reason,
    };
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }
    return entry;
  }

  getEntries(): DecisionTraceEntry[] {
    return [...this.entries];
  }

  getRecent(count = 10): DecisionTraceEntry[] {
    return this.entries.slice(0, count);
  }

  getByType(type: string): DecisionTraceEntry[] {
    return this.entries.filter((e) => e.inputs.type === type);
  }

  clear(): void {
    this.entries = [];
  }
}
