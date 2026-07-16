import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatSource = readFileSync(new URL('./ChatPage.tsx', import.meta.url), 'utf8');
const enSource = readFileSync(new URL('../i18n/en.ts', import.meta.url), 'utf8');
const zhCNSource = readFileSync(new URL('../i18n/zh-CN.ts', import.meta.url), 'utf8');

describe('Chat clear-history confirmation contract', () => {
  it('uses the shared destructive dialog instead of inline composer controls', () => {
    expect(chatSource).toContain("import { ConfirmDialog } from '../components/feedback/ConfirmDialog';");
    expect(chatSource).toContain('<ConfirmDialog');
    expect(chatSource).toContain('open={confirmClear}');
    expect(chatSource).toContain('busy={clearing}');
    expect(chatSource).toContain('danger');
    expect(chatSource).not.toMatch(/confirmClear\s*\?\s*</);
  });

  it('keeps visible messages and exposes a recoverable error when clearing rejects', () => {
    expect(chatSource).toContain('catch {');
    expect(chatSource).toContain("setClearError(t(lang, 'chat_clear_error'))");
    expect(chatSource).toContain('<InlineNotice tone="error">{clearError}</InlineNotice>');
    expect(chatSource).not.toMatch(/catch\s*\{[^}]*setMessages\(\[\]\)/s);
  });

  it('provides matching localized dialog, action, and failure keys', () => {
    const requiredKeys = [
      'chat_clear_confirm',
      'chat_clear_description',
      'chat_clear_yes',
      'chat_clear_error',
    ];

    for (const key of requiredKeys) {
      expect(enSource).toContain(`${key}:`);
      expect(zhCNSource).toContain(`"${key}":`);
    }
    expect(enSource).toContain('all stored Chat history from this device');
    expect(zhCNSource).toContain('所有已保存的聊天记录');
  });
});
