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
  createRuntimeContext,
  canTransition,
  transitionRuntimeState,
  submitBehaviour,
  startBehaviour,
  completeBehaviour,
  createAttentionState,
  determinePresenceMode,
  shouldAllowInterruption,
  PerformanceEngine,
  defaultPerformanceScripts,
} from './index';

const testCharacterPackage: CharacterPackage = {
  id: 'test-companion', name: 'Test Companion', version: '1.0.0',
  personalityPreset: { traits: ['curious'], corePersonality: ['warm'], expertise: [], speakingStyle: { tone: 'warm', length: 'short', avoid: [] } },
  assetManifest: { assets: [] },
  animationManifest: { required: ['Idle_Neutral'], mappings: { Idle_Neutral: 'Idle_Neutral' } },
};

describe('character engine', () => {
  it('decays and clamps emotions', () => {
    const decayed = decayEmotion({
      neutral: 70,
      curious: 100,
      happy: 100,
      excited: 100,
      shy: 100,
      confused: 100,
      focused: 100,
      tired: 10,
      proud: 100,
      concerned: 100
    });

    expect(decayed.excited).toBe(90);
    expect(decayed.happy).toBe(95);
    expect(decayed.curious).toBe(97);
  });

  it('prioritizes user commands as helping task intent', () => {
    const state = createInitialCharacterState('test-companion');
    expect(selectIntent(state, { userCommand: 'open chrome', availableDiscoveries: [{} as never] })).toBe('helping_task');
  });

  it('moves task loop through executing states', () => {
    expect(transitionState('idle', 'helping_task', 'focused')).toBe('thinking');
    expect(transitionState('thinking', 'helping_task', 'focused')).toBe('executing');
    expect(transitionState('executing', 'helping_task', 'focused')).toBe('returning');
  });

  it('falls back to base animation when emotional variant is missing', () => {
    expect(animationFor('sharing_discovery', 'discovering', 'excited', ['Idle_Neutral', 'Expedition_Present'])).toBe('Expedition_Present');
  });

  it('applies discovery acceptance emotion modifiers', () => {
    const next = applyEmotionEvent(createInitialCharacterState('test-companion').emotion, 'user_accepts_discovery');
    expect(next.happy).toBeGreaterThan(20);
    expect(next.proud).toBeGreaterThan(0);
  });

  it('resolves discovery decisions into curious presentation state', () => {
    const state = resolveCharacterState({ action: 'speak', priority: 'high' });
    const request = planAnimationRequest({
      behaviour: 'present_discovery',
      characterId: 'test-companion',
      mood: state.mood,
      reason: 'Decision selected speak.'
    });

    expect(state.mood).toBe('curious');
    expect(state.intent).toBe('present_discovery');
    expect(request.animationKey).toBe('Expedition_Present');
  });

  it('plans task performance without executing commands', () => {
    const script = planPerformanceScript('action_1', 'success');

    expect(script.actionId).toBe('action_1');
    expect(script.steps.map((step) => step.animationKey)).toEqual(['Expedition_Prepare', 'Work_Focus', 'Expedition_Return', 'Expedition_Return']);
  });

  it('keeps idle animation loops interrupt-safe', () => {
    expect(nextAnimationState('Idle_Neutral')).toBe('Think');
    expect(nextAnimationState('Walk_UpLeft')).toBe('Idle_Neutral');
    expect(planAnimationRequest({ characterId: 'test-companion', behaviour: 'idle', mood: 'neutral', reason: 'Idle loop.' }).interruptSafe).toBe(true);
  });

  it('requires an explicitly registered package', () => {
    expect(() => new CharacterPackageRegistry().active()).toThrow('No active Character package');
    const registry = new CharacterPackageRegistry([testCharacterPackage]);
    registry.activate(testCharacterPackage.id);
    const runtime = createRuntimeDescriptor(registry.active());

    expect(runtime.packageId).toBe(testCharacterPackage.id);
    expect(runtime.defaultAnimation).toBe('Idle_Neutral');
  });

  it('validates custom packages and catches missing required assets', () => {
    const invalid = {
      ...testCharacterPackage,
      id: 'custom',
      name: 'Custom',
      animationManifest: {
        required: testCharacterPackage.animationManifest.required,
        mappings: { ...testCharacterPackage.animationManifest.mappings, Idle_Neutral: '' }
      }
    };
    const validation = validateCharacterPackage(invalid);

    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'missing_idle')).toBe(true);
  });

  it('imports, exports, and loads a custom package without changing brain logic', () => {
    const custom = {
      ...testCharacterPackage,
      id: 'mira',
      name: 'Mira',
      personalityPreset: {
        ...testCharacterPackage.personalityPreset,
        traits: ['playful', 'gentle']
      }
    };
    const imported = importCharacterPackage(exportCharacterPackage(custom));
    const loaded = loadCharacterPackage(imported);

    expect(imported.id).toBe('mira');
    expect(loaded.validation.valid).toBe(true);
    expect(loaded.runtime.personalityPreset.traits).toContain('playful');
  });
});

describe('character runtime v2', () => {
  it('creates runtime context', () => {
    const context = createRuntimeContext({ characterId: 'ann' });
    expect(context.characterId).toBe('ann');
    expect(context.state).toBe('idle');
    expect(context.queuedBehaviours).toHaveLength(0);
  });

  it('validates state transitions', () => {
    expect(canTransition('idle', 'thinking')).toBe(true);
    expect(canTransition('idle', 'error')).toBe(true);
    expect(canTransition('sleeping', 'thinking')).toBe(false);
  });

  it('transitions state safely', () => {
    expect(transitionRuntimeState('idle', 'thinking')).toBe('thinking');
    expect(transitionRuntimeState('sleeping', 'thinking')).toBe('sleeping');
  });

  it('submits behaviour to queue', () => {
    const context = createRuntimeContext({ characterId: 'ann' });
    const request = {
      id: 'behaviour_1',
      source: 'brain' as const,
      type: 'think' as const,
      priority: 0.8,
      interruptible: true,
      createdAt: new Date().toISOString(),
    };

    const result = submitBehaviour(context, request);
    expect(result.accepted).toBe(true);
  });

  it('rejects duplicate behaviour types', () => {
    const context = {
      ...createRuntimeContext({ characterId: 'ann' }),
      queuedBehaviours: [{
        id: 'behaviour_1',
        source: 'brain' as const,
        type: 'think' as const,
        priority: 0.8,
        interruptible: true,
        createdAt: new Date().toISOString(),
      }],
    };
    const request = {
      id: 'behaviour_2',
      source: 'brain' as const,
      type: 'think' as const,
      priority: 0.7,
      interruptible: true,
      createdAt: new Date().toISOString(),
    };

    const result = submitBehaviour(context, request);
    expect(result.accepted).toBe(false);
  });

  it('starts behaviour and updates state', () => {
    const context = createRuntimeContext({ characterId: 'ann' });
    const request = {
      id: 'behaviour_1',
      source: 'brain' as const,
      type: 'think' as const,
      priority: 0.8,
      interruptible: true,
      createdAt: new Date().toISOString(),
    };

    const { context: updated } = startBehaviour(context, request);
    expect(updated.state).toBe('thinking');
    expect(updated.currentBehaviour).toBeTruthy();
  });

  it('completes behaviour and returns to idle', () => {
    const context = createRuntimeContext({ characterId: 'ann' });
    const request = {
      id: 'behaviour_1',
      source: 'brain' as const,
      type: 'think' as const,
      priority: 0.8,
      interruptible: true,
      createdAt: new Date().toISOString(),
    };

    const { context: started } = startBehaviour(context, request);
    const completed = completeBehaviour(started);
    expect(completed.state).toBe('idle');
    expect(completed.currentBehaviour?.status).toBe('completed');
  });
});

describe('presence system', () => {
  it('creates attention state', () => {
    const attention = createAttentionState();
    expect(attention.userActive).toBe(true);
    expect(attention.doNotDisturb).toBe(false);
  });

  it('determines presence mode from context', () => {
    const context = createRuntimeContext({ characterId: 'ann' });
    const attention = createAttentionState();

    const mode = determinePresenceMode(context, attention);
    expect(mode).toBe('available');
  });

  it('blocks interruption when do not disturb', () => {
    const attention = createAttentionState();
    attention.doNotDisturb = true;

    expect(shouldAllowInterruption(attention, 0.3)).toBe(false);
  });

  it('allows low-cost interruption when idle', () => {
    const attention = createAttentionState();
    attention.userActive = false;

    expect(shouldAllowInterruption(attention, 0.2)).toBe(true);
  });
});

describe('performance engine', () => {
  it('loads and plays script', () => {
    const engine = new PerformanceEngine();
    const script = defaultPerformanceScripts[0];

    engine.loadScript(script);
    const execution = engine.playScript(script.id);

    expect(execution).toBeTruthy();
    expect(execution?.status).toBe('playing');
  });

  it('completes execution', () => {
    const engine = new PerformanceEngine();
    const script = defaultPerformanceScripts[0];

    engine.loadScript(script);
    const execution = engine.playScript(script.id);

    engine.completeExecution(execution!.id);
    const active = engine.getActiveExecution();
    expect(active).toBeUndefined();
  });

  it('cancels execution', () => {
    const engine = new PerformanceEngine();
    const script = defaultPerformanceScripts[0];

    engine.loadScript(script);
    const execution = engine.playScript(script.id);

    engine.cancelExecution(execution!.id);
    expect(execution!.status).toBe('playing');
  });
});
