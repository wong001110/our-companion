import { useCallback, useEffect, useState } from 'react';
import type { ProactiveCompanionMode, ProactiveCompanionSettings } from '@our-companion/shared';
import { InlineNotice } from '../../components/feedback/InlineNotice';
import { t } from '../../i18n';
import { PaperCard, useLang } from '../../ui/NotebookPrimitives';

export function ProactiveCompanionSettingsCard() {
  const lang = useLang();
  const [settings, setSettings] = useState<ProactiveCompanionSettings>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setSettings(await window.ourCompanion.companion.getProactiveSettings());
      setError(undefined);
    } catch {
      setError(t(lang, 'proactive_settings_load_failed'));
    }
  }, [lang]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function save(next: ProactiveCompanionSettings) {
    setSettings(next);
    setSaving(true);
    setError(undefined);
    try {
      setSettings(await window.ourCompanion.companion.updateProactiveSettings(next));
    } catch {
      setError(t(lang, 'proactive_settings_save_failed'));
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof ProactiveCompanionSettings>(key: K, value: ProactiveCompanionSettings[K]) {
    if (!settings) return;
    void save({ ...settings, [key]: value });
  }

  return (
    <PaperCard title={t(lang, 'proactive_settings_title')} className="settings-panel">
      <p>{t(lang, 'proactive_settings_desc')}</p>
      <label>
        <span>{t(lang, 'proactive_settings_mode')}</span>
        <select value={settings?.mode ?? 'balanced'} disabled={!settings || saving} onChange={(event) => update('mode', event.target.value as ProactiveCompanionMode)}>
          <option value="off">{t(lang, 'proactive_mode_off')}</option>
          <option value="quiet">{t(lang, 'proactive_mode_quiet')}</option>
          <option value="balanced">{t(lang, 'proactive_mode_balanced')}</option>
          <option value="active">{t(lang, 'proactive_mode_active')}</option>
        </select>
      </label>
      <div className="settings-checkbox-grid">
        {([
          ['unfinishedTopicFollowUps', 'proactive_unfinished_topics'],
          ['goalCheckIns', 'proactive_goal_checkins'],
          ['journeyReflections', 'proactive_journey_reflections'],
          ['quietPresence', 'proactive_quiet_presence'],
        ] as const).map(([key, label]) => (
          <label className="checkbox-row" key={key}>
            <input type="checkbox" checked={Boolean(settings?.[key])} disabled={!settings || saving || settings.mode === 'off'} onChange={(event) => update(key, event.target.checked)} />
            <span>{t(lang, label)}</span>
          </label>
        ))}
      </div>
      <p>{t(lang, 'proactive_settings_guardrails')}</p>
      {saving && <p aria-live="polite">{t(lang, 'settings_saving')}</p>}
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
    </PaperCard>
  );
}
