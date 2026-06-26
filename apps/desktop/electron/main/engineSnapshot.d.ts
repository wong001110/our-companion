import type { DatabaseService } from '@our-companion/database';
import type { EngineSnapshot, EngineSnapshotInput } from '@our-companion/shared';
export declare function buildEngineSnapshot(db: DatabaseService, input?: EngineSnapshotInput, characterId?: string): EngineSnapshot;
