import type { CompanionProfile } from '@our-companion/shared';
import type { OnboardingCompanionWindow } from './onboardingCompletion';

type Listener = (...args: any[]) => void;

export interface OnboardingBrowserWindowLike {
  show(): void;
  isDestroyed(): boolean;
  on(event: string, listener: Listener): unknown;
  removeListener(event: string, listener: Listener): unknown;
  webContents: {
    isLoading(): boolean;
    on(event: string, listener: Listener): unknown;
    removeListener(event: string, listener: Listener): unknown;
    send(channel: string, profile: CompanionProfile): void;
  };
}

export interface InvalidatableCompanionWindowLike {
  isDestroyed(): boolean;
  destroy(): void;
}

export function invalidateFailedCompanionWindow(
  window: InvalidatableCompanionWindowLike,
  isCurrentWindow: () => boolean,
  clearCurrentWindow: () => void,
  logDestroyError: (error: unknown) => void
): boolean {
  if (!isCurrentWindow()) return false;
  try {
    if (!window.isDestroyed()) window.destroy();
  } catch (error) {
    logDestroyError(error);
  } finally {
    if (isCurrentWindow()) clearCurrentWindow();
  }
  return true;
}

export function createOnboardingCompanionWindowAdapter(
  window: OnboardingBrowserWindowLike,
  keepOnTop: () => void,
  invalidate: (reason: string) => void
): OnboardingCompanionWindow {
  return {
    show: () => window.show(),
    keepOnTop,
    isLoading: () => window.webContents.isLoading(),
    isDestroyed: () => window.isDestroyed(),
    observeReadiness(onReady, onUnavailable) {
      let settled = false;
      const cleanup = () => {
        window.removeListener('closed', onClosed);
        window.webContents.removeListener('did-finish-load', onLoaded);
        window.webContents.removeListener('did-fail-load', onFailedLoad);
        window.webContents.removeListener('did-fail-provisional-load', onFailedProvisionalLoad);
        window.webContents.removeListener('render-process-gone', onRenderProcessGone);
      };
      const settleReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        onReady();
      };
      const settleUnavailable = (reason: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        onUnavailable(reason);
      };
      const onClosed = () => settleUnavailable('closed');
      const onLoaded = () => settleReady();
      const onFailedLoad = (
        _event: unknown,
        errorCode: number,
        errorDescription: string,
        validatedURL: string,
        isMainFrame: boolean
      ) => {
        if (!isMainFrame) return;
        settleUnavailable(`did-fail-load:${errorCode}:${errorDescription}:${validatedURL}`);
      };
      const onFailedProvisionalLoad = (
        _event: unknown,
        errorCode: number,
        errorDescription: string,
        validatedURL: string,
        isMainFrame: boolean
      ) => {
        if (!isMainFrame) return;
        settleUnavailable(`did-fail-provisional-load:${errorCode}:${errorDescription}:${validatedURL}`);
      };
      const onRenderProcessGone = (_event: unknown, details?: { reason?: string }) => {
        settleUnavailable(`render-process-gone:${details?.reason ?? 'unknown'}`);
      };

      window.on('closed', onClosed);
      window.webContents.on('did-finish-load', onLoaded);
      window.webContents.on('did-fail-load', onFailedLoad);
      window.webContents.on('did-fail-provisional-load', onFailedProvisionalLoad);
      window.webContents.on('render-process-gone', onRenderProcessGone);
      return cleanup;
    },
    sendCompleted: (profile) => window.webContents.send('creation:completed', profile),
    invalidate,
  };
}
