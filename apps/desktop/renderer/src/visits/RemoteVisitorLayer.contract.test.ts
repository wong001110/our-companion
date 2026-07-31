import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layer = readFileSync(new URL('./RemoteVisitorLayer.tsx', import.meta.url), 'utf8');

describe('RemoteVisitorLayer room presentation contract', () => {
  it('keeps each participant component mounted across active to departing state', () => {
    expect(layer).toContain('key={visitor.runtimeId}');
    expect(layer).toContain('continuityPosition={positions[visitor.runtimeId]}');
    expect(layer).not.toContain('key={departing ?');
  });

  it('uses the shared controller and pauses wandering while a participant speaks', () => {
    expect(layer).toContain('SceneOccupancyController');
    expect(layer).toContain('controller.step(actorId, target, elapsed)');
    expect(layer).toContain('if (!runtime || runtime.runtimeId !== initialVisitor.runtimeId || runtime.presentation) return');
    expect(layer).toContain('remote-visitor-speech-bubble');
    expect(layer).toContain('acknowledgePresentation(turnId)');
  });
});
