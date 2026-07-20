import { createId } from '@our-companion/shared';
import type { WebSearchProviderDiagnostics } from '@our-companion/shared';
import type { BrowserSearchErrorCode } from './browserSearchTypes';
import { BROWSER_SEARCH_PROVIDER_ID } from './browserSearchTypes';

export interface BrowserSearchDiagnosticsState {
  providerId: string;
  adapterId?: string;
  availability: WebSearchProviderDiagnostics['availability'];
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastErrorCode?: BrowserSearchErrorCode | string;
  cooldownUntil?: string;
  cacheHit?: boolean;
}

let latestDiagnostics: BrowserSearchDiagnosticsState = {
  providerId: BROWSER_SEARCH_PROVIDER_ID,
  availability: 'ready',
};

export function getBrowserSearchDiagnostics(): BrowserSearchDiagnosticsState {
  return { ...latestDiagnostics };
}

export function updateBrowserSearchDiagnostics(
  patch: Partial<BrowserSearchDiagnosticsState>,
): BrowserSearchDiagnosticsState {
  latestDiagnostics = { ...latestDiagnostics, ...patch };
  return getBrowserSearchDiagnostics();
}

export function resetBrowserSearchDiagnosticsForTests(): void {
  latestDiagnostics = {
    providerId: BROWSER_SEARCH_PROVIDER_ID,
    availability: 'ready',
  };
}

export function toSharedWebSearchDiagnostics(
  state: BrowserSearchDiagnosticsState,
): WebSearchProviderDiagnostics {
  return {
    providerId: state.providerId,
    adapterId: state.adapterId,
    availability: state.availability,
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    lastErrorCode: state.lastErrorCode,
    cooldownUntil: state.cooldownUntil,
    cacheHit: state.cacheHit,
  };
}

export function createBrowserSearchAttemptId(): string {
  return createId('browser_search');
}
