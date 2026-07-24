export * from './models';
export * from './interfaces';
export * from './domain-events';
export {
  clamp01,
  clampScore,
  clamp,
  toUnitScore,
  toScore100,
  unitToScore100,
  score100ToUnit,
  createTimer
} from './utils';
export type { UnitScore, Score100 } from './utils';

import type { ActionPermissionState, ActionStep, BaseEvent, KnowledgeGraph, PermissionScope, SignalSourceType } from './models';
import type { UnitScore } from './utils';

export type DiscoverySource = SignalSourceType;

export type CoreState =
  | 'idle'
  | 'walking'
  | 'sleeping'
  | 'observing'
  | 'thinking'
  | 'discovering'
  | 'talking'
  | 'listening'
  | 'executing'
  | 'returning'
  | 'organizing_backpack';

export type EmotionName =
  | 'neutral'
  | 'curious'
  | 'happy'
  | 'excited'
  | 'shy'
  | 'confused'
  | 'focused'
  | 'tired'
  | 'proud'
  | 'concerned';

export type Intent =
  | 'wandering'
  | 'waiting'
  | 'sharing_discovery'
  | 'asking_permission'
  | 'helping_task'
  | 'reviewing_memory'
  | 'reflecting_journey'
  | 'organizing_backpack';

export interface EmotionState {
  neutral: number;
  curious: number;
  happy: number;
  excited: number;
  shy: number;
  confused: number;
  focused: number;
  tired: number;
  proud: number;
  concerned: number;
}

export interface CharacterRuntimeState {
  characterId: string;
  coreState: CoreState;
  emotion: EmotionState;
  intent: Intent;
  position?: { x: number; y: number };
  animationIntent?: string;
  lifeActivity?: CompanionLifeActivity;
  lastActivityAt?: string;
  updatedAt?: string;
}

export type CompanionLifeActivity =
  | 'idle'
  | 'resting'
  | 'sleeping'
  | 'working'
  | 'listening_music'
  | 'thinking'
  | 'exploring'
  | 'returning'
  | 'waiting'
  | 'interacting';

export type PendingActionStatus = 'pending' | 'ready' | 'cancelled' | 'expired' | 'completed';

export interface PendingCompanionAction {
  id: string;
  companionId: string;
  decision: import('./models').CompanionDecision;
  discoveryId?: string;
  createdAt: string;
  expiresAt: string;
  status: PendingActionStatus;
  deferReason?: string;
}

export type MemoryRetention =
  | 'discard'
  | 'session_only'
  | 'temporary'
  | 'long_term'
  | 'requires_confirmation';

export type MemorySensitivity = 'normal' | 'personal' | 'private' | 'sensitive';
export interface UserBoundaryMetadata {
  action: 'do_not_mention' | 'do_not_recommend' | 'do_not_discuss' | 'avoid_topic' | 'do_not_take_action';
  target: string;
  sourceLanguage?: 'en' | 'zh';
}

export interface MemoryCandidate {
  id: string;
  userId: string;
  companionId: string;
  sessionId?: string;
  proposedType: TypedMemoryType;
  sourceText?: string;
  summary: string;
  confidence: UnitScore;
  sensitivity: MemorySensitivity;
  retention: MemoryRetention;
  reason: string;
  createdAt: string;
}

export interface CommittedMemoryEvidence {
  userEvidence?: string;
  assistantInterpretation?: string;
  userBoundary?: {
    action: 'do_not_mention' | 'do_not_recommend' | 'do_not_discuss' | 'avoid_topic' | 'do_not_take_action';
    target: string;
    sourceLanguage?: 'en' | 'zh';
  };
  sourceMessageIds?: string[];
}

export type RelationshipSignal =
  | 'conversation_completed'
  | 'positive_feedback'
  | 'user_reengaged'
  | 'user_correction'
  | 'user_rejected'
  | 'user_ended_conversation'
  | 'ignored'
  | 'not_now'
  | 'not_interested';

export type SessionCloseReason =
  | 'completed'
  | 'timeout'
  | 'user_closed'
  | 'companion_switched'
  | 'app_shutdown'
  | 'interrupted';

export type FeedbackDomain = 'topic' | 'timing' | 'interaction';

export interface TopicFeedback {
  userId: string;
  companionId: string;
  discoveryId: string;
  topicKeys: string[];
  value: 'interested' | 'not_interested';
}

export interface TimingFeedback {
  userId: string;
  companionId: string;
  actionId?: string;
  value: 'not_now' | 'snooze';
  retryAfter?: string;
}

export const PANEL_TABS = [
  'home',
  'chat',
  'discovery',
  'journey',
  'memory',
  'social',
  'settings',
] as const;

export type PanelTab = typeof PANEL_TABS[number];

export function isPanelTab(value: unknown): value is PanelTab {
  return typeof value === 'string' && PANEL_TABS.includes(value as PanelTab);
}

export interface InteractionFeedback {
  userId: string;
  companionId: string;
  actionId?: string;
  value: 'ignored' | 'dismissed' | 'engaged';
}

export interface UserAttentionContext {
  explicitMode?: 'available' | 'focused' | 'do_not_disturb';
  conversationActive: boolean;
  companionDragging: boolean;
  fullscreenActive?: boolean;
  recentInputActivity?: 'active' | 'inactive' | 'unknown';
  quietHoursActive: boolean;
  lastInteractionAt?: string;
}

export interface AnimationIntent {
  category:
    | 'idle'
    | 'talk'
    | 'walk'
    | 'listen'
    | 'think'
    | 'drag'
    | 'expedition'
    | 'work'
    | 'music'
    | 'enter'
    | 'leave';
  variant?: string;
  direction?: 'left' | 'right' | 'up' | 'down' | 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
  emotion?: string;
}

export type LifeInterruptibility = 'free' | 'soft' | 'restricted';

export interface CompanionLifeState {
  companionId: string;
  activity: CompanionLifeActivity;
  startedAt: string;
  minimumEndAt: string;
  preferredEndAt: string;
  interruptibility: LifeInterruptibility;
  previousActivity?: CompanionLifeActivity;
  reason: string;
}

export interface CompanionCommand {
  id: string;
  companionId: string;
  /** Presentation target used to match an authoritative command with its renderer payload. */
  discoveryId?: string;
  decision: import('./models').CompanionDecision;
  issuedAt: string;
  expiresAt?: string;
}

export type CommandAckStatus = 'received' | 'started' | 'completed' | 'cancelled' | 'failed';

export interface CompanionCommandAck {
  commandId: string;
  companionId: string;
  status: CommandAckStatus;
  reportedAt: string;
  reason?: string;
  failedStep?: string;
}

export interface UserTopicPreference {
  userId: string;
  topicKey: string;
  interestScore: number;
  positiveCount: number;
  negativeCount: number;
  lastFeedbackAt: string;
}

export type TypedMemoryType =
  | 'user_fact'
  | 'user_preference'
  | 'user_boundary'
  | 'goal'
  | 'shared_experience'
  | 'relationship_memory'
  | 'companion_experience'
  | 'conversation_episode'
  | 'inferred_pattern'
  | 'external_knowledge'
  | 'temporary_context';

export interface MemoryMetadata {
  ownerUserId?: string;
  ownerCompanionId?: string;
  sourceType:
    | 'user_explicit'
    | 'user_correction'
    | 'conversation'
    | 'companion_observation'
    | 'system'
    | 'discovery'
    | 'imported';
  confidence: number;
  sensitivity: MemorySensitivity;
  scope: 'session' | 'companion' | 'user' | 'shared';
  createdAt: string;
  lastConfirmedAt?: string;
  expiresAt?: string;
  supersedesMemoryId?: string;
  correctedByMemoryId?: string;
  userEvidence?: string;
  /** Exact user evidence or a deterministic/confirmed value safe for reply rendering. */
  canonicalText?: string;
  /** Provenance of canonicalText; AI interpretations are never canonical by default. */
  canonicalSource?: 'exact_user_evidence' | 'deterministic_boundary' | 'user_confirmed';
  /** Optional model interpretation retained for retrieval/review only, never reply rendering. */
  unverifiedInterpretation?: string;
  assistantInterpretation?: string;
  userBoundary?: UserBoundaryMetadata;
  sourceMessageIds?: string[];
}

export interface UserCompanionRelationship {
  userId: string;
  companionId: string;
  familiarity: UnitScore;
  trust: UnitScore;
  comfort: UnitScore;
  preferredInteractionFrequency: 'low' | 'normal' | 'high';
  preferredInteractionStyle: 'quiet' | 'balanced' | 'expressive';
  recentPositiveInteractions: number;
  recentIgnoredInteractions: number;
  recentCorrections: number;
  sharedExperienceIds: string[];
  knownBoundaries: string[];
  lastMeaningfulInteractionAt?: string;
  updatedAt: string;
}

export interface ConversationSessionRecord {
  id: string;
  companionId: string;
  userId: string;
  phase: ConversationPhase;
  startedAt: string;
  endedAt?: string;
  lastMessageAt?: string;
  updatedAt: string;
  closeReason?: SessionCloseReason;
  unfinishedTopic?: string;
}

export type ConversationPhase =
  | 'inactive'
  | 'opening'
  | 'listening'
  | 'thinking'
  | 'responding'
  | 'waiting_for_user'
  | 'paused'
  | 'closing';

export interface CharacterProfile {
  id: string;
  name: string;
  packageId: string;
  isPrimary: boolean;
  isActive: boolean;
  corePersonality: string[];
  expertise: string[];
  speakingStyle: {
    tone: string;
    length: string;
    avoid: string[];
  };
}

export type MemoryNodeType =
  | 'topic'
  | 'discovery'
  | 'resource'
  | 'question'
  | 'decision'
  | 'outcome';

export type MemoryRelation =
  | 'related_to'
  | 'inspired_by'
  | 'evolved_into'
  | 'depends_on'
  | 'caused_by';

export interface MemoryNode {
  id: string;
  type: MemoryNodeType;
  title: string;
  summary?: string;
  content?: string;
  /** Normalized domain importance in the inclusive 0–1 range. */
  importance: UnitScore;
  source?: string;
  sourceUrl?: string;
  isPinned?: boolean;
  isMarkedWrong?: boolean;
  companionId?: string;
  userId?: string;
  memoryType?: TypedMemoryType;
  metadata?: MemoryMetadata;
  fingerprint?: string;
  confidence?: UnitScore;
  observationCount?: number;
  lastObservedAt?: string;
  createdAt: string;
  updatedAt: string;
  compressedAt?: string;
  /** Long-term memory lifecycle. `isMarkedWrong` is mapped to `superseded` for legacy records. */
  status?: MemoryStatus;
  canonicalKey?: string;
  sourceMessageIds?: string[];
  emotionalWeight?: UnitScore;
  accessCount?: number;
  lastAccessedAt?: string;
}

export interface MemoryEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationType: MemoryRelation;
  confidence: number;
  createdAt: string;
}

export interface MemoryGraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

// ============================================================================
// MEMORY — Canonical memory architecture types
// ============================================================================

export type MemoryTier = 'short_term' | 'long_term' | 'episodic' | 'semantic';

export interface MemoryRecord {
  id: string;
  tier: MemoryTier;
  type: MemoryNodeType;
  content: string;
  summary?: string;
  source: string;
  tags: string[];
  entities: string[];
  importance: number;
  confidence: number;
  reinforcementCount: number;
  lastAccessedAt: string;
  createdAt: string;
  updatedAt: string;
  decayScore: number;
}

export interface AddMemoryInput {
  content: string;
  summary?: string;
  tier: MemoryTier;
  type: MemoryNodeType;
  source: string;
  tags?: string[];
  entities?: string[];
  importance?: number;
  confidence?: number;
}

export interface MemoryQuery {
  text?: string;
  tags?: string[];
  entities?: string[];
  types?: MemoryNodeType[];
  tiers?: MemoryTier[];
  limit?: number;
  minImportance?: number;
}

export interface MemoryRetrievalResult {
  memory: MemoryRecord;
  relevanceScore: number;
  reason: string;
}

export interface ConsolidateMemoryInput {
  sourceTier: 'short_term';
  targetTier?: 'long_term';
  minImportance?: number;
}

export interface ConsolidationResult {
  consolidated: number;
  merged: number;
  discarded: number;
}

export interface MemoryDecayOptions {
  decayRate?: number;
  minImportance?: number;
  maxAge?: number;
}

export interface MemoryDecayResult {
  decayed: number;
  archived: number;
}

export interface MemoryGraphQuery {
  query?: string;
  tier?: MemoryTier;
  limit?: number;
}

export interface MemoryEvent {
  type: 'memory.created' | 'memory.reinforced' | 'memory.decayed' | 'memory.consolidated' | 'memory.retrieved' | 'memory.graph.updated';
  memoryId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type DiscoveryStatus =
  | 'candidate'
  | 'eligible'
  | 'queued'
  | 'presenting'
  | 'announced'
  | 'saved'
  | 'rejected'
  | 'dismissed'
  | 'archived';

export interface NormalizedDiscovery {
  source: DiscoverySource;
  externalId?: string;
  title: string;
  summary?: string;
  url?: string;
  tags: string[];
  publishedAt?: string;
  raw: unknown;
}

export interface DiscoveryScores {
  userInterestScore: UnitScore;
  userHistoryScore: UnitScore;
  characterExpertiseScore: UnitScore;
  noveltyScore: UnitScore;
  usefulnessScore: UnitScore;
  finalScore: UnitScore;
}

export interface Discovery extends NormalizedDiscovery, DiscoveryScores {
  id: string;
  signalId?: string;
  origin?: import('./models').DiscoveryOrigin;
  status: DiscoveryStatus;
  canonicalUrl?: string;
  fingerprint?: string;
  growthValue?: UnitScore;
  confidenceScore?: UnitScore;
  whyThisMatters?: string;
  recommendedAction?: 'view' | 'save' | 'ignore' | 'add_to_journey';
  shortMessage?: string;
  companionId?: string;
  cycleId?: string;
  presentationCommandId?: string;
  eligibleAt?: string;
  queuedAt?: string;
  presentingAt?: string;
  announcedAt?: string;
  updatedAt?: string;
  statusReason?: string;
  createdAt: string;
  lastSeenAt?: string;
}

// ============================================================================
// DISCOVERY — Canonical discovery types
// ============================================================================

export type DiscoveryJobStatus = 'pending' | 'planning' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface DiscoveryJob {
  id: string;
  sourceCuriosityId: string;
  status: DiscoveryJobStatus;
  priority: number;
  strategy: string;
  startedAt?: string;
  finishedAt?: string;
  retryCount: number;
  maxRetries: number;
  evidence: DiscoveryEvidence[];
  summary?: string;
  confidence: number;
  relatedTopics: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveryEvidence {
  id: string;
  title: string;
  source: string;
  snippet: string;
  relevance: number;
  confidence: number;
  timestamp: string;
}

export interface DiscoveryResult {
  id: string;
  jobId: string;
  summary: string;
  detailedFindings: string;
  evidence: DiscoveryEvidence[];
  confidence: number;
  novelty: number;
  suggestedMemoryUpdates: string[];
  suggestedInsights: string[];
  suggestedFollowUps: string[];
  createdAt: string;
}

export interface DiscoveryQueueQuery {
  statuses?: DiscoveryJobStatus[];
  minPriority?: number;
  limit?: number;
}

export type PatternType =
  | 'repeated_topic'
  | 'cross_source_trend'
  | 'journey_alignment'
  | 'user_momentum'
  | 'fatigue_signal'
  | 'revival_signal'
  | 'repeated_theme'
  | 'interest_cluster'
  | 'abandoned_direction'
  | 'returning_topic'
  | 'contradiction'
  | 'interest_shift'
  | 'exploration_loop'
  | 'aesthetic_preference'
  | 'technical_preference';

export interface PatternEvidence {
  sourceType: 'memory' | 'journey_event' | 'conversation' | 'discovery_feedback' | 'saved_discovery' | 'dismissed_discovery';
  sourceId?: string;
  summary: string;
  weight: UnitScore;
}

export interface Pattern {
  id: string;
  userId: string;
  companionId?: string;
  semanticFingerprint?: string;
  normalizedTopics?: string[];
  type: PatternType;
  title: string;
  summary: string;
  description?: string;
  relatedConceptIds?: string[];
  relatedDiscoveryIds?: string[];
  confidence: UnitScore;
  strength: UnitScore;
  freshness: UnitScore;
  evidence: PatternEvidence[];
  observationCount?: number;
  frequency?: UnitScore;
  lastObservedAt?: string;
  detectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type InterestNodeType =
  | 'topic'
  | 'project'
  | 'technology'
  | 'aesthetic'
  | 'problem'
  | 'behavior'
  | 'theme'
  | 'question'
  | 'opposing_view';

export interface InterestNode {
  id: string;
  userId: string;
  label: string;
  description?: string;
  type: InterestNodeType;
  weight: UnitScore;
  confidence: UnitScore;
  freshness: UnitScore;
  source: 'memory' | 'conversation' | 'journey' | 'discovery' | 'manual' | 'pattern' | 'diary';
  createdAt: string;
  updatedAt: string;
}

export interface InterestEdge {
  id: string;
  userId: string;
  fromNodeId: string;
  toNodeId: string;
  relation:
    | 'similar_to'
    | 'part_of'
    | 'adjacent_to'
    | 'opposes'
    | 'supports'
    | 'inspired_by'
    | 'used_for'
    | 'evolved_into'
    | 'frequently_appears_with';
  weight: UnitScore;
  confidence: UnitScore;
  createdAt: string;
}

export interface InterestGraph {
  userId: string;
  nodes: InterestNode[];
  edges: InterestEdge[];
  recommendedExpansionPaths?: string[][];
  updatedAt: string;
}

export type CuriositySource =
  | 'memory_trigger'
  | 'pattern_trigger'
  | 'journey_trigger'
  | 'novelty_trigger'
  | 'contradiction_trigger'
  | 'relationship_trigger'
  | 'character_trigger';

export type ExplorationType = 'similar' | 'adjacent' | 'opposite' | 'deepening' | 'challenge' | 'practical';

export interface CuriosityTarget {
  id: string;
  userId: string;
  companionId: string;
  topic: string;
  topicFingerprint?: string;
  sourceFingerprint?: string;
  generatedFromIds?: string[];
  description: string;
  source: CuriositySource;
  explorationType: ExplorationType;
  priority: UnitScore;
  confidence: UnitScore;
  reason: string;
  expectedValue: string;
  relatedMemoryIds?: string[];
  relatedPatternIds?: string[];
  relatedInterestNodeIds?: string[];
  status?: 'open' | 'exploring' | 'completed' | 'ignored' | 'cooldown';
  lastGeneratedAt?: string;
  lastExploredAt?: string;
  cooldownUntil?: string;
  generationCount?: number;
  ignoreCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export const CURIOSITY_COOLDOWN_MS = {
  completed: 24 * 60 * 60 * 1000,
  ignoredOnce: 24 * 60 * 60 * 1000,
  ignoredTwice: 3 * 24 * 60 * 60 * 1000,
  ignoredRepeatedly: 7 * 24 * 60 * 60 * 1000,
} as const;

export function normalizeSemanticText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function createSemanticFingerprint(namespace: string, parts: readonly string[]): string {
  const value = `${namespace}:${parts.map(normalizeSemanticText).join('|')}`;
  let left = 0xdeadbeef ^ value.length;
  let right = 0x41c6ce57 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 2654435761);
    right = Math.imul(right ^ code, 1597334677);
  }
  left = Math.imul(left ^ (left >>> 16), 2246822507) ^ Math.imul(right ^ (right >>> 13), 3266489909);
  right = Math.imul(right ^ (right >>> 16), 2246822507) ^ Math.imul(left ^ (left >>> 13), 3266489909);
  return `${namespace}_${(right >>> 0).toString(16).padStart(8, '0')}${(left >>> 0).toString(16).padStart(8, '0')}`;
}

export interface RuntimeClock {
  now(): Date;
  nowMs(): number;
}

export class SystemRuntimeClock implements RuntimeClock {
  now(): Date { return new Date(); }
  nowMs(): number { return Date.now(); }
}

export class DebugRuntimeClock implements RuntimeClock {
  private offsetMs = 0;

  constructor(
    private readonly systemNow: () => number = Date.now,
    readonly enabled = true,
  ) {}

  now(): Date { return new Date(this.nowMs()); }
  nowMs(): number { return this.systemNow() + this.offsetMs; }
  getOffsetMs(): number { return this.offsetMs; }
  advance(milliseconds: number): Date {
    if (!this.enabled) throw new Error('DEBUG_CLOCK_UNAVAILABLE');
    if (!Number.isFinite(milliseconds)) throw new Error('DEBUG_CLOCK_UNAVAILABLE');
    this.offsetMs += milliseconds;
    return this.now();
  }
  reset(): Date {
    if (!this.enabled) throw new Error('DEBUG_CLOCK_UNAVAILABLE');
    this.offsetMs = 0;
    return this.now();
  }
}

// ============================================================================
// CURIOSITY — Canonical curiosity types
// ============================================================================

export type CuriosityCandidateStatus = 'pending' | 'queued' | 'exploring' | 'completed' | 'dismissed' | 'expired';

export interface CuriosityCandidate {
  id: string;
  userId: string;
  source: CuriositySource;
  title: string;
  description: string;
  category: string;
  relatedMemoryIds: string[];
  relatedInsightIds: string[];
  novelty: UnitScore;
  relevance: UnitScore;
  confidence: UnitScore;
  priority: UnitScore;
  freshness: UnitScore;
  status: CuriosityCandidateStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface CuriosityQueueQuery {
  statuses?: CuriosityCandidateStatus[];
  minPriority?: number;
  limit?: number;
}

export type DiscoveryAgentType = 'scout' | 'research' | 'builder' | 'trend' | 'contrarian' | 'memory_scout';

// ============================================================================
// CONSTRAINED RESEARCH — canonical domain contracts
// ============================================================================

/** Source categories are capabilities, never a hard-coded list of websites. */
export type ResearchSourceType =
  | 'official'
  | 'code'
  | 'research'
  | 'technical_article'
  | 'news'
  | 'community'
  | 'video'
  | 'rss'
  | 'network_public'
  | 'open_web';

export type ResearchObjective =
  | 'find_official_information'
  | 'find_implementation_examples'
  | 'find_recent_developments'
  | 'find_research_evidence'
  | 'find_community_opinions'
  | 'find_contrarian_evidence'
  | 'compare_approaches';

export interface ResearchIntent {
  id: string;
  userId: string;
  companionId: string;
  cycleId: string;
  curiosityTargetId: string;
  topic: string;
  objective: ResearchObjective;
  preferredSourceTypes: ResearchSourceType[];
  domainHints?: string[];
  excludedDomains?: string[];
  freshnessDays?: number;
  evidenceRequirements: {
    minimumSources: number;
    requirePrimarySource?: boolean;
    requireIndependentDomains?: number;
    requireContrastingSource?: boolean;
  };
  createdAt: string;
}

export interface ResearchLimits {
  maxQueries: number;
  maxSearchResultsPerQuery: number;
  maxPagesToRead: number;
  maxLinkDepth: number;
  maxTotalCharacters: number;
  timeoutMs: number;
}

/** The only public plan representation for constrained external research. */
export interface ResearchPlan {
  id: string;
  userId: string;
  companionId: string;
  cycleId: string;
  researchIntentId: string;
  queries: string[];
  selectedCapabilities: string[];
  limits: ResearchLimits;
  createdAt: string;
  /** Recorded once the bounded research run finishes; never contains provider payloads. */
  outcome?: {
    stopReason: string;
    additionalPasses: 0 | 1;
    completedAt: string;
  };
}

export interface WebSearchResult {
  id: string;
  query: string;
  title: string;
  url: string;
  snippet?: string;
  domain: string;
  publishedAt?: string;
  rank: number;
  provider: string;
}

export interface WebSearchProviderDiagnostics {
  providerId: string;
  adapterId?: string;
  availability: 'ready' | 'cooldown' | 'challenge' | 'unavailable';
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastErrorCode?: string;
  cooldownUntil?: string;
  cacheHit?: boolean;
}

/**
 * Persisted operational metadata only. Search result payloads (URLs, titles,
 * snippets, ranks, selected-result IDs, and result domains) remain transient in the research
 * coordinator and are never written to the local database.
 */
export interface ResearchSearchRecord {
  id: string;
  userId: string;
  companionId: string;
  cycleId: string;
  researchIntentId: string;
  researchPlanId: string;
  query: string;
  provider: string;
  mode: 'live' | 'fixture' | 'unavailable';
  status: 'completed' | 'empty' | 'failed' | 'skipped';
  resultCount: number;
  createdAt: string;
  errorCode?: string;
}

export interface WebPageEvidence {
  id: string;
  userId: string;
  companionId: string;
  cycleId: string;
  researchIntentId: string;
  researchPlanId: string;
  searchResultId: string;
  query: string;
  provider: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  title: string;
  extractedText: string;
  excerpt: string;
  contentHash: string;
  contentType: string;
  fetchedAt: string;
  publishedAt?: string;
  sourceType: ResearchSourceType;
  /**
   * Transient normalized entries extracted from RSS/Atom. Each entry becomes
   * its own evidence/candidate record before persistence, so Seen and Material
   * Update operate on item identity rather than the aggregate feed document.
   */
  feedItems?: Array<{
    externalId: string;
    canonicalUrl: string;
    title: string;
    summary: string;
    contentHash: string;
    publishedAt?: string;
  }>;
  externalId?: string;
}

/** A selection can only name an ID produced by the current search pass. */
export interface SelectedResearchPage {
  searchResultId: string;
  reason: string;
  expectedEvidenceType: ResearchSourceType;
}

export interface ResearchEvidenceCoverage {
  sourceCount: number;
  independentDomainCount: number;
  hasPrimarySource: boolean;
  hasContrastingSource: boolean;
  requirementsSatisfied: boolean;
  missing: string[];
}

export interface ResearchCapabilityStatus {
  id: string;
  kind?: 'structured_connector' | 'open_web_search' | 'web_page_fetcher';
  sourceTypes: ResearchSourceType[];
  mode: EngineProviderMode;
  available: boolean;
  reasonUnavailable?: string;
}

export interface DiscoveryCandidate {
  id: string;
  userId: string;
  companionId: string;
  title: string;
  summary: string;
  sourceType:
    | 'github'
    | 'article'
    | 'blog'
    | 'paper'
    | 'video'
    | 'website'
    | 'product'
    | 'community_discussion'
    | 'internal_memory'
    | 'generated_idea';
  sourceUrl?: string;
  sourceName?: string;
  agentType: DiscoveryAgentType;
  relatedCuriosityTargetId: string;
  relevanceScore: UnitScore;
  noveltyScore: UnitScore;
  evidenceScore: UnitScore;
  usefulnessScore: UnitScore;
  fingerprint?: string;
  researchPlanId?: string;
  evidenceIds?: string[];
  rawEvidence?: string;
  collectedAt: string;
}

export type CompanionInsightType =
  | 'observation'
  | 'pattern'
  | 'hypothesis'
  | 'question'
  | 'opportunity'
  | 'warning'
  | 'contradiction'
  | 'practical_next_step';

export interface CompanionInsight {
  id: string;
  userId: string;
  companionId: string;
  title: string;
  type: CompanionInsightType;
  summary: string;
  insight: string;
  whyItMatters: string;
  whyCompanionFoundIt: string;
  confidence: UnitScore;
  novelty: UnitScore;
  emotionalRelevance: UnitScore;
  practicalRelevance: UnitScore;
  supportingCandidateIds: string[];
  relatedMemoryIds?: string[];
  relatedPatternIds?: string[];
  suggestedQuestion?: string;
  suggestedAction?: string;
  narration?: string;
  createdAt: string;
}

// ============================================================================
// GENERATED INSIGHT — Insight presentation and generation types
// ============================================================================

export type InsightCategory =
  | 'interest'
  | 'learning'
  | 'productivity'
  | 'project'
  | 'behaviour'
  | 'relationship'
  | 'discovery'
  | 'risk';

export interface GeneratedInsight {
  id: string;
  userId: string;
  category: InsightCategory;
  title: string;
  summary: string;
  explanation: string;
  supportingPatternIds: string[];
  supportingMemoryIds: string[];
  confidence: UnitScore;
  importance: UnitScore;
  novelty: UnitScore;
  evidenceCount: number;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface InsightQuery {
  categories?: InsightCategory[];
  minConfidence?: number;
  minImportance?: number;
  status?: 'active' | 'archived';
  limit?: number;
}

export interface InsightGenerationInput {
  userId: string;
  patterns: Pattern[];
  memories: MemoryRecord[];
}

export interface InsightGenerationResult {
  insights: GeneratedInsight[];
  metadata: {
    patternsAnalyzed: number;
    insightsGenerated: number;
    duplicatesPrevented: number;
  };
}

export type ExplorationState =
  | 'idle'
  | 'curious'
  | 'planning'
  | 'exploring'
  | 'collecting'
  | 'synthesizing'
  | 'returning'
  | 'sharing'
  | 'reflecting';

export type ExplorationTrigger =
  | 'scheduled'
  | 'manual'
  | 'memory_updated'
  | 'pattern_detected'
  | 'user_idle'
  | 'relationship_moment'
  | 'companion_curiosity';

export interface ExplorationCycle {
  id: string;
  userId: string;
  companionId: string;
  trigger: ExplorationTrigger;
  state: ExplorationState;
  curiosityTargetIds: string[];
  selectedCuriosityTargetId?: string;
  researchIntentId?: string;
  researchPlanId?: string;
  discoveryCandidateIds: string[];
  insightIds: string[];
  selectedInsightId?: string;
  startedAt: string;
  completedAt?: string;
}

export interface ExplorationLoopEvent {
  id: string;
  userId: string;
  companionId: string;
  cycleId: string;
  state: ExplorationState;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type DiscoveryFeedbackValue =
  | 'saved'
  | 'not_interested'
  | 'not_now'
  | 'later'
  | 'talk_about_this'
  | 'opened_evidence'
  | 'mute_source'
  | 'block_source';

export interface DiscoveryFeedback {
  id: string;
  userId: string;
  companionId: string;
  cycleId: string;
  insightId?: string;
  discoveryCandidateId?: string;
  value: DiscoveryFeedbackValue;
  note?: string;
  createdAt: string;
  feedbackDomain?: FeedbackDomain;
}

export type DiscoveryBaseState = 'trial' | 'active' | 'expired' | 'muted' | 'blocked' | 'rejected';
export type DiscoveryBaseOrigin =
  | 'generic_web'
  | 'search_result'
  | 'feed_detection'
  | 'user'
  | 'connector'
  | 'personality';
export type UserDiscoverySourceType = 'query' | 'domain' | 'page' | 'feed';

export interface DiscoveryBase {
  id: string;
  companionId: string;
  connectorId: string;
  scope: string;
  locator: string;
  data: Readonly<Record<string, unknown>>;
  origin: DiscoveryBaseOrigin;
  state: DiscoveryBaseState;
  discoveredAt: string;
  trialStartedAt?: string;
  trialExpiresAt?: string;
  lastCheckedAt?: string;
  updatedAt: string;
}

export interface AddDiscoveryBaseInput {
  sourceType: UserDiscoverySourceType;
  locator: string;
  label?: string;
  initialState?: 'trial' | 'active';
}

export interface UpdateDiscoveryBaseStateInput {
  baseId: string;
  state: DiscoveryBaseState;
}

export interface StartExplorationInput {
  userId?: string;
  companionId?: string;
  trigger?: ExplorationTrigger;
}

export interface SubmitDiscoveryFeedbackInput {
  cycleId: string;
  insightId?: string;
  discoveryCandidateId?: string;
  value: DiscoveryFeedbackValue;
  note?: string;
}

export interface ExplorationCycleResult {
  cycle: ExplorationCycle;
  curiosityTargets: CuriosityTarget[];
  selectedCuriosityTarget?: CuriosityTarget;
  researchIntent?: ResearchIntent;
  researchPlan?: ResearchPlan;
  webPageEvidence?: WebPageEvidence[];
  discoveryCandidates: DiscoveryCandidate[];
  insights: GeneratedInsight[];
  selectedInsight?: GeneratedInsight;
  diaryEntryId?: string;
}

export interface Journey {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'paused';
  conceptIds?: string[];
  discoveryIds?: string[];
  insightIds?: string[];
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyMilestone {
  id: string;
  journeyId: string;
  title: string;
  summary?: string;
  type: 'discovery_saved' | 'memory_added' | 'task_completed' | 'reflection' | 'manual';
  occurredAt: string;
  createdAt: string;
}

export interface DiaryEntry {
  id: string;
  characterId: string;
  userId?: string;
  type: 'daily' | 'weekly' | 'milestone';
  perspective?: 'companion_reflection';
  title?: string;
  content: string;
  summary?: string;
  referencedMemoryIds?: string[];
  confidence?: number;
  relatedJourneyId?: string;
  createdAt: string;
  generatedAt?: string;
}

export type ToolName = 'open_url' | 'open_app' | 'search_web' | 'browser_navigation';
export type ToolDataBoundary = 'local' | 'external';
export type DisclosureTarget = 'search_web' | 'open_url' | 'http_request' | 'email' | 'file_upload' | 'specific_tool';

export interface ActionCapabilityDefinition {
  toolName: ToolName;
  dataBoundary: ToolDataBoundary;
  disclosureTarget?: DisclosureTarget;
  description: string;
  argumentSchema: readonly ActionCapabilityArgument[];
  examples: { en: readonly string[]; zhCN: readonly string[] };
  requiredScopes: readonly PermissionScope[];
  riskLevel: 'low' | 'medium' | 'high';
  requiresConfirmationByDefault: boolean;
  enabled: boolean;
}

export interface ActionCapabilityArgument {
  name: string;
  type: 'string';
  required: boolean;
  description: string;
  allowedValues?: readonly string[];
}

export const ACTION_CAPABILITY_REGISTRY = {
  open_url: {
    toolName: 'open_url',
    dataBoundary: 'external', disclosureTarget: 'open_url',
    description: 'Open a safe HTTP or HTTPS URL in the browser.',
    argumentSchema: [
      { name: 'url', type: 'string', required: true, description: 'Safe public HTTP or HTTPS URL.' },
    ],
    examples: {
      en: ['open youtube.com', 'go to https://example.com'],
      zhCN: ['打开 youtube.com', '打开 https://example.com'],
    },
    requiredScopes: ['browser'],
    riskLevel: 'low',
    requiresConfirmationByDefault: false,
    enabled: true,
  },
  search_web: {
    toolName: 'search_web',
    dataBoundary: 'external', disclosureTarget: 'search_web',
    description: 'Search the public web for a user-provided query.',
    argumentSchema: [
      { name: 'query', type: 'string', required: true, description: 'Non-empty search query.' },
      { name: 'target', type: 'string', required: false, description: 'Optional search provider label.' },
    ],
    examples: { en: ['search web for PixiJS'], zhCN: ['搜索 PixiJS'] },
    requiredScopes: ['browser'],
    riskLevel: 'low',
    requiresConfirmationByDefault: false,
    enabled: true,
  },
  open_app: {
    toolName: 'open_app',
    dataBoundary: 'local',
    description: 'Open an installed desktop application by name.',
    argumentSchema: [
      { name: 'appName', type: 'string', required: true, description: 'Non-empty installed application name.' },
    ],
    examples: { en: ['open app Chrome'], zhCN: ['打开应用 Chrome'] },
    requiredScopes: ['automation'],
    riskLevel: 'medium',
    requiresConfirmationByDefault: false,
    enabled: true,
  },
  browser_navigation: {
    toolName: 'browser_navigation',
    dataBoundary: 'local',
    description: 'Navigate an existing browser session using a supported navigation action.',
    argumentSchema: [
      {
        name: 'action',
        type: 'string',
        required: true,
        description: 'Supported browser navigation operation.',
        allowedValues: ['go_back', 'go_forward', 'reload', 'open_tab'],
      },
      { name: 'url', type: 'string', required: false, description: 'Safe public URL required for open_tab.' },
    ],
    examples: { en: ['go back', 'reload the page'], zhCN: ['返回上一页', '刷新页面'] },
    requiredScopes: ['browser'],
    riskLevel: 'low',
    requiresConfirmationByDefault: false,
    enabled: true,
  },
} as const satisfies Record<ToolName, ActionCapabilityDefinition>;

export function getActionCapability(toolName: unknown): ActionCapabilityDefinition | undefined {
  if (typeof toolName !== 'string' || !Object.hasOwn(ACTION_CAPABILITY_REGISTRY, toolName)) return undefined;
  return ACTION_CAPABILITY_REGISTRY[toolName as ToolName];
}

export function listEnabledActionCapabilities(): ActionCapabilityDefinition[] {
  return Object.values(ACTION_CAPABILITY_REGISTRY).filter((capability) => capability.enabled);
}

export function validateActionCapabilityRegistry(): void {
  for (const capability of Object.values(ACTION_CAPABILITY_REGISTRY) as ActionCapabilityDefinition[]) {
    if (!capability.enabled) continue;
    if (capability.dataBoundary !== 'local' && capability.dataBoundary !== 'external') throw new Error(`ACTION_CAPABILITY_DATA_BOUNDARY_INVALID:${capability.toolName}`);
    if (capability.dataBoundary === 'external' && !capability.disclosureTarget) throw new Error(`ACTION_CAPABILITY_DISCLOSURE_TARGET_REQUIRED:${capability.toolName}`);
    if (capability.dataBoundary === 'local' && capability.disclosureTarget) throw new Error(`ACTION_CAPABILITY_LOCAL_DISCLOSURE_TARGET_FORBIDDEN:${capability.toolName}`);
  }
}

export function resolveActionDisclosureTarget(toolName: unknown, args: Record<string, unknown>): DisclosureTarget | undefined {
  const capability = getActionCapability(toolName);
  if (!capability || !capability.enabled) return undefined;
  if (capability.toolName === 'browser_navigation') return args.action === 'open_tab' && typeof args.url === 'string' ? 'open_url' : undefined;
  return capability.dataBoundary === 'external' ? capability.disclosureTarget : undefined;
}

export function actionCapabilityPromptSummary(): string {
  const enabled = listEnabledActionCapabilities().map((capability) => [
    `Tool: ${capability.toolName}`,
    `Description: ${capability.description}`,
    `Allowed arguments: ${capability.argumentSchema.map((argument) => `${argument.name}:${argument.type}${argument.required ? ' (required)' : ' (optional)'}${argument.allowedValues ? ` [${argument.allowedValues.join('|')}]` : ''}`).join(', ')}`,
    `Required scopes: ${capability.requiredScopes.join(', ')}`,
    `Risk: ${capability.riskLevel}`,
    `Examples: ${[...capability.examples.en, ...capability.examples.zhCN].join(' | ')}`,
  ].join('\n')).join('\n\n');
  const unavailable = Object.values(ACTION_CAPABILITY_REGISTRY)
    .filter((capability) => !capability.enabled)
    .map((capability) => capability.toolName)
    .join(', ');
  return `${enabled}\n\nUnavailable capabilities: ${unavailable || 'none'}`;
}

export type ActionCapabilityArgsResult =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; reason: string };

export function validateActionCapabilityArgs(toolName: unknown, args: unknown): ActionCapabilityArgsResult {
  const capability = getActionCapability(toolName);
  if (!capability?.enabled) return { ok: false, reason: 'ACTION_CAPABILITY_NOT_AVAILABLE' };
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { ok: false, reason: 'ACTION_ARGUMENTS_INVALID' };
  const source = args as Record<string, unknown>;
  const allowedNames = new Set(capability.argumentSchema.map((argument) => argument.name));
  if (Object.keys(source).some((name) => !allowedNames.has(name))) {
    return { ok: false, reason: 'ACTION_ARGUMENTS_INVALID' };
  }
  const normalized: Record<string, unknown> = {};
  for (const argument of capability.argumentSchema) {
    const value = source[argument.name];
    if (value === undefined || value === null || value === '') {
      if (argument.required) return { ok: false, reason: 'ACTION_ARGUMENTS_INVALID' };
      continue;
    }
    if (typeof value !== argument.type || (typeof value === 'string' && !value.trim())) {
      return { ok: false, reason: 'ACTION_ARGUMENTS_INVALID' };
    }
    if (argument.allowedValues && !argument.allowedValues.includes(value as string)) {
      return { ok: false, reason: 'ACTION_ARGUMENTS_INVALID' };
    }
    normalized[argument.name] = typeof value === 'string' ? value.trim() : value;
  }
  if (toolName === 'open_url') {
    const url = normalizeActionUrl(String(normalized.url ?? ''));
    if (!url) return { ok: false, reason: 'ACTION_URL_INVALID' };
    normalized.url = url;
  }
  if (toolName === 'browser_navigation') {
    const action = normalized.action;
    if (action === 'open_tab') {
      const url = normalizeActionUrl(String(normalized.url ?? ''));
      if (!url) return { ok: false, reason: 'ACTION_URL_INVALID' };
      normalized.url = url;
    } else if (normalized.url !== undefined) {
      return { ok: false, reason: 'ACTION_ARGUMENTS_INVALID' };
    }
  }
  return { ok: true, args: normalized };
}

const UNSAFE_ACTION_URL_SCHEMES = /^(?:javascript|file|data|blob|chrome|electron|companion|companion-network):/i;
const ACTION_HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeActionUrl(input: string): string | undefined {
  const value = input.trim();
  if (!value || /\s/.test(value) || UNSAFE_ACTION_URL_SCHEMES.test(value)) return undefined;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try { url = new URL(candidate); } catch { return undefined; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  if (url.username || url.password || url.hash) return undefined;
  const hostname = url.hostname.toLowerCase();
  if (!ACTION_HOSTNAME.test(hostname) || isUnsafeActionHostname(hostname)) return undefined;
  url.hostname = hostname;
  return url.toString().replace(/\/$/, '');
}

function isUnsafeActionHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return true;
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export interface ToolExecuteInput {
  toolName: ToolName;
  args: Record<string, unknown>;
  requireConfirmation?: boolean;
}

export interface ToolPreview {
  allowed: boolean;
  requiresConfirmation: boolean;
  userFacingSummary: string;
  blockedReason?: string;
}

export interface ToolExecutionResult extends ToolPreview {
  status: 'blocked' | 'preview_required' | 'executed' | 'failed';
  result?: unknown;
  errorMessage?: string;
}

export interface DiscoveryFeedInput {
  limit?: number;
  status?: DiscoveryStatus;
}

export interface AddDiscoveryToJourneyInput {
  discoveryId: string;
  companionId?: string;
  journeyId?: string;
  createJourneyTitle?: string;
}

export interface CreateMemoryNodeInput {
  companionId?: string;
  type: MemoryNodeType;
  title: string;
  summary?: string;
  content?: string;
  source?: string;
  sourceUrl?: string;
}

export interface UpdateMemoryNodeInput extends Partial<CreateMemoryNodeInput> {
  id: string;
  isPinned?: boolean;
  isMarkedWrong?: boolean;
}

export interface CreateMemoryEdgeInput {
  companionId?: string;
  fromNodeId: string;
  toNodeId: string;
  relationType: MemoryRelation;
  confidence?: number;
}

export interface CreateJourneyInput {
  title: string;
  description?: string;
}

export interface AddJourneyMilestoneInput {
  journeyId: string;
  title: string;
  summary?: string;
  type: JourneyMilestone['type'];
}

export interface ChatInput {
  message: string;
  characterId?: string;
}

export type CompanionSessionPhase =
  | 'inactive'
  | 'opening'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'talking'
  | 'responding'
  | 'waiting_for_user'
  | 'paused'
  | 'closing';

export interface TranscribeAudioInput {
  audio: ArrayBuffer;
  mimeType?: string;
  language?: string;
}

export interface CompanionTurnInput {
  message: string;
  source: 'voice' | 'panel_text' | 'companion_text';
  characterId?: string;
}

export type CompanionTurnIntent =
  | 'conversation'
  | 'action'
  | 'conversation_and_action'
  | 'cannot_complete';

export interface CompanionTurnActionRequest {
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
}

export interface CompanionTurnMemoryCandidate {
  type: 'user_preference' | 'user_fact' | 'user_boundary' | 'goal';
  summary: string;
  evidence: string;
  confidence: number;
}

export type ReplySegmentProvenance = 'current_turn' | 'general_knowledge' | 'memory';

/** A model-authored fragment that does not make a persistent-Memory claim. */
export interface NonMemoryReplySegment {
  segmentId: string;
  text: string;
  provenance: 'current_turn' | 'general_knowledge';
}

/**
 * A reference to a deterministically rendered Memory fact. The model cannot
 * supply, frame, or rewrite the factual payload itself.
 */
export interface MemoryReferenceReplySegment {
  segmentId: string;
  provenance: 'memory';
  supportingMemoryId: string;
}

export type GroundedReplySegment = NonMemoryReplySegment | MemoryReferenceReplySegment;

/** The only user-visible reply representation accepted from the model. */
export function assembleCompanionReply(
  segments: GroundedReplySegment[],
  renderMemory?: (segment: MemoryReferenceReplySegment) => string | undefined,
): string {
  return segments.map((segment) => {
    if (segment.provenance !== 'memory') return segment.text;
    return renderMemory?.(segment) ?? '';
  }).join('');
}

export interface CompanionTurnProposal {
  replySegments: GroundedReplySegment[];
  intent: CompanionTurnIntent;
  actions: CompanionTurnActionRequest[];
  memoryCandidates: CompanionTurnMemoryCandidate[];
}

export interface MemoryContextItem {
  memoryId: string;
  type: TypedMemoryType | MemoryNodeType;
  summary: string;
  confidence: number;
  importance: number;
  pinned: boolean;
  selectedBecause: string;
}

export interface CompanionMemoryContext {
  pinned: MemoryContextItem[];
  boundaries: MemoryContextItem[];
  preferences: MemoryContextItem[];
  goals: MemoryContextItem[];
  relevant: MemoryContextItem[];
  recent: MemoryContextItem[];
  selectedCount: number;
  characterCount: number;
  maxItems: number;
  maxCharacters: number;
  /** Development-only explanation of the hybrid retrieval decision. */
  retrievalTrace?: MemoryRetrievalTrace;
}

export type MemoryStatus = 'candidate' | 'active' | 'superseded' | 'archived';

export interface MemoryRetrievalTrace {
  query: string;
  vectorAvailable: boolean;
  vectorUnavailableReason?: 'maintenance' | 'extension_unavailable' | 'model_unavailable';
  candidates: Array<{
    memoryId: string;
    sources?: Array<'structured' | 'pinned' | 'open_loop' | 'fts' | 'vector'>;
    semanticScore?: number;
    keywordScore?: number;
    finalScore?: number;
    selected: boolean;
    reason: string;
  }>;
  rejected: Array<{ memoryId: string; reason: string }>;
}

export interface CharacterContract {
  version: number;
  sourceRevision?: number;
  sourceHash?: string;
  identity: { name: string; selfConcept: string; role: string; forbiddenSelfIdentityClaims: string[] };
  corePersonality: { stableTraits: string[]; values: string[]; decisionPrinciples: string[]; hardContradictions: string[] };
  voice: { tone: string[]; preferredVerbosity: 'short' | 'balanced' | 'detailed'; typicalPatterns: string[]; avoidPatterns: string[] };
  knowledgeBoundary: { knownDomains: string[]; mayUseGeneralKnowledge: boolean; uncertaintyPolicy: string };
  privacyBoundary: { neverDisclose: string[]; disclosureRules: string[] };
  evolutionPolicy: { immutableTraits: string[]; mutableTraits: string[]; changeRequiresEvidence: boolean };
}

export type OocViolationType =
  | 'identity_break' | 'prompt_or_tool_leak' | 'persona_contradiction'
  | 'knowledge_boundary_violation' | 'privacy_violation' | 'unsupported_memory_claim'
  | 'superseded_memory_usage' | 'style_drift';

export interface OocViolation {
  type: OocViolationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: string;
  ruleId: string;
}

export interface OocValidationResult {
  passed: boolean;
  violations: OocViolation[];
  recommendedAction: 'pass' | 'repair' | 'regenerate' | 'fallback';
}

export interface GenerationContextMetadata {
  companionId: string;
  userId: string;
  selectedMemoryIds: string[];
  activeMemoryFacts: Array<{ memoryId: string; type: string; content: string; confidence: number; status: MemoryStatus; sensitivity?: MemorySensitivity; userId?: string; companionId?: string }>;
  characterContractVersion: number;
  promptTemplateVersion: number;
}

export interface RememberedMemoryMutation {
  memoryId: string;
  summary: string;
  mutation: 'created' | 'updated' | 'observed';
  undoToken: string;
}

export type CompanionTurnActionStatus =
  | 'executed'
  | 'blocked'
  | 'permission_denied'
  | 'cancelled'
  | 'adapter_failed'
  | 'invalid_arguments'
  | 'unsupported_tool';

export interface CompanionTurnResult {
  turnId: string;
  message: string;
  kind: 'conversation' | 'action_completed' | 'action_failed' | 'awaiting_permission';
  actionPlan?: ActionPlan;
  actionResult?: ActionResult;
  actionStatus?: CompanionTurnActionStatus;
  requiredScopes?: PermissionScope[];
  remembered?: RememberedMemoryMutation[];
}

export interface ResolveCompanionTurnPermissionInput {
  turnId: string;
  decision: 'allow_once' | 'always_allow' | 'cancel';
}

export interface TurnInspectionRecord {
  turnId: string;
  companionId: string;
  inputSource: CompanionTurnInput['source'];
  inputSummary: string;
  memoryItemsSelected: Array<{ memoryId: string; category: string; selectedBecause: string }>;
  memoryBudget: { itemCount: number; characterCount: number; maxItems: number; maxCharacters: number };
  deterministicActionMatch?: string;
  aiStructuredResult?: CompanionTurnProposal;
  validatedActions: CompanionTurnActionRequest[];
  rejectedActions: Array<CompanionTurnActionRequest & { reason: string }>;
  permissionState?: 'not_required' | 'awaiting_permission' | 'granted' | 'denied' | 'cancelled';
  executionResult?: CompanionTurnActionStatus;
  memoryCandidates: CompanionTurnMemoryCandidate[];
  memoryOutcomes: Array<{ memoryId?: string; summary: string; outcome: 'created' | 'updated' | 'observed' | 'discarded'; reason?: string }>;
  finalReplySource?: 'ai_conversation' | 'deterministic_action_result' | 'safe_fallback' | 'permission_cancelled';
  finalReply?: string;
  createdAt: string;
  completedAt?: string;
  retrievalTrace?: MemoryRetrievalTrace;
  oocValidation?: OocValidationResult;
  oocAction?: 'pass' | 'repair' | 'regenerate' | 'fallback';
  grounding?: {
    passed: boolean;
    regenerationAttempted: boolean;
    regenerationSucceeded: boolean;
    embeddingAvailable: boolean;
    segmentResults: Array<{
      segmentId: string;
      provenance: ReplySegmentProvenance;
      supportingMemoryId?: string;
      valid: boolean;
      reason?: string;
      similarity?: number;
    }>;
  };
}

export interface MemoryProcessingState {
  memoryId: string;
  companionId: string;
  contentHash: string;
  revision: number;
  processedRevision: number;
  processedAt?: string;
  deletedAt?: string;
}

export const COMPANION_CHAT_RETENTION_DAYS = 7;
export const COMPANION_CHAT_CONTEXT_LIMIT = 12;

export type CompanionMessageRole = 'user' | 'assistant' | 'system';
export type CompanionMessageSource = 'voice' | 'panel' | 'companion_text';
export type CompanionMessageStatus = 'ok' | 'error' | 'empty_transcript';

export interface CompanionMessage {
  id: string;
  characterId: string;
  sessionId?: string;
  role: CompanionMessageRole;
  content: string;
  source: CompanionMessageSource;
  status: CompanionMessageStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CompanionHistoryInput {
  characterId?: string;
  limit?: number;
  source?: CompanionMessageSource | 'all';
  status?: CompanionMessageStatus | 'all';
  query?: string;
}

export interface CompanionAppendMessageInput {
  characterId?: string;
  sessionId?: string;
  role: CompanionMessageRole;
  content: string;
  source: CompanionMessageSource;
  status?: CompanionMessageStatus;
  metadata?: Record<string, unknown>;
}

export interface SpeechStatus {
  ready: boolean;
  model: string;
  error?: string;
}

export interface SpeechSettings {
  useGpu: boolean;
}

export interface UpdateSpeechSettingsInput {
  useGpu?: boolean;
}

export type CompanionReplyLanguage = 'en' | 'zh-CN';
export type UiLang = 'en' | 'zh-CN';

export interface AiDebugEntry {
  id: string;
  channel: 'chat' | 'turn' | 'discovery_reason' | 'personality_analysis' | 'discovery_research_plan' | 'discovery_evidence_synthesis';
  source: string;
  status: 'success' | 'error';
  requestMessages: Array<{ role: string; content: string }>;
  requestBody?: unknown;
  rawResponse?: unknown;
  content: string;
  error?: string;
  createdAt: string;
}

export type DeveloperDebugEventKind = 'ai_call' | 'research_search' | 'research_page_fetch' | 'research_evidence' | 'evidence_synthesis' | 'pipeline_failure';

export interface DeveloperDebugEventInput {
  kind: DeveloperDebugEventKind;
  operation?: string;
  status?: string;
  provider?: string;
  model?: string;
  source?: string;
  companionId?: string;
  correlationId?: string;
  cycleId?: string;
  turnId?: string;
  summary?: string;
  payload?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface DeveloperDebugEvent extends DeveloperDebugEventInput {
  id: string;
  createdAt: string;
  syncStatus: 'pending' | 'uploading' | 'uploaded';
  syncAttemptCount: number;
  lastSyncAttemptAt?: string;
  uploadedAt?: string;
}

export interface DeveloperDebugEventQuery {
  kinds?: DeveloperDebugEventKind[];
  operation?: string;
  status?: string;
  provider?: string;
  cycleId?: string;
  correlationId?: string;
  turnId?: string;
  syncStatus?: DeveloperDebugEvent['syncStatus'];
  limit?: number;
  offset?: number;
}

export interface DeveloperDebugUploadEvent {
  clientEventId: string;
  kind: string;
  operation?: string;
  status?: string;
  provider?: string;
  model?: string;
  companionId?: string;
  correlationId?: string;
  cycleId?: string;
  turnId?: string;
  summary?: string;
  payload: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  clientCreatedAt: string;
}

export interface EvidenceSynthesisResult {
  title: string;
  summary: string;
  keyFacts: Array<{
    statement: string;
    evidenceIds: string[];
  }>;
  whyRelevant: string;
  uncertainties: string[];
  supportingEvidenceIds: string[];
}

export interface EvidenceInput {
  id: string;
  title: string;
  canonicalUrl: string;
  domain: string;
  excerpt: string;
  extractedText: string;
  publishedAt?: string;
  contentHash: string;
}

export interface SynthesizeDiscoveryInsightInput {
  evidence: EvidenceInput[];
  candidates: Array<{
    id: string;
    title: string;
    summary: string;
    relevanceScore: number;
    noveltyScore: number;
    usefulnessScore: number;
    evidenceScore?: number;
    evidenceIds?: string[];
    sourceUrl?: string;
    sourceName?: string;
  }>;
  context: {
    userId: string;
    companionId: string;
    characterState: CharacterRuntimeState;
    characterProfile?: CharacterProfile;
    memoryNodes: MemoryNode[];
    patterns: Pattern[];
    interestGraph: InterestGraph;
    curiosityTarget: CuriosityTarget;
  };
}

export interface SynthesizeDiscoveryInsightResult {
  insight: {
    id: string;
    userId: string;
    category: InsightCategory;
    title: string;
    summary: string;
    explanation: string;
    supportingPatternIds: string[];
    supportingMemoryIds: string[];
    confidence: number;
    importance: number;
    novelty: number;
    evidenceCount: number;
    status: 'active' | 'archived';
    createdAt: string;
    updatedAt: string;
  };
  evidenceIds: string[];
  synthesisResult?: EvidenceSynthesisResult;
  usedFallback: boolean;
  debugMetadata?: {
    inputCharacterCount: number;
    evidenceCount: number;
    validated: boolean;
    rejectionReason?: string;
  };
}

export interface AiSettings {
  provider: 'deepseek';
  model: string;
  endpoint: string;
  apiKeyConfigured: boolean;
  replyLanguage: CompanionReplyLanguage;
  uiLang: UiLang;
}

export interface UpdateAiSettingsInput {
  model?: string;
  endpoint?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  replyLanguage?: CompanionReplyLanguage;
  uiLang?: UiLang;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowMousePassthroughInput {
  passthrough: boolean;
}

export interface CharacterBehaviorSettings {
  movementDefault: number;
  movementOverride?: number;
  effectiveMovement: number;
  source: 'character' | 'override';
}

export interface UpdateCharacterBehaviorSettingsInput {
  movementOverride?: number;
  resetMovement?: boolean;
}

export type DebugDataResetTarget =
  | 'discoveries'
  | 'memory'
  | 'journeys'
  | 'diary'
  | 'chat'
  | 'autonomy'
  | 'all_debug_data';

export interface DebugDataResetInput {
  targets: DebugDataResetTarget[];
}

export interface DebugDataResetResult {
  targets: DebugDataResetTarget[];
  clearedTables: string[];
  completedAt: string;
}

export interface RuntimeTimeStatus {
  realTime: string;
  runtimeTime: string;
  offsetMs: number;
  debugAvailable: boolean;
  lastSchedulerTick?: string;
}

export interface RuntimeSchedulerReport {
  previousRuntimeTime: string;
  newRuntimeTime: string;
  schedulersExecuted: string[];
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  cooldownsExpired: number;
  errors: string[];
}

export interface ResearchDeveloperReport {
  mode: 'fixture' | 'manual_url';
  researchIntentId: string;
  researchPlanId: string;
  queries: string[];
  capabilitiesSelected: string[];
  pagesFetched: number;
  evidenceAccepted: number;
  evidenceRejected: number;
  candidatesCreated: number;
  duplicatesSkipped: number;
  insightsGenerated: number;
  stopReason: string;
  correlationId: string;
}

export interface DiscoveryInspectionRecord {
  cycleId: string;
  companionId: string;
  mode: 'core' | 'adjacent' | 'wildcard' | 'challenge';
  intentQuestion: string;
  expectedValue: string;
  freshness: string;
  trustRequirement: string;
  languages: string[];
  regions: string[];
  contextCount: number;
  connectorCapabilities: Array<{
    id: string;
    mode: EngineProviderMode;
    available: boolean;
  }>;
  selectedBases: Array<{
    id: string;
    connectorId: string;
    state: string;
    locator: string;
  }>;
  executedBases: Array<{
    id: string;
    connectorId: string;
    state: string;
    locator: string;
  }>;
  plannerMode?: 'ai' | 'fallback' | 'unavailable';
  plannerReason?: string;
  enabledChannels?: string[];
  selectedChannels?: Array<{
    platformId: string;
    query: string;
    rationale: string;
  }>;
  skippedChannels?: Array<{
    platformId: string;
    reason: string;
  }>;
  candidatesAccepted: string[];
  candidatesRejected: Array<{
    candidateId: string;
    reason: string;
  }>;
  dedupHits: Partial<Record<
    'external_id' | 'canonical_url' | 'content_hash' | 'event_key' | 'fingerprint' | 'topic',
    number
  >>;
  duplicateCount: number;
  revivalCount: number;
  materialUpdateCount: number;
  newCount: number;
  saturationPenalty: number;
  createdAt: string;
}

export interface MemoryImpactReport {
  memory: MemoryNode;
  normalizedTopics: string[];
  interestNodeIds: string[];
  patternIds: string[];
  curiosityTargetIds: string[];
  researchIntentIds: string[];
  explorationCycleIds: string[];
  discoveryCandidateIds: string[];
  insightIds: string[];
  lastCognitiveEvaluation?: string;
}

export interface MemoryImpactRecomputeReport {
  memoryId: string;
  interestNodesAdded: number;
  interestNodesUpdated: number;
  patternsCreated: number;
  patternsUpdated: number;
  curiosityTargetsCreated: number;
  curiosityTargetsUpdated: number;
  duplicatesSkipped: number;
  researchCyclesStarted: number;
  errors: string[];
  evaluatedAt: string;
}

export interface FoundationEventLogInput {
  limit?: number;
  source?: string;
  type?: string;
}

export interface EngineSnapshotInput {
  userId?: string;
  cycleId?: string;
  correlationId?: string;
  traceLimit?: number;
}

export type EngineProviderMode =
  | 'live'
  | 'mock'
  | 'fixture'
  | 'deterministic'
  | 'unavailable';

export type EngineTraceStatus =
  | 'started'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'empty';

export interface EngineTrace {
  id: string;
  correlationId: string;
  causationId?: string;
  cycleId?: string;
  companionId: string;
  engine: string;
  operation: string;
  providerMode: EngineProviderMode;
  inputRefs: string[];
  outputRefs: string[];
  stateBeforeHash?: string;
  stateAfterHash?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: EngineTraceStatus;
  skipReason?: string;
  error?: string;
}

export interface DiscoverySchedulingDebug {
  isBusy: boolean;
  hasPending: boolean;
  pendingDiscoveryId?: string;
  queueLength: number;
  lastTickAt?: string;
  lastSkipReason?: string;
  lastAnnouncedId?: string;
  isProcessing: boolean;
  nextRetryAt?: number;
  unannouncedCount: number;
  announcedCount: number;
  queue?: Array<{
    id: string;
    title: string;
    status: string;
    retryCount: number;
    interruptCount: number;
    retryAfterAt?: number;
  }>;
}

export interface EngineSnapshot {
  capturedAt: string;
  characterState?: CharacterRuntimeState;
  currentCycle?: ExplorationCycle;
  recentCycles: ExplorationCycle[];
  patterns: Pattern[];
  interestGraph: InterestGraph;
  curiosityTargets: CuriosityTarget[];
  researchIntent?: ResearchIntent;
  researchPlan?: ResearchPlan;
  researchEvidence: WebPageEvidence[];
  researchCapabilities: ResearchCapabilityStatus[];
  researchCoverage?: ResearchEvidenceCoverage;
  researchStopReason?: string;
  discoveryCandidates: DiscoveryCandidate[];
  insights: GeneratedInsight[];
  explorationEvents: ExplorationLoopEvent[];
  recentDiscoveries: Discovery[];
  actionPermissions: ActionPermissionState;
  discoveryScheduling: DiscoverySchedulingDebug;
  discoveryInspection?: DiscoveryInspectionRecord;
  engineTraces: EngineTrace[];
  turnInspections: TurnInspectionRecord[];
}

export interface DiscoveryReason {
  why_this_matters: string;
  recommended_action: 'view' | 'save' | 'ignore' | 'add_to_journey';
  short_message: string;
  card_title?: string;
  card_body?: string;
  tags: string[];
}

export interface DiscoveryAnnouncePayload {
  discoveryId: string;
  title: string;
  message: string;
  cycleId?: string;
  insightId?: string;
  cardBody?: string;
  whyThisMatters?: string;
  recommendedAction?: 'view' | 'save' | 'ignore' | 'add_to_journey';
  tags?: string[];
  source?: string;
  sourceUrl?: string;
}

export interface MemorySummary {
  type: MemoryNodeType;
  title: string;
  summary: string;
  importance_score: number;
}

export interface ToolIntent {
  tool_name: ToolName | 'none';
  args: Record<string, unknown>;
  requires_confirmation: boolean;
  user_facing_summary: string;
}

export interface WorkspaceStatusMetrics {
  cpuUsage?: number;
  memoryUsage?: number;
  memoryTotal?: number;
  memoryUsed?: number;
  gpuStatus?: string;
  batteryPercent?: number;
  batteryCharging?: boolean;
  networkOnline?: boolean;
  uptime?: number;
  platform?: string;
  hostname?: string;
  cpuModel?: string;
  cpuCores?: number;
  arch?: string;
}

export interface WorkspaceSummary {
  cpu: 'low' | 'medium' | 'high' | 'unknown';
  memory: 'low' | 'medium' | 'high' | 'unknown';
  battery: 'charging' | 'normal' | 'low' | 'unknown';
  network: 'online' | 'offline' | 'unknown';
}

export interface WorkspaceStatusSnapshot {
  metrics: WorkspaceStatusMetrics;
  summary: WorkspaceSummary;
  lastUpdatedAt: number;
  availableMetrics: string[];
  unavailableMetrics: string[];
}

// ============================================================================
// USER & ONLINE MODE
// ============================================================================

export type OnlineMode = 'online' | 'offline';

export type NetworkConnectionState = 'offline' | 'checking_server' | 'authentication_required' | 'connecting' | 'online' | 'reconnecting' | 'incompatible_client' | 'server_unavailable' | 'authentication_failed' | 'disabled';
export interface VisitRuntimeConfig { heartbeatIntervalSeconds: number; heartbeatTimeoutSeconds: number; }
export interface NetworkStatus {
  state: NetworkConnectionState;
  onlineModeEnabled: boolean;
  serverUrl: string;
  account?: { id: string; email: string; username: string; uid: string; friendCode: string };
  message?: string;
  remoteRevocationConfirmed?: boolean;
  socialRevision?: number;
  socialInvalidation?: SocialInvalidation;
  features?: { visitInvitations: boolean; visitSessions: boolean; [feature: string]: boolean };
  visit?: VisitRuntimeConfig;
}

export type SocialInvalidation =
  | { type: 'friends' }
  | { type: 'presence'; userId: string; status: FriendPresence; updatedAt: string | null }
  | { type: 'companion_profile'; ownerUserId: string; companionId: string; unpublished?: boolean }
  | { type: 'companion_asset_pack'; ownerUserId: string; companionId: string; assetPackId: string }
  | { type: 'visit_invitation'; invitationId: string }
  | { type: 'visit_session'; sessionId: string; state?: VisitSessionState };

export type FriendPresence = 'online' | 'idle' | 'offline';
export type FriendLookupRelationship = 'none' | 'friend' | 'incoming_request' | 'outgoing_request';
export interface FriendLookupResult { id: string; username: string; uid: string; friendCode?: string; relationship: FriendLookupRelationship; }
export interface FriendSummary { userId: string; username: string; uid: string; friendCode?: string; presence: FriendPresence; hasPublishedCompanion: boolean; }
export interface FriendRequestSummary { id: string; direction: 'incoming' | 'outgoing'; userId: string; username: string; uid: string; friendCode?: string; status: 'pending'; createdAt: string; }
export interface BlockedUserSummary { userId: string; username: string; uid?: string; blockedAt: string; }
export interface PublicCompanionProfile {
  id: string;
  ownerUserId: string;
  name: string;
  publicDescription?: string;
  publicTags: string[];
  visibility: 'friends_only';
  published: boolean;
  activeAssetPackId?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}
export interface CompanionAssetManifest {
  format: 'our-companion-asset-pack';
  schemaVersion: 1;
  runtime: { defaultAnimation: 'Idle_Neutral'; portraitPath?: string; iconPath?: string; animations: Array<{ name: string; format: 'sprite_sheet' | 'frame_sequence' | 'gif' | 'static'; files: string[]; frameWidth?: number; frameHeight?: number; frameCount?: number; frameDurationMs?: number; loop: boolean }> };
  files: Array<{ relativePath: string; category: 'animation' | 'portrait' | 'icon' | 'voice' | 'metadata'; mimeType: string; sizeBytes: number; sha256: string }>;
}
export interface BuiltAssetPack { manifest: CompanionAssetManifest; manifestHash: string; totalFiles: number; totalBytes: number; requiredAnimations: Readonly<Partial<Record<CompanionAnimationName, true>>>; }
export interface NetworkAssetPack { id: string; companionId: string; manifestHash: string; schemaVersion: number; status: 'draft' | 'uploading' | 'verifying' | 'active' | 'superseded' | 'deleting' | 'failed' | 'abandoning' | 'abandoned'; totalFiles: number; totalBytes: number; failureCode?: string; createdAt: string; updatedAt: string; completedAt?: string; activatedAt?: string; supersededAt?: string; }
export interface CompleteAssetPackResult { assetPack: NetworkAssetPack; companion: PublicCompanionProfile; }
export interface NetworkCompanionLink { serverOrigin: string; networkAccountId: string; localCompanionId: string; networkCompanionId: string; activeAssetPackId?: string; lastPublishedManifestHash?: string; lastPublishedAt?: string; publishStatus?: string; }
export interface AssetUploadProgress { assetPackId?: string; completedFiles: number; totalFiles: number; uploadedBytes: number; totalBytes: number; currentFile?: string; state: 'preparing' | 'uploading' | 'verifying' | 'completed' | 'failed' | 'cancelled'; failureCode?: string; }
export interface CachedAssetPack { serverOrigin: string; assetPackId: string; networkCompanionId: string; manifestHash: string; totalBytes: number; downloadedAt: string; lastUsedAt: string; pinned: boolean; verified: boolean; }
export type VisitInvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export type VisitSessionState = 'preparing' | 'ready' | 'active' | 'ending' | 'ended' | 'cancelled' | 'failed';
export interface VisitInvitationSummary {
  id: string;
  visitorOwnerUserId: string;
  hostUserId: string;
  networkCompanionId: string;
  assetPackId: string;
  companionName: string;
  companionDescription?: string;
  companionTags: string[];
  status: VisitInvitationStatus;
  expiresAt: string;
  respondedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface VisitSessionSummary {
  id: string;
  invitationId: string;
  visitorOwnerUserId: string;
  hostUserId: string;
  networkCompanionId: string;
  assetPackId: string;
  state: VisitSessionState;
  visitorOwnerReady: boolean;
  hostReady: boolean;
  readyAt?: string;
  startedAt?: string;
  endedAt?: string;
  endReason?: string;
  failureCode?: string;
  createdAt: string;
  updatedAt: string;
}
export type VisualVisitState = 'entering' | 'idle' | 'walking' | 'leaving';
export type VisualVisitFacing = 'left' | 'right' | 'up' | 'down' | 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
/** Sanitized, renderer-safe description of one remote visual-only Visit participant. */
export interface VisualVisitRenderModel {
  runtimeId: string;
  sessionId: string;
  networkCompanionId: string;
  assetPackId: string;
  name: string;
  role: 'remote_visitor';
  state: VisualVisitState;
  animationName: string;
  x: number;
  y: number;
  facing: VisualVisitFacing;
  sceneSlotIndex: number;
  assetUrls: Record<string, string>;
  frameTiming: Record<string, { frameDurationMs: number; loop: boolean }>;
}
export type VisualVisitRendererError = 'VISUAL_VISIT_ASSET_UNAVAILABLE' | 'VISUAL_VISIT_OWNER_MAPPING_UNAVAILABLE' | 'VISUAL_VISIT_RENDERER_UNAVAILABLE' | 'VISUAL_VISIT_CAPACITY_REACHED' | 'VISUAL_VISIT_HOST_AWAY_CONFLICT';
export interface VisualVisitRendererState {
  ownerPresenceMode: 'home' | 'away_visiting';
  capacity: number;
  visitors: Record<string, VisualVisitRenderModel>;
  /** Terminal visitors kept briefly so the local renderer can play Leave. */
  departingVisitors: Record<string, VisualVisitRenderModel>;
  visitorOrder: string[];
  errors: Record<string, VisualVisitRendererError>;
}
/** Sanitized, smoke-runtime-only state. It is unavailable from normal builds. */
export interface SmokeTestState {
  instanceRole?: 'visitor_owner' | 'host';
  network: { state: string; onlineModeEnabled: boolean; accountId?: string; serverOrigin?: string };
  device: { deviceIdHash: string };
  visit?: { sessionId: string; state: string; role: 'visitor_owner' | 'host'; visitorOwnerReady: boolean; hostReady: boolean };
  visits?: Array<{ sessionId: string; state: string; role: 'visitor_owner' | 'host'; visitorOwnerReady: boolean; hostReady: boolean }>;
  visual: {
    ownerPresenceMode: 'home' | 'away_visiting';
    capacity: number;
    visitors: Array<{ runtimeId: string; sessionId: string; assetPackId: string; animationName?: string; observedAnimations?: string[]; x?: number; y?: number; sceneSlotIndex: number; departing?: boolean; error?: VisualVisitRendererError }>;
    errors?: Record<string, VisualVisitRendererError>;
  };
}
export interface SmokeVisualRuntimeUpdate { sessionId: string; animationName: string; x: number; y: number; }
export interface SocialState {
  scope?: { serverUrl: string; accountId: string };
  friends: FriendSummary[];
  incomingRequests: FriendRequestSummary[];
  outgoingRequests: FriendRequestSummary[];
  blockedUsers: BlockedUserSummary[];
  loading: boolean;
  error?: string;
  lastSynchronizedAt?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterUserInput {
  username: string;
  displayName: string;
  email?: string;
  password: string;
}

export interface LoginUserInput {
  username: string;
  password: string;
}

export interface AuthState {
  mode: OnlineMode;
  user: UserProfile | null;
  token: string | null;
}

export interface OurCompanionApi {
  character: {
    getState(characterId?: string): Promise<CharacterRuntimeState>;
    getActive(): Promise<CharacterProfile[]>;
    getBehaviorSettings(characterId?: string): Promise<CharacterBehaviorSettings>;
    updateBehaviorSettings(input: UpdateCharacterBehaviorSettingsInput): Promise<CharacterBehaviorSettings>;
    setPrimary(characterId: string): Promise<CharacterProfile>;
    updatePosition(input: { characterId?: string; x: number; y: number }): Promise<CharacterRuntimeState>;
    triggerBehavior(input: { characterId?: string; event: string }): Promise<CharacterRuntimeState>;
    onStateChange(listener: (state: CharacterRuntimeState) => void): () => void;
  };
  discovery: {
    getFeed(input?: DiscoveryFeedInput): Promise<Discovery[]>;
    refresh(input?: { sources?: DiscoverySource[] }): Promise<Discovery[]>;
    markInterested(discoveryId: string): Promise<Discovery>;
    markNotInterested(discoveryId: string): Promise<Discovery>;
    addToJourney(input: AddDiscoveryToJourneyInput): Promise<{ journey: CompanionJourney; milestone: JourneyTimelineEntry; memory: MemoryRecord }>;
    listBases(): Promise<DiscoveryBase[]>;
    addBase(input: AddDiscoveryBaseInput): Promise<DiscoveryBase>;
    updateBaseState(input: UpdateDiscoveryBaseStateInput): Promise<DiscoveryBase>;
    deleteBase(baseId: string): Promise<{ deleted: true }>;
    runBaseNow(baseId: string): Promise<ExplorationCycleResult>;
    listChannels(): Promise<CompanionDiscoveryChannel[]>;
    updateChannelState(input: {
      platformId: DiscoveryPlatformId;
      state: DiscoveryChannelState;
    }): Promise<CompanionDiscoveryChannel>;
    exploreChannelNow(platformId: DiscoveryPlatformId): Promise<ExplorationCycleResult>;
    listSuppressedPlatforms(): Promise<CompanionDiscoveryChannel[]>;
    restoreManagedPlatform(platformId: DiscoveryPlatformId): Promise<CompanionDiscoveryChannel>;
    getDiscoveryProfile(): Promise<CompanionDiscoveryProfile | null>;
    getAutoManageDefaultPlatforms(): Promise<boolean>;
    setAutoManageDefaultPlatforms(enabled: boolean): Promise<boolean>;
    getBootstrapStatus(): Promise<DiscoveryBootstrapResult | null>;
    getWebSearchDiagnostics(): Promise<WebSearchProviderDiagnostics>;
    onAnnounce(listener: (payload: DiscoveryAnnouncePayload) => void): () => void;
    generateNow(): Promise<Discovery[]>;
    presentNext(): Promise<boolean>;
    resetLifecycle(): Promise<{ reset: boolean }>;
    countPendingAnnouncements(): Promise<{ count: number }>;
    resetAnnouncementHistory(): Promise<{ count: number }>;
    clearPool(): Promise<{ cleared: boolean }>;
    simulateCanAnnounceDisabled(disabled: boolean): Promise<{ disabled: boolean }>;
    simulateInterruptEnabled(enabled: boolean): Promise<{ enabled: boolean }>;
    clearSimulation(): Promise<{ cleared: boolean }>;
    getSimulationState(): Promise<{ canAnnounceDisabled: boolean; interruptEnabled: boolean }>;
  };
  autonomy: {
    startExploration(input?: StartExplorationInput): Promise<ExplorationCycleResult>;
    getCurrentCycle(): Promise<ExplorationCycle | undefined>;
    getCycleHistory(input?: { limit?: number }): Promise<ExplorationCycle[]>;
    submitFeedback(input: SubmitDiscoveryFeedbackInput): Promise<DiscoveryFeedback>;
    onExplorationEvent(listener: (event: ExplorationLoopEvent) => void): () => void;
  };
  memory: {
    createNode(input: CreateMemoryNodeInput): Promise<MemoryRecord>;
    updateNode(input: UpdateMemoryNodeInput): Promise<MemoryRecord>;
    getNode(id: string): Promise<MemoryNode | undefined>;
    deleteNode(id: string): Promise<{ id: string; deleted: true }>;
    createEdge(input: CreateMemoryEdgeInput): Promise<MemoryEdge>;
    getGraph(input?: { query?: string; companionId?: string }): Promise<KnowledgeGraph>;
    search(input: { query: string; companionId?: string }): Promise<MemoryRecord[]>;
    inspectImpact(id: string): Promise<MemoryImpactReport>;
    recomputeImpact(input: { id: string; explore?: boolean }): Promise<MemoryImpactRecomputeReport>;
  };
  journey: {
    create(input: CreateJourneyInput): Promise<CompanionJourney>;
    getActive(): Promise<CompanionJourney[]>;
    getTimeline(input?: { journeyId?: string }): Promise<JourneyTimelineEntry[]>;
    addMilestone(input: AddJourneyMilestoneInput): Promise<JourneyTimelineEntry>;
  };
  diary: {
    getEntries(input?: { characterId?: string; type?: DiaryEntry['type']; limit?: number }): Promise<DiaryEntry[]>;
    generateDaily(input?: { characterId?: string }): Promise<DiaryEntry>;
  };
  tool: {
    preview(input: ToolExecuteInput): Promise<ToolPreview>;
    execute(input: ToolExecuteInput): Promise<ToolExecutionResult>;
  };
  action: {
    plan(text: string): Promise<ActionPlan | undefined>;
    executePlan(plan: ActionPlan): Promise<ActionResult>;
    getPermissions(): Promise<ActionPermissionState>;
    updatePermissions(state: ActionPermissionState): Promise<ActionPermissionState>;
    onPerformance(listener: (script: PerformanceScript) => void): () => void;
  };
  ai: {
    getSettings(): Promise<AiSettings>;
    updateSettings(input: UpdateAiSettingsInput): Promise<AiSettings>;
    chat(input: ChatInput): Promise<{ message: string }>;
    generateDiscoveryReason(input: { discovery: NormalizedDiscovery }): Promise<DiscoveryReason>;
    summarizeMemory(input: { content: string }): Promise<MemorySummary>;
    getDebugLog(): Promise<AiDebugEntry[]>;
  };
  debugEvents: {
    listEvents(options?: DeveloperDebugEventQuery): Promise<DeveloperDebugEvent[]>;
    countEvents(options?: DeveloperDebugEventQuery): Promise<number>;
  };
  speech: {
    transcribe(input: TranscribeAudioInput): Promise<{ text: string; language?: string }>;
    getStatus(): Promise<SpeechStatus>;
    getSettings(): Promise<SpeechSettings>;
    updateSettings(input: UpdateSpeechSettingsInput): Promise<SpeechSettings>;
  };
  companion: {
    turn(input: CompanionTurnInput): Promise<CompanionTurnResult>;
    resolveTurnPermission(input: ResolveCompanionTurnPermissionInput): Promise<CompanionTurnResult>;
    undoRememberedMemory(undoToken: string): Promise<{ undone: boolean; memoryId?: string }>;
    onToggleListen(listener: () => void): () => void;
    onRefresh(listener: () => void): () => void;
    reportSessionPhase(phase: CompanionSessionPhase): Promise<void>;
    reportDragging(input: { dragging: boolean }): Promise<void>;
    getAttentionMode(): Promise<'available' | 'focused' | 'do_not_disturb'>;
    setAttentionMode(mode: 'available' | 'focused' | 'do_not_disturb'): Promise<void>;
    listPendingActions(): Promise<PendingCompanionAction[]>;
    cancelPendingAction(id: string): Promise<void>;
    getActiveCommand(): Promise<CompanionCommand | null>;
    onCommand(listener: (command: CompanionCommand) => void): () => void;
    reportCommandAck(ack: CompanionCommandAck): Promise<void>;
    getHistory(input?: CompanionHistoryInput): Promise<CompanionMessage[]>;
    appendMessage(input: CompanionAppendMessageInput): Promise<CompanionMessage>;
    clearHistory(input?: { characterId?: string }): Promise<void>;
    getOverlayDebug(): Promise<{
      mode: 'workarea-overlay';
      bounds?: WindowBounds;
      workArea?: WindowBounds;
      display?: { id: number; label: string; size: { width: number; height: number } };
      clickThrough?: boolean;
    }>;
    onDisplayChanged(listener: (info: { workArea: WindowBounds; display: { id: number; label: string; size: { width: number; height: number } } }) => void): () => void;
  };
  debug: {
    resetData(input: DebugDataResetInput): Promise<DebugDataResetResult>;
    getFoundationLog(input?: FoundationEventLogInput): Promise<BaseEvent[]>;
    getEngineSnapshot(input?: EngineSnapshotInput): Promise<EngineSnapshot>;
    getRuntimeTime(): Promise<RuntimeTimeStatus>;
    advanceRuntimeTime(input: { milliseconds: number; runScheduledTick?: boolean }): Promise<RuntimeSchedulerReport>;
    resetRuntimeTime(): Promise<RuntimeTimeStatus>;
    runScheduledTick(): Promise<RuntimeSchedulerReport>;
    runFixtureResearch(input: { topic: string }): Promise<ResearchDeveloperReport>;
    researchFromUrl(input: { url: string }): Promise<ResearchDeveloperReport>;
    getMemoryDiagnostics(): Promise<{
      vector: { available: boolean; extensionVersion?: string; dimensions: number; indexedCount: number; reason?: string };
      embedding: { state: string; modelId: string; dimensions: number; error?: string };
      jobs: Array<{ id: string; memoryId: string; operation: 'upsert' | 'delete'; attempts: number }>;
    }>;
    installLocalEmbeddingModel(): Promise<{ completed: number; failed: number }>;
    rebuildMemoryVectors(): Promise<{
      mode: 'full_rebuild'; vectorsDeleted: number; mappingsReset: number; jobsQueued: number;
      completed: number; failed: number;
      healthBefore: { available: boolean; indexedCount: number };
      healthAfter: { available: boolean; indexedCount: number };
    }>;
    onFoundationEvent(listener: (event: BaseEvent) => void): () => void;
  };
  user: {
    getProfile(): Promise<UserProfile | null>;
    register(input: RegisterUserInput): Promise<UserProfile>;
    login(input: LoginUserInput): Promise<UserProfile>;
    logout(): Promise<void>;
    getMode(): Promise<OnlineMode>;
    setMode(mode: OnlineMode): Promise<OnlineMode>;
    onModeChange(listener: (mode: OnlineMode) => void): () => void;
  };
  network: {
    getStatus(): Promise<NetworkStatus>;
    configureServer(serverUrl: string): Promise<NetworkStatus>;
    register(input: { email: string; username: string; password: string }): Promise<NetworkStatus>;
    login(input: { email: string; password: string }): Promise<NetworkStatus>;
    logout(): Promise<NetworkStatus>;
    enableOnlineMode(): Promise<NetworkStatus>;
    disableOnlineMode(): Promise<NetworkStatus>;
    retryConnection(): Promise<NetworkStatus>;
    onStatusChanged(listener: (status: NetworkStatus) => void): () => void;
    friends: {
      lookup(uid: string): Promise<FriendLookupResult>;
      getAll(): Promise<FriendSummary[]>;
      getIncomingRequests(): Promise<FriendRequestSummary[]>;
      getOutgoingRequests(): Promise<FriendRequestSummary[]>;
      sendRequest(userId: string): Promise<unknown>;
      acceptRequest(requestId: string): Promise<unknown>;
      rejectRequest(requestId: string): Promise<unknown>;
      cancelRequest(requestId: string): Promise<unknown>;
      remove(userId: string): Promise<unknown>;
    };
    blocks: { getAll(): Promise<BlockedUserSummary[]>; block(userId: string): Promise<unknown>; unblock(userId: string): Promise<unknown>; };
    presence: { getFriendPresence(): Promise<Array<{ userId: string; status: FriendPresence; updatedAt?: string | null }>>; sendActivity(): Promise<void>; };
    companions: {
      getMine(): Promise<{ activeNetworkCompanionId?: string; companions: Array<PublicCompanionProfile & { assetPacks: NetworkAssetPack[] }> }>;
      create(input: { localCompanionId: string; name: string; publicDescription?: string; publicTags?: string[] }): Promise<{ networkCompanionId: string; companion: PublicCompanionProfile }>;
      update(companionId: string, input: { name: string; publicDescription?: string; publicTags?: string[] }): Promise<PublicCompanionProfile>;
      activate(companionId: string): Promise<{ activeNetworkCompanionId: string; changed: boolean }>;
      publish(companionId: string): Promise<PublicCompanionProfile>;
      unpublish(companionId: string): Promise<PublicCompanionProfile>;
      getFriendCompanion(friendUserId: string): Promise<PublicCompanionProfile>;
    };
    assets: {
      inspectLocalPack(input: { localCompanionId: string; includeVoices?: boolean }): Promise<BuiltAssetPack>;
      publishPack(input: { localCompanionId: string; networkCompanionId: string; includeVoices?: boolean }): Promise<NetworkAssetPack>;
      cancelPublish(): Promise<void>;
      cancelDownload(): Promise<void>;
      getPublishStatus(): Promise<AssetUploadProgress | undefined>;
      downloadPack(input: { assetPackId: string; networkCompanionId: string }): Promise<CachedAssetPack>;
      getCachedPack(assetPackId: string): Promise<CachedAssetPack | undefined>;
      clearUnusedCache(): Promise<{ removed: number; bytesFreed: number }>;
    };
    visits: {
      invitations: {
        list(input?: { direction?: 'incoming' | 'outgoing'; status?: VisitInvitationStatus }): Promise<VisitInvitationSummary[]>;
        send(hostUserId: string): Promise<VisitInvitationSummary>;
        accept(invitationId: string): Promise<{ invitation: VisitInvitationSummary; session: VisitSessionSummary }>;
        decline(invitationId: string): Promise<VisitInvitationSummary>;
        cancel(invitationId: string): Promise<VisitInvitationSummary>;
      };
      sessions: {
        list(): Promise<VisitSessionSummary[]>;
        get(sessionId: string): Promise<VisitSessionSummary>;
        prepare(sessionId: string): Promise<VisitSessionSummary>;
        start(sessionId: string): Promise<VisitSessionSummary>;
        end(sessionId: string): Promise<VisitSessionSummary>;
      };
      visual: {
        getState(): Promise<VisualVisitRendererState>;
        reportRendererFailure(sessionId: string): Promise<void>;
        completeRendererDeparture(sessionId: string): Promise<void>;
        onChanged(listener: (state: VisualVisitRendererState) => void): () => void;
      };
    };
  };
  window: {
    openPanel(input?: { companionX?: number; companionY?: number; initialTab?: PanelTab }): Promise<boolean>;
    openPanelForSwitch(): Promise<boolean>;
    closePanel(): Promise<boolean>;
    onPanelNavigate(listener: (tab: unknown) => void): () => void;
    showCompanion(): Promise<void>;
    getBounds(): Promise<WindowBounds>;
    getWorkArea(): Promise<WindowBounds>;
    setMousePassthrough(input: WindowMousePassthroughInput): Promise<boolean>;
  };
  creation: {
    completed(companion: CompanionProfile): Promise<boolean>;
    onCompleted(listener: (companion: CompanionProfile) => void): () => void;
    retryCompletion(): Promise<boolean>;
    onStartupFailed(listener: (reason: string) => void): () => void;
    openWindow(): Promise<boolean>;
    closeWindow(): Promise<boolean>;
  };
  workspace: {
    getStatus(): Promise<WorkspaceStatusSnapshot>;
    getSummary(): Promise<WorkspaceSummary>;
  };
  app: {
    quit(): Promise<boolean>;
    exitWithAnimation(): Promise<boolean>;
    onExitAnimation(listener: () => void): () => void;
  };
  dialog: {
    openFiles(): Promise<Array<{ name: string; dataUrl: string }>>;
  };
  companionNew: CompanionApi;
  developer: {
    getUploadSetting(): Promise<boolean>;
    setUploadSetting(enabled: boolean): Promise<void>;
    flushDebugEvents(): Promise<{ uploaded: number; failed: number }>;
    getUploadStatus(): Promise<{
      isDevBuild: boolean;
      onlineModeEnabled: boolean;
      networkState: string;
      authenticated: boolean;
      uploadSettingEnabled: boolean;
      pendingEvents: number;
      lastUploadAt?: string;
      lastUploadError?: string;
    }>;
  };
  /** Present only when OUR_COMPANION_SMOKE_TEST=1 before Electron starts. */
  smoke?: {
    getState(): Promise<SmokeTestState>;
    disconnectSocket(): Promise<void>;
    reconcileVisits(): Promise<void>;
    setOwnerPresenceMode(mode: 'home' | 'away_visiting'): Promise<void>;
    setVisualWorkArea(input: { x: number; y: number; width: number; height: number }): Promise<void>;
    clearVisualWorkArea(): Promise<void>;
    reportVisualRuntime(input: SmokeVisualRuntimeUpdate): Promise<void>;
    simulateRendererFailure(sessionId?: string): Promise<void>;
    bootstrapFixtureCompanion(): Promise<void>;
    setFriendLookupFixture(input: FriendLookupResult): Promise<void>;
    setUiBetaFixture(input: unknown): Promise<void>;
    presentDiscoveryFixture(input: {
      order: 'command_payload' | 'payload_command';
      displayHint?: 'show_soft_hint' | 'present_discovery';
    }): Promise<{ discoveryId: string; title: string }>;
    onVisualWorkAreaChanged(listener: (workArea?: { x: number; y: number; width: number; height: number }) => void): () => void;
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

const REDACTED_KEYS = new Set([
  'authorization', 'apikey', 'api_key', 'token', 'accesstoken',
  'refreshtoken', 'password', 'cookie', 'set-cookie', 'secret', 'clientsecret'
]);

export function redactSecrets(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSecrets);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactSecrets(value);
    }
  }
  return result;
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// VOLUME 3 — Character Runtime & Presence
// ============================================================================

export type PersistedCharacterRuntimeState =
  | 'booting' | 'idle' | 'observing' | 'thinking' | 'listening'
  | 'speaking' | 'exploring' | 'sharing' | 'performing'
  | 'waiting' | 'sleeping' | 'error';

export interface CharacterRuntimeContext {
  characterId: string;
  state: PersistedCharacterRuntimeState;
  currentBehaviour?: BehaviourExecution;
  queuedBehaviours: BehaviourRequest[];
  currentEmotion?: EmotionState;
  currentPerformance?: PerformanceExecution;
  attentionState?: AttentionState;
  lastInteractionAt?: string;
  lastInterruptAt?: string;
  cooldowns: RuntimeCooldown[];
  errors: RuntimeError[];
}

export interface BehaviourExecution {
  id: string;
  request: BehaviourRequest;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
}

export interface BehaviourRequest {
  id: string;
  source: 'brain' | 'discovery' | 'speech' | 'action' | 'journey' | 'system';
  type: BehaviourType;
  priority: number;
  interruptible: boolean;
  payload?: unknown;
  requestedEmotion?: string;
  requestedPerformance?: string;
  timeoutMs?: number;
  createdAt: string;
}

export type BehaviourType =
  | 'idle' | 'think' | 'listen' | 'speak' | 'share_discovery'
  | 'ask_question' | 'react' | 'perform_action' | 'celebrate'
  | 'sleep' | 'error_recovery';

export interface PerformanceExecution {
  id: string;
  scriptId: string;
  startedAt: string;
  completedAt?: string;
  status: 'playing' | 'paused' | 'completed' | 'cancelled';
  currentCueIndex: number;
}

export interface RuntimeCooldown {
  type: string;
  expiresAt: string;
}

export interface RuntimeError {
  code: string;
  message: string;
  timestamp: string;
  recoverable: boolean;
}

export type PresenceMode =
  | 'available' | 'quiet' | 'observing' | 'curious' | 'focused'
  | 'exploring' | 'ready_to_share' | 'sleeping' | 'do_not_disturb';

export interface AttentionState {
  userActive: boolean;
  appFocused: boolean;
  recentInteraction: boolean;
  doNotDisturb: boolean;
  estimatedInterruptCost: number;
  lastUserInputAt?: string;
}

export interface PerformanceScript {
  id: string;
  name: string;
  behaviourType: string;
  emotion?: string;
  animationSequence: PerformanceCue[];
  expressionSequence?: PerformanceCue[];
  speechTiming?: PerformanceCue[];
  durationMs?: number;
  interruptible: boolean;
  cooldownMs?: number;
  tags?: string[];
}

export interface PerformanceCue {
  id: string;
  type: 'animation' | 'expression' | 'emotion' | 'speech' | 'wait' | 'event';
  startMs: number;
  durationMs?: number;
  payload?: unknown;
}

export type InterruptReason =
  | 'user_input' | 'high_priority_behaviour' | 'system_event' | 'error';

export interface InterruptResult {
  interrupted: boolean;
  previousBehaviour?: string;
  reason: string;
}

export interface BehaviourSubmissionResult {
  id: string;
  accepted: boolean;
  reason?: string;
  queuePosition?: number;
}

export interface InitializeRuntimeInput {
  characterId: string;
  initialEmotion?: EmotionState;
}

// ============================================================================
// VOLUME 3 — Action Engine
// ============================================================================

export interface ActionIntent {
  id: string;
  source: 'brain' | 'user' | 'system';
  type: string;
  description: string;
  payload?: unknown;
  riskLevel: 'low' | 'medium' | 'high';
  requiresConfirmation: boolean;
  createdAt: string;
}

export interface ActionPlan {
  id: string;
  intentId: string;
  steps: ActionStep[];
  requiredPermissions: string[];
  riskLevel: 'low' | 'medium' | 'high';
  confirmationRequired: boolean;
  status: ActionPlanStatus;
}

export type ActionPlanStatus =
  | 'draft' | 'pending_confirmation' | 'approved' | 'running'
  | 'completed' | 'failed' | 'cancelled';

export interface ActionResult {
  id: string;
  planId: string;
  status: 'success' | 'failure' | 'partial' | 'cancelled';
  outputs: Record<string, unknown>;
  errors?: string[];
  completedAt: string;
}

// ============================================================================
// VOLUME 3 — Speech Engine
// ============================================================================

export interface SpeechInput {
  audio: ArrayBuffer;
  mimeType?: string;
  language?: string;
}

export interface TranscriptResult {
  text: string;
  language?: string;
  confidence?: number;
}

export interface SpeechOutputRequest {
  text: string;
  emotion?: string;
  priority?: number;
}

export interface SpeechAudioResult {
  audio?: ArrayBuffer;
  durationMs?: number;
}

export interface SpeechSession {
  id: string;
  status: 'idle' | 'listening' | 'transcribing' | 'speaking';
  startedAt: string;
  lastActivityAt: string;
}

// ============================================================================
// VOLUME 3 — Journey Engine
// ============================================================================

export interface CompanionJourney {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  origin: 'user' | 'discovery' | 'brain' | 'system';
  milestones: JourneyTimelineEntry[];
  relatedMemories: string[];
  relatedInsights: string[];
  createdAt: string;
  updatedAt: string;
}

export interface JourneyTimelineEntry {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  completedAt?: string;
}

// ============================================================================
// VOLUME 4 — Discovery Experience
// ============================================================================

export type DiscoveryExperienceStatus =
  | 'candidate' | 'queued' | 'exploring' | 'returned' | 'pooled'
  | 'ready_to_share' | 'shared' | 'discussing' | 'saved'
  | 'dismissed' | 'follow_up_requested' | 'converted_to_journey'
  | 'archived' | 'expired';

export interface DiscoveryPoolItem {
  id: string;
  sourceDiscoveryId: string;
  sourceCuriosityId?: string;
  title: string;
  summary: string;
  detail?: string;
  evidence: DiscoveryEvidence[];
  tags: string[];
  relatedTopics: string[];
  relatedMemories: string[];
  relatedInsights: string[];
  noveltyScore: number;
  relevanceScore: number;
  confidenceScore: number;
  sharePriority: number;
  status: DiscoveryExperienceStatus;
  createdAt: string;
  returnedAt: string;
  lastUpdatedAt: string;
  expiresAt?: string;
  userReaction?: DiscoveryUserReaction;
}

export type DiscoveryPoolCategory =
  | 'for_you' | 'project_related' | 'follow_up' | 'surprising'
  | 'learning' | 'tool' | 'reference' | 'low_priority' | 'expired';

export interface DiscoveryShareCandidate {
  id: string;
  poolItemId: string;
  reason: string;
  priority: number;
  urgency: number;
  expectedUserValue: number;
  interruptionCost: number;
  confidence: number;
  suggestedTone: 'soft' | 'excited' | 'curious' | 'brief' | 'quiet';
  suggestedTiming: 'now' | 'soon' | 'later' | 'only_when_asked';
}

export type DiscoveryInterruptionLevel =
  | 'none' | 'badge_only' | 'soft_prompt' | 'panel_peek' | 'direct_share';

export interface DiscoveryCardViewModel {
  id: string;
  title: string;
  shortSummary: string;
  whyItMatters: string;
  sourceLabel?: string;
  confidenceLabel?: string;
  tags: string[];
  actions: DiscoveryCardAction[];
  visualMood?: 'calm' | 'curious' | 'excited' | 'serious' | 'reflective';
}

export interface DiscoveryCardAction {
  type: DiscoveryCardActionType;
  label: string;
  enabled: boolean;
}

export type DiscoveryCardActionType =
  | 'discuss' | 'save' | 'dismiss' | 'explore_more' | 'open_source'
  | 'convert_to_journey' | 'remind_later' | 'not_interested';

export interface DiscoveryUserReaction {
  itemId: string;
  action: 'viewed' | 'discussed' | 'saved' | 'dismissed' | 'not_interested' | 'explore_more' | 'converted_to_journey' | 'opened_source';
  sentiment?: 'positive' | 'neutral' | 'negative';
  note?: string;
  timestamp: string;
}

// ============================================================================
// VOLUME X — Companion Data Model
// ============================================================================

export interface CompanionPersonality {
  energy: number;
  curiosity: number;
  sociability: number;
  diligence: number;
  playfulness: number;
  confidence: number;
  calmness: number;
  shyness: number;
}

export interface CompanionProfile {
  id: string;
  name: string;
  personalityDescription: string;
  personality: CompanionPersonality;
  assetRoot: string;
  isPrimary: boolean;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
  characterContract?: CharacterContract;
}

export type DiscoveryPlatformId =
  | 'generic-web'
  | 'reddit'
  | 'youtube'
  | 'github'
  | 'bilibili';

/** @deprecated Prefer DiscoveryPlatformId. */
export type ManagedDiscoveryPlatformId = Exclude<DiscoveryPlatformId, 'generic-web'>;

export type DiscoveryPreferredContentType =
  | 'articles'
  | 'discussion'
  | 'video'
  | 'code'
  | 'feeds';

export type DiscoveryChannelState = 'enabled' | 'muted' | 'blocked' | 'suppressed';

export interface CompanionDiscoverySeedPlan {
  interests: string[];
  preferredContentTypes: DiscoveryPreferredContentType[];
  platformAffinities: Partial<Record<DiscoveryPlatformId, number>>;
  curatedFeedIds: string[];
}

export interface CompanionDiscoveryProfile {
  version: number;
  companionId: string;
  personalityRevision: string;
  interests: string[];
  preferredContentTypes: DiscoveryPreferredContentType[];
  platformAffinities: Partial<Record<DiscoveryPlatformId, number>>;
  updatedAt: string;
}

export interface CompanionDiscoveryChannel {
  companionId: string;
  platformId: DiscoveryPlatformId;
  state: DiscoveryChannelState;
  source: 'default' | 'user';
  updatedAt: string;
  lastUsedAt?: string;
  lastPlanningReason?: string;
}

export interface CompanionPersonalityAnalysis {
  analysisId: string;
  personality: CompanionPersonality;
  description: string;
  expiresAt: string;
  discoverySeedPlan?: CompanionDiscoverySeedPlan;
}

export type DiscoveryBootstrapStatus =
  | 'completed'
  | 'provider_unavailable'
  | 'planner_unavailable'
  | 'no_candidates'
  | 'deferred';

export interface DiscoveryBootstrapResult {
  attempted: boolean;
  executedSourceIds: string[];
  executedPlatformIds?: DiscoveryPlatformId[];
  status: DiscoveryBootstrapStatus;
  reason?: string;
  plannerMode?: 'ai' | 'fallback' | 'unavailable';
}

/** @deprecated Prefer CompanionDiscoveryChannel. */
export interface ManagedDiscoveryPlatformPreference {
  companionId: string;
  platformId: DiscoveryPlatformId;
  state: 'enabled' | 'suppressed' | 'muted' | 'blocked';
  updatedAt: string;
}

export interface CreateCompanionResult {
  companion: CompanionProfile;
  discoveryBootstrap: DiscoveryBootstrapResult;
}

export interface DynamicDiscoveryResearchTask {
  id: string;
  platformId: DiscoveryPlatformId;
  query: string;
  semanticQuery: string;
  rationale: string;
  language?: string;
}

export interface DynamicDiscoveryResearchPlan {
  plannerMode: 'ai' | 'fallback' | 'unavailable';
  plannerReason?: string;
  tasks: DynamicDiscoveryResearchTask[];
  skippedChannels: Array<{
    platformId: DiscoveryPlatformId;
    reason: string;
  }>;
}

const COMPANION_ANIMATION_MANIFEST_SOURCE = [
  { key: 'Idle_Neutral', requiredForCreation: true, requiredForNetworkVisitor: true, fallback: 'Idle_Neutral', frameDurationMs: 520, loop: true, category: 'presence', purpose: 'Default idle state when companion is not doing anything else', priority: 0, interruptible: true },
  { key: 'Idle_Breathe', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 620, loop: true, category: 'presence', purpose: 'Subtle living presence when companion is idle', priority: 0, interruptible: true },
  { key: 'Idle_Sleepy', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 520, loop: true, category: 'presence', purpose: 'Low energy state after longer inactive periods', priority: 0, interruptible: true },
  { key: 'Idle_Sleeping', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Idle_Sleepy', frameDurationMs: 560, loop: true, category: 'presence', purpose: 'Deep sleep state after extended inactivity', priority: 0, interruptible: true },
  { key: 'Walk_Right', requiredForCreation: true, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 180, loop: true, category: 'movement', purpose: 'Walking right (walk-in-place)', priority: 1, interruptible: true },
  { key: 'Walk_Left', requiredForCreation: true, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 180, loop: true, category: 'movement', purpose: 'Walking left (walk-in-place)', priority: 1, interruptible: true },
  { key: 'Expedition_Return', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 220, loop: false, category: 'activity', purpose: 'Returning from discovery expedition', priority: 1, interruptible: false },
  { key: 'Think', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 420, loop: true, category: 'thinking', purpose: 'Reasoning, internal processing, loading, waiting for AI response', priority: 1, interruptible: true },
  { key: 'Work_Focus', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Think', frameDurationMs: 220, loop: true, category: 'activity', purpose: 'Focused on performing a task', priority: 1, interruptible: true },
  { key: 'Expedition_Present', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Talk_Neutral', frameDurationMs: 260, loop: true, category: 'activity', purpose: 'Presenting discovery findings to user', priority: 2, interruptible: true },
  { key: 'Talk_Neutral', requiredForCreation: true, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 280, loop: true, category: 'conversation', purpose: 'Neutral conversation state', priority: 2, interruptible: true },
  { key: 'Talk_Happy', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Talk_Neutral', frameDurationMs: 300, loop: true, category: 'conversation', purpose: 'Happy or excited conversation', priority: 2, interruptible: true },
  { key: 'Expedition_Prepare', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 300, loop: false, category: 'activity', purpose: 'Preparing for discovery expedition', priority: 1, interruptible: true },
  { key: 'Expedition_Leave', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 320, loop: false, category: 'activity', purpose: 'Leaving for discovery expedition', priority: 1, interruptible: false },
  { key: 'Listening', requiredForCreation: true, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 360, loop: true, category: 'interaction', purpose: 'Listening to user voice input', priority: 2, interruptible: true },
  { key: 'Waiting_Response', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Listening', frameDurationMs: 300, loop: true, category: 'interaction', purpose: 'Waiting for user response after speaking', priority: 1, interruptible: true },
  { key: 'Drag_Hold', requiredForCreation: true, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 180, loop: true, category: 'interaction', purpose: 'Being dragged by user', priority: 3, interruptible: false },
  { key: 'Drag_Release', requiredForCreation: true, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 220, loop: false, category: 'interaction', purpose: 'Released after being dragged', priority: 2, interruptible: true },
  { key: 'Talk_Thinking', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Talk_Neutral', frameDurationMs: 280, loop: true, category: 'conversation', purpose: 'Thinking while speaking', priority: 2, interruptible: true },
  { key: 'Talk_Concerned', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Talk_Neutral', frameDurationMs: 280, loop: true, category: 'conversation', purpose: 'Concerned or serious conversation', priority: 2, interruptible: true },
  { key: 'Walk_Up', requiredForCreation: true, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 180, loop: true, category: 'movement', purpose: 'Walking up (walk-in-place)', priority: 1, interruptible: true },
  { key: 'Walk_Down', requiredForCreation: true, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 180, loop: true, category: 'movement', purpose: 'Walking down (walk-in-place)', priority: 1, interruptible: true },
  { key: 'Walk_UpLeft', requiredForCreation: true, requiredForNetworkVisitor: false, fallback: 'Walk_Left', frameDurationMs: 180, loop: true, category: 'movement', purpose: 'Walking up-left (walk-in-place)', priority: 1, interruptible: true },
  { key: 'Walk_UpRight', requiredForCreation: true, requiredForNetworkVisitor: false, fallback: 'Walk_Right', frameDurationMs: 180, loop: true, category: 'movement', purpose: 'Walking up-right (walk-in-place)', priority: 1, interruptible: true },
  { key: 'Walk_DownLeft', requiredForCreation: true, requiredForNetworkVisitor: false, fallback: 'Walk_Left', frameDurationMs: 180, loop: true, category: 'movement', purpose: 'Walking down-left (walk-in-place)', priority: 1, interruptible: true },
  { key: 'Walk_DownRight', requiredForCreation: true, requiredForNetworkVisitor: false, fallback: 'Walk_Right', frameDurationMs: 180, loop: true, category: 'movement', purpose: 'Walking down-right (walk-in-place)', priority: 1, interruptible: true },
  { key: 'Enter', requiredForCreation: true, requiredForNetworkVisitor: true, fallback: 'Idle_Neutral', frameDurationMs: 320, loop: false, category: 'movement', purpose: 'Entering the desktop scene', priority: 2, interruptible: false },
  { key: 'Leave', requiredForCreation: true, requiredForNetworkVisitor: true, fallback: 'Idle_Neutral', frameDurationMs: 320, loop: false, category: 'movement', purpose: 'Leaving the desktop scene', priority: 2, interruptible: false },
  { key: 'Music_Idle', requiredForCreation: false, requiredForNetworkVisitor: false, fallback: 'Idle_Neutral', frameDurationMs: 400, loop: true, category: 'relaxation', purpose: 'Relaxed music-listening state', priority: 0, interruptible: true },
] as const;

export type CompanionAnimationName = typeof COMPANION_ANIMATION_MANIFEST_SOURCE[number]['key'];
export type CompanionAnimationCategory = typeof COMPANION_ANIMATION_MANIFEST_SOURCE[number]['category'];
export const COMPANION_ANIMATION_NAMES: readonly CompanionAnimationName[] = COMPANION_ANIMATION_MANIFEST_SOURCE.map(({ key }) => key);

export interface CompanionAnimationManifestEntry {
  key: CompanionAnimationName;
  fileName: `${CompanionAnimationName}.png`;
  requiredForCreation: boolean;
  requiredForNetworkVisitor: boolean;
  fallback: CompanionAnimationName;
  minFrames: number;
  maxFrames: number;
  minFrameSize: number;
  maxFrameSize: number;
  frameDurationMs: number;
  loop: boolean;
  category: CompanionAnimationCategory;
  purpose: string;
  priority: number;
  interruptible: boolean;
}

/** Shared source of truth for creation, editing, and runtime asset names. */
export const COMPANION_ANIMATION_MANIFEST: readonly CompanionAnimationManifestEntry[] = COMPANION_ANIMATION_MANIFEST_SOURCE.map((definition) => ({
  ...definition,
  fileName: `${definition.key}.png`,
  minFrames: 1,
  maxFrames: 120,
  minFrameSize: 300,
  maxFrameSize: 4096,
}));
export const COMPANION_ANIMATION_MANIFEST_BY_NAME: Readonly<Record<CompanionAnimationName, CompanionAnimationManifestEntry>> = Object.fromEntries(COMPANION_ANIMATION_MANIFEST.map(entry => [entry.key, entry])) as Record<CompanionAnimationName, CompanionAnimationManifestEntry>;

export interface CompanionCreationAsset {
  animationKey: CompanionAnimationName;
  buffer: ArrayBuffer | Uint8Array;
}

export interface CreateCompanionInput {
  name: string;
  personalityDescription: string;
  /** Ignored by Main Process; the stored analysis result is authoritative. */
  personality?: CompanionPersonality;
  personalityAnalysisId: string;
  assetRoot: string;
  assets?: CompanionCreationAsset[];
}

export interface UpdateCompanionInput {
  name?: string;
  personalityDescription?: string;
  personality?: CompanionPersonality;
  personalityAnalysisId?: string;
  assetRoot?: string;
  /** Atomic animation replacements committed with the profile update. */
  assets?: CompanionCreationAsset[];
  /** Optional animations removed in the same atomic update. */
  deleteAnimationKeys?: CompanionAnimationName[];
}

export type CompanionAssetPack = {
  id: string;
  name: string;
  path: string;
  preview?: string;
};

export interface CompanionApi {
  analyzePersonality(description: string): Promise<CompanionPersonalityAnalysis>;
  create(input: CreateCompanionInput): Promise<CompanionProfile>;
  list(): Promise<CompanionProfile[]>;
  get(id: string): Promise<CompanionProfile | null>;
  update(input: { id: string } & UpdateCompanionInput): Promise<CompanionProfile>;
  delete(id: string): Promise<{ id: string; deleted: true }>;
  setPrimary(id: string): Promise<CompanionProfile>;
  getPrimary(): Promise<CompanionProfile | null>;
  getAssetRoot(id: string): Promise<string>;
  uploadAsset(input: { companionId: string; fileName: string; buffer: ArrayBuffer | Uint8Array }): Promise<{ name: string; path: string }>;
  listAssets(companionId: string): Promise<Array<{ name: string; size: number; subfolder: string }>>;
  deleteAsset(input: { companionId: string; subfolder: string; fileName: string }): Promise<{ deleted: true }>;
  readAsset(input: { companionId: string; subfolder: string; fileName: string }): Promise<{ dataUrl: string } | null>;
}

export type OutsidePanelMode = 'closed' | 'peek' | 'compact' | 'expanded' | 'discussion' | 'history';

export interface DiscoveryPoolQuery {
  categories?: DiscoveryPoolCategory[];
  statuses?: DiscoveryExperienceStatus[];
  minPriority?: number;
  limit?: number;
}
