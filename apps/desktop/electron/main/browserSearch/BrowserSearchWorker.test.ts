import { describe, expect, it, vi } from 'vitest';
import { BrowserSearchError } from './browserSearchTypes';
import type { BrowserSearchEngineAdapter } from './BrowserSearchEngineAdapter';

vi.mock('electron', () => {
  const sessionInstance = {
    webRequest: { onBeforeRequest: vi.fn(), onHeadersReceived: vi.fn() },
    setPermissionRequestHandler: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    clearStorageData: vi.fn(async () => {}),
    clearCache: vi.fn(async () => {}),
  };
  return {
    BrowserWindow: vi.fn(() => createMockBrowserWindow()),
    session: { fromPartition: vi.fn(() => sessionInstance) },
  };
});

function createMockBrowserWindow() {
  return {
    webContents: {
      getURL: vi.fn(() => 'https://html.duckduckgo.com/html/?q=test'),
      id: 1,
      executeJavaScript: vi.fn(async (code: string) => {
        if (code.includes('document.title')) return 'Test Page';
        if (code.includes('document.body')) return 'Test content';
        if (code.includes('document.documentElement.outerHTML')) return '<html><body></body></html>';
        if (code.includes('"results"') || code.includes('"no_results"') || code.includes('"loading"')) return 'results';
        return '';
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      session: {
        setPermissionRequestHandler: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
      },
      setWindowOpenHandler: vi.fn(),
    },
    isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
    loadURL: vi.fn(async () => {}),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

const stubAdapter: BrowserSearchEngineAdapter = {
  id: 'stub',
  version: 1,
  allowedNavigationHosts: ['html.duckduckgo.com'],
  buildSearchUrl: (input) => new URL(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`),
  detectResultState: async () => 'results',
  detectChallenge: () => null,
  extractResults: async () => [{ title: 'Result', url: 'https://example.com', snippet: 'test' }],
};

describe('BrowserSearchWorker', () => {

  it('throws when app is not ready', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const worker = new BrowserSearchWorker({ isAppReady: () => false });
    await expect(worker.execute({
      adapter: stubAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
    })).rejects.toMatchObject({ code: 'browser_search_unavailable' });
  });

  it('creates isolated partition per execution', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const partitions: string[] = [];
    const mockWindow = createMockBrowserWindow();
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: (partition) => {
        partitions.push(partition);
        return mockWindow as any;
      },
    });
    await worker.execute({
      adapter: stubAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
    });
    expect(partitions).toHaveLength(1);
    expect(partitions[0]).toMatch(/^browser-search-/);
  });

  it('denies new windows', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const mockWindow = createMockBrowserWindow();
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: () => mockWindow as any,
    });
    await worker.execute({
      adapter: stubAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
    });
    expect(mockWindow.webContents.setWindowOpenHandler).toHaveBeenCalled();
    const handler = mockWindow.webContents.setWindowOpenHandler.mock.calls[0]?.[0];
    expect(handler({})).toEqual({ action: 'deny' });
  });

  it('denies permission requests', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const mockWindow = createMockBrowserWindow();
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: () => mockWindow as any,
    });
    await worker.execute({
      adapter: stubAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
    });
    expect(mockWindow.webContents.session.setPermissionRequestHandler).toHaveBeenCalled();
    const handler = mockWindow.webContents.session.setPermissionRequestHandler.mock.calls[0]?.[0];
    const callback = vi.fn();
    handler({}, 'geolocation', callback);
    expect(callback).toHaveBeenCalledWith(false);
  });

  it('denies downloads', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const mockWindow = createMockBrowserWindow();
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: () => mockWindow as any,
    });
    await worker.execute({
      adapter: stubAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
    });
    expect(mockWindow.webContents.session.on).toHaveBeenCalled();
    const downloadHandler = mockWindow.webContents.session.on.mock.calls.find(
      (call: any[]) => call[0] === 'will-download'
    );
    expect(downloadHandler).toBeDefined();
    const event = { preventDefault: vi.fn() };
    downloadHandler![1](event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('sets up navigation guards', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const mockWindow = createMockBrowserWindow();
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: () => mockWindow as any,
    });
    await worker.execute({
      adapter: stubAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
    });
    expect(mockWindow.webContents.on).toHaveBeenCalled();
    const navCalls = mockWindow.webContents.on.mock.calls.filter(
      (call: any[]) => call[0] === 'will-navigate' || call[0] === 'will-redirect'
    );
    expect(navCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('destroys the worker after success', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const mockWindow = createMockBrowserWindow();
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: () => mockWindow as any,
    });
    await worker.execute({
      adapter: stubAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
    });
    expect(mockWindow.destroy).toHaveBeenCalled();
  });

  it('destroys the worker after failure', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const mockWindow = createMockBrowserWindow();
    const failAdapter: BrowserSearchEngineAdapter = {
      ...stubAdapter,
      extractResults: async () => { throw new Error('extraction failed'); },
    };
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: () => mockWindow as any,
    });
    await worker.execute({
      adapter: failAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
    }).catch(() => {});
    expect(mockWindow.destroy).toHaveBeenCalled();
  });

  it('cleans up all listeners after success', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const mockWindow = createMockBrowserWindow();
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: () => mockWindow as any,
    });
    await worker.execute({
      adapter: stubAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
    });
    expect(mockWindow.webContents.removeListener).toHaveBeenCalled();
    expect(mockWindow.removeListener).toHaveBeenCalled();
    expect(mockWindow.webContents.session.removeListener).toHaveBeenCalled();
  });

  it('cleans up all listeners after failure', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const mockWindow = createMockBrowserWindow();
    const failAdapter: BrowserSearchEngineAdapter = {
      ...stubAdapter,
      extractResults: async () => { throw new Error('extraction failed'); },
    };
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: () => mockWindow as any,
    });
    await worker.execute({
      adapter: failAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
    }).catch(() => {});
    expect(mockWindow.webContents.removeListener).toHaveBeenCalled();
    expect(mockWindow.removeListener).toHaveBeenCalled();
  });

  it('returns no results when adapter returns empty', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const mockWindow = createMockBrowserWindow();
    const emptyAdapter: BrowserSearchEngineAdapter = {
      ...stubAdapter,
      detectResultState: async () => 'no_results',
    };
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: () => mockWindow as any,
    });
    await expect(worker.execute({
      adapter: emptyAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
    })).rejects.toMatchObject({ code: 'browser_search_no_results' });
  });

  it('extraction exception becomes browser_search_parse_failed', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const mockWindow = createMockBrowserWindow();
    const failAdapter: BrowserSearchEngineAdapter = {
      ...stubAdapter,
      extractResults: async () => { throw new DOMException('Selector not found'); },
    };
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: () => mockWindow as any,
    });
    await expect(worker.execute({
      adapter: failAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
    })).rejects.toMatchObject({ code: 'browser_search_parse_failed' });
  });

  it('challenge appearing after initial page load is detected before timeout', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const mockWindow = createMockBrowserWindow();
    mockWindow.webContents.executeJavaScript = vi.fn(async (code: string) => {
      if (code.includes('document.title')) return 'Verify you are human';
      if (code.includes('document.body')) return 'Please complete the CAPTCHA.';
      if (code.includes('"results"') || code.includes('"no_results"') || code.includes('"loading"')) return 'loading';
      return '';
    });
    const challengeAdapter: BrowserSearchEngineAdapter = {
      ...stubAdapter,
      detectResultState: async () => 'loading',
      detectChallenge: ({ title, visibleText }) => {
        const text = `${title} ${visibleText}`;
        if (text.includes('CAPTCHA') || text.includes('Verify you are human')) {
          return { kind: 'captcha', matchedText: 'captcha' };
        }
        return null;
      },
    };
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: () => mockWindow as any,
    });
    await expect(worker.execute({
      adapter: challengeAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
      timeoutMs: 500,
    })).rejects.toMatchObject({ code: 'browser_search_challenge' });
  });

  it('navigation timeout occurs when loadURL never resolves', async () => {
    const { BrowserSearchWorker } = await import('./BrowserSearchWorker');
    const mockWindow = createMockBrowserWindow();
    mockWindow.loadURL = vi.fn(() => new Promise(() => {}));
    const worker = new BrowserSearchWorker({
      isAppReady: () => true,
      createWindow: () => mockWindow as any,
    });
    await expect(worker.execute({
      adapter: stubAdapter,
      searchUrl: new URL('https://html.duckduckgo.com/html/?q=test'),
      limit: 10,
      timeoutMs: 200,
    })).rejects.toThrow();
    expect(mockWindow.destroy).toHaveBeenCalled();
  });

});
