import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./ConfirmDialog.tsx', import.meta.url), 'utf8');

describe('ConfirmDialog focus and busy contract', () => {
  it('focuses Cancel when its mounted node satisfies a pending open', () => {
    expect(source).toContain('initialFocusPendingRef');
    expect(source).toContain('const setCancelRef = useCallback');
    expect(source).toContain('ref={setCancelRef}');
    expect(source).toContain('node.focus()');
    expect(source).not.toContain('requestAnimationFrame');
  });

  it('keeps dismissal and actions protected while busy', () => {
    expect(source).toContain("event.key === 'Escape' && !busy");
    expect(source).toContain('event.currentTarget === event.target && !busy');
    expect(source.match(/disabled=\{busy\}/g)).toHaveLength(2);
  });
});
