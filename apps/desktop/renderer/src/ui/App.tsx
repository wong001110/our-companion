import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AiSettings,
  CharacterBehaviorSettings,
  CharacterProfile,
  CharacterRuntimeState,
  DiaryEntry,
  Discovery,
  Journey,
  JourneyMilestone,
  MemoryGraph,
  MemoryNode,
  SpeechStatus,
  ToolExecutionResult,
  ToolPreview,
  UpdateAiSettingsInput
} from '@our-companion/shared';
import { getSpeechDuration, getWalkDelay, getWalkDelayRange, selectSpeechLine } from '../character/ann/companionBehavior';
import { getIdleRotationDelay, isIdleState, selectWeightedIdleAnimation } from '../character/ann/idleBehavior';
import { TypewriterSpeechBubble } from '../companion/TypewriterSpeechBubble';
import { useCompanionSession } from '../companion/useCompanionSession';
import { CompanionCanvas, type AnimationName, type CompanionDragPoint } from './CompanionCanvas';

type Tab = 'home' | 'discovery' | 'journey' | 'memory' | 'ask' | 'settings';
type DevAnimation = 'live' | AnimationName;

const devAnimations: DevAnimation[] = [
  'live',
  'idle_laptop',
  'idle_coffee',
  'idle_notes',
  'idle_tired',
  'walk',
  'return',
  'think',
  'focus_typing',
  'discovery',
  'discovery_shy',
  'talk',
  'talk_happy',
  'task_start',
  'task_success',
  'task_failed'
];

export function App() {
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'companion') return <CompanionShell />;
  return <PanelShell />;
}

function CompanionShell() {
  const [state, setState] = useState<CharacterRuntimeState>();
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const [idleAnimation, setIdleAnimation] = useState<AnimationName>('idle_laptop');
  const [speech, setSpeech] = useState<string>();
  const [typewriterMessage, setTypewriterMessage] = useState<string>();
  const behaviorRef = useRef<CharacterBehaviorSettings | undefined>(undefined);
  const stateRef = useRef<CharacterRuntimeState | undefined>(undefined);
  const mousePassthroughRef = useRef<boolean | undefined>(undefined);
  const speechTimeoutRef = useRef<number | undefined>(undefined);
  const isDraggingRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const dragOriginRef = useRef<{ windowX: number; windowY: number; screenX: number; screenY: number } | undefined>(undefined);

  function applyState(next: CharacterRuntimeState) {
    stateRef.current = next;
    setState(next);
  }

  function showInstantSpeech(message: string) {
    setTypewriterMessage(undefined);
    setSpeech(message);
    if (speechTimeoutRef.current !== undefined) {
      window.clearTimeout(speechTimeoutRef.current);
    }
    speechTimeoutRef.current = window.setTimeout(() => setSpeech(undefined), getSpeechDuration(message));
  }

  function showTypewriterSpeech(message: string) {
    setSpeech(undefined);
    if (speechTimeoutRef.current !== undefined) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = undefined;
    }
    setTypewriterMessage(message);
  }

  const { phase, toggleListening, onTypewriterComplete, isSessionActive } = useCompanionSession({
    stateRef,
    applyState,
    onInstantSpeech: showInstantSpeech,
    onTypewriterSpeech: showTypewriterSpeech,
    pauseAmbient: (paused) => {
      sessionActiveRef.current = paused;
    }
  });

  function handleTypewriterComplete() {
    setTypewriterMessage(undefined);
    onTypewriterComplete();
  }

  useEffect(() => {
    document.documentElement.classList.add('companion-mode');
    return () => document.documentElement.classList.remove('companion-mode');
  }, []);

  useEffect(() => {
    void setMousePassthrough(true);
    return () => {
      void window.ourCompanion.window.setMousePassthrough({ passthrough: false });
    };
  }, []);

  useEffect(() => {
    const unsubscribeState = window.ourCompanion.character.onStateChange((next) => {
      applyState(next);
    });
    const unsubscribeAnnounce = window.ourCompanion.discovery.onAnnounce((payload) => {
      showInstantSpeech(payload.message);
    });
    return () => {
      unsubscribeState();
      unsubscribeAnnounce();
    };
  }, []);

  async function setMousePassthrough(passthrough: boolean) {
    if (mousePassthroughRef.current === passthrough) return;
    mousePassthroughRef.current = passthrough;
    try {
      await window.ourCompanion.window.setMousePassthrough({ passthrough });
    } catch {
      mousePassthroughRef.current = undefined;
    }
  }

  function handlePointerHitChange(isHit: boolean) {
    void setMousePassthrough(!isHit);
  }

  function handleDragStart(point: CompanionDragPoint) {
    isDraggingRef.current = true;
    dragOriginRef.current = undefined;
    void window.ourCompanion.companion.reportDragging({ dragging: true });
    void setMousePassthrough(false);
    window.ourCompanion.window
      .getBounds()
      .then((bounds) => {
        if (!isDraggingRef.current) return;
        dragOriginRef.current = {
          windowX: bounds.x,
          windowY: bounds.y,
          screenX: point.screenX,
          screenY: point.screenY
        };
      })
      .catch(() => undefined);
  }

  function handleDragMove(point: CompanionDragPoint) {
    const origin = dragOriginRef.current;
    if (!origin) return;
    void window.ourCompanion.window.moveTo({
      x: origin.windowX + point.screenX - origin.screenX,
      y: origin.windowY + point.screenY - origin.screenY
    });
  }

  function handleDragEnd() {
    isDraggingRef.current = false;
    dragOriginRef.current = undefined;
    void window.ourCompanion.companion.reportDragging({ dragging: false });
    window.ourCompanion.window
      .getBounds()
      .then((bounds) => window.ourCompanion.character.updatePosition({ x: bounds.x, y: bounds.y }))
      .then((nextState) => {
        stateRef.current = nextState;
        setState(nextState);
      })
      .catch(() => undefined);
  }

  function showSpeech(message: string) {
    showInstantSpeech(message);
  }

  useEffect(() => {
    let cancelled = false;
    let walkTimeout: number | undefined;
    let idleTimeout: number | undefined;
    let ambientTimeout: number | undefined;
    let behaviorRefreshTimeout: number | undefined;
    let animationFrame: number | undefined;

    function applyStateFromEffect(next: CharacterRuntimeState) {
      stateRef.current = next;
      setState(next);
    }

    function previewState(coreState: CharacterRuntimeState['coreState'], intent: CharacterRuntimeState['intent']) {
      const base = stateRef.current;
      if (!base) return;
      applyStateFromEffect({
        ...base,
        coreState,
        intent,
        updatedAt: new Date().toISOString()
      });
    }

    function isAmbientPaused() {
      return sessionActiveRef.current || stateRef.current?.intent === 'sharing_discovery';
    }

    async function walkRandomly() {
      try {
        if (cancelled || isDraggingRef.current || isAmbientPaused()) return;

        const [bounds, workArea] = await Promise.all([window.ourCompanion.window.getBounds(), window.ourCompanion.window.getWorkArea()]);
        if (cancelled || isDraggingRef.current) return;

        const minX = workArea.x + 12;
        const maxX = workArea.x + workArea.width - bounds.width - 12;
        if (maxX <= minX) return;

        let targetX = randomBetween(minX, maxX);
        if (Math.abs(targetX - bounds.x) < 80) {
          targetX = bounds.x < (minX + maxX) / 2 ? maxX : minX;
        }

        const direction = targetX < bounds.x ? 'left' : 'right';
        setFacing(direction);
        showSpeech(selectSpeechLine('walk_start'));
        previewState('walking', 'wandering');

        const startX = bounds.x;
        const startY = clamp(bounds.y, workArea.y, workArea.y + workArea.height - bounds.height);
        const distance = Math.abs(targetX - startX);
        const durationMs = clamp((distance / 115) * 1000, 900, 5200);
        const startedAt = performance.now();
        let lastMoveAt = 0;

        await new Promise<void>((resolve) => {
          const step = (now: number) => {
            if (cancelled || isDraggingRef.current) {
              resolve();
              return;
            }

            const progress = Math.min(1, (now - startedAt) / durationMs);
            const nextX = startX + (targetX - startX) * easeInOut(progress);

            if (now - lastMoveAt > 28 || progress === 1) {
              lastMoveAt = now;
              window.ourCompanion.window.moveTo({ x: nextX, y: startY }).catch(() => undefined);
            }

            if (progress < 1) {
              animationFrame = window.requestAnimationFrame(step);
            } else {
              animationFrame = undefined;
              resolve();
            }
          };

          animationFrame = window.requestAnimationFrame(step);
        });
      } catch (error) {
        console.warn('[our-companion] Companion walk failed; scheduling next walk.', error);
      } finally {
        if (!isDraggingRef.current) {
          previewState('idle', 'waiting');
          if (!cancelled) showSpeech(selectSpeechLine('walk_end'));
        }
      }
    }

    async function refreshBehaviorSettings() {
      try {
        behaviorRef.current = await window.ourCompanion.character.getBehaviorSettings();
      } catch (error) {
        console.warn('[our-companion] Unable to refresh companion behavior settings.', error);
      }
    }

    function scheduleNextWalk() {
      if (cancelled) return;
      walkTimeout = window.setTimeout(async () => {
        if (isAmbientPaused()) {
          scheduleNextWalk();
          return;
        }
        try {
          await walkRandomly();
        } finally {
          scheduleNextWalk();
        }
      }, getWalkDelay(behaviorRef.current?.effectiveMovement ?? 25));
    }

    function scheduleBehaviorRefresh() {
      if (cancelled) return;
      behaviorRefreshTimeout = window.setTimeout(async () => {
        await refreshBehaviorSettings();
        scheduleBehaviorRefresh();
      }, 5000);
    }

    function scheduleIdleRotation() {
      if (cancelled) return;
      idleTimeout = window.setTimeout(() => {
        if (isIdleState(stateRef.current)) {
          setIdleAnimation(selectWeightedIdleAnimation());
        }
        scheduleIdleRotation();
      }, getIdleRotationDelay());
    }

    function scheduleAmbientSpeech() {
      if (cancelled) return;
      ambientTimeout = window.setTimeout(() => {
        if (isIdleState(stateRef.current) && !isAmbientPaused()) {
          showInstantSpeech(selectSpeechLine('ambient'));
        }
        scheduleAmbientSpeech();
      }, randomBetween(30000, 65000));
    }

    Promise.all([window.ourCompanion.character.getState(), window.ourCompanion.character.getBehaviorSettings()]).then(([next, behavior]) => {
      if (cancelled) return;
      behaviorRef.current = behavior;
      applyStateFromEffect(next);
      setIdleAnimation(selectWeightedIdleAnimation(() => 0));
      scheduleIdleRotation();
      scheduleAmbientSpeech();
      scheduleBehaviorRefresh();
      scheduleNextWalk();
    });

    return () => {
      cancelled = true;
      if (walkTimeout !== undefined) window.clearTimeout(walkTimeout);
      if (idleTimeout !== undefined) window.clearTimeout(idleTimeout);
      if (ambientTimeout !== undefined) window.clearTimeout(ambientTimeout);
      if (behaviorRefreshTimeout !== undefined) window.clearTimeout(behaviorRefreshTimeout);
      if (speechTimeoutRef.current !== undefined) window.clearTimeout(speechTimeoutRef.current);
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <main className="companion-shell">
      <CompanionCanvas
        state={state}
        facing={facing}
        isListening={phase === 'listening'}
        animationOverride={isIdleState(state) && !isSessionActive && state?.intent !== 'sharing_discovery' ? idleAnimation : undefined}
        onPointerHitChange={handlePointerHitChange}
        onOpenPanel={() => window.ourCompanion.window.openPanel()}
        onToggleListen={toggleListening}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
      {typewriterMessage && (
        <TypewriterSpeechBubble message={typewriterMessage} onComplete={handleTypewriterComplete} />
      )}
      {!typewriterMessage && speech && <div className="speech-bubble">{speech}</div>}
    </main>
  );
}

function PanelShell() {
  const [tab, setTab] = useState<Tab>('home');
  const [state, setState] = useState<CharacterRuntimeState>();
  const [behaviorSettings, setBehaviorSettings] = useState<CharacterBehaviorSettings>();
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [timeline, setTimeline] = useState<JourneyMilestone[]>([]);
  const [memoryGraph, setMemoryGraph] = useState<MemoryGraph>({ nodes: [], edges: [] });
  const [diary, setDiary] = useState<DiaryEntry[]>([]);

  async function refreshAll() {
    const [nextState, nextBehavior, nextCharacters, feed, activeJourneys, milestones, graph, entries] = await Promise.all([
      window.ourCompanion.character.getState(),
      window.ourCompanion.character.getBehaviorSettings(),
      window.ourCompanion.character.getActive(),
      window.ourCompanion.discovery.getFeed({ limit: 12 }),
      window.ourCompanion.journey.getActive(),
      window.ourCompanion.journey.getTimeline(),
      window.ourCompanion.memory.getGraph(),
      window.ourCompanion.diary.getEntries({ limit: 6 })
    ]);
    setState(nextState);
    setBehaviorSettings(nextBehavior);
    setCharacters(nextCharacters);
    setDiscoveries(feed);
    setJourneys(activeJourneys);
    setTimeline(milestones);
    setMemoryGraph(graph);
    setDiary(entries);
  }

  useEffect(() => {
    refreshAll();
  }, []);

  return (
    <main className="panel-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <span>Our Companion</span>
          <small>Ann's Notebook</small>
        </div>
        <nav>
          {(['home', 'discovery', 'journey', 'memory', 'ask', 'settings'] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
              {tabLabel(item)}
            </button>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        {tab === 'home' && (
          <HomeView state={state} character={characters[0]} discoveries={discoveries} journeys={journeys} diary={diary} onRefresh={refreshAll} />
        )}
        {tab === 'discovery' && <DiscoveryView discoveries={discoveries} onRefresh={refreshAll} />}
        {tab === 'journey' && <JourneyView journeys={journeys} timeline={timeline} onRefresh={refreshAll} />}
        {tab === 'memory' && <MemoryView graph={memoryGraph} onRefresh={refreshAll} />}
        {tab === 'ask' && <AskView onRefresh={refreshAll} />}
        {tab === 'settings' && <SettingsView state={state} behaviorSettings={behaviorSettings} onRefresh={refreshAll} />}
      </section>
    </main>
  );
}

function HomeView({
  state,
  character,
  discoveries,
  journeys,
  diary,
  onRefresh
}: {
  state?: CharacterRuntimeState;
  character?: CharacterProfile;
  discoveries: Discovery[];
  journeys: Journey[];
  diary: DiaryEntry[];
  onRefresh: () => Promise<void>;
}) {
  const currentFocus = journeys[0]?.title ?? discoveries[0]?.title ?? 'Collecting little ideas for later';
  const diaryHighlight = diary[0]?.content ?? 'No diary entry yet, but Ann is keeping a fresh page ready.';

  return (
    <NotebookPage
      eyebrow="Today"
      title="Ann's Notebook"
      note={`${character?.name ?? 'Ann'} is keeping a soft page open for the things we are building together.`}
    >
      <div className="home-notebook-grid">
        <PaperCard className="ann-status-card" title="Ann's Status" tape>
          <div className="ann-status-content">
            <MiniAnnSticker />
            <div>
              <p>{annStatusMessage(state)}</p>
              <span className="soft-pill">{annMoodLabel(state)}</span>
            </div>
          </div>
        </PaperCard>

        <StickyNote title="Ann's Message" className="ann-message-note">
          <p>I found something interesting today. It might help with our project.</p>
        </StickyNote>

        <PaperCard title="Current Focus" tape>
          <p className="focus-title">{currentFocus}</p>
          <p>{journeys[0]?.description ?? 'Working on the next idea with care, one note at a time.'}</p>
          <ProgressBar value={journeys[0] ? 60 : 35} label={journeys[0] ? '60%' : '35%'} />
        </PaperCard>

        <PaperCard title="At a Glance" tape>
          <div className="glance-list">
            <span>New Discoveries <strong>{discoveries.length}</strong></span>
            <span>Journeys in Progress <strong>{journeys.length}</strong></span>
            <span>Memories Collected <strong>{diary.length}</strong></span>
          </div>
        </PaperCard>

        <PaperCard title="Mood" tape>
          <div className="mood-row">
            <span className="doodle-face" aria-hidden="true">:)</span>
            <strong>{annMoodLabel(state)}</strong>
          </div>
        </PaperCard>

        <PaperCard title="Memory Highlight" tape className="wide-card">
          <p>{diaryHighlight}</p>
          <button onClick={() => window.ourCompanion.diary.generateDaily().then(onRefresh)}>Write today's note</button>
        </PaperCard>
      </div>
    </NotebookPage>
  );
}

function DiscoveryView({ discoveries, onRefresh }: { discoveries: Discovery[]; onRefresh: () => Promise<void> }) {
  async function refreshDiscovery() {
    await window.ourCompanion.discovery.refresh();
    await onRefresh();
  }

  async function addToJourney(discoveryId: string) {
    await window.ourCompanion.discovery.addToJourney({ discoveryId });
    await onRefresh();
  }

  return (
    <NotebookPage eyebrow="Collected references" title="Discoveries" note="Ann keeps useful findings here like clipped references in a scrapbook.">
      <div className="toolbar notebook-toolbar">
        <div className="soft-filter-row" aria-label="Discovery filters">
          {['All', 'AI & Tech', 'Design', 'Life', 'Other'].map((filter) => (
            <button key={filter} className={filter === 'All' ? 'active' : ''}>{filter}</button>
          ))}
        </div>
        <button onClick={refreshDiscovery}>Refresh</button>
      </div>
      <div className="discovery-grid">
        {discoveries.map((discovery) => (
          <article className="discovery-card paper-photo-card" key={discovery.id}>
            <div className="photo-thumb" aria-hidden="true">
              <span>{discovery.source.slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="card-topline">
              <span>{discovery.source}</span>
              <strong>{formatDiscoveryTime(discovery)}</strong>
            </div>
            <h3>{discovery.title}</h3>
            <p>{discovery.summary ?? discovery.shortMessage ?? 'Ann thinks this may be worth exploring.'}</p>
            <div className="tag-row">
              {discovery.tags.slice(0, 4).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="action-row">
              <button onClick={() => discovery.url && window.ourCompanion.tool.execute({ toolName: 'open_url', args: { url: discovery.url } })}>
                View
              </button>
              <button onClick={() => addToJourney(discovery.id)}>Add</button>
              <button onClick={() => window.ourCompanion.discovery.markNotInterested(discovery.id).then(onRefresh)}>Not interested</button>
            </div>
          </article>
        ))}
        {discoveries.length === 0 && (
          <StickyNote title="A quiet page">
            <p>Ann has not pinned any discoveries yet. Refresh when you want her to look around.</p>
          </StickyNote>
        )}
      </div>
    </NotebookPage>
  );
}

function JourneyView({
  journeys,
  timeline,
  onRefresh
}: {
  journeys: Journey[];
  timeline: JourneyMilestone[];
  onRefresh: () => Promise<void>;
}) {
  async function createNewJourney() {
    await window.ourCompanion.journey.create({ title: 'New exploration trail', description: 'A fresh path for saved discoveries.' });
    await onRefresh();
  }

  return (
    <NotebookPage eyebrow="Planning notes" title="Journeys" note="Ongoing explorations Ann is helping shape into something real.">
      <div className="toolbar notebook-toolbar">
        <div className="soft-filter-row" aria-label="Journey tabs">
          <button className="active">Active</button>
          <button>Completed</button>
        </div>
        <button onClick={createNewJourney}>New</button>
      </div>
      <div className="journey-list">
        {journeys.map((journey, index) => (
          <PaperCard key={journey.id} className="journey-card" tape>
            <div className="journey-main">
              <span className="doodle-icon" aria-hidden="true">map</span>
              <div>
                <h3>{journey.title}</h3>
                <p>{journey.description ?? 'Ann is gathering notes for this path.'}</p>
                <ProgressBar value={index === 0 ? 60 : 25} label={index === 0 ? '60%' : '25%'} />
              </div>
            </div>
            <StickyNote title="Next Step" compact>
              <p>{timeline[index]?.summary ?? timeline[index]?.title ?? 'Add one small note to move this forward.'}</p>
            </StickyNote>
          </PaperCard>
        ))}
        {journeys.length === 0 && (
          <StickyNote title="No active journey yet">
            <p>Start a fresh exploration trail when an idea begins to tug at your sleeve.</p>
          </StickyNote>
        )}
      </div>
    </NotebookPage>
  );
}

function MemoryView({ graph, onRefresh }: { graph: MemoryGraph; onRefresh: () => Promise<void> }) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<MemoryNode | undefined>();

  async function saveMemory() {
    if (!draft.trim()) return;
    if (editing) {
      await window.ourCompanion.memory.updateNode({ id: editing.id, content: draft, summary: draft.slice(0, 120) });
    } else {
      await window.ourCompanion.memory.createNode({ type: 'topic', title: draft.slice(0, 42), summary: draft.slice(0, 120), content: draft });
    }
    setDraft('');
    setEditing(undefined);
    await onRefresh();
  }

  return (
    <NotebookPage eyebrow="Shared moments" title="Memories" note="A gentle timeline of things Ann is learning and keeping close.">
      <div className="memory-layout">
        <PaperCard title="Add a Memory" tape>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add or edit a notebook memory" />
          <div className="action-row">
            <button onClick={saveMemory}>{editing ? 'Update' : 'Add'}</button>
            {editing && <button onClick={() => setEditing(undefined)}>Cancel</button>}
          </div>
        </PaperCard>
        <div className="memory-list">
          {graph.nodes.map((node) => (
            <article className="memory-card paper-card" key={node.id}>
              <h3>{node.title}</h3>
              <p>{node.summary ?? node.content}</p>
              <div className="tag-row">
                <span>{node.type}</span>
                {node.isPinned && <span>favorite</span>}
              </div>
              <div className="action-row">
                <button
                  onClick={() => {
                    setEditing(node);
                    setDraft(node.content ?? node.summary ?? node.title);
                  }}
                >
                  Edit
                </button>
                <button onClick={() => window.ourCompanion.memory.updateNode({ id: node.id, isMarkedWrong: true }).then(onRefresh)}>
                  Mark wrong
                </button>
                <button onClick={() => window.ourCompanion.memory.deleteNode(node.id).then(onRefresh)}>Delete</button>
              </div>
            </article>
          ))}
          {graph.nodes.length === 0 && (
            <StickyNote title="A blank memory page">
              <p>Ann has not saved a memory here yet.</p>
            </StickyNote>
          )}
        </div>
      </div>
    </NotebookPage>
  );
}

function AskView({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [input, setInput] = useState('Search web for PixiJS desktop pet tutorials');
  const [result, setResult] = useState<ToolExecutionResult | ToolPreview | { message: string }>();
  const parsedTool = useMemo(() => parseLocalCommand(input), [input]);

  async function submit() {
    if (parsedTool) {
      const output = await window.ourCompanion.tool.execute(parsedTool);
      setResult(output);
    } else {
      const output = await window.ourCompanion.ai.chat({ message: input });
      setResult(output);
    }
    await onRefresh();
  }

  return (
    <NotebookPage eyebrow="Passing notes" title="Ask Ann" note="Write into the notebook and let Ann think with you.">
      <section className="chat-paper">
        <NotebookChatBubble speaker="user" time="10:20 AM">
          What should we work on next?
        </NotebookChatBubble>
        <NotebookChatBubble speaker="ann" time="10:30 AM">
          Hmm... based on our current notes, I think we could improve the animation system, add more personality, or explore world-building ideas.
        </NotebookChatBubble>
        {result && (
          <NotebookChatBubble speaker="ann" time="Just now">
            {formatAskResult(result)}
          </NotebookChatBubble>
        )}
        <div className="prompt-chip-row">
          {['What should we explore next?', 'Summarize our current journey', 'Help me think through this idea'].map((prompt) => (
            <button key={prompt} onClick={() => setInput(prompt)}>{prompt}</button>
          ))}
        </div>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} />
        <div className="action-row">
          <button onClick={submit}>Send to Ann</button>
          {parsedTool && <button onClick={() => window.ourCompanion.tool.preview(parsedTool).then(setResult)}>Preview</button>}
        </div>
      </section>
    </NotebookPage>
  );
}

function SettingsView({
  state,
  behaviorSettings,
  onRefresh
}: {
  state?: CharacterRuntimeState;
  behaviorSettings?: CharacterBehaviorSettings;
  onRefresh: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<AiSettings>();
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('Loading settings...');
  const [saving, setSaving] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [devAnimation, setDevAnimation] = useState<DevAnimation>('live');
  const previewState = devAnimation === 'live' ? state : createDevAnimationState(devAnimation);
  const animationOverride = devAnimation === 'live' ? undefined : devAnimation;

  async function loadSettings() {
    const next = await window.ourCompanion.ai.getSettings();
    setSettings(next);
    setModel(next.model);
    setEndpoint(next.endpoint);
    setStatus(next.apiKeyConfigured ? 'API key saved.' : 'No API key saved.');
  }

  useEffect(() => {
    loadSettings();
  }, []);

  async function saveSettings(input: UpdateAiSettingsInput = {}) {
    setSaving(true);
    try {
      const next = await window.ourCompanion.ai.updateSettings({
        model,
        endpoint,
        apiKey: apiKey.trim() || undefined,
        ...input
      });
      setSettings(next);
      setModel(next.model);
      setEndpoint(next.endpoint);
      setApiKey('');
      setStatus(next.apiKeyConfigured ? 'Saved. API key is configured.' : 'Saved. No API key configured.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <NotebookPage eyebrow="Notebook preferences" title="Settings" note="Functional settings, kept soft around the edges.">
      <div className="settings-layout">
        <PaperCard title="Ann's Behavior" tape>
          <p>Ann can stay gentle and present on the desktop while this notebook keeps her longer thoughts.</p>
        </PaperCard>
        <PaperCard title="Appearance" tape>
          <p>Soft lavender, warm paper, and small notebook decorations are used for the panel experience.</p>
        </PaperCard>
        <PaperCard title="Privacy & Memory" tape>
          <p>Memory editing stays available from the Memories page whenever something needs correction.</p>
        </PaperCard>
        <VoiceSettingsCard />
        <PaperCard title="AI Provider" tape className="settings-panel">
          <h2>DeepSeek</h2>
          <label>
            <span>Model</span>
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="deepseek-v4-flash" />
          </label>
          <label>
            <span>Endpoint</span>
            <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://api.deepseek.com" />
          </label>
          <label>
            <span>API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={settings?.apiKeyConfigured ? 'Configured; paste a new key to replace' : 'Paste API key'}
            />
          </label>
          <div className="action-row">
            <button onClick={() => saveSettings()} disabled={saving}>
              {saving ? 'Saving' : 'Save'}
            </button>
            <button onClick={() => saveSettings({ clearApiKey: true })} disabled={saving}>
              Clear API key
            </button>
          </div>
          <p>{status}</p>
        </PaperCard>
        <PaperCard title="Developer Mode" tape className="developer-card">
          <button onClick={() => setDeveloperOpen((open) => !open)}>
            {developerOpen ? 'Hide developer tools' : 'Show developer tools'}
          </button>
          {developerOpen && (
            <DeveloperPreview
              state={previewState}
              devAnimation={devAnimation}
              animationOverride={animationOverride}
              onAnimationChange={setDevAnimation}
              settings={behaviorSettings}
              onRefresh={onRefresh}
            />
          )}
        </PaperCard>
      </div>
    </NotebookPage>
  );
}

function VoiceSettingsCard() {
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>();
  const [loading, setLoading] = useState(true);

  async function refreshStatus() {
    setLoading(true);
    try {
      setSpeechStatus(await window.ourCompanion.speech.getStatus());
    } catch (error) {
      setSpeechStatus({
        ready: false,
        model: 'ggml-tiny.en.bin',
        error: error instanceof Error ? error.message : 'Unable to read Whisper status.'
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  return (
    <PaperCard title="Voice" tape className="settings-panel">
      <p>Talk to Ann on the desktop companion with double-click or Ctrl+Shift+Space. Replies appear word-by-word in her speech bubble.</p>
      <p>
        <strong>Hotkey:</strong> Ctrl+Shift+Space
      </p>
      <p>
        <strong>Whisper model:</strong> {speechStatus?.model ?? 'ggml-tiny.en.bin'}
      </p>
      <p>
        <strong>Status:</strong>{' '}
        {loading ? 'Checking local Whisper setup...' : speechStatus?.ready ? 'Ready for offline transcription.' : speechStatus?.error}
      </p>
      <div className="action-row">
        <button onClick={() => refreshStatus()} disabled={loading}>
          {loading ? 'Checking...' : 'Refresh status'}
        </button>
      </div>
      {!loading && !speechStatus?.ready && (
        <p>Run <code>npm run whisper:setup</code> from the project root to download whisper.cpp and the tiny English model.</p>
      )}
    </PaperCard>
  );
}

function BehaviorPanel({ settings, onRefresh }: { settings?: CharacterBehaviorSettings; onRefresh: () => Promise<void> }) {
  const [draftMovement, setDraftMovement] = useState(settings?.effectiveMovement ?? 25);
  const range = getWalkDelayRange(settings?.effectiveMovement ?? draftMovement);

  useEffect(() => {
    if (settings) setDraftMovement(settings.effectiveMovement);
  }, [settings?.effectiveMovement]);

  async function saveMovement(value: number) {
    setDraftMovement(value);
    await window.ourCompanion.character.updateBehaviorSettings({ movementOverride: value });
    await onRefresh();
  }

  async function resetMovement() {
    await window.ourCompanion.character.updateBehaviorSettings({ resetMovement: true });
    await onRefresh();
  }

  return (
    <div className="paper-card behavior-panel">
      <p className="eyebrow">Behavior</p>
      <h2>Movement</h2>
      <label>
        <span>Movement score: {settings?.effectiveMovement ?? draftMovement}</span>
        <input
          type="range"
          min="0"
          max="100"
          value={draftMovement}
          onChange={(event) => setDraftMovement(Number(event.target.value))}
          onMouseUp={() => saveMovement(draftMovement)}
          onKeyUp={(event) => {
            if (event.key === 'Enter') saveMovement(draftMovement);
          }}
        />
      </label>
      <p>
        {settings?.source === 'override' ? 'Using your override.' : 'Using Ann personality default.'} Current walk rest is about{' '}
        {Math.round(range.minMs / 1000)}-{Math.round(range.maxMs / 1000)} seconds.
      </p>
      <div className="action-row">
        <button onClick={() => saveMovement(draftMovement)}>Save movement</button>
        <button onClick={resetMovement}>Reset to Ann</button>
      </div>
    </div>
  );
}

function NotebookPage({ eyebrow, title, note, children }: { eyebrow: string; title: string; note?: string; children: ReactNode }) {
  return (
    <div className="notebook-page">
      <header className="notebook-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {note && <p>{note}</p>}
        </div>
        <span className="notebook-date">{formatShortDate(new Date().toISOString())}</span>
      </header>
      {children}
    </div>
  );
}

function NotebookSectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="notebook-section-title">{children}</h2>;
}

function PaperCard({
  title,
  tape,
  compact,
  className = '',
  children
}: {
  title?: string;
  tape?: boolean;
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`paper-card ${compact ? 'paper-card-compact' : ''} ${className}`}>
      {title && (tape ? <NotebookSectionTitle>{title}</NotebookSectionTitle> : <h2>{title}</h2>)}
      {children}
    </section>
  );
}

function StickyNote({ title, compact, className = '', children }: { title?: string; compact?: boolean; className?: string; children: ReactNode }) {
  return (
    <section className={`sticky-note ${compact ? 'sticky-note-compact' : ''} ${className}`}>
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}

function NotebookChatBubble({ speaker, time, children }: { speaker: 'ann' | 'user'; time: string; children: ReactNode }) {
  return (
    <div className={`notebook-chat-bubble ${speaker}`}>
      <p>{children}</p>
      <span>{time}</span>
    </div>
  );
}

function MiniAnnSticker() {
  return (
    <div className="mini-ann-sticker" aria-hidden="true">
      <span className="mini-ann-hair" />
      <span className="mini-ann-face" />
      <span className="mini-ann-eye left" />
      <span className="mini-ann-eye right" />
      <span className="mini-ann-body" />
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress-row">
      <span className="progress-track">
        <span style={{ width: `${clamp(value, 0, 100)}%` }} />
      </span>
      <strong>{label}</strong>
    </div>
  );
}

function DeveloperPreview({
  state,
  devAnimation,
  animationOverride,
  onAnimationChange,
  settings,
  onRefresh
}: {
  state?: CharacterRuntimeState;
  devAnimation: DevAnimation;
  animationOverride?: AnimationName;
  onAnimationChange: (animation: DevAnimation) => void;
  settings?: CharacterBehaviorSettings;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="developer-tools">
      <div className="developer-preview-canvas">
        <CompanionCanvas state={state} compact animationOverride={animationOverride} />
      </div>
      <div className="dev-animation-panel">
        <p className="eyebrow">Developer use</p>
        <h2>Animation review</h2>
        <div className="segmented-control" aria-label="Preview Ann animation">
          {devAnimations.map((animation) => (
            <button
              key={animation}
              className={devAnimation === animation ? 'active' : ''}
              onClick={() => onAnimationChange(animation)}
            >
              {animation === 'live' ? 'Live' : readable(animation)}
            </button>
          ))}
        </div>
        <p>Previewing: {devAnimation === 'live' ? 'engine state' : readable(devAnimation)}</p>
      </div>
      <BehaviorPanel settings={settings} onRefresh={onRefresh} />
    </div>
  );
}

function tabLabel(tab: Tab): string {
  return {
    home: 'Home',
    discovery: 'Discoveries',
    journey: 'Journeys',
    memory: 'Memories',
    ask: 'Ask Ann',
    settings: 'Settings'
  }[tab];
}

function annStatusMessage(state?: CharacterRuntimeState): string {
  if (!state) return 'Ann is settling in and opening a fresh page.';
  if (state.intent === 'sharing_discovery' || state.coreState === 'discovering') return 'Ann found something curious and tucked it into the notebook.';
  if (state.intent === 'reviewing_memory') return 'Ann is reading your notes and thinking about what matters.';
  if (state.intent === 'reflecting_journey') return 'Ann is connecting the dots across your current journey.';
  if (state.intent === 'helping_task') return 'Ann is focused beside you and helping with the next step.';
  if (state.intent === 'wandering') return 'Ann is stretching her legs, then coming back to the page.';
  return 'Ann is quietly here, keeping an eye on new ideas.';
}

function annMoodLabel(state?: CharacterRuntimeState): string {
  const emotion = state?.emotion;
  if (!emotion) return 'Curious & Excited';
  const entries = Object.entries(emotion).sort((a, b) => b[1] - a[1]);
  const [first, second] = entries;
  return `${capitalize(first?.[0] ?? 'curious')} & ${capitalize(second?.[0] ?? 'excited')}`;
}

function formatDiscoveryTime(discovery: Discovery): string {
  return formatRelativeDate(discovery.publishedAt ?? discovery.sharedAt ?? discovery.createdAt);
}

function formatRelativeDate(value?: string): string {
  if (!value) return 'Just now';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 'Just now';
  const diffMs = Date.now() - time;
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 60) return minutes <= 1 ? 'Just now' : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAskResult(result: ToolExecutionResult | ToolPreview | { message: string }): string {
  if ('message' in result) return result.message;
  if ('errorMessage' in result && result.errorMessage) return result.errorMessage;
  return result.userFacingSummary;
}

function readable(value: string): string {
  return value.replaceAll('_', ' ');
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeInOut(progress: number): number {
  return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
}

function createDevAnimationState(animation: AnimationName): CharacterRuntimeState {
  const stateByAnimation: Record<AnimationName, Pick<CharacterRuntimeState, 'coreState' | 'intent'>> = {
    idle_laptop: { coreState: 'idle', intent: 'waiting' },
    idle_coffee: { coreState: 'idle', intent: 'waiting' },
    idle_notes: { coreState: 'organizing_backpack', intent: 'organizing_backpack' },
    idle_tired: { coreState: 'idle', intent: 'waiting' },
    walk: { coreState: 'walking', intent: 'wandering' },
    return: { coreState: 'returning', intent: 'wandering' },
    think: { coreState: 'thinking', intent: 'reviewing_memory' },
    focus_typing: { coreState: 'executing', intent: 'helping_task' },
    discovery: { coreState: 'discovering', intent: 'sharing_discovery' },
    discovery_shy: { coreState: 'discovering', intent: 'sharing_discovery' },
    talk: { coreState: 'talking', intent: 'sharing_discovery' },
    talk_happy: { coreState: 'talking', intent: 'sharing_discovery' },
    task_start: { coreState: 'executing', intent: 'helping_task' },
    task_success: { coreState: 'executing', intent: 'helping_task' },
    task_failed: { coreState: 'executing', intent: 'helping_task' }
  };

  return {
    characterId: 'ann-dev-preview',
    ...stateByAnimation[animation],
    emotion: {
      neutral: 0.4,
      curious: animation === 'discovery' ? 0.8 : 0.3,
      happy: 0.35,
      excited: animation === 'walk' || animation === 'discovery' ? 0.65 : 0.2,
      shy: 0,
      confused: 0,
      focused: animation === 'think' ? 0.85 : 0.3,
      tired: 0,
      proud: 0,
      concerned: 0
    },
    updatedAt: new Date().toISOString()
  };
}

function parseLocalCommand(input: string) {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('open url ')) {
    return { toolName: 'open_url' as const, args: { url: trimmed.slice('open url '.length).trim() } };
  }
  if (lower.startsWith('open app ')) {
    return { toolName: 'open_app' as const, args: { appName: trimmed.slice('open app '.length).trim() } };
  }
  if (lower.startsWith('search web for ')) {
    return { toolName: 'search_web' as const, args: { query: trimmed.slice('search web for '.length).trim(), target: 'google' } };
  }
  return undefined;
}
