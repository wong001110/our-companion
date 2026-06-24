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
