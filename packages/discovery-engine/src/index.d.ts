import type { CharacterProfile, Discovery, DiscoveryScores, DiscoverySource, NormalizedDiscovery } from '@our-companion/shared';
export interface DiscoveryFetchInput {
    query?: string;
    limit?: number;
}
export type RawDiscoveryItem = Record<string, unknown>;
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
export declare function scoreDiscovery(item: NormalizedDiscovery, context: RankingContext): DiscoveryScores;
export declare function deduplicateDiscoveries(items: NormalizedDiscovery[]): NormalizedDiscovery[];
export declare function toDiscovery(item: NormalizedDiscovery, scores: DiscoveryScores): Discovery;
export declare function applyDailyCap(discoveries: Discovery[], alreadySharedToday: number, cap?: number): Discovery[];
export declare function createFallbackConnector(source: DiscoverySource): DiscoveryConnector;
export declare function runDiscoveryPipeline(connectors: DiscoveryConnector[], context: RankingContext, alreadySharedToday: number): Promise<Discovery[]>;
