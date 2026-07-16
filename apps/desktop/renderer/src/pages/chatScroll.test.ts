import { describe, expect, it } from 'vitest';
import { chatScrollBehavior, isChatNearBottom } from './chatScroll';

describe('Chat conditional auto-scroll', () => {
  it('only follows new messages while the reader is near the bottom', () => {
    expect(isChatNearBottom({ scrollHeight: 1_000, scrollTop: 620, clientHeight: 300 })).toBe(true);
    expect(isChatNearBottom({ scrollHeight: 1_000, scrollTop: 500, clientHeight: 300 })).toBe(false);
  });

  it('removes animated scrolling when Reduced Motion is enabled', () => {
    expect(chatScrollBehavior(false)).toBe('smooth');
    expect(chatScrollBehavior(true)).toBe('auto');
  });
});
