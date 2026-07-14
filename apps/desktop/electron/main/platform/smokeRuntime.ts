import { createHash } from 'node:crypto';
import path from 'node:path';

export type SmokeInstanceRole = 'visitor_owner' | 'host';

export interface SmokeWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isSmokeTestRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OUR_COMPANION_SMOKE_TEST === '1';
}

export function smokeInstanceRole(env: NodeJS.ProcessEnv = process.env): SmokeInstanceRole | undefined {
  const value = env.OUR_COMPANION_SMOKE_ROLE;
  return value === 'visitor_owner' || value === 'host' ? value : undefined;
}

/** Resolves an override before Electron creates storage, secure-session, or window state. */
export function smokeUserDataOverride(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!isSmokeTestRuntime(env) || !env.OUR_COMPANION_USER_DATA_DIR) return undefined;
  return path.resolve(env.OUR_COMPANION_USER_DATA_DIR);
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
