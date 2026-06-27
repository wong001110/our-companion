import { createId, nowIso } from '@our-companion/shared';
import type { TriggerConfig, TriggerResult, TriggerHistoryEntry } from './types';

export interface EventTriggerDeps {
  emitEvent(type: string, payload?: Record<string, unknown>): void;
}

export class EventTrigger {
  private readonly deps: EventTriggerDeps;
  private history: TriggerHistoryEntry[] = [];

  constructor(deps: EventTriggerDeps) {
    this.deps = deps;
  }

  getHistory(): TriggerHistoryEntry[] {
    return [...this.history];
  }

  fire(config: TriggerConfig): TriggerResult {
    const id = createId('trigger');
    const executedAt = nowIso();

    try {
      if (config.delayMs && config.delayMs > 0) {
        setTimeout(() => {
          this.deps.emitEvent(config.eventType, config.params);
        }, config.delayMs);
      } else {
        this.deps.emitEvent(config.eventType, config.params);
      }

      const result: TriggerResult = {
        id,
        category: config.category,
        eventType: config.eventType,
        success: true,
        executedAt,
        params: config.params,
      };

      this.history.push({ id, config, result, timestamp: executedAt });
      return result;
    } catch (error) {
      const result: TriggerResult = {
        id,
        category: config.category,
        eventType: config.eventType,
        success: false,
        executedAt,
        params: config.params,
        error: error instanceof Error ? error.message : String(error),
      };
      this.history.push({ id, config, result, timestamp: executedAt });
      return result;
    }
  }

  fireChain(configs: TriggerConfig[]): TriggerResult[] {
    return configs.map((config) => this.fire(config));
  }

  clearHistory(): void {
    this.history = [];
  }
}
