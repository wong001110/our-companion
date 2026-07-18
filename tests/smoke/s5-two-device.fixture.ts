import { expect } from '@playwright/test';
import { SmokeElectronDevice } from './electron-device';
import { waitUntil } from './smoke-state';

function visitorForSession(state: Awaited<ReturnType<SmokeElectronDevice['getSmokeState']>>, sessionId: string) {
  return state.visual.visitors.find((visitor) => visitor.sessionId === sessionId);
}

export async function startVisit(owner: SmokeElectronDevice, host: SmokeElectronDevice, hostAccountId: string): Promise<string> {
  const ownerPage = await owner.mainWindow();
  const hostPage = await host.mainWindow();
  await ownerPage.evaluate(async (id) => { await window.ourCompanion.network.visits.invitations.send(id); }, hostAccountId);
  const invitationId = await waitUntil(
    () => hostPage.evaluate(async () => (await window.ourCompanion.network.visits.invitations.list({ direction: 'incoming', status: 'pending' }))[0]?.id),
    Boolean,
    { timeoutMs: 15_000, label: 'incoming-visit' },
  );
  await hostPage.evaluate(async (id) => { await window.ourCompanion.network.visits.invitations.accept(id); }, invitationId);
  const sessionId = await waitUntil(
    async () => (await owner.getSmokeState()).visit?.sessionId,
    Boolean,
    { timeoutMs: 15_000, label: 'preparing-visit' },
  );
  await Promise.all([
    ownerPage.evaluate(async (id) => window.ourCompanion.network.visits.sessions.prepare(id), sessionId),
    hostPage.evaluate(async (id) => window.ourCompanion.network.visits.sessions.prepare(id), sessionId),
  ]);
  await host.waitForState((state) => state.visits?.some((visit) => visit.sessionId === sessionId && visit.state === 'ready') === true, 60_000);
  await hostPage.evaluate(async (id) => window.ourCompanion.network.visits.sessions.start(id), sessionId);
  await Promise.all([
    owner.waitForState((state) => state.visit?.sessionId === sessionId && state.visit.state === 'active' && state.visual.ownerPresenceMode === 'away_visiting', 30_000),
    host.waitForState((state) => state.visit?.sessionId === sessionId && state.visit.state === 'active' && visitorForSession(state, sessionId)?.runtimeId === `visit:${sessionId}`, 120_000),
  ]);
  return sessionId;
}

export async function endVisit(device: SmokeElectronDevice, sessionId: string): Promise<void> {
  await (await device.mainWindow()).evaluate(async (id) => window.ourCompanion.network.visits.sessions.end(id), sessionId);
}

export async function assertTerminalCleanup(owner: SmokeElectronDevice, host: SmokeElectronDevice, sessionId: string): Promise<void> {
  await Promise.all([
    owner.waitForState((state) => (state.visits?.some((visit) => visit.sessionId === sessionId && ['ended', 'cancelled', 'failed'].includes(visit.state)) ?? !state.visit) && state.visual.ownerPresenceMode === 'home', 30_000),
    host.waitForState((state) => (state.visits?.some((visit) => visit.sessionId === sessionId && ['ended', 'cancelled', 'failed'].includes(visit.state)) ?? !state.visit) && !visitorForSession(state, sessionId), 30_000),
  ]);
  await expect((await host.mainWindow()).getByTestId('remote-visual-visitor')).toHaveCount(0);
}

export async function removeFriend(owner: SmokeElectronDevice): Promise<void> {
  await (await owner.mainWindow()).evaluate(async () => {
    const friend = (await window.ourCompanion.network.friends.getAll())[0];
    if (!friend) throw new Error('SMOKE_FRIEND_UNAVAILABLE');
    await window.ourCompanion.network.friends.remove(friend.userId);
  });
}

export async function blockFriend(owner: SmokeElectronDevice): Promise<void> {
  await (await owner.mainWindow()).evaluate(async () => {
    const friend = (await window.ourCompanion.network.friends.getAll())[0];
    if (!friend) throw new Error('SMOKE_FRIEND_UNAVAILABLE');
    await window.ourCompanion.network.blocks.block(friend.userId);
  });
}

export async function unpublishOwnerCompanion(owner: SmokeElectronDevice, networkCompanionId: string): Promise<void> {
  await (await owner.mainWindow()).evaluate(async (id) => window.ourCompanion.network.companions.unpublish(id), networkCompanionId);
}

export async function assertRendererLifecycle(host: SmokeElectronDevice, sessionId: string): Promise<void> {
  await host.waitForState((state) => {
    const visitor = visitorForSession(state, sessionId);
    return visitor?.sessionId === sessionId && visitor.observedAnimations?.includes('Enter') === true;
  }, 30_000);
  await host.waitForState((state) => {
    const visitor = visitorForSession(state, sessionId);
    return visitor?.sessionId === sessionId && visitor.observedAnimations?.some((name) => name === 'Idle_Neutral' || name.startsWith('Walk_')) === true;
  }, 30_000);
  await expect((await host.mainWindow()).getByTestId('remote-visual-visitor')).toHaveAttribute('data-session-id', sessionId);
}

export async function assertAssetDeniedAfterEnd(host: SmokeElectronDevice, sessionId: string, assetPackId: string): Promise<void> {
  const page = await host.mainWindow();
  const status = await page.evaluate(async ({ session, pack }) => (await fetch(`companion-network://${session}/${pack}/assets/animations/Idle_Neutral.png`)).status, { session: sessionId, pack: assetPackId });
  expect(status).toBeGreaterThanOrEqual(400);
}
