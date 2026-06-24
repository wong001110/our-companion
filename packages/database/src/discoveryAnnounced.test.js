import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
describe('discovery announced tracking', () => {
    it('tracks announced shared discoveries', () => {
        const db = new DatabaseService({ path: ':memory:' });
        const discovery = sampleDiscovery('disc_announced');
        db.insertDiscovery(discovery);
        expect(db.listUnannouncedShared()).toHaveLength(1);
        db.markDiscoveryAnnounced(discovery.id);
        expect(db.isDiscoveryAnnounced(discovery.id)).toBe(true);
        expect(db.listUnannouncedShared()).toHaveLength(0);
        db.close();
    });
});
function sampleDiscovery(id) {
    return {
        id,
        source: 'github',
        title: `Discovery ${id}`,
        tags: ['frontend'],
        raw: {},
        userInterestScore: 80,
        userHistoryScore: 70,
        characterExpertiseScore: 75,
        noveltyScore: 70,
        usefulnessScore: 65,
        finalScore: 75,
        status: 'shared',
        createdAt: new Date().toISOString(),
        sharedAt: new Date().toISOString()
    };
}
