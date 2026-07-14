import { describe, expect, it } from 'vitest';
import { resolveSmokeNetworkRoot, validateDedicatedSmokeEnvironment } from './network-process';

describe('managed smoke Network guards', () => {
  it('uses the configurable Network root and never retains the old network fallback', () => {
    expect(resolveSmokeNetworkRoot('/work/client', { OUR_COMPANION_SMOKE_NETWORK_ROOT: '/tmp/network' })).toBe('/tmp/network');
    expect(resolveSmokeNetworkRoot('/work/our-companion', {})).toBe('/work/our-companion-network');
  });

  it('requires dedicated flags and rejects obvious production markers without confirmation', () => {
    expect(() => validateDedicatedSmokeEnvironment({ DATABASE_URL: 'postgres://localhost/smoke' })).toThrow('SMOKE_MANAGED_SERVER_REQUIRES_DEDICATED_DATABASE');
    expect(() => validateDedicatedSmokeEnvironment({ OUR_COMPANION_SMOKE_TEST: '1', SMOKE_TEST_ALLOW_DESTRUCTIVE_ENDPOINTS: '1', SMOKE_TEST_DATABASE: '1', DATABASE_URL: 'postgres://localhost/production' })).toThrow('SMOKE_DATABASE_SUSPICIOUS');
    expect(() => validateDedicatedSmokeEnvironment({ OUR_COMPANION_SMOKE_TEST: '1', SMOKE_TEST_ALLOW_DESTRUCTIVE_ENDPOINTS: '1', SMOKE_TEST_DATABASE: '1', DATABASE_URL: 'postgres://localhost/smoke_s5' })).not.toThrow();
  });
});
