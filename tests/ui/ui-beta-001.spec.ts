import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import axe from 'axe-core';
import { UiElectronFixture } from './ui-fixture';

const pages = [
  ['home', 0],
  ['chat', 1],
  ['discoveries', 2],
  ['journeys', 3],
  ['memories', 4],
  ['social', 5],
  ['settings', 6],
] as const;

type AxeSummary = { critical: number; serious: number; details: Array<{ id: string; impact: string | null; targets: string[][] }> };

type LifecycleFixture = {
  status: Record<string, unknown>;
  friends: Array<Record<string, unknown>>;
  incomingRequests: Array<Record<string, unknown>>;
  outgoingRequests: Array<Record<string, unknown>>;
  blockedUsers: Array<Record<string, unknown>>;
  presence: Array<Record<string, unknown>>;
  incomingInvitations: Array<Record<string, unknown>>;
  outgoingInvitations: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  publication: Record<string, unknown>;
  localCompanions: Array<Record<string, unknown>>;
  failures: string[];
  publishAction?: 'uploading' | 'verifying' | 'failed' | 'success';
  historyMode?: 'ready' | 'loading' | 'failed';
  chatSendFails?: boolean;
};

const account = { id: 'owner-1', email: 'owner@example.test', username: 'Ari', friendCode: 'ARI00001' };
const onlineStatus = { state: 'online', onlineModeEnabled: true, serverUrl: 'https://fixture.example', account, features: { visitInvitations: true, visitSessions: true } };
const localCompanion = { id: 'local-1', name: 'Mochi', description: 'A curious notebook companion', isPrimary: true, createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z' };
const activePack = { id: 'pack-1', companionId: 'network-companion-1', manifestHash: 'fixture-hash', schemaVersion: 1, status: 'active', totalFiles: 12, totalBytes: 3145728, createdAt: '2026-07-15T10:00:00.000Z', updatedAt: '2026-07-15T10:03:00.000Z', activatedAt: '2026-07-15T10:03:00.000Z' };
const publishedProfile = { id: 'network-companion-1', ownerUserId: account.id, name: 'Mochi', publicDescription: 'Curious, calm, and ready to visit.', publicTags: ['curious', 'gentle'], visibility: 'friends_only', published: true, activeAssetPackId: activePack.id, createdAt: '2026-07-15T10:00:00.000Z', updatedAt: '2026-07-15T10:03:00.000Z', publishedAt: '2026-07-15T10:03:00.000Z', assetPacks: [activePack] };
const friend = { userId: 'friend-1', username: 'Mira', friendCode: 'MIRA0001', presence: 'online', hasPublishedCompanion: true };
const incomingRequest = { id: 'request-in-1', direction: 'incoming', userId: 'request-user-1', username: 'Sol', friendCode: 'SOL00001', status: 'pending', createdAt: '2026-07-16T08:30:00.000Z' };
const outgoingRequest = { id: 'request-out-1', direction: 'outgoing', userId: 'request-user-2', username: 'Jun', friendCode: 'JUN00001', status: 'pending', createdAt: '2026-07-16T09:30:00.000Z' };
const invitation = { id: 'invite-1', visitorOwnerUserId: friend.userId, hostUserId: account.id, networkCompanionId: 'friend-companion-1', assetPackId: 'friend-pack-1', companionName: 'Lumi', companionDescription: 'A quiet visitor', companionTags: ['gentle'], status: 'pending', expiresAt: '2026-07-18T10:00:00.000Z', createdAt: '2026-07-17T10:00:00.000Z', updatedAt: '2026-07-17T10:00:00.000Z' };

function fixture(overrides: Partial<LifecycleFixture> = {}): LifecycleFixture {
  return {
    status: onlineStatus,
    friends: [friend],
    incomingRequests: [],
    outgoingRequests: [],
    blockedUsers: [],
    presence: [{ userId: friend.userId, status: 'online', updatedAt: '2026-07-17T10:00:00.000Z' }],
    incomingInvitations: [],
    outgoingInvitations: [],
    sessions: [],
    publication: { activeNetworkCompanionId: publishedProfile.id, companions: [publishedProfile] },
    localCompanions: [localCompanion],
    failures: [],
    historyMode: 'ready',
    ...overrides,
  };
}

async function installLifecycleBridge(panel: Page): Promise<void> {
  expect(await panel.evaluate(() => Boolean(window.ourCompanion.smoke?.setUiBetaFixture))).toBe(true);
}

async function setLifecycleFixture(panel: Page, next: LifecycleFixture): Promise<void> {
  await panel.evaluate((value) => window.ourCompanion.smoke!.setUiBetaFixture(value), next);
}

async function emitLifecycleStatus(panel: Page, next: LifecycleFixture): Promise<void> {
  await setLifecycleFixture(panel, next);
}

async function criticalAndSerious(page: Page): Promise<AxeSummary> {
  await page.addScriptTag({ content: axe.source });
  const impacts = await page.evaluate(async () => {
    const runner = (window as typeof window & { axe: typeof axe }).axe;
    return (await runner.run('.panel-shell')).violations.map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map((node) => node.target) }));
  });
  return {
    critical: impacts.filter((violation) => violation.impact === 'critical').length,
    serious: impacts.filter((violation) => violation.impact === 'serious').length,
    details: impacts.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious'),
  };
}

test('UI-BETA-001 touched Panel surfaces remain readable and accessible', async () => {
  test.setTimeout(120_000);
  const device = new UiElectronFixture();
  const report: Record<string, AxeSummary> = {};
  let scenarioFailure: unknown;
  try {
    await device.launch();
    const panel = await device.panelWindow();
    const nav = panel.locator('nav[aria-label] button');
    await panel.setViewportSize({ width: 1180, height: 760 });

    for (const [name, index] of pages) {
      await nav.nth(index).click();
      const page = panel.getByTestId(`panel-page-${name === 'discoveries' ? 'discovery' : name === 'journeys' ? 'journey' : name === 'memories' ? 'memory' : name}`);
      await expect(page).toHaveAttribute('data-motion-state', 'entered');
      await expect(page).toHaveCSS('opacity', '1');
      report[`en-${name}-1180`] = await criticalAndSerious(panel);
      await device.screenshot(panel, `ui-beta-001/en/${name}-1180.png`);
    }

    await panel.emulateMedia({ reducedMotion: 'reduce' });
    await panel.setViewportSize({ width: 760, height: 760 });
    await nav.nth(6).click();
    await panel.getByRole('tab', { name: 'AI' }).click();
    await panel.locator('.settings-panel select').nth(1).selectOption('zh-CN');
    await panel.getByRole('button', { name: 'Save' }).click();

    for (const [name, index] of pages) {
      await nav.nth(index).click();
      const page = panel.getByTestId(`panel-page-${name === 'discoveries' ? 'discovery' : name === 'journeys' ? 'journey' : name === 'memories' ? 'memory' : name}`);
      await expect(page).toHaveAttribute('data-motion-state', 'entered');
      await expect(page).toHaveCSS('opacity', '1');
      report[`zh-CN-${name}-760-reduced-motion`] = await criticalAndSerious(panel);
      await device.screenshot(panel, `ui-beta-001/zh-CN/${name}-760-reduced-motion.png`);
    }

    const totals = Object.values(report).reduce((sum, result) => ({ critical: sum.critical + result.critical, serious: sum.serious + result.serious }), { critical: 0, serious: 0 });
    const reportPath = path.join(device.artifactDir, 'ui-beta-001', 'report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({ report, totals }, null, 2));
    expect(totals).toEqual({ critical: 0, serious: 0 });
  } catch (cause) {
    scenarioFailure = cause;
  }
  try {
    await device.close();
  } catch (closeFailure) {
    if (!scenarioFailure) throw closeFailure;
  }
  if (scenarioFailure) throw scenarioFailure;
});

test('UI-BETA-001 operational lifecycle state evidence', async () => {
  test.setTimeout(120_000);
  const device = new UiElectronFixture();
  const report: Record<string, AxeSummary> = {};
  let scenarioFailure: unknown;
  try {
    await device.launch();
    const panel = await device.panelWindow();
    await panel.setViewportSize({ width: 1180, height: 760 });
    await installLifecycleBridge(panel);

    const capture = async (name: string) => {
      report[name] = await criticalAndSerious(panel);
      await device.screenshot(panel, `ui-beta-001/states/${name}.png`);
    };
    const remount = async (pageName: 'Chat' | 'Social' | 'Settings', next: LifecycleFixture) => {
      await panel.getByRole('button', { name: 'Home' }).click();
      await expect(panel.getByTestId('panel-page-home')).toHaveAttribute('data-motion-state', 'entered');
      await setLifecycleFixture(panel, next);
      expect(await panel.evaluate(() => window.ourCompanion.network.getStatus())).toEqual(next.status);
      await panel.getByRole('button', { name: pageName }).click();
      await expect(panel.getByTestId(`panel-page-${pageName.toLowerCase()}`)).toHaveAttribute(
        'data-motion-state',
        'entered'
      );
      await emitLifecycleStatus(panel, next);
      await panel.waitForTimeout(220);
    };

    for (const [name, status] of [
      ['online-disabled', { state: 'disabled', onlineModeEnabled: false, serverUrl: 'https://fixture.example' }],
      ['online-connecting', { state: 'connecting', onlineModeEnabled: true, serverUrl: 'https://fixture.example' }],
      ['online-reconnecting', { ...onlineStatus, state: 'reconnecting' }],
      ['online-incompatible', { state: 'incompatible_client', onlineModeEnabled: true, serverUrl: 'https://fixture.example' }],
    ] as const) {
      await remount('Settings', fixture({ status }));
      await panel.getByRole('tab', { name: 'Online' }).click();
      await expect(panel.getByRole('heading', { name: 'Online Mode' })).toBeVisible();
      await capture(name);
    }

    await remount('Social', fixture());
    await expect(panel.getByTestId('friend-row')).toBeVisible();
    await capture('social-populated');

    await remount('Social', fixture({ failures: ['presence', 'incomingRequests'] }));
    await expect(panel.getByText('Live presence is unavailable. Friend rows remain available without online claims.')).toBeVisible();
    await capture('social-partial-error');

    await remount('Social', fixture({ incomingRequests: [incomingRequest], outgoingRequests: [outgoingRequest] }));
    await panel.getByText('Incoming Requests', { exact: true }).scrollIntoViewIfNeeded();
    await capture('social-requests');

    await remount('Social', fixture());
    await expect(panel.getByTestId('friend-row')).toBeVisible();
    await emitLifecycleStatus(panel, fixture({ status: { ...onlineStatus, state: 'reconnecting' } }));
    await expect(panel.getByText('Showing previously loaded information. Live presence and actions are unavailable until reconnection.')).toBeVisible();
    await capture('social-reconnecting-read-only');

    const draftPublication = { companions: [] };
    await remount('Social', fixture({ publication: draftPublication }));
    await panel.getByRole('heading', { name: 'Online Companion' }).scrollIntoViewIfNeeded();
    await capture('publishing-draft');

    for (const state of ['uploading', 'verifying'] as const) {
      await remount('Social', fixture({ publication: draftPublication, publishAction: state }));
      await panel.getByRole('button', { name: 'Publish', exact: true }).click();
      await expect(state === 'uploading' ? panel.getByText(/Uploading assets/) : panel.getByText('Verifying', { exact: true })).toBeVisible();
      await panel.getByRole('heading', { name: 'Online Companion' }).scrollIntoViewIfNeeded();
      await capture(`publishing-${state}`);
    }

    await remount('Social', fixture({ publication: draftPublication, publishAction: 'failed' }));
    await panel.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(panel.getByText('The Asset Pack did not pass integrity verification.')).toBeVisible();
    await panel.getByRole('heading', { name: 'Online Companion' }).scrollIntoViewIfNeeded();
    await capture('publishing-failed');

    await remount('Social', fixture());
    await expect(panel.getByText('Published to friends').first()).toBeVisible();
    await panel.getByRole('heading', { name: 'Online Companion' }).scrollIntoViewIfNeeded();
    await capture('publishing-published');

    await remount('Social', fixture({ incomingInvitations: [invitation] }));
    await panel.getByTestId('incoming-visit-invitation').scrollIntoViewIfNeeded();
    await capture('visit-invitation');

    const sessionBase = { id: 'session-1', invitationId: invitation.id, visitorOwnerUserId: friend.userId, hostUserId: account.id, networkCompanionId: invitation.networkCompanionId, assetPackId: invitation.assetPackId, visitorOwnerReady: true, hostReady: false, createdAt: '2026-07-17T10:01:00.000Z', updatedAt: '2026-07-17T10:02:00.000Z' };
    for (const [name, session] of [
      ['visit-preparing', { ...sessionBase, state: 'preparing' }],
      ['visit-active', { ...sessionBase, state: 'active', hostReady: true, startedAt: '2026-07-17T10:03:00.000Z' }],
      ['visit-terminal', { ...sessionBase, state: 'failed', endedAt: '2026-07-17T10:04:00.000Z', failureCode: 'VISUAL_VISIT_RENDERER_UNAVAILABLE' }],
    ] as const) {
      await remount('Social', fixture({ sessions: [session] }));
      await panel.getByTestId('visit-session-state').scrollIntoViewIfNeeded();
      await capture(name);
    }

    await remount('Chat', fixture({ historyMode: 'loading' }));
    await expect(panel.getByText('Loading conversation')).toBeVisible();
    await capture('chat-loading');

    await remount('Chat', fixture({ chatSendFails: true }));
    const composer = panel.locator('.chat-composer textarea');
    await composer.fill('Please keep this draft if sending fails.');
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(panel.getByText('The message could not be sent. Your draft is still here so you can try again.')).toBeVisible();
    await expect(composer).toHaveValue('Please keep this draft if sending fails.');
    await capture('chat-send-failure');

    const totals = Object.values(report).reduce((sum, result) => ({ critical: sum.critical + result.critical, serious: sum.serious + result.serious }), { critical: 0, serious: 0 });
    const reportPath = path.join(device.artifactDir, 'ui-beta-001', 'states-report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({ report, totals }, null, 2));
    expect(totals).toEqual({ critical: 0, serious: 0 });
  } catch (cause) {
    scenarioFailure = cause;
  }
  try {
    await device.close();
  } catch (closeFailure) {
    if (!scenarioFailure) throw closeFailure;
  }
  if (scenarioFailure) throw scenarioFailure;
});

test('UI-BETA-001 generated asset contact sheet records final usage', async () => {
  test.setTimeout(60_000);
  const device = new UiElectronFixture();
  let scenarioFailure: unknown;
  try {
    const assetRoot = path.resolve(import.meta.dirname, '../..', 'artifacts', 'ui-ux', 'UI-BETA-001', '2026-07-17', 'assets');
    const runtimeRoot = path.resolve(import.meta.dirname, '../..', 'apps', 'desktop', 'renderer', 'public', 'assets', 'panel', 'generated', 'notebook');
    const dataUrl = async (filePath: string) => `data:image/png;base64,${(await fs.readFile(filePath)).toString('base64')}`;
    const roles = await Promise.all([
      {
        finalName: 'authorship-pencil.png', surface: 'Home · authorship marker', size: 48, compactSize: 42, selected: 'authorship-a2', sha: '7edaee66…dd5f68',
        final: await dataUrl(path.join(runtimeRoot, 'authorship-pencil.png')),
        candidates: await Promise.all(['a1', 'a2', 'a3', 'a4'].map(async (id) => ({ id: `authorship-${id}`, src: await dataUrl(path.join(assetRoot, 'candidates-alpha', `authorship-${id}.png`)) }))),
      },
      {
        finalName: 'conversation-letter.png', surface: 'Chat · conversation marker', size: 42, compactSize: 38, selected: 'conversation-b3', sha: '6b7a4953…a310077',
        final: await dataUrl(path.join(runtimeRoot, 'conversation-letter.png')),
        candidates: await Promise.all(['b1', 'b2', 'b3', 'b4'].map(async (id) => ({ id: `conversation-${id}`, src: await dataUrl(path.join(assetRoot, 'candidates-alpha', `conversation-${id}.png`)) }))),
      },
    ]);
    await device.launch();
    const panel = await device.panelWindow();
    await panel.setViewportSize({ width: 1180, height: 960 });
    const sections = roles.map((role) => `<section>
      <div class="metadata"><div><h2>${role.finalName}</h2><p><strong>Intended surface:</strong> ${role.surface}</p><p><strong>Runtime display:</strong> ${role.size}×${role.size} CSS px · compact ${role.compactSize}×${role.compactSize} CSS px</p><p><strong>Selected:</strong> ${role.selected} · <strong>SHA-256:</strong> ${role.sha}</p></div><img class="final-large" src="${role.final}" alt="" /></div>
      <div class="candidates">${role.candidates.map((candidate) => `<figure class="${candidate.id === role.selected ? 'selected' : ''}"><img src="${candidate.src}" alt="" /><figcaption>${candidate.id}${candidate.id === role.selected ? ' · SELECTED' : ''}</figcaption></figure>`).join('')}</div>
      <div class="previews"><div class="paper"><span>Notebook paper · actual ${role.size}px</span><img src="${role.final}" alt="" style="width:${role.size}px;height:${role.size}px" /></div><div class="dark"><span>Dark shell · actual ${role.size}px</span><img src="${role.final}" alt="" style="width:${role.size}px;height:${role.size}px" /></div><div class="paper"><span>Compact · actual ${role.compactSize}px</span><img src="${role.final}" alt="" style="width:${role.compactSize}px;height:${role.compactSize}px" /></div></div>
    </section>`).join('');
    await panel.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;padding:30px;background:#151020;color:#2d2035;font-family:Segoe UI,Arial,sans-serif}main{display:grid;gap:22px;max-width:1120px;margin:auto}header{color:#fff}h1{margin:0 0 6px;font-size:28px}header p{margin:0;color:#cfc3dc}section{background:#fbf1d9;border:1px solid #d7c6a4;border-radius:16px;padding:20px;display:grid;gap:16px}.metadata{display:flex;justify-content:space-between;gap:20px}.metadata h2{margin:0 0 8px;font-size:22px}.metadata p{margin:3px 0}.final-large{width:92px;height:92px;object-fit:contain}.candidates{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;padding:8px;border:2px solid transparent;border-radius:12px;background:#fffaf0;text-align:center}figure.selected{border-color:#8055a8;box-shadow:0 0 0 3px #e7d9f2}figure img{width:100px;height:100px;object-fit:contain}figcaption{font-weight:700;font-size:12px}.previews{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.previews>div{min-height:84px;border-radius:10px;padding:10px;display:flex;align-items:center;justify-content:space-between;gap:10px}.paper{background:#fffaf0;border:1px solid #dacdae}.dark{background:#21182b;color:#fff}.previews img{object-fit:contain;flex:0 0 auto}.previews span{font-size:12px;font-weight:700}
    </style></head><body><main><header><h1>UI-BETA-001 · Generated Narrative Assets</h1><p>Candidate comparison, final filenames, intended surfaces, and true runtime-size previews.</p></header>${sections}</main></body></html>`);
    await expect(panel.locator('img')).toHaveCount(16);
    await expect.poll(() => panel.locator('img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    const output = path.join(device.artifactDir, 'ui-beta-001', 'assets', 'generated-asset-contact-sheet.png');
    await fs.mkdir(path.dirname(output), { recursive: true });
    await panel.screenshot({ path: output, animations: 'disabled', fullPage: false });
  } catch (cause) {
    scenarioFailure = cause;
  }
  try {
    await device.close();
  } catch (closeFailure) {
    if (!scenarioFailure) throw closeFailure;
  }
  if (scenarioFailure) throw scenarioFailure;
});
