import { describe, expect, it, vi } from 'vitest';
import type { CompanionProfile } from '@our-companion/shared';
import {
  OnboardingCompletionCoordinator,
  type OnboardingCompletionDeps,
  type OnboardingCompanionWindow,
} from './onboardingCompletion';

function profile(id = 'companion_1', isPrimary = true): CompanionProfile {
  return {
    id, name: 'Test', personalityDescription: 'A test Companion',
    personality: { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 },
    assetRoot: `companion://${id}/assets`, isPrimary, isBuiltIn: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function createHarness(primary = profile(), windowOverrides: Partial<OnboardingCompanionWindow> = {}) {
  const sent: CompanionProfile[] = [];
  const readyCallbacks: Array<() => void> = [];
  const unavailableCallbacks: Array<(reason: string) => void> = [];
  const cleanupReadiness = vi.fn();
  const scheduled: Array<() => void> = [];
  const errors: Array<{ message: string; error: unknown }> = [];
  const companionWindow: OnboardingCompanionWindow = {
    show: vi.fn(), keepOnTop: vi.fn(), isLoading: vi.fn(() => false), isDestroyed: vi.fn(() => false),
    observeReadiness: vi.fn((ready, unavailable) => {
      readyCallbacks.push(ready);
      unavailableCallbacks.push(unavailable);
      return cleanupReadiness;
    }),
    sendCompleted: vi.fn((companion) => sent.push(companion)),
    invalidate: vi.fn(),
    ...windowOverrides,
  };
  const deps: OnboardingCompletionDeps = {
    getPrimaryCompanion: vi.fn(() => primary), closeCreationWindow: vi.fn(),
    ensureCompanionWindow: vi.fn(() => companionWindow), ensurePanelWindow: vi.fn(),
    startRuntimeIfReady: vi.fn(() => true), startDiscoveryAutomation: vi.fn(),
    reportRecovery: vi.fn(), logError: vi.fn((message, error) => errors.push({ message, error })),
  };
  const coordinator = new OnboardingCompletionCoordinator(deps, (callback) => { scheduled.push(callback); });
  return { coordinator, deps, companionWindow, sent, readyCallbacks, unavailableCallbacks, cleanupReadiness, scheduled, errors };
}

function expectIncomplete(coordinator: OnboardingCompletionCoordinator) {
  expect(coordinator.getState()).toEqual({
    scheduledCompanionIds: [], completedCompanionId: null, completionInProgressFor: null, pendingCompletionBroadcastFor: null,
  });
}

describe('onboarding completion coordinator', () => {
  it('returns the persisted create result before deferred work, then closes Creation only after an immediate successful completion send', async () => {
    const primary = profile();
    const { coordinator, deps, sent, scheduled } = createHarness(primary);
    const createHandler = async () => primary;

    expect(await createHandler()).toBe(primary);
    expect(coordinator.request(primary)).toBe(true);
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    scheduled[0]();
    expect(sent).toEqual([primary]);
    expect(coordinator.getState().completedCompanionId).toBe(primary.id);
    expect(deps.closeCreationWindow).toHaveBeenCalledTimes(1);
  });

  it('keeps Creation open while the Companion Window loads, then sends, completes, and closes once it is ready', () => {
    const primary = profile();
    const { coordinator, deps, sent, readyCallbacks, scheduled } = createHarness(primary, { isLoading: () => true });

    coordinator.request(primary);
    scheduled[0]();
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    expect(readyCallbacks).toHaveLength(1);
    expect(coordinator.getState().pendingCompletionBroadcastFor).toBe(primary.id);
    readyCallbacks[0]();
    expect(sent).toEqual([primary]);
    expect(coordinator.getState().completedCompanionId).toBe(primary.id);
    expect(deps.closeCreationWindow).toHaveBeenCalledTimes(1);
  });

  it('does not close Creation or mark complete when sending the completion event fails', () => {
    const primary = profile();
    const { coordinator, deps, companionWindow, scheduled } = createHarness(primary);
    vi.mocked(companionWindow.sendCompleted).mockImplementation(() => { throw new Error('send failed'); });

    coordinator.request(primary);
    scheduled[0]();
    expectIncomplete(coordinator);
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    expect(deps.reportRecovery).toHaveBeenCalledWith('completion-event-send-failed');
  });

  it('rejects a non-primary request before scheduling or window side effects', () => {
    const { coordinator, deps, scheduled } = createHarness(profile('primary'));

    expect(coordinator.request(profile('other', false))).toBe(false);
    expect(scheduled).toEqual([]);
    expect(deps.ensureCompanionWindow).not.toHaveBeenCalled();
    expectIncomplete(coordinator);
  });

  it('invalidates a failed loading window, preserves Creation, ignores late ready, and completes with a new retry window', () => {
    const primary = profile();
    const first = createHarness(primary, { isLoading: () => true });
    const retryWindow: OnboardingCompanionWindow = {
      show: vi.fn(), keepOnTop: vi.fn(), isLoading: () => false, isDestroyed: () => false,
      observeReadiness: vi.fn(() => () => {}), sendCompleted: vi.fn(), invalidate: vi.fn(),
    };
    vi.mocked(first.deps.ensureCompanionWindow)
      .mockImplementationOnce(() => first.companionWindow)
      .mockImplementation(() => retryWindow);

    first.coordinator.request(primary);
    first.scheduled[0]();
    first.unavailableCallbacks[0]('did-fail-load:-2:ERR_FAILED:app://companion');
    first.readyCallbacks[0]();
    expect(first.companionWindow.invalidate).toHaveBeenCalledTimes(1);
    expect(first.deps.closeCreationWindow).not.toHaveBeenCalled();
    expect(first.deps.reportRecovery).toHaveBeenCalledTimes(1);
    expectIncomplete(first.coordinator);

    expect(first.coordinator.request(primary)).toBe(true);
    first.scheduled[1]();
    expect(retryWindow.sendCompleted).toHaveBeenCalledWith(primary);
    expect(first.deps.closeCreationWindow).toHaveBeenCalledTimes(1);
    expect(first.coordinator.getState().completedCompanionId).toBe(primary.id);
  });

  it('settles readiness listeners once and ignores late unavailable events after success', () => {
    const primary = profile();
    const { coordinator, scheduled, readyCallbacks, unavailableCallbacks, cleanupReadiness, sent, errors } = createHarness(primary, { isLoading: () => true });

    coordinator.request(primary);
    scheduled[0]();
    readyCallbacks[0]();
    unavailableCallbacks[0]('render-process-gone:crashed');
    expect(cleanupReadiness).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([primary]);
    expect(coordinator.getState().completedCompanionId).toBe(primary.id);
    expect(errors).toEqual([]);
  });

  it('recovers to idle and preserves Creation after window setup throws', () => {
    const primary = profile();
    const { coordinator, deps, scheduled, errors } = createHarness(primary);
    vi.mocked(deps.ensureCompanionWindow).mockImplementationOnce(() => { throw new Error('window creation failed'); });

    coordinator.request(primary);
    scheduled[0]();
    expectIncomplete(coordinator);
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    expect(deps.reportRecovery).toHaveBeenCalledWith('companion-window-setup-failed');
    expect(errors[0].message).toContain('Deferred onboarding completion failed');
  });

  it('clears pending state and preserves Creation when readiness listener registration throws', () => {
    const primary = profile();
    const { coordinator, deps, companionWindow, scheduled } = createHarness(primary, { isLoading: () => true });
    vi.mocked(companionWindow.observeReadiness).mockImplementation(() => { throw new Error('listener registration failed'); });

    coordinator.request(primary);
    scheduled[0]();
    expectIncomplete(coordinator);
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    expect(deps.reportRecovery).toHaveBeenCalledWith('companion-window-setup-failed');
  });
});
