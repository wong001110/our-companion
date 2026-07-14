import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface WaitOptions { timeoutMs?: number; intervalMs?: number; label?: string; }

export function createSmokeRunId(now = Date.now(), uuid = randomUUID()): string {
  return `${now}-${uuid}`;
}

export function isolatedProfileDirectories(root: string, runId: string): { owner: string; host: string } {
  const base = path.resolve(root, runId);
  return { owner: path.join(base, 'profiles', 'owner'), host: path.join(base, 'profiles', 'host') };
}

export function assertIsolatedProfiles(paths: { owner: string; host: string }): void {
  if (path.resolve(paths.owner) === path.resolve(paths.host)) throw new Error('SMOKE_PROFILE_NOT_ISOLATED');
}

export async function waitUntil<T>(read: () => Promise<T>, condition: (value: T) => boolean, options: WaitOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const intervalMs = options.intervalMs ?? 300;
  const deadline = Date.now() + timeoutMs;
  let latest = await read();
  while (!condition(latest)) {
    if (Date.now() >= deadline) throw new Error(`SMOKE_TIMEOUT${options.label ? `:${options.label}` : ''}`);
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    latest = await read();
  }
  return latest;
}

export function redactSmokeText(value: string): string {
  return value
    .replace(/file:\/\/\/[^\s"')]+/gi, '[REDACTED_FILE_URL]')
    .replace(/(?:\/Users\/|\/home\/|\/private\/|\/var\/folders\/)[^\s"')]+/g, '[REDACTED_PATH]')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/(password\s*[:=]\s*)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/(refreshToken|accessToken|secretAccessKey|accountId)\s*[:=]\s*["']?[^\s,"'}]+/gi, '$1=[REDACTED]')
    .replace(/https?:\/\/[^\s"']*X-Amz-[^\s"']+/gi, '[REDACTED_PRESIGNED_URL]');
}

export function sanitizedReport<T extends Record<string, unknown>>(report: T): T {
  return JSON.parse(JSON.stringify(report, (key, value) => /password|token|email|path|cacheRoot|objectKey|url/i.test(key) ? undefined : value)) as T;
}

export async function writeManualPhysicalChecklist(root: string): Promise<void> {
  const checklist = ['Two separate physical computers', 'Cross-platform connection', 'External monitor unplug', 'Mixed DPI displays', 'Dock/taskbar work-area behavior', 'Host sleep/wake', 'Owner sleep/wake', 'Real Wi-Fi disconnect/reconnect', 'Hotspot/network switch', 'Firewall/proxy behavior', 'Hardware acceleration variations', 'Packaged application', '30–60 minute stability', 'Visual quality approval'];
  await fs.writeFile(path.join(root, 'manual-physical-checklist.md'), `${checklist.map((item) => `- [ ] ${item}`).join('\n')}\n`, 'utf8');
}

export async function cleanupDirectories(paths: string[]): Promise<void> {
  await Promise.all(paths.map((target) => fs.rm(target, { recursive: true, force: true })));
}
