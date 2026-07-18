import type {
  CreateMemoryEdgeInput,
  CreateMemoryNodeInput,
  Discovery,
  DiscoveryFeedback,
  InterestEdge,
  InterestGraph,
  InterestNode,
  InterestNodeType,
  MemoryEdge,
  MemoryGraph,
  MemoryNode,
  Pattern,
  UpdateMemoryNodeInput
} from '@our-companion/shared';
import { clamp01, createId, createSemanticFingerprint, nowIso } from '@our-companion/shared';

export function createMemoryNode(input: CreateMemoryNodeInput): MemoryNode {
  const timestamp = nowIso();
  return {
    id: createId('mem'),
    companionId: input.companionId,
    type: input.type,
    title: input.title,
    summary: input.summary,
    content: input.content,
    importance: input.type === 'decision' || input.type === 'outcome' ? 0.75 : 0.5,
    source: input.source,
    sourceUrl: input.sourceUrl,
    isPinned: false,
    isMarkedWrong: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function updateMemoryNode(existing: MemoryNode, input: UpdateMemoryNodeInput): MemoryNode {
  return {
    ...existing,
    ...input,
    id: existing.id,
    updatedAt: nowIso()
  };
}

export function createMemoryEdge(input: CreateMemoryEdgeInput): MemoryEdge {
  return {
    id: createId('edge'),
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    relationType: input.relationType,
    confidence: input.confidence ?? 0.8,
    createdAt: nowIso()
  };
}

export function searchMemory(nodes: MemoryNode[], query: string): MemoryNode[] {
  const lowered = query.toLowerCase();
  return nodes.filter((node) =>
    [node.title, node.summary, node.content, node.source]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lowered))
  );
}

export function graphFromMemory(nodes: MemoryNode[], edges: MemoryEdge[], query?: string): MemoryGraph {
  const filteredNodes = query ? searchMemory(nodes, query) : nodes;
  const nodeIds = new Set(filteredNodes.map((node) => node.id));
  return {
    nodes: filteredNodes,
    edges: edges.filter((edge) => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId))
  };
}

export interface BuildInterestGraphInput {
  userId: string;
  memoryNodes: MemoryNode[];
  patterns: Pattern[];
  discoveries: Discovery[];
  feedback: DiscoveryFeedback[];
}

function interestTypeFromMemory(type: MemoryNode['type']): InterestNodeType {
  if (type === 'decision' || type === 'outcome') return 'problem';
  if (type === 'resource') return 'technology';
  if (type === 'question') return 'question';
  if (type === 'discovery') return 'topic';
  return 'theme';
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

 function addNode(nodes: Map<string, InterestNode>, node: Omit<InterestNode, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
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
    id: node.id ?? createSemanticFingerprint('interest', [node.userId, node.type, key]),
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function buildInterestGraph(input: BuildInterestGraphInput): InterestGraph {
  const nodes = new Map<string, InterestNode>();
  const edges: InterestEdge[] = [];

  for (const memory of input.memoryNodes.filter((node) => !node.isMarkedWrong)) {
    const label = normalizeLabel(memory.title);
    if (!label) continue;
    addNode(nodes, {
      userId: input.userId,
      label,
      description: memory.summary ?? memory.content,
      type: interestTypeFromMemory(memory.type),
      weight: memory.importance,
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
      weight: clamp01(discovery.finalScore + feedbackBoost),
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
      id: createSemanticFingerprint('interest_edge', [input.userId, current.id, next.id, index === 0 ? 'frequently_appears_with' : 'adjacent_to']),
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
