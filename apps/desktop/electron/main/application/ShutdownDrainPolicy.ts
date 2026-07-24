export interface DatabaseCloseDecisionInput {
  allowDatabaseClose: boolean;
  operationsDrained: boolean;
  activeOperationCount: number;
}

/** SQLite may close only after both external IPC work and internal operations
 * have lost every path to a late commit. Process exit is the safe fallback for
 * an uncancellable operation that outlives the bounded shutdown window. */
export function shouldCloseDatabaseAfterDrain(input: DatabaseCloseDecisionInput): boolean {
  return input.allowDatabaseClose && input.operationsDrained && input.activeOperationCount === 0;
}
