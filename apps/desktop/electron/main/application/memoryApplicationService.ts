import type { AppContext } from './appContext';
import type { CreateMemoryNodeInput, CreateMemoryEdgeInput, UpdateMemoryNodeInput } from '@our-companion/shared';
import { createMemoryNode, createMemoryEdge, graphFromMemory, searchMemory, updateMemoryNode as updateMemoryNodePure } from '@our-companion/memory-engine';

export class MemoryApplicationService {
  constructor(private readonly ctx: AppContext) {}

  createNode = async (input: CreateMemoryNodeInput) => this.ctx.db.insertMemoryNode(createMemoryNode(input));
  updateNode = async (input: UpdateMemoryNodeInput) => {
    const existing = this.ctx.db.getMemoryNode(input.id);
    if (!existing) throw new Error(`Memory node not found: ${input.id}`);
    return this.ctx.db.updateMemoryNode(updateMemoryNodePure(existing, input));
  };
  deleteNode = async (id: string) => { this.ctx.db.deleteMemoryNode(id); return { id, deleted: true as const }; };
  createEdge = async (input: CreateMemoryEdgeInput) => this.ctx.db.insertMemoryEdge(createMemoryEdge(input));
  getGraph = async (input: { query?: string } = {}) => graphFromMemory(this.ctx.db.listMemoryNodes(), this.ctx.db.listMemoryEdges(), input.query);
  search = async (query: string) => searchMemory(this.ctx.db.listMemoryNodes(), query);
}
