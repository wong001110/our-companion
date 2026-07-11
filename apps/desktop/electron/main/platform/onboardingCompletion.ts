import type { CompanionProfile } from '@our-companion/shared';

export interface OnboardingCompanionWindow {
  show(): void;
  keepOnTop(): void;
  isLoading(): boolean;
  isDestroyed(): boolean;
  onceLoaded(callback: () => void): void;
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

  schedule(companion: CompanionProfile): boolean {
    if (this.completedCompanionId === companion.id) return false;
    if (this.scheduledCompanionIds.has(companion.id)) return false;
    if (this.pendingCompletionBroadcastFor === companion.id) return false;

    this.scheduledCompanionIds.add(companion.id);
    try {
      this.scheduler(() => {
        this.scheduledCompanionIds.delete(companion.id);
        try {
          this.completeOnce(companion);
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

  completeOnce(companion: { id: string }): boolean {
    if (this.completedCompanionId === companion.id) return false;
    if (this.completionInProgressFor === companion.id) return false;
    if (this.pendingCompletionBroadcastFor === companion.id) return false;

    const primary = this.deps.getPrimaryCompanion();
    if (!primary || companion.id !== primary.id) {
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
      return true;
    } catch (error) {
      this.deps.logError('[our-companion] Onboarding UI transition failed after Companion persistence.', error);
      throw error;
    } finally {
      this.completionInProgressFor = null;
    }
  }

  private broadcastCompletionOnce(companion: CompanionProfile, companionWindow: OnboardingCompanionWindow): void {
    const send = () => {
      try {
        if (companionWindow.isDestroyed()) {
          this.pendingCompletionBroadcastFor = null;
          this.deps.logError('[our-companion] Onboarding completion broadcast skipped because Companion Window was destroyed.', undefined);
          return;
        }
        companionWindow.sendCompleted(companion);
        this.pendingCompletionBroadcastFor = null;
        this.completedCompanionId = companion.id;
      } catch (error) {
        this.pendingCompletionBroadcastFor = null;
        this.deps.logError('[our-companion] Onboarding completion broadcast failed.', error);
      }
    };

    if (companionWindow.isLoading()) {
      this.pendingCompletionBroadcastFor = companion.id;
      companionWindow.onceLoaded(send);
      return;
    }
    send();
  }
}
