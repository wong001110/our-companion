import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const inspector = readFileSync(new URL('./SceneInspectorCard.tsx', import.meta.url), 'utf8');
const toolbar = readFileSync(new URL('./EngineObservatoryToolbar.tsx', import.meta.url), 'utf8');

describe('motion and social inspector contract', () => {
  it('exposes both renderer-local inspector panels', () => {
    expect(toolbar).toContain("{ key: 'motion', label: 'Motion' }");
    expect(toolbar).toContain("{ key: 'social', label: 'Social' }");
    expect(inspector).toContain('data-testid="motion-inspector"');
    expect(inspector).toContain('data-testid="social-inspector"');
  });

  it('shows actor motion, continuity, failures, frame delta, and teleport violations', () => {
    for (const label of ['Scene actors', 'Renderer failures', 'Continuity', 'Largest frame', 'Teleport violations']) {
      expect(inspector).toContain(label);
    }
    expect(inspector).toContain('actor.lastResolution');
    expect(inspector).toContain('actor.replanReason');
  });
});
