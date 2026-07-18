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

  it('coalesces repeat download requests for one Visit session without blocking another session', async () => {
    let release!: (status: unknown) => void;
    let calls = 0;
    const service = new PublicCompanionService({} as never, { getStatus: () => { calls++; return new Promise(resolve => { release = resolve; }); } } as never, '/cache');
    const first = service.downloadVisitPack({ sessionId: 'session-1', assetPackId: 'pack-1', networkCompanionId: 'companion-1' });
    const repeated = service.downloadVisitPack({ sessionId: 'session-1', assetPackId: 'pack-1', networkCompanionId: 'companion-1' });
    expect(calls).toBe(1);
    release({});
    await expect(first).rejects.toThrow('ONLINE_MODE_DISABLED');
    await expect(repeated).rejects.toThrow('ONLINE_MODE_DISABLED');
  });
});
