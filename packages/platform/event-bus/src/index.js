import { createId, nowIso } from '@our-companion/shared';
export function createEvent(input) {
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
export class InProcessEventBus {
    handlers = new Map();
    emit(event) {
        const handlers = this.handlers.get(event.type);
        if (!handlers)
            return;
        for (const handler of [...handlers]) {
            try {
                void Promise.resolve(handler(event)).catch((error) => {
                    console.warn(`[event-bus] Handler for ${event.type} failed.`, error);
                });
            }
            catch (error) {
                console.warn(`[event-bus] Handler for ${event.type} failed.`, error);
            }
        }
    }
    subscribe(type, handler) {
        const handlers = this.handlers.get(type) ?? new Set();
        handlers.add(handler);
        this.handlers.set(type, handlers);
        return () => this.unsubscribe(type, handler);
    }
    unsubscribe(type, handler) {
        const handlers = this.handlers.get(type);
        if (!handlers)
            return;
        handlers.delete(handler);
        if (handlers.size === 0) {
            this.handlers.delete(type);
        }
    }
}
export const globalEventBus = new InProcessEventBus();
