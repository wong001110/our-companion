import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatSource = readFileSync(new URL('./ChatPage.tsx', import.meta.url), 'utf8');
const companionSessionSource = readFileSync(new URL('../companion/useCompanionSession.ts', import.meta.url), 'utf8');
const companionShellSource = readFileSync(new URL('../app/CompanionEntryShell.tsx', import.meta.url), 'utf8');
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

describe('Chat operational-state contract', () => {
  it('distinguishes loading, history failure, and send failure', () => {
    expect(chatSource).toContain("<LoadingState label={t(lang, 'chat_loading')} />");
    expect(chatSource).toContain("setHistoryError(t(lang, 'chat_history_error'))");
    expect(chatSource).toContain("setSendError(t(lang, 'chat_send_error'))");
    expect(chatSource).toContain("onClick={() => void loadHistory({ initial: true })}");
  });

  it('keeps the submitted draft on rejection and does not erase newer edits', () => {
    expect(chatSource).toContain("setInput((current) => current === draft ? '' : current)");
    expect(chatSource).not.toContain("setSending(true); setInput('')");
    expect(chatSource).not.toMatch(/catch\s*\{[^}]*setInput/s);
  });

  it('does not clear history while a send is in flight', () => {
    expect(chatSource).toContain('disabled={sending || clearing}');
    expect(chatSource).toContain('disabled={sending || clearing || !input.trim()}');
  });

  it('provides matching localized loading and failure keys', () => {
    for (const key of ['chat_loading', 'chat_history_error', 'chat_send_error']) {
      expect(enSource).toContain(`${key}:`);
      expect(zhCNSource).toContain(`"${key}":`);
    }
  });
});

describe('Unified Companion Turn surface contract', () => {
  it('routes Panel, floating text, and Voice through companion.turn', () => {
    expect(chatSource).toContain("companion.turn({ message, source: 'panel_text' })");
    expect(companionSessionSource).toContain("source: 'voice' | 'companion_text'");
    expect(companionSessionSource).toContain('window.ourCompanion.companion.turn');
    expect(chatSource).not.toContain('window.ourCompanion.ai.chat');
  });

  it('offers permission continuation and Memory Undo on both Panel and floating surfaces', () => {
    for (const source of [chatSource, companionSessionSource]) {
      expect(source).toContain('resolveTurnPermission');
    }
    expect(companionShellSource).toContain("resolvePermission('allow_once')");
    expect(companionShellSource).toContain("resolvePermission('always_allow')");
    expect(companionShellSource).toContain("resolvePermission('cancel')");
    expect(chatSource).toContain('undoRememberedMemory');
    expect(companionSessionSource).toContain('undoRememberedMemory');
    for (const key of ['turn_allow_once', 'turn_always_allow', 'turn_cancel', 'memory_remembered', 'memory_undo']) {
      expect(enSource).toContain(`${key}:`);
      expect(zhCNSource).toContain(`"${key}":`);
    }
  });
});
