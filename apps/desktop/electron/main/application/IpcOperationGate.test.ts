import { describe, expect, it } from 'vitest';
import { AppShuttingDownError } from './OperationTracker';
import { IpcOperationGate } from './IpcOperationGate';

describe('IpcOperationGate', () => {
  it('rejects new renderer work after admission closes', async () => {
    const gate = new IpcOperationGate();
    gate.stopAccepting();
    await expect(gate.run(() => 'late')).rejects.toBeInstanceOf(AppShuttingDownError);
  });

  it('drains work that began before shutdown', async () => {
    const gate = new IpcOperationGate();
    let release!: () => void;
    const work = gate.run(() => new Promise<void>((resolve) => { release = resolve; }));
    await Promise.resolve();
    gate.stopAccepting();
    const draining = gate.drain(100);
    release();
    await work;
    await expect(draining).resolves.toEqual({ drained: true, active: 0 });
  });

  it('reports a bounded timeout without losing the active count', async () => {
    const gate = new IpcOperationGate();
    let release!: () => void;
    const work = gate.run(() => new Promise<void>((resolve) => { release = resolve; }));
    await Promise.resolve();
    gate.stopAccepting();
    await expect(gate.drain(1)).resolves.toEqual({ drained: false, active: 1 });
    release();
    await work;
  });
});
