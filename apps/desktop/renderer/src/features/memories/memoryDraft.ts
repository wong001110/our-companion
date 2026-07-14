import type { MemoryNode } from '@our-companion/shared';

export interface MemoryDraft {
  title: string;
  content: string;
  summary: string;
}

export const emptyMemoryDraft = (): MemoryDraft => ({ title: '', content: '', summary: '' });

export function memoryDraftFromNode(node: MemoryNode): MemoryDraft {
  return {
    title: node.title,
    content: node.content ?? '',
    summary: node.summary ?? '',
  };
}
