import { describe, expect, it, vi } from 'vitest';
import type { CompanionCommand } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { createCommandExecutor, type CommandExecutionHandle } from './commandLifecycle';

function command(overrides: Partial<CompanionCommand> = {}): CompanionCommand {
  return { id: createId('cmd'), companionId: 'ann', issuedAt: nowIso(), decision: { id: createId('decision'), action: 'share_discovery', timing: 'now', priority: 'normal', reason: 'test', createdAt: nowIso() }, ...overrides };
}

function deferredHandle(): CommandExecutionHandle & { start: () => void; complete: () => void } {
  let start!: () => void;
  let complete!: () => void;
  const started = new Promise<void>((resolve) => { start = resolve; });
  const completed = new Promise<void>((resolve) => { complete = resolve; });
  return { started, completed, start, complete, cancel: vi.fn() };
}

function executor(execute: (command: CompanionCommand) => CommandExecutionHandle, statuses: string[], timeoutMs?: number) {
  return createCommandExecutor({ companionId: 'ann', acknowledge: (_command, status) => statuses.push(status), execute, timeoutMs,
    handledCommandIds: new Set(), activeExecution: { current: null } });
}

describe('command lifecycle', () => {
  it('reports received, truthful started, then completed', async () => {
    const statuses: string[] = []; const handle = deferredHandle();
    const run = executor(() => handle, statuses); const pending = run(command());
    expect(statuses).toEqual(['received']);
    handle.start(); await Promise.resolve(); expect(statuses).toEqual(['received', 'started']);
    handle.complete(); await pending; expect(statuses).toEqual(['received', 'started', 'completed']);
  });

  it('uses one idempotent store for duplicate event and recovery deliveries', async () => {
    const statuses: string[] = []; const handle = deferredHandle(); const execute = vi.fn(() => handle);
    const run = executor(execute, statuses); const item = command(); const first = run(item); const second = run(item);
    handle.start(); handle.complete(); await Promise.all([first, second]);
    expect(execute).toHaveBeenCalledTimes(1); expect(statuses).toEqual(['received', 'started', 'completed']);
  });

  it('does not reset idempotency when a new executor uses the same stores', async () => {
    const statuses: string[] = []; const handled = new Set<string>(); const active = { current: null as null };
    const handle = deferredHandle(); const execute = vi.fn(() => handle); const item = command();
    const deps = { companionId: 'ann', acknowledge: (_c: CompanionCommand, status: string) => statuses.push(status), execute, handledCommandIds: handled, activeExecution: active };
    const first = createCommandExecutor(deps)(item); handle.start(); handle.complete(); await first;
    await createCommandExecutor(deps)(item); expect(execute).toHaveBeenCalledTimes(1);
  });

  it('fails a command that never completes and ignores its late completion', async () => {
    vi.useFakeTimers();
    const statuses: string[] = []; const handle = deferredHandle(); const run = executor(() => handle, statuses, 20);
    const pending = run(command()); handle.start(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(20); await pending;
    handle.complete(); await Promise.resolve();
    expect(statuses).toEqual(['received', 'started', 'failed']); expect(handle.cancel).toHaveBeenCalledWith('command_timeout');
    vi.useRealTimers();
  });

  it('rejects a conflicting command without overwriting the active execution', async () => {
    const statuses: string[] = []; const handle = deferredHandle(); const run = executor(() => handle, statuses);
    const first = run(command()); await run(command()); handle.start(); handle.complete(); await first;
    expect(statuses).toEqual(['received', 'received', 'failed', 'started', 'completed']);
  });
});
