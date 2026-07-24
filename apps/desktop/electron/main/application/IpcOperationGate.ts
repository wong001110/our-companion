import { AppShuttingDownError } from './OperationTracker';

export interface IpcOperationDrainResult {
  drained: boolean;
  active: number;
}

/**
 * Main-process admission and drain gate for every renderer IPC route.
 * It closes the gap between route-level service methods and the internal
 * OperationTracker without forcing every short synchronous mutation to own a
 * second token.
 */
export class IpcOperationGate {
  private accepting = true;
  private readonly active = new Set<Promise<unknown>>();
  private drainWaiters: Array<() => void> = [];

  isAccepting(): boolean { return this.accepting; }
  activeCount(): number { return this.active.size; }
  stopAccepting(): void { this.accepting = false; }

  run<T>(operation: () => T | Promise<T>): Promise<T> {
    if (!this.accepting) return Promise.reject(new AppShuttingDownError());
    let tracked!: Promise<T>;
    tracked = Promise.resolve().then(operation).finally(() => {
      this.active.delete(tracked);
      if (this.active.size === 0) this.drainWaiters.splice(0).forEach((resolve) => resolve());
    });
    this.active.add(tracked);
    return tracked;
  }

  async drain(timeoutMs: number): Promise<IpcOperationDrainResult> {
    if (this.active.size === 0) return { drained: true, active: 0 };
    const drained = await Promise.race([
      new Promise<boolean>((resolve) => this.drainWaiters.push(() => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), Math.max(0, timeoutMs))),
    ]);
    return { drained, active: this.active.size };
  }
}
