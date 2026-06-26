import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { COMPANION_CHAT_RETENTION_DAYS } from '@our-companion/shared';
import { t } from '../i18n';
import { getSpeechDuration, getWalkDelay, getWalkDelayRange, selectSpeechLine } from '../character/ann/companionBehavior';
import { getIdleRotationDelay, isIdleState, selectWeightedIdleAnimation } from '../character/ann/idleBehavior';
import { useAudioCapture } from '../companion/useAudioCapture';
import { TypewriterSpeechBubble } from '../companion/TypewriterSpeechBubble';
import { useCompanionSession } from '../companion/useCompanionSession';
import { CompanionCanvas } from './CompanionCanvas';
const LangContext = createContext('en');
function useLang() { return useContext(LangContext); }
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
    const [textInput, setTextInput] = useState('');
    const [textOpen, setTextOpen] = useState(false);
    const textInputRef = useRef(null);
    const { phase, toggleListening, runTurn, onTypewriterComplete, isSessionActive } = useCompanionSession({
        stateRef,
        applyState,
        onInstantSpeech: showInstantSpeech,
        onTypewriterSpeech: showTypewriterSpeech,
        pauseAmbient: (paused) => {
            sessionActiveRef.current = paused;
        }
    });
    const handleTypewriterComplete = useCallback(() => {
        setTypewriterMessage(undefined);
        onTypewriterComplete();
    }, [onTypewriterComplete]);
    const openTextInput = useCallback(() => {
        setTextOpen(true);
        void setMousePassthrough(false);
    }, []);
    const closeTextInput = useCallback(() => {
        setTextOpen(false);
        setTextInput('');
    }, []);
    const handleTextSubmit = useCallback(async (e) => {
        e.preventDefault();
        const trimmed = textInput.trim();
        if (!trimmed || phase !== 'idle')
            return;
        closeTextInput();
        await runTurn(trimmed, 'companion_text');
    }, [textInput, phase, runTurn, closeTextInput]);
    // Close text input and restore passthrough when Ann stops being idle
    useEffect(() => {
        if (phase !== 'idle' && textOpen) {
            closeTextInput();
        }
    }, [phase, textOpen, closeTextInput]);
    // Re-enable passthrough when text input is closed (only if not hovering Ann)
    useEffect(() => {
        if (!textOpen) {
            void setMousePassthrough(true);
        }
    }, [textOpen]);
    useEffect(() => {
        document.documentElement.classList.add('companion-mode');
        return () => document.documentElement.classList.remove('companion-mode');
    }, []);
    useEffect(() => {
        if (localStorage.getItem('ann_onboarded'))
            return;
        const timer = window.setTimeout(() => {
            showInstantSpeech("Hi! Single-click to open my notebook. Double-click to talk to me.");
            localStorage.setItem('ann_onboarded', '1');
        }, 1500);
        return () => window.clearTimeout(timer);
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
            showTypewriterSpeech(payload.message);
        });
        const unsubscribePerformance = window.ourCompanion.action.onPerformance((script) => {
            let delay = 0;
            for (const step of script.steps) {
                const animKey = step.animationKey;
                window.setTimeout(() => {
                    setIdleAnimation(animKey);
                }, delay);
                delay += step.durationMs;
            }
        });
        return () => {
            unsubscribeState();
            unsubscribeAnnounce();
            unsubscribePerformance();
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
        showTypewriterSpeech(message);
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
    return (_jsxs("main", { className: "companion-shell", children: [_jsx(CompanionCanvas, { state: state, facing: facing, isListening: phase === 'listening', animationOverride: isIdleState(state) && !isSessionActive && state?.intent !== 'sharing_discovery' ? idleAnimation : undefined, onPointerHitChange: handlePointerHitChange, onOpenPanel: () => {
                    if (phase === 'idle' && !textOpen) {
                        openTextInput();
                    }
                    else {
                        closeTextInput();
                        void window.ourCompanion.window.openPanel();
                    }
                }, onToggleListen: toggleListening, onDragStart: handleDragStart, onDragMove: handleDragMove, onDragEnd: handleDragEnd }), typewriterMessage && (_jsx(TypewriterSpeechBubble, { message: typewriterMessage, onComplete: handleTypewriterComplete })), !typewriterMessage && speech && _jsx("div", { className: "speech-bubble", children: speech }), phase === 'idle' && textOpen && (_jsx("form", { className: "companion-text-input", onSubmit: (e) => { void handleTextSubmit(e); }, children: _jsx("input", { ref: textInputRef, value: textInput, onChange: (e) => setTextInput(e.target.value), placeholder: "Type to Ann\u2026", autoFocus: true, onKeyDown: (e) => {
                        if (e.key === 'Escape')
                            closeTextInput();
                    } }) }))] }));
}
function PanelShell() {
    const [tab, setTab] = useState('home');
    const [lang, setLang] = useState('en');
    const [state, setState] = useState();
    const [behaviorSettings, setBehaviorSettings] = useState();
    const [characters, setCharacters] = useState([]);
    const [discoveries, setDiscoveries] = useState([]);
    const [journeys, setJourneys] = useState([]);
    const [timeline, setTimeline] = useState([]);
    const [memoryGraph, setMemoryGraph] = useState({ nodes: [], edges: [] });
    const [diary, setDiary] = useState([]);
    const [exploration, setExploration] = useState();
    const [explorationEvents, setExplorationEvents] = useState([]);
    const [exploring, setExploring] = useState(false);
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
        void refreshAll();
        void window.ourCompanion.ai.getSettings().then((s) => {
            if (s.uiLang)
                setLang(s.uiLang);
        });
        const unsubscribeExploration = window.ourCompanion.autonomy.onExplorationEvent((event) => {
            setExplorationEvents((events) => [event, ...events].slice(0, 12));
        });
        return () => {
            unsubscribeExploration();
        };
    }, []);
    async function sendAnnExploring() {
        if (exploring)
            return;
        setExploring(true);
        try {
            const result = await window.ourCompanion.autonomy.startExploration({ trigger: 'manual' });
            setExploration(result);
            await refreshAll();
        }
        finally {
            setExploring(false);
        }
    }
    async function submitExplorationFeedback(value) {
        const cycle = exploration?.cycle;
        const insight = exploration?.selectedInsight;
        if (!cycle)
            return;
        await window.ourCompanion.autonomy.submitFeedback({
            cycleId: cycle.id,
            insightId: insight?.id,
            value,
            note: insight?.title
        });
        await refreshAll();
        setExploration((current) => current
            ? {
                ...current,
                cycle: { ...current.cycle, state: 'reflecting', completedAt: new Date().toISOString() }
            }
            : current);
    }
    return (_jsx(LangContext.Provider, { value: lang, children: _jsxs("main", { className: "panel-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "brand-mark", children: [_jsx("span", { children: t(lang, 'brand_name') }), _jsx("small", { children: t(lang, 'brand_subtitle') })] }), _jsx("nav", { children: ['home', 'discovery', 'journey', 'memory', 'chat', 'ask', 'settings'].map((item) => (_jsx("button", { className: tab === item ? 'active' : '', onClick: () => setTab(item), children: tabLabel(item, lang) }, item))) })] }), _jsxs("section", { className: "workspace", children: [tab === 'home' && (_jsx(HomeView, { state: state, character: characters[0], discoveries: discoveries, journeys: journeys, diary: diary, exploration: exploration, explorationEvents: explorationEvents, exploring: exploring, onStartExploration: sendAnnExploring, onSubmitFeedback: submitExplorationFeedback, onRefresh: refreshAll })), tab === 'discovery' && (_jsx(DiscoveryView, { discoveries: discoveries, exploration: exploration, exploring: exploring, onStartExploration: sendAnnExploring, onSubmitFeedback: submitExplorationFeedback, onRefresh: refreshAll })), tab === 'journey' && _jsx(JourneyView, { journeys: journeys, timeline: timeline, onRefresh: refreshAll }), tab === 'memory' && _jsx(MemoryView, { graph: memoryGraph, onRefresh: refreshAll }), tab === 'chat' && _jsx(ChatView, {}), tab === 'ask' && _jsx(AskView, { onRefresh: refreshAll }), tab === 'settings' && _jsx(SettingsView, { state: state, behaviorSettings: behaviorSettings, onRefresh: refreshAll, onLangChange: setLang })] })] }) }));
}
function HomeView({ state, character, discoveries, journeys, diary, exploration, explorationEvents, exploring, onStartExploration, onSubmitFeedback, onRefresh }) {
    const lang = useLang();
    const currentFocus = journeys[0]?.title ?? discoveries[0]?.title ?? 'Collecting little ideas for later';
    const diaryHighlight = diary[0]?.content ?? t(lang, 'home_diary_default');
    return (_jsx(NotebookPage, { eyebrow: t(lang, 'home_eyebrow'), title: t(lang, 'home_title'), note: `${character?.name ?? 'Ann'} is keeping a soft page open for the things we are building together.`, children: _jsxs("div", { className: "home-notebook-grid", children: [_jsx(PaperCard, { className: "ann-status-card", title: t(lang, 'home_ann_status_card'), tape: true, children: _jsxs("div", { className: "ann-status-content", children: [_jsx(MiniAnnSticker, {}), _jsxs("div", { children: [_jsx("p", { children: annStatusMessage(state) }), _jsx("span", { className: "soft-pill", children: annMoodLabel(state) })] })] }) }), _jsxs(StickyNote, { title: t(lang, 'home_ann_message_title'), className: "ann-message-note", children: [_jsx("p", { children: t(lang, 'home_ann_message_body') }), _jsx("button", { onClick: () => void onStartExploration(), disabled: exploring, className: "primary-notebook-action", children: exploring ? 'Ann is exploring...' : 'Send Ann exploring' })] }), exploration?.selectedInsight && (_jsxs(PaperCard, { title: "Ann returned", tape: true, className: "wide-card insight-return-card", children: [_jsx("p", { className: "focus-title", children: exploration.selectedInsight.title }), _jsx("p", { children: exploration.selectedInsight.narration ?? exploration.selectedInsight.summary }), _jsxs("div", { className: "tag-row", children: [_jsx("span", { children: exploration.selectedCuriosityTarget?.explorationType ?? 'insight' }), _jsx("span", { children: exploration.cycle.state })] }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: () => void onSubmitFeedback('saved'), children: "Save" }), _jsx("button", { onClick: () => void onSubmitFeedback('not_interested'), children: "Not interested" }), _jsx("button", { onClick: () => void onSubmitFeedback('later'), children: "Later" }), _jsx("button", { onClick: () => void onSubmitFeedback('talk_about_this'), children: "Talk about this" })] })] })), _jsxs(PaperCard, { title: t(lang, 'home_current_focus'), tape: true, children: [_jsx("p", { className: "focus-title", children: currentFocus }), _jsx("p", { children: journeys[0]?.description ?? t(lang, 'home_focus_default_desc') }), _jsx(ProgressBar, { value: journeys[0] ? 60 : 35, label: journeys[0] ? '60%' : '35%' })] }), _jsx(PaperCard, { title: t(lang, 'home_at_glance'), tape: true, children: _jsxs("div", { className: "glance-list", children: [_jsxs("span", { children: [t(lang, 'home_glance_discoveries'), " ", _jsx("strong", { children: discoveries.length })] }), _jsxs("span", { children: [t(lang, 'home_glance_journeys'), " ", _jsx("strong", { children: journeys.length })] }), _jsxs("span", { children: [t(lang, 'home_glance_memories'), " ", _jsx("strong", { children: diary.length })] })] }) }), explorationEvents.length > 0 && (_jsx(PaperCard, { title: "Exploration Loop", tape: true, children: _jsx("div", { className: "exploration-event-list", children: explorationEvents.slice(0, 5).map((event) => (_jsxs("span", { children: [_jsx("strong", { children: event.state }), event.message] }, event.id))) }) })), _jsx(PaperCard, { title: t(lang, 'home_mood'), tape: true, children: _jsxs("div", { className: "mood-row", children: [_jsx("span", { className: "doodle-face", "aria-hidden": "true", children: ":)" }), _jsx("strong", { children: annMoodLabel(state) })] }) }), _jsxs(PaperCard, { title: t(lang, 'home_memory_highlight'), tape: true, className: "wide-card", children: [_jsx("p", { children: diaryHighlight }), _jsx("button", { onClick: () => window.ourCompanion.diary.generateDaily().then(onRefresh), children: t(lang, 'home_write_note') })] })] }) }));
}
function DiscoveryView({ discoveries, exploration, exploring, onStartExploration, onSubmitFeedback, onRefresh }) {
    const lang = useLang();
    async function refreshDiscovery() {
        await window.ourCompanion.discovery.refresh();
        await onRefresh();
    }
    async function addToJourney(discoveryId) {
        await window.ourCompanion.discovery.addToJourney({ discoveryId });
        await onRefresh();
    }
    const filters = [
        { key: 'all', label: t(lang, 'discovery_filter_all') },
        { key: 'ai', label: t(lang, 'discovery_filter_ai') },
        { key: 'design', label: t(lang, 'discovery_filter_design') },
        { key: 'life', label: t(lang, 'discovery_filter_life') },
        { key: 'other', label: t(lang, 'discovery_filter_other') },
    ];
    return (_jsxs(NotebookPage, { eyebrow: t(lang, 'discovery_eyebrow'), title: t(lang, 'discovery_title'), note: t(lang, 'discovery_note'), children: [_jsxs("div", { className: "toolbar notebook-toolbar", children: [_jsx("div", { className: "soft-filter-row", "aria-label": "Discovery filters", children: filters.map(({ key, label }) => (_jsx("button", { className: key === 'all' ? 'active' : '', children: label }, key))) }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: () => void onStartExploration(), disabled: exploring, children: exploring ? 'Exploring...' : 'Send Ann exploring' }), _jsx("button", { onClick: refreshDiscovery, children: t(lang, 'discovery_refresh') })] })] }), exploration?.selectedInsight && (_jsxs("section", { className: "insight-archive-panel", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Returned insight" }), _jsx("h2", { children: exploration.selectedInsight.title }), _jsx("p", { children: exploration.selectedInsight.narration ?? exploration.selectedInsight.summary }), _jsx("p", { children: exploration.selectedInsight.suggestedQuestion })] }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: () => void onSubmitFeedback('opened_evidence'), children: "Explore evidence" }), _jsx("button", { onClick: () => void onSubmitFeedback('saved'), children: "Save" }), _jsx("button", { onClick: () => void onSubmitFeedback('not_interested'), children: "Not interested" }), _jsx("button", { onClick: () => void onSubmitFeedback('talk_about_this'), children: "Talk about this" })] }), _jsx("div", { className: "discovery-grid evidence-grid", children: exploration.discoveryCandidates.slice(0, 4).map((candidate) => (_jsxs("article", { className: "discovery-card paper-photo-card", children: [_jsxs("div", { className: "card-topline", children: [_jsx("span", { children: candidate.sourceType }), _jsx("strong", { children: candidate.agentType })] }), _jsx("h3", { children: candidate.title }), _jsx("p", { children: candidate.summary }), candidate.sourceUrl && (_jsx("button", { onClick: () => window.ourCompanion.tool.execute({ toolName: 'open_url', args: { url: candidate.sourceUrl } }), children: t(lang, 'discovery_view') }))] }, candidate.id))) })] })), _jsxs("div", { className: "discovery-grid", children: [discoveries.map((discovery) => (_jsxs("article", { className: "discovery-card paper-photo-card", children: [_jsx("div", { className: "photo-thumb", "aria-hidden": "true", children: _jsx("span", { children: discovery.source.slice(0, 2).toUpperCase() }) }), _jsxs("div", { className: "card-topline", children: [_jsx("span", { children: discovery.source }), _jsx("strong", { children: formatDiscoveryTime(discovery) })] }), _jsx("h3", { children: discovery.title }), _jsx("p", { children: discovery.summary ?? discovery.shortMessage ?? t(lang, 'discovery_default_summary') }), _jsx("div", { className: "tag-row", children: discovery.tags.slice(0, 4).map((tag) => (_jsx("span", { children: tag }, tag))) }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: () => discovery.url && window.ourCompanion.tool.execute({ toolName: 'open_url', args: { url: discovery.url } }), children: t(lang, 'discovery_view') }), _jsx("button", { onClick: () => addToJourney(discovery.id), children: t(lang, 'discovery_add') }), _jsx("button", { onClick: () => window.ourCompanion.discovery.markNotInterested(discovery.id).then(onRefresh), children: t(lang, 'discovery_not_interested') })] })] }, discovery.id))), discoveries.length === 0 && (_jsx(StickyNote, { title: t(lang, 'discovery_empty_title'), children: _jsx("p", { children: t(lang, 'discovery_empty_body') }) }))] })] }));
}
function JourneyView({ journeys, timeline, onRefresh }) {
    const lang = useLang();
    async function createNewJourney() {
        await window.ourCompanion.journey.create({ title: 'New exploration trail', description: 'A fresh path for saved discoveries.' });
        await onRefresh();
    }
    return (_jsxs(NotebookPage, { eyebrow: t(lang, 'journey_eyebrow'), title: t(lang, 'journey_title'), note: t(lang, 'journey_note'), children: [_jsxs("div", { className: "toolbar notebook-toolbar", children: [_jsxs("div", { className: "soft-filter-row", "aria-label": "Journey tabs", children: [_jsx("button", { className: "active", children: t(lang, 'journey_filter_active') }), _jsx("button", { children: t(lang, 'journey_filter_completed') })] }), _jsx("button", { onClick: createNewJourney, children: t(lang, 'journey_new') })] }), _jsxs("div", { className: "journey-list", children: [journeys.map((journey, index) => (_jsxs(PaperCard, { className: "journey-card", tape: true, children: [_jsxs("div", { className: "journey-main", children: [_jsx("span", { className: "doodle-icon", "aria-hidden": "true", children: "map" }), _jsxs("div", { children: [_jsx("h3", { children: journey.title }), _jsx("p", { children: journey.description ?? t(lang, 'journey_default_desc') }), _jsx(ProgressBar, { value: index === 0 ? 60 : 25, label: index === 0 ? '60%' : '25%' })] })] }), _jsx(StickyNote, { title: t(lang, 'journey_next_step'), compact: true, children: _jsx("p", { children: timeline[index]?.summary ?? timeline[index]?.title ?? t(lang, 'journey_default_next_step') }) })] }, journey.id))), journeys.length === 0 && (_jsx(StickyNote, { title: t(lang, 'journey_empty_title'), children: _jsx("p", { children: t(lang, 'journey_empty_body') }) }))] })] }));
}
function MemoryView({ graph, onRefresh }) {
    const lang = useLang();
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
    return (_jsx(NotebookPage, { eyebrow: t(lang, 'memory_eyebrow'), title: t(lang, 'memory_title'), note: t(lang, 'memory_note'), children: _jsxs("div", { className: "memory-layout", children: [_jsxs(PaperCard, { title: t(lang, 'memory_add_card'), tape: true, children: [_jsx("textarea", { value: draft, onChange: (event) => setDraft(event.target.value), placeholder: t(lang, 'memory_placeholder') }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: saveMemory, children: editing ? t(lang, 'memory_update') : t(lang, 'memory_add') }), editing && _jsx("button", { onClick: () => setEditing(undefined), children: t(lang, 'memory_cancel') })] })] }), _jsxs("div", { className: "memory-list", children: [graph.nodes.map((node) => (_jsxs("article", { className: "memory-card paper-card", children: [_jsx("h3", { children: node.title }), _jsx("p", { children: node.summary ?? node.content }), _jsxs("div", { className: "tag-row", children: [_jsx("span", { children: node.type }), node.isPinned && _jsx("span", { children: t(lang, 'memory_favorite') })] }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: () => {
                                                setEditing(node);
                                                setDraft(node.content ?? node.summary ?? node.title);
                                            }, children: t(lang, 'memory_edit') }), _jsx("button", { onClick: () => window.ourCompanion.memory.updateNode({ id: node.id, isMarkedWrong: true }).then(onRefresh), children: t(lang, 'memory_mark_wrong') }), _jsx("button", { onClick: () => window.ourCompanion.memory.deleteNode(node.id).then(onRefresh), children: t(lang, 'memory_delete') })] })] }, node.id))), graph.nodes.length === 0 && (_jsx(StickyNote, { title: t(lang, 'memory_empty_title'), children: _jsx("p", { children: t(lang, 'memory_empty_body') }) }))] })] }) }));
}
function AskView({ onRefresh }) {
    const lang = useLang();
    const [input, setInput] = useState('Search web for PixiJS desktop pet tutorials');
    const [result, setResult] = useState();
    const [plan, setPlan] = useState();
    const [permissionsNeeded, setPermissionsNeeded] = useState([]);
    const [alwaysAllow, setAlwaysAllow] = useState(false);
    // Still support legacy direct tool commands for discovery buttons
    const parsedTool = useMemo(() => parseLocalCommand(input), [input]);
    async function submit() {
        setPermissionsNeeded([]);
        const actionPlan = await window.ourCompanion.action.plan(input);
        if (actionPlan) {
            setPlan(actionPlan);
            const output = await window.ourCompanion.action.executePlan(actionPlan);
            if (output.status === 'await_permission') {
                setPermissionsNeeded(output.requiredScopes);
            }
            else {
                setResult(output);
                setPlan(undefined);
            }
        }
        else if (parsedTool) {
            const output = await window.ourCompanion.tool.execute(parsedTool);
            setResult(output);
        }
        else {
            const output = await window.ourCompanion.ai.chat({ message: input });
            setResult(output);
        }
        await onRefresh();
    }
    async function confirmPermissions() {
        if (!plan)
            return;
        if (alwaysAllow) {
            const current = await window.ourCompanion.action.getPermissions();
            const updated = { ...current };
            for (const scope of permissionsNeeded)
                updated[scope] = 'granted';
            await window.ourCompanion.action.updatePermissions(updated);
        }
        setPermissionsNeeded([]);
        const output = await window.ourCompanion.action.executePlan(plan);
        setResult(output);
        setPlan(undefined);
        await onRefresh();
    }
    const prompts = [t(lang, 'ask_prompt_1'), t(lang, 'ask_prompt_2'), t(lang, 'ask_prompt_3')];
    return (_jsx(NotebookPage, { eyebrow: t(lang, 'ask_eyebrow'), title: t(lang, 'ask_title'), note: t(lang, 'ask_note'), children: _jsxs("section", { className: "chat-paper", children: [result && (_jsx(NotebookChatBubble, { speaker: "ann", time: "Just now", children: formatAskResult(result) })), permissionsNeeded.length > 0 && (_jsxs("div", { className: "paper-card", children: [_jsx("p", { className: "eyebrow", children: "Permission needed" }), _jsxs("p", { children: ["Ann needs access to: ", permissionsNeeded.join(', ')] }), _jsxs("label", { className: "checkbox-row", children: [_jsx("input", { type: "checkbox", checked: alwaysAllow, onChange: (e) => setAlwaysAllow(e.target.checked) }), _jsx("span", { children: "Always allow for this type of action" })] }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: confirmPermissions, children: "Allow" }), _jsx("button", { onClick: () => { setPermissionsNeeded([]); setPlan(undefined); }, children: "Deny" })] })] })), _jsx("div", { className: "prompt-chip-row", children: prompts.map((prompt) => (_jsx("button", { onClick: () => setInput(prompt), children: prompt }, prompt))) }), _jsx("textarea", { value: input, onChange: (event) => setInput(event.target.value) }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: submit, children: t(lang, 'ask_send') }), parsedTool && _jsx("button", { onClick: () => window.ourCompanion.tool.preview(parsedTool).then(setResult), children: t(lang, 'ask_preview') })] })] }) }));
}
function ChatView() {
    const lang = useLang();
    const [messages, setMessages] = useState([]);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const bottomRef = useRef(null);
    async function loadHistory() {
        const all = await window.ourCompanion.companion.getHistory({ limit: 200 });
        setMessages(all);
    }
    useEffect(() => {
        void loadHistory();
    }, []);
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    const filtered = useMemo(() => {
        let list = messages;
        if (filter === 'errors') {
            list = list.filter((m) => m.status !== 'ok');
        }
        else if (filter !== 'all') {
            list = list.filter((m) => m.source === filter);
        }
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter((m) => m.content.toLowerCase().includes(q));
        }
        return list;
    }, [messages, filter, search]);
    async function sendMessage() {
        const trimmed = input.trim();
        if (!trimmed || sending)
            return;
        setSending(true);
        setInput('');
        try {
            await window.ourCompanion.ai.chat({ message: trimmed });
            await loadHistory();
        }
        finally {
            setSending(false);
        }
    }
    async function clearHistory() {
        setClearing(true);
        try {
            await window.ourCompanion.companion.clearHistory();
            setMessages([]);
        }
        finally {
            setClearing(false);
            setConfirmClear(false);
        }
    }
    function bubbleSpeaker(msg) {
        if (msg.role === 'assistant')
            return 'ann';
        if (msg.role === 'user')
            return 'user';
        return 'system';
    }
    function formatTime(iso) {
        const d = new Date(iso);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
            ' ' +
            d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    const filters = [
        { key: 'all', label: t(lang, 'chat_filter_all') },
        { key: 'voice', label: t(lang, 'chat_filter_voice') },
        { key: 'panel', label: t(lang, 'chat_filter_panel') },
        { key: 'errors', label: t(lang, 'chat_filter_errors') }
    ];
    function sourceBadge(msg) {
        if (msg.status !== 'ok')
            return msg.status === 'empty_transcript' ? t(lang, 'badge_no_audio') : t(lang, 'badge_error');
        if (msg.source === 'voice')
            return t(lang, 'badge_voice');
        if (msg.source === 'panel')
            return t(lang, 'badge_panel');
        return null;
    }
    return (_jsx(NotebookPage, { eyebrow: t(lang, 'chat_eyebrow'), title: t(lang, 'chat_title'), note: t(lang, 'chat_note'), children: _jsxs("section", { className: "chat-paper chat-view", children: [_jsxs("div", { className: "chat-toolbar", children: [_jsx("div", { className: "chat-filter-chips", children: filters.map(({ key, label }) => (_jsx("button", { className: `chip${filter === key ? ' active' : ''}`, onClick: () => setFilter(key), children: label }, key))) }), _jsx("input", { className: "chat-search", placeholder: t(lang, 'chat_search_placeholder'), value: search, onChange: (e) => setSearch(e.target.value) })] }), _jsxs("div", { className: "chat-messages", children: [filtered.length === 0 && (_jsx("p", { className: "chat-empty", children: t(lang, 'chat_empty') })), filtered.map((msg) => {
                            const badge = sourceBadge(msg);
                            return (_jsxs(NotebookChatBubble, { speaker: bubbleSpeaker(msg), time: formatTime(msg.createdAt), meta: badge ? _jsx("span", { className: `source-badge ${msg.status !== 'ok' ? 'error' : msg.source}`, children: badge }) : undefined, children: [msg.source === 'voice' && msg.role === 'user' && (_jsx("span", { className: "voice-transcription-label", children: t(lang, 'voice_transcribed') })), msg.content] }, msg.id));
                        }), _jsx("div", { ref: bottomRef })] }), _jsxs("div", { className: "chat-composer", children: [_jsx("textarea", { value: input, onChange: (e) => setInput(e.target.value), placeholder: t(lang, 'chat_composer_placeholder'), onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void sendMessage();
                            } } }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: () => void sendMessage(), disabled: sending || !input.trim(), children: sending ? t(lang, 'chat_sending') : t(lang, 'chat_send') }), confirmClear ? (_jsxs(_Fragment, { children: [_jsx("span", { children: t(lang, 'chat_clear_confirm') }), _jsx("button", { onClick: () => void clearHistory(), disabled: clearing, children: t(lang, 'chat_clear_yes') }), _jsx("button", { onClick: () => setConfirmClear(false), children: t(lang, 'chat_clear_cancel') })] })) : (_jsx("button", { className: "btn-ghost", onClick: () => setConfirmClear(true), children: t(lang, 'chat_clear') }))] }), _jsx("p", { className: "chat-retention-note", children: t(lang, 'chat_retention_note', { days: COMPANION_CHAT_RETENTION_DAYS }) })] })] }) }));
}
function SettingsView({ state, behaviorSettings, onRefresh, onLangChange }) {
    const lang = useLang();
    const [settings, setSettings] = useState();
    const [model, setModel] = useState('');
    const [endpoint, setEndpoint] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [replyLang, setReplyLang] = useState('en');
    const [uiLang, setUiLang] = useState('en');
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
        setReplyLang(next.replyLanguage ?? 'en');
        setUiLang(next.uiLang ?? 'en');
        setStatus(next.apiKeyConfigured ? 'API key saved.' : 'No API key saved.');
    }
    useEffect(() => {
        void loadSettings();
    }, []);
    async function saveSettings(input = {}) {
        setSaving(true);
        try {
            const next = await window.ourCompanion.ai.updateSettings({
                model,
                endpoint,
                apiKey: apiKey.trim() || undefined,
                replyLanguage: replyLang,
                uiLang,
                ...input
            });
            setSettings(next);
            setModel(next.model);
            setEndpoint(next.endpoint);
            setApiKey('');
            onLangChange(uiLang);
            setStatus(next.apiKeyConfigured ? 'Saved. API key is configured.' : 'Saved. No API key configured.');
        }
        catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to save settings.');
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsx(NotebookPage, { eyebrow: t(lang, 'settings_eyebrow'), title: t(lang, 'settings_title'), note: t(lang, 'settings_note'), children: _jsxs("div", { className: "settings-layout", children: [_jsx(PaperCard, { title: t(lang, 'settings_ann_behavior_title'), tape: true, children: _jsx("p", { children: t(lang, 'settings_ann_behavior_desc') }) }), _jsx(PaperCard, { title: t(lang, 'settings_appearance_title'), tape: true, children: _jsx("p", { children: t(lang, 'settings_appearance_desc') }) }), _jsx(PaperCard, { title: t(lang, 'settings_privacy_title'), tape: true, children: _jsx("p", { children: t(lang, 'settings_privacy_desc') }) }), _jsx(VoiceSettingsCard, {}), _jsx(ActionPermissionsCard, {}), _jsxs(PaperCard, { title: t(lang, 'settings_ai_title'), tape: true, className: "settings-panel", children: [_jsx("h2", { children: t(lang, 'settings_ai_provider') }), _jsxs("label", { children: [_jsx("span", { children: t(lang, 'settings_ai_model_label') }), _jsx("input", { value: model, onChange: (event) => setModel(event.target.value), placeholder: "deepseek-v4-flash" })] }), _jsxs("label", { children: [_jsx("span", { children: t(lang, 'settings_ai_endpoint_label') }), _jsx("input", { value: endpoint, onChange: (event) => setEndpoint(event.target.value), placeholder: "https://api.deepseek.com" })] }), _jsxs("label", { children: [_jsx("span", { children: t(lang, 'settings_ai_apikey_label') }), _jsx("input", { type: "password", value: apiKey, onChange: (event) => setApiKey(event.target.value), placeholder: settings?.apiKeyConfigured ? t(lang, 'settings_ai_apikey_placeholder_configured') : t(lang, 'settings_ai_apikey_placeholder_empty') })] }), _jsxs("label", { children: [_jsx("span", { children: t(lang, 'settings_reply_lang_label') }), _jsxs("select", { value: replyLang, onChange: (e) => setReplyLang(e.target.value), children: [_jsx("option", { value: "en", children: t(lang, 'lang_en') }), _jsx("option", { value: "zh-CN", children: t(lang, 'lang_zh_cn') })] })] }), _jsxs("label", { children: [_jsx("span", { children: t(lang, 'settings_ui_lang_label') }), _jsxs("select", { value: uiLang, onChange: (e) => setUiLang(e.target.value), children: [_jsx("option", { value: "en", children: t(lang, 'lang_en') }), _jsx("option", { value: "zh-CN", children: t(lang, 'lang_zh_cn') })] })] }), _jsxs("div", { className: "action-row", children: [_jsx("button", { onClick: () => void saveSettings(), disabled: saving, children: saving ? t(lang, 'settings_saving') : t(lang, 'settings_save') }), _jsx("button", { onClick: () => void saveSettings({ clearApiKey: true }), disabled: saving, children: t(lang, 'settings_clear_apikey') })] }), _jsx("p", { children: status })] }), _jsxs(PaperCard, { title: t(lang, 'settings_developer_title'), tape: true, className: "developer-card", children: [_jsx("button", { onClick: () => setDeveloperOpen((open) => !open), children: developerOpen ? t(lang, 'settings_developer_hide') : t(lang, 'settings_developer_show') }), developerOpen && (_jsx(DeveloperPreview, { state: previewState, devAnimation: devAnimation, animationOverride: animationOverride, onAnimationChange: setDevAnimation, settings: behaviorSettings, onRefresh: onRefresh }))] })] }) }));
}
function VoiceSettingsCard() {
    const lang = useLang();
    const [speechStatus, setSpeechStatus] = useState();
    const [speechSettings, setSpeechSettings] = useState({ useGpu: false });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settingsMessage, setSettingsMessage] = useState('');
    async function refreshStatus() {
        setLoading(true);
        try {
            const [nextStatus, nextSettings] = await Promise.all([
                window.ourCompanion.speech.getStatus(),
                window.ourCompanion.speech.getSettings()
            ]);
            setSpeechStatus(nextStatus);
            setSpeechSettings(nextSettings);
        }
        catch (error) {
            setSpeechStatus({
                ready: false,
                model: 'ggml-small.bin',
                error: error instanceof Error ? error.message : 'Unable to read Whisper status.'
            });
        }
        finally {
            setLoading(false);
        }
    }
    async function saveSpeechSettings(input) {
        setSaving(true);
        setSettingsMessage('');
        try {
            const next = await window.ourCompanion.speech.updateSettings(input);
            setSpeechSettings(next);
            setSettingsMessage(t(lang, 'voice_settings_saved'));
        }
        catch (error) {
            setSettingsMessage(error instanceof Error ? error.message : t(lang, 'voice_settings_save_failed'));
        }
        finally {
            setSaving(false);
        }
    }
    useEffect(() => {
        void refreshStatus();
    }, []);
    return (_jsxs(PaperCard, { title: t(lang, 'voice_title'), tape: true, className: "settings-panel", children: [_jsx("p", { children: "Talk to Ann on the desktop companion with double-click or Ctrl+Shift+Space. Replies appear word-by-word in her speech bubble." }), _jsxs("p", { children: [_jsx("strong", { children: "Hotkey:" }), " Ctrl+Shift+Space"] }), _jsxs("p", { children: [_jsx("strong", { children: "Whisper model:" }), " ", speechStatus?.model ?? 'ggml-small.bin'] }), _jsxs("p", { children: [_jsx("strong", { children: "Status:" }), ' ', loading
                        ? t(lang, 'voice_download_checking')
                        : speechStatus?.ready
                            ? t(lang, 'voice_status_ready')
                            : speechStatus?.error] }), _jsxs("label", { className: "checkbox-row", children: [_jsx("input", { type: "checkbox", checked: speechSettings.useGpu, disabled: saving, onChange: (event) => void saveSpeechSettings({ useGpu: event.target.checked }) }), _jsx("span", { children: t(lang, 'voice_use_gpu_label') })] }), _jsx("p", { children: t(lang, 'voice_use_gpu_hint') }), _jsx("div", { className: "action-row", children: _jsx("button", { onClick: () => void refreshStatus(), disabled: loading, children: loading ? t(lang, 'voice_download_checking') : t(lang, 'voice_refresh') }) }), settingsMessage && _jsx("p", { children: settingsMessage }), !loading && !speechStatus?.ready && (_jsx("p", { children: t(lang, 'voice_download_hint') }))] }));
}
const ALL_PERMISSION_SCOPES = ['browser', 'automation', 'files', 'clipboard', 'calendar'];
function ActionPermissionsCard() {
    const [permissions, setPermissions] = useState();
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        void window.ourCompanion.action.getPermissions().then(setPermissions);
    }, []);
    async function update(scope, value) {
        if (!permissions)
            return;
        setSaving(true);
        try {
            const next = { ...permissions, [scope]: value };
            const saved = await window.ourCompanion.action.updatePermissions(next);
            setPermissions(saved);
        }
        finally {
            setSaving(false);
        }
    }
    if (!permissions)
        return null;
    return (_jsxs(PaperCard, { title: "Action Permissions", tape: true, className: "settings-panel", children: [_jsx("p", { children: "Control what Ann is allowed to do when you ask her to perform desktop actions." }), ALL_PERMISSION_SCOPES.map((scope) => (_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }, children: [_jsx("span", { style: { flex: 1, textTransform: 'capitalize' }, children: scope }), _jsxs("select", { value: permissions[scope], disabled: saving, onChange: (e) => void update(scope, e.target.value), children: [_jsx("option", { value: "ask", children: "Ask each time" }), _jsx("option", { value: "granted", children: "Always allow" }), _jsx("option", { value: "denied", children: "Always deny" })] })] }, scope)))] }));
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
function NotebookChatBubble({ speaker, time, meta, children }) {
    return (_jsxs("div", { className: `notebook-chat-bubble ${speaker}`, children: [_jsx("p", { children: children }), _jsxs("span", { className: "bubble-footer", children: [meta && _jsx("span", { className: "bubble-meta", children: meta }), time] })] }));
}
function MiniAnnSticker() {
    return (_jsxs("div", { className: "mini-ann-sticker", "aria-hidden": "true", children: [_jsx("span", { className: "mini-ann-hair" }), _jsx("span", { className: "mini-ann-face" }), _jsx("span", { className: "mini-ann-eye left" }), _jsx("span", { className: "mini-ann-eye right" }), _jsx("span", { className: "mini-ann-body" })] }));
}
function ProgressBar({ value, label }) {
    return (_jsxs("div", { className: "progress-row", children: [_jsx("span", { className: "progress-track", children: _jsx("span", { style: { width: `${clamp(value, 0, 100)}%` } }) }), _jsx("strong", { children: label })] }));
}
function DebugAiLog() {
    const [log, setLog] = useState([]);
    const [expanded, setExpanded] = useState(null);
    const [loading, setLoading] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const entries = await window.ourCompanion.ai.getDebugLog();
            setLog(entries);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    return (_jsxs("div", { className: "debug-ai-log", children: [_jsxs("div", { className: "debug-ai-log-header", children: [_jsx("span", { className: "debug-ai-log-title", children: "AI Request / Response Log" }), _jsxs("span", { className: "debug-ai-log-count", children: [log.length, " calls"] }), _jsx("button", { className: "debug-ai-log-refresh", onClick: load, disabled: loading, children: loading ? 'Loading…' : 'Refresh' })] }), log.length === 0 ? (_jsx("p", { className: "debug-ai-log-empty", children: "No AI calls recorded yet." })) : (_jsx("div", { className: "debug-ai-log-list", children: log.map((entry) => (_jsxs("div", { className: "debug-ai-log-entry", children: [_jsxs("button", { className: "debug-ai-log-summary", onClick: () => setExpanded(expanded === entry.id ? null : entry.id), "aria-expanded": expanded === entry.id, children: [_jsx("span", { className: `debug-channel-badge debug-channel-${entry.channel}`, children: entry.channel }), _jsx("span", { className: `debug-status-badge debug-status-${entry.status}`, children: entry.status }), _jsx("span", { className: "debug-source-badge", children: entry.source }), _jsx("span", { className: "debug-ai-log-time", children: new Date(entry.createdAt).toLocaleTimeString() }), _jsx("span", { className: "debug-ai-log-preview", children: debugPreview(entry) }), _jsx("span", { className: "debug-ai-log-chevron", children: expanded === entry.id ? '▲' : '▼' })] }), expanded === entry.id && (_jsxs("div", { className: "debug-ai-log-detail", children: [_jsx(DebugJsonBlock, { title: "Request body", value: entry.requestBody ?? { messages: entry.requestMessages } }), _jsx(DebugTextBlock, { title: "Response content", value: entry.content || '(empty)' }), entry.rawResponse !== undefined && _jsx(DebugJsonBlock, { title: "Raw response", value: entry.rawResponse }), entry.error && _jsx(DebugTextBlock, { title: "Error", value: entry.error, tone: "error" })] }))] }, entry.id))) }))] }));
}
const debugResetOptions = [
    { target: 'discoveries', label: 'Clear discoveries', detail: 'Discovery feed and announced discovery markers.' },
    { target: 'memory', label: 'Clear memory', detail: 'Memory nodes and memory edges.' },
    { target: 'journeys', label: 'Clear journeys', detail: 'Journeys and journey milestones.' },
    { target: 'diary', label: 'Clear diary', detail: 'Diary entries only.' },
    { target: 'chat', label: 'Clear chat', detail: 'Companion conversation messages.' },
    { target: 'autonomy', label: 'Clear autonomy', detail: 'Exploration cycles, events, insights, candidates, patterns, and interest graph.' },
    { target: 'all_debug_data', label: 'Clear all debug data', detail: 'All groups above. Character, settings, and API key stay untouched.' }
];
function DebugDataResetPanel({ onRefresh }) {
    const [pendingTarget, setPendingTarget] = useState(null);
    const [resetting, setResetting] = useState(false);
    const [status, setStatus] = useState('No reset run yet.');
    async function resetTarget(target) {
        setResetting(true);
        setStatus('Clearing data...');
        try {
            const result = await window.ourCompanion.debug.resetData({ targets: [target] });
            await onRefresh();
            setStatus(`Cleared ${result.clearedTables.length} table groups at ${new Date(result.completedAt).toLocaleTimeString()}.`);
            setPendingTarget(null);
        }
        catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to clear data.');
        }
        finally {
            setResetting(false);
        }
    }
    return (_jsxs("div", { className: "debug-reset-panel", children: [_jsxs("div", { className: "debug-reset-header", children: [_jsx("span", { className: "debug-ai-log-title", children: "Database Reset Tools" }), _jsx("span", { className: "debug-reset-status", children: status })] }), _jsx("div", { className: "debug-reset-grid", children: debugResetOptions.map((option) => (_jsxs("div", { className: "debug-reset-item", children: [_jsxs("div", { children: [_jsx("strong", { children: option.label }), _jsx("span", { children: option.detail })] }), pendingTarget === option.target ? (_jsxs("div", { className: "debug-reset-confirm", children: [_jsx("button", { className: option.target === 'all_debug_data' ? 'debug-reset-danger' : '', onClick: () => void resetTarget(option.target), disabled: resetting, children: "Confirm" }), _jsx("button", { onClick: () => setPendingTarget(null), disabled: resetting, children: "Cancel" })] })) : (_jsx("button", { className: option.target === 'all_debug_data' ? 'debug-reset-danger' : '', onClick: () => setPendingTarget(option.target), disabled: resetting, children: "Clear" }))] }, option.target))) })] }));
}
function DebugAudioTestPanel() {
    const [recording, setRecording] = useState(false);
    const [testing, setTesting] = useState(false);
    const [status, setStatus] = useState('Ready.');
    const [result, setResult] = useState({});
    const audio = useAudioCapture({
        silenceDurationMs: 120000,
        onError: (message) => {
            setStatus(message);
            setResult({ error: message });
            setRecording(false);
            setTesting(false);
        }
    });
    async function startTest() {
        setResult({});
        setStatus('Requesting microphone...');
        const started = await audio.startRecording();
        setRecording(started);
        setStatus(started ? 'Recording test audio...' : 'Microphone was not started.');
    }
    async function stopAndTranscribe() {
        setTesting(true);
        setStatus('Stopping recording...');
        try {
            const captured = await audio.stopRecording();
            setRecording(false);
            if (!captured || captured.blob.size === 0) {
                setResult({ error: 'No audio was captured.' });
                setStatus('No audio was captured.');
                return;
            }
            if (captured.durationMs < 500) {
                setResult({
                    error: 'Recording was too short to transcribe.',
                    size: captured.blob.size,
                    durationMs: captured.durationMs,
                    mimeType: captured.mimeType
                });
                setStatus('Recording too short.');
                return;
            }
            setStatus('Transcribing test audio...');
            const buffer = await captured.blob.arrayBuffer();
            const transcribed = await window.ourCompanion.speech.transcribe({
                audio: buffer,
                mimeType: captured.mimeType
            });
            setResult({
                text: transcribed.text,
                language: transcribed.language,
                size: captured.blob.size,
                durationMs: captured.durationMs,
                mimeType: captured.mimeType
            });
            setStatus('Transcription complete.');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to transcribe test audio.';
            setResult({ error: message });
            setStatus('Transcription failed.');
        }
        finally {
            setTesting(false);
        }
    }
    return (_jsxs("div", { className: "debug-audio-panel", children: [_jsxs("div", { className: "debug-reset-header", children: [_jsx("span", { className: "debug-ai-log-title", children: "Audio Transcription Test" }), _jsx("span", { className: "debug-reset-status", children: status })] }), _jsxs("div", { className: "debug-audio-actions", children: [_jsx("button", { onClick: () => void startTest(), disabled: recording || testing, children: "Start recording" }), _jsx("button", { onClick: () => void stopAndTranscribe(), disabled: !recording || testing, children: testing ? 'Testing...' : 'Stop & transcribe' })] }), (result.text || result.error || result.size) && (_jsxs("div", { className: "debug-audio-result", children: [result.size !== undefined && (_jsxs("span", { children: [result.mimeType ?? 'audio', " \u00B7 ", Math.round(result.size / 1024), " KB \u00B7 ", formatDuration(result.durationMs), " \u00B7 language", ' ', result.language ?? 'auto'] })), result.text && _jsx("pre", { children: result.text }), result.error && _jsx("pre", { className: "debug-audio-error", children: result.error })] }))] }));
}
function DebugJsonBlock({ title, value }) {
    return (_jsxs("div", { className: "debug-ai-log-block", children: [_jsx("span", { children: title }), _jsx("pre", { className: "debug-ai-log-raw", children: formatJson(value) })] }));
}
function DebugTextBlock({ title, value, tone }) {
    return (_jsxs("div", { className: `debug-ai-log-block ${tone === 'error' ? 'debug-ai-log-block-error' : ''}`, children: [_jsx("span", { children: title }), _jsx("pre", { className: "debug-ai-log-raw", children: value })] }));
}
function debugPreview(entry) {
    const text = entry.error || entry.content || `${entry.requestMessages.length} prompt messages`;
    return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}
function formatJson(value) {
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
function formatDuration(durationMs) {
    if (durationMs === undefined)
        return '0.0s';
    return `${(durationMs / 1000).toFixed(1)}s`;
}
function DeveloperPreview({ state, devAnimation, animationOverride, onAnimationChange, settings, onRefresh }) {
    return (_jsxs("div", { className: "developer-tools", children: [_jsx("div", { className: "developer-preview-canvas", children: _jsx(CompanionCanvas, { state: state, compact: true, animationOverride: animationOverride }) }), _jsxs("div", { className: "dev-animation-panel", children: [_jsx("p", { className: "eyebrow", children: "Developer use" }), _jsx("h2", { children: "Animation review" }), _jsx("div", { className: "segmented-control", "aria-label": "Preview Ann animation", children: devAnimations.map((animation) => (_jsx("button", { className: devAnimation === animation ? 'active' : '', onClick: () => onAnimationChange(animation), children: animation === 'live' ? 'Live' : readable(animation) }, animation))) }), _jsxs("p", { children: ["Previewing: ", devAnimation === 'live' ? 'engine state' : readable(devAnimation)] })] }), _jsx(BehaviorPanel, { settings: settings, onRefresh: onRefresh }), _jsx(DebugAudioTestPanel, {}), _jsx(DebugAiLog, {}), _jsx(DebugDataResetPanel, { onRefresh: onRefresh })] }));
}
function tabLabel(tab, lang) {
    const map = {
        home: t(lang, 'tab_home'),
        discovery: t(lang, 'tab_discovery'),
        journey: t(lang, 'tab_journey'),
        memory: t(lang, 'tab_memory'),
        chat: t(lang, 'tab_chat'),
        ask: t(lang, 'tab_ask'),
        settings: t(lang, 'tab_settings')
    };
    return map[tab];
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
    if ('planId' in result) {
        if (result.status === 'completed')
            return `Done — completed ${result.performedSteps} step(s).`;
        if (result.status === 'blocked')
            return `I can't do that: ${result.reason}`;
        if (result.status === 'failed')
            return `Something went wrong: ${result.errorMessage}`;
        if (result.status === 'await_permission')
            return `Permission needed for: ${result.requiredScopes.join(', ')}`;
    }
    if ('errorMessage' in result && result.errorMessage)
        return result.errorMessage;
    if ('userFacingSummary' in result)
        return result.userFacingSummary;
    return 'Done.';
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
