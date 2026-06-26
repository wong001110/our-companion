import { createId, nowIso } from '@our-companion/shared';
export function createMemoryNode(input) {
    const timestamp = nowIso();
    return {
        id: createId('mem'),
        type: input.type,
        title: input.title,
        summary: input.summary,
        content: input.content,
        importanceScore: input.type === 'decision' || input.type === 'outcome' ? 75 : 50,
        source: input.source,
        sourceUrl: input.sourceUrl,
        isPinned: false,
        isMarkedWrong: false,
        createdAt: timestamp,
        updatedAt: timestamp
    };
}
export function updateMemoryNode(existing, input) {
    return {
        ...existing,
        ...input,
        id: existing.id,
        updatedAt: nowIso()
    };
}
export function createMemoryEdge(input) {
    return {
        id: createId('edge'),
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        relationType: input.relationType,
        confidence: input.confidence ?? 0.8,
        createdAt: nowIso()
    };
}
export function searchMemory(nodes, query) {
    const lowered = query.toLowerCase();
    return nodes.filter((node) => [node.title, node.summary, node.content, node.source]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(lowered)));
}
export function graphFromMemory(nodes, edges, query) {
    const filteredNodes = query ? searchMemory(nodes, query) : nodes;
    const nodeIds = new Set(filteredNodes.map((node) => node.id));
    return {
        nodes: filteredNodes,
        edges: edges.filter((edge) => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId))
    };
}
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.min(1, Math.max(0, value));
}
function interestTypeFromMemory(type) {
    if (type === 'decision' || type === 'outcome')
        return 'problem';
    if (type === 'resource')
        return 'technology';
    if (type === 'question')
        return 'question';
    if (type === 'discovery')
        return 'topic';
    return 'theme';
}
function normalizeLabel(value) {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 80);
}
export function conceptKey(value) {
    return value
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8)
        .join('-');
}
export function createConcept(input) {
    const timestamp = nowIso();
    const name = normalizeLabel(input.name);
    return {
        id: createId('concept'),
        key: conceptKey(name),
        name,
        summary: input.summary ?? name,
        topics: input.topics ?? [],
        entities: input.entities ?? [],
        relatedDiscoveryIds: input.discoveryId ? [input.discoveryId] : [],
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        strength: 1,
        status: 'active'
    };
}
export function matchConcept(input, existing) {
    const key = conceptKey(input.name);
    const inputTopics = new Set((input.topics ?? []).map((topic) => topic.toLowerCase()));
    const matched = existing.find((concept) => {
        if (concept.key === key)
            return true;
        const overlap = concept.topics.filter((topic) => inputTopics.has(topic.toLowerCase())).length;
        return inputTopics.size > 0 && overlap >= Math.min(2, inputTopics.size);
    });
    if (!matched) {
        return { type: 'created', concept: createConcept(input) };
    }
    const topicSet = new Set([...matched.topics, ...(input.topics ?? [])]);
    const entitySet = new Set([...matched.entities, ...(input.entities ?? [])]);
    const discoverySet = new Set([...matched.relatedDiscoveryIds, ...(input.discoveryId ? [input.discoveryId] : [])]);
    return {
        type: 'matched',
        concept: {
            ...matched,
            summary: input.summary ?? matched.summary,
            topics: [...topicSet],
            entities: [...entitySet],
            relatedDiscoveryIds: [...discoverySet],
            lastSeenAt: nowIso(),
            strength: Math.min(100, matched.strength + 1),
            status: 'active'
        }
    };
}
export function createKnowledgeFromInsight(input) {
    const timestamp = nowIso();
    return {
        id: createId('knowledge'),
        title: input.title ?? input.insight.title,
        summary: input.insight.explanation,
        conceptIds: input.insight.relatedConceptIds,
        insightIds: [input.insight.id],
        journeyIds: input.journeyId ? [input.journeyId] : [],
        experienceIds: [],
        references: [
            {
                id: input.insight.id,
                kind: 'insight',
                title: input.insight.title,
                summary: input.insight.explanation
            },
            ...(input.concepts ?? []).map((concept) => ({
                id: concept.id,
                kind: 'concept',
                title: concept.name,
                summary: concept.summary
            }))
        ],
        confidence: input.insight.confidence,
        strength: Math.max(1, Math.round(input.insight.growthValue / 20)),
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp
    };
}
export function buildKnowledgeGraph(knowledge) {
    const nodes = new Map();
    const edges = [];
    for (const item of knowledge) {
        nodes.set(item.id, { id: item.id, kind: 'knowledge', title: item.title });
        for (const reference of item.references) {
            nodes.set(reference.id, { id: reference.id, kind: reference.kind, title: reference.title });
            edges.push({
                id: createId('knowledge_edge'),
                fromId: item.id,
                toId: reference.id,
                type: reference.kind === 'insight' ? 'derived_from' : 'related_to',
                confidence: item.confidence
            });
        }
    }
    return { nodes: [...nodes.values()], edges };
}
export function archiveKnowledge(knowledge, reason = 'Inactive knowledge cooled down.') {
    return {
        ...knowledge,
        status: 'archived',
        summary: `${knowledge.summary}\n\nArchive note: ${reason}`,
        archivedAt: nowIso(),
        updatedAt: nowIso()
    };
}
export function restoreKnowledge(knowledge) {
    return {
        ...knowledge,
        status: 'active',
        revivedAt: nowIso(),
        updatedAt: nowIso()
    };
}
export function reviveConcept(concept, reason) {
    return {
        ...concept,
        status: 'active',
        summary: `${concept.summary}\nRevived: ${reason}`,
        lastSeenAt: nowIso(),
        strength: Math.max(concept.strength + 1, 2)
    };
}
export function decayConcept(concept, inactiveDays) {
    if (inactiveDays >= 60)
        return { ...concept, status: 'archived', strength: Math.max(0, concept.strength - 2) };
    if (inactiveDays >= 21)
        return { ...concept, status: 'dormant', strength: Math.max(0, concept.strength - 1) };
    return concept;
}
export function retrieveKnowledge(input) {
    const lowered = input.query.toLowerCase();
    const conceptSet = new Set(input.currentConceptIds ?? []);
    return [...input.knowledge]
        .map((item) => {
        const textScore = `${item.title} ${item.summary}`.toLowerCase().includes(lowered) ? 2 : 0;
        const journeyScore = input.activeJourneyId && item.journeyIds.includes(input.activeJourneyId) ? 2 : 0;
        const conceptScore = item.conceptIds.some((id) => conceptSet.has(id)) ? 2 : 0;
        const activeScore = item.status === 'active' ? 1 : 0;
        return { item, score: textScore + journeyScore + conceptScore + activeScore + item.strength / 10 };
    })
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, input.limit ?? 10)
        .map((entry) => entry.item);
}
function addNode(nodes, node) {
    const key = node.label.toLowerCase();
    const existing = nodes.get(key);
    const timestamp = nowIso();
    if (existing) {
        nodes.set(key, {
            ...existing,
            weight: clamp01(Math.max(existing.weight, node.weight)),
            confidence: clamp01(Math.max(existing.confidence, node.confidence)),
            freshness: clamp01(Math.max(existing.freshness, node.freshness)),
            updatedAt: timestamp
        });
        return;
    }
    nodes.set(key, {
        ...node,
        id: node.id ?? createId('interest'),
        createdAt: timestamp,
        updatedAt: timestamp
    });
}
export function buildInterestGraph(input) {
    const nodes = new Map();
    const edges = [];
    for (const memory of input.memoryNodes.filter((node) => !node.isMarkedWrong)) {
        const label = normalizeLabel(memory.title);
        if (!label)
            continue;
        addNode(nodes, {
            userId: input.userId,
            label,
            description: memory.summary ?? memory.content,
            type: interestTypeFromMemory(memory.type),
            weight: clamp01(memory.importanceScore / 100),
            confidence: memory.isPinned ? 0.9 : 0.7,
            freshness: 0.85,
            source: 'memory'
        });
    }
    for (const pattern of input.patterns) {
        addNode(nodes, {
            userId: input.userId,
            label: normalizeLabel(pattern.title),
            description: pattern.summary,
            type: pattern.type === 'technical_preference' ? 'technology' : pattern.type === 'aesthetic_preference' ? 'aesthetic' : 'theme',
            weight: pattern.strength,
            confidence: pattern.confidence,
            freshness: pattern.freshness,
            source: 'pattern'
        });
    }
    for (const discovery of input.discoveries) {
        const feedbackBoost = discovery.status === 'saved' ? 0.2 : discovery.status === 'rejected' ? -0.25 : 0;
        addNode(nodes, {
            userId: input.userId,
            label: normalizeLabel(discovery.title),
            description: discovery.summary,
            type: discovery.source === 'github' ? 'technology' : 'topic',
            weight: clamp01(discovery.finalScore / 100 + feedbackBoost),
            confidence: discovery.status === 'saved' ? 0.85 : 0.6,
            freshness: discovery.status === 'rejected' ? 0.35 : 0.7,
            source: 'discovery'
        });
    }
    const sorted = [...nodes.values()].sort((left, right) => right.weight - left.weight);
    for (let index = 0; index < sorted.length - 1 && index < 8; index += 1) {
        const current = sorted[index];
        const next = sorted[index + 1];
        edges.push({
            id: createId('interest_edge'),
            userId: input.userId,
            fromNodeId: current.id,
            toNodeId: next.id,
            relation: index === 0 ? 'frequently_appears_with' : 'adjacent_to',
            weight: clamp01((current.weight + next.weight) / 2),
            confidence: clamp01((current.confidence + next.confidence) / 2),
            createdAt: nowIso()
        });
    }
    const dismissedNotes = input.feedback.filter((item) => item.value === 'not_interested').map((item) => item.note).filter(Boolean);
    const recommendedExpansionPaths = sorted.slice(0, 4).map((node, index) => {
        const peer = sorted[index + 1];
        return peer ? [node.label, peer.label] : [node.label];
    });
    if (dismissedNotes.length > 0) {
        recommendedExpansionPaths.push(['Avoid recently dismissed topics']);
    }
    return {
        userId: input.userId,
        nodes: sorted,
        edges,
        recommendedExpansionPaths,
        updatedAt: nowIso()
    };
}
