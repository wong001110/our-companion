import { describe, expect, it } from 'vitest';
import { VectorMaintenanceCoordinator } from './vectorMaintenanceCoordinator';

describe('VectorMaintenanceCoordinator', () => {
  it('admits an in-flight search, then blocks new searches until maintenance completes', async () => {
    const coordinator = new VectorMaintenanceCoordinator();
    let releaseSearch!: () => void;
    const search = coordinator.tryRunSearch(async () => new Promise<string>((resolve) => { releaseSearch = () => resolve('complete'); }));
    await Promise.resolve();
    let maintained = false;
    const rebuild = coordinator.runExclusive('rebuild', async () => { maintained = true; });
    expect(await coordinator.tryRunSearch(async () => 'late')).toEqual({ available: false, reason: 'maintenance' });
    expect(maintained).toBe(false);
    releaseSearch();
    expect(await search).toEqual({ available: true, result: 'complete' });
    await rebuild;
    expect(maintained).toBe(true);
    expect(await coordinator.tryRunSearch(async () => 'after')).toEqual({ available: true, result: 'after' });
  });
});
