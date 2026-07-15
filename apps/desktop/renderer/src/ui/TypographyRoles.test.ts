import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokensCss = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const panelCss = readFileSync(new URL('../styles/panel-layout.css', import.meta.url), 'utf8');
const rootCss = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('Panel typography role policy', () => {
  it('defines separate UI and handwritten semantic tokens', () => {
    expect(tokensCss).toMatch(/--font-ui\s*:/);
    expect(tokensCss).toMatch(/--font-handwritten\s*:\s*["']Xiaolai["']/);
    const uiStack = tokensCss.match(/--font-ui\s*:\s*([^;]+);/)?.[1] ?? '';
    expect(uiStack).not.toMatch(/Xiaolai/);
    expect(uiStack).toMatch(/system-ui/);
  });

  it('scopes operational typography to the Panel and preserves semantic expressive roles', () => {
    expect(panelCss).toMatch(/\.panel-shell\s*{[^}]*font-family:\s*var\(--font-ui\)/s);
    expect(panelCss).toMatch(/\.panel-shell[^}]*button[^}]*font-family:\s*var\(--font-ui\)/s);
    expect(panelCss).toMatch(/\.panel-shell\s+\.notebook-header h1[\s\S]*font-family:\s*var\(--font-handwritten\)/);
    expect(panelCss).toMatch(/\.panel-shell\s+\.notebook-section-title[\s\S]*font-family:\s*var\(--font-handwritten\)/);
    expect(panelCss).toMatch(/\.panel-shell\s+\.sticky-note h3[\s\S]*font-family:\s*var\(--font-handwritten\)/);
    expect(panelCss).not.toMatch(/\.paper-card\s+h2\s*{[^}]*font-family:\s*var\(--font-handwritten\)/s);
  });

  it('keeps the existing non-Panel renderer root on the handwritten role', () => {
    expect(rootCss).toMatch(/:root\s*{[^}]*font-family:\s*var\(--font-handwritten\)/s);
    expect(rootCss).not.toMatch(/:root\s*{[^}]*font-family:\s*var\(--font-ui\)/s);
  });
});
