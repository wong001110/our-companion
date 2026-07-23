export type VectorMaintenanceOperation = 'schema_migration' | 'rebuild' | 'model_migration' | 'derived_state_repair';

export interface VectorMaintenanceStatus {
  active: boolean;
  operation?: VectorMaintenanceOperation;
}

/** Serializes destructive vec0 maintenance with the embedding worker. */
export class VectorMaintenanceCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private activeOperation?: VectorMaintenanceOperation;
  private maintenanceRequests = 0;
  private activeSearches = 0;
  private searchSettled?: () => void;

  async runExclusive<T>(operation: VectorMaintenanceOperation, task: () => Promise<T>): Promise<T> {
    this.maintenanceRequests += 1;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.tail;
    this.tail = previous.then(() => gate, () => gate);
    await previous;
    if (this.activeSearches > 0) await new Promise<void>((resolve) => { this.searchSettled = resolve; });
    this.activeOperation = operation;
    try { return await task(); }
    finally { this.activeOperation = undefined; this.maintenanceRequests -= 1; release(); }
  }

  waitUntilAvailable(): Promise<void> { return this.tail; }
  isSearchAvailable(): boolean { return this.maintenanceRequests === 0; }
  async tryRunSearch<T>(task: () => Promise<T>): Promise<{ available: true; result: T } | { available: false; reason: 'maintenance' }> {
    if (!this.isSearchAvailable()) return { available: false, reason: 'maintenance' };
    this.activeSearches += 1;
    // A maintenance request can arrive on the same event-loop turn; do not
    // start the caller's async work unless admission remains open.
    if (!this.isSearchAvailable()) { this.releaseSearch(); return { available: false, reason: 'maintenance' }; }
    try { return { available: true, result: await task() }; }
    finally { this.releaseSearch(); }
  }
  private releaseSearch(): void {
    this.activeSearches -= 1;
    if (this.activeSearches === 0) { this.searchSettled?.(); this.searchSettled = undefined; }
  }
  getStatus(): VectorMaintenanceStatus {
    return { active: Boolean(this.activeOperation), operation: this.activeOperation };
  }
}
