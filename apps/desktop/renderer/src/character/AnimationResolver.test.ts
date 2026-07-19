import { describe, expect, it } from 'vitest';
import { resolveAnimation } from './AnimationResolver';

describe('AnimationResolver shared fallback chains', () => {
  it('walks the shared semantic chain in order', () => {
    expect(resolveAnimation({ intent: 'Talk_Happy' }, ['Talk_Neutral', 'Idle_Neutral'])).toEqual({
      clip: 'Talk_Neutral',
      intent: 'Talk_Happy',
      usedFallback: true,
      fallbackChain: ['Talk_Happy', 'Talk_Neutral'],
    });
    expect(resolveAnimation({ intent: 'Talk_Happy' }, ['Idle_Neutral'])).toEqual({
      clip: 'Idle_Neutral',
      intent: 'Talk_Happy',
      usedFallback: true,
      fallbackChain: ['Talk_Happy', 'Talk_Neutral', 'Idle_Neutral'],
    });
  });

  it('does not reintroduce category fallbacks outside the manifest chain', () => {
    expect(resolveAnimation({ intent: 'Expedition_Present' }, ['Think', 'Idle_Neutral'])).toMatchObject({
      clip: 'Idle_Neutral',
      fallbackChain: ['Expedition_Present', 'Talk_Neutral', 'Idle_Neutral'],
    });
    expect(resolveAnimation({ intent: 'Waiting_Response' }, ['Listening', 'Idle_Neutral'])).toMatchObject({
      clip: 'Idle_Neutral',
      fallbackChain: ['Waiting_Response', 'Idle_Neutral'],
    });
  });

  it('preserves directional walking fallback before idle', () => {
    expect(resolveAnimation({ intent: 'Walk_UpLeft' }, ['Walk_Left', 'Idle_Neutral'])).toMatchObject({
      clip: 'Walk_Left',
      fallbackChain: ['Walk_UpLeft', 'Walk_Left'],
    });
  });
});
