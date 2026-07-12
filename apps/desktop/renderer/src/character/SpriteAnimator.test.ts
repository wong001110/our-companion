import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpriteAnimator } from './SpriteAnimator';

function prepared(loop: boolean, onComplete = vi.fn()) {
  const animator = new SpriteAnimator({ sheet: 'sheet.png', frameWidth: 10, frameHeight: 10, frameMs: 1, loop }, { onComplete }) as any;
  animator.context = { clearRect: vi.fn(), drawImage: vi.fn(), setTransform: vi.fn() };
  animator.viewport = { width: 10, height: 10 };
  animator.image = { complete: true, naturalWidth: 20 };
  animator.columns = 2;
  animator.rows = 1;
  animator.totalFrames = 2;
  animator.frameWidth = 10;
  animator.frameHeight = 10;
  return { animator, onComplete };
}

afterEach(() => vi.unstubAllGlobals());

describe('SpriteAnimator playback', () => {
  it('loops from the final frame to the first frame', () => {
    vi.stubGlobal('window', { clearInterval: vi.fn() });
    const { animator } = prepared(true);
    animator.drawFrame();
    expect(animator.frameIndex).toBe(1);
    animator.drawFrame();
    expect(animator.frameIndex).toBe(0);
  });

  it('holds a one-shot final frame and completes exactly once', () => {
    vi.stubGlobal('window', { clearInterval: vi.fn() });
    const { animator, onComplete } = prepared(false);
    animator.interval = 1;
    animator.drawFrame();
    animator.drawFrame();
    animator.drawFrame();
    expect(animator.frameIndex).toBe(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not complete after destruction', () => {
    vi.stubGlobal('window', { clearInterval: vi.fn() });
    const { animator, onComplete } = prepared(false);
    animator.destroy();
    animator.drawFrame();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reports invalid frame counts rather than starting playback', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1, clearInterval: vi.fn(), setInterval: vi.fn() });
    const onError = vi.fn();
    const animator = new SpriteAnimator({ sheet: 'sheet.png', frameWidth: 10, frameHeight: 10, frameMs: 1 }, { onError }) as any;
    animator.totalFrames = 0;
    animator.columns = 0;
    animator.start({ getContext: vi.fn() }, { width: 10, height: 10 });
    expect(onError).toHaveBeenCalledOnce();
  });

  it('stops an existing interval before starting again', () => {
    const clearInterval = vi.fn();
    vi.stubGlobal('window', { devicePixelRatio: 1, clearInterval, setInterval: vi.fn(() => 1) });
    const { animator } = prepared(true);
    animator.start({ style: {}, getContext: vi.fn(() => animator.context) }, { width: 10, height: 10 });
    animator.start({ style: {}, getContext: vi.fn(() => animator.context) }, { width: 10, height: 10 });
    expect(clearInterval).toHaveBeenCalledWith(1);
  });
});
