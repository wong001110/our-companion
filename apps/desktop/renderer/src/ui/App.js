import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSpeechDuration, getWalkDelay, getWalkDelayRange, selectSpeechLine } from '../character/ann/companionBehavior';
import { getIdleRotationDelay, isIdleState, selectWeightedIdleAnimation } from '../character/ann/idleBehavior';
import { TypewriterSpeechBubble } from '../companion/TypewriterSpeechBubble';
import { useCompanionSession } from '../companion/useCompanionSession';
import { CompanionCanvas } from './CompanionCanvas';
const devAnimations = [
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
    if (mode === 'companion')
        return _jsx(CompanionShell, {});
    return _jsx(PanelShell, {});
}
function CompanionShell() {
    const [state, setState] = useState();
    const [facing, setFacing] = useState('right');
    const [idleAnimation, setIdleAnimation] = useState('idle_laptop');
    const [speech, setSpeech] = useState();
    const [typewriterMessage, setTypewriterMessage] = useState();
    const behaviorRef = useRef(undefined);
    const stateRef = useRef(undefined);
    const mousePassthroughRef = useRef(undefined);
    const speechTimeoutRef = useRef(undefined);
    const isDraggingRef = useRef(false);
    const sessionActiveRef = useRef(false);
    const dragOriginRef = useRef(undefined);
    function applyState(next) {
        stateRef.current = next;
        setState(next);
    }
    function showInstantSpeech(message) {
        setTypewriterMessage(undefined);
        setSpeech(message);
        if (speechTimeoutRef.current !== undefined) {
            window.clearTimeout(speechTimeoutRef.current);
        }
        speechTimeoutRef.current = window.setTimeout(() => setSpeech(undefined), getSpeechDuration(message));
    }
    function showTypewriterSpeech(message) {
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
    async function setMousePassthrough(passthrough) {
        if (mousePassthroughRef.current === passthrough)
            return;
        mousePassthroughRef.current = passthrough;
        try {
            await window.ourCompanion.window.setMousePassthrough({ passthrough });
        }
        catch {
            mousePassthroughRef.current = undefined;
        }
    }
    function handlePointerHitChange(isHit) {
        void setMousePassthrough(!isHit);
    }
    function handleDragStart(point) {
        isDraggingRef.current = true;
        dragOriginRef.current = undefined;
        void window.ourCompanion.companion.reportDragging({ dragging: true });
        void setMousePassthrough(false);
        window.ourCompanion.window
            .getBounds()
            .then((bounds) => {
            if (!isDraggingRef.current)
                return;
            dragOriginRef.current = {
                windowX: bounds.x,
                windowY: bounds.y,
                screenX: point.screenX,
                screenY: point.screenY
            };
        })
            .catch(() => undefined);
    }
    function handleDragMove(point) {
        const origin = dragOriginRef.current;
        if (!origin)
            return;
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
    function showSpeech(message) {
        showInstantSpeech(message);
    }
    useEffect(() => {
        let cancelled = false;
        let walkTimeout;
        let idleTimeout;
        let ambientTimeout;
        let behaviorRefreshTimeout;
        let animationFrame;
        function applyStateFromEffect(next) {
            stateRef.current = next;
            setState(next);
        }
        function previewState(coreState, intent) {
            const base = stateRef.current;
            if (!base)
                return;
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
                if (cancelled || isDraggingRef.current || isAmbientPaused())
                    return;
                const [bounds, workArea] = await Promise.all([window.ourCompanion.window.getBounds(), window.ourCompanion.window.getWorkArea()]);
                if (cancelled || isDraggingRef.current)
                    return;
                const minX = workArea.x + 12;
                const maxX = workArea.x + workArea.width - bounds.width - 12;
                if (maxX <= minX)
                    return;
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
                await new Promise((resolve) => {
                    const step = (now) => {
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
                        }
                        else {
                            animationFrame = undefined;
                            resolve();
                        }
                    };
                    animationFrame = window.requestAnimationFrame(step);
                });
            }
            catch (error) {
                console.warn('[our-companion] Companion walk failed; scheduling next walk.', error);
            }
            finally {
                if (!isDraggingRef.current) {
                    previewState('idle', 'waiting');
                    if (!cancelled)
                        showSpeech(selectSpeechLine('walk_end'));
                }
            }
        }
        async function refreshBehaviorSettings() {
            try {
                behaviorRef.current = await window.ourCompanion.character.getBehaviorSettings();
            }
            catch (error) {
                console.warn('[our-companion] Unable to refresh companion behavior settings.', error);
            }
        }
        function scheduleNextWalk() {
            if (cancelled)
                return;
            walkTimeout = window.setTimeout(async () => {
                if (isAmbientPaused()) {
                    scheduleNextWalk();
                    return;
                }
                try {
                    await walkRandomly();
                }
                finally {
                    scheduleNextWalk();
                }
            }, getWalkDelay(behaviorRef.current?.effectiveMovement ?? 25));
        }
        function scheduleBehaviorRefresh() {
            if (cancelled)
                return;
            behaviorRefreshTimeout = window.setTimeout(async () => {
                await refreshBehaviorSettings();
                scheduleBehaviorRefresh();
            }, 5000);
        }
        function scheduleIdleRotation() {
            if (cancelled)
                return;
            idleTimeout = window.setTimeout(() => {
                if (isIdleState(stateRef.current)) {
                    setIdleAnimation(selectWeightedIdleAnimation());
                }
                scheduleIdleRotation();
            }, getIdleRotationDelay());
        }
        function scheduleAmbientSpeech() {
            if (cancelled)
                return;
            ambientTimeout = window.setTimeout(() => {
                if (isIdleState(stateRef.current) && !isAmbientPaused()) {
                    showInstantSpeech(selectSpeechLine('ambient'));
                }
                scheduleAmbientSpeech();
            }, randomBetween(30000, 65000));
        }
        Promise.all([window.ourCompanion.character.getState(), window.ourCompanion.character.getBehaviorSettings()]).then(([next, behavior]) => {
            if (cancelled)
                return;
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
            if (walkTimeout !== undefined)
                window.clearTimeout(walkTimeout);
            if (idleTimeout !== undefined)
                window.clearTimeout(idleTimeout);
            if (ambientTimeout !== undefined)
                window.clearTimeout(ambientTimeout);
            if (behaviorRefreshTimeout !== undefined)
                window.clearTimeout(behaviorRefreshTimeout);
            if (speechTimeoutRef.current !== undefined)
                window.clearTimeout(speechTimeoutRef.current);
            if (animationFrame !== undefined)
                window.cancelAnimationFrame(animationFrame);
        };
    }, []);
    return (_jsxs("main", { className: "companion-shell", children: [_jsx(CompanionCanvas, { state: state, facing: facing, isListening: phase === 'listening', animationOverride: isIdleState(state) && !isSessionActive && state?.intent !== 'sharing_discovery' ? idleAnimation : undefined, onPointerHitChange: handlePointerHitChange, onOpenPanel: () => window.ourCompanion.window.openPanel(), onToggleListen: toggleListening, onDragStart: handleDragStart, onDragMove: handleDragMove, onDragEnd: handleDragEnd }), typewriterMessage && (_jsx(TypewriterSpeechBubble, { message: typewriterMessage, onComplete: handleTypewriterComplete })), !typewriterMessage && speech && _jsx("div", { className: "speech-bubble", children: speech })] }));
}
function PanelShell() {
    const [tab, setTab] = useState('home');
    const [state, setState] = useState();
    const [behaviorSettings, setBehaviorSettings] = useState();
    const [characters, setCharacters] = useState([]);
    const [discoveries, setDiscoveries] = useState([]);
    const [journeys, setJourneys] = useState([]);
    const [timeline, setTimeline] = useState([]);
    const [memoryGraph, setMemoryGraph] = useState({ nodes: [], edges: [] });
    const [diary, setDiary] = useState([]);
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
    return (_jsxs("main", { className: "panel-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "brand-mark", children: [_jsx("span", { children: "Our Companion" }), _jsx("small", { children: "Ann's Notebook" })] }), _jsx("nav", { children: ['home', 'discovery', 'journey', 'memory', 'ask', 'settings'].map((item) => (_jsx("button", { className: tab === item ? 'active' : '', onClick: () => setTab(item), children: tabLabel(item) }, item))) })] }), _jsxs("section", { className: "workspace", children: [tab === 'home' && (_jsx(HomeView, { state: state, character: characters[0], discoveries: discoveries, journeys: journeys, diary: diary, onRefresh: refreshAll })), tab === 'discovery' && _jsx(DiscoveryView, { discoveries: discoveries, onRefresh: refreshAll }), tab === 'journey' && _jsx(JourneyView, { journeys: journeys, timeline: timeline, onRefresh: refreshAll }), tab === 'memory' && _jsx(MemoryView, { graph: memoryGraph, onRefresh: refreshAll }), tab === 'ask' && _jsx(AskView, { onRefresh: refreshAll }), tab === 'settings' && _jsx(SettingsView, { state: state, behaviorSettings: behaviorSettings, onRefresh: refreshAll })] })] }));
}
function HomeView({ state, character, discoveries, journeys, diary, onRefresh }) {
    const currentFocus = journeys[0]?.title ?? discoveries[0]?.title ?? 'Collecting little ideas for later';
    const diaryHighlight = diary[0]?.content ?? 'No diary entry yet, but Ann is keeping a fresh page ready.';
    return (_jsx(NotebookPage, { eyebrow: "Today", title: "Ann's Notebook", note: `${character?.name ?? 'Ann'} is keeping a soft page open for the things we are building together.`, children: _jsxs("div", { className: "home-notebook-grid", children: [_jsx(PaperCard, { className: "ann-status-card", title: "Ann's Status", tape: true, children: _jsxs("div", { className: "ann-status-content", children: [_jsx(MiniAnnSticker, {}), _jsxs("div", { children: [_jsx("p", { children: annStatusMessage(state) }), _jsx("span", { className: "soft-pill", children: annMoodLabel(state) })] })] }) }), _jsx(StickyNote, { title: "Ann's Message", className: "ann-message-note", children: _jsx("p", { children: "I found something interesting today. It might help with our project." }) }), _jsxs(PaperCard, { title: "Current Focus", tape: true, children: [_jsx("p", { className: "focus-title", children: currentFocus }), _jsx("p", { children: journeys[0]?.description ?? 'Working on the next idea with care, one note at a time.' }), _jsx(ProgressBar, { value: journeys[0] ? 60 : 35, label: journeys[0] ? '60%' : '35%' })] }), _jsx(PaperCard, { title: "At a Glance", tape: true, children: _jsxs("div", { className: "glance-list", children: [_jsxs("span", { children: ["New Discoveries ", _jsx("strong", { children: discoveries.length })] }), _jsxs("span", { children: ["Journeys in Progress ", _jsx("strong", { children: journeys.length })] }), _jsxs("span", { children: ["Memories Collected ", _jsx("strong", { children: diary.length })] })] }) }), _jsx(PaperCard, { title: "Mood", tape: true, children: _jsxs("div", { className: "mood-row", children: [_jsx("span", { className: "doodle-face", "aria-hidden": "true", children: ":)" }), _jsx("strong", { children: annMoodLabel(state) })] }) }), _jsxs(PaperCard, { title: "Memory Highlight", tape: true, className: "wide-card", children: [_jsx("p", { children: diaryHighlight }), _jsx("button", { onClick: () => window.ourCompanion.diary.generateDaily().then(onRefresh), children: "Write today's note" })] })] }) }));
}
function DiscoveryView({ discoveries, onRefresh }) {
    async function refreshDiscovery() {
        await window.ourCompanion.discovery.refresh();
        await onRefresh();
    }
    async function addToJourney(discoveryId) {
        await window.ourCompanion.discovery.addToJourney({ discoveryId });
        await onRefresh();
    }
    return (_jsxs(NotebookPage, { eyebrow: "Collected references", title: "Discoveries", note: "Ann keeps useful findings here like clipped references in a scrapbook.", children: [_jsxs("div", { className: "toolbar notebook-toolbar", children: [_jsx("div", { className: "soft-filter-row", "aria-label": "Discovery filters", children: ['All', 'AI & Tech', 'Design', 'Life', 'Other'].map((filter) => (_jsx("button", { className: filter === 'All' ? 'active' : '', children: filter }, filter))) }), _jsx("button", { onClick: refreshDiscovery, children: "Refresh" })] }), _jsxs("div", { className: "discovery-grid", children: [discoveries.map((discovery) => (_jsxs("article", { className: "discovery-card paper-photo-card", children: [_jsx("div", { className: "photo-thumb", "aria-hidden": "true", children: _jsx("span", { children: discovery.source.slice(0, 2).toUpperCase() }) }), _jsxs("div", { className: "card-topline", children: [_jsx("span", { children: discovery.source }), _jsx("strong", { children: formatDiscoveryTime(discovery) })] }), _jsx("h3", { children: discovery.title }), _jsx("p", { children: discovery.summary ?? discovery.shortMessage ?? 'Ann thinks this may be worth exploring.' }), _jsx("div", { className: "tag-row", children: discovery.tags.slice(0, 4).map((tag) => (_jsx("span", { children: tag }, tag))) }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: () => discovery.url && window.ourCompanion.tool.execute({ toolName: 'open_url', args: { url: discovery.url } }), children: "View" }), _jsx("button", { onClick: () => addToJourney(discovery.id), children: "Add" }), _jsx("button", { onClick: () => window.ourCompanion.discovery.markNotInterested(discovery.id).then(onRefresh), children: "Not interested" })] })] }, discovery.id))), discoveries.length === 0 && (_jsx(StickyNote, { title: "A quiet page", children: _jsx("p", { children: "Ann has not pinned any discoveries yet. Refresh when you want her to look around." }) }))] })] }));
}
function JourneyView({ journeys, timeline, onRefresh }) {
    async function createNewJourney() {
        await window.ourCompanion.journey.create({ title: 'New exploration trail', description: 'A fresh path for saved discoveries.' });
        await onRefresh();
    }
    return (_jsxs(NotebookPage, { eyebrow: "Planning notes", title: "Journeys", note: "Ongoing explorations Ann is helping shape into something real.", children: [_jsxs("div", { className: "toolbar notebook-toolbar", children: [_jsxs("div", { className: "soft-filter-row", "aria-label": "Journey tabs", children: [_jsx("button", { className: "active", children: "Active" }), _jsx("button", { children: "Completed" })] }), _jsx("button", { onClick: createNewJourney, children: "New" })] }), _jsxs("div", { className: "journey-list", children: [journeys.map((journey, index) => (_jsxs(PaperCard, { className: "journey-card", tape: true, children: [_jsxs("div", { className: "journey-main", children: [_jsx("span", { className: "doodle-icon", "aria-hidden": "true", children: "map" }), _jsxs("div", { children: [_jsx("h3", { children: journey.title }), _jsx("p", { children: journey.description ?? 'Ann is gathering notes for this path.' }), _jsx(ProgressBar, { value: index === 0 ? 60 : 25, label: index === 0 ? '60%' : '25%' })] })] }), _jsx(StickyNote, { title: "Next Step", compact: true, children: _jsx("p", { children: timeline[index]?.summary ?? timeline[index]?.title ?? 'Add one small note to move this forward.' }) })] }, journey.id))), journeys.length === 0 && (_jsx(StickyNote, { title: "No active journey yet", children: _jsx("p", { children: "Start a fresh exploration trail when an idea begins to tug at your sleeve." }) }))] })] }));
}
function MemoryView({ graph, onRefresh }) {
    const [draft, setDraft] = useState('');
    const [editing, setEditing] = useState();
    async function saveMemory() {
        if (!draft.trim())
            return;
        if (editing) {
            await window.ourCompanion.memory.updateNode({ id: editing.id, content: draft, summary: draft.slice(0, 120) });
        }
        else {
            await window.ourCompanion.memory.createNode({ type: 'topic', title: draft.slice(0, 42), summary: draft.slice(0, 120), content: draft });
        }
        setDraft('');
        setEditing(undefined);
        await onRefresh();
    }
    return (_jsx(NotebookPage, { eyebrow: "Shared moments", title: "Memories", note: "A gentle timeline of things Ann is learning and keeping close.", children: _jsxs("div", { className: "memory-layout", children: [_jsxs(PaperCard, { title: "Add a Memory", tape: true, children: [_jsx("textarea", { value: draft, onChange: (event) => setDraft(event.target.value), placeholder: "Add or edit a notebook memory" }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: saveMemory, children: editing ? 'Update' : 'Add' }), editing && _jsx("button", { onClick: () => setEditing(undefined), children: "Cancel" })] })] }), _jsxs("div", { className: "memory-list", children: [graph.nodes.map((node) => (_jsxs("article", { className: "memory-card paper-card", children: [_jsx("h3", { children: node.title }), _jsx("p", { children: node.summary ?? node.content }), _jsxs("div", { className: "tag-row", children: [_jsx("span", { children: node.type }), node.isPinned && _jsx("span", { children: "favorite" })] }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: () => {
                                                setEditing(node);
                                                setDraft(node.content ?? node.summary ?? node.title);
                                            }, children: "Edit" }), _jsx("button", { onClick: () => window.ourCompanion.memory.updateNode({ id: node.id, isMarkedWrong: true }).then(onRefresh), children: "Mark wrong" }), _jsx("button", { onClick: () => window.ourCompanion.memory.deleteNode(node.id).then(onRefresh), children: "Delete" })] })] }, node.id))), graph.nodes.length === 0 && (_jsx(StickyNote, { title: "A blank memory page", children: _jsx("p", { children: "Ann has not saved a memory here yet." }) }))] })] }) }));
}
function AskView({ onRefresh }) {
    const [input, setInput] = useState('Search web for PixiJS desktop pet tutorials');
    const [result, setResult] = useState();
    const parsedTool = useMemo(() => parseLocalCommand(input), [input]);
    async function submit() {
        if (parsedTool) {
            const output = await window.ourCompanion.tool.execute(parsedTool);
            setResult(output);
        }
        else {
            const output = await window.ourCompanion.ai.chat({ message: input });
            setResult(output);
        }
        await onRefresh();
    }
    return (_jsx(NotebookPage, { eyebrow: "Passing notes", title: "Ask Ann", note: "Write into the notebook and let Ann think with you.", children: _jsxs("section", { className: "chat-paper", children: [_jsx(NotebookChatBubble, { speaker: "user", time: "10:20 AM", children: "What should we work on next?" }), _jsx(NotebookChatBubble, { speaker: "ann", time: "10:30 AM", children: "Hmm... based on our current notes, I think we could improve the animation system, add more personality, or explore world-building ideas." }), result && (_jsx(NotebookChatBubble, { speaker: "ann", time: "Just now", children: formatAskResult(result) })), _jsx("div", { className: "prompt-chip-row", children: ['What should we explore next?', 'Summarize our current journey', 'Help me think through this idea'].map((prompt) => (_jsx("button", { onClick: () => setInput(prompt), children: prompt }, prompt))) }), _jsx("textarea", { value: input, onChange: (event) => setInput(event.target.value) }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: submit, children: "Send to Ann" }), parsedTool && _jsx("button", { onClick: () => window.ourCompanion.tool.preview(parsedTool).then(setResult), children: "Preview" })] })] }) }));
}
function SettingsView({ state, behaviorSettings, onRefresh }) {
    const [settings, setSettings] = useState();
    const [model, setModel] = useState('');
    const [endpoint, setEndpoint] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [status, setStatus] = useState('Loading settings...');
    const [saving, setSaving] = useState(false);
    const [developerOpen, setDeveloperOpen] = useState(false);
    const [devAnimation, setDevAnimation] = useState('live');
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
    async function saveSettings(input = {}) {
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
        }
        catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to save settings.');
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsx(NotebookPage, { eyebrow: "Notebook preferences", title: "Settings", note: "Functional settings, kept soft around the edges.", children: _jsxs("div", { className: "settings-layout", children: [_jsx(PaperCard, { title: "Ann's Behavior", tape: true, children: _jsx("p", { children: "Ann can stay gentle and present on the desktop while this notebook keeps her longer thoughts." }) }), _jsx(PaperCard, { title: "Appearance", tape: true, children: _jsx("p", { children: "Soft lavender, warm paper, and small notebook decorations are used for the panel experience." }) }), _jsx(PaperCard, { title: "Privacy & Memory", tape: true, children: _jsx("p", { children: "Memory editing stays available from the Memories page whenever something needs correction." }) }), _jsx(VoiceSettingsCard, {}), _jsxs(PaperCard, { title: "AI Provider", tape: true, className: "settings-panel", children: [_jsx("h2", { children: "DeepSeek" }), _jsxs("label", { children: [_jsx("span", { children: "Model" }), _jsx("input", { value: model, onChange: (event) => setModel(event.target.value), placeholder: "deepseek-v4-flash" })] }), _jsxs("label", { children: [_jsx("span", { children: "Endpoint" }), _jsx("input", { value: endpoint, onChange: (event) => setEndpoint(event.target.value), placeholder: "https://api.deepseek.com" })] }), _jsxs("label", { children: [_jsx("span", { children: "API key" }), _jsx("input", { type: "password", value: apiKey, onChange: (event) => setApiKey(event.target.value), placeholder: settings?.apiKeyConfigured ? 'Configured; paste a new key to replace' : 'Paste API key' })] }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: () => saveSettings(), disabled: saving, children: saving ? 'Saving' : 'Save' }), _jsx("button", { onClick: () => saveSettings({ clearApiKey: true }), disabled: saving, children: "Clear API key" })] }), _jsx("p", { children: status })] }), _jsxs(PaperCard, { title: "Developer Mode", tape: true, className: "developer-card", children: [_jsx("button", { onClick: () => setDeveloperOpen((open) => !open), children: developerOpen ? 'Hide developer tools' : 'Show developer tools' }), developerOpen && (_jsx(DeveloperPreview, { state: previewState, devAnimation: devAnimation, animationOverride: animationOverride, onAnimationChange: setDevAnimation, settings: behaviorSettings, onRefresh: onRefresh }))] })] }) }));
}
function VoiceSettingsCard() {
    const [speechStatus, setSpeechStatus] = useState();
    const [loading, setLoading] = useState(true);
    async function refreshStatus() {
        setLoading(true);
        try {
            setSpeechStatus(await window.ourCompanion.speech.getStatus());
        }
        catch (error) {
            setSpeechStatus({
                ready: false,
                model: 'ggml-tiny.en.bin',
                error: error instanceof Error ? error.message : 'Unable to read Whisper status.'
            });
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void refreshStatus();
    }, []);
    return (_jsxs(PaperCard, { title: "Voice", tape: true, className: "settings-panel", children: [_jsx("p", { children: "Talk to Ann on the desktop companion with double-click or Ctrl+Shift+Space. Replies appear word-by-word in her speech bubble." }), _jsxs("p", { children: [_jsx("strong", { children: "Hotkey:" }), " Ctrl+Shift+Space"] }), _jsxs("p", { children: [_jsx("strong", { children: "Whisper model:" }), " ", speechStatus?.model ?? 'ggml-tiny.en.bin'] }), _jsxs("p", { children: [_jsx("strong", { children: "Status:" }), ' ', loading ? 'Checking local Whisper setup...' : speechStatus?.ready ? 'Ready for offline transcription.' : speechStatus?.error] }), _jsx("div", { className: "action-row", children: _jsx("button", { onClick: () => refreshStatus(), disabled: loading, children: loading ? 'Checking...' : 'Refresh status' }) }), !loading && !speechStatus?.ready && (_jsxs("p", { children: ["Run ", _jsx("code", { children: "npm run whisper:setup" }), " from the project root to download whisper.cpp and the tiny English model."] }))] }));
}
function BehaviorPanel({ settings, onRefresh }) {
    const [draftMovement, setDraftMovement] = useState(settings?.effectiveMovement ?? 25);
    const range = getWalkDelayRange(settings?.effectiveMovement ?? draftMovement);
    useEffect(() => {
        if (settings)
            setDraftMovement(settings.effectiveMovement);
    }, [settings?.effectiveMovement]);
    async function saveMovement(value) {
        setDraftMovement(value);
        await window.ourCompanion.character.updateBehaviorSettings({ movementOverride: value });
        await onRefresh();
    }
    async function resetMovement() {
        await window.ourCompanion.character.updateBehaviorSettings({ resetMovement: true });
        await onRefresh();
    }
    return (_jsxs("div", { className: "paper-card behavior-panel", children: [_jsx("p", { className: "eyebrow", children: "Behavior" }), _jsx("h2", { children: "Movement" }), _jsxs("label", { children: [_jsxs("span", { children: ["Movement score: ", settings?.effectiveMovement ?? draftMovement] }), _jsx("input", { type: "range", min: "0", max: "100", value: draftMovement, onChange: (event) => setDraftMovement(Number(event.target.value)), onMouseUp: () => saveMovement(draftMovement), onKeyUp: (event) => {
                            if (event.key === 'Enter')
                                saveMovement(draftMovement);
                        } })] }), _jsxs("p", { children: [settings?.source === 'override' ? 'Using your override.' : 'Using Ann personality default.', " Current walk rest is about", ' ', Math.round(range.minMs / 1000), "-", Math.round(range.maxMs / 1000), " seconds."] }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: () => saveMovement(draftMovement), children: "Save movement" }), _jsx("button", { onClick: resetMovement, children: "Reset to Ann" })] })] }));
}
function NotebookPage({ eyebrow, title, note, children }) {
    return (_jsxs("div", { className: "notebook-page", children: [_jsxs("header", { className: "notebook-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: eyebrow }), _jsx("h1", { children: title }), note && _jsx("p", { children: note })] }), _jsx("span", { className: "notebook-date", children: formatShortDate(new Date().toISOString()) })] }), children] }));
}
function NotebookSectionTitle({ children }) {
    return _jsx("h2", { className: "notebook-section-title", children: children });
}
function PaperCard({ title, tape, compact, className = '', children }) {
    return (_jsxs("section", { className: `paper-card ${compact ? 'paper-card-compact' : ''} ${className}`, children: [title && (tape ? _jsx(NotebookSectionTitle, { children: title }) : _jsx("h2", { children: title })), children] }));
}
function StickyNote({ title, compact, className = '', children }) {
    return (_jsxs("section", { className: `sticky-note ${compact ? 'sticky-note-compact' : ''} ${className}`, children: [title && _jsx("h3", { children: title }), children] }));
}
function NotebookChatBubble({ speaker, time, children }) {
    return (_jsxs("div", { className: `notebook-chat-bubble ${speaker}`, children: [_jsx("p", { children: children }), _jsx("span", { children: time })] }));
}
function MiniAnnSticker() {
    return (_jsxs("div", { className: "mini-ann-sticker", "aria-hidden": "true", children: [_jsx("span", { className: "mini-ann-hair" }), _jsx("span", { className: "mini-ann-face" }), _jsx("span", { className: "mini-ann-eye left" }), _jsx("span", { className: "mini-ann-eye right" }), _jsx("span", { className: "mini-ann-body" })] }));
}
function ProgressBar({ value, label }) {
    return (_jsxs("div", { className: "progress-row", children: [_jsx("span", { className: "progress-track", children: _jsx("span", { style: { width: `${clamp(value, 0, 100)}%` } }) }), _jsx("strong", { children: label })] }));
}
function DeveloperPreview({ state, devAnimation, animationOverride, onAnimationChange, settings, onRefresh }) {
    return (_jsxs("div", { className: "developer-tools", children: [_jsx("div", { className: "developer-preview-canvas", children: _jsx(CompanionCanvas, { state: state, compact: true, animationOverride: animationOverride }) }), _jsxs("div", { className: "dev-animation-panel", children: [_jsx("p", { className: "eyebrow", children: "Developer use" }), _jsx("h2", { children: "Animation review" }), _jsx("div", { className: "segmented-control", "aria-label": "Preview Ann animation", children: devAnimations.map((animation) => (_jsx("button", { className: devAnimation === animation ? 'active' : '', onClick: () => onAnimationChange(animation), children: animation === 'live' ? 'Live' : readable(animation) }, animation))) }), _jsxs("p", { children: ["Previewing: ", devAnimation === 'live' ? 'engine state' : readable(devAnimation)] })] }), _jsx(BehaviorPanel, { settings: settings, onRefresh: onRefresh })] }));
}
function tabLabel(tab) {
    return {
        home: 'Home',
        discovery: 'Discoveries',
        journey: 'Journeys',
        memory: 'Memories',
        ask: 'Ask Ann',
        settings: 'Settings'
    }[tab];
}
function annStatusMessage(state) {
    if (!state)
        return 'Ann is settling in and opening a fresh page.';
    if (state.intent === 'sharing_discovery' || state.coreState === 'discovering')
        return 'Ann found something curious and tucked it into the notebook.';
    if (state.intent === 'reviewing_memory')
        return 'Ann is reading your notes and thinking about what matters.';
    if (state.intent === 'reflecting_journey')
        return 'Ann is connecting the dots across your current journey.';
    if (state.intent === 'helping_task')
        return 'Ann is focused beside you and helping with the next step.';
    if (state.intent === 'wandering')
        return 'Ann is stretching her legs, then coming back to the page.';
    return 'Ann is quietly here, keeping an eye on new ideas.';
}
function annMoodLabel(state) {
    const emotion = state?.emotion;
    if (!emotion)
        return 'Curious & Excited';
    const entries = Object.entries(emotion).sort((a, b) => b[1] - a[1]);
    const [first, second] = entries;
    return `${capitalize(first?.[0] ?? 'curious')} & ${capitalize(second?.[0] ?? 'excited')}`;
}
function formatDiscoveryTime(discovery) {
    return formatRelativeDate(discovery.publishedAt ?? discovery.sharedAt ?? discovery.createdAt);
}
function formatRelativeDate(value) {
    if (!value)
        return 'Just now';
    const time = new Date(value).getTime();
    if (Number.isNaN(time))
        return 'Just now';
    const diffMs = Date.now() - time;
    const minutes = Math.max(0, Math.round(diffMs / 60000));
    if (minutes < 60)
        return minutes <= 1 ? 'Just now' : `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24)
        return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}
function formatShortDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatAskResult(result) {
    if ('message' in result)
        return result.message;
    if ('errorMessage' in result && result.errorMessage)
        return result.errorMessage;
    return result.userFacingSummary;
}
function readable(value) {
    return value.replaceAll('_', ' ');
}
function capitalize(value) {
    return value.slice(0, 1).toUpperCase() + value.slice(1);
}
function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function easeInOut(progress) {
    return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
}
function createDevAnimationState(animation) {
    const stateByAnimation = {
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
function parseLocalCommand(input) {
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('open url ')) {
        return { toolName: 'open_url', args: { url: trimmed.slice('open url '.length).trim() } };
    }
    if (lower.startsWith('open app ')) {
        return { toolName: 'open_app', args: { appName: trimmed.slice('open app '.length).trim() } };
    }
    if (lower.startsWith('search web for ')) {
        return { toolName: 'search_web', args: { query: trimmed.slice('search web for '.length).trim(), target: 'google' } };
    }
    return undefined;
}
