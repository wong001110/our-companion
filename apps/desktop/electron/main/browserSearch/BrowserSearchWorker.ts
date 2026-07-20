import { BrowserWindow, session } from 'electron';
import { createId } from '@our-companion/shared';
import type { BrowserSearchEngineAdapter } from './BrowserSearchEngineAdapter';
import {
  BROWSER_SEARCH_HARD_TIMEOUT_MS,
  BrowserSearchError,
  type BrowserSearchExtractedResult,
} from './browserSearchTypes';

export interface BrowserSearchWorkerRequest {
  adapter: BrowserSearchEngineAdapter;
  searchUrl: URL;
  limit: number;
  timeoutMs?: number;
}

export interface BrowserSearchWorkerResult {
  url: string;
  title: string;
  visibleText: string;
  results: BrowserSearchExtractedResult[];
}

export interface BrowserSearchWorkerDeps {
  createWindow?: (partition: string) => BrowserWindow;
  isAppReady?: () => boolean;
}

function hostAllowed(url: string, allowedHosts: string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function blockedNavigation(url: string): boolean {
  try {
    const parsed = new URL(url);
    return !['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return true;
  }
}

export class BrowserSearchWorker {
  constructor(private readonly deps: BrowserSearchWorkerDeps = {}) {}

  async execute(input: BrowserSearchWorkerRequest): Promise<BrowserSearchWorkerResult> {
    if (this.deps.isAppReady && !this.deps.isAppReady()) {
      throw new BrowserSearchError('browser_search_unavailable', 'Electron app is not ready.');
    }
    const timeoutMs = input.timeoutMs ?? BROWSER_SEARCH_HARD_TIMEOUT_MS;
    const partition = `browser-search-${createId('session')}`;
    const workerSession = session.fromPartition(partition, { cache: false });
    const blockedResourceTypes = new Set(['image', 'media', 'font']);
    const blockedHosts = [/doubleclick\.net/i, /googlesyndication\.com/i, /adservice/i];
    workerSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      if (blockedResourceTypes.has(details.resourceType)) {
        callback({ cancel: true });
        return;
      }
      try {
        const hostname = new URL(details.url).hostname;
        if (blockedHosts.some((pattern) => pattern.test(hostname))) {
          callback({ cancel: true });
          return;
        }
      } catch {
        callback({ cancel: true });
        return;
      }
      callback({});
    });
    workerSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    const worker = this.deps.createWindow?.(partition) ?? new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        javascript: true,
        partition,
      },
    });
    worker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    worker.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    worker.webContents.session.on('will-download', (event) => event.preventDefault());
    const allowedHosts = input.adapter.allowedNavigationHosts;
    const guardNavigation = (event: Electron.Event, url: string) => {
      if (blockedNavigation(url) || !hostAllowed(url, allowedHosts)) {
        event.preventDefault();
      }
    };
    worker.webContents.on('will-navigate', guardNavigation);
    worker.webContents.on('will-redirect', guardNavigation);
    try {
      await worker.loadURL(input.searchUrl.toString(), { timeout: timeoutMs });
      if (worker.webContents.getURL().startsWith('http') && !hostAllowed(worker.webContents.getURL(), allowedHosts)) {
        throw new BrowserSearchError('browser_search_navigation_failed');
      }
      const httpCode = worker.webContents.getURL().length > 0
        ? await worker.webContents.executeJavaScript('document.readyState', true).catch(() => 'complete')
        : 'complete';
      if (!httpCode) throw new BrowserSearchError('browser_search_navigation_failed');
      await input.adapter.waitForResults({ webContents: worker.webContents, timeoutMs });
      const title = await worker.webContents.executeJavaScript('document.title', true).catch(() => '');
      const visibleText = await worker.webContents.executeJavaScript(
        'document.body ? document.body.innerText.slice(0, 12000) : ""',
        true,
      ).catch(() => '');
      const pageUrl = worker.webContents.getURL();
      const challenge = input.adapter.detectChallenge({
        url: pageUrl,
        title: String(title ?? ''),
        visibleText: String(visibleText ?? ''),
      });
      if (challenge) {
        throw new BrowserSearchError('browser_search_challenge');
      }
      const results = await input.adapter.extractResults({
        webContents: worker.webContents,
        limit: input.limit,
      });
      if (!results.length) {
        throw new BrowserSearchError('browser_search_no_results');
      }
      return {
        url: pageUrl,
        title: String(title ?? ''),
        visibleText: String(visibleText ?? ''),
        results,
      };
    } catch (error) {
      if (error instanceof BrowserSearchError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ERR_ABORTED') || message.includes('ERR_BLOCKED')) {
        throw new BrowserSearchError('browser_search_navigation_failed', message);
      }
      if (message.includes('timeout') || message.includes('browser_search_timeout')) {
        throw new BrowserSearchError('browser_search_timeout', message);
      }
      throw new BrowserSearchError('browser_search_unavailable', message);
    } finally {
      worker.webContents.removeAllListeners('will-navigate');
      worker.webContents.removeAllListeners('will-redirect');
      if (!worker.isDestroyed()) worker.destroy();
      await workerSession.clearStorageData().catch(() => undefined);
      await workerSession.clearCache().catch(() => undefined);
    }
  }
}
