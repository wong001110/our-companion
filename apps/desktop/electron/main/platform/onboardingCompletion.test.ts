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
  const scheduled: Array<() => void> = [];
  const errors: Array<{ message: string; error: unknown }> = [];
  const companionWindow: OnboardingCompanionWindow = {
    show: vi.fn(),
    keepOnTop: vi.fn(),
    isLoading: vi.fn(() => false),
    isDestroyed: vi.fn(() => false),
    onceLoaded: vi.fn((callback) => loadCallbacks.push(callback)),
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
  return { coordinator, deps, companionWindow, sent, loadCallbacks, scheduled, errors };
}

describe('onboarding completion coordinator', () => {
  it('models IPC ordering by scheduling completion after the create result is available', async () => {
    const created = profile();
    const { coordinator, deps, scheduled } = createHarness(created);
    const createHandler = async () => created;

    const result = await createHandler();
    expect(result).toBe(created);
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    expect(coordinator.schedule(result)).toBe(true);
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    scheduled[0]();
    expect(deps.closeCreationWindow).toHaveBeenCalledTimes(1);
    expect(deps.ensureCompanionWindow).toHaveBeenCalledTimes(1);
    expect(deps.ensurePanelWindow).toHaveBeenCalledTimes(1);
  });

  it('does not disturb an already returned create result when scheduling fails', async () => {
    const created = profile();
    const errors: Array<{ message: string; error: unknown }> = [];
    const deps: OnboardingCompletionDeps = {
      getPrimaryCompanion: vi.fn(() => created),
      closeCreationWindow: vi.fn(),
      ensureCompanionWindow: vi.fn(),
      ensurePanelWindow: vi.fn(),
      startRuntimeIfReady: vi.fn(() => true),
      startDiscoveryAutomation: vi.fn(),
      logError: vi.fn((message, error) => errors.push({ message, error })),
    };
    const coordinator = new OnboardingCompletionCoordinator(deps, () => {
      throw new Error('scheduler unavailable');
    });

    const result = await Promise.resolve(created);
    expect(result).toBe(created);
    expect(coordinator.schedule(result)).toBe(false);
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
    expect(deps.ensureCompanionWindow).not.toHaveBeenCalled();
    expect(errors[0].message).toContain('Failed to schedule onboarding completion');
  });

  it('guards scheduling so duplicate callbacks are not queued and completed Companions cannot be scheduled again', () => {
    const primary = profile();
    const { coordinator, scheduled } = createHarness(primary);

    expect(coordinator.schedule(primary)).toBe(true);
    expect(coordinator.schedule(primary)).toBe(false);
    expect(scheduled).toHaveLength(1);
    scheduled[0]();
    expect(coordinator.getState().completedCompanionId).toBe(primary.id);
    expect(coordinator.schedule(primary)).toBe(false);

    const another = profile('companion_2');
    expect(coordinator.schedule(another)).toBe(true);
    expect(scheduled).toHaveLength(2);
  });

  it('executes completion once and suppresses duplicate runtime, automation, window, close, and broadcast side effects', () => {
    const primary = profile();
    const { coordinator, deps, sent } = createHarness(primary);

    expect(coordinator.completeOnce(primary)).toBe(true);
    expect(coordinator.completeOnce(primary)).toBe(false);
    expect(deps.ensureCompanionWindow).toHaveBeenCalledTimes(1);
    expect(deps.ensurePanelWindow).toHaveBeenCalledTimes(1);
    expect(deps.startRuntimeIfReady).toHaveBeenCalledTimes(1);
    expect(deps.startDiscoveryAutomation).toHaveBeenCalledTimes(1);
    expect(deps.closeCreationWindow).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([primary]);
  });

  it('registers one loading listener and broadcasts once when the Companion window finishes loading', () => {
    const primary = profile();
    const { coordinator, deps, loadCallbacks, sent } = createHarness(primary, {
      isLoading: () => true,
    });

    expect(coordinator.completeOnce(primary)).toBe(true);
    expect(coordinator.completeOnce(primary)).toBe(false);
    expect(loadCallbacks).toHaveLength(1);
    expect(sent).toEqual([]);
    loadCallbacks[0]();
    expect(sent).toEqual([primary]);
    expect(coordinator.getState().completedCompanionId).toBe(primary.id);
    expect(deps.ensureCompanionWindow).toHaveBeenCalledTimes(1);
  });

  it('clears a pending loading broadcast without completing when the Companion window is destroyed', () => {
    const primary = profile();
    const { coordinator, loadCallbacks, sent, errors } = createHarness(primary, {
      isLoading: () => true,
      isDestroyed: () => true,
    });

    expect(coordinator.completeOnce(primary)).toBe(true);
    loadCallbacks[0]();
    expect(sent).toEqual([]);
    expect(coordinator.getState().completedCompanionId).toBeNull();
    expect(coordinator.getState().pendingCompletionBroadcastFor).toBeNull();
    expect(errors.some((entry) => entry.message.includes('destroyed'))).toBe(true);
  });

  it('allows retry after post-commit window failure without marking onboarding completed', () => {
    const primary = profile();
    const { coordinator, deps } = createHarness(primary);
    vi.mocked(deps.ensureCompanionWindow).mockImplementationOnce(() => {
      throw new Error('window creation failed');
    });

    expect(() => coordinator.completeOnce(primary)).toThrow('window creation failed');
    expect(coordinator.getState().completedCompanionId).toBeNull();
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();

    expect(coordinator.completeOnce(primary)).toBe(true);
    expect(coordinator.getState().completedCompanionId).toBe(primary.id);
  });

  it('rejects invalid or non-primary compatibility completion attempts before side effects', () => {
    const { coordinator, deps } = createHarness(profile('primary'));

    expect(() => coordinator.completeOnce(profile('other'))).toThrow('persisted primary');
    expect(deps.ensureCompanionWindow).not.toHaveBeenCalled();
    expect(deps.closeCreationWindow).not.toHaveBeenCalled();
  });
});
