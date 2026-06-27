import { createId, nowIso } from '@our-companion/shared';

export interface ReasoningEvent {
  id: string;
  timestamp: string;
  stage: string;
  description: string;
  data?: Record<string, unknown>;
}

export class ReasoningTimeline {
  private events: ReasoningEvent[] = [];
  private maxEvents = 200;

  record(stage: string, description: string, data?: Record<string, unknown>): ReasoningEvent {
    const event: ReasoningEvent = {
      id: createId('reason'),
      timestamp: nowIso(),
      stage,
      description,
      data,
    };
    this.events.unshift(event);
    if (this.events.length > this.maxEvents) {
      this.events.length = this.maxEvents;
    }
    return event;
  }

  getEvents(): ReasoningEvent[] {
    return [...this.events];
  }

  getRecent(count = 20): ReasoningEvent[] {
    return this.events.slice(0, count);
  }

  getByStage(stage: string): ReasoningEvent[] {
    return this.events.filter((e) => e.stage === stage);
  }

  getTimeline(since?: string): ReasoningEvent[] {
    if (!since) return this.getEvents();
    return this.events.filter((e) => e.timestamp >= since);
  }

  clear(): void {
    this.events = [];
  }
}
