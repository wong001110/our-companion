export type VectorMaintenanceOperation = 'schema_migration' | 'rebuild' | 'model_migration';

export interface VectorMaintenanceStatus {
  active: boolean;
  operation?: VectorMaintenanceOperation;
}

/** Serializes destructive vec0 maintenance with the embedding worker. */
export class VectorMaintenanceCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private activeOperation?: VectorMaintenanceOperation;

  async runExclusive<T>(operation: VectorMaintenanceOperation, task: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.tail;
    this.tail = previous.then(() => gate, () => gate);
    await previous;
    this.activeOperation = operation;
    try { return await task(); }
    finally { this.activeOperation = undefined; release(); }
  }

  waitUntilAvailable(): Promise<void> { return this.tail; }
  isSearchAvailable(): boolean { return !this.activeOperation; }
  getStatus(): VectorMaintenanceStatus {
    return { active: Boolean(this.activeOperation), operation: this.activeOperation };
  }
}
