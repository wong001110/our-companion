import type { DatabaseService } from '@our-companion/database';
import type {
  CompanionMemoryContext,
  MemoryContextItem,
  MemoryNode,
  TypedMemoryType,
} from '@our-companion/shared';
import { normalizeSemanticText } from '@our-companion/shared';

const DEFAULT_MAX_ITEMS = 18;
const DEFAULT_MAX_CHARACTERS = 4_800;
const ABSOLUTE_MAX_CHARACTERS = 6_000;
const CANDIDATE_LIMIT = 80;

export interface MemoryContextBuildInput {
  companionId: string;
  message: string;
  maxItems?: number;
  maxCharacters?: number;
}

export interface MemoryContextProvider {
  buildContext(input: MemoryContextBuildInput): Promise<CompanionMemoryContext>;
}

function textFor(node: MemoryNode): string {
  return (node.summary || node.content || node.title).trim();
}

function contextItem(node: MemoryNode, selectedBecause: string): MemoryContextItem {
  return {
    memoryId: node.id,
    type: node.memoryType ?? node.type,
    summary: textFor(node).slice(0, 500),
    confidence: node.confidence ?? node.metadata?.confidence ?? 0.5,
    importance: node.importance,
    pinned: Boolean(node.isPinned),
    selectedBecause,
  };
}

function keywords(value: string): Set<string> {
  const normalized = normalizeSemanticText(value);
  const words = normalized.split(/\s+/).filter((word) => word.length >= 2);
  const cjk = [...normalized.replace(/[^\p{Script=Han}]/gu, '')];
  for (let index = 0; index < cjk.length - 1; index += 1) {
    words.push(`${cjk[index]}${cjk[index + 1]}`);
  }
  return new Set(words);
}

function overlapScore(node: MemoryNode, query: Set<string>): number {
  if (query.size === 0) return 0;
  const candidate = keywords(`${node.title} ${node.summary ?? ''} ${node.content ?? ''}`);
  let overlap = 0;
  for (const token of query) if (candidate.has(token)) overlap += 1;
  return overlap / query.size;
}

function isExpired(node: MemoryNode, nowMs: number): boolean {
  const expiresAt = node.metadata?.expiresAt;
  return Boolean(expiresAt && Date.parse(expiresAt) <= nowMs);
}

function typeOf(node: MemoryNode): TypedMemoryType | undefined {
  return node.memoryType;
}

export class SqliteMemoryContextProvider implements MemoryContextProvider {
  constructor(
    private readonly db: DatabaseService,
    private readonly now: () => Date,
  ) {}

  async buildContext(input: MemoryContextBuildInput): Promise<CompanionMemoryContext> {
    const maxItems = Math.max(1, Math.min(20, input.maxItems ?? DEFAULT_MAX_ITEMS));
    const maxCharacters = Math.max(
      500,
      Math.min(ABSOLUTE_MAX_CHARACTERS, input.maxCharacters ?? DEFAULT_MAX_CHARACTERS),
    );
    const query = keywords(input.message);
    const candidates = this.db.listMemoryContextCandidates(input.companionId, CANDIDATE_LIMIT)
      .filter((node) => !node.isMarkedWrong && !isExpired(node, this.now().getTime()));

    const pinnedNodes = candidates.filter((node) => node.isPinned).slice(0, 5);
    const pinnedIds = new Set(pinnedNodes.map((node) => node.id));
    const available = candidates.filter((node) => !pinnedIds.has(node.id));
    const boundaryNodes = available.filter((node) => typeOf(node) === 'user_boundary').slice(0, 5);
    const boundaryIds = new Set(boundaryNodes.map((node) => node.id));
    const preferenceNodes = available
      .filter((node) => !boundaryIds.has(node.id) && typeOf(node) === 'user_preference')
      .slice(0, 5);
    const preferenceIds = new Set(preferenceNodes.map((node) => node.id));
    const goalNodes = available
      .filter((node) => !boundaryIds.has(node.id) && !preferenceIds.has(node.id) && typeOf(node) === 'goal')
      .slice(0, 5);
    const selectedIds = new Set([
      ...pinnedIds,
      ...boundaryIds,
      ...preferenceIds,
      ...goalNodes.map((node) => node.id),
    ]);
    const rankedRelevant = available
      .filter((node) => !selectedIds.has(node.id))
      .map((node) => ({ node, score: overlapScore(node, query) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score
        || right.node.importance - left.node.importance
        || right.node.updatedAt.localeCompare(left.node.updatedAt))
      .slice(0, 8);
    for (const { node } of rankedRelevant) selectedIds.add(node.id);
    const recentNodes = available.filter((node) => !selectedIds.has(node.id)).slice(0, 5);

    const groups = {
      pinned: pinnedNodes.map((node) => contextItem(node, 'pinned')),
      boundaries: boundaryNodes.map((node) => contextItem(node, 'user_boundary')),
      preferences: preferenceNodes.map((node) => contextItem(node, 'user_preference')),
      goals: goalNodes.map((node) => contextItem(node, 'goal')),
      relevant: rankedRelevant.map(({ node, score }) => contextItem(node, `keyword_overlap:${score.toFixed(3)}`)),
      recent: recentNodes.map((node) => contextItem(node, 'recent')),
    };

    let itemCount = 0;
    let characterCount = 0;
    for (const key of ['pinned', 'boundaries', 'preferences', 'goals', 'relevant', 'recent'] as const) {
      groups[key] = groups[key].filter((item) => {
        if (itemCount >= maxItems || characterCount + item.summary.length > maxCharacters) return false;
        itemCount += 1;
        characterCount += item.summary.length;
        return true;
      });
    }

    return {
      ...groups,
      selectedCount: itemCount,
      characterCount,
      maxItems,
      maxCharacters,
    };
  }
}
