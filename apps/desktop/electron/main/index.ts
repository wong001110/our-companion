import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, nativeImage, protocol, screen, session } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { createId, isPanelTab, nowIso, type CompanionCommand, type DiscoveryAnnouncePayload } from '@our-companion/shared';
import { loadEnv } from './env';
import { AppServices } from './services';
import { DiscoveryScheduler } from './discoveryScheduler';
import { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';
import { ElectronIpcBroadcaster } from './adapters/electronIpcBroadcaster';
import { handleCompanionProtocolRequest } from './platform/companionProtocol';
import { handleNetworkAssetProtocolRequest } from './platform/networkAssetProtocol';
import { OnboardingCompletionCoordinator } from './platform/onboardingCompletion';
import { createOnboardingCompanionWindowAdapter, invalidateFailedCompanionWindow } from './platform/onboardingCompanionWindow';
import { isSmokeTestRuntime, smokeInstanceRole, smokeUserDataOverride, validateSmokeWorkArea, type SmokeWorkArea } from './platform/smokeRuntime';

// Both asset schemes are consumed by renderer <img> elements and fetch().
// Register them before Electron is ready so they retain normal URL semantics.
protocol.registerSchemesAsPrivileged([
  { scheme: 'companion', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'companion-network', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const userDataOverride = smokeUserDataOverride();
if (userDataOverride) app.setPath('userData', userDataOverride);

function registerCompanionProtocol(): void {
  protocol.handle('companion', (request) => {
    return handleCompanionProtocolRequest(request.url, {
      userDataDir: app.getPath('userData'),
      companionExists: (id) => Boolean(services.db.getCompanion(id)),
    });
  });
  protocol.handle('companion-network', (request) => {
    return handleNetworkAssetProtocolRequest(request.url, (assetPackId, relativePath) =>
      services.visualVisits.readVerifiedCachedAsset(assetPackId, relativePath),
    );
  });
}

let companionWindow: BrowserWindow | undefined;
let panelWindow: BrowserWindow | undefined;
let creationWindow: BrowserWindow | undefined;
let services: AppServices;
let onboardingCompletion: OnboardingCompletionCoordinator;
let discoveryScheduler: DiscoveryScheduler | undefined;
let discoveryShareOrchestrator: DiscoveryShareOrchestrator | undefined;
let companionClickThrough = true;
let smokeVisualRuntime: { sessionId: string; animationName: string; x: number; y: number } | undefined;
let smokeVisualAnimations: { sessionId: string; values: string[] } | undefined;
let smokeWorkArea: SmokeWorkArea | undefined;
type UiBetaSmokeFixture = {
  status: Record<string, unknown>;
  friends?: unknown[];
  incomingRequests?: unknown[];
  outgoingRequests?: unknown[];
  blockedUsers?: unknown[];
  presence?: unknown[];
  incomingInvitations?: unknown[];
  outgoingInvitations?: unknown[];
  sessions?: unknown[];
  publication?: Record<string, unknown>;
  localCompanions?: unknown[];
  failures?: string[];
  publishAction?: 'uploading' | 'verifying' | 'failed' | 'success';
  historyMode?: 'ready' | 'loading' | 'failed';
  chatSendFails?: boolean;
};
let smokeUiBetaFixture: UiBetaSmokeFixture | undefined;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const companionListenHotkey = 'CommandOrControl+Shift+Space';

function rendererUrl(mode: 'companion' | 'panel' | 'creation'): string {
  if (isDev) return `${process.env.VITE_DEV_SERVER_URL}?mode=${mode}`;
  return `file://${path.join(app.getAppPath(), 'dist/renderer/index.html')}?mode=${mode}`;
}

function preloadPath(): string {
  return path.join(app.getAppPath(), 'dist/electron/preload/index.cjs');
}

function createCompanionWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  const window = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    icon: nativeImage.createEmpty(),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.setIgnoreMouseEvents(true, { forward: true });

  window.on('show', () => keepCompanionOnTop(window));
  window.on('focus', () => keepCompanionOnTop(window));
  window.on('blur', () => keepCompanionOnTop(window));
  window.once('ready-to-show', () => {
    window.show();
    keepCompanionOnTop(window);
  });
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.once('closed', () => {
    if (companionWindow === window) companionWindow = undefined;
  });
  window.loadURL(rendererUrl('companion'));
  companionWindow = window;
  return window;
}

function createPanelWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const panelWidth = Math.max(760, Math.min(1180, Math.round(workArea.width * 0.65)));
  const panelHeight = Math.max(580, Math.min(760, Math.round(workArea.height * 0.85)));

  const window = new BrowserWindow({
    width: panelWidth,
    height: panelHeight,
    minWidth: 760,
    minHeight: 580,
    show: false,
    title: 'Our Companion',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.on('close', (event) => {
    event.preventDefault();
    window.hide();
  });

  window.loadURL(rendererUrl('panel'));
  panelWindow = window;
  return window;
}

function ensureCompanionWindow(): BrowserWindow {
  if (!companionWindow || companionWindow.isDestroyed()) {
    return createCompanionWindow();
  }
  return companionWindow;
}

function invalidateCompanionWindow(window: BrowserWindow, reason: string): void {
  const invalidated = invalidateFailedCompanionWindow(
    window,
    () => companionWindow === window,
    () => { companionWindow = undefined; },
    (error) => console.error('[our-companion] Failed to destroy unavailable Companion Window.', error)
  );
  if (invalidated) console.error(`[our-companion] Invalidated Companion Window after onboarding failure: ${reason}.`);
}

function ensurePanelWindow(): BrowserWindow {
  if (!panelWindow || panelWindow.isDestroyed()) {
    return createPanelWindow();
  }
  return panelWindow;
}

function createCreationWindow(): BrowserWindow {
  if (creationWindow && !creationWindow.isDestroyed()) {
    creationWindow.focus();
    return creationWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const windowWidth = Math.min(560, Math.max(480, workArea.width - 48));
  const windowHeight = Math.min(680, Math.max(560, workArea.height - 48));

  const window = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.round(workArea.x + (workArea.width - windowWidth) / 2),
    y: Math.round(workArea.y + (workArea.height - windowHeight) / 2),
    frame: false,
    minWidth: 480,
    minHeight: 560,
    resizable: true,
    show: false,
    title: 'Create Companion',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.loadURL(rendererUrl('creation'));
  window.once('ready-to-show', () => window.show());
  creationWindow = window;
  return window;
}

function createStartupErrorWindow(error: unknown): BrowserWindow {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  const window = new BrowserWindow({
    width: 760,
    height: 420,
    title: 'Our Companion startup error',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Our Companion startup error</title>
        <style>
          body {
            margin: 0;
            padding: 28px;
            font-family: Segoe UI, Arial, sans-serif;
            color: #f8edf5;
            background: #181521;
          }
          h1 { margin-top: 0; font-size: 22px; }
          p { color: #d8d1df; line-height: 1.5; }
          pre {
            white-space: pre-wrap;
            overflow: auto;
            max-height: 220px;
            padding: 14px;
            border: 1px solid rgba(248, 237, 245, 0.16);
            border-radius: 8px;
            color: #f8dccf;
            background: rgba(0, 0, 0, 0.22);
          }
        </style>
      </head>
      <body>
        <h1>Our Companion could not start</h1>
        <p>The app hit a startup error before the companion window could open.</p>
        <pre>${escapeHtml(message)}</pre>
      </body>
    </html>
  `;
  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return window;
}

function createOnboardingCompletionCoordinator(): OnboardingCompletionCoordinator {
  return new OnboardingCompletionCoordinator({
    getPrimaryCompanion: () => services.db.getPrimaryCompanion(),
    closeCreationWindow: () => {
      if (creationWindow && !creationWindow.isDestroyed()) {
        creationWindow.close();
        creationWindow = undefined;
      }
    },
    ensureCompanionWindow: () => {
      const window = ensureCompanionWindow();
      return createOnboardingCompanionWindowAdapter(
        window,
        () => keepCompanionOnTop(window),
        (reason) => invalidateCompanionWindow(window, reason)
      );
    },
    ensurePanelWindow: () => { ensurePanelWindow(); },
    startRuntimeIfReady: () => services.startRuntimeIfReady(),
    startDiscoveryAutomation,
    reportRecovery: (reason) => {
      const window = createCreationWindow();
      if (!window.isDestroyed()) window.webContents.send('creation:startupFailed', reason);
    },
    logError: (message, error) => {
      if (error === undefined) {
        console.error(message);
        return;
      }
      console.error(message, error);
    },
  });
}

function scheduleOnboardingCompletion(companion: { id: string; isPrimary?: boolean }): boolean {
  if (!companion.isPrimary) return false;
  const primary = services.db.getPrimaryCompanion();
  if (!primary || primary.id !== companion.id) return false;
  return onboardingCompletion.request(primary);
}

function registerIpc(): void {
  const routes = {
    'character:getState': services.character.getState,
    'character:getActive': services.character.getActive,
    'character:getBehaviorSettings': services.character.getBehaviorSettings,
    'character:updateBehaviorSettings': services.character.updateBehaviorSettings,
    'character:setPrimary': services.character.setPrimary,
    'character:updatePosition': services.character.updatePosition,
    'character:triggerBehavior': services.character.triggerBehavior,
    'discovery:getFeed': services.discovery.getFeed,
    'discovery:refresh': services.discovery.refresh,
    'discovery:markInterested': services.discovery.markInterested,
    'discovery:markNotInterested': services.discovery.markNotInterested,
    'discovery:addToJourney': services.discovery.addToJourney,
    'discovery:generateNow': services.discovery.generateNow,
    'discovery:shareNext': services.discovery.shareNext,
    'discovery:resetStatuses': services.discovery.resetStatuses,
    'discovery:countUnannounced': services.discovery.countUnannounced,
    'discovery:markSharedAsUnannounced': services.discovery.markSharedAsUnannounced,
    'discovery:clearPool': services.discovery.clearPool,
    'discovery:simulateCanAnnounceDisabled': services.discovery.simulateCanAnnounceDisabled,
    'discovery:simulateInterruptEnabled': services.discovery.simulateInterruptEnabled,
    'discovery:clearSimulation': services.discovery.clearSimulation,
    'discovery:getSimulationState': services.discovery.getSimulationState,
    'autonomy:startExploration': services.autonomy.startExploration,
    'autonomy:getCurrentCycle': services.autonomy.getCurrentCycle,
    'autonomy:getCycleHistory': services.autonomy.getCycleHistory,
    'autonomy:submitFeedback': services.autonomy.submitFeedback,
    'memory:createNode': services.memory.createNode,
    'memory:getNode': services.memory.getNode,
    'memory:updateNode': services.memory.updateNode,
    'memory:deleteNode': services.memory.deleteNode,
    'memory:createEdge': services.memory.createEdge,
    'memory:getGraph': services.memory.getGraph,
    'memory:search': services.memory.search,
    'journey:create': services.journey.create,
    'journey:getActive': services.journey.getActive,
    'journey:getTimeline': services.journey.getTimeline,
    'journey:addMilestone': services.journey.addMilestone,
    'diary:getEntries': services.diary.getEntries,
    'diary:generateDaily': services.diary.generateDaily,
    'tool:preview': services.tool.preview,
    'tool:execute': services.tool.execute,
    'action:plan': services.action.plan,
    'action:executePlan': services.action.executePlan,
    'action:getPermissions': services.action.getPermissions,
    'action:updatePermissions': services.action.updatePermissions,
    'ai:getSettings': services.ai.getSettings,
    'ai:updateSettings': services.ai.updateSettings,
    'ai:chat': services.ai.chat,
    'ai:generateDiscoveryReason': services.ai.generateDiscoveryReason,
    'ai:summarizeMemory': services.ai.summarizeMemory,
    'ai:getDebugLog': services.ai.getDebugLog,
    'speech:getStatus': services.speech.getStatus,
    'speech:getSettings': services.speech.getSettings,
    'speech:updateSettings': services.speech.updateSettings,
    'speech:transcribe': services.speech.transcribe,
    'companion:turn': services.companion.turn,
    'companion:getHistory': services.companion.getHistory,
    'companion:appendMessage': services.companion.appendMessage,
    'companion:clearHistory': services.companion.clearHistory,
    'companion:reportSessionPhase': services.companion.reportSessionPhase,
    'companion:reportDragging': services.companion.reportDragging,
    'companion:getAttentionMode': services.companion.getAttentionMode,
    'companion:setAttentionMode': services.companion.setAttentionMode,
    'companion:listPendingActions': services.companion.listPendingActions,
    'companion:cancelPendingAction': services.companion.cancelPendingAction,
    'companion:getActiveCommand': services.companion.getActiveCommand,
    'companion:reportCommandAck': services.companion.reportCommandAck,
    'debug:resetData': services.debug.resetData,
    'debug:getFoundationLog': services.debug.getFoundationLog,
    'debug:getEngineSnapshot': services.debug.getEngineSnapshot,
    'workspace:getStatus': services.workspace.getStatus,
    'workspace:getSummary': services.workspace.getSummary,
    'user:getProfile': services.user.getProfile,
    'user:register': services.user.register,
    'user:login': services.user.login,
    'user:logout': services.user.logout,
    'user:getMode': services.user.getMode,
    'user:setMode': services.user.setMode,
    'network:getStatus': services.network.getStatus,
    'network:configureServer': services.network.configureServer,
    'network:register': services.network.register,
    'network:login': services.network.login,
    'network:logout': services.network.logout,
    'network:enableOnlineMode': services.network.enableOnlineMode,
    'network:disableOnlineMode': services.network.disableOnlineMode,
    'network:retryConnection': services.network.retryConnection,
    'network:friends:lookup': services.network.lookupFriend,
    'network:friends:getAll': services.network.getFriends,
    'network:friends:getIncomingRequests': services.network.getIncomingRequests,
    'network:friends:getOutgoingRequests': services.network.getOutgoingRequests,
    'network:friends:sendRequest': services.network.sendFriendRequest,
    'network:friends:acceptRequest': services.network.acceptFriendRequest,
    'network:friends:rejectRequest': services.network.rejectFriendRequest,
    'network:friends:cancelRequest': services.network.cancelFriendRequest,
    'network:friends:remove': services.network.removeFriend,
    'network:blocks:getAll': services.network.getBlocks,
    'network:blocks:block': services.network.blockUser,
    'network:blocks:unblock': services.network.unblockUser,
    'network:presence:getFriendPresence': services.network.getFriendPresence,
    'network:presence:sendActivity': services.network.sendPresenceActivity,
    'network:companions:getMine': services.publicCompanions.getMine,
    'network:companions:create': (input: { localCompanionId: string; name: string; publicDescription?: string; publicTags?: string[] }) => services.publicCompanions.create(input),
    'network:companions:update': (input: { companionId: string; profile: { name: string; publicDescription?: string; publicTags?: string[] } }) => services.publicCompanions.update(input.companionId, input.profile),
    'network:companions:activate': services.publicCompanions.activate,
    'network:companions:publish': services.publicCompanions.publish,
    'network:companions:unpublish': services.publicCompanions.unpublish,
    'network:companions:getFriend': services.publicCompanions.getFriendCompanion,
    'network:assets:inspect': (input: { localCompanionId: string; includeVoices?: boolean }) => services.publicCompanions.inspectLocalPack(input),
    'network:assets:publish': (input: { localCompanionId: string; networkCompanionId: string; includeVoices?: boolean }) => services.publicCompanions.publishPack(input),
    'network:assets:cancelPublish': services.publicCompanions.cancelPublish,
    'network:assets:cancelDownload': services.publicCompanions.cancelDownload,
    'network:assets:getPublishStatus': services.publicCompanions.getPublishStatus,
    'network:assets:download': (input: { assetPackId: string; networkCompanionId: string }) => services.publicCompanions.downloadPack(input),
    'network:assets:getCached': (assetPackId: string) => services.publicCompanions.getCachedPack(assetPackId),
    'network:assets:clearUnusedCache': () => services.publicCompanions.clearUnusedCache(),
    'network:visits:invitations:list': (input?: { direction?: 'incoming' | 'outgoing'; status?: import('@our-companion/shared').VisitInvitationStatus }) => services.visits.listInvitations(input),
    'network:visits:invitations:send': (hostUserId: string) => services.visits.sendInvitation(hostUserId),
    'network:visits:invitations:accept': (invitationId: string) => services.visits.acceptInvitation(invitationId),
    'network:visits:invitations:decline': (invitationId: string) => services.visits.declineInvitation(invitationId),
    'network:visits:invitations:cancel': (invitationId: string) => services.visits.cancelInvitation(invitationId),
    'network:visits:sessions:list': () => services.visits.listSessions(),
    'network:visits:sessions:get': (sessionId: string) => services.visits.getSession(sessionId),
    'network:visits:sessions:prepare': (sessionId: string) => services.visits.prepare(sessionId),
    'network:visits:sessions:start': (sessionId: string) => services.visits.start(sessionId),
    'network:visits:sessions:end': (sessionId: string) => services.visits.end(sessionId),
    'network:visits:visual:getState': () => services.visualVisits.getState(),
    'network:visits:visual:reportRendererFailure': (sessionId: string) => services.visualVisits.reportRendererFailure(sessionId),
    'companionNew:create': services.companionNew.create,
    'companionNew:analyzePersonality': isSmokeTestRuntime()
      ? async (description: string) => ({
          analysisId: 'personality_analysis_ui_fixture',
          description,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          personality: {
            energy: 58, curiosity: 82, sociability: 46, diligence: 72,
            playfulness: 64, confidence: 55, calmness: 76, shyness: 32,
          },
        })
      : services.companionNew.analyzePersonality,
    'companionNew:list': services.companionNew.list,
    'companionNew:get': services.companionNew.get,
    'companionNew:update': services.companionNew.update,
    'companionNew:delete': services.companionNew.delete,
    'companionNew:setPrimary': services.companionNew.setPrimary,
    'companionNew:getPrimary': services.companionNew.getPrimary,
    'companionNew:getAssetRoot': services.companionNew.getAssetRoot,
    'companionNew:uploadAsset': services.companionNew.uploadAsset,
    'companionNew:listAssets': services.companionNew.listAssets,
    'companionNew:deleteAsset': services.companionNew.deleteAsset,
    'companionNew:readAsset': services.companionNew.readAsset
  } as const;

  for (const [channel, handler] of Object.entries(routes)) {
    ipcMain.handle(channel, async (_event, input) => {
      const uiBetaFixtureResult = resolveUiBetaSmokeRoute(channel, input);
      if (uiBetaFixtureResult.handled) return uiBetaFixtureResult.result;
      const onboardingAllowed = channel.startsWith('companionNew:') || channel === 'ai:getSettings' ||
        channel === 'ai:updateSettings' || channel.startsWith('user:') || channel.startsWith('network:') || channel.startsWith('workspace:');
      if (!onboardingAllowed && !services.hasActiveCompanion()) {
        throw new Error('NO_ACTIVE_COMPANION: No active Companion. Complete Companion creation first.');
      }
      const result = await (handler as (input: unknown) => Promise<unknown>)(input);
      if (channel === 'companionNew:create') {
        scheduleOnboardingCompletion(result as { id: string; isPrimary?: boolean });
      }
      return result;
    });
  }

  ipcMain.handle('window:openPanel', (_event, input: unknown) => {
    const panelInput = input && typeof input === 'object'
      ? input as { companionX?: unknown; companionY?: unknown; initialTab?: unknown }
      : undefined;
    if (panelInput?.initialTab !== undefined && !isPanelTab(panelInput.initialTab)) {
      throw new Error('PANEL_TAB_INVALID');
    }
    const initialTab = isPanelTab(panelInput?.initialTab) ? panelInput.initialTab : undefined;
    const companionX = typeof panelInput?.companionX === 'number' ? panelInput.companionX : undefined;
    const companionY = typeof panelInput?.companionY === 'number' ? panelInput.companionY : undefined;
    if (!services.hasActiveCompanion()) {
      createCreationWindow();
      return false;
    }
    const created = !panelWindow || panelWindow.isDestroyed();
    if (created) {
      panelWindow = createPanelWindow();
    }
    const activePanel = panelWindow;
    if (!activePanel) return false;

    if (companionX !== undefined && companionY !== undefined && companionWindow && !companionWindow.isDestroyed()) {
      const compBounds = companionWindow.getBounds();
      const display = screen.getDisplayMatching(compBounds);
      const workArea = display.workArea;
      const panelWidth = Math.min(activePanel.getBounds().width || 1180, workArea.width * 0.65);
      const panelHeight = Math.min(activePanel.getBounds().height || 760, workArea.height * 0.85);

      const companionScreenX = compBounds.x + companionX;
      const spaceRight = workArea.x + workArea.width - companionScreenX - 220 - 16;

      let x: number;
      if (spaceRight >= panelWidth) {
        x = companionScreenX + 220 + 16;
      } else {
        x = companionScreenX - panelWidth - 16;
      }
      x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - panelWidth));

      const y = Math.max(workArea.y, Math.min(compBounds.y + companionY - 40, workArea.y + workArea.height - panelHeight));

      activePanel.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(panelWidth), height: Math.round(panelHeight) });
    }

    activePanel.show();
    activePanel.focus();
    if (initialTab) {
      if (created) activePanel.webContents.once('did-finish-load', () => activePanel.webContents.send('panel:navigate', initialTab));
      else activePanel.webContents.send('panel:navigate', initialTab);
    }
    return true;
  });

  ipcMain.handle('window:showCompanion', () => {
    if (!services.hasActiveCompanion()) {
      createCreationWindow();
      return false;
    }
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.hide();
    }
    const activeCompanionWindow = ensureCompanionWindow();
    activeCompanionWindow.show();
    keepCompanionOnTop(activeCompanionWindow);
    activeCompanionWindow.webContents.send('companion:refresh');
    return true;
  });

  ipcMain.handle('window:openPanelForSwitch', () => {
    if (!services.hasActiveCompanion()) {
      createCreationWindow();
      return false;
    }
    if (companionWindow && !companionWindow.isDestroyed()) {
      companionWindow.hide();
    }
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.hide();
    }
    createCreationWindow();
    return true;
  });

  ipcMain.handle('creation:completed', (_event, companion) => {
    if (!companion) throw new Error('Creation completion requires the persisted primary Companion.');
    return scheduleOnboardingCompletion(companion);
  });

  ipcMain.handle('creation:retryCompletion', () => {
    const primary = services.db.getPrimaryCompanion();
    if (!primary) throw new Error('No persisted primary Companion is available for onboarding retry.');
    return onboardingCompletion.request(primary);
  });

  if (isSmokeTestRuntime()) registerSmokeIpc();

  ipcMain.handle('creation:openWindow', () => {
    if (services.hasActiveCompanion()) {
      services.startRuntimeIfReady();
      ensureCompanionWindow();
      ensurePanelWindow();
      startDiscoveryAutomation();
    } else {
      createCreationWindow();
    }
    return true;
  });

  ipcMain.handle('creation:closeWindow', () => {
    if (creationWindow && !creationWindow.isDestroyed()) {
      creationWindow.close();
      creationWindow = undefined;
    }
    return true;
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
    return true;
  });

  ipcMain.handle('app:exitWithAnimation', () => {
    if (companionWindow && !companionWindow.isDestroyed()) {
      companionWindow.webContents.send('companion:exitAnimation');
    }
    return true;
  });

  ipcMain.handle('dialog:openFiles', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PNG Images', extensions: ['png'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    return result.filePaths.map((filePath) => {
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      return { name: path.basename(filePath), dataUrl: `data:image/png;base64,${base64}` };
    });
  });

  ipcMain.handle('window:getBounds', (event) => getSenderWindow(event).getBounds());
  ipcMain.handle('window:getWorkArea', (event) => getWorkAreaForWindow(getSenderWindow(event)));
  ipcMain.handle('window:setMousePassthrough', (event, input: { passthrough: boolean }) => {
    const window = getSenderWindow(event);
    window.setIgnoreMouseEvents(input.passthrough, { forward: true });
    if (window === companionWindow) {
      companionClickThrough = input.passthrough;
    }
    return input.passthrough;
  });
  ipcMain.handle('companion:getOverlayDebug', () => {
    const bounds = companionWindow && !companionWindow.isDestroyed() ? companionWindow.getBounds() : undefined;
    const display = bounds ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay();
    const workArea = display.workArea;
    return {
      mode: 'workarea-overlay' as const,
      bounds,
      workArea: { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height },
      display: { id: display.id, label: display.label, size: display.size },
      clickThrough: companionClickThrough,
    };
  });
}

function registerSmokeIpc(): void {
  ipcMain.handle('smoke:getState', async () => {
    const status = services.network.getStatusSnapshot();
    const visual = services.visualVisits.getState();
    const sessions = status.account ? await services.visits.listSessions() : [];
    const session = sessions.find((candidate) => candidate.state === 'active') ?? sessions.find((candidate) => ['preparing', 'ready', 'ending'].includes(candidate.state));
    const role = session && status.account ? (session.visitorOwnerUserId === status.account.id ? 'visitor_owner' : session.hostUserId === status.account.id ? 'host' : undefined) : undefined;
    const renderer = visual.visitor && smokeVisualRuntime?.sessionId === visual.visitor.sessionId ? smokeVisualRuntime : undefined;
    return {
      instanceRole: smokeInstanceRole(),
      network: { state: status.state, onlineModeEnabled: status.onlineModeEnabled, accountId: status.account?.id, serverOrigin: status.serverUrl },
      device: { deviceIdHash: services.network.getSmokeDeviceIdHash() },
      ...(session && role ? { visit: { sessionId: session.id, state: session.state, role, visitorOwnerReady: session.visitorOwnerReady, hostReady: session.hostReady } } : {}),
      visual: {
        ownerPresenceMode: visual.ownerPresenceMode,
        ...(visual.visitor ? { visitor: { runtimeId: visual.visitor.runtimeId, sessionId: visual.visitor.sessionId, assetPackId: visual.visitor.assetPackId, animationName: renderer?.animationName ?? visual.visitor.animationName, ...(smokeVisualAnimations?.sessionId === visual.visitor.sessionId ? { observedAnimations: smokeVisualAnimations.values } : {}), x: renderer?.x, y: renderer?.y } } : {}),
        ...(visual.error ? { error: visual.error } : {}),
      },
    };
  });
  ipcMain.handle('smoke:disconnectSocket', () => services.network.disconnectSocketForSmoke());
  ipcMain.handle('smoke:reconcileVisits', async () => { await services.visits.reconcile(); await services.visualVisits.reconcile(); });
  ipcMain.handle('smoke:setOwnerPresenceMode', (_event, mode: unknown) => {
    if (mode !== 'home' && mode !== 'away_visiting') throw new Error('SMOKE_OWNER_PRESENCE_MODE_INVALID');
    services.visualVisits.setOwnerPresenceModeForSmoke(mode);
  });
  ipcMain.handle('smoke:setVisualWorkArea', (_event, input: unknown) => {
    smokeWorkArea = validateSmokeWorkArea(input);
    for (const window of [companionWindow, panelWindow]) if (window && !window.isDestroyed()) window.webContents.send('smoke:visualWorkAreaChanged', smokeWorkArea);
  });
  ipcMain.handle('smoke:clearVisualWorkArea', () => {
    smokeWorkArea = undefined;
    for (const window of [companionWindow, panelWindow]) if (window && !window.isDestroyed()) window.webContents.send('smoke:visualWorkAreaChanged', undefined);
  });
  ipcMain.handle('smoke:reportVisualRuntime', (_event, input: unknown) => {
    const candidate = input as { sessionId?: string; animationName?: string; x?: number; y?: number };
    const visual = services.visualVisits.getState().visitor;
    if (!visual || typeof candidate.sessionId !== 'string' || candidate.sessionId !== visual.sessionId || typeof candidate.animationName !== 'string' || typeof candidate.x !== 'number' || !Number.isFinite(candidate.x) || typeof candidate.y !== 'number' || !Number.isFinite(candidate.y)) {
      throw new Error('SMOKE_VISUAL_RUNTIME_INVALID');
    }
    const sessionId = candidate.sessionId;
    const animationName = candidate.animationName;
    const x = candidate.x;
    const y = candidate.y;
    smokeVisualRuntime = { sessionId, animationName: animationName.slice(0, 80), x: Math.round(x), y: Math.round(y) };
    if (smokeVisualAnimations?.sessionId !== sessionId) smokeVisualAnimations = { sessionId, values: [] };
    if (!smokeVisualAnimations.values.includes(smokeVisualRuntime.animationName)) smokeVisualAnimations.values.push(smokeVisualRuntime.animationName);
  });
  ipcMain.handle('smoke:simulateRendererFailure', () => {
    const visitor = services.visualVisits.getState().visitor;
    if (!visitor) throw new Error('SMOKE_VISUAL_RUNTIME_UNAVAILABLE');
    services.visualVisits.reportRendererFailure(visitor.sessionId);
    smokeVisualRuntime = undefined;
  });
  ipcMain.handle('smoke:bootstrapFixtureCompanion', () => {
    const companion = services.createSmokeFixtureCompanion();
    scheduleOnboardingCompletion(companion);
  });
  ipcMain.handle('smoke:setFriendLookupFixture', (_event, input: unknown) => services.network.setFriendLookupFixtureForSmoke(input));
  ipcMain.handle('smoke:setUiBetaFixture', (_event, input: unknown) => {
    if (!input || typeof input !== 'object' || !('status' in input) || !(input as { status?: unknown }).status || typeof (input as { status?: unknown }).status !== 'object') {
      throw new Error('SMOKE_UI_BETA_FIXTURE_INVALID');
    }
    smokeUiBetaFixture = input as UiBetaSmokeFixture;
    for (const window of [companionWindow, panelWindow]) {
      if (window && !window.isDestroyed()) window.webContents.send('network:statusChanged', smokeUiBetaFixture.status);
    }
  });
  ipcMain.handle('smoke:presentDiscoveryFixture', async (event, input: unknown) => {
    const fixture = input as { order?: unknown; displayHint?: unknown } | undefined;
    if (
      !fixture ||
      (fixture.order !== 'command_payload' && fixture.order !== 'payload_command') ||
      (fixture.displayHint !== undefined && fixture.displayHint !== 'show_soft_hint' && fixture.displayHint !== 'present_discovery')
    ) throw new Error('SMOKE_DISCOVERY_FIXTURE_INVALID');
    const displayHint = fixture.displayHint ?? 'present_discovery';
    const discoveryId = createId('smoke_discovery');
    const title = `Discovery handoff ${fixture.order}`;
    const command: CompanionCommand = {
      id: createId('smoke_command'),
      companionId: services.db.resolveActiveCompanionId(),
      discoveryId,
      decision: {
        id: createId('smoke_decision'),
        action: 'share_discovery',
        priority: 'normal',
        timing: displayHint === 'show_soft_hint' ? 'next_idle' : 'now',
        reason: 'Deterministic smoke-only Discovery presentation fixture.',
        displayHint,
        createdAt: nowIso(),
      },
      issuedAt: nowIso(),
    };
    const payload: DiscoveryAnnouncePayload = {
      discoveryId,
      title,
      message: '',
      cardBody: 'This fixture verifies that command and payload delivery order cannot lose the presentation.',
      whyThisMatters: 'The presentation remains visible and clickable.',
      recommendedAction: 'view',
      tags: ['smoke', 'handoff'],
      source: 'smoke fixture',
      sourceUrl: 'https://example.test/discovery-handoff',
    };
    const sender = event.sender;
    const sendCommand = () => sender.send('companion:command', command);
    const sendPayload = () => sender.send('discovery:announce', payload);
    if (fixture.order === 'command_payload') {
      sendCommand();
      await new Promise((resolve) => setTimeout(resolve, 50));
      sendPayload();
    } else {
      sendPayload();
      await new Promise((resolve) => setTimeout(resolve, 50));
      sendCommand();
    }
    return { discoveryId, title };
  });
}

function resolveUiBetaSmokeRoute(channel: string, input: unknown): { handled: false } | { handled: true; result: unknown } {
  const fixture = smokeUiBetaFixture;
  if (!isSmokeTestRuntime() || !fixture) return { handled: false };
  const failure = (domain: string): void => {
    if (fixture.failures?.includes(domain)) throw new Error(`SMOKE_UI_BETA_${domain.toUpperCase()}_FAILED`);
  };
  const companions = fixture.publication?.companions as Array<Record<string, unknown>> | undefined;
  const firstProfile = companions?.[0];
  const firstPack = (firstProfile?.assetPacks as unknown[] | undefined)?.[0];
  switch (channel) {
    case 'network:getStatus':
    case 'network:retryConnection': return { handled: true, result: fixture.status };
    case 'network:friends:getAll': failure('friends'); return { handled: true, result: fixture.friends ?? [] };
    case 'network:friends:getIncomingRequests': failure('incomingRequests'); return { handled: true, result: fixture.incomingRequests ?? [] };
    case 'network:friends:getOutgoingRequests': failure('outgoingRequests'); return { handled: true, result: fixture.outgoingRequests ?? [] };
    case 'network:blocks:getAll': failure('blockedUsers'); return { handled: true, result: fixture.blockedUsers ?? [] };
    case 'network:presence:getFriendPresence': failure('presence'); return { handled: true, result: fixture.presence ?? [] };
    case 'network:visits:invitations:list': {
      const outgoing = (input as { direction?: string } | undefined)?.direction === 'outgoing';
      failure(outgoing ? 'outgoingInvitations' : 'incomingInvitations');
      return { handled: true, result: outgoing ? fixture.outgoingInvitations ?? [] : fixture.incomingInvitations ?? [] };
    }
    case 'network:visits:sessions:list': failure('sessions'); return { handled: true, result: fixture.sessions ?? [] };
    case 'network:visits:visual:getState': return { handled: true, result: { state: 'idle', ownerPresenceMode: 'present' } };
    case 'network:companions:getMine': failure('publication'); return { handled: true, result: fixture.publication ?? { companions: [] } };
    case 'companionNew:list': return { handled: true, result: fixture.localCompanions ?? [] };
    case 'network:assets:inspect': return { handled: true, result: { totalFiles: 12, totalBytes: 3145728, manifestHash: 'fixture-hash' } };
    case 'network:companions:create': return { handled: true, result: { networkCompanionId: 'network-companion-1' } };
    case 'network:companions:activate':
    case 'network:companions:publish': return { handled: true, result: firstProfile };
    case 'network:assets:getPublishStatus': return { handled: true, result: fixture.publishAction === 'verifying'
      ? { assetPackId: 'pack-1', completedFiles: 12, totalFiles: 12, uploadedBytes: 3145728, totalBytes: 3145728, state: 'verifying' }
      : { assetPackId: 'pack-1', completedFiles: 5, totalFiles: 12, uploadedBytes: 1310720, totalBytes: 3145728, state: 'uploading' } };
    case 'network:assets:publish':
      if (fixture.publishAction === 'failed') throw new Error('ASSET_INTEGRITY_FAILED');
      if (fixture.publishAction === 'uploading' || fixture.publishAction === 'verifying') return { handled: true, result: new Promise(() => undefined) };
      return { handled: true, result: firstPack };
    case 'companion:getHistory':
      if (fixture.historyMode === 'loading') return { handled: true, result: new Promise(() => undefined) };
      if (fixture.historyMode === 'failed') throw new Error('SMOKE_UI_BETA_HISTORY_FAILED');
      return { handled: true, result: [{ id: 'message-1', role: 'assistant', source: 'panel', content: 'I saved a small thought from our last conversation.', status: 'ok', createdAt: '2026-07-17T09:30:00.000Z' }] };
    case 'ai:chat':
      if (fixture.chatSendFails) throw new Error('SMOKE_UI_BETA_CHAT_FAILED');
      return { handled: true, result: { content: 'fixture' } };
    default: return { handled: false };
  }
}

function getSenderWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error('Unable to resolve sender window.');
  return window;
}

function keepCompanionOnTop(window: BrowserWindow): void {
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.moveTop();
}

function getWorkAreaForWindow(window: BrowserWindow): Electron.Rectangle {
  const bounds = window.getBounds();
  return screen.getDisplayMatching(bounds).workArea;
}

function registerCompanionHotkey(): void {
  const registered = globalShortcut.register(companionListenHotkey, () => {
    if (!services.hasActiveCompanion()) {
      createCreationWindow();
      return;
    }
    companionWindow?.webContents.send('companion:toggleListen');
  });
  if (!registered) {
    console.warn(`[our-companion] Failed to register listen hotkey: ${companionListenHotkey}`);
  }
}

function unregisterCompanionHotkey(): void {
  globalShortcut.unregister(companionListenHotkey);
}

function startDiscoveryAutomation(): void {
  if (discoveryScheduler || !services.hasActiveCompanion()) return;
  const broadcaster = new ElectronIpcBroadcaster({
    eventBus: services.eventBus,
    getCompanionWindow: () => companionWindow,
    getPanelWindow: () => panelWindow
  });
  broadcaster.start();

  services.attachAutonomyBroadcasters({
    explorationEvent: (event) => {
      companionWindow?.webContents.send('autonomy:explorationEvent', event);
      panelWindow?.webContents.send('autonomy:explorationEvent', event);
    },
    command: (command) => {
      companionWindow?.webContents.send('companion:command', command);
      panelWindow?.webContents.send('companion:command', command);
    },
    foundationEvent: (event) => {
      companionWindow?.webContents.send('debug:foundationEvent', event);
      panelWindow?.webContents.send('debug:foundationEvent', event);
    }
  });

  discoveryShareOrchestrator = new DiscoveryShareOrchestrator({
    getState: () => services.db.getCharacterState(),
    saveState: (state) => services.db.saveCharacterState(state),
    generateReason: (discovery) => services.ai.generateDiscoveryReason({ discovery }),
    markAnnounced: (id) => services.db.markDiscoveryAnnounced(id),
    canAnnounce: () => services.canAnnounceDiscovery(),
    shouldInterruptShare: () => services.shouldInterruptShare(),
    eventBus: services.eventBus
  });
  services.attachShareOrchestrator(discoveryShareOrchestrator);

  discoveryScheduler = new DiscoveryScheduler({
    refresh: () => services.runDiscoveryRefresh(),
    getDiscoveryScore: () => services.getEffectiveDiscoveryScore(),
    countSharedToday: () => services.db.countSharedToday(),
    getOldestUnannouncedShared: () => Promise.resolve(services.db.getOldestUnannouncedShared()),
    presentationGateway: {
      isBusy: () => services.isDiscoveryPresentationBusy(),
      hasPending: () => services.hasPendingDiscoveryPresentation(),
      requestPresentation: (discovery) => { services.requestDiscoveryPresentation(discovery); },
    },
    runAutonomousCycle: () => services.autonomy.startExploration({ trigger: 'scheduled' }).then(() => undefined),
    countAutonomousCyclesToday: () => services.countAutonomousCyclesToday(),
    canRunAutonomousCycle: () => services.canAnnounceDiscovery()
  });
  discoveryScheduler.start();

  services.onPerformanceListeners.push((script) => {
    companionWindow?.webContents.send('action:performanceStarted', script);
    panelWindow?.webContents.send('action:performanceStarted', script);
  });
}

function stopDiscoveryAutomation(): void {
  discoveryScheduler?.stop();
  discoveryShareOrchestrator?.stop();
  discoveryScheduler = undefined;
  discoveryShareOrchestrator = undefined;
}

function registerDisplayListeners(): void {
  function handleDisplayChange() {
    if (!companionWindow || companionWindow.isDestroyed()) return;
    try {
      const bounds = companionWindow.getBounds();
      const display = screen.getDisplayMatching(bounds);
      const workArea = display.workArea;
      companionWindow.setBounds({
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height,
      });
      companionWindow.webContents.send('companion:displayChanged', {
        workArea: { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height },
        display: { id: display.id, label: display.label, size: display.size },
      });
    } catch {
      // display may have been disconnected
    }
  }

  screen.on('display-added', handleDisplayChange);
  screen.on('display-removed', handleDisplayChange);
  screen.on('display-metrics-changed', handleDisplayChange);
}

app.whenReady().then(async () => {
  try {
    await session.defaultSession.clearCache();
    const env = loadEnv(path.join(app.getAppPath(), '..', '..', '.env'));
    Object.assign(process.env, env);

    const isDevelopment = process.env.NODE_ENV === 'development';
    const isHttpCacheDisabled = process.env.HTTP_CACHE_DISABLED === 'true';

    if (isDevelopment && isHttpCacheDisabled) {
      session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        details.requestHeaders['Pragma'] = 'no-cache';
        details.requestHeaders['Expires'] = '0';
        callback({ requestHeaders: details.requestHeaders });
      });
    }

    services = new AppServices();
  services.attachNetworkStatusBroadcaster((status) => {
      for (const win of [companionWindow, panelWindow]) {
        if (win && !win.isDestroyed()) win.webContents.send('network:statusChanged', status);
      }
    });
    const networkStatus = await services.network.getStatus();
    if (networkStatus.onlineModeEnabled) void services.network.enableOnlineMode();
    onboardingCompletion = createOnboardingCompletionCoordinator();
    registerCompanionProtocol();
    registerIpc();
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'media');
    });
    registerCompanionHotkey();
    if (services.hasActiveCompanion()) {
      services.startRuntimeIfReady();
      ensureCompanionWindow();
      ensurePanelWindow();
      startDiscoveryAutomation();
    } else {
      createCreationWindow();
    }
    registerDisplayListeners();
  } catch (error) {
    console.error('[our-companion] Fatal startup failure.', error);
    createStartupErrorWindow(error);
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (services.hasActiveCompanion()) {
        ensureCompanionWindow();
        ensurePanelWindow();
      } else {
        createCreationWindow();
      }
    }
  });
  services.attachVisualVisitBroadcaster((state) => {
    companionWindow?.webContents.send('network:visits:visualChanged', state);
    panelWindow?.webContents.send('network:visits:visualChanged', state);
  });
});

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let isQuitting = false;

function forceCleanup(): void {
  if (isQuitting) return;
  isQuitting = true;
  unregisterCompanionHotkey();
  stopDiscoveryAutomation();
  for (const win of [companionWindow, panelWindow, creationWindow]) {
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }
  try { services?.db.close(); } catch { /* ignore */ }
  try { services?.network.dispose(); } catch { /* ignore */ }
}

app.on('window-all-closed', () => {
  forceCleanup();
  app.quit();
});

app.on('will-quit', () => {
  forceCleanup();
});

process.on('uncaughtException', (err) => {
  console.error('[our-companion] Uncaught exception:', err);
  forceCleanup();
  process.exit(1);
});

process.on('SIGTERM', () => {
  forceCleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  forceCleanup();
  process.exit(0);
});
