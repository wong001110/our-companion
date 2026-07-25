from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'Patch anchor not found in {path}: {old[:120]!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'apps/desktop/electron/main/services.ts',
    '    this.visits = new VisitService(this.network, this.publicCompanions);',
    '''    this.visits = new VisitService(
      this.network,
      this.publicCompanions,
      this.db,
      async (messages, source) => (await this.sendToAi({ messages, channel: 'turn', source })).content,
    );''',
)

replace_once(
    'apps/desktop/electron/main/networkConnection.ts',
    "    for (const event of ['visit.session.created', 'visit.session.updated', 'visit.session.ended']) {",
    "    for (const event of ['visit.session.created', 'visit.session.updated', 'visit.session.ended', 'visit.share.updated', 'visit.turn.created', 'visit.shared_moment.created']) {",
)

replace_once(
    'apps/desktop/electron/main/networkConnection.ts',
    '''  getVisitSessionDownloadUrls = (sessionId: string, fileIds: string[]) => this.socialRequest<{ downloads: Array<{ fileId: string; relativePath: string; downloadUrl: string; expiresAt: string; sizeBytes: number; sha256: string; mimeType: string }> }>(`/api/visit-sessions/${sessionId}/assets/download-urls`, { fileIds });
''',
    '''  getVisitSessionDownloadUrls = (sessionId: string, fileIds: string[]) => this.socialRequest<{ downloads: Array<{ fileId: string; relativePath: string; downloadUrl: string; expiresAt: string; sizeBytes: number; sha256: string; mimeType: string }> }>(`/api/visit-sessions/${sessionId}/assets/download-urls`, { fileIds });
  getVisitSocialState = (sessionId: string) => this.socialRequest<unknown>(`/api/visit-sessions/${sessionId}/social`);
  setVisitSocialShare = (sessionId: string, input: { title: string; summary: string; tags?: string[]; sourceUrl?: string }) => this.socialRequest<unknown>(`/api/visit-sessions/${sessionId}/social/share`, input);
  appendVisitSocialTurn = (sessionId: string, input: { clientTurnId: string; intent: string; message: string; emotion?: string; topic?: string }) => this.socialRequest<unknown>(`/api/visit-sessions/${sessionId}/social/turns`, input);
  finalizeVisitSharedMoment = (sessionId: string) => this.socialRequest<unknown>(`/api/visit-sessions/${sessionId}/social/shared-moment`, {});
''',
)

replace_once(
    'apps/desktop/electron/main/index.ts',
    '''    'network:visits:sessions:end': (sessionId: string) => services.visits.end(sessionId),
    'network:visits:visual:getState': () => services.visualVisits.getState(),''',
    '''    'network:visits:sessions:end': (sessionId: string) => services.visits.end(sessionId),
    'network:visits:invitations:sendDiscovery': (input: { hostUserId: string; discoveryId: string }) => services.visits.sendDiscoveryInvitation(input),
    'network:visits:sessions:getSocial': (sessionId: string) => services.visits.getSocialState(sessionId),
    'network:visits:sessions:respondSocial': (sessionId: string) => services.visits.respondSocial(sessionId),
    'network:visits:sessions:finalizeSocial': (sessionId: string) => services.visits.finalizeSocial(sessionId),
    'network:visits:visual:getState': () => services.visualVisits.getState(),''',
)

replace_once(
    'apps/desktop/electron/preload/index.ts',
    "if (process.env.OUR_COMPANION_SMOKE_TEST === '1') {",
    '''type SocialVisitApiExtension = {
  invitations: { sendDiscovery(input: { hostUserId: string; discoveryId: string }): Promise<unknown> };
  sessions: {
    getSocial(sessionId: string): Promise<unknown>;
    respondSocial(sessionId: string): Promise<unknown>;
    finalizeSocial(sessionId: string): Promise<unknown>;
  };
};
const socialVisits = api.network.visits as typeof api.network.visits & SocialVisitApiExtension;
socialVisits.invitations.sendDiscovery = (input) => invoke('network:visits:invitations:sendDiscovery', input);
socialVisits.sessions.getSocial = (sessionId) => invoke('network:visits:sessions:getSocial', sessionId);
socialVisits.sessions.respondSocial = (sessionId) => invoke('network:visits:sessions:respondSocial', sessionId);
socialVisits.sessions.finalizeSocial = (sessionId) => invoke('network:visits:sessions:finalizeSocial', sessionId);

if (process.env.OUR_COMPANION_SMOKE_TEST === '1') {''',
)

replace_once(
    'apps/desktop/renderer/src/pages/SocialPage.tsx',
    "import { PublishedCompanionSection } from '../features/social/PublishedCompanionSection';",
    "import { PublishedCompanionSection } from '../features/social/PublishedCompanionSection';\nimport { SocialVisitConversation, socialVisitApi } from '../features/social/SocialVisitConversation';",
)

replace_once(
    'apps/desktop/renderer/src/pages/SocialPage.tsx',
    '''  const [publicationAvailability, setPublicationAvailability] = useState({ loaded: false, canSendVisit: false });''',
    '''  const [publicationAvailability, setPublicationAvailability] = useState({ loaded: false, canSendVisit: false });
  const [shareCandidates, setShareCandidates] = useState<Array<{ id: string; title: string; summary: string }>>([]);
  const [selectedDiscoveryId, setSelectedDiscoveryId] = useState('');''',
)

replace_once(
    'apps/desktop/renderer/src/pages/SocialPage.tsx',
    '''    setPublicationAvailability({ loaded: false, canSendVisit: false });
  }, [scopeKey]);''',
    '''    setPublicationAvailability({ loaded: false, canSendVisit: false });
    setShareCandidates([]);
    setSelectedDiscoveryId('');
    void window.ourCompanion.discovery.getFeed({ limit: 20 }).then((items) => {
      const candidates = items.filter((item) => item.title && item.summary).map((item) => ({ id: item.id, title: item.title, summary: item.summary }));
      setShareCandidates(candidates);
      setSelectedDiscoveryId(candidates[0]?.id ?? '');
    }).catch(() => undefined);
  }, [scopeKey]);''',
)

replace_once(
    'apps/desktop/renderer/src/pages/SocialPage.tsx',
    '''  const friendsById = new Map(friends.map((friend) => [friend.userId, friend]));''',
    '''  const friendsById = new Map(friends.map((friend) => [friend.userId, friend]));
  const suggestedFriend = friends.find((friend) => friend.presence === 'online');''',
)

replace_once(
    'apps/desktop/renderer/src/pages/SocialPage.tsx',
    '''    {!hasLoaded && loading && <SectionLoading label={t(lang, 'social_loading')} />}
    <h3>{t(lang, 'social_friends')}</h3>''',
    '''    {!hasLoaded && loading && <SectionLoading label={t(lang, 'social_loading')} />}
    {suggestedFriend && <section className="social-overview" data-testid="social-visit-suggestion">
      <h3>{lang === 'zh-CN' ? 'Companion 的拜访建议' : 'Companion visit suggestion'}</h3>
      <p>{lang === 'zh-CN' ? `${suggestedFriend.username} 在线。你的 Companion 可以带一条 Discovery 去拜访。` : `${suggestedFriend.username} is online. Your Companion can visit with one approved Discovery.`}</p>
      <label><span>{lang === 'zh-CN' ? '允许分享的 Discovery' : 'Discovery approved to share'}</span>
        <select value={selectedDiscoveryId} onChange={(event) => setSelectedDiscoveryId(event.target.value)}>
          <option value="">{lang === 'zh-CN' ? '请选择' : 'Select one'}</option>
          {shareCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
        </select>
      </label>
      {!shareCandidates.length && <p>{lang === 'zh-CN' ? '目前没有可分享的 Discovery。' : 'There is no Discovery available to share yet.'}</p>}
    </section>}
    <h3>{t(lang, 'social_friends')}</h3>''',
)

replace_once(
    'apps/desktop/renderer/src/pages/SocialPage.tsx',
    '''        onVisit={() => void action(() => window.ourCompanion.network.visits.invitations.send(friend.userId), { phase: 'sending' })}''',
    '''        onVisit={() => selectedDiscoveryId
          ? void action(() => socialVisitApi().invitations.sendDiscovery({ hostUserId: friend.userId, discoveryId: selectedDiscoveryId }), { phase: 'sending' })
          : setActionError('social_error_action_unavailable')}''',
)

replace_once(
    'apps/desktop/renderer/src/pages/SocialPage.tsx',
    '''        {live && session.state !== 'ending' && <div className="operational-row-actions">
          {session.state === 'preparing' && !currentUserReady && <button data-testid="prepare-visit" disabled={busyAction || stale} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.prepare(session.id), { phase: 'preparing' })}>{busyAction ? t(lang, 'social_preparing') : t(lang, 'social_prepare')}</button>}
          {session.state === 'ready' && session.hostUserId === userId && <button data-testid="start-visit" disabled={busyAction || stale} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.start(session.id), { phase: 'starting' })}>{t(lang, 'social_start_visit')}</button>}
          <button data-testid="end-visit" disabled={busyAction || stale} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.end(session.id), { phase: 'ending' })}>{session.state === 'preparing' || session.state === 'ready' ? t(lang, 'social_cancel_visit') : t(lang, 'social_end_visit')}</button>
        </div>}
      </div>;''',
    '''        {live && session.state !== 'ending' && <div className="operational-row-actions">
          {session.state === 'preparing' && !currentUserReady && <button data-testid="prepare-visit" disabled={busyAction || stale} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.prepare(session.id), { phase: 'preparing' })}>{busyAction ? t(lang, 'social_preparing') : t(lang, 'social_prepare')}</button>}
          {session.state === 'ready' && session.hostUserId === userId && <button data-testid="start-visit" disabled={busyAction || stale} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.start(session.id), { phase: 'starting' })}>{t(lang, 'social_start_visit')}</button>}
          <button data-testid="end-visit" disabled={busyAction || stale} onClick={() => void action(() => window.ourCompanion.network.visits.sessions.end(session.id), { phase: 'ending' })}>{session.state === 'preparing' || session.state === 'ready' ? t(lang, 'social_cancel_visit') : t(lang, 'social_end_visit')}</button>
        </div>}
        <SocialVisitConversation session={session} userId={userId} lang={lang} stale={stale} />
      </div>;''',
)

Path('.github/agent/apply-social-visit-mvp.py').unlink(missing_ok=True)
Path('.github/workflows/apply-social-visit-mvp.yml').unlink(missing_ok=True)
