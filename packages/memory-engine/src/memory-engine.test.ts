import { describe, expect, it } from 'vitest';
import {
  buildInterestGraph,
  createMemoryEdge,
  createMemoryNode,
  graphFromMemory,
  updateMemoryNode,
} from './index';

describe('memory engine', () => {
  it('creates normalized memory nodes and graph edges', () => {
    const first = createMemoryNode({ type: 'topic', title: 'PixiJS' });
    const second = createMemoryNode({ type: 'resource', title: 'Sprite guide' });
    const edge = createMemoryEdge({ fromNodeId: first.id, toNodeId: second.id, relationType: 'related_to' });

    expect(first.importance).toBe(0.5);
    expect(graphFromMemory([first, second], [edge])).toMatchObject({
      nodes: [first, second],
      edges: [edge],
    });
  });

  it('updates a memory without changing its identity', () => {
    const node = createMemoryNode({ type: 'decision', title: 'Old note' });
    const updated = updateMemoryNode(node, { id: node.id, isMarkedWrong: true });
    expect(updated.id).toBe(node.id);
    expect(updated.importance).toBe(0.75);
    expect(updated.isMarkedWrong).toBe(true);
  });

  it('builds an interest graph using normalized importance', () => {
    const graph = buildInterestGraph({
      userId: 'default',
      memoryNodes: [createMemoryNode({ type: 'topic', title: 'Companion presence' })],
      patterns: [],
      discoveries: [],
      feedback: [],
    });
    expect(graph.nodes[0]?.weight).toBe(0.5);
  });
});
