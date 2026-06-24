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
export type DiscoveryStatus = 'candidate' | 'shared' | 'saved' | 'rejected' | 'ignored';
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
    status: DiscoveryStatus;
    whyThisMatters?: string;
    recommendedAction?: 'view' | 'save' | 'ignore' | 'add_to_journey';
    shortMessage?: string;
    sharedAt?: string;
    createdAt: string;
}
export interface Journey {
    id: string;
    title: string;
    description?: string;
    status: 'active' | 'completed' | 'paused';
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
}
export interface CompanionTurnInput {
    message: string;
    source: 'voice' | 'companion_text';
    characterId?: string;
}
export interface SpeechStatus {
    ready: boolean;
    model: string;
    error?: string;
}
export interface AiSettings {
    provider: 'deepseek';
    model: string;
    endpoint: string;
    apiKeyConfigured: boolean;
}
export interface UpdateAiSettingsInput {
    model?: string;
    endpoint?: string;
    apiKey?: string;
    clearApiKey?: boolean;
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
export interface DiscoveryReason {
    why_this_matters: string;
    recommended_action: 'view' | 'save' | 'ignore' | 'add_to_journey';
    short_message: string;
    tags: string[];
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
    };
    speech: {
        transcribe(input: TranscribeAudioInput): Promise<{
            text: string;
        }>;
        getStatus(): Promise<SpeechStatus>;
    };
    companion: {
        turn(input: CompanionTurnInput): Promise<{
            message: string;
        }>;
        onToggleListen(listener: () => void): () => void;
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
