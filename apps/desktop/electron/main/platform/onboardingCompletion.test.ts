import { describe, expect, it, vi } from 'vitest';
import type { CompanionProfile } from '@our-companion/shared';
import {
  OnboardingCompletionCoordinator,
  type OnboardingCompletionDeps,
  type OnboardingCompanionWindow,
} from './onboardingCompletion';

function profile(id = 'companion_1', isPrimary = true): CompanionProfile {
  return {
    id,
    name: 'Test',
    personalityDescription: 'A test Companion',
    personality: { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 },
    assetRoot: `companion://${id}/assets`,
    isPrimary,
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createHarness(primary = profile(), windowOverrides: Partial<OnboardingCompanionWindow> = {}) {
  const sent: CompanionProfile[] = [];
  const loadCallbacks: Array<() => void> = [];
  const unavailableCallbacks: Array<(reason: string) => void> = [];
  const scheduled: Array<() => void> = [];
  const errors: Array<{ message: string; error: unknown }> = [];
  const companionWindow: OnboardingCompanionWindow = {
    show: vi.fn(),
    keepOnTop: vi.fn(),
    isLoading: vi.fn(() => false),
    isDestroyed: vi.fn(() => false),
    onceLoaded: vi.fn((callback) => loadCallbacks.push(callback)),
    onceUnavailable: vi.fn((callback) => unavailableCallbacks.push(callback)),
    sendCompleted: vi.fn((companion) => sent.push(companion)),
    ...windowOverrides,
  };
  const deps: OnboardingCompletionDeps = {
    getPrimaryCompanion: vi.fn(() => primary),
    closeCreationWindow: vi.fn(),
    ensureCompanionWindow: vi.fn(() => companionWindow),
    ensurePanelWindow: vi.fn(),
    startRuntimeIfReady: vi.fn(() => true),
    startDiscoveryAutomation: vi.fn(),
    logError: vi.fn((message, error) => errors.push({ message, error })),
  };
  const coordinator = new OnboardingCompletionCoordinator(deps, (callback) => { scheduled.push(callback); });
  return { coordinator, deps, companionWindow, sent, loadCallbacks, unavailableCallbacks, scheduled, errors };
}

function expectIncomplete(coordinator: OnboardingCompletionCoordinator) {
  expect(coordinator.getState()).toEqual({
    scheduledCompanionIds: [],
    completedCompanionId: null,
    completionInProgressFor: null,
    pendingCompletionBroadcastFor: null,
  });
}

describe('onboarding completion coordinator', () => {
  it('models the IPC ordering: persistence result returns before deferred completion side effects', async () => {
    const created = profile();
    const { coordinator, deps, scheduled } = createHarness(created);
    const createHandler = async () => created;

    const result = await createHandler();
    expect(result).toBe(created);
    expect(coordinator.request(result)).toBe(true);
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    scheduled[0]();
    expect(deps.closeCreationWindow).toHaveBeenCalledTimes(1);
    expect(deps.ensureCompanionWindow).toHaveBeenCalledTimes(1);
    expect(deps.ensurePanelWindow).toHaveBeenCalledTimes(1);
  });

  it('cleans up when scheduling fails without disturbing the returned create result', async () => {
    const created = profile();
    const errors: Array<{ message: string; error: unknown }> = [];
    const deps: OnboardingCompletionDeps = {
      getPrimaryCompanion: vi.fn(() => created), closeCreationWindow: vi.fn(), ensureCompanionWindow: vi.fn(),
      ensurePanelWindow: vi.fn(), startRuntimeIfReady: vi.fn(() => true), startDiscoveryAutomation: vi.fn(),
      logError: vi.fn((message, error) => errors.push({ message, error })),
    };
    const coordinator = new OnboardingCompletionCoordinator(deps, () => { throw new Error('scheduler unavailable'); });

    expect(await Promise.resolve(created)).toBe(created);
    expect(coordinator.request(created)).toBe(false);
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    expect(errors[0].message).toContain('Failed to schedule onboarding completion');
    expectIncomplete(coordinator);
  });

  it('uses one deferred request path for compatibility calls and ignores duplicate or completed requests', () => {
    const primary = profile();
    const { coordinator, deps, scheduled } = createHarness(primary);

    expect(coordinator.request(primary)).toBe(true);
    expect(coordinator.request(primary)).toBe(false);
    expect(scheduled).toHaveLength(1);
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    scheduled[0]();
    expect(coordinator.getState().completedCompanionId).toBe(primary.id);
    expect(coordinator.request(primary)).toBe(false);
    expect(deps.startRuntimeIfReady).toHaveBeenCalledTimes(1);
    expect(deps.startDiscoveryAutomation).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-primary request before scheduling or window side effects', () => {
    const { coordinator, deps, scheduled } = createHarness(profile('primary'));

    expect(coordinator.request(profile('other', false))).toBe(false);
    expect(scheduled).toEqual([]);
    expect(deps.ensureCompanionWindow).not.toHaveBeenCalled();
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    expectIncomplete(coordinator);
  });

  it('registers one loaded and unavailable listener, then broadcasts only once when loaded first', () => {
    const primary = profile();
    const { coordinator, scheduled, loadCallbacks, unavailableCallbacks, sent } = createHarness(primary, { isLoading: () => true });

    expect(coordinator.request(primary)).toBe(true);
    scheduled[0]();
    expect(loadCallbacks).toHaveLength(1);
    expect(unavailableCallbacks).toHaveLength(1);
    loadCallbacks[0]();
    unavailableCallbacks[0]('closed');
    expect(sent).toEqual([primary]);
    expect(coordinator.getState().completedCompanionId).toBe(primary.id);
  });

  it('clears pending state if the loading window becomes unavailable, ignores a late load, and retries successfully', () => {
    const primary = profile();
    const first = createHarness(primary, { isLoading: () => true });
    const recoveryWindow: OnboardingCompanionWindow = {
      show: vi.fn(), keepOnTop: vi.fn(), isLoading: () => false, isDestroyed: () => false,
      onceLoaded: vi.fn(), onceUnavailable: vi.fn(), sendCompleted: vi.fn(),
    };
    vi.mocked(first.deps.ensureCompanionWindow)
      .mockImplementationOnce(() => first.companionWindow)
      .mockImplementation(() => recoveryWindow);

    expect(first.coordinator.request(primary)).toBe(true);
    first.scheduled[0]();
    expect(first.loadCallbacks).toHaveLength(1);
    expect(first.unavailableCallbacks).toHaveLength(1);
    first.unavailableCallbacks[0]('did-fail-load');
    first.loadCallbacks[0]();
    expect(first.sent).toEqual([]);
    expectIncomplete(first.coordinator);

    expect(first.coordinator.request(primary)).toBe(true);
    first.scheduled[1]();
    expect(recoveryWindow.sendCompleted).toHaveBeenCalledWith(primary);
    expect(first.coordinator.getState().completedCompanionId).toBe(primary.id);
  });

  it('ignores a late unavailable signal after a successful load', () => {
    const primary = profile();
    const { coordinator, scheduled, loadCallbacks, unavailableCallbacks, sent, errors } = createHarness(primary, { isLoading: () => true });

    coordinator.request(primary);
    scheduled[0]();
    loadCallbacks[0]();
    unavailableCallbacks[0]('render-process-gone');
    expect(sent).toEqual([primary]);
    expect(coordinator.getState().completedCompanionId).toBe(primary.id);
    expect(errors).toEqual([]);
  });

  it('cleans all state after post-commit window creation failure and allows a retry', () => {
    const primary = profile();
    const { coordinator, deps, scheduled, errors } = createHarness(primary);
    vi.mocked(deps.ensureCompanionWindow).mockImplementationOnce(() => { throw new Error('window creation failed'); });

    coordinator.request(primary);
    scheduled[0]();
    expectIncomplete(coordinator);
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    expect(errors[0].message).toContain('Deferred onboarding completion failed');

    expect(coordinator.request(primary)).toBe(true);
    scheduled[1]();
    expect(coordinator.getState().completedCompanionId).toBe(primary.id);
  });
});
