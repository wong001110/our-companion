import { describe, expect, it } from 'vitest';
import type { CompanionCommand } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { createCommandExecutor } from './commandLifecycle';

function command(overrides: Partial<CompanionCommand> = {}): CompanionCommand {
  return { id: createId('cmd'), companionId: 'ann', issuedAt: nowIso(), decision: { id: createId('decision'), action: 'share_discovery', timing: 'now', priority: 'normal', reason: 'test', createdAt: nowIso() }, ...overrides };
}

describe('command lifecycle', () => {
  it('reports received, started, then completed after execution completes', async () => {
    const statuses: string[] = [];
    let resolveExecution!: () => void;
    const execute = createCommandExecutor({ companionId: 'ann', acknowledge: (_command, status) => statuses.push(status), execute: () => new Promise<void>((resolve) => { resolveExecution = resolve; }) });
    const pending = execute(command());
    expect(statuses).toEqual(['received', 'started']);
    resolveExecution();
    await pending;
    expect(statuses).toEqual(['received', 'started', 'completed']);
  });

  it('cancels stale commands and ignores duplicate deliveries', async () => {
    const statuses: string[] = [];
    const execute = createCommandExecutor({ companionId: 'ann', acknowledge: (_command, status) => statuses.push(status), execute: () => undefined });
    const stale = command({ expiresAt: new Date(Date.now() - 1).toISOString() });
    await execute(stale);
    await execute(stale);
    expect(statuses).toEqual(['cancelled']);
  });

  it('reports a failed command when execution fails', async () => {
    const statuses: string[] = [];
    const execute = createCommandExecutor({ companionId: 'ann', acknowledge: (_command, status) => statuses.push(status), execute: () => { throw new Error('missing card'); } });
    await execute(command());
    expect(statuses).toEqual(['received', 'failed']);
  });
});
