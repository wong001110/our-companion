import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 12 * 60_000,
  retries: 0,
  // Each spec owns a separate Electron process and OS-level profile. Serial execution
  // prevents launch races on macOS while retaining explicit profile isolation.
  workers: 1,
  use: { trace: 'off', screenshot: 'off', video: 'off' },
  reporter: [['list']],
});
