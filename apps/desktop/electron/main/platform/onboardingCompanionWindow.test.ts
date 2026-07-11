import { describe, expect, it, vi } from 'vitest';
import type { CompanionProfile } from '@our-companion/shared';
import {
  createOnboardingCompanionWindowAdapter,
  invalidateFailedCompanionWindow,
  type OnboardingBrowserWindowLike,
} from './onboardingCompanionWindow';

function createWindow() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const add = (event: string, listener: (...args: any[]) => void) => {
    const eventListeners = listeners.get(event) ?? new Set();
    eventListeners.add(listener);
    listeners.set(event, eventListeners);
  };
  const remove = (event: string, listener: (...args: any[]) => void) => listeners.get(event)?.delete(listener);
  const emit = (event: string, ...args: any[]) => listeners.get(event)?.forEach((listener) => listener(...args));
  const window: OnboardingBrowserWindowLike = {
    show: vi.fn(), isDestroyed: vi.fn(() => false), on: add, removeListener: remove,
    webContents: { isLoading: vi.fn(() => true), on: add, removeListener: remove, send: vi.fn() },
  };
  return { window, emit, listenerCount: (event: string) => listeners.get(event)?.size ?? 0 };
}

describe('onboarding Companion Window adapter', () => {
  it('accepts only main-frame load failures and removes all listeners after failure', () => {
    const { window, emit, listenerCount } = createWindow();
    const unavailable = vi.fn();
    const adapter = createOnboardingCompanionWindowAdapter(window, vi.fn(), vi.fn());
    adapter.observeReadiness(vi.fn(), unavailable);

    emit('did-fail-load', {}, -3, 'subframe failed', 'https://asset', false);
    expect(unavailable).not.toHaveBeenCalled();
    emit('did-fail-load', {}, -2, 'main failed', 'https://app', true);
    expect(unavailable).toHaveBeenCalledWith('did-fail-load:-2:main failed:https://app');
    expect(listenerCount('did-finish-load')).toBe(0);
    expect(listenerCount('did-fail-provisional-load')).toBe(0);
    expect(listenerCount('render-process-gone')).toBe(0);
  });

  it('handles a main-frame provisional failure once even if a final failure follows', () => {
    const { window, emit } = createWindow();
    const unavailable = vi.fn();
    const adapter = createOnboardingCompanionWindowAdapter(window, vi.fn(), vi.fn());
    adapter.observeReadiness(vi.fn(), unavailable);

    emit('did-fail-provisional-load', {}, -105, 'name not resolved', 'https://app', true);
    emit('did-fail-load', {}, -2, 'main failed', 'https://app', true);
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(unavailable).toHaveBeenCalledWith('did-fail-provisional-load:-105:name not resolved:https://app');
  });

  it('treats render-process loss and closed windows as terminal and never delivers a late loaded event', () => {
    const { window, emit } = createWindow();
    const ready = vi.fn();
    const unavailable = vi.fn();
    const adapter = createOnboardingCompanionWindowAdapter(window, vi.fn(), vi.fn());
    adapter.observeReadiness(ready, unavailable);

    emit('render-process-gone', {}, { reason: 'crashed' });
    emit('did-finish-load');
    emit('closed');
    expect(unavailable).toHaveBeenCalledWith('render-process-gone:crashed');
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(ready).not.toHaveBeenCalled();

    const closedUnavailable = vi.fn();
    adapter.observeReadiness(ready, closedUnavailable);
    emit('closed');
    emit('did-finish-load');
    expect(closedUnavailable).toHaveBeenCalledWith('closed');
    expect(ready).not.toHaveBeenCalled();
  });

  it('sends through the adapter and exposes invalidation', () => {
    const { window } = createWindow();
    const invalidate = vi.fn();
    const adapter = createOnboardingCompanionWindowAdapter(window, vi.fn(), invalidate);
    const profile = { id: 'c' } as CompanionProfile;

    adapter.sendCompleted(profile);
    adapter.invalidate('closed');
    expect(window.webContents.send).toHaveBeenCalledWith('creation:completed', profile);
    expect(invalidate).toHaveBeenCalledWith('closed');
  });

  it('destroys a current failed window and clears its reference without touching a replacement window', () => {
    const failedWindow = { isDestroyed: vi.fn(() => false), destroy: vi.fn() };
    let current: typeof failedWindow | undefined = failedWindow;
    const clearCurrent = vi.fn(() => { current = undefined; });
    const logError = vi.fn();

    expect(invalidateFailedCompanionWindow(failedWindow, () => current === failedWindow, clearCurrent, logError)).toBe(true);
    expect(failedWindow.destroy).toHaveBeenCalledTimes(1);
    expect(clearCurrent).toHaveBeenCalledTimes(1);
    expect(current).toBeUndefined();

    current = { isDestroyed: vi.fn(() => false), destroy: vi.fn() };
    expect(invalidateFailedCompanionWindow(failedWindow, () => current === failedWindow, clearCurrent, logError)).toBe(false);
    expect(failedWindow.destroy).toHaveBeenCalledTimes(1);
  });
});
