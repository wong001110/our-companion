import { describe, expect, it } from 'vitest';
import { previewTool } from './index';

describe('tool engine', () => {
  it('blocks high-risk actions', () => {
    const preview = previewTool({ toolName: 'search_web', args: { query: 'login and submit payment form' } });
    expect(preview.allowed).toBe(false);
  });

  it('allows safe URL opening', () => {
    const preview = previewTool({ toolName: 'open_url', args: { url: 'https://example.com' } });
    expect(preview.allowed).toBe(true);
    expect(preview.requiresConfirmation).toBe(false);
  });

  it('requires confirmation for opening a browser tab', () => {
    const preview = previewTool({ toolName: 'browser_navigation', args: { action: 'open_tab', url: 'https://example.com' } });
    expect(preview.allowed).toBe(true);
    expect(preview.requiresConfirmation).toBe(true);
  });
});
