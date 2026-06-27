import type { AppContext } from './appContext';
import type { EngineSnapshotInput } from '@our-companion/shared';
import { buildEngineSnapshot } from '../engineSnapshot';

export class EngineSnapshotApplicationService {
  constructor(private readonly ctx: AppContext) {}

  getSnapshot = async (input: EngineSnapshotInput = {}) => buildEngineSnapshot(this.ctx.db, input);
}
