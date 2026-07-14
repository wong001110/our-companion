import { useCallback, useEffect, useState } from 'react';
import type {
  AiSettings,
  CompanionReplyLanguage,
  PendingCompanionAction,
  UiLang,
  UpdateAiSettingsInput,
} from '@our-companion/shared';
import { t, type Lang } from '../../i18n';

interface SettingsViewModelOptions {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
}

/** Aggregates Settings data and mutations so the page remains a rendering surface. */
export function useSettingsViewModel({ lang, onLangChange }: SettingsViewModelOptions) {
  const [settings, setSettings] = useState<AiSettings>();
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [replyLang, setReplyLang] = useState<CompanionReplyLanguage>('en');
  const [uiLang, setUiLang] = useState<UiLang>('en');
  const [attentionMode, setAttentionMode] = useState<'available' | 'focused' | 'do_not_disturb'>('available');
  const [pendingActions, setPendingActions] = useState<PendingCompanionAction[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState(t(lang, 'settings_status_loading'));
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(undefined);
    setMessage(t(lang, 'settings_status_loading'));
    const [nextSettings, nextAttentionMode, nextPendingActions] = await Promise.allSettled([
      window.ourCompanion.ai.getSettings(),
      window.ourCompanion.companion.getAttentionMode(),
      window.ourCompanion.companion.listPendingActions(),
    ]);
    if (nextSettings.status === 'fulfilled') {
      const next = nextSettings.value;
      setSettings(next);
      setModel(next.model);
      setEndpoint(next.endpoint);
      setReplyLang(next.replyLanguage ?? 'en');
      setUiLang(next.uiLang ?? 'en');
      setMessage(next.apiKeyConfigured ? t(lang, 'settings_status_api_key_saved') : t(lang, 'settings_status_no_api_key'));
    }
    if (nextAttentionMode.status === 'fulfilled') setAttentionMode(nextAttentionMode.value);
    if (nextPendingActions.status === 'fulfilled') setPendingActions(nextPendingActions.value);
    if ([nextSettings, nextAttentionMode, nextPendingActions].some((result) => result.status === 'rejected')) {
      setError(t(lang, 'feedback_section_error'));
    }
    if (nextSettings.status === 'rejected') {
      setStatus('error');
      setMessage(t(lang, 'settings_status_save_failed'));
    } else {
      setStatus('ready');
    }
  }, [lang]);

  // Loading is an entry/retry operation. A language change must not overwrite a
  // successful Save status with a fresh loading/no-key message.
  useEffect(() => { void refresh(); }, []);

  async function saveSettings(input: UpdateAiSettingsInput = {}) {
    setSaving(true);
    setError(undefined);
    try {
      const next = await window.ourCompanion.ai.updateSettings({
        model,
        endpoint,
        apiKey: apiKey.trim() || undefined,
        replyLanguage: replyLang,
        uiLang,
        ...input,
      });
      setSettings(next);
      setModel(next.model);
      setEndpoint(next.endpoint);
      setApiKey('');
      localStorage.setItem('companion_uiLang', uiLang);
      onLangChange(uiLang as Lang);
      setStatus('ready');
      setMessage(next.apiKeyConfigured ? t(uiLang as Lang, 'settings_status_saved_configured') : t(uiLang as Lang, 'settings_status_saved_unconfigured'));
    } catch {
      setStatus('error');
      setError(t(lang, 'settings_status_save_failed'));
      setMessage(t(lang, 'settings_status_save_failed'));
    } finally {
      setSaving(false);
    }
  }

  return {
    data: { settings, attentionMode, pendingActions },
    status,
    error,
    actions: { refresh, retry: refresh, saveSettings },
    settings,
    model,
    setModel,
    endpoint,
    setEndpoint,
    apiKey,
    setApiKey,
    replyLang,
    setReplyLang,
    uiLang,
    setUiLang,
    attentionMode,
    setAttentionMode,
    pendingActions,
    setPendingActions,
    message,
    saving,
    saveSettings,
    refresh,
    retry: refresh,
  };
}
