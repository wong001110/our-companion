import { describe, expect, it, vi } from 'vitest';
import { createEvent, InProcessEventBus } from './index';
describe('InProcessEventBus', () => {
    it('emits events to subscribed handlers', () => {
        const bus = new InProcessEventBus();
        const handler = vi.fn();
        const event = createEvent({ type: 'SignalCaptured', source: 'test' });
        bus.subscribe('SignalCaptured', handler);
        bus.emit(event);
        expect(handler).toHaveBeenCalledWith(event);
    });
    it('unsubscribes handlers with the returned cleanup function', () => {
        const bus = new InProcessEventBus();
        const handler = vi.fn();
        const unsubscribe = bus.subscribe('DiscoveryCreated', handler);
        unsubscribe();
        bus.emit(createEvent({ type: 'DiscoveryCreated', source: 'test' }));
        expect(handler).not.toHaveBeenCalled();
    });
    it('isolates handler errors and keeps notifying other listeners', () => {
        const bus = new InProcessEventBus();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const healthy = vi.fn();
        bus.subscribe('ActionRequested', () => {
            throw new Error('listener failed');
        });
        bus.subscribe('ActionRequested', healthy);
        bus.emit(createEvent({ type: 'ActionRequested', source: 'test' }));
        expect(healthy).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
    it('ignores unknown event types', () => {
        const bus = new InProcessEventBus();
        expect(() => bus.emit(createEvent({ type: 'UnknownEvent', source: 'test' }))).not.toThrow();
    });
});
