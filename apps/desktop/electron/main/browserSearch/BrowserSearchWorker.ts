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

function mapHttpStatus(status: number): BrowserSearchError | null {
  if (status === 429) return new BrowserSearchError('browser_search_rate_limited');
  if (status === 401 || status === 403) return new BrowserSearchError('browser_search_http_blocked');
  if (status >= 500) return new BrowserSearchError('browser_search_navigation_failed');
  return null;
}

async function readPageSnapshot(webContents: Electron.WebContents): Promise<{ url: string; title: string; visibleText: string }> {
  const url = webContents.getURL();
  const title = await webContents.executeJavaScript('document.title', true).catch(() => '');
  const visibleText = await webContents.executeJavaScript(
    'document.body ? document.body.innerText.slice(0, 12000) : ""',
    true,
  ).catch(() => '');
  return {
    url,
    title: String(title ?? ''),
    visibleText: String(visibleText ?? ''),
  };
}

export class BrowserSearchWorker {
  constructor(private readonly deps: BrowserSearchWorkerDeps = {}) {}

  async execute(input: BrowserSearchWorkerRequest): Promise<BrowserSearchWorkerResult> {
    if (this.deps.isAppReady && !this.deps.isAppReady()) {
      throw new BrowserSearchError('browser_search_unavailable');
    }
    const timeoutMs = input.timeoutMs ?? BROWSER_SEARCH_HARD_TIMEOUT_MS;
    const partition = `browser-search-${createId('session')}`;
    const workerSession = session.fromPartition(partition, { cache: false });
    const blockedResourceTypes = new Set(['image', 'media', 'font']);
    const blockedHosts = [/doubleclick\.net/i, /googlesyndication\.com/i, /adservice/i];
    let mainFrameHttpStatus = 0;
    let mainFrameLoadFailure = false;
    let workerDestroyed = false;
    const deadline = Date.now() + timeoutMs;

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

    workerSession.webRequest.onHeadersReceived(
      { urls: ['*://*/*'] },
      (details, callback) => {
        if (details.resourceType === 'mainFrame' && details.responseHeaders) {
          const statusLine = details.statusLine;
          if (statusLine) {
            const match = statusLine.match(/HTTP\/[\d.]+ (\d+)/);
            if (match) mainFrameHttpStatus = parseInt(match[1]!, 10);
          }
        }
        callback({ responseHeaders: details.responseHeaders });
      },
    );

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

    const onDidFailLoad = (_event: Electron.Event, errorCode: number, _errorDescription: string, isMainFrame: boolean) => {
      if (errorCode === -3) return;
      if (isMainFrame) {
        mainFrameLoadFailure = true;
      }
    };
    worker.webContents.on('did-fail-load', onDidFailLoad);

    const onClosed = () => { workerDestroyed = true; };
    worker.on('closed', onClosed);

    try {
      await worker.loadURL(input.searchUrl.toString(), { timeout: timeoutMs });

      if (mainFrameLoadFailure) {
        throw new BrowserSearchError('browser_search_navigation_failed');
      }

      if (workerDestroyed || worker.isDestroyed()) {
        throw new BrowserSearchError('browser_search_destroyed');
      }

      if (mainFrameHttpStatus) {
        const httpError = mapHttpStatus(mainFrameHttpStatus);
        if (httpError) throw httpError;
      }

      while (Date.now() < deadline) {
        if (workerDestroyed || worker.isDestroyed()) {
          throw new BrowserSearchError('browser_search_destroyed');
        }
        if (mainFrameLoadFailure) {
          throw new BrowserSearchError('browser_search_navigation_failed');
        }
        if (mainFrameHttpStatus) {
          const httpError = mapHttpStatus(mainFrameHttpStatus);
          if (httpError) throw httpError;
        }

        const snapshot = await readPageSnapshot(worker.webContents);
        const challenge = input.adapter.detectChallenge(snapshot);
        if (challenge) {
          if (challenge.kind === 'rate_limit' || challenge.kind === 'access_denied') {
            throw new BrowserSearchError('browser_search_rate_limited');
          }
          throw new BrowserSearchError('browser_search_challenge');
        }

        const ready = await worker.webContents.executeJavaScript(
          'Boolean(document.querySelector(".result") || document.querySelector(".msg") || document.body?.innerText?.includes("No results."))',
          true,
        ).catch(() => false);
        if (ready) break;

        await new Promise((r) => setTimeout(r, 150));
      }

      if (Date.now() >= deadline && !workerDestroyed && !worker.isDestroyed()) {
        throw new BrowserSearchError('browser_search_timeout');
      }

      if (workerDestroyed || worker.isDestroyed()) {
        throw new BrowserSearchError('browser_search_destroyed');
      }

      const snapshot = await readPageSnapshot(worker.webContents);
      const challenge = input.adapter.detectChallenge(snapshot);
      if (challenge) {
        if (challenge.kind === 'rate_limit' || challenge.kind === 'access_denied') {
          throw new BrowserSearchError('browser_search_rate_limited');
        }
        throw new BrowserSearchError('browser_search_challenge');
      }

      let results: BrowserSearchExtractedResult[];
      try {
        results = await input.adapter.extractResults({
          webContents: worker.webContents,
          limit: input.limit,
        });
      } catch {
        throw new BrowserSearchError('browser_search_parse_failed');
      }

      if (!results.length) {
        throw new BrowserSearchError('browser_search_no_results');
      }
      return {
        url: snapshot.url,
        title: snapshot.title,
        visibleText: snapshot.visibleText,
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
      worker.webContents.removeListener('will-navigate', guardNavigation);
      worker.webContents.removeListener('will-redirect', guardNavigation);
      worker.webContents.removeListener('did-fail-load', onDidFailLoad);
      worker.removeListener('closed', onClosed);
      if (!worker.isDestroyed()) worker.destroy();
      await workerSession.clearStorageData().catch(() => undefined);
      await workerSession.clearCache().catch(() => undefined);
    }
  }
}
