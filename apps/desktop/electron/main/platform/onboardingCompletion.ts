import type { CompanionProfile } from '@our-companion/shared';

export interface OnboardingCompanionWindow {
  show(): void;
  keepOnTop(): void;
  isLoading(): boolean;
  isDestroyed(): boolean;
  onceLoaded(callback: () => void): void;
  onceUnavailable(callback: (reason: string) => void): void;
  sendCompleted(companion: CompanionProfile): void;
}

export interface OnboardingCompletionDeps {
  getPrimaryCompanion(): CompanionProfile | null;
  closeCreationWindow(): void;
  ensureCompanionWindow(): OnboardingCompanionWindow;
  ensurePanelWindow(): void;
  startRuntimeIfReady(): boolean;
  startDiscoveryAutomation(): void;
  logError(message: string, error: unknown): void;
}

export interface OnboardingCompletionScheduler {
  (callback: () => void): void;
}

export interface OnboardingCompletionStateSnapshot {
  scheduledCompanionIds: string[];
  completedCompanionId: string | null;
  completionInProgressFor: string | null;
  pendingCompletionBroadcastFor: string | null;
}

/** Coordinates the one-time, deferred transition after the first Companion is persisted. */
export class OnboardingCompletionCoordinator {
  private readonly scheduledCompanionIds = new Set<string>();
  private completedCompanionId: string | null = null;
  private completionInProgressFor: string | null = null;
  private pendingCompletionBroadcastFor: string | null = null;

  constructor(
    private readonly deps: OnboardingCompletionDeps,
    private readonly scheduler: OnboardingCompletionScheduler = (callback) => { setImmediate(callback); }
  ) {}

  getState(): OnboardingCompletionStateSnapshot {
    return {
      scheduledCompanionIds: [...this.scheduledCompanionIds],
      completedCompanionId: this.completedCompanionId,
      completionInProgressFor: this.completionInProgressFor,
      pendingCompletionBroadcastFor: this.pendingCompletionBroadcastFor,
    };
  }

  /**
   * Requests first-onboarding completion. Every accepted request is deferred so IPC callers
   * return before any window or runtime side effects occur.
   */
  request(companion: CompanionProfile): boolean {
    const primary = this.deps.getPrimaryCompanion();
    if (!companion.isPrimary || !primary || primary.id !== companion.id) return false;
    if (this.completedCompanionId === companion.id) return false;
    if (this.scheduledCompanionIds.has(companion.id)) return false;
    if (this.completionInProgressFor === companion.id) return false;
    if (this.pendingCompletionBroadcastFor === companion.id) return false;

    this.scheduledCompanionIds.add(companion.id);
    try {
      this.scheduler(() => {
        this.scheduledCompanionIds.delete(companion.id);
        try {
          this.executeOnce(primary);
        } catch (error) {
          this.deps.logError('[our-companion] Deferred onboarding completion failed.', error);
        }
      });
      return true;
    } catch (error) {
      this.scheduledCompanionIds.delete(companion.id);
      this.deps.logError('[our-companion] Failed to schedule onboarding completion.', error);
      return false;
    }
  }

  private executeOnce(companion: CompanionProfile): void {
    if (this.completedCompanionId === companion.id) return;
    if (this.completionInProgressFor === companion.id) return;
    if (this.pendingCompletionBroadcastFor === companion.id) return;

    const primary = this.deps.getPrimaryCompanion();
    if (!primary || primary.id !== companion.id) {
      throw new Error('Onboarding completion requires the persisted primary Companion.');
    }

    this.completionInProgressFor = companion.id;
    try {
      const companionWindow = this.deps.ensureCompanionWindow();
      this.deps.ensurePanelWindow();
      this.deps.startRuntimeIfReady();
      this.deps.startDiscoveryAutomation();
      this.deps.closeCreationWindow();
      companionWindow.show();
      companionWindow.keepOnTop();
      this.broadcastCompletionOnce(primary, companionWindow);
    } finally {
      this.completionInProgressFor = null;
    }
  }

  private broadcastCompletionOnce(companion: CompanionProfile, companionWindow: OnboardingCompanionWindow): void {
    const clearPending = () => {
      if (this.pendingCompletionBroadcastFor === companion.id) {
        this.pendingCompletionBroadcastFor = null;
      }
    };
    let settled = false;

    const send = () => {
      if (settled) return;
      settled = true;
      try {
        if (companionWindow.isDestroyed()) {
          clearPending();
          this.deps.logError('[our-companion] Onboarding completion broadcast skipped because Companion Window was destroyed.', undefined);
          return;
        }
        companionWindow.sendCompleted(companion);
        clearPending();
        this.completedCompanionId = companion.id;
      } catch (error) {
        clearPending();
        this.deps.logError('[our-companion] Onboarding completion broadcast failed.', error);
      }
    };

    const unavailable = (reason: string) => {
      if (settled) return;
      settled = true;
      clearPending();
      this.deps.logError(`[our-companion] Onboarding completion broadcast unavailable: ${reason}.`, undefined);
    };

    if (companionWindow.isLoading()) {
      this.pendingCompletionBroadcastFor = companion.id;
      companionWindow.onceLoaded(send);
      companionWindow.onceUnavailable(unavailable);
      return;
    }
    send();
  }
}
