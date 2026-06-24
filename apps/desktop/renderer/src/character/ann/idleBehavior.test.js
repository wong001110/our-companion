import { describe, expect, it } from 'vitest';
import { getIdleRotationDelay, isIdleState, selectWeightedIdleAnimation } from './idleBehavior';
describe('Ann idle behavior', () => {
    it('selects only configured idle animations by weight', () => {
        expect(selectWeightedIdleAnimation(() => 0)).toBe('idle_laptop');
        expect(selectWeightedIdleAnimation(() => 0.44)).toBe('idle_laptop');
        expect(selectWeightedIdleAnimation(() => 0.45)).toBe('idle_notes');
        expect(selectWeightedIdleAnimation(() => 0.7)).toBe('idle_coffee');
        expect(selectWeightedIdleAnimation(() => 0.9)).toBe('idle_tired');
    });
    it('treats active states as idle-variant blockers', () => {
        expect(isIdleState({ coreState: 'idle', intent: 'waiting' })).toBe(true);
        expect(isIdleState({ coreState: 'walking', intent: 'wandering' })).toBe(false);
        expect(isIdleState({ coreState: 'talking', intent: 'sharing_discovery' })).toBe(false);
        expect(isIdleState({ coreState: 'executing', intent: 'helping_task' })).toBe(false);
    });
    it('keeps idle rotation delays inside the intended window', () => {
        expect(getIdleRotationDelay(() => 0)).toBe(12000);
        expect(getIdleRotationDelay(() => 1)).toBe(25000);
    });
});
