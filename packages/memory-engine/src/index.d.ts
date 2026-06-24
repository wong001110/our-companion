import type { CreateMemoryEdgeInput, CreateMemoryNodeInput, MemoryEdge, MemoryGraph, MemoryNode, UpdateMemoryNodeInput } from '@our-companion/shared';
export declare function createMemoryNode(input: CreateMemoryNodeInput): MemoryNode;
export declare function updateMemoryNode(existing: MemoryNode, input: UpdateMemoryNodeInput): MemoryNode;
export declare function createMemoryEdge(input: CreateMemoryEdgeInput): MemoryEdge;
export declare function searchMemory(nodes: MemoryNode[], query: string): MemoryNode[];
export declare function graphFromMemory(nodes: MemoryNode[], edges: MemoryEdge[], query?: string): MemoryGraph;
