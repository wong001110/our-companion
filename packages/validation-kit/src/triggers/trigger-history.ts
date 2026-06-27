import type { TriggerHistoryEntry, TriggerConfig, TriggerResult } from './types';

export class TriggerHistoryManager {
  private entries: TriggerHistoryEntry[] = [];
  private maxEntries = 200;

  add(config: TriggerConfig, result: TriggerResult): void {
    this.entries.unshift({
      id: result.id,
      config,
      result,
      timestamp: result.executedAt,
    });
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }
  }

  getAll(): TriggerHistoryEntry[] {
    return [...this.entries];
  }

  getByCategory(category: string): TriggerHistoryEntry[] {
    return this.entries.filter((e) => e.config.category === category);
  }

  getSuccessful(): TriggerHistoryEntry[] {
    return this.entries.filter((e) => e.result.success);
  }

  getFailed(): TriggerHistoryEntry[] {
    return this.entries.filter((e) => !e.result.success);
  }

  getRecent(count = 10): TriggerHistoryEntry[] {
    return this.entries.slice(0, count);
  }

  replay(entryId: string): TriggerConfig | undefined {
    const entry = this.entries.find((e) => e.id === entryId);
    return entry?.config;
  }

  clear(): void {
    this.entries = [];
  }
}
