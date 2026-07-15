import { describe, expect, it } from 'vitest';
import { isPanelTab, PANEL_TABS } from './index';

describe('Panel tab runtime contract', () => {
  it('accepts every canonical Panel tab', () => {
    expect(PANEL_TABS.every(isPanelTab)).toBe(true);
  });

  it.each([undefined, 'invalid', {}, ''])('rejects non-tab input %p', (value) => {
    expect(isPanelTab(value)).toBe(false);
  });
});
