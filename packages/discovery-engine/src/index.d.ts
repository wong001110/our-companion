import type { CaptureSignalInput, CharacterProfile, CuriosityTarget, Discovery, DiscoveryCandidate, DiscoveryOrigin, DiscoveryScores, DiscoverySource, DuplicateResult, ExplorationPlan, NormalizedSignal, NormalizedDiscovery, Signal, SignalEngine } from '@our-companion/shared';
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
export interface RunDiscoveryAgentsInput {
    userId: string;
    companionId: string;
    curiosityTarget: CuriosityTarget;
    explorationPlan: ExplorationPlan;
    connectors?: DiscoveryConnector[];
    memoryCandidates?: Array<{
        title: string;
        summary?: string;
        url?: string;
        tags?: string[];
    }>;
}
export declare function normalizeDiscoveryUrl(url?: string): string | undefined;
export declare function fingerprintDiscovery(input: {
    title: string;
    canonicalUrl?: string;
    entities?: string[];
    topics?: string[];
    sourceType?: string;
}): string;
export declare function qualityScoreForSignal(signal: Pick<Signal, 'title' | 'summary' | 'url' | 'rawContent'>): number;
export declare function captureSignal(input: CaptureSignalInput): Signal;
export declare function normalizeSignal(signal: Signal): NormalizedSignal;
export declare function createSignalEngine(): SignalEngine;
export declare function signalFromNormalizedDiscovery(discovery: NormalizedDiscovery): Signal;
export declare function passesDiscoveryQuality(signal: NormalizedSignal, minimumScore?: number): boolean;
export declare function checkDuplicateDiscovery(candidate: Pick<Discovery, 'id' | 'canonicalUrl' | 'fingerprint' | 'title'>, existing: Array<Pick<Discovery, 'id' | 'canonicalUrl' | 'fingerprint' | 'title'>>): DuplicateResult;
export declare function discoveryOriginForSignal(signal: Signal): DiscoveryOrigin;
export declare function scoreDiscovery(item: NormalizedDiscovery, context: RankingContext): DiscoveryScores;
export declare function deduplicateDiscoveries(items: NormalizedDiscovery[]): NormalizedDiscovery[];
export declare function toDiscovery(item: NormalizedDiscovery, scores: DiscoveryScores): Discovery;
export declare function discoveryFromSignal(signal: NormalizedSignal, scores: DiscoveryScores): Discovery | undefined;
export declare function applyDailyCap(discoveries: Discovery[], alreadySharedToday: number, cap?: number): Discovery[];
export declare function createFallbackConnector(source: DiscoverySource): DiscoveryConnector;
export declare function runDiscoveryPipeline(connectors: DiscoveryConnector[], context: RankingContext, alreadySharedToday: number): Promise<Discovery[]>;
export declare function planExploration(curiosityTarget: CuriosityTarget): ExplorationPlan;
export declare function scoreCandidate(candidate: Pick<DiscoveryCandidate, 'relevanceScore' | 'noveltyScore' | 'evidenceScore' | 'usefulnessScore'>): number;
export declare function deduplicateCandidates(candidates: DiscoveryCandidate[]): DiscoveryCandidate[];
export declare function runDiscoveryAgents(input: RunDiscoveryAgentsInput): Promise<DiscoveryCandidate[]>;
export { DiscoveryEngine } from './discovery-engine';
export { createExplorationPlan } from './discovery-planner';
export { createEvidence, aggregateEvidence } from './discovery-evidence';
export { generateDiscoveryResult } from './discovery-result';
export { addToQueue, removeFromQueue, getNextJob, retryJob, cancelJob, } from './discovery-queue';
export { MAX_RETRIES, JOB_EXPIRY_HOURS, MAX_QUEUE_SIZE, DEFAULT_MAX_COST, } from './types';
export { createPoolItem, addToPool, removeFromPool, updatePoolItemStatus, getShareCandidates, filterPool, expireStaleItems, } from './pool/discovery-pool';
export { evaluateShareCandidate, determineInterruptionLevel, shouldShareNow, } from './share/share-timing';
export { DISCOVERY_STARTUP_DELAY_MS, getDiscoveryFetchDelay, getDiscoveryFetchDelayRange } from './timing';
