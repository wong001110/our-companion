export const SETTINGS_CATEGORIES = [
  'companion',
  'ai',
  'voice',
  'privacy',
  'memory',
  'appearance',
  'online',
  'advanced',
  'developer',
] as const;

export type SettingsCategory = typeof SETTINGS_CATEGORIES[number];

export function settingsCategoryForKey(
  current: SettingsCategory,
  key: string,
): SettingsCategory | undefined {
  const currentIndex = SETTINGS_CATEGORIES.indexOf(current);
  switch (key) {
    case 'ArrowRight':
      return SETTINGS_CATEGORIES[(currentIndex + 1) % SETTINGS_CATEGORIES.length];
    case 'ArrowLeft':
      return SETTINGS_CATEGORIES[(currentIndex - 1 + SETTINGS_CATEGORIES.length) % SETTINGS_CATEGORIES.length];
    case 'Home':
      return SETTINGS_CATEGORIES[0];
    case 'End':
      return SETTINGS_CATEGORIES[SETTINGS_CATEGORIES.length - 1];
    default:
      return undefined;
  }
}
