import { DatabaseService } from '@our-companion/database';
import type { AddDiscoveryToJourneyInput, AddJourneyMilestoneInput, AiSettings, CharacterBehaviorSettings, ChatInput, CompanionTurnInput, CreateJourneyInput, CreateMemoryEdgeInput, CreateMemoryNodeInput, Discovery, DiscoveryFeedInput, DiscoverySource, NormalizedDiscovery, ToolExecuteInput, TranscribeAudioInput, UpdateAiSettingsInput, UpdateCharacterBehaviorSettingsInput, UpdateMemoryNodeInput } from '@our-companion/shared';
export declare class AppServices {
    readonly db: DatabaseService;
    readonly databaseMode: 'persistent' | 'memory';
    constructor(dbPath?: string);
    character: {
        getState: (characterId?: string) => Promise<import("@our-companion/shared").CharacterRuntimeState>;
        getActive: () => Promise<import("@our-companion/shared").CharacterProfile[]>;
        getBehaviorSettings: () => Promise<CharacterBehaviorSettings>;
        updateBehaviorSettings: (input: UpdateCharacterBehaviorSettingsInput) => Promise<CharacterBehaviorSettings>;
        setPrimary: (characterId: string) => Promise<import("@our-companion/shared").CharacterProfile>;
        updatePosition: (input: {
            characterId?: string;
            x: number;
            y: number;
        }) => Promise<import("@our-companion/shared").CharacterRuntimeState>;
        triggerBehavior: (input: {
            characterId?: string;
            event: string;
        }) => Promise<import("@our-companion/shared").CharacterRuntimeState>;
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
    tool: {
        preview: (input: ToolExecuteInput) => Promise<import("@our-companion/shared").ToolPreview>;
        execute: (input: ToolExecuteInput) => Promise<import("@our-companion/shared").ToolExecutionResult>;
    };
    ai: {
        getSettings: () => Promise<AiSettings>;
        updateSettings: (input: UpdateAiSettingsInput) => Promise<AiSettings>;
        chat: (input: ChatInput) => Promise<{
            message: string;
        }>;
        generateDiscoveryReason: (input: {
            discovery: NormalizedDiscovery;
        }) => Promise<{
            why_this_matters: string;
            recommended_action: "view";
            short_message: string;
            tags: string[];
        }>;
        summarizeMemory: (input: {
            content: string;
        }) => Promise<{
            type: "topic";
            title: string;
            summary: string;
            importance_score: number;
        }>;
    };
    speech: {
        getStatus: () => Promise<{
            ready: boolean;
            model: string;
            error: string | undefined;
        }>;
        transcribe: (input: TranscribeAudioInput) => Promise<{
            text: string;
        }>;
    };
    companion: {
        turn: (input: CompanionTurnInput) => Promise<{
            message: string;
        }>;
    };
    private getStoredAiSettings;
    private getAiSettings;
    private updateAiSettings;
    private createDeepSeekClient;
    private getCharacterBehaviorSettings;
    private updateCharacterBehaviorSettings;
}
