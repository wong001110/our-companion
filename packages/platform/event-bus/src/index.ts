import type { BaseEvent } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export type EventHandler<TEvent extends BaseEvent = BaseEvent> = (event: TEvent) => void | Promise<void>;

export interface EventBus {
  emit(event: BaseEvent): void;
  subscribe<TEvent extends BaseEvent = BaseEvent>(type: TEvent['type'], handler: EventHandler<TEvent>): () => void;
  unsubscribe<TEvent extends BaseEvent = BaseEvent>(type: TEvent['type'], handler: EventHandler<TEvent>): void;
}

export interface CreateEventInput {
  type: string;
  source: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
  timestamp?: string;
}

export function createEvent(input: CreateEventInput): BaseEvent {
  return {
    id: createId('evt'),
    type: input.type,
    timestamp: input.timestamp ?? nowIso(),
    source: input.source,
    correlationId: input.correlationId,
    causationId: input.causationId,
    payload: input.payload
  };
}

export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  emit(event: BaseEvent): void {
    const handlers = this.handlers.get(event.type);
    if (!handlers) return;

    for (const handler of [...handlers]) {
      try {
        void Promise.resolve(handler(event)).catch((error) => {
          console.warn(`[event-bus] Handler for ${event.type} failed.`, error);
        });
      } catch (error) {
        console.warn(`[event-bus] Handler for ${event.type} failed.`, error);
      }
    }
  }

  subscribe<TEvent extends BaseEvent = BaseEvent>(type: TEvent['type'], handler: EventHandler<TEvent>): () => void {
    const handlers = this.handlers.get(type) ?? new Set<EventHandler>();
    handlers.add(handler as EventHandler);
    this.handlers.set(type, handlers);
    return () => this.unsubscribe(type, handler);
  }

  unsubscribe<TEvent extends BaseEvent = BaseEvent>(type: TEvent['type'], handler: EventHandler<TEvent>): void {
    const handlers = this.handlers.get(type);
    if (!handlers) return;

    handlers.delete(handler as EventHandler);
    if (handlers.size === 0) {
      this.handlers.delete(type);
    }
  }
}

export const globalEventBus = new InProcessEventBus();
