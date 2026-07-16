import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PaperCard } from './NotebookPrimitives';

function renderPaperCard(props: { tape?: boolean; compact?: boolean; className?: string } = {}): string {
  return renderToStaticMarkup(createElement(PaperCard, { ...props, title: 'Card title', children: createElement('p', null, 'Card body') }));
}

describe('PaperCard tape semantics', () => {
  it('keeps a plain card untaped with a conventional heading', () => {
    const markup = renderPaperCard();

    expect(markup).toContain('class="paper-card"');
    expect(markup).not.toContain('paper-card-taped');
    expect(markup).toContain('<h2>Card title</h2>');
    expect(markup).not.toContain('notebook-section-title');
  });

  it('adds the stable taped hook only when tape is requested', () => {
    const markup = renderPaperCard({ tape: true });

    expect(markup).toContain('class="paper-card paper-card-taped"');
    expect(markup).toContain('class="notebook-section-title"');
  });

  it('preserves compact and custom classes for taped cards', () => {
    const markup = renderPaperCard({ tape: true, compact: true, className: 'custom-card' });

    expect(markup).toContain('class="paper-card paper-card-taped paper-card-compact custom-card"');
  });
});

describe('PaperCard tape policy', () => {
  it('keeps photo-card tape while removing the unconditional paper-card selector', () => {
    const stylesheet = readFileSync(new URL('../styles/panel-layout.css', import.meta.url), 'utf8');

    expect(stylesheet).toMatch(/\.paper-card-taped::after,\r?\n\.paper-photo-card::after/);
    expect(stylesheet).not.toContain('.paper-card::after');
  });

  it('keeps operational Settings and Published Companion call sites untaped', () => {
    const settingsSource = readFileSync(new URL('../pages/SettingsPage.tsx', import.meta.url), 'utf8');
    const publishedCompanionSource = readFileSync(new URL('../features/social/PublishedCompanionSection.tsx', import.meta.url), 'utf8');

    expect(settingsSource).not.toMatch(/<PaperCard\b[^>]*\btape\b/);
    expect(publishedCompanionSource).not.toMatch(/<PaperCard\b[^>]*\btape\b/);
  });
});
