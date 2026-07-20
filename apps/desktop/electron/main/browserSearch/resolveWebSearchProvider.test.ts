import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resolveWebSearchProvider, readSearchMode, getWebSearchProviderDiagnostics } from './resolveWebSearchProvider';
import { BROWSER_SEARCH_PROVIDER_ID, BrowserSearchError } from './browserSearchTypes';
import { resetBrowserSearchDiagnosticsForTests } from './browserSearchDiagnostics';

describe('readSearchMode', () => {
  const originalEnv = process.env.OUR_COMPANION_SEARCH_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OUR_COMPANION_SEARCH_MODE;
    } else {
      process.env.OUR_COMPANION_SEARCH_MODE = originalEnv;
    }
  });

  it('defaults to browser mode', () => {
    delete process.env.OUR_COMPANION_SEARCH_MODE;
    expect(readSearchMode()).toBe('browser');
  });

  it('reads explicit modes', () => {
    process.env.OUR_COMPANION_SEARCH_MODE = 'brave';
    expect(readSearchMode()).toBe('brave');
    process.env.OUR_COMPANION_SEARCH_MODE = 'fixture';
    expect(readSearchMode()).toBe('fixture');
    process.env.OUR_COMPANION_SEARCH_MODE = 'unavailable';
    expect(readSearchMode()).toBe('unavailable');
    process.env.OUR_COMPANION_SEARCH_MODE = 'browser';
    expect(readSearchMode()).toBe('browser');
  });

  it('falls back to browser for unknown values', () => {
    process.env.OUR_COMPANION_SEARCH_MODE = 'unknown';
    expect(readSearchMode()).toBe('browser');
  });
});

describe('resolveWebSearchProvider', () => {
  beforeEach(() => {
    resetBrowserSearchDiagnosticsForTests();
    delete process.env.OUR_COMPANION_SEARCH_MODE;
  });

  it('uses injected provider when provided', () => {
    const injected = { id: 'injected', mode: 'live' as const, search: async () => [] };
    const provider = resolveWebSearchProvider({
      injected,
      researchFixtureEnabled: false,
    });
    expect(provider.id).toBe('injected');
  });

  it('uses fixture provider when fixture enabled', () => {
    const provider = resolveWebSearchProvider({
      researchFixtureEnabled: true,
      isAppReady: () => true,
    });
    expect(provider.mode).toBe('fixture');
  });

  it('uses fixture provider when env mode is fixture', () => {
    process.env.OUR_COMPANION_SEARCH_MODE = 'fixture';
    const provider = resolveWebSearchProvider({
      researchFixtureEnabled: false,
      isAppReady: () => true,
    });
    expect(provider.mode).toBe('fixture');
  });

  it('uses electron browser provider by default', () => {
    const provider = resolveWebSearchProvider({
      researchFixtureEnabled: false,
      isAppReady: () => true,
    });
    expect(provider.id).toBe(BROWSER_SEARCH_PROVIDER_ID);
    expect(provider.mode).toBe('live');
  });

  it('uses unavailable provider when env mode is unavailable', () => {
    process.env.OUR_COMPANION_SEARCH_MODE = 'unavailable';
    const provider = resolveWebSearchProvider({
      researchFixtureEnabled: false,
    });
    expect(provider.mode).toBe('unavailable');
  });

  it('creates browser provider with worker deps', () => {
    const provider = resolveWebSearchProvider({
      researchFixtureEnabled: false,
      isAppReady: () => true,
      workerDeps: {
        createWindow: () => { throw new Error('Electron not available'); },
      },
    });
    expect(provider.id).toBe('electron-browser-search');
    expect(provider.mode).toBe('live');
  });

  it('brave mode uses brave provider when env set', () => {
    process.env.OUR_COMPANION_SEARCH_MODE = 'brave';
    const provider = resolveWebSearchProvider({
      researchFixtureEnabled: false,
    });
    expect(provider.mode).toBe('unavailable');
    expect(provider.id).toBe('brave-search');
  });
});

describe('getWebSearchProviderDiagnostics', () => {
  it('returns diagnostics from provider with getDiagnostics method', () => {
    const diagnostics = {
      providerId: 'test',
      availability: 'ready' as const,
      cacheHit: true,
    };
    const provider = {
      id: 'test',
      mode: 'live' as const,
      search: async () => [],
      getDiagnostics: () => diagnostics,
    };
    expect(getWebSearchProviderDiagnostics(provider)).toEqual(diagnostics);
  });

  it('returns fallback diagnostics for providers without getDiagnostics', () => {
    const provider = { id: 'test', mode: 'live' as const, search: async () => [] };
    expect(getWebSearchProviderDiagnostics(provider)).toEqual({
      providerId: 'test',
      availability: 'ready',
    });
  });

  it('returns unavailable for unavailable provider', () => {
    const provider = { id: 'test', mode: 'unavailable' as const, search: async () => [] };
    expect(getWebSearchProviderDiagnostics(provider)).toEqual({
      providerId: 'test',
      availability: 'unavailable',
    });
  });
});
