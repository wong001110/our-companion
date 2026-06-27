import type {
  CaptureSignalInput,
  CharacterProfile,
  CuriosityTarget,
  Discovery,
  DiscoveryAgentType,
  DiscoveryCandidate,
  DiscoveryOrigin,
  DiscoveryScores,
  DiscoverySource,
  DuplicateResult,
  ExplorationPlan,
  NormalizedSignal,
  NormalizedDiscovery,
  Signal,
  SignalEngine
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export interface DiscoveryFetchInput {
  query?: string;
  limit?: number;
}

export type RawDiscoveryItem = Record<string, unknown>;

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'ref_src',
  'fbclid',
  'gclid'
]);

export interface DiscoveryConnector {
  source: DiscoverySource;
  fetch(input: DiscoveryFetchInput): Promise<RawDiscoveryItem[]>;
  normalize(item: RawDiscoveryItem): NormalizedDiscovery;
}

export interface RankingContext {
  userInterests: string[];
  recentMemoryTags: string[];
  activeCharacter: Pick<CharacterProfile, 'expertise'>;
  seenUrls?: Set<string>;
}

export interface RunDiscoveryAgentsInput {
  userId: string;
  companionId: string;
  curiosityTarget: CuriosityTarget;
  explorationPlan: ExplorationPlan;
  connectors?: DiscoveryConnector[];
  memoryCandidates?: Array<{ title: string; summary?: string; url?: string; tags?: string[] }>;
}

function matchScore(tags: string[], values: string[], fallback: number): number {
  if (values.length === 0 || tags.length === 0) return fallback;
  const normalizedTags = tags.map((tag) => tag.toLowerCase());
  const matches = values.filter((value) => normalizedTags.includes(value.toLowerCase())).length;
  return Math.min(100, Math.round((matches / Math.max(values.length, 1)) * 100));
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizedWords(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export function normalizeDiscoveryUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';

    if (parsed.hostname === 'github.com') {
      const [, owner, repo] = parsed.pathname.split('/');
      if (owner && repo) {
        parsed.pathname = `/${owner.toLowerCase()}/${repo.toLowerCase()}`;
        parsed.search = '';
      }
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}

export function fingerprintDiscovery(input: {
  title: string;
  canonicalUrl?: string;
  entities?: string[];
  topics?: string[];
  sourceType?: string;
}): string {
  const parts = [
    normalizedWords(input.title),
    input.canonicalUrl ?? '',
    ...(input.entities ?? []).map(normalizedWords).sort(),
    ...(input.topics ?? []).map(normalizedWords).sort(),
    input.sourceType ?? ''
  ];
  return `fp_${stableHash(parts.join('|'))}`;
}

export function qualityScoreForSignal(signal: Pick<Signal, 'title' | 'summary' | 'url' | 'rawContent'>): number {
  const titleScore = signal.title.trim().length >= 8 ? 35 : 10;
  const summaryScore = (signal.summary ?? signal.rawContent ?? '').trim().length >= 24 ? 35 : 10;
  const urlScore = signal.url ? 15 : 0;
  const specificityScore = /\b(how|why|guide|release|architecture|pattern|research|example)\b/i.test(
    `${signal.title} ${signal.summary ?? ''}`
  )
    ? 15
    : 8;
  return Math.min(100, titleScore + summaryScore + urlScore + specificityScore);
}

export function captureSignal(input: CaptureSignalInput): Signal {
  return {
    id: createId('signal'),
    sourceType: input.sourceType,
    provider: input.provider,
    title: input.title.trim(),
    summary: input.summary?.trim(),
    url: input.url,
    rawContent: input.rawContent,
    capturedAt: nowIso(),
    metadata: input.metadata
  };
}

export function normalizeSignal(signal: Signal): NormalizedSignal {
  return {
    ...signal,
    canonicalUrl: normalizeDiscoveryUrl(signal.url),
    normalizedTitle: normalizedWords(signal.title),
    qualityScore: qualityScoreForSignal(signal)
  };
}

export function createSignalEngine(): SignalEngine {
  return {
    async capture(input) {
      return captureSignal(input);
    },
    async normalize(signal) {
      return normalizeSignal(signal);
    }
  };
}

function sourceTypeFromDiscoverySource(source: DiscoverySource): Signal['sourceType'] {
  if (source === 'github') return 'github';
  if (source === 'youtube') return 'youtube';
  if (source === 'reddit' || source === 'hackernews') return 'community';
  return 'internet';
}

export function signalFromNormalizedDiscovery(discovery: NormalizedDiscovery): Signal {
  return captureSignal({
    sourceType: sourceTypeFromDiscoverySource(discovery.source),
    provider: discovery.source,
    title: discovery.title,
    summary: discovery.summary,
    url: discovery.url,
    rawContent: JSON.stringify(discovery.raw),
    metadata: {
      externalId: discovery.externalId,
      tags: discovery.tags,
      publishedAt: discovery.publishedAt
    }
  });
}

export function passesDiscoveryQuality(signal: NormalizedSignal, minimumScore = 45): boolean {
  return signal.qualityScore >= minimumScore;
}

export function checkDuplicateDiscovery(
  candidate: Pick<Discovery, 'id' | 'canonicalUrl' | 'fingerprint' | 'title'>,
  existing: Array<Pick<Discovery, 'id' | 'canonicalUrl' | 'fingerprint' | 'title'>>
): DuplicateResult {
  const titleWords = new Set(normalizedWords(candidate.title).split(/\s+/).filter(Boolean));

  for (const item of existing) {
    if (candidate.canonicalUrl && item.canonicalUrl === candidate.canonicalUrl) {
      return { type: 'duplicate', existingDiscoveryId: item.id };
    }
    if (candidate.fingerprint && item.fingerprint === candidate.fingerprint) {
      return { type: 'duplicate', existingDiscoveryId: item.id };
    }

    const overlap = normalizedWords(item.title)
      .split(/\s+/)
      .filter((word) => titleWords.has(word)).length;
    if (overlap >= Math.min(4, titleWords.size)) {
      return { type: 'revival_candidate', existingConceptId: `concept:${stableHash(item.title)}`, reason: 'Similar topic resurfaced with new context.' };
    }
  }

  return { type: 'new' };
}

export function discoveryOriginForSignal(signal: Signal): DiscoveryOrigin {
  const type: DiscoveryOrigin['type'] =
    signal.sourceType === 'user' || signal.sourceType === 'system'
      ? 'user'
      : signal.sourceType === 'companion'
        ? 'companion'
        : signal.sourceType === 'community'
          ? 'community'
          : signal.sourceType === 'local_file'
            ? 'local'
            : 'internet';
  return {
    type,
    provider: signal.provider,
    displayName: signal.provider ?? signal.sourceType
  };
}

export function scoreDiscovery(item: NormalizedDiscovery, context: RankingContext): DiscoveryScores {
  const userInterestScore = matchScore(item.tags, context.userInterests, 45);
  const userHistoryScore = matchScore(item.tags, context.recentMemoryTags, 35);
  const characterExpertiseScore = matchScore(item.tags, context.activeCharacter.expertise, 55);
  const noveltyScore = item.url && context.seenUrls?.has(item.url) ? 10 : 70;
  const usefulnessScore = item.summary || item.url ? 65 : 35;
  const finalScore = Math.round(
    0.35 * userInterestScore +
      0.25 * userHistoryScore +
      0.2 * characterExpertiseScore +
      0.1 * noveltyScore +
      0.1 * usefulnessScore
  );

  return {
    userInterestScore,
    userHistoryScore,
    characterExpertiseScore,
    noveltyScore,
    usefulnessScore,
    finalScore
  };
}

export function deduplicateDiscoveries(items: NormalizedDiscovery[]): NormalizedDiscovery[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url || `${item.source}:${item.externalId || item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toDiscovery(item: NormalizedDiscovery, scores: DiscoveryScores): Discovery {
  const signal = signalFromNormalizedDiscovery(item);
  const normalizedSignal = normalizeSignal(signal);
  return {
    ...item,
    ...scores,
    id: createId('disc'),
    signalId: signal.id,
    origin: discoveryOriginForSignal(signal),
    status: 'candidate',
    canonicalUrl: normalizedSignal.canonicalUrl,
    fingerprint: fingerprintDiscovery({
      title: item.title,
      canonicalUrl: normalizedSignal.canonicalUrl,
      topics: item.tags,
      sourceType: item.source
    }),
    growthValue: scores.finalScore,
    confidenceScore: Math.min(100, Math.round((normalizedSignal.qualityScore + scores.finalScore) / 2)),
    createdAt: nowIso()
  };
}

export function discoveryFromSignal(signal: NormalizedSignal, scores: DiscoveryScores): Discovery | undefined {
  if (!passesDiscoveryQuality(signal)) return undefined;
  const source = signal.provider === 'github' || signal.provider === 'reddit' || signal.provider === 'hackernews' || signal.provider === 'youtube'
    ? signal.provider
    : 'hackernews';
  return {
    source,
    externalId: signal.id,
    title: signal.title,
    summary: signal.summary ?? signal.rawContent ?? signal.title,
    url: signal.url,
    tags: Array.isArray(signal.metadata?.tags) ? signal.metadata.tags.map(String) : [signal.sourceType],
    publishedAt: signal.metadata?.publishedAt ? String(signal.metadata.publishedAt) : undefined,
    raw: signal.metadata ?? signal,
    ...scores,
    id: createId('disc'),
    signalId: signal.id,
    origin: discoveryOriginForSignal(signal),
    status: 'candidate',
    canonicalUrl: signal.canonicalUrl,
    fingerprint: fingerprintDiscovery({
      title: signal.title,
      canonicalUrl: signal.canonicalUrl,
      topics: Array.isArray(signal.metadata?.tags) ? signal.metadata.tags.map(String) : [signal.sourceType],
      sourceType: signal.sourceType
    }),
    growthValue: scores.finalScore,
    confidenceScore: Math.min(100, Math.round((signal.qualityScore + scores.finalScore) / 2)),
    createdAt: nowIso()
  };
}

export function applyDailyCap(discoveries: Discovery[], alreadySharedToday: number, cap = 10): Discovery[] {
  const remaining = Math.max(0, cap - alreadySharedToday);
  return discoveries
    .sort((left, right) => right.finalScore - left.finalScore)
    .slice(0, remaining)
    .map((discovery) => ({
      ...discovery,
      status: 'shared',
      sharedAt: nowIso()
    }));
}

function fallbackItems(source: DiscoverySource): RawDiscoveryItem[] {
  const common = {
    source,
    publishedAt: nowIso()
  };

  const pools: Record<DiscoverySource, RawDiscoveryItem[]> = {
    github: [
      { ...common, id: 'github-pixijs-desktop-pet', title: 'Building expressive desktop companions with PixiJS', summary: 'A small renderer pattern for animated companion characters.', url: 'https://github.com/pixijs/pixijs', tags: ['frontend', 'pixijs', 'web', 'ux'] },
      { ...common, id: 'github-tldraw', title: 'tldraw — a canvas for thinking', summary: 'Infinite canvas toolkit for collaborative whiteboarding.', url: 'https://github.com/tldraw/tldraw', tags: ['canvas', 'collaboration', 'tool'] },
      { ...common, id: 'github-excalidraw', title: 'Excalidraw — virtual whiteboard', summary: 'Hand-drawn style sketching tool for diagrams.', url: 'https://github.com/excalidraw/excalidraw', tags: ['sketch', 'diagram', 'canvas'] },
      { ...common, id: 'github-affine', title: 'Affine — knowledge management', summary: 'Local-first knowledge base with docs and whiteboard.', url: 'https://github.com/toeverything/AFFiNE', tags: ['knowledge', 'local-first', 'docs'] }
    ],
    hackernews: [
      { ...common, id: 'hn-local-first-memory', title: 'Local-first app patterns for personal memory tools', summary: 'Discussion about SQLite-backed personal software.', url: 'https://news.ycombinator.com/', tags: ['sqlite', 'local-first', 'memory'] },
      { ...common, id: 'hn-ai-companion', title: 'AI companion design patterns in 2025', summary: 'How desktop AI assistants are evolving beyond chatbots.', url: 'https://news.ycombinator.com/', tags: ['ai', 'companion', 'ux'] },
      { ...common, id: 'hn-personal-knowledge', title: 'Building a personal knowledge graph', summary: 'Tools and techniques for organizing thoughts digitally.', url: 'https://news.ycombinator.com/', tags: ['knowledge', 'graph', 'personal'] },
      { ...common, id: 'hn-emotional-ui', title: 'Emotion-driven interfaces', summary: 'Research on UI that adapts to user mood and context.', url: 'https://news.ycombinator.com/', tags: ['emotion', 'ui', 'adaptive'] }
    ],
    reddit: [
      { ...common, id: 'reddit-cozy-dev-room', title: 'Cozy developer room inspiration boards', summary: 'Workspace ideas with warm lighting and note-taking systems.', url: 'https://www.reddit.com/r/battlestations/', tags: ['ux', 'workspace', 'cozy'] },
      { ...common, id: 'reddit-desktop-pet', title: 'Desktop pet communities and projects', summary: 'Folklore about virtual companions on your screen.', url: 'https://www.reddit.com/r/desktoppets/', tags: ['pet', 'desktop', 'companion'] },
      { ...common, id: 'reddit-journaling', title: 'Digital journaling with personality', summary: 'Apps that make note-taking feel personal and alive.', url: 'https://www.reddit.com/r/Journaling/', tags: ['journal', 'personal', 'writing'] },
      { ...common, id: 'reddit-notebook-aesthetic', title: 'Notebook aesthetic and paper UI', summary: 'Design inspiration from physical notebooks and scrapbooks.', url: 'https://www.reddit.com/r/Notebooks/', tags: ['notebook', 'aesthetic', 'paper'] }
    ],
    youtube: [
      { ...common, id: 'youtube-pixijs-tutorial', title: 'PixiJS animation basics for character sprites', summary: 'A tutorial-style resource for sprite animation loops.', url: 'https://www.youtube.com/results?search_query=PixiJS+sprite+animation', tags: ['pixijs', 'frontend', 'animation'] },
      { ...common, id: 'youtube-character-design', title: 'Character design for indie games', summary: 'Creating expressive animated characters on a budget.', url: 'https://www.youtube.com/results?search_query=character+design+indie', tags: ['character', 'design', 'animation'] },
      { ...common, id: 'youtube-cozy-setup', title: 'Cozy desk setup for productivity', summary: 'Warm workspace ideas with ambient lighting.', url: 'https://www.youtube.com/results?search_query=cozy+desk+setup', tags: ['workspace', 'cozy', 'ambient'] },
      { ...common, id: 'youtube-memory-palace', title: 'Building a memory palace digitally', summary: 'Techniques for organizing knowledge spatially.', url: 'https://www.youtube.com/results?search_query=memory+palace+digital', tags: ['memory', 'knowledge', 'spatial'] }
    ]
  };

  const pool = pools[source];
  const index = Math.floor(Math.random() * pool.length);
  return [pool[index]];
}

export function createFallbackConnector(source: DiscoverySource): DiscoveryConnector {
  return {
    source,
    async fetch() {
      return fallbackItems(source);
    },
    normalize(item) {
      return {
        source,
        externalId: String(item.id ?? item.title),
        title: String(item.title),
        summary: item.summary ? String(item.summary) : undefined,
        url: item.url ? String(item.url) : undefined,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [source],
        publishedAt: item.publishedAt ? String(item.publishedAt) : undefined,
        raw: item
      };
    }
  };
}

export async function runDiscoveryPipeline(
  connectors: DiscoveryConnector[],
  context: RankingContext,
  alreadySharedToday: number
): Promise<Discovery[]> {
  const rawByConnector = await Promise.all(
    connectors.map(async (connector) => {
      const raw = await connector.fetch({ limit: 10 });
      return raw.map((item) => connector.normalize(item));
    })
  );

  const normalized = deduplicateDiscoveries(rawByConnector.flat());
  const ranked = normalized.map((item) => toDiscovery(item, scoreDiscovery(item, context)));
  return applyDailyCap(ranked, alreadySharedToday);
}

function sourceTypeFor(source: DiscoverySource): DiscoveryCandidate['sourceType'] {
  const map: Record<DiscoverySource, DiscoveryCandidate['sourceType']> = {
    github: 'github',
    hackernews: 'community_discussion',
    reddit: 'community_discussion',
    youtube: 'video'
  };
  return map[source];
}

function agentForSource(source: DiscoverySource, preferred: DiscoveryAgentType[]): DiscoveryAgentType {
  if (source === 'github') return preferred.includes('builder') ? 'builder' : preferred[0] ?? 'scout';
  if (source === 'hackernews') return preferred.includes('trend') ? 'trend' : preferred[0] ?? 'scout';
  if (source === 'reddit') return preferred.includes('contrarian') ? 'contrarian' : preferred[0] ?? 'scout';
  if (source === 'youtube') return preferred.includes('research') ? 'research' : preferred[0] ?? 'scout';
  return preferred[0] ?? 'scout';
}

export function planExploration(curiosityTarget: CuriosityTarget): ExplorationPlan {
  const objectiveByType: Record<CuriosityTarget['explorationType'], ExplorationPlan['objective']> = {
    similar: 'find_new_examples',
    adjacent: 'find_new_examples',
    opposite: 'challenge_assumption',
    deepening: 'find_related_research',
    challenge: 'challenge_assumption',
    practical: 'find_practical_references'
  };
  const agentsByType: Record<CuriosityTarget['explorationType'], DiscoveryAgentType[]> = {
    similar: ['scout', 'memory_scout'],
    adjacent: ['scout', 'trend', 'memory_scout'],
    opposite: ['contrarian', 'research'],
    deepening: ['research', 'memory_scout'],
    challenge: ['contrarian', 'research'],
    practical: ['builder', 'scout']
  };
  const queryTopic = curiosityTarget.topic.trim();

  return {
    id: createId('plan'),
    curiosityTargetId: curiosityTarget.id,
    objective: objectiveByType[curiosityTarget.explorationType],
    agents: agentsByType[curiosityTarget.explorationType],
    searchQueries: [
      queryTopic,
      `${queryTopic} examples`,
      `${queryTopic} ${curiosityTarget.explorationType === 'practical' ? 'implementation' : 'patterns'}`
    ],
    constraints: ['Prefer specific evidence over generic summaries.', 'Do not produce user-facing narration.'],
    maxCandidatesPerAgent: 3,
    createdAt: nowIso()
  };
}

export function scoreCandidate(candidate: Pick<DiscoveryCandidate, 'relevanceScore' | 'noveltyScore' | 'evidenceScore' | 'usefulnessScore'>): number {
  return (
    candidate.relevanceScore * 0.35 +
    candidate.noveltyScore * 0.2 +
    candidate.evidenceScore * 0.2 +
    candidate.usefulnessScore * 0.15 +
    0.1
  );
}

export function deduplicateCandidates(candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = (candidate.sourceUrl || `${candidate.sourceName ?? candidate.sourceType}:${candidate.title}`).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runDiscoveryAgents(input: RunDiscoveryAgentsInput): Promise<DiscoveryCandidate[]> {
  const connectors =
    input.connectors ??
    (['github', 'hackernews', 'reddit', 'youtube'] as DiscoverySource[]).map(createFallbackConnector);
  const preferredAgents = input.explorationPlan.agents;
  const searchQuery = input.explorationPlan.searchQueries[0];

  const external = await Promise.all(
    connectors.map(async (connector) => {
      const raw = await connector.fetch({ query: searchQuery, limit: input.explorationPlan.maxCandidatesPerAgent });
      return raw.slice(0, input.explorationPlan.maxCandidatesPerAgent).map((item) => {
        const normalized = connector.normalize(item);
        const agentType = agentForSource(connector.source, preferredAgents);
        const tags = normalized.tags.map((tag) => tag.toLowerCase());
        const topicWords = input.curiosityTarget.topic.toLowerCase().split(/\s+/);
        const relevanceScore = topicWords.some((word) => tags.includes(word)) ? 0.82 : 0.62;
        return {
          id: createId('candidate'),
          userId: input.userId,
          companionId: input.companionId,
          title: normalized.title,
          summary: normalized.summary ?? `A ${connector.source} signal related to ${input.curiosityTarget.topic}.`,
          sourceType: sourceTypeFor(connector.source),
          sourceUrl: normalized.url,
          sourceName: connector.source,
          agentType,
          relatedCuriosityTargetId: input.curiosityTarget.id,
          relevanceScore,
          noveltyScore: normalized.url ? 0.72 : 0.48,
          evidenceScore: normalized.summary || normalized.url ? 0.68 : 0.42,
          usefulnessScore: normalized.tags.length > 0 ? 0.66 : 0.45,
          fingerprint: fingerprintDiscovery({
            title: normalized.title,
            canonicalUrl: normalizeDiscoveryUrl(normalized.url),
            topics: normalized.tags,
            sourceType: normalized.source
          }),
          rawEvidence: JSON.stringify(normalized.raw),
          collectedAt: nowIso()
        } satisfies DiscoveryCandidate;
      });
    })
  );

  const memoryCandidates =
    preferredAgents.includes('memory_scout')
      ? (input.memoryCandidates ?? []).slice(0, input.explorationPlan.maxCandidatesPerAgent).map((item) => ({
          id: createId('candidate'),
          userId: input.userId,
          companionId: input.companionId,
          title: item.title,
          summary: item.summary ?? `Ann found this in memory while exploring ${input.curiosityTarget.topic}.`,
          sourceType: 'internal_memory' as const,
          sourceUrl: item.url,
          sourceName: 'memory',
          agentType: 'memory_scout' as const,
          relatedCuriosityTargetId: input.curiosityTarget.id,
          relevanceScore: 0.78,
          noveltyScore: 0.45,
          evidenceScore: 0.7,
          usefulnessScore: 0.72,
          fingerprint: fingerprintDiscovery({
            title: item.title,
            canonicalUrl: normalizeDiscoveryUrl(item.url),
            topics: item.tags,
            sourceType: 'internal_memory'
          }),
          rawEvidence: JSON.stringify(item),
          collectedAt: nowIso()
        }))
      : [];

  return deduplicateCandidates([...external.flat(), ...memoryCandidates]).sort(
    (left, right) => scoreCandidate(right) - scoreCandidate(left)
  );
}

// ============================================================================
// Discovery Engine V2 — Enhanced discovery management
// ============================================================================

export { DiscoveryEngine } from './discovery-engine';
export { createExplorationPlan } from './discovery-planner';
export { createEvidence, aggregateEvidence } from './discovery-evidence';
export { generateDiscoveryResult } from './discovery-result';
export {
  addToQueue,
  removeFromQueue,
  getNextJob,
  retryJob,
  cancelJob,
} from './discovery-queue';
export {
  MAX_RETRIES,
  JOB_EXPIRY_HOURS,
  MAX_QUEUE_SIZE,
  DEFAULT_MAX_COST,
} from './types';

// ============================================================================
// Discovery Engine V2 — Pool and Share Timing
// ============================================================================

export {
  createPoolItem,
  addToPool,
  removeFromPool,
  updatePoolItemStatus,
  getShareCandidates,
  filterPool,
  expireStaleItems,
} from './pool/discovery-pool';

export {
  evaluateShareCandidate,
  determineInterruptionLevel,
  shouldShareNow,
} from './share/share-timing';

export { DISCOVERY_STARTUP_DELAY_MS, getDiscoveryFetchDelay, getDiscoveryFetchDelayRange } from './timing';
