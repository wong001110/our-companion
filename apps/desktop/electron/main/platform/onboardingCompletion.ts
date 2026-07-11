import type { CompanionProfile } from '@our-companion/shared';

export interface OnboardingCompanionWindow {
  show(): void;
  keepOnTop(): void;
  isLoading(): boolean;
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
}

export function completeOnboardingTransition(
  companion: { id: string },
  deps: OnboardingCompletionDeps
): boolean {
  const primary = deps.getPrimaryCompanion();
  if (!primary || companion.id !== primary.id) {
    throw new Error('Creation completion requires the persisted primary Companion.');
  }

  deps.closeCreationWindow();
  const companionWindow = deps.ensureCompanionWindow();
  deps.ensurePanelWindow();
  deps.startRuntimeIfReady();
  deps.startDiscoveryAutomation();
  companionWindow.show();
  companionWindow.keepOnTop();

  const sendCompletion = () => companionWindow.sendCompleted(primary);
  if (companionWindow.isLoading()) {
    companionWindow.onceLoaded(sendCompletion);
  } else {
    sendCompletion();
  }
  return true;
}
