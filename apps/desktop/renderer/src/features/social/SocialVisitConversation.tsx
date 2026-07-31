import { useEffect, useMemo, useRef, useState } from 'react';
import type { SocialVisitState, VisitRoomTopic, VisitSessionSummary } from '@our-companion/shared';
import type { Lang } from '../../i18n';
import { InlineNotice } from '../../components/feedback/InlineNotice';
import { LoadingState } from '../../components/feedback/LoadingState';

export function SocialVisitConversation({
  session,
  userId,
  lang,
  stale,
}: {
  session: VisitSessionSummary;
  userId: string;
  lang: Lang;
  stale: boolean;
}) {
  const [state, setState] = useState<SocialVisitState>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [autoContinue, setAutoContinue] = useState(true);
  const requestedTurnKey = useRef<string | undefined>(undefined);
  const finalized = useRef(false);
  const live = ['preparing', 'ready', 'active', 'ending'].includes(session.state);
  const api = window.ourCompanion.network.visits.sessions;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await api.getSocial(session.id);
        if (!cancelled) {
          setState(next);
          setError(undefined);
        }
      } catch (cause) {
        if (!cancelled) setError(messageFor(cause, lang));
      }
    };
    void load();
    if (!live) return () => { cancelled = true; };
    const unsubscribe = window.ourCompanion.network.onStatusChanged((status) => {
      const invalidation = status.socialInvalidation;
      if (invalidation?.type === 'visit_session' && invalidation.sessionId === session.id) void load();
    });
    // Socket events are authoritative. The bounded reconciliation only repairs
    // missed events after sleep, reconnect, or renderer suspension.
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [api, lang, live, session.id]);

  useEffect(() => {
    if (!autoContinue || stale || busy || session.state !== 'active' || !state || state.nextActorUserId !== userId) return;
    if (!state.activeTopic && !state.share) return;
    const topicId = state.activeTopic?.id ?? state.share?.id ?? 'legacy-topic';
    const turnKey = `${session.id}:${topicId}:${state.turns.length}:${state.nextActorUserId}`;
    if (requestedTurnKey.current === turnKey) return;
    const timer = window.setTimeout(() => {
      requestedTurnKey.current = turnKey;
      void respond(turnKey);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [autoContinue, busy, session.id, session.state, stale, state, userId]);

  useEffect(() => {
    if (session.state !== 'ended' || finalized.current || !state || (!state.turns.length && !state.share && !state.topics.length)) return;
    finalized.current = true;
    void finalize();
  }, [session.state, state]);

  const respond = async (turnKey?: string) => {
    if (busy || stale) return;
    setBusy(true);
    setError(undefined);
    try {
      setState(await api.respondSocial(session.id));
    } catch (cause) {
      if (!turnKey || requestedTurnKey.current === turnKey) requestedTurnKey.current = undefined;
      setError(messageFor(cause, lang));
    } finally {
      setBusy(false);
    }
  };

  const finalize = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      setState(await api.finalizeSocial(session.id));
    } catch (cause) {
      finalized.current = false;
      setError(messageFor(cause, lang));
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (operation: () => Promise<SocialVisitState>) => {
    if (busy || stale) return;
    setBusy(true);
    setError(undefined);
    try {
      setState(await operation());
    } catch (cause) {
      setError(messageFor(cause, lang));
    } finally {
      setBusy(false);
    }
  };

  if (!state && !error) return <LoadingState label={copy(lang, 'loading')} />;

  return <div className="social-visit-conversation" data-testid="social-visit-conversation">
    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    {state && <RoomOverview state={state} userId={userId} lang={lang} busy={busy || stale} onSave={(topicId) => void mutate(() => api.saveTopic(session.id, topicId))} onSuppress={(topicId) => void mutate(() => api.suppressTopic(session.id, topicId))} />}
    {!state?.activeTopic && state?.share && <article className="online-user-info social-visit-share" data-testid="social-visit-share">
      <span className="soft-pill">{copy(lang, 'approved')}</span>
      <h4>{state.share.title}</h4>
      <p>{state.share.summary}</p>
      {state.share.tags.length > 0 && <p>{state.share.tags.join(' · ')}</p>}
    </article>}
    {!state?.activeTopic && !state?.share && <p>{copy(lang, session.visitorOwnerUserId === userId ? 'attachShare' : 'waitingShare')}</p>}
    {state && (state.activeTopic || state.share) && <>
      <Transcript state={state} userId={userId} lang={lang} />
      <p>{copy(lang, 'turnProgress', { current: state.turns.length, maximum: state.maxTurns })}</p>
      {session.state === 'active' && <div className="operational-row-actions">
        <label className="social-visit-auto-toggle"><input type="checkbox" checked={autoContinue} onChange={(event) => setAutoContinue(event.target.checked)} /> {copy(lang, 'autoContinue')}</label>
        {state.nextActorUserId === userId
          ? <button type="button" disabled={busy || stale} onClick={() => void respond()}>{busy ? copy(lang, 'thinking') : copy(lang, 'reply')}</button>
          : <span>{copy(lang, 'waitingRemote')}</span>}
      </div>}
    </>}
    {state?.sharedMoment && <article className="online-user-info" data-testid="shared-moment">
      <span className="soft-pill">{copy(lang, 'sharedMoment')}</span>
      <h4>{state.sharedMoment.title}</h4>
      <p>{state.sharedMoment.summary}</p>
      <button type="button" className="btn-secondary btn-sm" disabled={busy || stale || state.sharedMomentSaved} onClick={() => void mutate(() => api.saveSharedMoment(session.id))}>{state.sharedMomentSaved ? copy(lang, 'savedToJourney') : copy(lang, 'saveToJourney')}</button>
    </article>}
    {state?.privateReflection && <article className="online-user-info" data-testid="private-reflection">
      <span className="soft-pill">{copy(lang, 'privateReflection')}</span>
      <p>{state.privateReflection}</p>
      <small>{copy(lang, 'localOnly')}</small>
    </article>}
  </div>;
}

function RoomOverview({ state, userId, lang, busy, onSave, onSuppress }: {
  state: SocialVisitState;
  userId: string;
  lang: Lang;
  busy: boolean;
  onSave: (topicId: string) => void;
  onSuppress: (topicId: string) => void;
}) {
  const me = state.participants.find((participant) => participant.userId === userId);
  if (!state.topics.length && state.participants.length <= 2) return null;
  return <section className="social-room-overview" aria-label={copy(lang, 'roomOverview')}>
    {state.participants.length > 0 && <p><strong>{copy(lang, 'participants')}</strong> {state.participants.filter((item) => item.state !== 'left').map((item) => item.companionName ?? item.role).join(' · ')}</p>}
    {state.topics.length > 0 && <div className="social-room-topic-list">
      {state.topics.map((topic) => {
        const saved = state.savedTopicIds?.includes(topic.id) ?? false;
        const suppressed = state.suppressedTopicIds?.includes(topic.id) ?? false;
        const canSave = topic.allowRecipientSave && topic.ownerCompanionId !== me?.networkCompanionId;
        return <article key={topic.id} className={`online-user-info social-room-topic social-room-topic-${topic.state}`} data-topic-state={topic.state}>
          <div className="operational-row-main"><strong>{copy(lang, 'topicNumber', { current: topic.sequence })}: {topic.title}</strong><span className="soft-pill">{topicStateCopy(lang, topic.state)}</span></div>
          <p>{topic.summary}</p>
          {topic.tags.length > 0 && <small>{topic.tags.join(' · ')}</small>}
          {topic.sourceUrl && topic.shareScope === 'summary_and_source' && <p><a href={topic.sourceUrl} target="_blank" rel="noreferrer">{copy(lang, 'openSource')}</a></p>}
          <div className="operational-row-actions">
            {canSave && <button type="button" className="btn-secondary btn-sm" disabled={busy || saved} onClick={() => onSave(topic.id)}>{saved ? copy(lang, 'savedToDiscovery') : copy(lang, 'saveToDiscovery')}</button>}
            <button type="button" className="btn-ghost btn-sm" disabled={busy || suppressed} onClick={() => onSuppress(topic.id)}>{suppressed ? copy(lang, 'suppressed') : copy(lang, 'doNotSuggest')}</button>
          </div>
        </article>;
      })}
    </div>}
  </section>;
}

function Transcript({ state, userId, lang }: { state: SocialVisitState; userId: string; lang: Lang }) {
  const participantNames = new Map(state.participants.map((participant) => [participant.userId, participant.companionName ?? roleCopy(lang, participant.role)]));
  const topicById = new Map(state.topics.map((topic) => [topic.id, topic]));
  const orderedGroups = useMemo(() => {
    const groups = new Map<string, typeof state.turns>();
    for (const turn of state.turns) {
      const key = turn.roomTopicId ?? 'unassigned';
      groups.set(key, [...(groups.get(key) ?? []), turn]);
    }
    return [...state.topics.map((topic) => topic.id), ...(groups.has('unassigned') ? ['unassigned'] : [])]
      .filter((id) => groups.has(id))
      .map((id) => ({ id, topic: topicById.get(id), turns: groups.get(id)! }));
  }, [state.topics, state.turns]);
  return <div className="social-visit-transcript" aria-live="polite">
    {orderedGroups.length ? orderedGroups.map((group) => <section key={group.id} className="social-visit-topic-segment" data-testid="social-visit-topic-segment">
      {group.topic && <h4>{copy(lang, 'topicNumber', { current: group.topic.sequence })}: {group.topic.title}</h4>}
      {group.turns.map((turn) => <p key={turn.id} className="online-user-info" data-testid="social-visit-turn">
        <strong>{turn.senderUserId === userId ? copy(lang, 'localCompanion') : participantNames.get(turn.senderUserId) ?? copy(lang, 'remoteCompanion')}</strong>
        <span className="soft-pill">{turn.intent}</span><br />
        {turn.message}
      </p>)}
    </section>) : <p>{copy(lang, 'notStarted')}</p>}
  </div>;
}

function messageFor(cause: unknown, lang: Lang): string {
  const code = cause instanceof Error ? cause.message : String(cause);
  if (code.includes('VISIT_TURN_ORDER_INVALID')) return copy(lang, 'turnChanged');
  if (code.includes('VISIT_SHARE_REQUIRED')) return copy(lang, 'shareRequired');
  if (code.includes('VISIT_SOCIAL_NOT_AVAILABLE')) return copy(lang, 'relationshipChanged');
  if (code.includes('VISIT_TOPIC_SAVE_NOT_ALLOWED')) return copy(lang, 'saveNotAllowed');
  return copy(lang, 'failed');
}

function topicStateCopy(lang: Lang, state: VisitRoomTopic['state']): string {
  return copy(lang, state === 'active' ? 'topicActive' : state === 'completed' ? 'topicCompleted' : 'topicQueued');
}

function roleCopy(lang: Lang, role: string): string {
  return copy(lang, role === 'host' ? 'host' : role === 'guest' ? 'guest' : 'visitor');
}

function copy(lang: Lang, key: string, params: Record<string, number> = {}): string {
  const en: Record<string, string> = {
    loading: 'Loading the Companion conversation…', approved: 'Approved Discovery', attachShare: 'Prepare this Visit to attach the Discovery you approved.', waitingShare: 'Waiting for an approved topic.', localCompanion: 'Your Companion', remoteCompanion: 'Friend Companion', notStarted: 'The Companions have not started talking yet.', autoContinue: 'Let my Companion continue automatically', thinking: 'Thinking…', reply: 'Generate next Companion turn', waitingRemote: 'Waiting for the other Companion…', sharedMoment: 'Shared Moment', privateReflection: 'Private Reflection', localOnly: 'Stored only on this device.', turnChanged: 'Another device already advanced the turn. The conversation will refresh.', shareRequired: 'An approved topic is required before this Visit can start.', relationshipChanged: 'The friendship or permission boundary changed, so the conversation stopped.', failed: 'The Companion conversation could not be updated.', turnProgress: 'Turn {current} / {maximum}', roomOverview: 'Social Room overview', participants: 'Companions:', topicNumber: 'Topic {current}', topicActive: 'Now', topicQueued: 'Next', topicCompleted: 'Completed', saveToDiscovery: 'Save to Discovery Feed', savedToDiscovery: 'Saved to Discovery', doNotSuggest: 'Do not suggest again', suppressed: 'Suggestion blocked', openSource: 'Open shared source', saveToJourney: 'Add Shared Moment to Journey', savedToJourney: 'Added to Journey', saveNotAllowed: 'This topic cannot be saved by the recipient.', host: 'Host Companion', visitor: 'Visiting Companion', guest: 'Guest Companion',
  };
  const zh: Record<string, string> = {
    loading: '正在载入 Companion 对话…', approved: '已批准的 Discovery', attachShare: '请先准备此次拜访，以附上已批准的主题。', waitingShare: '正在等待获准分享的主题。', localCompanion: '你的 Companion', remoteCompanion: '好友的 Companion', notStarted: 'Companion 之间还没有开始交谈。', autoContinue: '让我的 Companion 自动继续', thinking: '思考中…', reply: '生成下一轮 Companion 回复', waitingRemote: '正在等待对方 Companion…', sharedMoment: '共同片段', privateReflection: '私人回想', localOnly: '只保存在此设备。', turnChanged: '另一台设备已经推进了回合，对话将自动刷新。', shareRequired: '开始拜访前必须有获准分享的主题。', relationshipChanged: '好友或权限边界已经改变，因此对话已停止。', failed: '无法更新 Companion 对话。', turnProgress: '第 {current} / {maximum} 轮', roomOverview: 'Social Room 概况', participants: '参与 Companion：', topicNumber: '主题 {current}', topicActive: '讨论中', topicQueued: '下一个', topicCompleted: '已完成', saveToDiscovery: '保存到 Discovery Feed', savedToDiscovery: '已保存到 Discovery', doNotSuggest: '以后不要再建议', suppressed: '已屏蔽建议', openSource: '打开分享来源', saveToJourney: '把共同片段加入 Journey', savedToJourney: '已加入 Journey', saveNotAllowed: '分享者未允许接收方保存这个主题。', host: 'Host Companion', visitor: '来访 Companion', guest: 'Guest Companion',
  };
  let value = (lang === 'zh-CN' ? zh : en)[key] ?? key;
  for (const [name, number] of Object.entries(params)) value = value.replace(`{${name}}`, String(number));
  return value;
}
