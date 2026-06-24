import { describe, expect, it } from 'vitest';
import { getDiscoveryFetchDelay, getDiscoveryFetchDelayRange } from './discoveryTiming';
describe('discovery timing', () => {
    it('maps low discovery score to longer fetch intervals than high score', () => {
        const calm = getDiscoveryFetchDelayRange(35);
        const eager = getDiscoveryFetchDelayRange(90);
        expect(calm.minMs).toBeGreaterThan(eager.minMs);
        expect(calm.maxMs).toBeGreaterThan(eager.maxMs);
    });
    it('supports deterministic fetch delays', () => {
        const range = getDiscoveryFetchDelayRange(100);
        expect(getDiscoveryFetchDelay(100, () => 0)).toBe(range.minMs);
        expect(getDiscoveryFetchDelay(100, () => 1)).toBe(range.maxMs);
    });
});
