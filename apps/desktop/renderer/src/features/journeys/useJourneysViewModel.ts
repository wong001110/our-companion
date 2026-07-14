import { useState } from 'react';
import { t, type Lang } from '../../i18n';
import { useToast } from '../../components/feedback/ToastProvider';

/** Keeps Journey creation failure-safe while the page remains a presentational surface. */
export function useJourneysViewModel({ lang, onRefresh }: { lang: Lang; onRefresh: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const createNewJourney = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await window.ourCompanion.journey.create({ title: t(lang, 'journey_new_title'), description: t(lang, 'journey_new_description') });
      await onRefresh();
      pushToast(t(lang, 'journey_created'), 'success');
    } catch {
      setError(t(lang, 'journey_create_failed'));
    } finally {
      setBusy(false);
    }
  };

  return { busy, createNewJourney, error };
}
