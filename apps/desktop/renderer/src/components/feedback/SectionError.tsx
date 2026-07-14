import { t } from '../../i18n';
import { useLang } from '../../ui/NotebookPrimitives';

export function SectionError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const lang = useLang();
  return <div className="section-error" role="alert" aria-live="assertive"><p>{message ?? t(lang, 'feedback_section_error')}</p>{onRetry && <button onClick={onRetry}>{t(lang, 'feedback_retry')}</button>}</div>;
}
