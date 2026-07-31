import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  devProfileUserDataOverride,
  normalizeDevProfileName,
  smokeUserDataOverride,
} from './smokeRuntime';

describe('normal-runtime development profile isolation', () => {
  it('normalizes a valid profile name for stable cross-platform directories', () => {
    expect(normalizeDevProfileName('  Social-A  ')).toBe('social-a');
  });

  it('requires the explicit launcher enable flag', () => {
    expect(devProfileUserDataOverride({
      OUR_COMPANION_DEV_PROFILE: 'social-a',
      OUR_COMPANION_DEV_PROFILE_ROOT: '/tmp/our-companion-dev',
    })).toBeUndefined();
  });

  it('resolves an isolated directory without enabling smoke runtime', () => {
    const env = {
      OUR_COMPANION_DEV_PROFILE_ENABLED: '1',
      OUR_COMPANION_DEV_PROFILE: 'Social-A',
      OUR_COMPANION_DEV_PROFILE_ROOT: '/tmp/our-companion-dev',
    };

    expect(smokeUserDataOverride(env)).toBe(path.join(path.resolve('/tmp/our-companion-dev'), 'social-a'));
    expect(env.OUR_COMPANION_SMOKE_TEST).toBeUndefined();
  });

  it('keeps smoke profile precedence and does not fall through to a dev profile', () => {
    expect(smokeUserDataOverride({
      OUR_COMPANION_SMOKE_TEST: '1',
      OUR_COMPANION_DEV_PROFILE_ENABLED: '1',
      OUR_COMPANION_DEV_PROFILE: 'social-a',
      OUR_COMPANION_DEV_PROFILE_ROOT: '/tmp/our-companion-dev',
    })).toBeUndefined();
  });

  it('rejects traversal, spaces, and ambiguous profile names', () => {
    for (const value of ['../social-a', 'social a', '_social-a', '']) {
      expect(() => normalizeDevProfileName(value)).toThrow('DEV_PROFILE_INVALID');
    }
  });

  it('requires a root directory when the dev profile gate is enabled', () => {
    expect(() => devProfileUserDataOverride({
      OUR_COMPANION_DEV_PROFILE_ENABLED: '1',
      OUR_COMPANION_DEV_PROFILE: 'social-a',
    })).toThrow('DEV_PROFILE_ROOT_REQUIRED');
  });
});
