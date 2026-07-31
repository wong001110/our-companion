import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { SmokeElectronDevice } from './electron-device';
import { loadNetworkEnvironment, ManagedSmokeNetwork, preflightSmokeServer, resolveSmokeNetworkRoot } from './network-process';
import { establishFriendship, seedTwoDeviceNetwork } from './network-seed';
import { assertAssetDeniedAfterEnd, assertRendererLifecycle, assertTerminalCleanup, blockFriend, endVisit, removeFriend, startVisit, unpublishOwnerCompanion } from './s5-two-device.fixture';
import { assertIsolatedProfiles, cleanupDirectories, createSmokeRunId, isolatedProfileDirectories, redactSmokeText, sanitizedReport, waitUntil, writeManualPhysicalChecklist } from './smoke-state';

const clientRoot = path.resolve(import.meta.dirname, '../..');
const visitorSize = { width: 220, height: 230 };
const execFileAsync = promisify(execFile);

async function readCommit(root: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
    const commit = stdout.trim();
    return /^[a-f0-9]{40}$/i.test(commit) ? commit : 'unknown';
  } catch {
    return 'unknown';
  }
}

function assertVisitorWithinWorkArea(visitor: { x?: number; y?: number }, area: { x: number; y: number; width: number; height: number }): void {
  expect(visitor.x).toBeGreaterThanOrEqual(area.x);
  expect(visitor.y).toBeGreaterThanOrEqual(area.y);
  expect(visitor.x! + visitorSize.width).toBeLessThanOrEqual(area.x + area.width);
  expect(visitor.y! + visitorSize.height).toBeLessThanOrEqual(area.y + area.height);
}

test('S5 logical two-device smoke', async () => {
  const managedServer = process.env.OUR_COMPANION_SMOKE_MANAGE_SERVER === '1';
  const serverUrl = process.env.OUR_COMPANION_SMOKE_SERVER_URL ?? (managedServer ? 'http://127.0.0.1:3001' : undefined);
  if (!serverUrl) throw new Error('OUR_COMPANION_SMOKE_SERVER_URL is required; use a dedicated smoke Network Server.');
  const runId = createSmokeRunId(Date.now(), randomUUID().replaceAll('-', '').slice(0, 12)).toLowerCase();
  const artifactRoot = path.join(clientRoot, 'artifacts', 's5-two-device', runId);
  const profiles = isolatedProfileDirectories(artifactRoot, runId);
  const networkRoot = resolveSmokeNetworkRoot(clientRoot);
  const [clientCommit, networkCommit] = await Promise.all([readCommit(clientRoot), readCommit(networkRoot)]);
  const networkEnvironment = managedServer ? { ...(await loadNetworkEnvironment(networkRoot)), ...process.env } : undefined;
  const network = managedServer ? new ManagedSmokeNetwork({ serverUrl, networkRoot, artifactDir: path.join(artifactRoot, 'network'), env: networkEnvironment }) : undefined;
  const cleanupToken = network?.cleanupToken ?? process.env.SMOKE_TEST_CLEANUP_TOKEN;
  if (!cleanupToken) throw new Error('SMOKE_CLEANUP_TOKEN_REQUIRED');
  const owner = new SmokeElectronDevice({ role: 'visitor_owner', userDataDir: profiles.owner, serverUrl, artifactDir: path.join(artifactRoot, 'owner'), appPath: path.join(clientRoot, 'apps', 'desktop') });
  const host = new SmokeElectronDevice({ role: 'host', userDataDir: profiles.host, serverUrl, artifactDir: path.join(artifactRoot, 'host'), appPath: path.join(clientRoot, 'apps', 'desktop') });
  const checks = {
    preflight: false, isolatedProfiles: false, differentDeviceIds: false, bothOnline: false, invitationCreated: false, invitationAccepted: false, bothPrepared: false,
    sessionActive: false, ownerAway: false, hostVisitorRendered: false, enterObserved: false, idleOrWalkObserved: false, boundedMovement: false,
    hostRestartRecovered: false, ownerRestartRecovered: false, socketReconnectRecovered: false, displayClampPassed: false, rendererFailureRecovered: false,
    activeAssetAuthorized: false, terminalAssetDenied: false, friendshipRevocation: false, block: false, unpublish: false, sessionEnded: false,
    ownerReturned: false, visitorRemoved: false, cleanupSucceeded: false,
  };
  let functionalSmokePassed = false;
  let preflightReached = false;
  let cleanupError: string | undefined;
  let scenarioError: unknown;

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
    if (network) { await network.prepareAndStart(); await network.preflight(); }
    else await preflightSmokeServer(serverUrl);
    preflightReached = true;
    checks.preflight = true;
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
    const [ownerOnline, hostOnline] = await Promise.all([owner.getSmokeState(), host.getSmokeState()]);
    expect(ownerOnline.instanceRole).toBe('visitor_owner');
    expect(hostOnline.instanceRole).toBe('host');
    expect(ownerOnline.device.deviceIdHash).not.toBe(hostOnline.device.deviceIdHash);
    expect(ownerOnline.network.accountId).not.toBe(hostOnline.network.accountId);
    checks.differentDeviceIds = checks.bothOnline = true;

    // Scenario 1: normal Visit, renderer lifecycle, owner end.
    let sessionId = await startVisit(owner, host, seeded.hostAccountId);
    checks.invitationCreated = checks.invitationAccepted = checks.bothPrepared = checks.sessionActive = checks.ownerAway = checks.hostVisitorRendered = true;
    await owner.screenshot('away'); await host.screenshot('visitor-active');
    const hostPanel = await host.panelWindow();
    await hostPanel.getByRole('button', { name: 'Social' }).click();
    await expect(hostPanel.getByTestId('social-panel')).toBeVisible();
    await expect(hostPanel.getByTestId('visit-session-state')).toHaveAttribute('data-state', 'active', { timeout: 30_000 });
    await host.screenshotPanel('social-active-visit');
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
    await host.waitForState((state) => state.network.state === 'online' && state.visit?.sessionId === sessionId && state.visual.visitors.some((visitor) => visitor.sessionId === sessionId && visitor.runtimeId.startsWith(`visit:${sessionId}:`)), 60_000);
    await host.screenshot('visitor-recovered'); checks.hostRestartRecovered = true;
    await owner.restart();
    await owner.waitForState((state) => state.network.state === 'online' && state.visit?.sessionId === sessionId && state.visual.ownerPresenceMode === 'away_visiting', 60_000);
    checks.ownerRestartRecovered = true;
    const hostMain = await host.mainWindow();
    await hostMain.evaluate(async () => window.ourCompanion.smoke?.disconnectSocket());
    await host.waitForState((state) => state.network.state === 'online' && state.visit?.sessionId === sessionId && Boolean(state.visual.visitors.find((visitor) => visitor.sessionId === sessionId)), 60_000);
    checks.socketReconnectRecovered = true;

    const firstWorkArea = { x: 0, y: 0, width: 800, height: 600 };
    await hostMain.evaluate(async (area) => window.ourCompanion.smoke?.setVisualWorkArea(area), firstWorkArea);
    const firstClamped = await host.waitForState((state) => {
      const visitor = state.visual.visitors.find((candidate) => candidate.sessionId === sessionId);
      return typeof visitor?.x === 'number' && typeof visitor?.y === 'number';
    }, 15_000);
    assertVisitorWithinWorkArea(firstClamped.visual.visitors.find((visitor) => visitor.sessionId === sessionId)!, firstWorkArea);
    const constrainedWorkArea = { x: 50, y: 40, width: 480, height: 360 };
    await hostMain.evaluate(async (area) => window.ourCompanion.smoke?.setVisualWorkArea(area), constrainedWorkArea);
    const observedPositions = new Set<string>();
    const constrained = await waitUntil(async () => {
      const state = await host.getSmokeState();
      const visitor = state.visual.visitors.find((candidate) => candidate.sessionId === sessionId);
      if (visitor && typeof visitor.x === 'number' && typeof visitor.y === 'number') observedPositions.add(`${visitor.x}:${visitor.y}`);
      return state;
    }, (state) => Boolean(state.visual.visitors.find((visitor) => visitor.sessionId === sessionId)) && observedPositions.size >= 2, { timeoutMs: 20_000, label: 'bounded-visitor-movement' });
    assertVisitorWithinWorkArea(constrained.visual.visitors.find((visitor) => visitor.sessionId === sessionId)!, constrainedWorkArea);
    checks.displayClampPassed = checks.boundedMovement = true;

    await hostMain.evaluate(async () => window.ourCompanion.smoke?.simulateRendererFailure());
    await host.waitForState((state) => state.visual.errors?.[sessionId] === 'VISUAL_VISIT_RENDERER_UNAVAILABLE' && !state.visual.visitors.find((visitor) => visitor.sessionId === sessionId), 15_000);
    await owner.waitForState((state) => state.visit?.state === 'active' && state.visual.ownerPresenceMode === 'away_visiting');
    await hostMain.evaluate(async () => window.ourCompanion.smoke?.reconcileVisits());
    await host.waitForState((state) => Boolean(state.visual.visitors.find((visitor) => visitor.sessionId === sessionId)), 60_000);
    checks.rendererFailureRecovered = true;
    const activeAssetStatus = await hostMain.evaluate(async ({ session, pack }) => (await fetch(`companion-network://${session}/${pack}/assets/animations/Idle_Neutral.png`)).status, { session: sessionId, pack: seeded.ownerPackId });
    expect(activeAssetStatus).toBe(200);
    checks.activeAssetAuthorized = true;
    expect(await hostMain.evaluate(async ({ session }) => (await fetch(`companion-network://${session}/other-pack/assets/animations/Idle_Neutral.png`)).status, { session: sessionId })).toBeGreaterThanOrEqual(400);
    expect(await hostMain.evaluate(async ({ session, pack }) => (await fetch(`companion-network://${session}/${pack}/assets/%2e%2e/secret.png`)).status, { session: sessionId, pack: seeded.ownerPackId })).toBeGreaterThanOrEqual(400);
    expect(await hostMain.evaluate(async ({ session, pack }) => (await fetch(`companion-network://${session}/${pack}/assets/animations/Undeclared.png`)).status, { session: sessionId, pack: seeded.ownerPackId })).toBeGreaterThanOrEqual(400);
    expect(await hostMain.evaluate(async ({ session, pack }) => (await fetch(`companion-network://${session}/${pack}/assets/readme.txt`)).status, { session: sessionId, pack: seeded.ownerPackId })).toBeGreaterThanOrEqual(400);
    await endVisit(owner, sessionId);
    await assertTerminalCleanup(owner, host, sessionId);
    await assertAssetDeniedAfterEnd(host, sessionId, seeded.ownerPackId);
    checks.terminalAssetDenied = true;

    // Scenarios 7–9: each destructive action is exercised against a fresh real Session.
    sessionId = await startVisit(owner, host, seeded.hostAccountId); await removeFriend(owner); await assertTerminalCleanup(owner, host, sessionId); checks.friendshipRevocation = true;
    await establishFriendship(owner, host);
    sessionId = await startVisit(owner, host, seeded.hostAccountId); await blockFriend(owner); await assertTerminalCleanup(owner, host, sessionId); checks.block = true;
    await (await owner.mainWindow()).evaluate(async () => { const blocked = (await window.ourCompanion.network.blocks.getAll())[0]; if (blocked) await window.ourCompanion.network.blocks.unblock(blocked.userId); });
    await establishFriendship(owner, host);
    sessionId = await startVisit(owner, host, seeded.hostAccountId); await unpublishOwnerCompanion(owner, seeded.ownerNetworkCompanionId); await assertTerminalCleanup(owner, host, sessionId); checks.unpublish = true;
    functionalSmokePassed = true;
  } catch (error) {
    scenarioError = error;
    await Promise.allSettled([owner.screenshot('failure'), host.screenshot('failure')]);
    const states = await Promise.allSettled([owner.getSmokeState(), host.getSmokeState()]);
    await fs.writeFile(path.join(artifactRoot, 'failure-context.json'), JSON.stringify(sanitizedReport({
      result: 'failed', runId: 'sanitized', checks,
      error: redactSmokeText(error instanceof Error ? error.message : 'SMOKE_FAILURE'),
      states: states.map((state) => state.status === 'fulfilled' ? state.value : { unavailable: true }),
    }), null, 2));
  } finally {
    const hostWindow = await host.mainWindow().catch(() => undefined);
    if (hostWindow) await hostWindow.evaluate(async () => window.ourCompanion.smoke?.clearVisualWorkArea()).catch(() => undefined);
    await Promise.allSettled([owner.close(), host.close()]);
    if (preflightReached) {
      try {
        const response = await fetch(new URL('/api/smoke/cleanup', serverUrl), {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-smoke-test-token': cleanupToken }, body: JSON.stringify({ runId }),
        });
        if (!response.ok) throw new Error(`SMOKE_CLEANUP_HTTP_${response.status}`);
        const raw = await response.json() as { data?: { cleaned?: boolean } };
        if (raw.data?.cleaned !== true) throw new Error('SMOKE_CLEANUP_INVALID_RESPONSE');
        checks.cleanupSucceeded = true;
      } catch (error) {
        cleanupError = redactSmokeText(error instanceof Error ? error.message : 'SMOKE_CLEANUP_FAILED');
      }
    }
    await network?.stop();
    await cleanupDirectories([profiles.owner, profiles.host]);
    const report = sanitizedReport({
      result: functionalSmokePassed && checks.cleanupSucceeded ? 'passed' : 'failed', runId: 'sanitized', clientCommit, networkCommit, protocol: '0.4', checks,
      functionalSmokePassed, cleanupSucceeded: checks.cleanupSucceeded, ...(cleanupError ? { cleanupError } : {}), physicalVerificationRequired: true,
    });
    await fs.writeFile(path.join(artifactRoot, 'report.json'), JSON.stringify(report, null, 2));
  }

  if (scenarioError) throw scenarioError;
  if (!checks.cleanupSucceeded) throw new Error('SMOKE_CLEANUP_FAILED');
});
