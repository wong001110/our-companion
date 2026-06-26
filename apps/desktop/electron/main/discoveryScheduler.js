import { DISCOVERY_STARTUP_DELAY_MS, getDiscoveryFetchDelay } from '@our-companion/character-engine';
const DAILY_SHARE_CAP = 10;
export class DiscoveryScheduler {
    deps;
    timer;
    firstRun = true;
    stopped = false;
    constructor(deps) {
        this.deps = deps;
    }
    start() {
        this.stopped = false;
        this.scheduleNext(this.firstRun ? DISCOVERY_STARTUP_DELAY_MS : this.nextDelay());
    }
    stop() {
        this.stopped = true;
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }
    nextDelay() {
        return getDiscoveryFetchDelay(this.deps.getDiscoveryScore());
    }
    scheduleNext(delayMs) {
        if (this.stopped)
            return;
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.tick();
        }, delayMs);
    }
    async tick() {
        if (this.stopped)
            return;
        try {
            if (this.deps.countSharedToday() < DAILY_SHARE_CAP) {
                if (this.deps.runAutonomousCycle &&
                    (this.deps.countAutonomousCyclesToday?.() ?? 1) < 1 &&
                    (this.deps.canRunAutonomousCycle?.() ?? true)) {
                    await this.deps.runAutonomousCycle();
                }
                const result = await this.deps.refresh();
                const toAnnounce = result.newlyInserted.filter((discovery) => discovery.status === 'shared');
                if (toAnnounce.length > 0) {
                    this.deps.shareOrchestrator.enqueue(toAnnounce);
                }
            }
            const backlog = this.deps.listUnannouncedShared(10);
            if (backlog.length > 0) {
                this.deps.shareOrchestrator.enqueue(backlog);
            }
        }
        catch (error) {
            console.warn('[our-companion] Discovery scheduler tick failed.', error);
        }
        finally {
            this.firstRun = false;
            this.scheduleNext(this.nextDelay());
        }
    }
}
