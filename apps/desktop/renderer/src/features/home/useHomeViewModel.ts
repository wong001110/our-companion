import { useState } from 'react';
import { t, type Lang } from '../../i18n';
import { useToast } from '../../components/feedback/ToastProvider';

/** Keeps Home's local diary mutation recoverable and independent from presentation. */
export function useHomeViewModel({ lang, onRefresh }: { lang: Lang; onRefresh: () => Promise<void> }) {
  const { pushToast } = useToast();
  const [generatingDiary, setGeneratingDiary] = useState(false);
  const [error, setError] = useState<string>();

  const generateDiary = async () => {
    setGeneratingDiary(true);
    setError(undefined);
    try {
      await window.ourCompanion.diary.generateDaily();
      await onRefresh();
      pushToast(t(lang, 'home_diary_written'), 'success');
    } catch {
      setError(t(lang, 'home_diary_generate_failed'));
    } finally {
      setGeneratingDiary(false);
    }
  };

  return { error, generateDiary, generatingDiary };
}
