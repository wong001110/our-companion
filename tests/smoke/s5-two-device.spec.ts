import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SmokeElectronDevice } from './electron-device';
import { ManagedSmokeNetwork } from './network-process';
import { establishFriendship, seedTwoDeviceNetwork } from './network-seed';
import { assertAssetDeniedAfterEnd, assertRendererLifecycle, assertTerminalCleanup, blockFriend, endVisit, removeFriend, startVisit, unpublishOwnerCompanion } from './s5-two-device.fixture';
import { assertIsolatedProfiles, cleanupDirectories, createSmokeRunId, isolatedProfileDirectories, sanitizedReport, waitUntil, writeManualPhysicalChecklist } from './smoke-state';

const clientRoot = path.resolve(import.meta.dirname, '../..');
const networkRoot = path.resolve(clientRoot, '../network');

test('S5 logical two-device smoke', async () => {
  const serverUrl = process.env.OUR_COMPANION_SMOKE_SERVER_URL;
  if (!serverUrl) throw new Error('OUR_COMPANION_SMOKE_SERVER_URL is required; use a dedicated smoke Network Server.');
  const runId = createSmokeRunId(Date.now(), randomUUID().replaceAll('-', '').slice(0, 12)).toLowerCase();
  const artifactRoot = path.join(clientRoot, 'artifacts', 's5-two-device', runId);
  const profiles = isolatedProfileDirectories(artifactRoot, runId);
  const owner = new SmokeElectronDevice({ role: 'visitor_owner', userDataDir: profiles.owner, serverUrl, artifactDir: path.join(artifactRoot, 'owner'), appPath: path.join(clientRoot, 'apps', 'desktop') });
  const host = new SmokeElectronDevice({ role: 'host', userDataDir: profiles.host, serverUrl, artifactDir: path.join(artifactRoot, 'host'), appPath: path.join(clientRoot, 'apps', 'desktop') });
  const network = process.env.OUR_COMPANION_SMOKE_MANAGE_SERVER === '1' ? new ManagedSmokeNetwork({ serverUrl, networkRoot, artifactDir: path.join(artifactRoot, 'network') }) : undefined;
  const checks: Record<string, boolean> = {};
  let ownerAccountId: string | undefined;
  let hostAccountId: string | undefined;
  let ownerPackId: string | undefined;
  let ownerNetworkCompanionId: string | undefined;

  await fs.mkdir(artifactRoot, { recursive: true });
  if (!network) {
    await fs.mkdir(path.join(artifactRoot, 'network'), { recursive: true });
    await fs.writeFile(path.join(artifactRoot, 'network', 'logs.txt'), 'External smoke Network Server; collect its process logs from the configured runner.\n', 'utf8');
  }
  await writeManualPhysicalChecklist(artifactRoot);
  if (process.env.OUR_COMPANION_SMOKE_SKIP_LIVE_R2 === '1') {
    await fs.writeFile(path.join(artifactRoot, 'report.json'), JSON.stringify({ result: 'skipped', runId: 'sanitized', protocol: '0.4', reason: 'OUR_COMPANION_SMOKE_SKIP_LIVE_R2=1', physicalVerificationRequired: true }, null, 2));
    test.skip(true, 'A skipped live-R2 run is not an S5 smoke success.');
    return;
  }

  try {
    if (network) await network.start();
    assertIsolatedProfiles(profiles);
    checks.isolatedProfiles = true;
    await Promise.all([owner.launch(), host.launch()]);
    await Promise.all([owner.bootstrapFixtureCompanion(), host.bootstrapFixtureCompanion()]);
    const seeded = await seedTwoDeviceNetwork(
      owner,
      host,
      runId,
      { email: `owner-s5-${runId}@example.invalid`, username: `own${runId}`.slice(0, 30), password: randomUUID() },
      { email: `host-s5-${runId}@example.invalid`, username: `hst${runId}`.slice(0, 30), password: randomUUID() },
    );
    ownerAccountId = seeded.ownerAccountId; hostAccountId = seeded.hostAccountId; ownerPackId = seeded.ownerPackId; ownerNetworkCompanionId = seeded.ownerNetworkCompanionId;
    const [ownerOnline, hostOnline] = await Promise.all([owner.getSmokeState(), host.getSmokeState()]);
    expect(ownerOnline.instanceRole).toBe('visitor_owner');
    expect(hostOnline.instanceRole).toBe('host');
    expect(ownerOnline.device.deviceIdHash).not.toBe(hostOnline.device.deviceIdHash);
    expect(ownerOnline.network.accountId).not.toBe(hostOnline.network.accountId);
    checks.differentDeviceIds = checks.bothOnline = true;
    await expect((await owner.panelWindow()).getByTestId('social-panel')).toHaveCount(1);

    // Scenario 1: normal Visit, renderer lifecycle, owner end.
    let sessionId = await startVisit(owner, host, seeded.hostAccountId);
    checks.invitationCreated = checks.invitationAccepted = checks.bothPrepared = checks.sessionActive = checks.ownerAway = checks.hostVisitorRendered = true;
    await owner.screenshot('away'); await host.screenshot('visitor-active');
    await assertRendererLifecycle(host, sessionId);
    checks.enterObserved = checks.idleOrWalkObserved = true;
    await endVisit(owner, sessionId);
    await assertTerminalCleanup(owner, host, sessionId);
    await owner.screenshot('returned'); await host.screenshot('visitor-removed');
    checks.sessionEnded = checks.ownerReturned = checks.visitorRemoved = true;

    // Scenario 2: host end is terminal and idempotent at the Client boundary.
    sessionId = await startVisit(owner, host, seeded.hostAccountId);
    await endVisit(host, sessionId);
    await assertTerminalCleanup(owner, host, sessionId);

    // Scenarios 3–6 and 10–11 share one active Session.
    sessionId = await startVisit(owner, host, seeded.hostAccountId);
    await host.restart();
    await host.waitForState((state) => state.network.state === 'online' && state.visit?.sessionId === sessionId && state.visual.visitor?.runtimeId === `visit:${sessionId}`, 60_000);
    await host.screenshot('visitor-recovered'); checks.hostRestartRecovered = true;
    await owner.restart();
    await owner.waitForState((state) => state.network.state === 'online' && state.visit?.sessionId === sessionId && state.visual.ownerPresenceMode === 'away_visiting', 60_000);
    checks.ownerRestartRecovered = true;
    await (await host.mainWindow()).evaluate(async () => window.ourCompanion.smoke?.disconnectSocket());
    await host.waitForState((state) => state.network.state === 'online' && state.visit?.sessionId === sessionId && Boolean(state.visual.visitor), 60_000);
    checks.socketReconnectRecovered = true;
    const hostMain = await host.mainWindow();
    await hostMain.evaluate(async () => window.ourCompanion.smoke?.setVisualWorkArea({ x: 0, y: 0, width: 800, height: 600 }));
    const clamped = await host.waitForState((state) => typeof state.visual.visitor?.x === 'number' && typeof state.visual.visitor?.y === 'number', 15_000);
    expect(clamped.visual.visitor!.x!).toBeGreaterThanOrEqual(0); expect(clamped.visual.visitor!.y!).toBeGreaterThanOrEqual(0);
    expect(clamped.visual.visitor!.x! + 220).toBeLessThanOrEqual(800); expect(clamped.visual.visitor!.y! + 230).toBeLessThanOrEqual(600);
    checks.displayClampPassed = checks.boundedMovement = true;
    await hostMain.evaluate(async () => window.ourCompanion.smoke?.simulateRendererFailure());
    await host.waitForState((state) => state.visual.error === 'VISUAL_VISIT_RENDERER_UNAVAILABLE' && !state.visual.visitor, 15_000);
    await owner.waitForState((state) => state.visit?.state === 'active' && state.visual.ownerPresenceMode === 'away_visiting');
    await hostMain.evaluate(async () => window.ourCompanion.smoke?.reconcileVisits());
    await host.waitForState((state) => state.visual.visitor?.sessionId === sessionId, 60_000);
    const activeAssetStatus = await hostMain.evaluate(async (pack) => (await fetch(`companion-network://${pack}/assets/animations/Idle_Neutral.png`)).status, seeded.ownerPackId);
    expect(activeAssetStatus).toBe(200);
    expect(await hostMain.evaluate(async () => (await fetch('companion-network://other-pack/assets/animations/Idle_Neutral.png')).status)).toBeGreaterThanOrEqual(400);
    expect(await hostMain.evaluate(async (pack) => (await fetch(`companion-network://${pack}/assets/%2e%2e/secret.png`)).status, seeded.ownerPackId)).toBeGreaterThanOrEqual(400);
    await endVisit(owner, sessionId); await assertTerminalCleanup(owner, host, sessionId); await assertAssetDeniedAfterEnd(host, seeded.ownerPackId);

    // Scenarios 7–9: each destructive action is exercised against a fresh real Session.
    sessionId = await startVisit(owner, host, seeded.hostAccountId); await removeFriend(owner); await assertTerminalCleanup(owner, host, sessionId); checks.friendshipRevocation = true;
    await establishFriendship(owner, host);
    sessionId = await startVisit(owner, host, seeded.hostAccountId); await blockFriend(owner); await assertTerminalCleanup(owner, host, sessionId); checks.block = true;
    await (await owner.mainWindow()).evaluate(async () => { const blocked = (await window.ourCompanion.network.blocks.getAll())[0]; if (blocked) await window.ourCompanion.network.blocks.unblock(blocked.userId); });
    await establishFriendship(owner, host);
    sessionId = await startVisit(owner, host, seeded.hostAccountId); await unpublishOwnerCompanion(owner, seeded.ownerNetworkCompanionId); await assertTerminalCleanup(owner, host, sessionId); checks.unpublish = true;

    await fs.writeFile(path.join(artifactRoot, 'report.json'), JSON.stringify(sanitizedReport({ result: 'passed', runId: 'sanitized', clientCommit: process.env.GITHUB_SHA ?? 'local', networkCommit: process.env.OUR_COMPANION_SMOKE_NETWORK_SHA ?? 'local', protocol: '0.4', checks, physicalVerificationRequired: true }), null, 2));
  } catch (error) {
    await Promise.allSettled([owner.screenshot('failure'), host.screenshot('failure')]);
    await fs.writeFile(path.join(artifactRoot, 'failure-context.json'), JSON.stringify(sanitizedReport({ result: 'failed', runId: 'sanitized', checks, error: error instanceof Error ? error.message : 'SMOKE_FAILURE' }), null, 2));
    throw error;
  } finally {
    await Promise.allSettled([(await host.mainWindow().catch(() => undefined))?.evaluate(async () => window.ourCompanion.smoke?.clearVisualWorkArea()), owner.close(), host.close(), network?.stop()]);
    if (ownerAccountId || hostAccountId) await fetch(new URL('/api/smoke/cleanup', serverUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId }) }).catch(() => undefined);
    await cleanupDirectories([profiles.owner, profiles.host]);
  }
});
