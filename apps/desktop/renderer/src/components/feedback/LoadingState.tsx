import { t } from '../../i18n';
import { useLang } from '../../ui/NotebookPrimitives';

export function LoadingState({ label }: { label?: string }) {
  const lang = useLang();
  return <div className="loading-state" role="status" aria-live="polite"><span className="loading-state-spinner" aria-hidden="true" />{label ?? t(lang, 'feedback_loading')}</div>;
}
