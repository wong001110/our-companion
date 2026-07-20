import {
  BraveWebSearchProvider,
  createDeterministicFixtureSearchProvider,
  UnavailableWebSearchProvider,
  type WebSearchProvider,
} from '../researchAdapters';
import { ElectronBrowserSearchProvider } from './ElectronBrowserSearchProvider';
import type { BrowserSearchWorkerDeps } from './BrowserSearchWorker';

export type ResolvedSearchMode = 'browser' | 'brave' | 'fixture' | 'unavailable';

export function readSearchMode(): ResolvedSearchMode {
  const mode = process.env.OUR_COMPANION_SEARCH_MODE?.trim().toLowerCase();
  if (mode === 'brave' || mode === 'fixture' || mode === 'unavailable' || mode === 'browser') {
    return mode;
  }
  return 'browser';
}

export interface ResolveWebSearchProviderInput {
  injected?: WebSearchProvider;
  researchFixtureEnabled: boolean;
  isAppReady?: () => boolean;
  workerDeps?: BrowserSearchWorkerDeps;
  language?: string;
}

export function resolveWebSearchProvider(input: ResolveWebSearchProviderInput): WebSearchProvider {
  if (input.injected) return input.injected;
  if (input.researchFixtureEnabled || readSearchMode() === 'fixture') {
    return createDeterministicFixtureSearchProvider();
  }
  const mode = readSearchMode();
  if (mode === 'unavailable') {
    return new UnavailableWebSearchProvider('electron-browser-search');
  }
  if (mode === 'brave') {
    const brave = new BraveWebSearchProvider();
    return brave.mode === 'live' ? brave : new UnavailableWebSearchProvider('brave-search');
  }
  try {
    return new ElectronBrowserSearchProvider({
      isAppReady: input.isAppReady ?? (() => true),
      workerDeps: input.workerDeps,
      language: input.language,
    });
  } catch {
    return new UnavailableWebSearchProvider('electron-browser-search');
  }
}

export function getWebSearchProviderDiagnostics(provider: WebSearchProvider) {
  if ('getDiagnostics' in provider && typeof provider.getDiagnostics === 'function') {
    return provider.getDiagnostics();
  }
  return {
    providerId: provider.id,
    availability: provider.mode === 'unavailable' ? 'unavailable' as const : 'ready' as const,
  };
}
