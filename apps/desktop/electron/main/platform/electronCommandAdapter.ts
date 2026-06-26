import { spawn } from 'node:child_process';
import { shell } from 'electron';
import type { ToolAdapters } from '@our-companion/tool-engine';

export function searchUrl(query: string, target?: string): string {
  const encoded = encodeURIComponent(query);
  if (target === 'youtube') return `https://www.youtube.com/results?search_query=${encoded}`;
  if (target === 'github') return `https://github.com/search?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

export function openKnownApp(appName: string): Promise<{ appName: string; started: boolean }> {
  const allowedApps: Record<string, string> = {
    chrome: 'chrome',
    chromium: 'chromium',
    edge: 'msedge',
    firefox: 'firefox',
    notepad: 'notepad',
    calculator: 'calc',
    vscode: 'code'
  };
  const executable = allowedApps[appName.toLowerCase()];
  if (!executable) throw new Error(`App is not in the v1 allowlist: ${appName}`);

  const child = spawn(executable, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  return Promise.resolve({ appName, started: true });
}

export function createElectronToolAdapters(): ToolAdapters {
  return {
    openUrl: async (url) => shell.openExternal(url),
    openApp: async (appName) => openKnownApp(appName),
    searchWeb: async (query, target) => shell.openExternal(searchUrl(query, target)),
    browserNavigation: async (action, url) => {
      if (action === 'open_tab' && url) return shell.openExternal(url);
      return { action, handledBy: 'browser_navigation_stub' };
    }
  };
}
