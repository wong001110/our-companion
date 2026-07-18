import { describe, expect, it, vi } from 'vitest';
import { executeActionStep, executeTool, previewTool, type ToolAdapters } from './index';

function makeAdapters(): ToolAdapters {
  return {
    openUrl: vi.fn().mockResolvedValue(undefined),
    openApp: vi.fn().mockResolvedValue(undefined),
    searchWeb: vi.fn().mockResolvedValue(undefined),
    browserNavigation: vi.fn().mockResolvedValue(undefined),
  };
}

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

  it('executes an open-tab ActionStep after the Action orchestrator resolved permission', async () => {
    const adapters = makeAdapters();
    const result = await executeActionStep(
      'browser_navigation',
      { action: 'open_tab', url: 'https://example.com' },
      adapters,
    );
    expect(result.status).toBe('executed');
    expect(adapters.browserNavigation).toHaveBeenCalledWith('open_tab', 'https://example.com');
  });

  it('blocks an unknown tool at runtime', async () => {
    const adapters = makeAdapters();
    const input = { toolName: 'run_shell', args: {} } as never;

    const preview = previewTool(input);
    const result = await executeTool(input, adapters);

    expect(preview.allowed).toBe(false);
    expect(preview.blockedReason).toContain('Unknown tool');
    expect(result.status).toBe('blocked');
    expect(adapters.openUrl).not.toHaveBeenCalled();
    expect(adapters.openApp).not.toHaveBeenCalled();
    expect(adapters.searchWeb).not.toHaveBeenCalled();
    expect(adapters.browserNavigation).not.toHaveBeenCalled();
  });

  it('does not report adapter failures as executed', async () => {
    const adapters = makeAdapters();
    vi.mocked(adapters.openUrl).mockRejectedValue(new Error('network error'));

    const result = await executeActionStep('open_url', { url: 'https://example.com' }, adapters);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('network error');
    expect(result.recoverable).toBe(false);
  });

  it('preserves an adapter explicit recoverable classification', async () => {
    const adapters = makeAdapters();
    const transientError = Object.assign(new Error('temporary outage'), { recoverable: true });
    vi.mocked(adapters.openUrl).mockRejectedValue(transientError);

    const result = await executeActionStep('open_url', { url: 'https://example.com' }, adapters);

    expect(result.status).toBe('failed');
    expect(result.recoverable).toBe(true);
  });
});
