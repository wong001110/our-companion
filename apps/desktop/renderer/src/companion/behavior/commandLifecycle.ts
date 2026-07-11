import type { CommandAckStatus, CompanionCommand } from '@our-companion/shared';

export const DEFAULT_COMMAND_TIMEOUT_MS = 45_000;

export interface CommandExecutionHandle {
  /** Resolves only after the first required visible action has begun. */
  started: Promise<void>;
  /** Resolves when the command's documented presentation work has finished. */
  completed: Promise<void>;
  cancel: (reason: string) => void;
}

export interface ActiveCommandExecution {
  commandId: string;
  companionId: string;
  startedAt: string;
  cancel: (reason: string) => void;
}

export interface CommandExecutionDependencies {
  companionId: string;
  acknowledge: (command: CompanionCommand, status: CommandAckStatus, reason?: string, failedStep?: string) => void;
  execute: (command: CompanionCommand) => CommandExecutionHandle;
  handledCommandIds: Set<string>;
  activeExecution: { current: ActiveCommandExecution | null };
  timeoutMs?: number;
}

/**
 * Runs commands from both IPC delivery and recovery through one idempotent store.
 * `show_soft_hint` completes after its render frame; `present_discovery` completes
 * after its typewriter callback. Unsupported commands must reject their handle.
 */
export function createCommandExecutor({
  companionId, acknowledge, execute, handledCommandIds, activeExecution, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
}: CommandExecutionDependencies) {
  return async (command: CompanionCommand): Promise<void> => {
    if (handledCommandIds.has(command.id)) return;
    handledCommandIds.add(command.id);

    if (command.companionId !== companionId) {
      acknowledge(command, 'cancelled', 'companion_switched');
      return;
    }
    if (command.expiresAt && Date.parse(command.expiresAt) <= Date.now()) {
      acknowledge(command, 'cancelled', 'command_expired');
      return;
    }

    acknowledge(command, 'received');
    if (activeExecution.current) {
      acknowledge(command, 'failed', 'renderer_busy', 'presentation');
      return;
    }

    let terminal = false;
    let started = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let handle: CommandExecutionHandle | undefined;
    let rejectCancellation!: (reason: Error) => void;
    const cancellationPromise = new Promise<never>((_, reject) => { rejectCancellation = reject; });
    const finish = (status: Extract<CommandAckStatus, 'completed' | 'cancelled' | 'failed'>, reason?: string, failedStep?: string) => {
      if (terminal) return;
      terminal = true;
      if (timeout) clearTimeout(timeout);
      if (activeExecution.current?.commandId === command.id) activeExecution.current = null;
      acknowledge(command, status, reason, failedStep);
    };

    const cancel = (reason: string) => {
      if (terminal) return;
      handle?.cancel(reason);
      finish('cancelled', reason);
      rejectCancellation(new Error(reason));
    };
    activeExecution.current = { commandId: command.id, companionId: command.companionId, startedAt: new Date().toISOString(), cancel };

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('command_timeout')), timeoutMs);
      });
      const runCommandLifecycle = async () => {
        handle = execute(command);
        await handle.started;
        started = true;
        if (terminal) return;
        acknowledge(command, 'started');
        await handle.completed;
      };
      await Promise.race([runCommandLifecycle(), timeoutPromise, cancellationPromise]);
      finish('completed');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason === 'command_timeout') {
        handle?.cancel(reason);
        finish('failed', reason, started ? 'presentation' : 'command_start');
      } else {
        finish('failed', reason, started ? 'presentation' : 'command_start');
      }
    }
  };
}
