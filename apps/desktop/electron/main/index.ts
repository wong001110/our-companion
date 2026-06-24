import path from 'node:path';
import { app, BrowserWindow, globalShortcut, ipcMain, nativeImage, screen } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { AppServices } from './services';

let companionWindow: BrowserWindow | undefined;
let panelWindow: BrowserWindow | undefined;
let services: AppServices;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const companionListenHotkey = 'CommandOrControl+Shift+Space';
const companionWindowSize = {
  width: 440,
  height: 390
};

function rendererUrl(mode: 'companion' | 'panel'): string {
  if (isDev) return `${process.env.VITE_DEV_SERVER_URL}?mode=${mode}`;
  return `file://${path.join(app.getAppPath(), 'dist/renderer/index.html')}?mode=${mode}`;
}

function preloadPath(): string {
  return path.join(app.getAppPath(), 'dist/electron/preload/index.cjs');
}

function createCompanionWindow(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const window = new BrowserWindow({
    width: companionWindowSize.width,
    height: companionWindowSize.height,
    x: screenWidth - companionWindowSize.width - 24,
    y: screenHeight - companionWindowSize.height - 24,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    icon: nativeImage.createEmpty(),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

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
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    show: true,
    title: 'Our Companion',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
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
    'ai:getSettings': services.ai.getSettings,
    'ai:updateSettings': services.ai.updateSettings,
    'ai:chat': services.ai.chat,
    'ai:generateDiscoveryReason': services.ai.generateDiscoveryReason,
    'ai:summarizeMemory': services.ai.summarizeMemory,
    'speech:getStatus': services.speech.getStatus,
    'speech:transcribe': services.speech.transcribe,
    'companion:turn': services.companion.turn
  } as const;

  for (const [channel, handler] of Object.entries(routes)) {
    ipcMain.handle(channel, async (_event, input) => handler(input));
  }

  ipcMain.handle('window:openPanel', () => {
    const window = panelWindow ?? createPanelWindow();
    window.show();
    window.focus();
    return true;
  });

  ipcMain.handle('window:getBounds', (event) => getSenderWindow(event).getBounds());
  ipcMain.handle('window:getWorkArea', (event) => getWorkAreaForWindow(getSenderWindow(event)));
  ipcMain.handle('window:moveTo', (event, input: { x: number; y: number }) => {
    const window = getSenderWindow(event);
    const bounds = window.getBounds();
    const size = window === companionWindow ? companionWindowSize : bounds;
    const workArea = getWorkAreaForWindow(window);
    const nextX = clamp(Math.round(input.x), workArea.x, workArea.x + workArea.width - size.width);
    const nextY = clamp(Math.round(input.y), workArea.y, workArea.y + workArea.height - size.height);
    if (window === companionWindow) {
      window.setBounds({ x: nextX, y: nextY, ...companionWindowSize }, false);
      keepCompanionOnTop(window);
    } else {
      window.setPosition(nextX, nextY, false);
    }
    return window.getBounds();
  });
  ipcMain.handle('window:setMousePassthrough', (event, input: { passthrough: boolean }) => {
    const window = getSenderWindow(event);
    window.setIgnoreMouseEvents(input.passthrough, { forward: true });
    return input.passthrough;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

app.whenReady().then(() => {
  try {
    services = new AppServices();
    registerIpc();
    registerCompanionHotkey();
    createCompanionWindow();
    createPanelWindow();
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
    services?.db.close();
    app.quit();
  }
});

app.on('will-quit', () => {
  unregisterCompanionHotkey();
});
