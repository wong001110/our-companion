import { useEffect, useRef, useState } from 'react';
import type { VisitInvitationSummary, VisitSessionSummary } from '@our-companion/shared';
import type { Lang } from '../../i18n';
import { InlineNotice } from '../../components/feedback/InlineNotice';
import { LoadingState } from '../../components/feedback/LoadingState';

export type SocialVisitState = {
  sessionId: string;
  maxTurns: number;
  nextActorUserId?: string;
  share?: {
    id: string;
    kind: 'discovery';
    title: string;
    summary: string;
    tags: string[];
    sourceUrl?: string;
  };
  turns: Array<{
    id: string;
    sequence: number;
    senderUserId: string;
    intent: string;
    message: string;
    emotion?: string;
    topic?: string;
    createdAt: string;
  }>;
  sharedMoment?: {
    id: string;
    title: string;
    summary: string;
    turnCount: number;
    createdAt: string;
  };
  privateReflection?: string;
};

type SocialVisitsApi = {
  invitations: {
    sendDiscovery(input: { hostUserId: string; discoveryId: string }): Promise<VisitInvitationSummary>;
  };
  sessions: {
    getSocial(sessionId: string): Promise<SocialVisitState>;
    respondSocial(sessionId: string): Promise<SocialVisitState>;
    finalizeSocial(sessionId: string): Promise<SocialVisitState>;
  };
};

export function socialVisitApi(): SocialVisitsApi {
  return window.ourCompanion.network.visits as unknown as SocialVisitsApi;
}

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
  const requestedSequence = useRef<number | undefined>(undefined);
  const finalized = useRef(false);
  const live = ['preparing', 'ready', 'active', 'ending'].includes(session.state);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await socialVisitApi().sessions.getSocial(session.id);
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
    const timer = window.setInterval(() => void load(), 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [lang, live, session.id]);

  useEffect(() => {
    if (!autoContinue || stale || busy || session.state !== 'active' || !state?.share || state.nextActorUserId !== userId) return;
    const sequence = state.turns.length;
    if (requestedSequence.current === sequence) return;
    requestedSequence.current = sequence;
    const timer = window.setTimeout(() => void respond(), 700);
    return () => window.clearTimeout(timer);
  }, [autoContinue, busy, session.state, stale, state, userId]);

  useEffect(() => {
    if (session.state !== 'ended' || finalized.current || !state?.share) return;
    finalized.current = true;
    void finalize();
  }, [session.state, state?.share]);

  const respond = async () => {
    if (busy || stale) return;
    setBusy(true);
    setError(undefined);
    try {
      setState(await socialVisitApi().sessions.respondSocial(session.id));
    } catch (cause) {
      requestedSequence.current = undefined;
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
      setState(await socialVisitApi().sessions.finalizeSocial(session.id));
    } catch (cause) {
      finalized.current = false;
      setError(messageFor(cause, lang));
    } finally {
      setBusy(false);
    }
  };

  if (!state && !error) return <LoadingState label={copy(lang, 'loading')} />;

  return <div className="social-visit-conversation" data-testid="social-visit-conversation">
    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    {state?.share && <article className="online-user-info social-visit-share" data-testid="social-visit-share">
      <span className="soft-pill">{copy(lang, 'approved')}</span>
      <h4>{state.share.title}</h4>
      <p>{state.share.summary}</p>
      {state.share.tags.length > 0 && <p>{state.share.tags.join(' · ')}</p>}
    </article>}
    {!state?.share && <p>{copy(lang, session.visitorOwnerUserId === userId ? 'attachShare' : 'waitingShare')}</p>}
    {state?.share && <>
      <div className="social-visit-transcript" aria-live="polite">
        {state.turns.length ? state.turns.map((turn) => <p key={turn.id} className="online-user-info" data-testid="social-visit-turn">
          <strong>{turn.senderUserId === userId ? copy(lang, 'localCompanion') : copy(lang, 'remoteCompanion')}</strong>
          <span className="soft-pill">{turn.intent}</span><br />
          {turn.message}
        </p>) : <p>{copy(lang, 'notStarted')}</p>}
      </div>
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
    </article>}
    {state?.privateReflection && <article className="online-user-info" data-testid="private-reflection">
      <span className="soft-pill">{copy(lang, 'privateReflection')}</span>
      <p>{state.privateReflection}</p>
      <small>{copy(lang, 'localOnly')}</small>
    </article>}
  </div>;
}

function messageFor(cause: unknown, lang: Lang): string {
  const code = cause instanceof Error ? cause.message : String(cause);
  if (code.includes('VISIT_TURN_ORDER_INVALID')) return copy(lang, 'turnChanged');
  if (code.includes('VISIT_SHARE_REQUIRED')) return copy(lang, 'shareRequired');
  if (code.includes('VISIT_SOCIAL_NOT_AVAILABLE')) return copy(lang, 'relationshipChanged');
  return copy(lang, 'failed');
}

function copy(lang: Lang, key: string, params: Record<string, number> = {}): string {
  const en: Record<string, string> = {
    loading: 'Loading the Companion conversation…',
    approved: 'Approved Discovery',
    attachShare: 'Prepare this Visit to attach the Discovery you approved.',
    waitingShare: 'Waiting for the visiting Companion to attach the approved Discovery.',
    localCompanion: 'Your Companion',
    remoteCompanion: 'Friend Companion',
    notStarted: 'The Companions have not started talking yet.',
    autoContinue: 'Let my Companion continue automatically',
    thinking: 'Thinking…',
    reply: 'Generate next Companion turn',
    waitingRemote: 'Waiting for the other Companion…',
    sharedMoment: 'Shared Moment',
    privateReflection: 'Private Reflection',
    localOnly: 'Stored only on this device.',
    turnChanged: 'The other device already changed the turn. The conversation will refresh.',
    shareRequired: 'An approved Discovery is required before this Visit can start.',
    relationshipChanged: 'The friendship or permission boundary changed, so the conversation stopped.',
    failed: 'The Companion conversation could not be updated.',
    turnProgress: 'Turn {current} / {maximum}',
  };
  const zh: Record<string, string> = {
    loading: '正在载入 Companion 对话…',
    approved: '已批准的 Discovery',
    attachShare: '请先准备此次拜访，以附上你已批准分享的 Discovery。',
    waitingShare: '正在等待来访 Companion 附上已批准的 Discovery。',
    localCompanion: '你的 Companion',
    remoteCompanion: '好友的 Companion',
    notStarted: 'Companion 之间还没有开始交谈。',
    autoContinue: '让我的 Companion 自动继续',
    thinking: '思考中…',
    reply: '生成下一轮 Companion 回复',
    waitingRemote: '正在等待对方 Companion…',
    sharedMoment: '共同片段',
    privateReflection: '私人回想',
    localOnly: '只保存在此设备。',
    turnChanged: '另一台设备已经推进了回合，对话将自动刷新。',
    shareRequired: '开始拜访前必须有一条获准分享的 Discovery。',
    relationshipChanged: '好友或权限边界已经改变，因此对话已停止。',
    failed: '无法更新 Companion 对话。',
    turnProgress: '第 {current} / {maximum} 轮',
  };
  let value = (lang === 'zh-CN' ? zh : en)[key] ?? key;
  for (const [name, number] of Object.entries(params)) value = value.replace(`{${name}}`, String(number));
  return value;
}
