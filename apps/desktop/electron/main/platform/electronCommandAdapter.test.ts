import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn(async () => undefined) },
}));

import {
  openKnownApp,
  performBrowserNavigation,
  searchUrl,
} from './electronCommandAdapter';

describe('Electron command adapter', () => {
  it('opens approved macOS applications by display name and propagates launch failures', async () => {
    const execute = vi.fn(async () => undefined);
    await expect(openKnownApp('brave', { platform: 'darwin', execute }))
      .resolves.toEqual({ appName: 'brave', started: true });
    expect(execute).toHaveBeenCalledWith('/usr/bin/open', ['-a', 'Brave Browser']);

    await expect(openKnownApp('unknown-app', { platform: 'darwin', execute }))
      .rejects.toThrow(/allowlist/i);
    await expect(openKnownApp('safari', {
      platform: 'darwin',
      execute: async () => { throw new Error('launch failed'); },
    })).rejects.toThrow('launch failed');
  });

  it('performs real macOS back, forward, and reload commands instead of returning a stub', async () => {
    for (const action of ['go_back', 'go_forward', 'reload'] as const) {
      const execute = vi.fn(async () => undefined);
      await expect(performBrowserNavigation(action, undefined, { platform: 'darwin', execute }))
        .resolves.toEqual({ action, handledBy: 'macos_accessibility' });
      expect(execute).toHaveBeenCalledWith('/usr/bin/osascript', [
        '-e',
        expect.stringContaining('Brave Browser'),
      ]);
    }
  });

  it('uses Electron for a validated tab URL and reports unsupported platforms/actions', async () => {
    const openExternal = vi.fn(async () => undefined);
    await expect(performBrowserNavigation('open_tab', 'https://example.com', { openExternal }))
      .resolves.toEqual({ action: 'open_tab', handledBy: 'electron_shell' });
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
    await expect(performBrowserNavigation('reload', undefined, { platform: 'linux' }))
      .rejects.toThrow(/unavailable/i);
    await expect(performBrowserNavigation('close_tab', undefined, { platform: 'darwin' }))
      .rejects.toThrow(/unsupported/i);
  });

  it('encodes search queries without changing the selected target', () => {
    expect(searchUrl('motion & memory', 'github')).toBe(
      'https://github.com/search?q=motion%20%26%20memory',
    );
  });
});
