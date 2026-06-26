import { createId, nowIso } from '@our-companion/shared';
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.min(1, Math.max(0, value));
}
export function scoreTrust(profile) {
    if (!profile.userPermission)
        return 0;
    return clamp01(profile.sourceReputation * 0.24 +
        profile.sharedHistory * 0.22 +
        profile.confidence * 0.24 +
        profile.freshness * 0.15 +
        0.15);
}
export function canShareKnowledge(input) {
    if (input.privacyLevel !== 'shareable' && input.privacyLevel !== 'public')
        return false;
    if (!input.explicitConsent)
        return false;
    return scoreTrust(input.trust) >= 0.6;
}
export function createKnowledgeExchangePackage(input) {
    if (!canShareKnowledge({ privacyLevel: input.privacyLevel, explicitConsent: input.explicitConsent, trust: input.trust })) {
        return undefined;
    }
    const allowedConceptIds = new Set(input.knowledge.flatMap((item) => item.conceptIds));
    const allowedInsightIds = new Set(input.knowledge.flatMap((item) => item.insightIds));
    return {
        id: createId('exchange'),
        fromCompanionId: input.from.id,
        toCompanionId: input.to?.id,
        concepts: input.concepts.filter((concept) => allowedConceptIds.has(concept.id)),
        insights: input.insights.filter((insight) => allowedInsightIds.has(insight.id)),
        journeySummaries: input.journeySummaries,
        privacyLevel: input.privacyLevel,
        createdAt: nowIso()
    };
}
export function updateRelationship(relationship, outcome) {
    const successfulInteractions = relationship.successfulInteractions + (outcome === 'successful_exchange' ? 1 : 0);
    const affinity = clamp01(relationship.affinity + (outcome === 'successful_exchange' ? 0.12 : outcome === 'rejected' ? -0.08 : 0.02));
    const stage = affinity >= 0.9
        ? 'close'
        : affinity >= 0.72
            ? 'trusted'
            : affinity >= 0.48
                ? 'familiar'
                : affinity >= 0.2
                    ? 'met'
                    : 'unknown';
    return {
        ...relationship,
        successfulInteractions,
        affinity,
        stage,
        updatedAt: nowIso()
    };
}
export function requestCompanionVisit(input) {
    return {
        id: createId('visit'),
        fromCompanionId: input.fromCompanionId,
        toCompanionId: input.toCompanionId,
        state: 'invited',
        maxDurationMinutes: Math.max(2, Math.round(5 + input.relationship.affinity * 25)),
        createdAt: nowIso(),
        updatedAt: nowIso()
    };
}
export function advanceVisit(visit, accepted) {
    const nextState = accepted
        ? visit.state === 'invited'
            ? 'permission_requested'
            : visit.state === 'permission_requested'
                ? 'visiting'
                : visit.state === 'visiting'
                    ? 'exchanging'
                    : visit.state === 'exchanging'
                        ? 'summarized'
                        : 'returned'
        : 'rejected';
    return {
        ...visit,
        state: nextState,
        updatedAt: nowIso()
    };
}
export function createSyncEnvelope(input) {
    const versionVector = { ...(input.previous ?? {}) };
    versionVector[input.deviceId] = (versionVector[input.deviceId] ?? 0) + 1;
    return {
        id: createId('sync'),
        ownerUserId: input.ownerUserId,
        payload: input.payload,
        versionVector,
        encrypted: true,
        createdAt: nowIso()
    };
}
export function compareVersionVectors(local, remote) {
    const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    let localGreater = false;
    let remoteGreater = false;
    for (const key of keys) {
        const left = local[key] ?? 0;
        const right = remote[key] ?? 0;
        if (left > right)
            localGreater = true;
        if (right > left)
            remoteGreater = true;
    }
    if (localGreater && remoteGreater)
        return 'conflict';
    if (localGreater)
        return 'local_newer';
    if (remoteGreater)
        return 'remote_newer';
    return 'same';
}
export function resolveSyncConflict(local, remote) {
    const comparison = compareVersionVectors(local.versionVector, remote.versionVector);
    if (comparison === 'local_newer' || comparison === 'same')
        return local;
    if (comparison === 'remote_newer')
        return remote;
    const merged = { ...local.payload, ...remote.payload };
    const localKeys = Object.keys(local.payload);
    const remoteKeys = Object.keys(remote.payload);
    const overlappingChangedKeys = localKeys.filter((key) => remoteKeys.includes(key) && local.payload[key] !== remote.payload[key]);
    if (overlappingChangedKeys.length > 0) {
        return {
            id: createId('conflict'),
            local,
            remote,
            reason: `Semantic merge needs review for: ${overlappingChangedKeys.join(', ')}`,
            requiresReview: true
        };
    }
    return createSyncEnvelope({
        ownerUserId: local.ownerUserId,
        payload: merged,
        deviceId: 'merge',
        previous: { ...local.versionVector, ...remote.versionVector }
    });
}
