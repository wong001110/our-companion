import { createId } from '@our-companion/shared';

export type ApplicationLifecycleState = 'starting' | 'running' | 'quiescing' | 'shutting_down' | 'disposed';
export type OperationKind = 'companion_turn' | 'permission_resolution' | 'speech_transcription' | 'research' | 'discovery' | 'tool_execution' | 'network_reconciliation' | 'visit_reconciliation' | 'debug_flush' | 'embedding_job' | 'vector_search' | 'vector_rebuild' | 'vector_initialization' | 'database_maintenance';
export interface OperationToken { id: string; kind: OperationKind; signal: AbortSignal; assertWritable(): void; isCancelled(): boolean; finish(): void; }

export class OperationTracker {
  private readonly active = new Map<string, { kind: OperationKind; controller: AbortController }>();
  private drainWaiters: Array<() => void> = [];
  state: ApplicationLifecycleState;

  constructor(initial: ApplicationLifecycleState = 'running') { this.state = initial; }
  begin(kind: OperationKind): OperationToken {
    if (this.state !== 'running') throw new Error('APP_QUIESCING');
    const id = createId('operation'); const controller = new AbortController();
    this.active.set(id, { kind, controller });
    let finished = false;
    return {
      id, kind, signal: controller.signal,
      assertWritable: () => { if (this.state !== 'running' || controller.signal.aborted) throw new Error(this.state === 'running' ? 'OPERATION_CANCELLED' : 'APP_QUIESCING'); },
      isCancelled: () => controller.signal.aborted || this.state !== 'running',
      finish: () => { if (!finished) { finished = true; this.active.delete(id); if (this.active.size === 0) this.drainWaiters.splice(0).forEach((resolve) => resolve()); } },
    };
  }
  stopAccepting(): void { if (this.state === 'running' || this.state === 'starting') this.state = 'quiescing'; }
  beginShutdown(): void { if (this.state !== 'disposed') this.state = 'shutting_down'; }
  abortAll(reason = 'APP_QUIESCING'): void { this.stopAccepting(); for (const { controller } of this.active.values()) controller.abort(reason); }
  async drain(timeoutMs: number): Promise<{ drained: boolean; active: number }> {
    if (this.active.size === 0) return { drained: true, active: 0 };
    const drained = await Promise.race([
      new Promise<boolean>((resolve) => this.drainWaiters.push(() => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), Math.max(0, timeoutMs))),
    ]);
    return { drained, active: this.active.size };
  }
  activeCount(): number { return this.active.size; }
  dispose(): void { this.state = 'disposed'; }
}
