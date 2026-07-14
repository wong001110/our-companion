import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/smoke',
  timeout: 12 * 60_000,
  retries: 0,
  use: { trace: 'off', screenshot: 'off', video: 'off' },
  reporter: [['list']],
});
