import { createHash } from 'node:crypto';
import path from 'node:path';

export type SmokeInstanceRole = 'visitor_owner' | 'host';

export interface SmokeWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEV_PROFILE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function isSmokeTestRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OUR_COMPANION_SMOKE_TEST === '1';
}

/** Keeps smoke-only controls out of ordinary production processes. */
export function assertSmokeTestRuntime(env: NodeJS.ProcessEnv = process.env): void {
  if (!isSmokeTestRuntime(env)) throw new Error('SMOKE_TEST_UNAVAILABLE');
}

export function smokeInstanceRole(env: NodeJS.ProcessEnv = process.env): SmokeInstanceRole | undefined {
  const value = env.OUR_COMPANION_SMOKE_ROLE;
  return value === 'visitor_owner' || value === 'host' ? value : undefined;
}

export function normalizeDevProfileName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!DEV_PROFILE_PATTERN.test(normalized)) throw new Error('DEV_PROFILE_INVALID');
  return normalized;
}

/**
 * Resolves a normal-runtime development profile. The explicit enable flag is
 * set only by the repository launcher scripts, so ordinary and packaged starts
 * retain Electron's default userData location.
 */
export function devProfileUserDataOverride(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (isSmokeTestRuntime(env) || env.OUR_COMPANION_DEV_PROFILE_ENABLED !== '1') return undefined;
  const rawProfile = env.OUR_COMPANION_DEV_PROFILE;
  if (!rawProfile) return undefined;
  const rawRoot = env.OUR_COMPANION_DEV_PROFILE_ROOT?.trim();
  if (!rawRoot) throw new Error('DEV_PROFILE_ROOT_REQUIRED');
  const profile = normalizeDevProfileName(rawProfile);
  return path.join(path.resolve(rawRoot), profile);
}

/**
 * Resolves an override before Electron creates storage, secure-session, or
 * window state. Smoke profiles retain priority; otherwise an explicitly
 * enabled normal-runtime development profile may be used.
 */
export function smokeUserDataOverride(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (isSmokeTestRuntime(env)) {
    if (!env.OUR_COMPANION_USER_DATA_DIR) return undefined;
    return path.resolve(env.OUR_COMPANION_USER_DATA_DIR);
  }
  return devProfileUserDataOverride(env);
}

export function hashSmokeDeviceId(deviceId: string): string {
  return createHash('sha256').update(deviceId, 'utf8').digest('hex').slice(0, 16);
}

export function validateSmokeWorkArea(value: unknown): SmokeWorkArea {
  if (!value || typeof value !== 'object') throw new Error('SMOKE_WORK_AREA_INVALID');
  const candidate = value as Partial<SmokeWorkArea>;
  const fields: Array<keyof SmokeWorkArea> = ['x', 'y', 'width', 'height'];
  if (fields.some((key) => typeof candidate[key] !== 'number' || !Number.isFinite(candidate[key]))) throw new Error('SMOKE_WORK_AREA_INVALID');
  if ((candidate.width ?? 0) < 1 || (candidate.height ?? 0) < 1 || (candidate.width ?? 0) > 16_384 || (candidate.height ?? 0) > 16_384) {
    throw new Error('SMOKE_WORK_AREA_INVALID');
  }
  return { x: Math.round(candidate.x!), y: Math.round(candidate.y!), width: Math.round(candidate.width!), height: Math.round(candidate.height!) };
}
