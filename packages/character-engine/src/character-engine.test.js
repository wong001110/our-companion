import { describe, expect, it } from 'vitest';
import { animationFor, applyEmotionEvent, createInitialCharacterState, decayEmotion, selectIntent, transitionState } from './index';
describe('character engine', () => {
    it('decays and clamps emotions', () => {
        const decayed = decayEmotion({
            neutral: 70,
            curious: 100,
            happy: 100,
            excited: 100,
            shy: 100,
            confused: 100,
            focused: 100,
            tired: 10,
            proud: 100,
            concerned: 100
        });
        expect(decayed.excited).toBe(90);
        expect(decayed.happy).toBe(95);
        expect(decayed.curious).toBe(97);
    });
    it('prioritizes user commands as helping task intent', () => {
        const state = createInitialCharacterState();
        expect(selectIntent(state, { userCommand: 'open chrome', availableDiscoveries: [{}] })).toBe('helping_task');
    });
    it('moves task loop through executing states', () => {
        expect(transitionState('idle', 'helping_task', 'focused')).toBe('thinking');
        expect(transitionState('thinking', 'helping_task', 'focused')).toBe('executing');
        expect(transitionState('executing', 'helping_task', 'focused')).toBe('returning');
    });
    it('falls back to base animation when emotional variant is missing', () => {
        expect(animationFor('sharing_discovery', 'discovering', 'excited', ['idle', 'discover'])).toBe('discover');
    });
    it('applies discovery acceptance emotion modifiers', () => {
        const next = applyEmotionEvent(createInitialCharacterState().emotion, 'user_accepts_discovery');
        expect(next.happy).toBeGreaterThan(20);
        expect(next.proud).toBeGreaterThan(0);
    });
});
