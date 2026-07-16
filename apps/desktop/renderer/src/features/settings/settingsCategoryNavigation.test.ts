import { describe, expect, it } from 'vitest';
import { settingsCategoryForKey } from './settingsCategoryNavigation';

describe('Settings category keyboard navigation', () => {
  it('moves through tabs and wraps at both ends', () => {
    expect(settingsCategoryForKey('companion', 'ArrowRight')).toBe('ai');
    expect(settingsCategoryForKey('developer', 'ArrowRight')).toBe('companion');
    expect(settingsCategoryForKey('companion', 'ArrowLeft')).toBe('developer');
  });

  it('supports Home and End while leaving vertical scrolling alone', () => {
    expect(settingsCategoryForKey('online', 'Home')).toBe('companion');
    expect(settingsCategoryForKey('online', 'End')).toBe('developer');
    expect(settingsCategoryForKey('ai', 'ArrowDown')).toBeUndefined();
  });

  it('leaves unrelated keys to the browser', () => {
    expect(settingsCategoryForKey('companion', 'Tab')).toBeUndefined();
  });
});
