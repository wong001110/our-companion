import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import type { SmokeTestState } from '@our-companion/shared';
import { redactSmokeText, waitUntil } from './smoke-state';

export interface LaunchDeviceOptions {
  role: 'visitor_owner' | 'host';
  userDataDir: string;
  serverUrl: string;
  artifactDir: string;
  appPath: string;
}

export class SmokeElectronDevice {
  private app?: ElectronApplication;
  private logs: string[] = [];

  constructor(readonly options: LaunchDeviceOptions) {}

  async launch(): Promise<void> {
    await fs.mkdir(this.options.artifactDir, { recursive: true });
    this.app = await electron.launch({
      args: [this.options.appPath],
      env: {
        ...process.env,
        OUR_COMPANION_SMOKE_TEST: '1',
        OUR_COMPANION_SMOKE_ROLE: this.options.role,
        OUR_COMPANION_USER_DATA_DIR: this.options.userDataDir,
        OUR_COMPANION_SMOKE_SERVER_URL: this.options.serverUrl,
      },
    });
    const process = this.app.process();
    process.stdout?.on('data', (chunk: Buffer) => this.logs.push(`[${this.options.role}] ${redactSmokeText(chunk.toString())}`));
    process.stderr?.on('data', (chunk: Buffer) => this.logs.push(`[${this.options.role}] ${redactSmokeText(chunk.toString())}`));
    await this.app.firstWindow();
  }

  async restart(): Promise<void> {
    await this.close();
    await this.launch();
  }

  async close(): Promise<void> {
    try { await this.app?.close(); } catch { this.app?.process().kill('SIGKILL'); }
    await fs.mkdir(this.options.artifactDir, { recursive: true });
    await fs.writeFile(path.join(this.options.artifactDir, 'logs.txt'), this.logs.join(''), 'utf8');
    this.app = undefined;
  }

  async mainWindow(): Promise<Page> {
    if (!this.app) throw new Error('SMOKE_DEVICE_NOT_LAUNCHED');
    return waitUntil(
      async () => (await this.app!.windows()).find((page) => page.url().includes('mode=companion')),
      (page): page is Page => Boolean(page),
      { timeoutMs: 30_000, label: `${this.options.role}-main-window` },
    );
  }

  async panelWindow(): Promise<Page> {
    if (!this.app) throw new Error('SMOKE_DEVICE_NOT_LAUNCHED');
    return waitUntil(
      async () => (await this.app!.windows()).find((page) => page.url().includes('mode=panel')),
      (page): page is Page => Boolean(page),
      { timeoutMs: 30_000, label: `${this.options.role}-panel-window` },
    );
  }

  async getSmokeState(): Promise<SmokeTestState> {
    const page = await this.anyWindow();
    return page.evaluate(async () => {
      if (!window.ourCompanion.smoke) throw new Error('SMOKE_TEST_UNAVAILABLE');
      return window.ourCompanion.smoke.getState();
    });
  }

  async waitForState(predicate: (state: SmokeTestState) => boolean, timeoutMs = 15_000): Promise<SmokeTestState> {
    return waitUntil(() => this.getSmokeState(), predicate, { timeoutMs, label: `${this.options.role}-state` });
  }

  async screenshot(name: string): Promise<void> {
    await (await this.anyWindow()).screenshot({ path: path.join(this.options.artifactDir, `${name}.png`) });
  }

  async bootstrapFixtureCompanion(): Promise<void> {
    await (await this.anyWindow()).evaluate(async () => window.ourCompanion.smoke?.bootstrapFixtureCompanion());
    await this.mainWindow();
  }

  private async anyWindow(): Promise<Page> {
    if (!this.app) throw new Error('SMOKE_DEVICE_NOT_LAUNCHED');
    return (await this.app.windows())[0] ?? this.app.firstWindow();
  }
}
