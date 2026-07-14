import { describe, expect, it } from 'vitest';
import { en, translations, zhCN } from '../i18n';

const mojibake = /Ã|ä¸|æ—|ï¼|å|é—/;

describe('renderer translations', () => {
  it('has identical English and Simplified Chinese keys', () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(translations['zh-CN']).sort()).toEqual(Object.keys(translations.en).sort());
  });

  it('does not expose mojibake to the renderer', () => {
    expect(Object.values(zhCN).some((value) => mojibake.test(value))).toBe(false);
  });
});
