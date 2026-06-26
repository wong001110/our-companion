export * from './models';
export * from './interfaces';
import type { ActionPermissionState, ActionPlan, ActionRunResult, BaseEvent, PerformanceScript } from './models';
export type CoreState = 'idle' | 'walking' | 'sleeping' | 'observing' | 'thinking' | 'discovering' | 'talking' | 'listening' | 'executing' | 'returning' | 'organizing_backpack';
export type EmotionName = 'neutral' | 'curious' | 'happy' | 'excited' | 'shy' | 'confused' | 'focused' | 'tired' | 'proud' | 'concerned';
export type Intent = 'wandering' | 'waiting' | 'sharing_discovery' | 'asking_permission' | 'helping_task' | 'reviewing_memory' | 'reflecting_journey' | 'organizing_backpack';
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
    position?: {
        x: number;
        y: number;
    };
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
export type MemoryNodeType = 'topic' | 'discovery' | 'resource' | 'question' | 'decision' | 'outcome';
export type MemoryRelation = 'related_to' | 'inspired_by' | 'evolved_into' | 'depends_on' | 'caused_by';
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
export type DiscoverySource = 'github' | 'reddit' | 'hackernews' | 'youtube';
export type DiscoveryStatus = 'new' | 'candidate' | 'queued' | 'shared' | 'viewed' | 'saved' | 'rejected' | 'ignored' | 'journey' | 'archived';
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
export type PatternType = 'repeated_topic' | 'cross_source_trend' | 'journey_alignment' | 'user_momentum' | 'fatigue_signal' | 'revival_signal' | 'repeated_theme' | 'interest_cluster' | 'abandoned_direction' | 'returning_topic' | 'contradiction' | 'interest_shift' | 'exploration_loop' | 'aesthetic_preference' | 'technical_preference';
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
export type InterestNodeType = 'topic' | 'project' | 'technology' | 'aesthetic' | 'problem' | 'behavior' | 'theme' | 'question' | 'opposing_view';
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
    relation: 'similar_to' | 'part_of' | 'adjacent_to' | 'opposes' | 'supports' | 'inspired_by' | 'used_for' | 'evolved_into' | 'frequently_appears_with';
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
export type CuriositySource = 'memory_trigger' | 'pattern_trigger' | 'journey_trigger' | 'novelty_trigger' | 'contradiction_trigger' | 'relationship_trigger' | 'character_trigger';
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
export type DiscoveryAgentType = 'scout' | 'research' | 'builder' | 'trend' | 'contrarian' | 'memory_scout';
export interface ExplorationPlan {
    id: string;
    curiosityTargetId: string;
    objective: 'find_new_examples' | 'find_practical_references' | 'find_related_research' | 'find_trends' | 'challenge_assumption' | 'connect_to_memory';
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
    sourceType: 'github' | 'article' | 'blog' | 'paper' | 'video' | 'website' | 'product' | 'community_discussion' | 'internal_memory' | 'generated_idea';
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
export type CompanionInsightType = 'observation' | 'pattern' | 'hypothesis' | 'question' | 'opportunity' | 'warning' | 'contradiction' | 'practical_next_step';
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
export type ExplorationState = 'idle' | 'curious' | 'planning' | 'exploring' | 'collecting' | 'synthesizing' | 'returning' | 'sharing' | 'reflecting';
export type ExplorationTrigger = 'scheduled' | 'manual' | 'memory_updated' | 'pattern_detected' | 'user_idle' | 'relationship_moment' | 'companion_curiosity';
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
export declare const COMPANION_CHAT_RETENTION_DAYS = 7;
export declare const COMPANION_CHAT_CONTEXT_LIMIT = 12;
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
    requestMessages: Array<{
        role: string;
        content: string;
    }>;
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
export type DebugDataResetTarget = 'discoveries' | 'memory' | 'journeys' | 'diary' | 'chat' | 'autonomy' | 'all_debug_data';
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
}
export interface DiscoveryReason {
    why_this_matters: string;
    recommended_action: 'view' | 'save' | 'ignore' | 'add_to_journey';
    short_message: string;
    tags: string[];
}
export interface DiscoveryAnnouncePayload {
    discoveryId: string;
    title: string;
    message: string;
    cycleId?: string;
    insightId?: string;
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
export interface OurCompanionApi {
    character: {
        getState(characterId?: string): Promise<CharacterRuntimeState>;
        getActive(): Promise<CharacterProfile[]>;
        getBehaviorSettings(): Promise<CharacterBehaviorSettings>;
        updateBehaviorSettings(input: UpdateCharacterBehaviorSettingsInput): Promise<CharacterBehaviorSettings>;
        setPrimary(characterId: string): Promise<CharacterProfile>;
        updatePosition(input: {
            characterId?: string;
            x: number;
            y: number;
        }): Promise<CharacterRuntimeState>;
        triggerBehavior(input: {
            characterId?: string;
            event: string;
        }): Promise<CharacterRuntimeState>;
        onStateChange(listener: (state: CharacterRuntimeState) => void): () => void;
    };
    discovery: {
        getFeed(input?: DiscoveryFeedInput): Promise<Discovery[]>;
        refresh(input?: {
            sources?: DiscoverySource[];
        }): Promise<Discovery[]>;
        markInterested(discoveryId: string): Promise<Discovery>;
        markNotInterested(discoveryId: string): Promise<Discovery>;
        addToJourney(input: AddDiscoveryToJourneyInput): Promise<{
            journey: Journey;
            milestone: JourneyMilestone;
            memory: MemoryNode;
        }>;
        onAnnounce(listener: (payload: DiscoveryAnnouncePayload) => void): () => void;
    };
    autonomy: {
        startExploration(input?: StartExplorationInput): Promise<ExplorationCycleResult>;
        getCurrentCycle(): Promise<ExplorationCycle | undefined>;
        getCycleHistory(input?: {
            limit?: number;
        }): Promise<ExplorationCycle[]>;
        submitFeedback(input: SubmitDiscoveryFeedbackInput): Promise<DiscoveryFeedback>;
        onExplorationEvent(listener: (event: ExplorationLoopEvent) => void): () => void;
    };
    memory: {
        createNode(input: CreateMemoryNodeInput): Promise<MemoryNode>;
        updateNode(input: UpdateMemoryNodeInput): Promise<MemoryNode>;
        deleteNode(id: string): Promise<{
            id: string;
            deleted: true;
        }>;
        createEdge(input: CreateMemoryEdgeInput): Promise<MemoryEdge>;
        getGraph(input?: {
            query?: string;
        }): Promise<MemoryGraph>;
        search(query: string): Promise<MemoryNode[]>;
    };
    journey: {
        create(input: CreateJourneyInput): Promise<Journey>;
        getActive(): Promise<Journey[]>;
        getTimeline(input?: {
            journeyId?: string;
        }): Promise<JourneyMilestone[]>;
        addMilestone(input: AddJourneyMilestoneInput): Promise<JourneyMilestone>;
    };
    diary: {
        getEntries(input?: {
            type?: DiaryEntry['type'];
            limit?: number;
        }): Promise<DiaryEntry[]>;
        generateDaily(input?: {
            characterId?: string;
        }): Promise<DiaryEntry>;
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
        chat(input: ChatInput): Promise<{
            message: string;
        }>;
        generateDiscoveryReason(input: {
            discovery: NormalizedDiscovery;
        }): Promise<DiscoveryReason>;
        summarizeMemory(input: {
            content: string;
        }): Promise<MemorySummary>;
        getDebugLog(): Promise<AiDebugEntry[]>;
    };
    speech: {
        transcribe(input: TranscribeAudioInput): Promise<{
            text: string;
            language?: string;
        }>;
        getStatus(): Promise<SpeechStatus>;
        getSettings(): Promise<SpeechSettings>;
        updateSettings(input: UpdateSpeechSettingsInput): Promise<SpeechSettings>;
    };
    companion: {
        turn(input: CompanionTurnInput): Promise<{
            message: string;
        }>;
        onToggleListen(listener: () => void): () => void;
        reportSessionPhase(phase: CompanionSessionPhase): Promise<void>;
        reportDragging(input: {
            dragging: boolean;
        }): Promise<void>;
        getHistory(input?: CompanionHistoryInput): Promise<CompanionMessage[]>;
        appendMessage(input: CompanionAppendMessageInput): Promise<CompanionMessage>;
        clearHistory(input?: {
            characterId?: string;
        }): Promise<void>;
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
}
export declare const DEFAULT_CHARACTER_ID = "ann";
export declare function nowIso(): string;
export declare function createId(prefix: string): string;
