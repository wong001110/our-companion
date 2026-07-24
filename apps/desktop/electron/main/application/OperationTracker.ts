import { createId } from '@our-companion/shared';

/** The single lifecycle authority for the local Electron runtime. */
export type RuntimePhase = 'starting' | 'running' | 'quiescing' | 'disposing' | 'disposed';
/** @deprecated Use RuntimePhase. Kept as an alias while callers migrate. */
export type ApplicationLifecycleState = RuntimePhase;
export type OperationKind = 'companion_turn' | 'permission_resolution' | 'speech_transcription' | 'research' | 'discovery' | 'tool_execution' | 'network_reconciliation' | 'visit_reconciliation' | 'debug_flush' | 'embedding_job' | 'vector_search' | 'vector_rebuild' | 'vector_initialization' | 'database_maintenance';
export class AppShuttingDownError extends Error {
  readonly code = 'APP_SHUTTING_DOWN' as const;
  readonly retryable = false;
  constructor() { super('APP_SHUTTING_DOWN'); this.name = 'AppShuttingDownError'; }
}

export interface OperationToken {
  id: string;
  kind: OperationKind;
  epoch: number;
  signal: AbortSignal;
  assertActive(): void;
  assertCanCommit(): void;
  /** Compatibility spelling for existing callers. */
  assertWritable(): void;
  isCancelled(): boolean;
  finish(): void;
}

export interface RuntimeLifecycleSnapshot {
  phase: RuntimePhase;
  epoch: number;
  activeOperationCount: number;
  activeOperationsByKind: Partial<Record<OperationKind, number>>;
  quiescingStartedAt?: string;
  drainTimedOut: boolean;
}

export class OperationTracker {
  private readonly active = new Map<string, { kind: OperationKind; epoch: number; controller: AbortController }>();
  private drainWaiters: Array<() => void> = [];
  private _phase: RuntimePhase;
  private _epoch = 1;
  private quiescingStartedAt?: string;
  private drainTimedOut = false;

  constructor(initial: RuntimePhase = 'running') { this._phase = initial; }
  get phase(): RuntimePhase { return this._phase; }
  get state(): RuntimePhase { return this._phase; }
  get epoch(): number { return this._epoch; }
  beginOperation(kind: OperationKind): OperationToken {
    this.assertRunning();
    const id = createId('operation'); const controller = new AbortController();
    const epoch = this._epoch;
    this.active.set(id, { kind, epoch, controller });
    let finished = false;
    const assertCanCommit = () => {
      if (this._phase !== 'running' || this._epoch !== epoch || controller.signal.aborted) throw new AppShuttingDownError();
    };
    return {
      id, kind, epoch, signal: controller.signal,
      assertActive: assertCanCommit, assertCanCommit, assertWritable: assertCanCommit,
      isCancelled: () => controller.signal.aborted || this._phase !== 'running' || this._epoch !== epoch,
      finish: () => { if (!finished) { finished = true; this.active.delete(id); if (this.active.size === 0) this.drainWaiters.splice(0).forEach((resolve) => resolve()); } },
    };
  }
  /** Compatibility spelling for the Phase 0A surface. */
  begin(kind: OperationKind): OperationToken { return this.beginOperation(kind); }
  assertRunning(): void { if (this._phase !== 'running') throw new AppShuttingDownError(); }
  beginQuiescing(): void {
    if (this._phase === 'running' || this._phase === 'starting') {
      this._phase = 'quiescing'; this.quiescingStartedAt = new Date().toISOString(); this._epoch += 1;
    }
  }
  stopAccepting(): void { this.beginQuiescing(); }
  beginDisposing(): void { if (this._phase !== 'disposed') { this._phase = 'disposing'; this._epoch += 1; } }
  beginShutdown(): void { this.beginDisposing(); }
  abortRemaining(reason = 'APP_SHUTTING_DOWN'): void { this.beginQuiescing(); for (const { controller } of this.active.values()) controller.abort(reason); }
  abortAll(reason = 'APP_SHUTTING_DOWN'): void { this.abortRemaining(reason); }
  /** Final mutation/publication barrier. Call it immediately before state changes. */
  async commit<T>(token: OperationToken, mutation: () => T | Promise<T>): Promise<T> {
    token.assertCanCommit();
    const result = await mutation();
    token.assertCanCommit();
    return result;
  }
  async drain(timeoutMs: number): Promise<{ drained: boolean; active: number }> {
    if (this.active.size === 0) return { drained: true, active: 0 };
    const drained = await Promise.race([
      new Promise<boolean>((resolve) => this.drainWaiters.push(() => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), Math.max(0, timeoutMs))),
    ]);
    if (!drained) this.drainTimedOut = true;
    return { drained, active: this.active.size };
  }
  activeCount(): number { return this.active.size; }
  snapshot(): RuntimeLifecycleSnapshot {
    const activeOperationsByKind: Partial<Record<OperationKind, number>> = {};
    for (const { kind } of this.active.values()) activeOperationsByKind[kind] = (activeOperationsByKind[kind] ?? 0) + 1;
    return { phase: this._phase, epoch: this._epoch, activeOperationCount: this.active.size, activeOperationsByKind, quiescingStartedAt: this.quiescingStartedAt, drainTimedOut: this.drainTimedOut };
  }
  markDisposed(): void { this._phase = 'disposed'; this._epoch += 1; }
  dispose(): void { this.markDisposed(); }
}
