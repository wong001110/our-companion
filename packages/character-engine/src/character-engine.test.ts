import { describe, expect, it } from 'vitest';
import type { CharacterPackage } from '@our-companion/shared';
import {
  animationFor,
  applyEmotionEvent,
  CharacterPackageRegistry,
  createInitialCharacterState,
  createRuntimeDescriptor,
  decayEmotion,
  exportCharacterPackage,
  importCharacterPackage,
  loadCharacterPackage,
  nextAnimationState,
  planAnimationRequest,
  planPerformanceScript,
  resolveCharacterState,
  selectIntent,
  transitionState,
  validateCharacterPackage,
} from './index';

const testPackage: CharacterPackage = {
  id: 'test-companion', name: 'Test Companion', version: '1.0.0',
  personalityPreset: { traits: ['curious'], corePersonality: ['warm'], expertise: [], speakingStyle: { tone: 'warm', length: 'short', avoid: [] } },
  assetManifest: { assets: [] },
  animationManifest: { required: ['Idle_Neutral'], mappings: { Idle_Neutral: 'Idle_Neutral' } },
};

describe('character engine', () => {
  it('calculates emotion, intent, and state transitions without persistence', () => {
    const state = createInitialCharacterState('test-companion');
    expect(selectIntent(state, { userCommand: 'open chrome', availableDiscoveries: [] })).toBe('helping_task');
    expect(transitionState('idle', 'helping_task', 'focused')).toBe('thinking');
    expect(applyEmotionEvent(state.emotion, 'user_accepts_discovery').happy).toBeGreaterThan(state.emotion.happy);
    expect(decayEmotion({ ...state.emotion, excited: 100 }).excited).toBe(90);
  });

  it('plans animation and performance without executing them', () => {
    const resolved = resolveCharacterState({ action: 'share_discovery', priority: 'high' });
    const request = planAnimationRequest({ characterId: 'test-companion', behaviour: 'present_discovery', mood: resolved.mood, reason: 'Present.' });
    const script = planPerformanceScript('action_1', 'success');
    expect(request.animationKey).toBe('Expedition_Present');
    expect(script.steps.map((step) => step.animationKey)).toEqual(['Expedition_Prepare', 'Work_Focus', 'Expedition_Return', 'Expedition_Return']);
    expect(animationFor('sharing_discovery', 'discovering', 'excited', ['Idle_Neutral', 'Expedition_Present'])).toBe('Expedition_Present');
    expect(nextAnimationState('Walk_UpLeft')).toBe('Idle_Neutral');
  });

  it('validates, registers, imports, and loads character packages', () => {
    const registry = new CharacterPackageRegistry([testPackage]);
    registry.activate(testPackage.id);
    expect(createRuntimeDescriptor(registry.active()).defaultAnimation).toBe('Idle_Neutral');
    expect(validateCharacterPackage(testPackage).valid).toBe(true);
    const imported = importCharacterPackage(exportCharacterPackage(testPackage));
    expect(loadCharacterPackage(imported).validation.valid).toBe(true);
  });
});
