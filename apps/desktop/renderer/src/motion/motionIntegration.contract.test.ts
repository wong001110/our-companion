import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shell = readFileSync(new URL('../app/CompanionEntryShell.tsx', import.meta.url), 'utf8');
const canvas = readFileSync(new URL('../ui/CompanionCanvas.tsx', import.meta.url), 'utf8');
const animator = readFileSync(new URL('../character/SpriteAnimator.ts', import.meta.url), 'utf8');

describe('local and remote shared-motion integration contract', () => {
  it('removes duration-clamped local movement and uses the scene controller', () => {
    expect(shell).toContain('sceneController.step(companion.id');
    expect(shell).toContain('<RemoteVisitorLayer controller={sceneController}');
    expect(shell).not.toContain('clamp((distance / 115) * 1000, 900, 5200)');
    expect(shell).not.toContain('easeInOut(progress)');
  });

  it('gives drag and display recovery explicit teleport-invariant exclusions', () => {
    expect(shell).toContain("updatePosition(companion.id, next, 'user_drag')");
    expect(shell).toContain("updatePosition(companion.id, clamped, 'display_recovery')");
  });

  it('synchronizes walk playback without changing one-shot animation timing', () => {
    expect(shell).toContain('walkPlaybackRate={computeWalkPlaybackRate(actualWalkSpeed)}');
    expect(canvas).toContain("animation.name.startsWith('Walk_') ? walkPlaybackRate : 1");
    expect(animator).toContain('setPlaybackRate(rate: number)');
  });
});
