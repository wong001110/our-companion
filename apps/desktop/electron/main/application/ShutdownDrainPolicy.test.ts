import { describe, expect, it } from 'vitest';
import { shouldCloseDatabaseAfterDrain } from './ShutdownDrainPolicy';

describe('shouldCloseDatabaseAfterDrain', () => {
  it('closes only when IPC admission allowed closure and internal work drained', () => {
    expect(shouldCloseDatabaseAfterDrain({ allowDatabaseClose: true, operationsDrained: true, activeOperationCount: 0 })).toBe(true);
    expect(shouldCloseDatabaseAfterDrain({ allowDatabaseClose: false, operationsDrained: true, activeOperationCount: 0 })).toBe(false);
    expect(shouldCloseDatabaseAfterDrain({ allowDatabaseClose: true, operationsDrained: false, activeOperationCount: 1 })).toBe(false);
    expect(shouldCloseDatabaseAfterDrain({ allowDatabaseClose: true, operationsDrained: true, activeOperationCount: 1 })).toBe(false);
  });
});
