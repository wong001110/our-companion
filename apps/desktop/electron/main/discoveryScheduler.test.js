import { describe, expect, it, vi } from 'vitest';
import { DISCOVERY_STARTUP_DELAY_MS } from '@our-companion/character-engine';
import { DiscoveryScheduler } from './discoveryScheduler';
describe('DiscoveryScheduler', () => {
    it('uses startup delay for the first scheduled tick', () => {
        vi.useFakeTimers();
        const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
        const shareOrchestrator = { enqueue: vi.fn() };
        const scheduler = new DiscoveryScheduler({
            refresh,
            listUnannouncedShared: () => [],
            getDiscoveryScore: () => 35,
            countSharedToday: () => 0,
            shareOrchestrator
        });
        scheduler.start();
        expect(refresh).not.toHaveBeenCalled();
        vi.advanceTimersByTime(DISCOVERY_STARTUP_DELAY_MS - 1);
        expect(refresh).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        vi.runOnlyPendingTimers();
        scheduler.stop();
        vi.useRealTimers();
    });
    it('skips refresh when the daily cap is reached', async () => {
        vi.useFakeTimers();
        const refresh = vi.fn(async () => ({ discoveries: [], newlyInserted: [] }));
        const shareOrchestrator = { enqueue: vi.fn() };
        const scheduler = new DiscoveryScheduler({
            refresh,
            listUnannouncedShared: () => [sampleDiscovery('disc_backlog')],
            getDiscoveryScore: () => 35,
            countSharedToday: () => 10,
            shareOrchestrator
        });
        scheduler.start();
        await vi.advanceTimersByTimeAsync(DISCOVERY_STARTUP_DELAY_MS);
        expect(refresh).not.toHaveBeenCalled();
        expect(shareOrchestrator.enqueue).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'disc_backlog' })]));
        scheduler.stop();
        vi.useRealTimers();
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
