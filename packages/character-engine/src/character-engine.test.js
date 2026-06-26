import { describe, expect, it } from 'vitest';
import { animationFor, applyEmotionEvent, CharacterPackageRegistry, createInitialCharacterState, createRuntimeDescriptor, decayEmotion, defaultAnnPackage, exportCharacterPackage, importCharacterPackage, loadCharacterPackage, nextAnimationState, planAnimationRequest, planPerformanceScript, resolveCharacterState, selectIntent, transitionState, validateCharacterPackage } from './index';
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
        const state = createInitialCharacterState();
        expect(selectIntent(state, { userCommand: 'open chrome', availableDiscoveries: [{}] })).toBe('helping_task');
    });
    it('moves task loop through executing states', () => {
        expect(transitionState('idle', 'helping_task', 'focused')).toBe('thinking');
        expect(transitionState('thinking', 'helping_task', 'focused')).toBe('executing');
        expect(transitionState('executing', 'helping_task', 'focused')).toBe('returning');
    });
    it('falls back to base animation when emotional variant is missing', () => {
        expect(animationFor('sharing_discovery', 'discovering', 'excited', ['idle', 'discover'])).toBe('discover');
    });
    it('applies discovery acceptance emotion modifiers', () => {
        const next = applyEmotionEvent(createInitialCharacterState().emotion, 'user_accepts_discovery');
        expect(next.happy).toBeGreaterThan(20);
        expect(next.proud).toBeGreaterThan(0);
    });
    it('resolves discovery decisions into curious presentation state', () => {
        const state = resolveCharacterState({ action: 'speak', priority: 'high' });
        const request = planAnimationRequest({
            behaviour: 'present_discovery',
            mood: state.mood,
            reason: 'Decision selected speak.'
        });
        expect(state.mood).toBe('curious');
        expect(state.intent).toBe('present_discovery');
        expect(request.animationKey).toBe('discovery_present');
    });
    it('plans task performance without executing commands', () => {
        const script = planPerformanceScript('action_1', 'success');
        expect(script.actionId).toBe('action_1');
        expect(script.steps.map((step) => step.animationKey)).toEqual(['task_start', 'typing', 'task_success', 'return']);
    });
    it('keeps idle animation loops interrupt-safe', () => {
        expect(nextAnimationState('idle')).toBe('curious');
        expect(planAnimationRequest({ behaviour: 'idle', mood: 'neutral', reason: 'Idle loop.' }).interruptSafe).toBe(true);
    });
    it('loads default Ann through the package registry', () => {
        const registry = new CharacterPackageRegistry();
        const runtime = createRuntimeDescriptor(registry.active());
        expect(runtime.packageId).toBe('ann');
        expect(runtime.defaultAnimation).toBe('idle_laptop');
    });
    it('validates custom packages and catches missing required assets', () => {
        const invalid = {
            ...defaultAnnPackage,
            id: 'custom',
            name: 'Custom',
            animationManifest: {
                required: defaultAnnPackage.animationManifest.required,
                mappings: { ...defaultAnnPackage.animationManifest.mappings, idle: '' }
            }
        };
        const validation = validateCharacterPackage(invalid);
        expect(validation.valid).toBe(false);
        expect(validation.issues.some((issue) => issue.code === 'missing_idle')).toBe(true);
    });
    it('imports, exports, and loads a custom package without changing brain logic', () => {
        const custom = {
            ...defaultAnnPackage,
            id: 'mira',
            name: 'Mira',
            personalityPreset: {
                ...defaultAnnPackage.personalityPreset,
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
