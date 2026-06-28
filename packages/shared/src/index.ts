export * from './models';
export * from './interfaces';
export * from './domain-events';

import type { ActionPermissionState, ActionPlan, ActionRunResult, ActionStep, BaseEvent, PerformanceScript } from './models';

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
  lastActivityAt?: string;
  updatedAt?: string;
}

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
  importanceScore: number;
  source?: string;
  sourceUrl?: string;
  isPinned?: boolean;
  isMarkedWrong?: boolean;
  createdAt: string;
  updatedAt: string;
  compressedAt?: string;
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
// MEMORY V2 — New memory architecture types
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

export type DiscoverySource = 'github' | 'reddit' | 'hackernews' | 'youtube';
export type DiscoveryStatus =
  | 'new'
  | 'candidate'
  | 'queued'
  | 'shared'
  | 'viewed'
  | 'saved'
  | 'rejected'
  | 'ignored'
  | 'journey'
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
  userInterestScore: number;
  userHistoryScore: number;
  characterExpertiseScore: number;
  noveltyScore: number;
  usefulnessScore: number;
  finalScore: number;
}

export interface Discovery extends NormalizedDiscovery, DiscoveryScores {
  id: string;
  signalId?: string;
  origin?: import('./models').DiscoveryOrigin;
  status: DiscoveryStatus;
  canonicalUrl?: string;
  fingerprint?: string;
  growthValue?: number;
  confidenceScore?: number;
  whyThisMatters?: string;
  recommendedAction?: 'view' | 'save' | 'ignore' | 'add_to_journey';
  shortMessage?: string;
  sharedAt?: string;
  createdAt: string;
  lastSeenAt?: string;
}

// ============================================================================
// DISCOVERY V2 — Enhanced discovery types
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

export interface ExplorationPlanV2 {
  objective: string;
  searchTargets: string[];
  stoppingConditions: string[];
  maxCost: number;
  expectedOutputs: string[];
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
  weight: number;
}

export interface Pattern {
  id: string;
  userId: string;
  type: PatternType;
  title: string;
  summary: string;
  description?: string;
  relatedConceptIds?: string[];
  relatedDiscoveryIds?: string[];
  confidence: number;
  strength: number;
  freshness: number;
  evidence: PatternEvidence[];
  detectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PATTERN V2 — Enhanced pattern types
// ============================================================================

export type PatternCategory =
  | 'interest'
  | 'behaviour'
  | 'conversation'
  | 'project'
  | 'learning'
  | 'temporal'
  | 'relationship';

export interface PatternV2 {
  id: string;
  userId: string;
  category: PatternCategory;
  type: PatternType;
  title: string;
  summary: string;
  confidence: number;
  strength: number;
  supportingMemoryIds: string[];
  firstDetectedAt: string;
  lastUpdatedAt: string;
  reinforcementCount: number;
  evidence: PatternEvidence[];
}

export interface PatternQuery {
  categories?: PatternCategory[];
  types?: PatternType[];
  minConfidence?: number;
  limit?: number;
}

export interface PatternDetectionInput {
  userId: string;
  memories: MemoryRecord[];
  discoveries?: Discovery[];
  feedback?: DiscoveryFeedback[];
}

export interface PatternDetectionResult {
  patterns: PatternV2[];
  metadata: {
    memoriesAnalyzed: number;
    patternsDetected: number;
    avgConfidence: number;
  };
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
  weight: number;
  confidence: number;
  freshness: number;
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
  weight: number;
  confidence: number;
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
  description: string;
  source: CuriositySource;
  explorationType: ExplorationType;
  priority: number;
  confidence: number;
  reason: string;
  expectedValue: string;
  relatedMemoryIds?: string[];
  relatedPatternIds?: string[];
  relatedInterestNodeIds?: string[];
  createdAt: string;
}

// ============================================================================
// CURIOSITY V2 — Enhanced curiosity types
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
  novelty: number;
  relevance: number;
  confidence: number;
  priority: number;
  freshness: number;
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

export interface ExplorationPlan {
  id: string;
  curiosityTargetId: string;
  objective:
    | 'find_new_examples'
    | 'find_practical_references'
    | 'find_related_research'
    | 'find_trends'
    | 'challenge_assumption'
    | 'connect_to_memory';
  agents: DiscoveryAgentType[];
  searchQueries: string[];
  constraints?: string[];
  maxCandidatesPerAgent: number;
  createdAt: string;
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
  relevanceScore: number;
  noveltyScore: number;
  evidenceScore: number;
  usefulnessScore: number;
  fingerprint?: string;
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
  whyAnnFoundIt: string;
  confidence: number;
  novelty: number;
  emotionalRelevance: number;
  practicalRelevance: number;
  supportingCandidateIds: string[];
  relatedMemoryIds?: string[];
  relatedPatternIds?: string[];
  suggestedQuestion?: string;
  suggestedAction?: string;
  narration?: string;
  createdAt: string;
}

// ============================================================================
// INSIGHT V2 — Enhanced insight types
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

export interface InsightV2 {
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
  patterns: PatternV2[];
  memories: MemoryRecord[];
}

export interface InsightGenerationResult {
  insights: InsightV2[];
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
  explorationPlanId?: string;
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

export type DiscoveryFeedbackValue = 'saved' | 'not_interested' | 'later' | 'talk_about_this' | 'opened_evidence';

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
  explorationPlan?: ExplorationPlan;
  discoveryCandidates: DiscoveryCandidate[];
  insights: CompanionInsight[];
  selectedInsight?: CompanionInsight;
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
  type: 'daily' | 'weekly' | 'milestone';
  title?: string;
  content: string;
  relatedJourneyId?: string;
  createdAt: string;
}

export type ToolName = 'open_url' | 'open_app' | 'search_web' | 'browser_navigation';

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
  journeyId?: string;
  createJourneyTitle?: string;
}

export interface CreateMemoryNodeInput {
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

export type CompanionSessionPhase = 'idle' | 'listening' | 'thinking' | 'talking';

export interface TranscribeAudioInput {
  audio: ArrayBuffer;
  mimeType?: string;
  language?: string;
}

export interface CompanionTurnInput {
  message: string;
  source: 'voice' | 'companion_text';
  characterId?: string;
}

export const COMPANION_CHAT_RETENTION_DAYS = 7;
export const COMPANION_CHAT_CONTEXT_LIMIT = 12;

export type CompanionMessageRole = 'user' | 'assistant' | 'system';
export type CompanionMessageSource = 'voice' | 'panel' | 'companion_text';
export type CompanionMessageStatus = 'ok' | 'error' | 'empty_transcript';

export interface CompanionMessage {
  id: string;
  characterId: string;
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
  channel: 'chat' | 'turn' | 'discovery_reason';
  source: string;
  status: 'success' | 'error';
  requestMessages: Array<{ role: string; content: string }>;
  requestBody?: unknown;
  rawResponse?: unknown;
  content: string;
  error?: string;
  createdAt: string;
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

export interface WindowMoveInput {
  x: number;
  y: number;
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

export interface FoundationEventLogInput {
  limit?: number;
  source?: string;
  type?: string;
}

export interface EngineSnapshotInput {
  userId?: string;
  cycleId?: string;
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
  explorationPlan?: ExplorationPlan;
  discoveryCandidates: DiscoveryCandidate[];
  insights: CompanionInsight[];
  explorationEvents: ExplorationLoopEvent[];
  recentDiscoveries: Discovery[];
  actionPermissions: ActionPermissionState;
  discoveryScheduling: DiscoverySchedulingDebug;
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

export interface OurCompanionApi {
  character: {
    getState(characterId?: string): Promise<CharacterRuntimeState>;
    getActive(): Promise<CharacterProfile[]>;
    getBehaviorSettings(): Promise<CharacterBehaviorSettings>;
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
    addToJourney(input: AddDiscoveryToJourneyInput): Promise<{ journey: Journey; milestone: JourneyMilestone; memory: MemoryNode }>;
    onAnnounce(listener: (payload: DiscoveryAnnouncePayload) => void): () => void;
    generateNow(): Promise<Discovery[]>;
    shareNext(): Promise<boolean>;
    resetStatuses(): Promise<{ reset: boolean }>;
    countUnannounced(): Promise<{ count: number }>;
    markSharedAsUnannounced(): Promise<{ count: number }>;
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
    createNode(input: CreateMemoryNodeInput): Promise<MemoryNode>;
    updateNode(input: UpdateMemoryNodeInput): Promise<MemoryNode>;
    deleteNode(id: string): Promise<{ id: string; deleted: true }>;
    createEdge(input: CreateMemoryEdgeInput): Promise<MemoryEdge>;
    getGraph(input?: { query?: string }): Promise<MemoryGraph>;
    search(query: string): Promise<MemoryNode[]>;
  };
  journey: {
    create(input: CreateJourneyInput): Promise<Journey>;
    getActive(): Promise<Journey[]>;
    getTimeline(input?: { journeyId?: string }): Promise<JourneyMilestone[]>;
    addMilestone(input: AddJourneyMilestoneInput): Promise<JourneyMilestone>;
  };
  diary: {
    getEntries(input?: { type?: DiaryEntry['type']; limit?: number }): Promise<DiaryEntry[]>;
    generateDaily(input?: { characterId?: string }): Promise<DiaryEntry>;
  };
  tool: {
    preview(input: ToolExecuteInput): Promise<ToolPreview>;
    execute(input: ToolExecuteInput): Promise<ToolExecutionResult>;
  };
  action: {
    plan(text: string): Promise<ActionPlan | undefined>;
    executePlan(plan: ActionPlan): Promise<ActionRunResult>;
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
  speech: {
    transcribe(input: TranscribeAudioInput): Promise<{ text: string; language?: string }>;
    getStatus(): Promise<SpeechStatus>;
    getSettings(): Promise<SpeechSettings>;
    updateSettings(input: UpdateSpeechSettingsInput): Promise<SpeechSettings>;
  };
  companion: {
    turn(input: CompanionTurnInput): Promise<{ message: string }>;
    onToggleListen(listener: () => void): () => void;
    reportSessionPhase(phase: CompanionSessionPhase): Promise<void>;
    reportDragging(input: { dragging: boolean }): Promise<void>;
    getHistory(input?: CompanionHistoryInput): Promise<CompanionMessage[]>;
    appendMessage(input: CompanionAppendMessageInput): Promise<CompanionMessage>;
    clearHistory(input?: { characterId?: string }): Promise<void>;
    getOverlayDebug(): Promise<{ mode: 'small-window'; bounds?: WindowBounds }>;
  };
  debug: {
    resetData(input: DebugDataResetInput): Promise<DebugDataResetResult>;
    getFoundationLog(input?: FoundationEventLogInput): Promise<BaseEvent[]>;
    getEngineSnapshot(input?: EngineSnapshotInput): Promise<EngineSnapshot>;
    onFoundationEvent(listener: (event: BaseEvent) => void): () => void;
  };
  window: {
    openPanel(): Promise<boolean>;
    getBounds(): Promise<WindowBounds>;
    getWorkArea(): Promise<WindowBounds>;
    moveTo(input: WindowMoveInput): Promise<WindowBounds>;
    setMousePassthrough(input: WindowMousePassthroughInput): Promise<boolean>;
  };
  workspace: {
    getStatus(): Promise<WorkspaceStatusSnapshot>;
    getSummary(): Promise<WorkspaceSummary>;
  };
}

export const DEFAULT_CHARACTER_ID = 'ann';

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// VOLUME 3 — Character Runtime & Presence
// ============================================================================

export type CharacterRuntimeStateV2 =
  | 'booting' | 'idle' | 'observing' | 'thinking' | 'listening'
  | 'speaking' | 'exploring' | 'sharing' | 'performing'
  | 'waiting' | 'sleeping' | 'error';

export interface CharacterRuntimeContext {
  characterId: string;
  state: CharacterRuntimeStateV2;
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

export interface PerformanceScriptV2 {
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
// VOLUME 3 — Action Engine V2
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

export interface ActionPlanV2 {
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
// VOLUME 3 — Speech Engine V2
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
// VOLUME 3 — Journey Engine V2
// ============================================================================

export interface CompanionJourney {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  origin: 'user' | 'discovery' | 'brain' | 'system';
  milestones: JourneyMilestoneV2[];
  relatedMemories: string[];
  relatedInsights: string[];
  createdAt: string;
  updatedAt: string;
}

export interface JourneyMilestoneV2 {
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

export type OutsidePanelMode = 'closed' | 'peek' | 'compact' | 'expanded' | 'discussion' | 'history';

export interface DiscoveryPoolQuery {
  categories?: DiscoveryPoolCategory[];
  statuses?: DiscoveryExperienceStatus[];
  minPriority?: number;
  limit?: number;
}
