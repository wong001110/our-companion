import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SmokeElectronDevice } from './electron-device';
import { loadNetworkEnvironment, ManagedSmokeNetwork, preflightSmokeServer, resolveSmokeNetworkRoot } from './network-process';
import { establishFriendship, publishOwnerFixture, registerDevice } from './network-seed';
import { assertTerminalCleanup, endVisit, startVisit } from './s5-two-device.fixture';
import { assertIsolatedProfiles, cleanupDirectories, createSmokeRunId, sanitizedReport, waitUntil } from './smoke-state';
import { footprintForPosition, footprintsOverlap } from '../../apps/desktop/renderer/src/motion/sceneMotion';

const clientRoot = path.resolve(import.meta.dirname, '../..');
const visitorSize = { width: 220, height: 230 };

function overlaps(left: { x?: number; y?: number }, right: { x?: number; y?: number }): boolean {
  if (typeof left.x !== 'number' || typeof left.y !== 'number' || typeof right.x !== 'number' || typeof right.y !== 'number') return true;
  return footprintsOverlap(
    footprintForPosition({ x: left.x, y: left.y }, visitorSize),
    footprintForPosition({ x: right.x, y: right.y }, visitorSize),
  );
}

test('S5 logical three-device Social Room smoke', async () => {
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
  const checks = { preflight: false, isolatedProfiles: false, threeAccountsOnline: false, oneRoomActive: false, guestJoined: false, twoVisitorsRendered: false, bothVisitorsWalking: false, distinctSlots: false, nonOverlapping: false, independentAssets: false, guestDepartureRetainsVisitor: false, terminalCleanup: false, cleanupSucceeded: false };
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
    await establishFriendship(ownerB, ownerA);
    const [ownerAPublished, ownerBPublished] = await Promise.all([
      publishOwnerFixture(ownerA, `${runId}-a`),
      publishOwnerFixture(ownerB, `${runId}-b`),
      publishOwnerFixture(host, `${runId}-host`),
    ]);
    checks.threeAccountsOnline = true;

    const sessionId = await startVisit(ownerA, host, hostState.network.accountId);
    checks.oneRoomActive = true;
    const ownerBPage = await ownerB.mainWindow();
    const joinable = await ownerBPage.evaluate(async (expectedSessionId) => {
      const rooms = await window.ourCompanion.network.visits.rooms.listJoinable();
      return rooms.find((room) => room.sessionId === expectedSessionId);
    }, sessionId);
    if (!joinable) throw new Error('SMOKE_JOINABLE_ROOM_UNAVAILABLE');
    await ownerBPage.evaluate(async (id) => { await window.ourCompanion.network.visits.rooms.requestJoin(id); }, sessionId);

    const hostPage = await host.mainWindow();
    const joinRequestId = await waitUntil(
      () => hostPage.evaluate(async (id) => (await window.ourCompanion.network.visits.rooms.get(id)).pendingJoinRequests[0]?.id, sessionId),
      Boolean,
      { timeoutMs: 30_000, label: 'room-join-request' },
    );
    await hostPage.evaluate(async (id) => { await window.ourCompanion.network.visits.rooms.acceptJoinRequest(id); }, joinRequestId);
    await ownerBPage.evaluate(async (id) => { await window.ourCompanion.network.visits.rooms.markParticipantReady(id); }, sessionId);
    checks.guestJoined = true;

    const hostVisual = await host.waitForState((state) => state.visual.visitors.filter((visitor) => visitor.sessionId === sessionId && !visitor.departing).length === 2, 120_000);
    const activeVisitors = hostVisual.visual.visitors.filter((visitor) => visitor.sessionId === sessionId && !visitor.departing);
    checks.twoVisitorsRendered = true;
    expect(activeVisitors).toHaveLength(2);
    const firstVisitor = activeVisitors.find((visitor) => visitor.assetPackId === ownerAPublished.assetPackId)!;
    const secondVisitor = activeVisitors.find((visitor) => visitor.assetPackId === ownerBPublished.assetPackId)!;
    expect(firstVisitor).toBeTruthy();
    expect(secondVisitor).toBeTruthy();
    expect([firstVisitor.sceneSlotIndex, secondVisitor.sceneSlotIndex].sort()).toEqual([0, 1]);
    checks.distinctSlots = true;
    expect(overlaps(firstVisitor, secondVisitor)).toBe(false);
    checks.nonOverlapping = true;

    await host.waitForState((state) => {
      const active = state.visual.visitors.filter((visitor) => visitor.sessionId === sessionId && !visitor.departing);
      return active.length === 2 && active.every((visitor) => visitor.observedAnimations?.some((name) => name.startsWith('Walk_')));
    }, 30_000);
    checks.bothVisitorsWalking = true;

    await expect.poll(() => hostPage.evaluate(async ({ session, pack }) => (await fetch(`companion-network://${session}/${pack}/assets/animations/Idle_Neutral.png`)).status, { session: sessionId, pack: ownerAPublished.assetPackId })).toBe(200);
    await expect.poll(() => hostPage.evaluate(async ({ session, pack }) => (await fetch(`companion-network://${session}/${pack}/assets/animations/Idle_Neutral.png`)).status, { session: sessionId, pack: ownerBPublished.assetPackId })).toBe(200);
    checks.independentAssets = true;
    await hostPage.screenshot({ path: path.join(artifactRoot, 'host', 'three-companion-room-active.png') });

    await ownerBPage.evaluate(async (id) => { await window.ourCompanion.network.visits.rooms.leave(id); }, sessionId);
    await host.waitForState((state) => {
      const active = state.visual.visitors.filter((visitor) => visitor.sessionId === sessionId && !visitor.departing);
      return active.length === 1 && active[0]?.assetPackId === ownerAPublished.assetPackId;
    }, 30_000);
    checks.guestDepartureRetainsVisitor = true;

    await endVisit(host, sessionId);
    await assertTerminalCleanup(ownerA, host, sessionId);
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
