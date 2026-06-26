import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
const PIPELINE_STEPS = [
    'idle',
    'curious',
    'planning',
    'exploring',
    'collecting',
    'synthesizing',
    'returning',
    'sharing',
    'reflecting'
];
const EVENT_SOURCES = [
    'all',
    'character',
    'curiosity',
    'decision',
    'discovery',
    'action',
    'tool',
    'speech',
    'knowledge',
    'journey',
    'reflection'
];
const EVENT_LOG_MAX = 100;
function formatJson(value) {
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
function eventPreview(event) {
    const payload = event.payload ? JSON.stringify(event.payload) : '';
    const text = `${event.type} ${payload}`;
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}
function topEmotions(emotion) {
    if (!emotion)
        return '—';
    return Object.entries(emotion)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, value]) => `${name} ${value}`)
        .join(', ');
}
export function EngineObservatory() {
    const [events, setEvents] = useState([]);
    const [snapshot, setSnapshot] = useState();
    const [speechStatus, setSpeechStatus] = useState();
    const [sourceFilter, setSourceFilter] = useState('all');
    const [groupByCorrelation, setGroupByCorrelation] = useState(false);
    const [expandedEventId, setExpandedEventId] = useState(null);
    const [expandedPanels, setExpandedPanels] = useState({
        character: true,
        pattern: true,
        interest: false,
        curiosity: true,
        discovery: true,
        insight: true,
        decision: false,
        action: false,
        speech: false,
        society: false
    });
    const [loading, setLoading] = useState(false);
    const loadSnapshot = useCallback(async () => {
        const [nextSnapshot, status] = await Promise.all([
            window.ourCompanion.debug.getEngineSnapshot(),
            window.ourCompanion.speech.getStatus()
        ]);
        setSnapshot(nextSnapshot);
        setSpeechStatus(status);
    }, []);
    const loadEvents = useCallback(async () => {
        const history = await window.ourCompanion.debug.getFoundationLog({ limit: EVENT_LOG_MAX });
        setEvents(history);
    }, []);
    const refreshAll = useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([loadSnapshot(), loadEvents()]);
        }
        finally {
            setLoading(false);
        }
    }, [loadEvents, loadSnapshot]);
    useEffect(() => {
        void refreshAll();
        const unsubscribe = window.ourCompanion.debug.onFoundationEvent((event) => {
            setEvents((current) => [event, ...current].slice(0, EVENT_LOG_MAX));
            if (event.source === 'discovery' || event.source === 'curiosity' || event.source === 'decision') {
                void loadSnapshot();
            }
        });
        return unsubscribe;
    }, [loadSnapshot, refreshAll]);
    const filteredEvents = useMemo(() => {
        return sourceFilter === 'all' ? events : events.filter((event) => event.source === sourceFilter);
    }, [events, sourceFilter]);
    const groupedEvents = useMemo(() => {
        if (!groupByCorrelation) {
            return filteredEvents.map((event) => ({ key: event.id, events: [event] }));
        }
        const groups = new Map();
        for (const event of filteredEvents) {
            const key = event.correlationId ?? event.id;
            const existing = groups.get(key) ?? [];
            existing.push(event);
            groups.set(key, existing);
        }
        return [...groups.entries()].map(([key, groupEvents]) => ({ key, events: groupEvents }));
    }, [filteredEvents, groupByCorrelation]);
    const decisionEvents = useMemo(() => events.filter((event) => event.source === 'decision').slice(0, 12), [events]);
    const actionEvents = useMemo(() => events.filter((event) => event.source === 'action' || event.source === 'tool').slice(0, 12), [events]);
    const speechEvents = useMemo(() => events.filter((event) => event.source === 'speech').slice(0, 8), [events]);
    const activePipelineStep = snapshot?.currentCycle?.state ?? snapshot?.explorationEvents.at(-1)?.state;
    function togglePanel(id) {
        setExpandedPanels((current) => ({ ...current, [id]: !current[id] }));
    }
    return (_jsxs("div", { className: "engine-observatory", children: [_jsxs("div", { className: "engine-observatory-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Developer use" }), _jsx("h2", { children: "Engine Observatory" }), _jsx("p", { className: "engine-observatory-note", children: "Live foundation events and persisted engine artifacts from the cognitive pipeline." })] }), _jsx("button", { className: "debug-ai-log-refresh", onClick: () => void refreshAll(), disabled: loading, children: loading ? 'Refreshing…' : 'Refresh all' })] }), _jsxs("section", { className: "engine-pipeline", children: [_jsx("h3", { children: "Exploration pipeline" }), _jsx("div", { className: "engine-pipeline-steps", "aria-label": "Exploration pipeline states", children: PIPELINE_STEPS.map((step) => (_jsx("span", { className: `engine-pipeline-step ${activePipelineStep === step ? 'active' : ''}`, children: step }, step))) }), snapshot?.explorationEvents.length ? (_jsx("ul", { className: "engine-pipeline-events", children: snapshot.explorationEvents.slice(-8).map((event) => (_jsxs("li", { children: [_jsx("strong", { children: event.state }), " ", event.message] }, event.id))) })) : (_jsx("p", { className: "engine-empty", children: "No exploration events yet. Send Ann exploring to populate this." }))] }), _jsxs("section", { className: "debug-ai-log engine-event-timeline", children: [_jsxs("div", { className: "debug-ai-log-header", children: [_jsx("span", { className: "debug-ai-log-title", children: "Foundation event timeline" }), _jsxs("span", { className: "debug-ai-log-count", children: [filteredEvents.length, " events"] }), _jsxs("label", { className: "engine-filter", children: [_jsx("span", { children: "Source" }), _jsx("select", { value: sourceFilter, onChange: (e) => setSourceFilter(e.target.value), children: EVENT_SOURCES.map((source) => (_jsx("option", { value: source, children: source }, source))) })] }), _jsxs("label", { className: "engine-filter checkbox-row", children: [_jsx("input", { type: "checkbox", checked: groupByCorrelation, onChange: (e) => setGroupByCorrelation(e.target.checked) }), _jsx("span", { children: "Group by correlation" })] })] }), groupedEvents.length === 0 ? (_jsx("p", { className: "debug-ai-log-empty", children: "No foundation events recorded yet." })) : (_jsx("div", { className: "debug-ai-log-list", children: groupedEvents.map((group) => (_jsx("div", { className: "engine-event-group", children: group.events.map((event) => (_jsxs("div", { className: "debug-ai-log-entry", children: [_jsxs("button", { className: "debug-ai-log-summary", onClick: () => setExpandedEventId(expandedEventId === event.id ? null : event.id), "aria-expanded": expandedEventId === event.id, children: [_jsx("span", { className: `debug-source-badge debug-source-${event.source}`, children: event.source }), _jsx("span", { className: "debug-type-badge", children: event.type }), _jsx("span", { className: "debug-ai-log-time", children: new Date(event.timestamp).toLocaleTimeString() }), _jsx("span", { className: "debug-ai-log-preview", children: eventPreview(event) }), _jsx("span", { className: "debug-ai-log-chevron", children: expandedEventId === event.id ? '▲' : '▼' })] }), expandedEventId === event.id && (_jsx("div", { className: "debug-ai-log-detail", children: _jsxs("div", { className: "debug-ai-log-block", children: [_jsx("span", { children: "Event" }), _jsx("pre", { className: "debug-ai-log-raw", children: formatJson(event) })] }) }))] }, event.id))) }, group.key))) }))] }), _jsxs("div", { className: "engine-snapshot-grid", children: [_jsx(SnapshotPanel, { title: "Character", open: expandedPanels.character, onToggle: () => togglePanel('character'), children: snapshot?.characterState ? (_jsxs("ul", { className: "engine-snapshot-list", children: [_jsxs("li", { children: [_jsx("strong", { children: "State" }), " ", snapshot.characterState.coreState, " / ", snapshot.characterState.intent] }), _jsxs("li", { children: [_jsx("strong", { children: "Emotion" }), " ", topEmotions(snapshot.characterState.emotion)] })] })) : (_jsx("p", { className: "engine-empty", children: "No character state." })) }), _jsx(SnapshotPanel, { title: "Pattern", open: expandedPanels.pattern, onToggle: () => togglePanel('pattern'), children: snapshot?.patterns.length ? (_jsx("ul", { className: "engine-snapshot-list", children: snapshot.patterns.map((pattern) => (_jsxs("li", { children: [_jsx("strong", { children: pattern.title }), _jsxs("span", { children: [pattern.type, " \u00B7 strength ", pattern.strength.toFixed(2), " \u00B7 ", pattern.evidence.length, " evidence"] })] }, pattern.id))) })) : (_jsx("p", { className: "engine-empty", children: "No patterns detected yet." })) }), _jsx(SnapshotPanel, { title: "Memory / Interest", open: expandedPanels.interest, onToggle: () => togglePanel('interest'), children: snapshot?.interestGraph.nodes.length ? (_jsxs(_Fragment, { children: [_jsxs("p", { children: [snapshot.interestGraph.nodes.length, " nodes \u00B7 ", snapshot.interestGraph.edges.length, " edges"] }), _jsx("ul", { className: "engine-snapshot-list", children: snapshot.interestGraph.nodes.slice(0, 6).map((node) => (_jsxs("li", { children: [_jsx("strong", { children: node.label }), _jsxs("span", { children: [node.type, " \u00B7 weight ", node.weight.toFixed(2)] })] }, node.id))) }), (snapshot.interestGraph.recommendedExpansionPaths?.length ?? 0) > 0 && (_jsxs("p", { className: "engine-meta", children: ["Paths: ", snapshot.interestGraph.recommendedExpansionPaths?.map((path) => path.join(' → ')).join(' | ')] }))] })) : (_jsx("p", { className: "engine-empty", children: "Interest graph is empty." })) }), _jsx(SnapshotPanel, { title: "Curiosity", open: expandedPanels.curiosity, onToggle: () => togglePanel('curiosity'), children: snapshot?.curiosityTargets.length ? (_jsx("ul", { className: "engine-snapshot-list", children: snapshot.curiosityTargets.map((target) => (_jsxs("li", { children: [_jsx("strong", { children: target.topic }), _jsxs("span", { children: [target.explorationType, " \u00B7 priority ", target.priority.toFixed(2)] }), _jsx("p", { children: target.reason })] }, target.id))) })) : (_jsx("p", { className: "engine-empty", children: "No curiosity targets." })) }), _jsx(SnapshotPanel, { title: "Discovery", open: expandedPanels.discovery, onToggle: () => togglePanel('discovery'), children: snapshot?.discoveryCandidates.length || snapshot?.recentDiscoveries.length ? (_jsxs(_Fragment, { children: [snapshot.discoveryCandidates.length > 0 && (_jsxs(_Fragment, { children: [_jsx("p", { className: "engine-meta", children: "Candidates" }), _jsx("ul", { className: "engine-snapshot-list", children: snapshot.discoveryCandidates.slice(0, 6).map((candidate) => (_jsxs("li", { children: [_jsx("strong", { children: candidate.title }), _jsxs("span", { children: [candidate.agentType, " \u00B7 rel ", candidate.relevanceScore.toFixed(2), " \u00B7 nov", ' ', candidate.noveltyScore.toFixed(2)] })] }, candidate.id))) })] })), snapshot.recentDiscoveries.length > 0 && (_jsxs(_Fragment, { children: [_jsx("p", { className: "engine-meta", children: "Recent feed" }), _jsx("ul", { className: "engine-snapshot-list", children: snapshot.recentDiscoveries.slice(0, 5).map((discovery) => (_jsxs("li", { children: [_jsx("strong", { children: discovery.title }), _jsxs("span", { children: [discovery.source, " \u00B7 score ", discovery.finalScore] })] }, discovery.id))) })] }))] })) : (_jsx("p", { className: "engine-empty", children: "No discovery candidates or feed items." })) }), _jsx(SnapshotPanel, { title: "Insight", open: expandedPanels.insight, onToggle: () => togglePanel('insight'), children: snapshot?.insights.length ? (_jsx("ul", { className: "engine-snapshot-list", children: snapshot.insights.map((insight) => (_jsxs("li", { children: [_jsx("strong", { children: insight.title }), _jsxs("span", { children: [insight.type, " \u00B7 confidence ", insight.confidence.toFixed(2)] }), _jsx("p", { children: insight.narration ?? insight.summary })] }, insight.id))) })) : (_jsx("p", { className: "engine-empty", children: "No companion insights." })) }), _jsx(SnapshotPanel, { title: "Decision", open: expandedPanels.decision, onToggle: () => togglePanel('decision'), children: decisionEvents.length ? (_jsx("ul", { className: "engine-snapshot-list", children: decisionEvents.map((event) => (_jsxs("li", { children: [_jsx("strong", { children: event.type }), _jsx("span", { children: eventPreview(event) })] }, event.id))) })) : (_jsx("p", { className: "engine-empty", children: "No decision events yet. Try discovery refresh." })) }), _jsxs(SnapshotPanel, { title: "Action", open: expandedPanels.action, onToggle: () => togglePanel('action'), children: [_jsxs("p", { className: "engine-meta", children: ["Permissions: browser ", snapshot?.actionPermissions.browser ?? '—', ", automation", ' ', snapshot?.actionPermissions.automation ?? '—'] }), actionEvents.length ? (_jsx("ul", { className: "engine-snapshot-list", children: actionEvents.map((event) => (_jsxs("li", { children: [_jsx("strong", { children: event.type }), _jsx("span", { children: eventPreview(event) })] }, event.id))) })) : (_jsx("p", { className: "engine-empty", children: "No action events yet. Try an Ask tab command." }))] }), _jsxs(SnapshotPanel, { title: "Speech", open: expandedPanels.speech, onToggle: () => togglePanel('speech'), children: [_jsxs("p", { className: "engine-meta", children: ["Whisper: ", speechStatus?.ready ? 'ready' : speechStatus?.error ?? 'checking…'] }), speechEvents.length ? (_jsx("ul", { className: "engine-snapshot-list", children: speechEvents.map((event) => (_jsxs("li", { children: [_jsx("strong", { children: event.type }), _jsx("span", { children: eventPreview(event) })] }, event.id))) })) : (_jsx("p", { className: "engine-empty", children: "No speech events yet." }))] }), _jsx(SnapshotPanel, { title: "Society", open: expandedPanels.society, onToggle: () => togglePanel('society'), children: _jsx("p", { className: "engine-empty", children: "Society engine is not wired into the desktop app in v1." }) })] }), snapshot?.capturedAt && (_jsxs("p", { className: "engine-meta", children: ["Snapshot captured at ", new Date(snapshot.capturedAt).toLocaleString()] }))] }));
}
function SnapshotPanel({ title, open, onToggle, children }) {
    return (_jsxs("section", { className: "engine-snapshot-panel", children: [_jsxs("button", { className: "engine-snapshot-header", onClick: onToggle, "aria-expanded": open, children: [_jsx("strong", { children: title }), _jsx("span", { children: open ? '▲' : '▼' })] }), open && _jsx("div", { className: "engine-snapshot-body", children: children })] }));
}
