import { describe, expect, it, beforeEach } from 'vitest';
import {
  getBrowserSearchDiagnostics,
  updateBrowserSearchDiagnostics,
  resetBrowserSearchDiagnosticsForTests,
  toSharedWebSearchDiagnostics,
  createBrowserSearchAttemptId,
} from './browserSearchDiagnostics';
import { BROWSER_SEARCH_PROVIDER_ID } from './browserSearchTypes';

describe('browserSearchDiagnostics', () => {
  beforeEach(() => {
    resetBrowserSearchDiagnosticsForTests();
  });

  it('returns default diagnostics', () => {
    const state = getBrowserSearchDiagnostics();
    expect(state).toMatchObject({
      providerId: BROWSER_SEARCH_PROVIDER_ID,
      availability: 'ready',
    });
  });

  it('updates diagnostics with patch', () => {
    updateBrowserSearchDiagnostics({
      lastErrorCode: 'browser_search_challenge',
      availability: 'challenge',
    });
    const state = getBrowserSearchDiagnostics();
    expect(state.lastErrorCode).toBe('browser_search_challenge');
    expect(state.availability).toBe('challenge');
  });

  it('resets diagnostics for tests', () => {
    updateBrowserSearchDiagnostics({ availability: 'cooldown' });
    resetBrowserSearchDiagnosticsForTests();
    const state = getBrowserSearchDiagnostics();
    expect(state.availability).toBe('ready');
  });

  it('returns cloned state to prevent mutation', () => {
    const state1 = getBrowserSearchDiagnostics();
    state1.availability = 'cooldown';
    const state2 = getBrowserSearchDiagnostics();
    expect(state2.availability).toBe('ready');
  });

  describe('toSharedWebSearchDiagnostics', () => {
    it('maps internal state to shared diagnostics', () => {
      const shared = toSharedWebSearchDiagnostics({
        providerId: 'test',
        adapterId: 'ddg',
        availability: 'ready',
        lastAttemptAt: '2026-01-01T00:00:00Z',
        lastSuccessAt: '2026-01-01T00:00:00Z',
        lastErrorCode: 'browser_search_timeout',
        cooldownUntil: '2026-01-01T01:00:00Z',
        cacheHit: true,
      });
      expect(shared).toEqual({
        providerId: 'test',
        adapterId: 'ddg',
        availability: 'ready',
        lastAttemptAt: '2026-01-01T00:00:00Z',
        lastSuccessAt: '2026-01-01T00:00:00Z',
        lastErrorCode: 'browser_search_timeout',
        cooldownUntil: '2026-01-01T01:00:00Z',
        cacheHit: true,
      });
    });
  });

  describe('createBrowserSearchAttemptId', () => {
    it('creates unique attempt IDs', () => {
      const id1 = createBrowserSearchAttemptId();
      const id2 = createBrowserSearchAttemptId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^browser_search_/);
    });
  });
});
