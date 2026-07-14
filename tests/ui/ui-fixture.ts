import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const clientRoot = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const electronExecutable = require('electron') as string;
const configuredRunId = process.env.OUR_COMPANION_UI_QA_RUN_ID?.replace(/[^a-zA-Z0-9_-]/g, '');

export class UiElectronFixture {
  private app?: ElectronApplication;
  readonly artifactDir = path.join(clientRoot, 'artifacts', 'ui-qa', configuredRunId || `${Date.now()}-${randomUUID().slice(0, 8)}`);
  private readonly userDataDir = path.join(os.tmpdir(), `our-companion-ui-${randomUUID()}`);

  async launch(): Promise<void> {
    await fs.mkdir(this.artifactDir, { recursive: true });
    this.app = await electron.launch({
      executablePath: electronExecutable,
      // Software rendering avoids intermittent transparent-window compositor corruption
      // in repeated Playwright screenshots. This is test-only; production GPU behavior
      // remains covered by manual physical verification.
      args: ['--disable-gpu', path.join(clientRoot, 'apps', 'desktop')],
      env: { ...process.env, OUR_COMPANION_SMOKE_TEST: '1', OUR_COMPANION_SMOKE_ROLE: 'visitor_owner', OUR_COMPANION_USER_DATA_DIR: this.userDataDir, OUR_COMPANION_SMOKE_SERVER_URL: 'http://127.0.0.1:9' },
    });
    const firstWindow = await this.app.firstWindow();
    await firstWindow.evaluate(async () => window.ourCompanion.smoke?.bootstrapFixtureCompanion());
    await this.mainWindow();
  }

  async mainWindow(): Promise<Page> {
    return this.waitForWindow('mode=companion');
  }

  async panelWindow(): Promise<Page> {
    const main = await this.mainWindow();
    await main.evaluate(async () => window.ourCompanion.window.openPanel({ companionX: 100, companionY: 100 }));
    return this.waitForWindow('mode=panel');
  }

  async creationWindow(): Promise<Page> {
    const main = await this.mainWindow();
    await main.evaluate(async () => window.ourCompanion.window.openPanelForSwitch());
    return this.waitForWindow('mode=creation');
  }

  async screenshot(page: Page, name: string): Promise<string> {
    const output = path.join(this.artifactDir, name);
    await page.screenshot({ path: output, fullPage: true });
    return output;
  }

  async close(): Promise<void> {
    const app = this.app;
    if (app) {
      const exited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()));
      try {
        await Promise.race([
          app.close(),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('UI_ELECTRON_CLOSE_TIMEOUT')), 5_000)),
        ]);
      } catch {
        app.process().kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (app.process().exitCode === null) app.process().kill('SIGKILL');
      }
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
    await fs.rm(this.userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    this.app = undefined;
  }

  private async waitForWindow(mode: string): Promise<Page> {
    if (!this.app) throw new Error('UI_ELECTRON_NOT_LAUNCHED');
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const page = (await this.app.windows()).find((window) => window.url().includes(mode));
      if (page) return page;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`UI_WINDOW_TIMEOUT:${mode}`);
  }
}
