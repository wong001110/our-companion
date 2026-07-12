import { describe, expect, it } from 'vitest';
import { resolveAnimationFallback, resolveCompanionAnimation, resolveTalkAnimation, resolveWalkDirection } from './animationSelection';

const state = (overrides: Record<string, unknown>) => ({ characterId: 'companion', coreState: 'idle', intent: 'waiting', emotion: {}, ...overrides } as any);

describe('animation selection', () => {
  it('resolves all eight browser-coordinate walking directions and a dead zone', () => {
    expect(resolveWalkDirection(100, 0)).toBe('Walk_Right'); expect(resolveWalkDirection(-100, 0)).toBe('Walk_Left');
    expect(resolveWalkDirection(0, -100)).toBe('Walk_Up'); expect(resolveWalkDirection(0, 100)).toBe('Walk_Down');
    expect(resolveWalkDirection(100, -100)).toBe('Walk_UpRight'); expect(resolveWalkDirection(-100, -100)).toBe('Walk_UpLeft');
    expect(resolveWalkDirection(100, 100)).toBe('Walk_DownRight'); expect(resolveWalkDirection(-100, 100)).toBe('Walk_DownLeft');
    expect(resolveWalkDirection(0, 0)).toBeNull(); expect(resolveWalkDirection(4, 3)).toBeNull();
  });

  it('prioritizes drag and walking over idle, stale runtime intent, and life activity', () => {
    expect(resolveCompanionAnimation({ dragState: 'dragging', idleAnimation: 'Idle_Breathe' }).name).toBe('Drag_Hold');
    expect(resolveCompanionAnimation({ userIsTyping: true, idleAnimation: 'Idle_Breathe' }).name).toBe('Waiting_Response');
    expect(resolveCompanionAnimation({ state: state({ lifeActivity: 'listening_music' }) }).name).toBe('Music_Idle');
    expect(resolveCompanionAnimation({ state: state({ animationIntent: 'Music_Idle' }), movementAnimation: 'Walk_UpLeft' }).name).toBe('Walk_UpLeft');
    expect(resolveCompanionAnimation({ state: state({ coreState: 'walking', intent: 'wandering', animationIntent: 'Music_Idle' }) }).name).toBe('Walk_Right');
    expect(resolveCompanionAnimation({ state: state({ coreState: 'walking', intent: 'wandering', animationIntent: 'Walk_UpLeft' }) }).name).toBe('Walk_UpLeft');
    expect(resolveCompanionAnimation({ movementAnimation: 'Walk_UpLeft', dragState: 'dragging' }).name).toBe('Drag_Hold');
  });

  it('prioritizes session animation over life activity and releases it to idle', () => {
    expect(resolveCompanionAnimation({ state: state({ coreState: 'listening', lifeActivity: 'listening_music' }) }).name).toBe('Listening');
    expect(resolveCompanionAnimation({ state: state({ coreState: 'thinking', lifeActivity: 'sleeping' }) }).name).toBe('Think');
    expect(resolveCompanionAnimation({ state: state({ coreState: 'talking', lifeActivity: 'sleeping', emotion: { happy: 80 } }) }).name).toBe('Talk_Happy');
    expect(resolveCompanionAnimation({ state: state({ coreState: 'idle', animationIntent: undefined }) }).name).toBe('Idle_Neutral');
  });

  it('selects emotional talk variants and real availability fallbacks', () => {
    expect(resolveTalkAnimation({ concerned: 70 } as any)).toBe('Talk_Concerned');
    expect(resolveTalkAnimation({ happy: 70 } as any)).toBe('Talk_Happy');
    expect(resolveTalkAnimation({ focused: 70 } as any)).toBe('Talk_Thinking');
    expect(resolveAnimationFallback('Walk_UpLeft', new Set(['Walk_Left'] as any))).toBe('Walk_Left');
    expect(resolveAnimationFallback('Talk_Happy', new Set(['Talk_Neutral'] as any))).toBe('Talk_Neutral');
  });
});
