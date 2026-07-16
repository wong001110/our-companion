import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NOTEBOOK_DOODLE_ASSETS, NotebookDoodle, NotebookPage, type NotebookDoodleRole } from './NotebookPrimitives';

describe('NotebookDoodle decoration policy', () => {
  it('centralizes the selected runtime asset for every narrative role', () => {
    expect(NOTEBOOK_DOODLE_ASSETS).toEqual({
      authorship: './assets/panel/generated/notebook/authorship-pencil.png',
      conversation: './assets/panel/generated/notebook/conversation-letter.png',
      discovery: './assets/panel/doodles/sparkle.png',
      journey: './assets/panel/doodles/map.png',
      memory: './assets/panel/doodles/heart.png',
    });
  });

  it('is decorative, non-draggable, and hides itself when an asset fails', () => {
    const element = NotebookDoodle({ role: 'authorship' });
    const markup = renderToStaticMarkup(element);
    const image = element.props as {
      onError: (event: { currentTarget: { hidden: boolean } }) => void;
    };
    const target = { hidden: false };

    image.onError({ currentTarget: target });

    expect(markup).toContain('alt=""');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('draggable="false"');
    expect(target.hidden).toBe(true);
  });

  it('keeps the page marker optional and renders at most one header doodle', () => {
    const withoutMarker = renderToStaticMarkup(createElement(NotebookPage, {
      eyebrow: 'Notebook',
      title: 'Page',
      children: createElement('p', null, 'Body'),
    }));
    const withMarker = renderToStaticMarkup(createElement(NotebookPage, {
      eyebrow: 'Notebook',
      title: 'Page',
      marker: 'memory',
      children: createElement('p', null, 'Body'),
    }));

    expect(withoutMarker).not.toContain('notebook-doodle');
    expect(withMarker.match(/class="notebook-doodle /g)).toHaveLength(1);
  });
});

describe('narrative page marker policy', () => {
  const pages: Array<[string, NotebookDoodleRole]> = [
    ['../pages/HomePage.tsx', 'authorship'],
    ['../pages/ChatPage.tsx', 'conversation'],
    ['../pages/DiscoveriesPage.tsx', 'discovery'],
    ['../pages/JourneysPage.tsx', 'journey'],
    ['../pages/MemoriesPage.tsx', 'memory'],
  ];

  it.each(pages)('assigns one focal marker to %s', (path, role) => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');

    expect(source.match(/\bmarker="[^"]+"/g)).toEqual([`marker="${role}"`]);
  });

  it('replaces the Journeys text placeholder with the centralized map asset', () => {
    const source = readFileSync(new URL('../pages/JourneysPage.tsx', import.meta.url), 'utf8');

    expect(source).not.toContain('doodle-icon');
    expect(source).not.toMatch(/>\s*map\s*</i);
    expect(NOTEBOOK_DOODLE_ASSETS.journey).toBe('./assets/panel/doodles/map.png');
  });
});
