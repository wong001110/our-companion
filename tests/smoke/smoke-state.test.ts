import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertIsolatedProfiles, cleanupDirectories, createSmokeRunId, isolatedProfileDirectories, redactSmokeText, sanitizedReport, waitUntil } from './smoke-state';

describe('S5 smoke harness utilities', () => {
  it('creates distinct profile directories for both logical devices', () => {
    const profiles = isolatedProfileDirectories('/tmp/smoke', createSmokeRunId(1, 'run'));
    expect(profiles.owner).not.toBe(profiles.host);
    expect(() => assertIsolatedProfiles(profiles)).not.toThrow();
  });

  it('times out polling safely with a sanitized label', async () => {
    await expect(waitUntil(async () => false, Boolean, { timeoutMs: 0, label: 'online' })).rejects.toThrow('SMOKE_TIMEOUT:online');
  });

  it('redacts credentials and omits private report values', () => {
    expect(redactSmokeText('password=secret authorization: Bearer token')).not.toContain('secret');
    expect(redactSmokeText('file:///Users/tester/private/log.txt')).not.toContain('/Users/tester');
    expect(sanitizedReport({ result: 'passed', accessToken: 'secret', cacheRoot: '/private', sessionId: 'ok' })).toEqual({ result: 'passed', sessionId: 'ok' });
  });

  it('preserves a logical device profile across a restart', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'our-companion-smoke-'));
    try {
      const initial = isolatedProfileDirectories(root, 'restart-run');
      await fs.mkdir(initial.owner, { recursive: true });
      await fs.writeFile(path.join(initial.owner, 'session-marker'), 'persisted', 'utf8');
      const restarted = isolatedProfileDirectories(root, 'restart-run');
      expect(restarted.owner).toBe(initial.owner);
      await expect(fs.readFile(path.join(restarted.owner, 'session-marker'), 'utf8')).resolves.toBe('persisted');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('removes both profiles after a simulated scenario failure', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'our-companion-smoke-'));
    const profiles = isolatedProfileDirectories(root, 'failed-run');
    try {
      await Promise.all([fs.mkdir(profiles.owner, { recursive: true }), fs.mkdir(profiles.host, { recursive: true })]);
      await cleanupDirectories([profiles.owner, profiles.host]);
      await expect(fs.stat(profiles.owner)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(fs.stat(profiles.host)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
