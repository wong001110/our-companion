import type { CompanionJourney, JourneyMilestoneV2 } from '@our-companion/shared';
import { t } from '../i18n';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { useJourneysViewModel } from '../features/journeys/useJourneysViewModel';
import { NotebookPage, PaperCard, StickyNote, useLang } from '../ui/NotebookPrimitives';

export function JourneysPage({ journeys, timeline, onRefresh }: { journeys: CompanionJourney[]; timeline: JourneyMilestoneV2[]; onRefresh: () => Promise<void> }) {
  const lang = useLang();
  const { busy, createNewJourney, error } = useJourneysViewModel({ lang, onRefresh });
  return (
    <NotebookPage eyebrow={t(lang, 'journey_eyebrow')} title={t(lang, 'journey_title')} note={t(lang, 'journey_note')}>
      <div className="toolbar notebook-toolbar"><p className="soft-pill">{t(lang, 'journey_active_count').replace('{count}', String(journeys.length)).replace('{plural}', journeys.length === 1 ? '' : 's')}</p><button disabled={busy} onClick={() => void createNewJourney()}>{t(lang, 'journey_new')}</button></div>
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      <div className="journey-list">
        {journeys.map((journey, index) => <PaperCard key={journey.id} className="journey-card" tape><div className="journey-main"><span className="doodle-icon" aria-hidden="true">map</span><div><h3>{journey.title}</h3><p>{journey.description ?? t(lang, 'journey_default_desc')}</p><p className="soft-pill">{timeline[index] ? t(lang, 'journey_progress_with_next') : t(lang, 'journey_progress_without_next')}</p></div></div><StickyNote title={t(lang, 'journey_next_step')} compact><p>{timeline[index]?.description ?? timeline[index]?.title ?? t(lang, 'journey_default_next_step')}</p></StickyNote></PaperCard>)}
        {journeys.length === 0 && <StickyNote title={t(lang, 'journey_empty_title')}><p>{t(lang, 'journey_empty_body')}</p></StickyNote>}
      </div>
    </NotebookPage>
  );
}
