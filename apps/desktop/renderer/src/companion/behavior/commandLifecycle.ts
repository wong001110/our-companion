import type { CommandAckStatus, CompanionCommand } from '@our-companion/shared';

export interface CommandExecutionDependencies {
  companionId: string;
  acknowledge: (command: CompanionCommand, status: CommandAckStatus, reason?: string, failedStep?: string) => void;
  execute: (command: CompanionCommand) => void | Promise<void>;
}

/** Maintains idempotent, truthful command lifecycle reporting for one renderer. */
export function createCommandExecutor({ companionId, acknowledge, execute }: CommandExecutionDependencies) {
  const handledCommandIds = new Set<string>();

  return async (command: CompanionCommand): Promise<void> => {
    if (handledCommandIds.has(command.id)) return;
    handledCommandIds.add(command.id);

    if (command.companionId !== companionId || (command.expiresAt && Date.parse(command.expiresAt) <= Date.now())) {
      acknowledge(command, 'cancelled', 'stale_or_wrong_companion');
      return;
    }

    acknowledge(command, 'received');
    try {
      const completion = execute(command);
      acknowledge(command, 'started');
      await completion;
      acknowledge(command, 'completed');
    } catch (error) {
      acknowledge(command, 'failed', error instanceof Error ? error.message : String(error), 'command_execution');
    }
  };
}
