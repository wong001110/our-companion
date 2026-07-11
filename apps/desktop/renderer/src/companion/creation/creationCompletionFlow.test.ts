import { describe, expect, it, vi } from 'vitest';
import type { CompanionProfile } from '@our-companion/shared';
import { getCreationCompletionAction, switchToSelectedCompanion } from './creationCompletionFlow';

function profile(id: string, isPrimary: boolean): CompanionProfile {
  return {
    id, name: id, personalityDescription: 'Test',
    personality: { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 },
    assetRoot: `companion://${id}/assets`, isPrimary, isBuiltIn: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('creation completion flow', () => {
  it('leaves first onboarding to the Main Process and returns an additional Companion to selection', () => {
    expect(getCreationCompletionAction(profile('first', true))).toBe('main-process-onboarding');
    expect(getCreationCompletionAction(profile('additional', false))).toBe('return-to-selection');
  });

  it('switches primary only after an explicit Start selection, then refreshes and closes creation', async () => {
    const currentPrimary = profile('first', true);
    const additional = profile('additional', false);
    const selectedPrimary = profile('additional', true);
    const actions = {
      setPrimary: vi.fn(async (id: string) => {
        expect(id).toBe(additional.id);
        expect(currentPrimary.id).toBe('first');
        return selectedPrimary;
      }),
      showCompanion: vi.fn(async () => undefined),
      closeCreationWindow: vi.fn(async () => true),
    };

    expect(currentPrimary.id).not.toBe(additional.id);
    const result = await switchToSelectedCompanion(additional, actions);
    expect(result).toBe(selectedPrimary);
    expect(actions.setPrimary).toHaveBeenCalledTimes(1);
    expect(actions.showCompanion).toHaveBeenCalledTimes(1);
    expect(actions.closeCreationWindow).toHaveBeenCalledTimes(1);
  });
});
