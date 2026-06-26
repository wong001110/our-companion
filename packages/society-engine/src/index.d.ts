import type { CompanionIdentity, CompanionRelationship, CompanionVisit, Concept, Insight, Knowledge, KnowledgeExchangePackage, SyncConflict, SyncEnvelope, TrustProfile, VersionVector } from '@our-companion/shared';
export declare function scoreTrust(profile: TrustProfile): number;
export declare function canShareKnowledge(input: {
    privacyLevel: 'private' | 'local' | 'shareable' | 'public';
    explicitConsent: boolean;
    trust: TrustProfile;
}): boolean;
export declare function createKnowledgeExchangePackage(input: {
    from: CompanionIdentity;
    to?: CompanionIdentity;
    knowledge: Knowledge[];
    concepts: Concept[];
    insights: Insight[];
    journeySummaries: string[];
    privacyLevel: 'shareable' | 'public';
    explicitConsent: boolean;
    trust: TrustProfile;
}): KnowledgeExchangePackage | undefined;
export declare function updateRelationship(relationship: CompanionRelationship, outcome: 'successful_exchange' | 'rejected' | 'neutral'): CompanionRelationship;
export declare function requestCompanionVisit(input: {
    fromCompanionId: string;
    toCompanionId: string;
    relationship: CompanionRelationship;
}): CompanionVisit;
export declare function advanceVisit(visit: CompanionVisit, accepted: boolean): CompanionVisit;
export declare function createSyncEnvelope<TPayload>(input: {
    ownerUserId: string;
    payload: TPayload;
    deviceId: string;
    previous?: VersionVector;
}): SyncEnvelope<TPayload>;
export declare function compareVersionVectors(local: VersionVector, remote: VersionVector): 'local_newer' | 'remote_newer' | 'same' | 'conflict';
export declare function resolveSyncConflict<TPayload extends Record<string, unknown>>(local: SyncEnvelope<TPayload>, remote: SyncEnvelope<TPayload>): SyncEnvelope<TPayload> | SyncConflict<TPayload>;
