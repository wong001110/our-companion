import { describe, expect, it } from 'vitest';
import { createMemoryEdge, createMemoryNode, graphFromMemory, updateMemoryNode } from './index';

describe('memory engine', () => {
  it('creates editable graph nodes and edges', () => {
    const first = createMemoryNode({ type: 'topic', title: 'PixiJS' });
    const second = createMemoryNode({ type: 'resource', title: 'Sprite guide' });
    const edge = createMemoryEdge({ fromNodeId: first.id, toNodeId: second.id, relationType: 'related_to' });
    const graph = graphFromMemory([first, second], [edge]);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });

  it('marks memory as wrong without deleting it', () => {
    const node = createMemoryNode({ type: 'topic', title: 'Old note' });
    const updated = updateMemoryNode(node, { id: node.id, isMarkedWrong: true });
    expect(updated.isMarkedWrong).toBe(true);
  });
});
