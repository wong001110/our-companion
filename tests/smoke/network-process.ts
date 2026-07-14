import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { redactSmokeText, waitUntil } from './smoke-state';

export class ManagedSmokeNetwork {
  private process?: ChildProcess;
  private logs: string[] = [];

  constructor(private readonly options: { serverUrl: string; networkRoot: string; artifactDir: string }) {}

  async start(): Promise<void> {
    if (!process.env.DATABASE_URL || !process.env.SMOKE_TEST_DATABASE) throw new Error('SMOKE_MANAGED_SERVER_REQUIRES_DEDICATED_DATABASE');
    this.process = spawn('npm', ['run', 'start:prod'], {
      cwd: this.options.networkRoot,
      env: { ...process.env, OUR_COMPANION_SMOKE_TEST: '1', SMOKE_TEST_ALLOW_DESTRUCTIVE_ENDPOINTS: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.process.stdout?.on('data', (chunk: Buffer) => this.logs.push(redactSmokeText(chunk.toString())));
    this.process.stderr?.on('data', (chunk: Buffer) => this.logs.push(redactSmokeText(chunk.toString())));
    await waitUntil(async () => {
      try { return (await fetch(new URL('/api/health', this.options.serverUrl))).ok; } catch { return false; }
    }, Boolean, { timeoutMs: 30_000, label: 'network-health' });
  }

  async stop(): Promise<void> {
    if (this.process && !this.process.killed) this.process.kill('SIGTERM');
    await fs.mkdir(this.options.artifactDir, { recursive: true });
    await fs.writeFile(path.join(this.options.artifactDir, 'logs.txt'), this.logs.join(''), 'utf8');
  }
}
