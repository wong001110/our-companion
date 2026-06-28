import path from 'node:path';
import { app, BrowserWindow, globalShortcut, ipcMain, nativeImage, screen, session } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { AppServices } from './services';
import { DiscoveryScheduler } from './discoveryScheduler';
import { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';
import { ElectronIpcBroadcaster } from './adapters/electronIpcBroadcaster';

let companionWindow: BrowserWindow | undefined;
let panelWindow: BrowserWindow | undefined;
let services: AppServices;
let discoveryScheduler: DiscoveryScheduler | undefined;
let discoveryShareOrchestrator: DiscoveryShareOrchestrator | undefined;
let companionClickThrough = true;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const companionListenHotkey = 'CommandOrControl+Shift+Space';

function rendererUrl(mode: 'companion' | 'panel'): string {
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

  window.once('ready-to-show', () => {
    keepCompanionOnTop(window);
    window.show();
  });
  window.on('show', () => keepCompanionOnTop(window));
  window.on('focus', () => keepCompanionOnTop(window));
  window.on('blur', () => keepCompanionOnTop(window));
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  keepCompanionOnTop(window);
  window.loadURL(rendererUrl('companion'));
  companionWindow = window;
  return window;
}

function createPanelWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const panelWidth = Math.min(1180, Math.round(workArea.width * 0.65));
  const panelHeight = Math.min(760, Math.round(workArea.height * 0.85));

  const window = new BrowserWindow({
    width: panelWidth,
    height: panelHeight,
    minWidth: 900,
    minHeight: 620,
    show: true,
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
    'debug:resetData': services.debug.resetData,
    'debug:getFoundationLog': services.debug.getFoundationLog,
    'debug:getEngineSnapshot': services.debug.getEngineSnapshot,
    'workspace:getStatus': services.workspace.getStatus,
    'workspace:getSummary': services.workspace.getSummary,
    'companionNew:create': services.companionNew.create,
    'companionNew:list': services.companionNew.list,
    'companionNew:get': services.companionNew.get,
    'companionNew:update': services.companionNew.update,
    'companionNew:delete': services.companionNew.delete,
    'companionNew:setPrimary': services.companionNew.setPrimary,
    'companionNew:getPrimary': services.companionNew.getPrimary
  } as const;

  for (const [channel, handler] of Object.entries(routes)) {
    ipcMain.handle(channel, async (_event, input) => (handler as (input: unknown) => Promise<unknown>)(input));
  }

  ipcMain.handle('window:openPanel', (_event, input?: { annX?: number; annY?: number }) => {
    if (!panelWindow || panelWindow.isDestroyed()) {
      panelWindow = createPanelWindow();
    }

    if (input?.annX !== undefined && input?.annY !== undefined && companionWindow && !companionWindow.isDestroyed()) {
      const compBounds = companionWindow.getBounds();
      const display = screen.getDisplayMatching(compBounds);
      const workArea = display.workArea;
      const panelWidth = Math.min(panelWindow.getBounds().width || 1180, workArea.width * 0.65);
      const panelHeight = Math.min(panelWindow.getBounds().height || 760, workArea.height * 0.85);

      const annScreenX = compBounds.x + input.annX;
      const spaceRight = workArea.x + workArea.width - annScreenX - 220 - 16;

      let x: number;
      if (spaceRight >= panelWidth) {
        x = annScreenX + 220 + 16;
      } else {
        x = annScreenX - panelWidth - 16;
      }
      x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - panelWidth));

      const y = Math.max(workArea.y, Math.min(compBounds.y + input.annY - 40, workArea.y + workArea.height - panelHeight));

      panelWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(panelWidth), height: Math.round(panelHeight) });
    }

    panelWindow.show();
    panelWindow.focus();
    return true;
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
    characterState: (state) => {
      companionWindow?.webContents.send('character:stateChanged', state);
      panelWindow?.webContents.send('character:stateChanged', state);
    },
    discoveryAnnounce: (payload) => {
      companionWindow?.webContents.send('discovery:announce', payload);
      panelWindow?.webContents.send('discovery:announce', payload);
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
    announcer: discoveryShareOrchestrator,
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

app.whenReady().then(() => {
  try {
    services = new AppServices();
    registerIpc();
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'media');
    });
    registerCompanionHotkey();
    createCompanionWindow();
    createPanelWindow();
    startDiscoveryAutomation();
    registerDisplayListeners();
  } catch (error) {
    console.error('[our-companion] Fatal startup failure.', error);
    createStartupErrorWindow(error);
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createCompanionWindow();
      createPanelWindow();
    }
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    unregisterCompanionHotkey();
    stopDiscoveryAutomation();
    services?.db.close();
    app.quit();
  }
});

app.on('will-quit', () => {
  unregisterCompanionHotkey();
  stopDiscoveryAutomation();
});
