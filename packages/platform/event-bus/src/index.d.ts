import type { BaseEvent } from '@our-companion/shared';
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
export declare function createEvent(input: CreateEventInput): BaseEvent;
export declare class InProcessEventBus implements EventBus {
    private readonly handlers;
    emit(event: BaseEvent): void;
    subscribe<TEvent extends BaseEvent = BaseEvent>(type: TEvent['type'], handler: EventHandler<TEvent>): () => void;
    unsubscribe<TEvent extends BaseEvent = BaseEvent>(type: TEvent['type'], handler: EventHandler<TEvent>): void;
}
export declare const globalEventBus: InProcessEventBus;
