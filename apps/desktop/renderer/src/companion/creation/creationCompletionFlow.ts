import type { CompanionProfile } from '@our-companion/shared';

export type CreationCompletionAction = 'main-process-onboarding' | 'return-to-selection';

/** The renderer owns only the additional-Companion return path, never first onboarding. */
export function getCreationCompletionAction(companion: CompanionProfile): CreationCompletionAction {
  return companion.isPrimary ? 'main-process-onboarding' : 'return-to-selection';
}

export async function switchToSelectedCompanion(
  selected: CompanionProfile,
  actions: {
    setPrimary(id: string): Promise<CompanionProfile>;
    showCompanion(): Promise<void>;
    closeCreationWindow(): Promise<boolean>;
  }
): Promise<CompanionProfile> {
  const companion = await actions.setPrimary(selected.id);
  await actions.showCompanion();
  await actions.closeCreationWindow();
  return companion;
}
