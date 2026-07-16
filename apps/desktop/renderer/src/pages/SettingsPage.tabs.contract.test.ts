import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settingsSource = readFileSync(new URL('./SettingsPage.tsx', import.meta.url), 'utf8');

describe('Settings tab accessibility contract', () => {
  it('connects every tab to the active tab panel', () => {
    expect(settingsSource).toContain('role="tablist"');
    expect(settingsSource).toContain('role="tab"');
    expect(settingsSource).toContain('aria-controls={`settings-panel-${item}`}');
    expect(settingsSource).toContain('role="tabpanel"');
    expect(settingsSource).toContain('aria-labelledby={`settings-tab-${panelCategory}`}');
  });

  it('uses roving tab stops and routes keyboard navigation through the shared helper', () => {
    expect(settingsSource).toContain('tabIndex={category === item ? 0 : -1}');
    expect(settingsSource).toContain('settingsCategoryForKey(current, key)');
    expect(settingsSource).toContain("categoryTabsRef.current.get(next)?.focus()");
  });
});
