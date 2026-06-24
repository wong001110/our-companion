import { describe, expect, it } from 'vitest';
import { applyDailyCap, deduplicateDiscoveries, scoreDiscovery } from './index';
describe('discovery engine', () => {
    it('scores with user interest, history, character expertise, novelty, and usefulness', () => {
        const score = scoreDiscovery({
            source: 'github',
            title: 'PixiJS desktop companion',
            tags: ['pixijs', 'frontend', 'ux'],
            summary: 'Animation notes',
            url: 'https://example.com',
            raw: {}
        }, {
            userInterests: ['frontend'],
            recentMemoryTags: ['pixijs'],
            activeCharacter: { expertise: ['ux'] },
            seenUrls: new Set()
        });
        expect(score.finalScore).toBeGreaterThan(50);
    });
    it('deduplicates by URL', () => {
        const items = deduplicateDiscoveries([
            { source: 'github', title: 'A', url: 'https://same.test', tags: [], raw: {} },
            { source: 'reddit', title: 'B', url: 'https://same.test', tags: [], raw: {} }
        ]);
        expect(items).toHaveLength(1);
    });
    it('applies the global daily cap', () => {
        const capped = applyDailyCap(Array.from({ length: 12 }, (_, index) => ({
            id: `d${index}`,
            source: 'github',
            title: `Discovery ${index}`,
            tags: [],
            raw: {},
            userInterestScore: 0,
            userHistoryScore: 0,
            characterExpertiseScore: 0,
            noveltyScore: 0,
            usefulnessScore: 0,
            finalScore: index,
            status: 'candidate',
            createdAt: 'now'
        })), 2);
        expect(capped).toHaveLength(8);
        expect(capped.every((item) => item.status === 'shared')).toBe(true);
    });
});
