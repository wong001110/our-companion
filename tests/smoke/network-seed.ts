import type { Page } from '@playwright/test';
import type { SmokeTestState } from '@our-companion/shared';
import { SmokeElectronDevice } from './electron-device';

export interface SmokeCredentials { email: string; username: string; password: string; }
export interface SeededNetwork { ownerAccountId: string; hostAccountId: string; ownerPackId: string; ownerNetworkCompanionId: string; }

async function mainPage(device: SmokeElectronDevice): Promise<Page> { return device.mainWindow(); }

export async function registerDevice(device: SmokeElectronDevice, credentials: SmokeCredentials): Promise<SmokeTestState> {
  const page = await mainPage(device);
  await page.evaluate(async (input) => {
    await window.ourCompanion.network.register(input);
  }, credentials);
  return device.waitForState((state) => state.network.state === 'online' && Boolean(state.network.accountId), 30_000);
}

export async function publishOwnerFixture(device: SmokeElectronDevice, runId: string): Promise<{ networkCompanionId: string; assetPackId: string }> {
  const page = await mainPage(device);
  return page.evaluate(async (suffix) => {
    const local = await window.ourCompanion.companionNew.getPrimary();
    if (!local) throw new Error('SMOKE_LOCAL_COMPANION_UNAVAILABLE');
    const created = await window.ourCompanion.network.companions.create({ localCompanionId: local.id, name: `Smoke Visitor ${suffix.slice(0, 8)}`, publicDescription: 'Automated S5 fixture.', publicTags: ['smoke', 's5'] });
    await window.ourCompanion.network.companions.activate(created.networkCompanionId);
    const pack = await window.ourCompanion.network.assets.publishPack({ localCompanionId: local.id, networkCompanionId: created.networkCompanionId });
    await window.ourCompanion.network.companions.publish(created.networkCompanionId);
    return { networkCompanionId: created.networkCompanionId, assetPackId: pack.id };
  }, runId);
}

export async function establishFriendship(owner: SmokeElectronDevice, host: SmokeElectronDevice): Promise<void> {
  const hostPage = await mainPage(host);
  const hostIdentity = await hostPage.evaluate(async () => window.ourCompanion.network.getStatus());
  const ownerPage = await mainPage(owner);
  await ownerPage.evaluate(async (uid) => {
    const friend = await window.ourCompanion.network.friends.lookup(uid);
    await window.ourCompanion.network.friends.sendRequest(friend.id);
  }, hostIdentity.account?.uid ?? '');
  const requestId = await hostPage.evaluate(async () => (await window.ourCompanion.network.friends.getIncomingRequests())[0]?.id);
  if (!requestId) throw new Error('SMOKE_FRIEND_REQUEST_UNAVAILABLE');
  await hostPage.evaluate(async (id) => window.ourCompanion.network.friends.acceptRequest(id), requestId);
  await Promise.all([
    owner.waitForState((state) => state.network.state === 'online'),
    host.waitForState((state) => state.network.state === 'online'),
  ]);
}

export async function seedTwoDeviceNetwork(owner: SmokeElectronDevice, host: SmokeElectronDevice, runId: string, ownerCredentials: SmokeCredentials, hostCredentials: SmokeCredentials): Promise<SeededNetwork> {
  const [ownerState, hostState] = await Promise.all([registerDevice(owner, ownerCredentials), registerDevice(host, hostCredentials)]);
  if (!ownerState.network.accountId || !hostState.network.accountId) throw new Error('SMOKE_ACCOUNT_UNAVAILABLE');
  await establishFriendship(owner, host);
  const [published] = await Promise.all([
    publishOwnerFixture(owner, runId),
    publishOwnerFixture(host, `${runId}-host`),
  ]);
  return { ownerAccountId: ownerState.network.accountId, hostAccountId: hostState.network.accountId, ownerPackId: published.assetPackId, ownerNetworkCompanionId: published.networkCompanionId };
}
