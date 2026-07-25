import type {
  CharacterProfile,
  CuriosityTarget,
  Discovery,
  DiscoveryCandidate,
  DiscoveryFeedback,
  InterestGraph,
  MemoryNode,
  Pattern,
} from '@our-companion/shared';
import { toUnitScore } from '@our-companion/shared';
import type { DiscoveryMode } from './adaptiveDiscovery';

type Term = { term: string; weight: number; sourceIds: readonly string[]; publicHint: boolean };
type MutableTerm = { weight: number; sourceIds: Set<string>; publicHint: boolean };
type Signal = 'memory' | 'pattern' | 'interest' | 'history' | 'curiosity' | 'expertise';

export interface DiscoveryMemoryProfile {
  version: 1;
  generatedAt: string;
  memoryTerms: readonly Term[];
  patternTerms: readonly Term[];
  interestTerms: readonly Term[];
  historyTerms: readonly Term[];
  negativeTerms: readonly Term[];
  boundaryTerms: readonly Term[];
  sourceMemoryIds: readonly string[];
  sourcePatternIds: readonly string[];
  sourceInterestNodeIds: readonly string[];
}

export interface DiscoveryMemoryAlignment {
  profileVersion: 1;
  score: number;
  userHistoryScore: number;
  memoryScore: number;
  patternScore: number;
  interestScore: number;
  discoveryHistoryScore: number;
  curiosityScore: number;
  expertiseScore: number;
  negativePenalty: number;
  blockedByBoundary: boolean;
  publicHintTerms: readonly string[];
  supportingMemoryIds: readonly string[];
  supportingPatternIds: readonly string[];
  supportingInterestNodeIds: readonly string[];
  boundaryMemoryIds: readonly string[];
}

export interface PersistedDiscoveryMemoryAlignment {
  profileVersion: 1;
  score: number;
  userHistoryScore: number;
  memoryScore: number;
  patternScore: number;
  interestScore: number;
  discoveryHistoryScore: number;
  curiosityScore: number;
  expertiseScore: number;
  negativePenalty: number;
  publicHintTerms: readonly string[];
  sourceCounts: { memories: number; patterns: number; interestNodes: number };
  baseScore: number;
  personalizedScore: number;
}

export interface RankedDiscoveryCandidateWithMemory {
  candidate: DiscoveryCandidate;
  baseScore: number;
  personalizedScore: number;
  alignment: DiscoveryMemoryAlignment;
}

const STOP = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'i', 'in', 'is', 'it', 'like', 'me', 'my',
  'of', 'on', 'or', 'prefer', 'remember', 'that', 'the', 'this', 'to', 'user', 'want', 'with', 'you', 'your',
  '喜欢', '偏好', '记住', '我的', '用户', '这个', '那个', '可以', '需要', '想要', '不要', '以及', '或者',
]);

const MEMORY_WEIGHT: Partial<Record<NonNullable<MemoryNode['memoryType']>, number>> = {
  user_preference: 1,
  goal: 1,
  user_fact: 0.82,
  shared_experience: 0.7,
  companion_experience: 0.55,
  conversation_episode: 0.72,
  inferred_pattern: 0.76,
  external_knowledge: 0.82,
};

const PERSONALIZATION: Record<DiscoveryMode, number> = { core: 0.32, adjacent: 0.24, wildcard: 0.1, challenge: 0.16 };
const SIGNAL_WEIGHT: Record<DiscoveryMode, Readonly<Record<Signal, number>>> = {
  core: { memory: 0.3, pattern: 0.15, interest: 0.2, history: 0.15, curiosity: 0.15, expertise: 0.05 },
  adjacent: { memory: 0.2, pattern: 0.15, interest: 0.2, history: 0.1, curiosity: 0.25, expertise: 0.1 },
  wildcard: { memory: 0.08, pattern: 0.08, interest: 0.1, history: 0.04, curiosity: 0.25, expertise: 0.05 },
  challenge: { memory: 0.12, pattern: 0.15, interest: 0.15, history: 0.05, curiosity: 0.25, expertise: 0.08 },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const unique = (values: Iterable<string>, maximum = 24): string[] => [...new Set(values)].slice(0, maximum);

export function extractDiscoveryMemoryTerms(value: string): string[] {
  const terms = new Set<string>();
  const add = (valueToAdd: string) => {
    const term = valueToAdd.normalize('NFKC').toLowerCase().replace(/^[._-]+|[._-]+$/g, '').trim();
    if (term && term.length <= 64 && !STOP.has(term)) terms.add(term);
  };
  for (const raw of value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#._-]*/gu) ?? []) {
    if (/^\p{Script=Han}+$/u.test(raw)) {
      const chars = [...raw];
      if (chars.length >= 2 && chars.length <= 12) add(raw);
      for (const size of [2, 3]) for (let i = 0; i + size <= chars.length && i < 16; i += 1) add(chars.slice(i, i + size).join(''));
    } else {
      add(raw);
      for (const part of raw.split(/[._-]+/)) if (part.length >= 2) add(part);
    }
  }
  return [...terms].slice(0, 120);
}

function addTerms(map: Map<string, MutableTerm>, text: string, sourceId: string, weight: number, publicHint: boolean): void {
  const terms = extractDiscoveryMemoryTerms(text);
  const normalized = Math.max(0.01, weight / Math.sqrt(Math.max(1, terms.length / 6)));
  for (const term of terms) {
    const existing = map.get(term);
    if (existing) {
      existing.weight = Math.min(2, existing.weight + normalized);
      existing.sourceIds.add(sourceId);
      existing.publicHint ||= publicHint;
    } else map.set(term, { weight: Math.min(2, normalized), sourceIds: new Set([sourceId]), publicHint });
  }
}

function finalize(map: Map<string, MutableTerm>, maximum = 180): Term[] {
  return [...map.entries()]
    .sort(([a, left], [b, right]) => right.weight - left.weight || b.length - a.length || a.localeCompare(b))
    .slice(0, maximum)
    .map(([term, item]) => ({ term, weight: Math.round(item.weight * 1e6) / 1e6, sourceIds: [...item.sourceIds].sort(), publicHint: item.publicHint }));
}

function simpleTerms(text: string, sourceId: string): Term[] {
  const map = new Map<string, MutableTerm>();
  addTerms(map, text, sourceId, 1, true);
  return finalize(map, 80);
}

function eligibleMemory(memory: MemoryNode): boolean {
  if (memory.isMarkedWrong || (memory.status && memory.status !== 'active')) return false;
  if (['user_boundary', 'relationship_memory', 'temporary_context'].includes(memory.memoryType ?? '')) return false;
  if (memory.metadata?.sensitivity && memory.metadata.sensitivity !== 'normal') return false;
  if (!memory.metadata?.sensitivity && ['user_explicit', 'user_correction'].includes(memory.metadata?.sourceType ?? '')) return false;
  return true;
}

function memoryText(memory: MemoryNode): string {
  const userAuthored = ['user_explicit', 'user_correction'].includes(memory.metadata?.sourceType ?? '');
  return userAuthored
    ? [memory.metadata?.canonicalText, memory.title].filter(Boolean).join(' ')
    : [memory.metadata?.canonicalText, memory.title, memory.summary, memory.content].filter(Boolean).join(' ');
}

function memoryWeight(memory: MemoryNode, nowMs: number): number {
  const type = memory.memoryType ? (MEMORY_WEIGHT[memory.memoryType] ?? 0.5) : 0.55;
  const confidence = memory.confidence ?? memory.metadata?.confidence ?? 0.5;
  const observed = Date.parse(memory.lastObservedAt ?? memory.updatedAt ?? memory.createdAt);
  const ageDays = Number.isFinite(observed) ? Math.max(0, (nowMs - observed) / 86_400_000) : 365;
  const recency = Math.max(0.45, Math.exp(-ageDays / 365));
  return type * (0.45 + 0.55 * memory.importance) * (0.65 + 0.35 * confidence) * (0.75 + 0.25 * recency) * (memory.isPinned ? 1.15 : 1);
}

export function buildDiscoveryMemoryProfile(input: {
  memoryNodes: readonly MemoryNode[];
  patterns?: readonly Pattern[];
  interestGraph?: InterestGraph;
  discoveries?: readonly Discovery[];
  feedback?: readonly DiscoveryFeedback[];
  generatedAt: string;
}): DiscoveryMemoryProfile {
  const memory = new Map<string, MutableTerm>();
  const pattern = new Map<string, MutableTerm>();
  const interest = new Map<string, MutableTerm>();
  const history = new Map<string, MutableTerm>();
  const negative = new Map<string, MutableTerm>();
  const boundary = new Map<string, MutableTerm>();
  const memoryIds = new Set<string>();
  const patternIds = new Set<string>();
  const interestIds = new Set<string>();
  const parsedNow = Date.parse(input.generatedAt);
  const nowMs = Number.isFinite(parsedNow) ? parsedNow : Date.now();

  for (const item of input.memoryNodes) {
    const rule = item.metadata?.userBoundary;
    if (rule?.target && ['do_not_mention', 'do_not_recommend', 'do_not_discuss', 'avoid_topic'].includes(rule.action)) {
      addTerms(boundary, rule.target, item.id, 2, false);
      continue;
    }
    if (!eligibleMemory(item)) continue;
    const text = memoryText(item);
    if (!text.trim()) continue;
    const publicHint = ['user_preference', 'goal', 'conversation_episode', 'external_knowledge', 'inferred_pattern'].includes(item.memoryType ?? '');
    addTerms(memory, text, item.id, memoryWeight(item, nowMs), publicHint);
    memoryIds.add(item.id);
  }
  for (const item of input.patterns ?? []) {
    if (item.confidence < 0.35 || item.strength < 0.2) continue;
    addTerms(pattern, [item.title, item.summary, ...(item.normalizedTopics ?? [])].join(' '), item.id, item.confidence * item.strength * Math.max(0.35, item.freshness), true);
    patternIds.add(item.id);
  }
  for (const item of input.interestGraph?.nodes ?? []) {
    if (item.weight <= 0 || item.confidence < 0.25) continue;
    addTerms(interest, [item.label, item.description].filter(Boolean).join(' '), item.id, item.weight * item.confidence * Math.max(0.35, item.freshness), true);
    interestIds.add(item.id);
  }
  for (const item of input.discoveries ?? []) {
    const text = [item.title, item.summary, ...item.tags].filter(Boolean).join(' ');
    if (item.status === 'saved') addTerms(history, text, item.id, 0.9, true);
    else if (item.status === 'rejected' || item.status === 'dismissed') addTerms(negative, text, item.id, 1, false);
  }
  for (const item of input.feedback ?? []) {
    const text = item.note?.trim();
    if (!text) continue;
    const value = String(item.value);
    if (['not_interested', 'dismissed', 'mute_source', 'block_source'].includes(value)) addTerms(negative, text, item.id, 1, false);
    else if (['saved', 'opened_evidence', 'talk_about_this'].includes(value)) addTerms(history, text, item.id, 0.7, true);
  }
  return {
    version: 1,
    generatedAt: input.generatedAt,
    memoryTerms: finalize(memory), patternTerms: finalize(pattern), interestTerms: finalize(interest),
    historyTerms: finalize(history), negativeTerms: finalize(negative), boundaryTerms: finalize(boundary, 80),
    sourceMemoryIds: [...memoryIds].sort(), sourcePatternIds: [...patternIds].sort(), sourceInterestNodeIds: [...interestIds].sort(),
  };
}

function overlap(candidate: Set<string>, terms: readonly Term[]): { strength: number; matched: Term[] } {
  if (!candidate.size || !terms.length) return { strength: 0, matched: [] };
  const matched = terms.filter((item) => candidate.has(item.term));
  const denominator = terms.slice(0, 16).reduce((sum, item) => sum + item.weight, 0) || 1;
  const weight = matched.reduce((sum, item) => sum + item.weight, 0);
  return { strength: toUnitScore(0.8 * Math.min(1, weight / denominator) + 0.2 * Math.min(1, matched.length / Math.max(1, Math.min(6, candidate.size)))), matched };
}

const signalScore = (terms: readonly Term[], strength: number): number => terms.length ? toUnitScore(0.3 + 0.7 * strength) : 0.5;
const ids = (terms: readonly Term[]): string[] => unique(terms.flatMap((item) => item.sourceIds), 12);

export function alignDiscoveryCandidateWithMemory(input: {
  candidate: DiscoveryCandidate;
  profile: DiscoveryMemoryProfile;
  mode: DiscoveryMode;
  curiosityTarget?: Pick<CuriosityTarget, 'topic'>;
  activeCharacter?: Pick<CharacterProfile, 'expertise'>;
}): DiscoveryMemoryAlignment {
  const candidateTerms = new Set(extractDiscoveryMemoryTerms([input.candidate.title, input.candidate.summary, input.candidate.sourceName].filter(Boolean).join(' ')));
  const memory = overlap(candidateTerms, input.profile.memoryTerms);
  const pattern = overlap(candidateTerms, input.profile.patternTerms);
  const interest = overlap(candidateTerms, input.profile.interestTerms);
  const history = overlap(candidateTerms, input.profile.historyTerms);
  const negative = overlap(candidateTerms, input.profile.negativeTerms);
  const boundary = overlap(candidateTerms, input.profile.boundaryTerms);
  const curiosityTerms = input.curiosityTarget?.topic ? simpleTerms(input.curiosityTarget.topic, 'curiosity') : [];
  const expertiseTerms = input.activeCharacter?.expertise?.length ? simpleTerms(input.activeCharacter.expertise.join(' '), 'expertise') : [];
  const curiosity = overlap(candidateTerms, curiosityTerms);
  const expertise = overlap(candidateTerms, expertiseTerms);
  const scores: Record<Signal, number> = {
    memory: signalScore(input.profile.memoryTerms, memory.strength),
    pattern: signalScore(input.profile.patternTerms, pattern.strength),
    interest: signalScore(input.profile.interestTerms, interest.strength),
    history: signalScore(input.profile.historyTerms, history.strength),
    curiosity: signalScore(curiosityTerms, curiosity.strength),
    expertise: signalScore(expertiseTerms, expertise.strength),
  };
  const counts: Record<Signal, number> = {
    memory: input.profile.memoryTerms.length, pattern: input.profile.patternTerms.length,
    interest: input.profile.interestTerms.length, history: input.profile.historyTerms.length,
    curiosity: curiosityTerms.length, expertise: expertiseTerms.length,
  };
  const weights = SIGNAL_WEIGHT[input.mode];
  const available = (Object.keys(scores) as Signal[]).reduce((sum, key) => sum + (counts[key] ? weights[key] : 0), 0);
  const positive = available
    ? (Object.keys(scores) as Signal[]).reduce((sum, key) => sum + (counts[key] ? weights[key] * scores[key] : 0), 0) / available
    : 0.5;
  const negativePenalty = toUnitScore(negative.strength * 0.55);
  const blockedByBoundary = boundary.matched.length > 0;
  const publicMatches = [...memory.matched, ...pattern.matched, ...interest.matched, ...history.matched]
    .filter((item) => item.publicHint)
    .sort((left, right) => right.weight - left.weight || right.term.length - left.term.length);
  return {
    profileVersion: 1,
    score: blockedByBoundary ? 0 : toUnitScore(positive - negativePenalty),
    userHistoryScore: toUnitScore(0.55 * scores.memory + 0.25 * scores.pattern + 0.2 * scores.history),
    memoryScore: scores.memory, patternScore: scores.pattern, interestScore: scores.interest,
    discoveryHistoryScore: scores.history, curiosityScore: scores.curiosity, expertiseScore: scores.expertise,
    negativePenalty, blockedByBoundary,
    publicHintTerms: unique(publicMatches.map((item) => item.term), 5),
    supportingMemoryIds: ids(memory.matched), supportingPatternIds: ids(pattern.matched),
    supportingInterestNodeIds: ids(interest.matched), boundaryMemoryIds: ids(boundary.matched),
  };
}

export function rankDiscoveryCandidatesWithMemory(input: {
  candidates: readonly DiscoveryCandidate[];
  profile: DiscoveryMemoryProfile;
  mode: DiscoveryMode;
  curiosityTarget?: Pick<CuriosityTarget, 'topic'>;
  activeCharacter?: Pick<CharacterProfile, 'expertise'>;
  baseScore: (candidate: DiscoveryCandidate) => number;
}): RankedDiscoveryCandidateWithMemory[] {
  const blend = PERSONALIZATION[input.mode];
  return input.candidates.map((candidate) => {
    const baseScore = toUnitScore(input.baseScore(candidate));
    const alignment = alignDiscoveryCandidateWithMemory({ candidate, profile: input.profile, mode: input.mode, curiosityTarget: input.curiosityTarget, activeCharacter: input.activeCharacter });
    return { candidate, baseScore, alignment, personalizedScore: alignment.blockedByBoundary ? 0 : toUnitScore(baseScore * (1 - blend) + alignment.score * blend) };
  }).sort((left, right) => Number(left.alignment.blockedByBoundary) - Number(right.alignment.blockedByBoundary)
    || right.personalizedScore - left.personalizedScore || right.candidate.evidenceScore - left.candidate.evidenceScore
    || left.candidate.id.localeCompare(right.candidate.id));
}

function rawRecord(raw?: string): Record<string, unknown> {
  try { const parsed = raw ? JSON.parse(raw) as unknown : {}; return isRecord(parsed) ? parsed : {}; } catch { return {}; }
}

function safeSnapshot(ranked: RankedDiscoveryCandidateWithMemory): PersistedDiscoveryMemoryAlignment {
  return {
    profileVersion: 1,
    score: ranked.alignment.score, userHistoryScore: ranked.alignment.userHistoryScore,
    memoryScore: ranked.alignment.memoryScore, patternScore: ranked.alignment.patternScore,
    interestScore: ranked.alignment.interestScore, discoveryHistoryScore: ranked.alignment.discoveryHistoryScore,
    curiosityScore: ranked.alignment.curiosityScore, expertiseScore: ranked.alignment.expertiseScore,
    negativePenalty: ranked.alignment.negativePenalty, publicHintTerms: ranked.alignment.publicHintTerms,
    sourceCounts: { memories: ranked.alignment.supportingMemoryIds.length, patterns: ranked.alignment.supportingPatternIds.length, interestNodes: ranked.alignment.supportingInterestNodeIds.length },
    baseScore: ranked.baseScore, personalizedScore: ranked.personalizedScore,
  };
}

export function attachDiscoveryMemoryAlignment(candidate: DiscoveryCandidate, ranked: RankedDiscoveryCandidateWithMemory): DiscoveryCandidate {
  return { ...candidate, relevanceScore: toUnitScore(candidate.relevanceScore * 0.7 + ranked.alignment.score * 0.3), rawEvidence: JSON.stringify({ ...rawRecord(candidate.rawEvidence), memoryAlignment: safeSnapshot(ranked) }) };
}

export function readDiscoveryMemoryAlignment(raw: unknown): PersistedDiscoveryMemoryAlignment | undefined {
  const value = isRecord(raw) && isRecord(raw.memoryAlignment) ? raw.memoryAlignment : undefined;
  if (!value || value.profileVersion !== 1) return undefined;
  const number = (key: string, fallback = 0.5) => typeof value[key] === 'number' && Number.isFinite(value[key]) ? toUnitScore(Number(value[key])) : fallback;
  const strings = (key: string) => Array.isArray(value[key]) ? unique((value[key] as unknown[]).filter((item): item is string => typeof item === 'string'), 12) : [];
  const sourceCounts = isRecord(value.sourceCounts) ? value.sourceCounts : {};
  const count = (key: string) => typeof sourceCounts[key] === 'number' && Number.isFinite(sourceCounts[key]) ? Math.max(0, Math.floor(Number(sourceCounts[key]))) : 0;
  return {
    profileVersion: 1,
    score: number('score'), userHistoryScore: number('userHistoryScore'), memoryScore: number('memoryScore'),
    patternScore: number('patternScore'), interestScore: number('interestScore'), discoveryHistoryScore: number('discoveryHistoryScore'),
    curiosityScore: number('curiosityScore'), expertiseScore: number('expertiseScore'), negativePenalty: number('negativePenalty', 0),
    publicHintTerms: strings('publicHintTerms'), sourceCounts: { memories: count('memories'), patterns: count('patterns'), interestNodes: count('interestNodes') },
    baseScore: number('baseScore'), personalizedScore: number('personalizedScore'),
  };
}
