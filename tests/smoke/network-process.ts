import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { redactSmokeText, waitUntil } from './smoke-state';

type SmokeEnv = Record<string, string | undefined>;

export function resolveSmokeNetworkRoot(clientRoot: string, env: SmokeEnv = process.env): string {
  return path.resolve(env.OUR_COMPANION_SMOKE_NETWORK_ROOT ?? path.resolve(clientRoot, '../our-companion-network'));
}

export async function validateSmokeNetworkRoot(root: string): Promise<void> {
  const required = [path.join(root, 'package.json'), path.join(root, 'prisma', 'schema.prisma')];
  try { await Promise.all(required.map((file) => fs.access(file))); } catch { throw new Error('SMOKE_NETWORK_ROOT_INVALID'); }
}

/**
 * Loads only simple KEY=VALUE entries from the Network Server's local .env file.
 * Values are kept in process memory and are never written to artifacts or logs.
 */
export async function loadNetworkEnvironment(root: string): Promise<SmokeEnv> {
  try {
    const contents = await fs.readFile(path.join(root, '.env'), 'utf8');
    const environment: SmokeEnv = {};
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      environment[key] = value;
    }
    return environment;
  } catch {
    return {};
  }
}

export function validateDedicatedSmokeEnvironment(env: SmokeEnv): void {
  const required = ['OUR_COMPANION_SMOKE_TEST', 'SMOKE_TEST_ALLOW_DESTRUCTIVE_ENDPOINTS', 'SMOKE_TEST_DATABASE', 'DATABASE_URL'];
  if (required.some((key) => !env[key]) || env.OUR_COMPANION_SMOKE_TEST !== '1' || env.SMOKE_TEST_ALLOW_DESTRUCTIVE_ENDPOINTS !== '1' || env.SMOKE_TEST_DATABASE !== '1') {
    throw new Error('SMOKE_MANAGED_SERVER_REQUIRES_DEDICATED_DATABASE');
  }
  let database: URL;
  try { database = new URL(env.DATABASE_URL!); } catch { throw new Error('SMOKE_DATABASE_UNAVAILABLE'); }
  const marker = `${database.hostname}${database.pathname}`.toLowerCase();
  if (/(production|prod|primary|live)/.test(marker) && env.SMOKE_TEST_DATABASE_CONFIRMED !== '1') throw new Error('SMOKE_DATABASE_SUSPICIOUS');
}

export class ManagedSmokeNetwork {
  private process?: ChildProcess;
  private logs: string[] = [];
  readonly cleanupToken: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(private readonly options: { serverUrl: string; networkRoot: string; artifactDir: string; env?: SmokeEnv }) {
    this.env = { ...process.env, ...options.env };
    this.cleanupToken = this.env.SMOKE_TEST_CLEANUP_TOKEN || randomUUID();
    this.env.SMOKE_TEST_CLEANUP_TOKEN = this.cleanupToken;
  }

  async prepareAndStart(): Promise<void> {
    validateDedicatedSmokeEnvironment(this.env);
    await validateSmokeNetworkRoot(this.options.networkRoot);
    if (this.env.OUR_COMPANION_SMOKE_SKIP_NETWORK_PREP !== '1') {
      if (!(await exists(path.join(this.options.networkRoot, 'node_modules')))) await this.run(['npm', 'install'], 'SMOKE_NETWORK_INSTALL_FAILED');
      await this.run(['npm', 'run', 'prisma:generate'], 'SMOKE_NETWORK_BUILD_FAILED');
      await this.run(['npx', 'prisma', 'validate'], 'SMOKE_DATABASE_UNAVAILABLE');
      await this.run(['npx', 'prisma', 'migrate', 'deploy'], 'SMOKE_DATABASE_UNAVAILABLE');
      await this.run(['npm', 'run', 'build'], 'SMOKE_NETWORK_BUILD_FAILED');
    }
    this.process = spawn('npm', ['run', 'start:prod'], { cwd: this.options.networkRoot, env: this.env, stdio: ['ignore', 'pipe', 'pipe'] });
    this.capture(this.process);
    await waitUntil(async () => {
      try { return (await fetch(new URL('/api/meta/health', this.options.serverUrl))).ok; } catch { return false; }
    }, Boolean, { timeoutMs: 30_000, label: 'network-health' });
  }

  async preflight(): Promise<void> { await preflightSmokeServer(this.options.serverUrl); }

  async stop(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      await Promise.race([new Promise<void>((resolve) => this.process!.once('exit', () => resolve())), new Promise<void>((resolve) => setTimeout(resolve, 10_000))]);
      if (!this.process.killed && this.process.exitCode === null) this.process.kill('SIGKILL');
      if (this.process.exitCode === null) await Promise.race([new Promise<void>((resolve) => this.process!.once('exit', () => resolve())), new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);
    }
    await fs.mkdir(this.options.artifactDir, { recursive: true });
    await fs.writeFile(path.join(this.options.artifactDir, 'logs.txt'), this.logs.join(''), 'utf8');
  }

  private async run(command: string[], failureCode: string): Promise<void> {
    const child = spawn(command[0], command.slice(1), { cwd: this.options.networkRoot, env: this.env, stdio: ['ignore', 'pipe', 'pipe'] });
    this.capture(child);
    const exit = await new Promise<number | null>((resolve) => child.once('exit', resolve));
    if (exit !== 0) throw new Error(failureCode);
  }

  private capture(process: ChildProcess): void {
    process.stdout?.on('data', (chunk: Buffer) => this.logs.push(redactSmokeText(chunk.toString())));
    process.stderr?.on('data', (chunk: Buffer) => this.logs.push(redactSmokeText(chunk.toString())));
  }
}

async function exists(target: string): Promise<boolean> { try { await fs.access(target); return true; } catch { return false; } }

export async function preflightSmokeServer(serverUrl: string): Promise<void> {
  let response: Response;
  try { response = await fetch(new URL('/api/meta/protocol', serverUrl)); } catch { throw new Error('SMOKE_DATABASE_UNAVAILABLE'); }
  if (!response.ok) throw new Error('SMOKE_DATABASE_UNAVAILABLE');
  const raw = await response.json() as { data?: { protocolVersion?: string; features?: { visualVisits?: boolean }; storage?: { uploadsEnabled?: boolean; downloadsEnabled?: boolean } } };
  const data = (raw.data ?? raw) as { protocolVersion?: string; features?: { visualVisits?: boolean }; storage?: { uploadsEnabled?: boolean; downloadsEnabled?: boolean } };
  if (data.protocolVersion !== '0.4') throw new Error('SMOKE_PROTOCOL_INCOMPATIBLE');
  if (!data.features?.visualVisits) throw new Error('SMOKE_VISUAL_VISITS_UNAVAILABLE');
  if (!data.storage?.uploadsEnabled || !data.storage?.downloadsEnabled) throw new Error('SMOKE_R2_UNAVAILABLE');
}
