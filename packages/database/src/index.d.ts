import type { CharacterProfile, CharacterRuntimeState, DiaryEntry, Discovery, DiscoveryStatus, Journey, JourneyMilestone, MemoryEdge, MemoryNode } from '@our-companion/shared';
export interface DatabaseServiceOptions {
    path?: string;
}
export declare class DatabaseService {
    private readonly db;
    constructor(options?: DatabaseServiceOptions);
    close(): void;
    seedAnn(): void;
    getCharacterState(characterId?: string): CharacterRuntimeState;
    saveCharacterState(state: CharacterRuntimeState): CharacterRuntimeState;
    getActiveCharacters(): CharacterProfile[];
    getCharacterBehaviorRules(characterId?: string): Record<string, unknown>;
    setPrimaryCharacter(characterId: string): CharacterProfile;
    insertMemoryNode(node: MemoryNode): MemoryNode;
    updateMemoryNode(node: MemoryNode): MemoryNode;
    deleteMemoryNode(id: string): void;
    getMemoryNode(id: string): MemoryNode | undefined;
    listMemoryNodes(): MemoryNode[];
    insertMemoryEdge(edge: MemoryEdge): MemoryEdge;
    listMemoryEdges(): MemoryEdge[];
    insertDiscovery(discovery: Discovery): Discovery;
    updateDiscoveryStatus(id: string, status: DiscoveryStatus): Discovery;
    getDiscovery(id: string): Discovery | undefined;
    listDiscoveries(input?: {
        status?: DiscoveryStatus;
        limit?: number;
    }): Discovery[];
    countSharedToday(): number;
    insertJourney(journey: Journey): Journey;
    listActiveJourneys(): Journey[];
    insertMilestone(milestone: JourneyMilestone): JourneyMilestone;
    listMilestones(journeyId?: string): JourneyMilestone[];
    insertDiary(entry: DiaryEntry): DiaryEntry;
    listDiaryEntries(input?: {
        type?: DiaryEntry['type'];
        limit?: number;
    }): DiaryEntry[];
    getAppSetting<T>(key: string): T | undefined;
    setAppSetting<T>(key: string, value: T): T;
}
