from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(relative_path: str, old: str, new: str) -> None:
    path = ROOT / relative_path
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{relative_path}: expected one replacement anchor, found {count}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


def insert_before_last(relative_path: str, anchor: str, insertion: str) -> None:
    path = ROOT / relative_path
    source = path.read_text(encoding="utf-8")
    index = source.rfind(anchor)
    if index < 0:
        raise SystemExit(f"{relative_path}: final insertion anchor not found")
    path.write_text(source[:index] + insertion + source[index:], encoding="utf-8")


# 1. Shared Moment persistence: create Journey-ready discoveries and recover the
#    eligible record left behind by the previously failing implementation.
visit_service = "apps/desktop/electron/main/network/visitService.ts"
replace_once(
    visit_service,
    """  saveSharedMoment = async (sessionId: string): Promise<SocialVisitState> => {
    if (!this.db) throw new Error('VISIT_SOCIAL_LOCAL_STORE_UNAVAILABLE');
    const state = normalizeSocialState(await this.network.getVisitSocialState(sessionId));
    if (!state.sharedMoment) throw new Error('VISIT_SHARED_MOMENT_NOT_READY');
    const key = `${SAVED_MOMENT_PREFIX}${sessionId}`;
    let discoveryId = this.db.getAppSetting<string>(key);
    if (!discoveryId) {
      discoveryId = `shared-moment-${randomUUID()}`;
      this.db.insertDiscovery(discoveryFromMoment(discoveryId, state.sharedMoment, state.topics, this.db.resolveActiveCompanionId()));
      this.db.setAppSetting(key, discoveryId);
      if (this.addDiscoveryToJourney) await this.addDiscoveryToJourney(discoveryId);
    }
    return this.getSocialState(sessionId);
  };""",
    """  saveSharedMoment = async (sessionId: string): Promise<SocialVisitState> => {
    if (!this.db) throw new Error('VISIT_SOCIAL_LOCAL_STORE_UNAVAILABLE');
    const state = normalizeSocialState(await this.network.getVisitSocialState(sessionId));
    if (!state.sharedMoment) throw new Error('VISIT_SHARED_MOMENT_NOT_READY');
    const key = `${SAVED_MOMENT_PREFIX}${sessionId}`;
    let discoveryId = this.db.getAppSetting<string>(key);
    let discovery = discoveryId ? this.db.getDiscovery(discoveryId) : undefined;
    if (!discovery) {
      discoveryId = `shared-moment-${randomUUID()}`;
      discovery = this.db.insertDiscovery(discoveryFromMoment(discoveryId, state.sharedMoment, state.topics, this.db.resolveActiveCompanionId()));
      this.db.setAppSetting(key, discoveryId);
    }
    discovery = this.prepareSharedMomentDiscoveryForJourney(discovery);
    if (discovery.status !== 'saved') {
      if (!this.addDiscoveryToJourney) throw new Error('VISIT_JOURNEY_UNAVAILABLE');
      await this.addDiscoveryToJourney(discovery.id);
    }
    return this.getSocialState(sessionId);
  };""",
)
replace_once(
    visit_service,
    """  private withLocalSocialState(sessionId: string, state: SocialVisitState): SocialVisitState {
    const savedTopicIds = state.topics.filter((topic) => Boolean(this.db?.getAppSetting<string>(`${SAVED_TOPIC_PREFIX}${sessionId}.${topic.id}`))).map((topic) => topic.id);
    const suppressedTopicIds = state.topics.filter((topic) => Boolean(this.db?.getAppSetting<boolean>(`${SUPPRESSED_TOPIC_PREFIX}${topic.id}`))).map((topic) => topic.id);
    return {
      ...state,
      privateReflection: this.db?.getAppSetting<string>(`${REFLECTION_PREFIX}${sessionId}`),
      savedTopicIds,
      suppressedTopicIds,
      sharedMomentSaved: Boolean(this.db?.getAppSetting<string>(`${SAVED_MOMENT_PREFIX}${sessionId}`)),
    };
  }

  private attachApprovedShare""",
    """  private withLocalSocialState(sessionId: string, state: SocialVisitState): SocialVisitState {
    const savedTopicIds = state.topics.filter((topic) => Boolean(this.db?.getAppSetting<string>(`${SAVED_TOPIC_PREFIX}${sessionId}.${topic.id}`))).map((topic) => topic.id);
    const suppressedTopicIds = state.topics.filter((topic) => Boolean(this.db?.getAppSetting<boolean>(`${SUPPRESSED_TOPIC_PREFIX}${topic.id}`))).map((topic) => topic.id);
    const savedMomentDiscoveryId = this.db?.getAppSetting<string>(`${SAVED_MOMENT_PREFIX}${sessionId}`);
    const savedMomentDiscovery = savedMomentDiscoveryId ? this.db?.getDiscovery?.(savedMomentDiscoveryId) : undefined;
    return {
      ...state,
      privateReflection: this.db?.getAppSetting<string>(`${REFLECTION_PREFIX}${sessionId}`),
      savedTopicIds,
      suppressedTopicIds,
      sharedMomentSaved: savedMomentDiscovery?.status === 'saved',
    };
  }

  private prepareSharedMomentDiscoveryForJourney(discovery: Discovery): Discovery {
    if (!this.db) return discovery;
    let current = discovery;
    const reason = { reason: 'social_visit_shared_moment_recovery' };
    if (current.status === 'eligible') current = this.db.transitionDiscoveryStatus(current.id, 'queued', reason);
    if (current.status === 'queued') current = this.db.transitionDiscoveryStatus(current.id, 'presenting', reason);
    if (current.status === 'presenting') current = this.db.transitionDiscoveryStatus(current.id, 'announced', reason);
    if (current.status !== 'announced' && current.status !== 'saved') {
      throw new Error(`VISIT_SHARED_MOMENT_DISCOVERY_STATE_INVALID:${current.status}`);
    }
    return current;
  }

  private attachApprovedShare""",
)
replace_once(
    visit_service,
    "finalScore: 0.65, status: 'eligible', companionId, whyThisMatters: 'A shared moment created by the Companions during a Social Visit.'",
    "finalScore: 0.65, status: 'announced', companionId, whyThisMatters: 'A shared moment created by the Companions during a Social Visit.'",
)

# 2. Auto continuation: do not mark a sequence as requested until the delay
#    actually fires. A Socket refresh used to cancel the timer while leaving the
#    sequence locked forever.
conversation = "apps/desktop/renderer/src/features/social/SocialVisitConversation.tsx"
replace_once(
    conversation,
    "  const requestedSequence = useRef<number | undefined>(undefined);",
    "  const requestedTurnKey = useRef<string | undefined>(undefined);",
)
replace_once(
    conversation,
    """  useEffect(() => {
    if (!autoContinue || stale || busy || session.state !== 'active' || !state || state.nextActorUserId !== userId) return;
    if (!state.activeTopic && !state.share) return;
    const sequence = state.turns.length;
    if (requestedSequence.current === sequence) return;
    requestedSequence.current = sequence;
    const timer = window.setTimeout(() => void respond(), 700);
    return () => window.clearTimeout(timer);
  }, [autoContinue, busy, session.state, stale, state, userId]);""",
    """  useEffect(() => {
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
  }, [autoContinue, busy, session.id, session.state, stale, state, userId]);""",
)
replace_once(
    conversation,
    """  const respond = async () => {
    if (busy || stale) return;
    setBusy(true);
    setError(undefined);
    try {
      setState(await api.respondSocial(session.id));
    } catch (cause) {
      requestedSequence.current = undefined;
      setError(messageFor(cause, lang));
    } finally {
      setBusy(false);
    }
  };""",
    """  const respond = async (turnKey?: string) => {
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
  };""",
)

# 3. Terminal Visit cards may be dismissed locally. Network Journal/history is
#    preserved; the choice is scoped by Network origin and account.
social_page = "apps/desktop/renderer/src/pages/SocialPage.tsx"
replace_once(
    social_page,
    """  const [reservation, setReservation] = useState<VisitReservationSummary>({ locked: false });
  const scopeKeyRef = useRef(scopeKey);""",
    """  const [reservation, setReservation] = useState<VisitReservationSummary>({ locked: false });
  const [dismissedTerminalVisitIds, setDismissedTerminalVisitIds] = useState<string[]>([]);
  const scopeKeyRef = useRef(scopeKey);""",
)
replace_once(
    social_page,
    """    setJoinableRooms([]);
    setReservation({ locked: false });
    void window.ourCompanion.discovery.getFeed""",
    """    setJoinableRooms([]);
    setReservation({ locked: false });
    setDismissedTerminalVisitIds(readDismissedTerminalVisitIds(scopeKey));
    void window.ourCompanion.discovery.getFeed""",
)
replace_once(
    social_page,
    """  }, [refreshVisitOptions, scopeKey]);

  if (!status)""",
    """  }, [refreshVisitOptions, scopeKey]);

  const clearTerminalVisit = useCallback((sessionId: string) => {
    if (!scopeKey) return;
    setDismissedTerminalVisitIds((current) => {
      if (current.includes(sessionId)) return current;
      const next = [...current, sessionId].slice(-100);
      writeDismissedTerminalVisitIds(scopeKey, next);
      return next;
    });
  }, [scopeKey]);

  if (!status)""",
)
replace_once(
    social_page,
    """  const latestTerminalVisit = visitSessions.find((session) => ['ended', 'cancelled', 'failed'].includes(session.state));""",
    """  const latestTerminalVisit = visitSessions.find((session) => ['ended', 'cancelled', 'failed'].includes(session.state) && !dismissedTerminalVisitIds.includes(session.id));""",
)
replace_once(
    social_page,
    """    {loadedDomains.visitSessions && <CurrentVisitSection lang={lang} stale={stale} liveVisits={liveVisits} latestTerminalVisit={latestTerminalVisit} userId={userId} visualVisit={visualVisit} busyAction={busyAction} action={action} refreshVisitOptions={refreshVisitOptions} />}""",
    """    {loadedDomains.visitSessions && <CurrentVisitSection lang={lang} stale={stale} liveVisits={liveVisits} latestTerminalVisit={latestTerminalVisit} userId={userId} visualVisit={visualVisit} busyAction={busyAction} action={action} refreshVisitOptions={refreshVisitOptions} onClearTerminalVisit={clearTerminalVisit} />}""",
)
replace_once(
    social_page,
    """function CurrentVisitSection({
  lang, stale, liveVisits, latestTerminalVisit, userId, visualVisit, busyAction, action, refreshVisitOptions,
}: {""",
    """function CurrentVisitSection({
  lang, stale, liveVisits, latestTerminalVisit, userId, visualVisit, busyAction, action, refreshVisitOptions, onClearTerminalVisit,
}: {""",
)
replace_once(
    social_page,
    """  action: (operation: () => Promise<unknown>, options?: { phase?: SocialMutationPhase }) => Promise<void>;
  refreshVisitOptions: () => Promise<void>;
}) {""",
    """  action: (operation: () => Promise<unknown>, options?: { phase?: SocialMutationPhase }) => Promise<void>;
  refreshVisitOptions: () => Promise<void>;
  onClearTerminalVisit: (sessionId: string) => void;
}) {""",
)
replace_once(
    social_page,
    """    {sessions.length ? sessions.map((session) => <CurrentVisitCard key={session.id} session={session} live={liveVisits.some((candidate) => candidate.id === session.id)} lang={lang} stale={stale} userId={userId} visualVisit={visualVisit} busyAction={busyAction} action={action} refreshVisitOptions={refreshVisitOptions} />) : <p data-testid="visit-session-state">{t(lang, 'social_no_current_visit')}</p>}""",
    """    {sessions.length ? sessions.map((session) => <CurrentVisitCard key={session.id} session={session} live={liveVisits.some((candidate) => candidate.id === session.id)} lang={lang} stale={stale} userId={userId} visualVisit={visualVisit} busyAction={busyAction} action={action} refreshVisitOptions={refreshVisitOptions} onClearTerminalVisit={onClearTerminalVisit} />) : <p data-testid="visit-session-state">{t(lang, 'social_no_current_visit')}</p>}""",
)
replace_once(
    social_page,
    """function CurrentVisitCard({ session, live, lang, stale, userId, visualVisit, busyAction, action, refreshVisitOptions }: {""",
    """function CurrentVisitCard({ session, live, lang, stale, userId, visualVisit, busyAction, action, refreshVisitOptions, onClearTerminalVisit }: {""",
)
replace_once(
    social_page,
    """  action: (operation: () => Promise<unknown>, options?: { phase?: SocialMutationPhase }) => Promise<void>;
  refreshVisitOptions: () => Promise<void>;
}) {
  const [room, setRoom]""",
    """  action: (operation: () => Promise<unknown>, options?: { phase?: SocialMutationPhase }) => Promise<void>;
  refreshVisitOptions: () => Promise<void>;
  onClearTerminalVisit: (sessionId: string) => void;
}) {
  const [room, setRoom]""",
)
replace_once(
    social_page,
    """    {!live && <p>{t(lang, session.endReason ? visitEndReasonPresentation(session.endReason) : visitFailurePresentation(session.failureCode))}</p>}""",
    """    {!live && <div className="terminal-visit-summary">
      <p>{t(lang, session.endReason ? visitEndReasonPresentation(session.endReason) : visitFailurePresentation(session.failureCode))}</p>
      <div className="operational-row-actions">
        <button type="button" className="btn-secondary btn-sm" data-testid="clear-terminal-visit" onClick={() => onClearTerminalVisit(session.id)}>{lang === 'zh-CN' ? '从此设备清除' : 'Clear from this device'}</button>
        <span className="state-reason">{lang === 'zh-CN' ? '只隐藏此设备上的记录；Network Portal 的 Social Journal 不会删除。' : 'This only hides the local card. The Network Portal Social Journal is preserved.'}</span>
      </div>
    </div>}""",
)
insert_before_last(
    social_page,
    "\nfunction visibleInvitations",
    """
const DISMISSED_TERMINAL_VISITS_STORAGE_PREFIX = 'our-companion.social.dismissed-terminal-visits.';

function dismissedTerminalVisitsStorageKey(scopeKey: string): string {
  return `${DISMISSED_TERMINAL_VISITS_STORAGE_PREFIX}${encodeURIComponent(scopeKey)}`;
}

function readDismissedTerminalVisitIds(scopeKey?: string): string[] {
  if (!scopeKey) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(dismissedTerminalVisitsStorageKey(scopeKey)) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value.length > 0).slice(-100)
      : [];
  } catch {
    return [];
  }
}

function writeDismissedTerminalVisitIds(scopeKey: string, sessionIds: string[]): void {
  try {
    window.localStorage.setItem(dismissedTerminalVisitsStorageKey(scopeKey), JSON.stringify(sessionIds.slice(-100)));
  } catch {
    // Local history dismissal is optional and must not block the Social page.
  }
}
""",
)

# Regression tests.
social_test = "apps/desktop/electron/main/network/visitService.social.test.ts"
insert_before_last(
    social_test,
    "\n});",
    """
  it('creates Shared Moment discoveries as announced before adding them to Journey', async () => {
    const now = new Date().toISOString();
    const topic = { id: 'topic-1', sessionId: session.id, sequence: 1, state: 'completed', ownerCompanionId: 'network-companion', title: 'A gentle topic', summary: 'A shared summary.', tags: ['care'], allowRecipientSave: true, minimumTurns: 3, maximumTurns: 6, createdAt: now, updatedAt: now };
    const sharedMoment = { id: 'moment-1', sessionId: session.id, title: 'Shared care', summary: 'A meaningful exchange.', turnCount: 4, createdAt: now };
    const network = networkMock({ getVisitSocialState: vi.fn().mockResolvedValue({ sessionId: session.id, maxTurns: 15, topics: [topic], participants: [], turns: [], sharedMoment }) });
    const settings = new Map<string, unknown>();
    let storedDiscovery: Record<string, unknown> | undefined;
    const db = {
      getAppSetting: vi.fn((key: string) => settings.get(key)),
      setAppSetting: vi.fn((key: string, value: unknown) => { settings.set(key, value); }),
      insertDiscovery: vi.fn((discovery: Record<string, unknown>) => { storedDiscovery = discovery; return discovery; }),
      getDiscovery: vi.fn((id: string) => storedDiscovery?.id === id ? storedDiscovery : undefined),
      resolveActiveCompanionId: vi.fn().mockReturnValue('companion-1'),
      transitionDiscoveryStatus: vi.fn((id: string, status: string) => {
        if (!storedDiscovery || storedDiscovery.id !== id) throw new Error('missing discovery');
        storedDiscovery = { ...storedDiscovery, status };
        return storedDiscovery;
      }),
    };
    const addToJourney = vi.fn(async () => { storedDiscovery = { ...storedDiscovery, status: 'saved' }; });
    const service = new VisitService(network as never, companionsMock() as never, db as never, undefined, addToJourney);
    services.push(service);

    const result = await service.saveSharedMoment(session.id);

    expect(db.insertDiscovery).toHaveBeenCalledWith(expect.objectContaining({ source: 'companion', status: 'announced' }));
    expect(addToJourney).toHaveBeenCalledWith(expect.stringMatching(/^shared-moment-/));
    expect(result.sharedMomentSaved).toBe(true);
  });

  it('recovers the eligible Shared Moment record left by the previous failed save', async () => {
    const now = new Date().toISOString();
    const topic = { id: 'topic-1', sessionId: session.id, sequence: 1, state: 'completed', ownerCompanionId: 'network-companion', title: 'A gentle topic', summary: 'A shared summary.', tags: ['care'], allowRecipientSave: true, minimumTurns: 3, maximumTurns: 6, createdAt: now, updatedAt: now };
    const sharedMoment = { id: 'moment-1', sessionId: session.id, title: 'Shared care', summary: 'A meaningful exchange.', turnCount: 4, createdAt: now };
    const network = networkMock({ getVisitSocialState: vi.fn().mockResolvedValue({ sessionId: session.id, maxTurns: 15, topics: [topic], participants: [], turns: [], sharedMoment }) });
    let storedDiscovery: Record<string, unknown> = { id: 'shared-moment-existing', status: 'eligible' };
    const db = {
      getAppSetting: vi.fn((key: string) => key.includes('social.visit.saved-moment.') ? 'shared-moment-existing' : undefined),
      setAppSetting: vi.fn(),
      insertDiscovery: vi.fn(),
      getDiscovery: vi.fn(() => storedDiscovery),
      resolveActiveCompanionId: vi.fn().mockReturnValue('companion-1'),
      transitionDiscoveryStatus: vi.fn((id: string, status: string) => {
        storedDiscovery = { ...storedDiscovery, id, status };
        return storedDiscovery;
      }),
    };
    const addToJourney = vi.fn(async () => { storedDiscovery = { ...storedDiscovery, status: 'saved' }; });
    const service = new VisitService(network as never, companionsMock() as never, db as never, undefined, addToJourney);
    services.push(service);

    const result = await service.saveSharedMoment(session.id);

    expect(db.transitionDiscoveryStatus.mock.calls.map((call) => call[1])).toEqual(['queued', 'presenting', 'announced']);
    expect(addToJourney).toHaveBeenCalledWith('shared-moment-existing');
    expect(result.sharedMomentSaved).toBe(true);
  });
""",
)

lifecycle_test = "apps/desktop/renderer/src/features/social/SocialLifecycle.contract.test.ts"
replace_once(
    lifecycle_test,
    """const model = readFileSync(new URL('./useSocialViewModel.ts', import.meta.url), 'utf8');""",
    """const model = readFileSync(new URL('./useSocialViewModel.ts', import.meta.url), 'utf8');
const conversation = readFileSync(new URL('./SocialVisitConversation.tsx', import.meta.url), 'utf8');""",
)
insert_before_last(
    lifecycle_test,
    "\n});",
    """
  it('does not permanently consume an automatic turn when a refresh cancels its delay', () => {
    const timerIndex = conversation.indexOf('const timer = window.setTimeout(() => {');
    const requestIndex = conversation.indexOf('requestedTurnKey.current = turnKey;', timerIndex);
    expect(timerIndex).toBeGreaterThan(-1);
    expect(requestIndex).toBeGreaterThan(timerIndex);
    expect(conversation).toContain('void respond(turnKey);');
    expect(conversation).toContain('}, 2800);');
  });

  it('allows terminal Visit cards to be dismissed only from the current client scope', () => {
    expect(page).toContain('dismissedTerminalVisitIds');
    expect(page).toContain('readDismissedTerminalVisitIds(scopeKey)');
    expect(page).toContain('writeDismissedTerminalVisitIds(scopeKey, next)');
    expect(page).toContain('data-testid="clear-terminal-visit"');
    expect(page).toContain('Network Portal Social Journal is preserved.');
  });
""",
)
