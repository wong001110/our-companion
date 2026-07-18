import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SmokeElectronDevice } from './electron-device';
import { loadNetworkEnvironment, ManagedSmokeNetwork, preflightSmokeServer, resolveSmokeNetworkRoot } from './network-process';
import { establishFriendship, publishOwnerFixture, registerDevice } from './network-seed';
import { assertTerminalCleanup, endVisit, startVisit } from './s5-two-device.fixture';
import { assertIsolatedProfiles, cleanupDirectories, createSmokeRunId, sanitizedReport } from './smoke-state';

const clientRoot = path.resolve(import.meta.dirname, '../..');
const visitorSize = { width: 220, height: 230 };

function overlaps(left: { x?: number; y?: number }, right: { x?: number; y?: number }): boolean {
  if (typeof left.x !== 'number' || typeof left.y !== 'number' || typeof right.x !== 'number' || typeof right.y !== 'number') return true;
  return left.x < right.x + visitorSize.width && left.x + visitorSize.width > right.x
    && left.y < right.y + visitorSize.height && left.y + visitorSize.height > right.y;
}

test('S5 logical three-device multi-Visitor smoke', async () => {
  const managedServer = process.env.OUR_COMPANION_SMOKE_MANAGE_SERVER === '1';
  const serverUrl = process.env.OUR_COMPANION_SMOKE_SERVER_URL ?? (managedServer ? 'http://127.0.0.1:3001' : undefined);
  if (!serverUrl) throw new Error('OUR_COMPANION_SMOKE_SERVER_URL is required; use a dedicated smoke Network Server.');
  const runId = createSmokeRunId(Date.now(), randomUUID().replaceAll('-', '').slice(0, 12)).toLowerCase();
  const artifactRoot = path.join(clientRoot, 'artifacts', 's5-multi-visitor', runId);
  const profiles = {
    ownerA: path.join(artifactRoot, 'profiles', 'owner-a'),
    ownerB: path.join(artifactRoot, 'profiles', 'owner-b'),
    host: path.join(artifactRoot, 'profiles', 'host'),
  };
  const networkRoot = resolveSmokeNetworkRoot(clientRoot);
  const clientCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: clientRoot, encoding: 'utf8' }).trim();
  const networkCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: networkRoot, encoding: 'utf8' }).trim();
  const network = managedServer ? new ManagedSmokeNetwork({
    serverUrl,
    networkRoot,
    artifactDir: path.join(artifactRoot, 'network'),
    env: { ...(await loadNetworkEnvironment(networkRoot)), ...process.env },
  }) : undefined;
  const cleanupToken = network?.cleanupToken ?? process.env.SMOKE_TEST_CLEANUP_TOKEN;
  if (!cleanupToken) throw new Error('SMOKE_CLEANUP_TOKEN_REQUIRED');
  const ownerA = new SmokeElectronDevice({ role: 'visitor_owner', userDataDir: profiles.ownerA, serverUrl, artifactDir: path.join(artifactRoot, 'owner-a'), appPath: path.join(clientRoot, 'apps', 'desktop') });
  const ownerB = new SmokeElectronDevice({ role: 'visitor_owner', userDataDir: profiles.ownerB, serverUrl, artifactDir: path.join(artifactRoot, 'owner-b'), appPath: path.join(clientRoot, 'apps', 'desktop') });
  const host = new SmokeElectronDevice({ role: 'host', userDataDir: profiles.host, serverUrl, artifactDir: path.join(artifactRoot, 'host'), appPath: path.join(clientRoot, 'apps', 'desktop') });
  const checks = { preflight: false, isolatedProfiles: false, threeAccountsOnline: false, twoSessionsActive: false, twoVisitorsRendered: false, distinctSlots: false, nonOverlapping: false, independentAssets: false, firstDepartureRetainsSecond: false, terminalCleanup: false, cleanupSucceeded: false };
  let scenarioError: unknown;
  let cleanupError: string | undefined;

  await fs.mkdir(artifactRoot, { recursive: true });
  try {
    if (network) { await network.prepareAndStart(); await network.preflight(); }
    else await preflightSmokeServer(serverUrl);
    checks.preflight = true;
    assertIsolatedProfiles({ owner: profiles.ownerA, host: profiles.host });
    assertIsolatedProfiles({ owner: profiles.ownerB, host: profiles.host });
    assertIsolatedProfiles({ owner: profiles.ownerA, host: profiles.ownerB });
    checks.isolatedProfiles = true;

    await Promise.all([ownerA.launch(), ownerB.launch(), host.launch()]);
    await Promise.all([ownerA.bootstrapFixtureCompanion(), ownerB.bootstrapFixtureCompanion(), host.bootstrapFixtureCompanion()]);
    const [ownerAState, ownerBState, hostState] = await Promise.all([
      registerDevice(ownerA, { email: `ownera-s5-${runId}@example.invalid`, username: `oaa${runId}`.slice(0, 30), password: randomUUID() }),
      registerDevice(ownerB, { email: `ownerb-s5-${runId}@example.invalid`, username: `obb${runId}`.slice(0, 30), password: randomUUID() }),
      registerDevice(host, { email: `host-s5-${runId}@example.invalid`, username: `hst${runId}`.slice(0, 30), password: randomUUID() }),
    ]);
    if (!ownerAState.network.accountId || !ownerBState.network.accountId || !hostState.network.accountId) throw new Error('SMOKE_ACCOUNT_UNAVAILABLE');
    await establishFriendship(ownerA, host);
    await establishFriendship(ownerB, host);
    const [ownerAPublished, ownerBPublished] = await Promise.all([publishOwnerFixture(ownerA, `${runId}-a`), publishOwnerFixture(ownerB, `${runId}-b`)]);
    checks.threeAccountsOnline = true;

    const firstSessionId = await startVisit(ownerA, host, hostState.network.accountId);
    const secondSessionId = await startVisit(ownerB, host, hostState.network.accountId);
    const hostVisual = await host.waitForState((state) => {
      const active = state.visual.visitors.filter((visitor) => !visitor.departing);
      return active.some((visitor) => visitor.sessionId === firstSessionId) && active.some((visitor) => visitor.sessionId === secondSessionId);
    }, 120_000);
    expect(hostVisual.visits?.filter((visit) => visit.state === 'active')).toHaveLength(2);
    checks.twoSessionsActive = checks.twoVisitorsRendered = true;

    const firstVisitor = hostVisual.visual.visitors.find((visitor) => visitor.sessionId === firstSessionId)!;
    const secondVisitor = hostVisual.visual.visitors.find((visitor) => visitor.sessionId === secondSessionId)!;
    expect([firstVisitor.sceneSlotIndex, secondVisitor.sceneSlotIndex].sort()).toEqual([0, 1]);
    checks.distinctSlots = true;
    expect(overlaps(firstVisitor, secondVisitor)).toBe(false);
    checks.nonOverlapping = true;

    const hostPage = await host.mainWindow();
    await expect.poll(() => hostPage.evaluate(async ({ session, pack }) => (await fetch(`companion-network://${session}/${pack}/assets/animations/Idle_Neutral.png`)).status, { session: firstSessionId, pack: ownerAPublished.assetPackId })).toBe(200);
    await expect.poll(() => hostPage.evaluate(async ({ session, pack }) => (await fetch(`companion-network://${session}/${pack}/assets/animations/Idle_Neutral.png`)).status, { session: secondSessionId, pack: ownerBPublished.assetPackId })).toBe(200);
    expect(await hostPage.evaluate(async ({ session, pack }) => (await fetch(`companion-network://${session}/${pack}/assets/animations/Idle_Neutral.png`)).status, { session: firstSessionId, pack: ownerBPublished.assetPackId })).toBeGreaterThanOrEqual(400);
    checks.independentAssets = true;
    await hostPage.screenshot({ path: path.join(artifactRoot, 'host', 'two-visitors-active.png') });

    await endVisit(ownerA, firstSessionId);
    await host.waitForState((state) => !state.visual.visitors.some((visitor) => visitor.sessionId === firstSessionId && !visitor.departing)
      && state.visual.visitors.some((visitor) => visitor.sessionId === secondSessionId && !visitor.departing), 30_000);
    checks.firstDepartureRetainsSecond = true;
    await assertTerminalCleanup(ownerA, host, firstSessionId);
    await endVisit(host, secondSessionId);
    await assertTerminalCleanup(ownerB, host, secondSessionId);
    checks.terminalCleanup = true;
  } catch (error) {
    scenarioError = error;
    await Promise.allSettled([ownerA.screenshot('failure'), ownerB.screenshot('failure'), host.screenshot('failure')]);
  } finally {
    await Promise.allSettled([ownerA.close(), ownerB.close(), host.close()]);
    if (checks.preflight) {
      try {
        const response = await fetch(new URL('/api/smoke/cleanup', serverUrl), {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-smoke-test-token': cleanupToken }, body: JSON.stringify({ runId }),
        });
        const body = await response.json() as { data?: { cleaned?: boolean } };
        if (!response.ok || body.data?.cleaned !== true) throw new Error('SMOKE_CLEANUP_FAILED');
        checks.cleanupSucceeded = true;
      } catch (error) {
        cleanupError = error instanceof Error ? error.message : 'SMOKE_CLEANUP_FAILED';
      }
    }
    await network?.stop();
    await cleanupDirectories([profiles.ownerA, profiles.ownerB, profiles.host]);
    await fs.writeFile(path.join(artifactRoot, 'report.json'), JSON.stringify(sanitizedReport({ result: !scenarioError && !cleanupError && checks.cleanupSucceeded ? 'passed' : 'failed', runId: 'sanitized', clientCommit, networkCommit, protocol: '0.4', checks, ...(cleanupError ? { cleanupError } : {}), physicalVerificationRequired: true }), null, 2));
  }
  if (scenarioError) throw scenarioError;
  if (!checks.cleanupSucceeded) throw new Error('SMOKE_CLEANUP_FAILED');
});
