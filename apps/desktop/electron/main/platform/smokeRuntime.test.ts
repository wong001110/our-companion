import { describe, expect, it } from 'vitest';
import { assertSmokeTestRuntime, hashSmokeDeviceId, isSmokeTestRuntime, smokeInstanceRole, smokeUserDataOverride, validateSmokeWorkArea } from './smokeRuntime';

describe('smoke runtime guardrails', () => {
  it('requires the explicit smoke flag before applying the profile override', () => {
    expect(smokeUserDataOverride({ OUR_COMPANION_USER_DATA_DIR: '/tmp/owner' })).toBeUndefined();
    expect(smokeUserDataOverride({ OUR_COMPANION_SMOKE_TEST: '1', OUR_COMPANION_USER_DATA_DIR: '/tmp/owner' })).toBe('/tmp/owner');
    expect(isSmokeTestRuntime({ OUR_COMPANION_SMOKE_TEST: '1' })).toBe(true);
    expect(smokeInstanceRole({ OUR_COMPANION_SMOKE_ROLE: 'host' })).toBe('host');
  });

  it('rejects smoke-only controls in a production environment', () => {
    expect(() => assertSmokeTestRuntime({})).toThrow('SMOKE_TEST_UNAVAILABLE');
    expect(() => assertSmokeTestRuntime({ OUR_COMPANION_SMOKE_TEST: '1' })).not.toThrow();
  });

  it('validates narrow work-area controls and never returns a raw device id', () => {
    expect(validateSmokeWorkArea({ x: 0, y: 0, width: 800, height: 600 })).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(() => validateSmokeWorkArea({ x: 0, y: 0, width: 0, height: 1 })).toThrow('SMOKE_WORK_AREA_INVALID');
    expect(hashSmokeDeviceId('device-secret')).not.toContain('device-secret');
  });
});
