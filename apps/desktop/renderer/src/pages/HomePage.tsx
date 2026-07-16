import type { CharacterProfile, CharacterRuntimeState, CompanionJourney, CompanionProfile, DiaryEntry, Discovery, ExplorationCycleResult, ExplorationLoopEvent } from '@our-companion/shared';
import { t } from '../i18n';
import { InlineNotice } from '../components/feedback/InlineNotice';
import { useHomeViewModel } from '../features/home/useHomeViewModel';
import { CompanionCanvas } from '../ui/CompanionCanvas';
import { NotebookPage, PaperCard, StickyNote, useLang } from '../ui/NotebookPrimitives';
import { companionMoodLabel, companionStatusMessage } from '../ui/utils';

export function HomePage({ state, character, companion, discoveries, journeys, diary, exploration, explorationEvents, exploring, onStartExploration, onSubmitFeedback, onRefresh }: {
  state?: CharacterRuntimeState;
  character?: CharacterProfile;
  companion?: CompanionProfile;
  discoveries: Discovery[];
  journeys: CompanionJourney[];
  diary: DiaryEntry[];
  exploration?: ExplorationCycleResult;
  explorationEvents: ExplorationLoopEvent[];
  exploring: boolean;
  onStartExploration: () => Promise<void>;
  onSubmitFeedback: (value: 'saved' | 'not_interested' | 'later' | 'talk_about_this' | 'opened_evidence') => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const lang = useLang();
  const { error, generateDiary, generatingDiary } = useHomeViewModel({ lang, onRefresh });
  const currentFocus = journeys[0]?.title ?? discoveries[0]?.title ?? t(lang, 'home_focus_empty_title');
  const diaryHighlight = diary[0]?.content ?? t(lang, 'home_diary_default');
  const companionName = companion?.name ?? character?.name ?? t(lang, 'home_default_companion_name');
  return <NotebookPage eyebrow={t(lang, 'home_eyebrow')} title={t(lang, 'home_title')} note={t(lang, 'home_note').replace('{name}', companionName)} marker="authorship">
    <div className="home-notebook-grid">
      <PaperCard className="companion-status-card" title={t(lang, 'home_companion_status_card')} tape><div className="companion-status-content">{companion ? <CompanionCanvas compact state={state} assetRoot={companion.assetRoot} companionId={companion.id} /> : <div className="companion-asset-placeholder" aria-label={t(lang, 'home_asset_unavailable')}>✦</div>}<div><p>{companionStatusMessage(state, lang)}</p><span className="soft-pill">{companionMoodLabel(state, lang)}</span></div></div></PaperCard>
      <StickyNote title={t(lang, 'home_companion_message_title')} className="companion-message-note"><p>{t(lang, 'home_companion_message_body')}</p><button onClick={() => void onStartExploration()} disabled={exploring} className="primary-notebook-action">{exploring ? t(lang, 'home_exploring') : t(lang, 'home_send_exploring')}</button></StickyNote>
      {exploration?.selectedInsight && <PaperCard title={t(lang, 'home_returned').replace('{name}', companionName)} tape className="wide-card insight-return-card"><p className="focus-title">{exploration.selectedInsight.title}</p><p>{exploration.selectedInsight.summary}</p><div className="tag-row"><span>{exploration.selectedCuriosityTarget?.explorationType ?? t(lang, 'home_insight')}</span><span>{exploration.cycle.state}</span></div><div className="action-row"><button onClick={() => void onSubmitFeedback('saved')}>{t(lang, 'home_save')}</button><button onClick={() => void onSubmitFeedback('not_interested')}>{t(lang, 'home_not_interested')}</button><button onClick={() => void onSubmitFeedback('later')}>{t(lang, 'home_later')}</button><button onClick={() => void onSubmitFeedback('talk_about_this')}>{t(lang, 'home_talk_about')}</button></div></PaperCard>}
      <PaperCard title={t(lang, 'home_current_focus')} tape><p className="focus-title">{currentFocus}</p><p>{journeys[0]?.description ?? t(lang, 'home_focus_default_desc')}</p><p className="soft-pill">{journeys[0] ? t(lang, 'home_in_progress') : t(lang, 'home_no_next_step')}</p></PaperCard>
      <PaperCard title={t(lang, 'home_at_glance')} tape><div className="glance-list"><span>{t(lang, 'home_glance_discoveries')} <strong>{discoveries.length}</strong></span><span>{t(lang, 'home_glance_journeys')} <strong>{journeys.length}</strong></span><span>{t(lang, 'home_glance_memories')} <strong>{diary.length}</strong></span></div></PaperCard>
      {explorationEvents.length > 0 && <PaperCard title={t(lang, 'home_exploration_loop')} tape><div className="exploration-event-list">{explorationEvents.slice(0, 5).map((event) => <span key={event.id}><strong>{event.state}</strong>{event.message}</span>)}</div></PaperCard>}
      <PaperCard title={t(lang, 'home_mood')} tape><div className="mood-row"><span className="doodle-face" aria-hidden="true">:)</span><strong>{companionMoodLabel(state, lang)}</strong></div></PaperCard>
      <PaperCard title={t(lang, 'home_memory_highlight')} tape className="wide-card"><p>{diaryHighlight}</p><button disabled={generatingDiary} onClick={() => void generateDiary()}>{t(lang, 'home_write_note')}</button>{error && <InlineNotice tone="error">{error}</InlineNotice>}</PaperCard>
    </div>
  </NotebookPage>;
}
