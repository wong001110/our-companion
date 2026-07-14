import { en } from './i18n/en';
import { zhCN } from './i18n/zh-CN';

export type Lang = 'en' | 'zh-CN';
type TranslationDict = Record<keyof typeof en, string>;

export { en, zhCN };
export type TranslationKey = keyof typeof en;
export const translations: Record<Lang, TranslationDict> = { en, 'zh-CN': zhCN };

export function t(lang: Lang, key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = translations[lang][key] ?? translations.en[key] ?? key;
  if (vars) for (const [name, value] of Object.entries(vars)) text = text.replace('{' + name + '}', String(value));
  return text;
}
