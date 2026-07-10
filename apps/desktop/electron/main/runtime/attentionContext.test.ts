import { describe, expect, it } from 'vitest';
import { attentionToUserContext, buildUserAttentionContext } from './attentionContext';

describe('attentionContext', () => {
  it('does not invent fatigue score', () => {
    const attention = buildUserAttentionContext({
      conversationActive: false,
      companionDragging: false
    });
    const ctx = attentionToUserContext(attention, []);
    expect(ctx.fatigueScore).toBeUndefined();
  });

  it('respects explicit focus mode', () => {
    const attention = buildUserAttentionContext({
      conversationActive: false,
      companionDragging: false,
      explicitMode: 'focused'
    });
    const ctx = attentionToUserContext(attention, []);
    expect(ctx.mode).toBe('focused');
  });

  it('uses chatting mode when conversation active without explicit mode', () => {
    const attention = buildUserAttentionContext({
      conversationActive: true,
      companionDragging: false
    });
    const ctx = attentionToUserContext(attention, []);
    expect(ctx.mode).toBe('chatting');
  });
});
