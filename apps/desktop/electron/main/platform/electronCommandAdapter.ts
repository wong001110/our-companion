import { execFile } from 'node:child_process';
import { shell } from 'electron';
import type { ToolAdapters } from '@our-companion/tool-engine';

type ExecuteFile = (file: string, args: string[]) => Promise<void>;

const executeFile: ExecuteFile = (file, args) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide: true }, (error) => {
    if (error) reject(error);
    else resolve();
  });
});

export function searchUrl(query: string, target?: string): string {
  const encoded = encodeURIComponent(query);
  if (target === 'youtube') return `https://www.youtube.com/results?search_query=${encoded}`;
  if (target === 'github') return `https://github.com/search?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

const APP_ALIASES: Record<string, {
  darwin: string;
  win32?: string;
  linux?: string;
}> = {
  brave: { darwin: 'Brave Browser', win32: 'brave.exe', linux: 'brave-browser' },
  chrome: { darwin: 'Google Chrome', win32: 'chrome.exe', linux: 'google-chrome' },
  chromium: { darwin: 'Chromium', win32: 'chromium.exe', linux: 'chromium' },
  edge: { darwin: 'Microsoft Edge', win32: 'msedge.exe', linux: 'microsoft-edge' },
  firefox: { darwin: 'Firefox', win32: 'firefox.exe', linux: 'firefox' },
  safari: { darwin: 'Safari' },
  notepad: { darwin: 'TextEdit', win32: 'notepad.exe', linux: 'gedit' },
  calculator: { darwin: 'Calculator', win32: 'calc.exe', linux: 'gnome-calculator' },
  vscode: { darwin: 'Visual Studio Code', win32: 'code.cmd', linux: 'code' },
};

export async function openKnownApp(
  appName: string,
  options: { platform?: NodeJS.Platform; execute?: ExecuteFile } = {},
): Promise<{ appName: string; started: true }> {
  const platform = options.platform ?? process.platform;
  const alias = APP_ALIASES[appName.trim().toLowerCase()];
  if (!alias) throw new Error(`App is not in the approved application allowlist: ${appName}`);
  const executable = alias[platform as keyof typeof alias];
  if (!executable) throw new Error(`App is unavailable on ${platform}: ${appName}`);
  const run = options.execute ?? executeFile;
  if (platform === 'darwin') await run('/usr/bin/open', ['-a', executable]);
  else await run(executable, []);
  return { appName, started: true };
}

function browserNavigationAppleScript(action: 'go_back' | 'go_forward' | 'reload'): string {
  const key = action === 'go_back' ? '[' : action === 'go_forward' ? ']' : 'r';
  return [
    'set browserNames to {"Brave Browser", "Google Chrome", "Microsoft Edge", "Chromium", "Safari", "Firefox"}',
    'tell application "System Events"',
    'repeat with browserName in browserNames',
    'if exists process browserName then',
    'tell process browserName',
    'set frontmost to true',
    `keystroke "${key}" using command down`,
    'end tell',
    'return browserName as text',
    'end if',
    'end repeat',
    'error "No supported browser is running."',
    'end tell',
  ].join('\n');
}

export async function performBrowserNavigation(
  action: string,
  url?: string,
  options: {
    platform?: NodeJS.Platform;
    execute?: ExecuteFile;
    openExternal?: (target: string) => Promise<unknown>;
  } = {},
): Promise<{ action: string; handledBy: string }> {
  if (action === 'open_tab') {
    if (!url) throw new Error('A validated URL is required to open a tab.');
    await (options.openExternal ?? ((target) => shell.openExternal(target)))(url);
    return { action, handledBy: 'electron_shell' };
  }
  if (!['go_back', 'go_forward', 'reload'].includes(action)) {
    throw new Error(`Unsupported browser navigation action: ${action}`);
  }
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') {
    throw new Error(`Browser navigation is unavailable on ${platform}.`);
  }
  await (options.execute ?? executeFile)(
    '/usr/bin/osascript',
    ['-e', browserNavigationAppleScript(action as 'go_back' | 'go_forward' | 'reload')],
  );
  return { action, handledBy: 'macos_accessibility' };
}

export function createElectronToolAdapters(): ToolAdapters {
  return {
    openUrl: async (url) => shell.openExternal(url),
    openApp: async (appName) => openKnownApp(appName),
    searchWeb: async (query, target) => shell.openExternal(searchUrl(query, target)),
    browserNavigation: async (action, url) => performBrowserNavigation(action, url),
  };
}
