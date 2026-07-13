import { describe, expect, it } from 'vitest';
import { PublicCompanionService } from './publicCompanionService';

describe('PublicCompanionService transfer ownership', () => {
  it('rejects a second download while the first controller is active', async () => {
    const service = new PublicCompanionService({} as never, {} as never, '/cache');
    (service as any).downloadAbort = new AbortController();
    await expect(service.downloadPack({ assetPackId: 'pack-1', networkCompanionId: 'companion-1' })).rejects.toThrow('ASSET_DOWNLOAD_IN_PROGRESS');
  });

  it('claims download ownership before awaiting network state', async () => {
    let release!: (status: unknown) => void;
    const service = new PublicCompanionService({} as never, { getStatus: () => new Promise(resolve => { release = resolve; }) } as never, '/cache');
    const first = service.downloadPack({ assetPackId: 'pack-1', networkCompanionId: 'companion-1' });
    await expect(service.downloadPack({ assetPackId: 'pack-2', networkCompanionId: 'companion-2' })).rejects.toThrow('ASSET_DOWNLOAD_IN_PROGRESS');
    release({});
    await expect(first).rejects.toThrow('ONLINE_MODE_DISABLED');
  });
});
