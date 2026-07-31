import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DiscoveryScheduler } from './discoveryScheduler';

const indexSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const visitSource = readFileSync(new URL('./network/visitService.ts', import.meta.url), 'utf8');
const connectionSource = readFileSync(new URL('./networkConnection.ts', import.meta.url), 'utf8');

describe('Visit activity lock', () => {
  it('skips Discovery before refresh while a Companion is reserved', async () => {
    const refresh = vi.fn();
    const scheduler = new DiscoveryScheduler({
      refresh,
      getDiscoveryScore: () => 50,
      countAnnouncedToday: () => 0,
      getOldestQueuedDiscovery: vi.fn(),
      isCompanionReserved: () => true,
      presentationGateway: { isBusy: () => false, hasPending: () => false, requestPresentation: vi.fn() },
    });
    await expect(scheduler.runOnce()).resolves.toEqual({ status: 'skipped', reason: 'visit_reserved' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('locks immediately after invitation creation and retains a legacy fallback', () => {
    expect(connectionSource).toContain('/api/visit-reservation');
    expect(visitSource).toContain('await this.refreshActivityLock()');
    expect(visitSource).toContain("kind: 'outgoing_invitation'");
    expect(visitSource).toContain("kind: 'session_participant'");
    expect(visitSource).toContain('VISIT_COMPANION_RESERVED');
    expect(visitSource).toContain('void this.refreshActivityLock().catch(() => undefined)');
    expect(visitSource).toContain('not necessarily this device\'s Host Companion');
    expect(indexSource).toContain('refreshActivityLock().catch(() => undefined)');
    expect(visitSource).toContain("typeof getReservation === 'function'");
    expect(visitSource).toContain("Array.isArray(results[0])");
  });

  it('keeps the known reservation through temporary transport loss', () => {
    expect(visitSource).toContain("code.includes('ONLINE_MODE_DISABLED')");
    expect(visitSource).toContain("code.includes('NETWORK_')");
    expect(visitSource).toContain('return this.getActivityLock()');
    expect(visitSource).not.toContain("this.activityLock = { locked: false };\n      return this.getActivityLock();");
  });

  it('blocks autonomous execution and proactive Discovery but keeps read/chat paths outside the blocklist', () => {
    expect(indexSource).toContain('VISIT_RESERVED_ACTIVITY_CHANNELS');
    expect(indexSource).toContain("'autonomy:startExploration'");
    expect(indexSource).toContain("'discovery:generateNow'");
    expect(indexSource).toContain('!services.visits.isActivityLocked() && services.canAnnounceDiscovery()');
    expect(indexSource).not.toContain("'companion:turn',");
  });
});
