import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layer = readFileSync(new URL('./RemoteVisitorLayer.tsx', import.meta.url), 'utf8');

describe('RemoteVisitorLayer departure contract', () => {
  it('keeps a visitor component mounted across active to departing state', () => {
    expect(layer).toContain('key={visitor.sessionId}');
    expect(layer).not.toContain('key={departing ? `departing:${visitor.sessionId}`');
  });

  it('uses the shared controller and retains session positions across transient removal', () => {
    expect(layer).toContain('SceneOccupancyController');
    expect(layer).toContain('controller.step(actorId, target, elapsed)');
    expect(layer).toContain('continuityPosition={positions[visitor.sessionId]}');
    expect(layer).not.toContain('Object.fromEntries(Object.entries(current).filter');
    expect(layer).not.toContain('resolveVisitorPosition({ x: current.x');
  });
});
