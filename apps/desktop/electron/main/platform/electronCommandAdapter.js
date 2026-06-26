import { spawn } from 'node:child_process';
import { shell } from 'electron';
export function searchUrl(query, target) {
    const encoded = encodeURIComponent(query);
    if (target === 'youtube')
        return `https://www.youtube.com/results?search_query=${encoded}`;
    if (target === 'github')
        return `https://github.com/search?q=${encoded}`;
    return `https://www.google.com/search?q=${encoded}`;
}
export function openKnownApp(appName) {
    const allowedApps = {
        chrome: 'chrome',
        chromium: 'chromium',
        edge: 'msedge',
        firefox: 'firefox',
        notepad: 'notepad',
        calculator: 'calc',
        vscode: 'code'
    };
    const executable = allowedApps[appName.toLowerCase()];
    if (!executable)
        throw new Error(`App is not in the v1 allowlist: ${appName}`);
    const child = spawn(executable, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    });
    child.unref();
    return Promise.resolve({ appName, started: true });
}
export function createElectronToolAdapters() {
    return {
        openUrl: async (url) => shell.openExternal(url),
        openApp: async (appName) => openKnownApp(appName),
        searchWeb: async (query, target) => shell.openExternal(searchUrl(query, target)),
        browserNavigation: async (action, url) => {
            if (action === 'open_tab' && url)
                return shell.openExternal(url);
            return { action, handledBy: 'browser_navigation_stub' };
        }
    };
}
