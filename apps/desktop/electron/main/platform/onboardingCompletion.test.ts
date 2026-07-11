import { describe, expect, it, vi } from 'vitest';
import type { CompanionProfile } from '@our-companion/shared';
import { completeOnboardingTransition, type OnboardingCompletionDeps } from './onboardingCompletion';

function profile(id = 'companion_1'): CompanionProfile {
  return {
    id,
    name: 'Test',
    personalityDescription: 'A test Companion',
    personality: { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 },
    assetRoot: `companion://${id}/assets`,
    isPrimary: true,
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('onboarding completion coordinator', () => {
  it('starts runtime and automation once per call path, creates windows through idempotent ensures, closes creation, and broadcasts completion', () => {
    const primary = profile();
    const sent: CompanionProfile[] = [];
    const callbacks: Array<() => void> = [];
    let companionCreated = 0;
    let panelCreated = 0;
    let runtimeStarted = 0;
    let automationStarted = 0;
    const companionWindow = {
      show: vi.fn(),
      keepOnTop: vi.fn(),
      isLoading: vi.fn(() => false),
      onceLoaded: vi.fn((callback: () => void) => callbacks.push(callback)),
      sendCompleted: vi.fn((companion: CompanionProfile) => sent.push(companion)),
    };
    const deps: OnboardingCompletionDeps = {
      getPrimaryCompanion: vi.fn(() => primary),
      closeCreationWindow: vi.fn(),
      ensureCompanionWindow: vi.fn(() => {
        if (companionCreated === 0) companionCreated += 1;
        return companionWindow;
      }),
      ensurePanelWindow: vi.fn(() => {
        if (panelCreated === 0) panelCreated += 1;
      }),
      startRuntimeIfReady: vi.fn(() => {
        if (runtimeStarted === 0) {
          runtimeStarted += 1;
          return true;
        }
        return false;
      }),
      startDiscoveryAutomation: vi.fn(() => {
        if (automationStarted === 0) automationStarted += 1;
      }),
    };

    expect(completeOnboardingTransition(primary, deps)).toBe(true);
    expect(completeOnboardingTransition(primary, deps)).toBe(true);
    expect(deps.closeCreationWindow).toHaveBeenCalledTimes(2);
    expect(deps.ensureCompanionWindow).toHaveBeenCalledTimes(2);
    expect(deps.ensurePanelWindow).toHaveBeenCalledTimes(2);
    expect(companionCreated).toBe(1);
    expect(panelCreated).toBe(1);
    expect(deps.startRuntimeIfReady).toHaveBeenCalledTimes(2);
    expect(deps.startDiscoveryAutomation).toHaveBeenCalledTimes(2);
    expect(runtimeStarted).toBe(1);
    expect(automationStarted).toBe(1);
    expect(callbacks).toHaveLength(0);
    expect(sent).toEqual([primary, primary]);
  });

  it('defers completion broadcast until the Companion window finishes loading', () => {
    const primary = profile();
    const sent: CompanionProfile[] = [];
    let onLoaded: (() => void) | undefined;
    const deps: OnboardingCompletionDeps = {
      getPrimaryCompanion: () => primary,
      closeCreationWindow: vi.fn(),
      ensureCompanionWindow: () => ({
        show: vi.fn(),
        keepOnTop: vi.fn(),
        isLoading: () => true,
        onceLoaded: (callback) => { onLoaded = callback; },
        sendCompleted: (companion) => sent.push(companion),
      }),
      ensurePanelWindow: vi.fn(),
      startRuntimeIfReady: vi.fn(() => true),
      startDiscoveryAutomation: vi.fn(),
    };

    completeOnboardingTransition(primary, deps);
    expect(sent).toEqual([]);
    onLoaded?.();
    expect(sent).toEqual([primary]);
  });

  it('rejects completion when the persisted primary does not match', () => {
    const deps: OnboardingCompletionDeps = {
      getPrimaryCompanion: () => profile('other'),
      closeCreationWindow: vi.fn(),
      ensureCompanionWindow: vi.fn(),
      ensurePanelWindow: vi.fn(),
      startRuntimeIfReady: vi.fn(() => true),
      startDiscoveryAutomation: vi.fn(),
    };

    expect(() => completeOnboardingTransition(profile('requested'), deps)).toThrow('persisted primary');
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
  });
});
