import { DatabaseService } from '@our-companion/database';
import type { ActionPermissionState, ActionPlan, AddDiscoveryToJourneyInput, AddJourneyMilestoneInput, AiDebugEntry, AiSettings, CharacterBehaviorSettings, CharacterRuntimeState, ChatInput, CompanionAppendMessageInput, CompanionHistoryInput, CompanionMessage, CompanionSessionPhase, CompanionTurnInput, CreateJourneyInput, CreateMemoryEdgeInput, CreateMemoryNodeInput, DebugDataResetInput, Discovery, DiscoveryAnnouncePayload, DiscoveryFeedInput, DiscoveryFeedback, DiscoverySource, ExplorationCycle, ExplorationCycleResult, ExplorationLoopEvent, NormalizedDiscovery, PerformanceScript, SpeechSettings, StartExplorationInput, SubmitDiscoveryFeedbackInput, ToolExecuteInput, TranscribeAudioInput, UpdateAiSettingsInput, UpdateCharacterBehaviorSettingsInput, UpdateSpeechSettingsInput, UpdateMemoryNodeInput } from '@our-companion/shared';
import { type EventBus } from '@our-companion/event-bus';
import type { DiscoveryShareOrchestrator } from './discoveryShareOrchestrator';
import type { DiscoveryRefreshResult } from './discoveryScheduler';
export declare class AppServices {
    private readonly eventBus;
    readonly db: DatabaseService;
    readonly databaseMode: 'persistent' | 'memory';
    companionSessionPhase: CompanionSessionPhase;
    companionDragging: boolean;
    private shareOrchestrator?;
    private explorationBroadcaster?;
    private characterBroadcaster?;
    private discoveryAnnounceBroadcaster?;
    private debugLog;
    constructor(dbPath?: string, eventBus?: EventBus);
    character: {
        getState: (characterId?: string) => Promise<CharacterRuntimeState>;
        getActive: () => Promise<import("@our-companion/shared").CharacterProfile[]>;
        getBehaviorSettings: () => Promise<CharacterBehaviorSettings>;
        updateBehaviorSettings: (input: UpdateCharacterBehaviorSettingsInput) => Promise<CharacterBehaviorSettings>;
        setPrimary: (characterId: string) => Promise<import("@our-companion/shared").CharacterProfile>;
        updatePosition: (input: {
            characterId?: string;
            x: number;
            y: number;
        }) => Promise<CharacterRuntimeState>;
        triggerBehavior: (input: {
            characterId?: string;
            event: string;
        }) => Promise<CharacterRuntimeState>;
    };
    discovery: {
        getFeed: (input?: DiscoveryFeedInput) => Promise<Discovery[]>;
        refresh: (input?: {
            sources?: DiscoverySource[];
        }) => Promise<Discovery[]>;
        markInterested: (discoveryId: string) => Promise<Discovery>;
        markNotInterested: (discoveryId: string) => Promise<Discovery>;
        addToJourney: (input: AddDiscoveryToJourneyInput) => Promise<{
            journey: import("@our-companion/shared").Journey;
            milestone: import("@our-companion/shared").JourneyMilestone;
            memory: import("@our-companion/shared").MemoryNode;
        }>;
    };
    autonomy: {
        startExploration: (input?: StartExplorationInput) => Promise<ExplorationCycleResult>;
        getCurrentCycle: () => Promise<ExplorationCycle | undefined>;
        getCycleHistory: (input?: {
            limit?: number;
        }) => Promise<ExplorationCycle[]>;
        submitFeedback: (input: SubmitDiscoveryFeedbackInput) => Promise<DiscoveryFeedback>;
    };
    memory: {
        createNode: (input: CreateMemoryNodeInput) => Promise<import("@our-companion/shared").MemoryNode>;
        updateNode: (input: UpdateMemoryNodeInput) => Promise<import("@our-companion/shared").MemoryNode>;
        deleteNode: (id: string) => Promise<{
            id: string;
            deleted: true;
        }>;
        createEdge: (input: CreateMemoryEdgeInput) => Promise<import("@our-companion/shared").MemoryEdge>;
        getGraph: (input?: {
            query?: string;
        }) => Promise<import("@our-companion/shared").MemoryGraph>;
        search: (query: string) => Promise<import("@our-companion/shared").MemoryNode[]>;
    };
    journey: {
        create: (input: CreateJourneyInput) => Promise<import("@our-companion/shared").Journey>;
        getActive: () => Promise<import("@our-companion/shared").Journey[]>;
        getTimeline: (input?: {
            journeyId?: string;
        }) => Promise<import("@our-companion/shared").JourneyMilestone[]>;
        addMilestone: (input: AddJourneyMilestoneInput) => Promise<import("@our-companion/shared").JourneyMilestone>;
    };
    diary: {
        getEntries: (input?: {
            type?: "daily" | "weekly" | "milestone";
            limit?: number;
        }) => Promise<import("@our-companion/shared").DiaryEntry[]>;
        generateDaily: (input?: {
            characterId?: string;
        }) => Promise<import("@our-companion/shared").DiaryEntry>;
    };
    onPerformanceListeners: Array<(script: PerformanceScript) => void>;
    tool: {
        preview: (input: ToolExecuteInput) => Promise<import("@our-companion/shared").ToolPreview>;
        execute: (input: ToolExecuteInput) => Promise<import("@our-companion/shared").ToolExecutionResult>;
    };
    action: {
        plan: (text: string) => Promise<ActionPlan | undefined>;
        executePlan: (plan: ActionPlan) => Promise<import("@our-companion/shared").ActionRunResult>;
        getPermissions: () => Promise<ActionPermissionState>;
        updatePermissions: (state: ActionPermissionState) => Promise<ActionPermissionState>;
    };
    private pushDebugEntry;
    private buildChatMessages;
    ai: {
        getSettings: () => Promise<AiSettings>;
        updateSettings: (input: UpdateAiSettingsInput) => Promise<AiSettings>;
        chat: (input: ChatInput) => Promise<{
            message: string;
        }>;
        generateDiscoveryReason: (input: {
            discovery: NormalizedDiscovery;
        }) => Promise<import("@our-companion/shared").DiscoveryReason>;
        summarizeMemory: (input: {
            content: string;
        }) => Promise<{
            type: "topic";
            title: string;
            summary: string;
            importance_score: number;
        }>;
        getDebugLog: () => Promise<AiDebugEntry[]>;
    };
    speech: {
        getStatus: () => Promise<{
            ready: boolean;
            model: string;
            error: string | undefined;
        }>;
        getSettings: () => Promise<SpeechSettings>;
        updateSettings: (input: UpdateSpeechSettingsInput) => Promise<SpeechSettings>;
        transcribe: (input: TranscribeAudioInput) => Promise<{
            text: string;
            language: string | undefined;
        }>;
    };
    companion: {
        turn: (input: CompanionTurnInput) => Promise<{
            message: string;
        }>;
        getHistory: (input?: CompanionHistoryInput) => Promise<CompanionMessage[]>;
        appendMessage: (input: CompanionAppendMessageInput) => Promise<CompanionMessage>;
        clearHistory: (input?: {
            characterId?: string;
        }) => Promise<void>;
        reportSessionPhase: (phase: CompanionSessionPhase) => Promise<void>;
        reportDragging: (input: {
            dragging: boolean;
        }) => Promise<void>;
    };
    debug: {
        resetData: (input: DebugDataResetInput) => Promise<import("@our-companion/shared").DebugDataResetResult>;
    };
    attachShareOrchestrator(orchestrator: DiscoveryShareOrchestrator): void;
    attachAutonomyBroadcasters(callbacks: {
        explorationEvent: (event: ExplorationLoopEvent) => void;
        characterState: (state: CharacterRuntimeState) => void;
        discoveryAnnounce: (payload: DiscoveryAnnouncePayload) => void;
    }): void;
    private setAutonomyCharacterState;
    private recordExplorationEvent;
    private saveCycleState;
    private messageForExplorationState;
    private runAutonomousExploration;
    private submitDiscoveryFeedback;
    runDiscoveryRefresh(sources?: DiscoverySource[]): Promise<DiscoveryRefreshResult>;
    getEffectiveDiscoveryScore(): number;
    canAnnounceDiscovery(): boolean;
    shouldInterruptShare(): boolean;
    countAutonomousCyclesToday(): number;
    private queueDiscoveryAnnouncements;
    emitFoundationEvent(type: string, source: string, payload?: Record<string, unknown>, correlationId?: string): void;
    private emitDecisionEventsForDiscovery;
    private getStoredAiSettings;
    private getAiSettings;
    private updateAiSettings;
    private getStoredSpeechSettings;
    private getSpeechSettings;
    private updateSpeechSettings;
    private createDeepSeekClient;
    private getCharacterBehaviorSettings;
    private updateCharacterBehaviorSettings;
}
