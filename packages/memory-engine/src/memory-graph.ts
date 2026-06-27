import type { MemoryRecord, MemoryRelation, MemoryEdge, KnowledgeGraph } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export function buildMemoryGraph(memories: MemoryRecord[]): KnowledgeGraph {
  const nodes = memories.map((memory) => ({
    id: memory.id,
    kind: 'experience' as const,
    title: memory.content.slice(0, 80),
  }));

  const edges: KnowledgeGraph['edges'] = [];

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const memoryA = memories[i];
      const memoryB = memories[j];

      const sharedTags = memoryA.tags.filter((tag) => memoryB.tags.includes(tag));
      const sharedEntities = memoryA.entities.filter((entity) => memoryB.entities.includes(entity));

      if (sharedTags.length > 0 || sharedEntities.length > 0) {
        const confidence = Math.min(1, (sharedTags.length + sharedEntities.length) * 0.2 + 0.3);
        edges.push({
          id: createId('knowledge_edge'),
          fromId: memoryA.id,
          toId: memoryB.id,
          type: 'related_to',
          confidence,
        });
      }
    }
  }

  return { nodes, edges };
}

export function createMemoryEdgeFromRecords(
  from: MemoryRecord,
  to: MemoryRecord,
  relation: MemoryRelation,
  confidence = 0.8
): MemoryEdge {
  return {
    id: createId('edge'),
    fromNodeId: from.id,
    toNodeId: to.id,
    relationType: relation,
    confidence,
    createdAt: nowIso(),
  };
}
