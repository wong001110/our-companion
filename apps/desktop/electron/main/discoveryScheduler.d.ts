import type { Discovery } from '@our-companion/shared';
export interface DiscoveryRefreshResult {
    discoveries: Discovery[];
    newlyInserted: Discovery[];
}
export interface DiscoveryShareQueue {
    enqueue(discoveries: Discovery[]): void;
}
export interface DiscoverySchedulerDeps {
    refresh: () => Promise<DiscoveryRefreshResult>;
    listUnannouncedShared: (limit?: number) => Discovery[];
    getDiscoveryScore: () => number;
    countSharedToday: () => number;
    shareOrchestrator: DiscoveryShareQueue;
}
export declare class DiscoveryScheduler {
    private readonly deps;
    private timer;
    private firstRun;
    private stopped;
    constructor(deps: DiscoverySchedulerDeps);
    start(): void;
    stop(): void;
    private nextDelay;
    private scheduleNext;
    private tick;
}
