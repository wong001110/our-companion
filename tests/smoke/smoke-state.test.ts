import { describe, expect, it } from 'vitest';
import { assertIsolatedProfiles, createSmokeRunId, isolatedProfileDirectories, redactSmokeText, sanitizedReport, waitUntil } from './smoke-state';

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
});
