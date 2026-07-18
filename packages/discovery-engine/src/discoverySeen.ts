import { createSemanticFingerprint } from '@our-companion/shared';

export type DiscoverySeenIdentityType =
  | 'external_id'
  | 'canonical_url'
  | 'content_hash'
  | 'fingerprint'
  | 'event_key';

export interface DiscoverySeenIdentity {
  type: DiscoverySeenIdentityType;
  hash: string;
  normalizedValue: string;
}

export interface DiscoveryIdentityCandidate {
  connectorId?: string;
  externalId?: string;
  canonicalUrl?: string;
  contentHash?: string;
  eventKey?: string;
  title: string;
  keyNouns?: readonly string[];
  entities?: readonly string[];
  topics?: readonly string[];
  publishedAt?: string;
  observedAt: string;
  materialFacts?: readonly string[];
  version?: string;
}

export interface SeenDiscoveryRecord {
  discoveryId: string;
  identities: readonly DiscoverySeenIdentity[];
  seenAt: string;
  contentHash?: string;
  materialFacts?: readonly string[];
  publishedAt?: string;
  version?: string;
  topicFingerprint?: string;
}

export type DiscoveryDedupOutcome = 'duplicate' | 'revival' | 'material_update' | 'new';
export type DiscoveryDedupLayer =
  | 'external_id'
  | 'canonical_url'
  | 'content_hash'
  | 'event_key'
  | 'fingerprint'
  | 'topic';

export interface DiscoveryDedupResult {
  outcome: DiscoveryDedupOutcome;
  layer?: DiscoveryDedupLayer;
  existingDiscoveryId?: string;
  attachEvidenceOnly: boolean;
  reason: string;
  identities: readonly DiscoverySeenIdentity[];
}

function normalizedText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSeenUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || ['ref', 'fbclid', 'gclid'].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.trim();
  }
}

function identity(type: DiscoverySeenIdentityType, normalizedValue: string): DiscoverySeenIdentity {
  return {
    type,
    hash: createSemanticFingerprint('discovery_seen', [type, normalizedValue]),
    normalizedValue
  };
}

export function createEventFingerprint(input: Pick<
  DiscoveryIdentityCandidate,
  'title' | 'keyNouns' | 'entities' | 'publishedAt'
>): string {
  const significantWords = normalizedText(input.title)
    .split(' ')
    .filter((word) => word.length > 2)
    .sort();
  const keyNouns = (input.keyNouns ?? []).map(normalizedText).filter(Boolean).sort();
  const entities = (input.entities ?? []).map(normalizedText).filter(Boolean).sort();
  const publicationDay = input.publishedAt?.slice(0, 10) ?? '';
  return createSemanticFingerprint(
    'discovery_event',
    [...significantWords, '|', ...keyNouns, '|', ...entities, '|', publicationDay]
  );
}

export function createTopicFingerprint(topics: readonly string[] = []): string | undefined {
  const normalized = topics.map(normalizedText).filter(Boolean).sort();
  return normalized.length ? createSemanticFingerprint('discovery_topic', normalized) : undefined;
}

export function createDiscoverySeenIdentities(candidate: DiscoveryIdentityCandidate): readonly DiscoverySeenIdentity[] {
  const identities: DiscoverySeenIdentity[] = [];
  if (candidate.externalId) {
    const providerIdentity = `${normalizedText(candidate.connectorId ?? 'unknown')}:${normalizedText(candidate.externalId)}`;
    identities.push(identity('external_id', providerIdentity));
  }
  if (candidate.canonicalUrl) identities.push(identity('canonical_url', normalizeSeenUrl(candidate.canonicalUrl)));
  if (candidate.contentHash) identities.push(identity('content_hash', candidate.contentHash.trim().toLowerCase()));
  if (candidate.eventKey) identities.push(identity('event_key', normalizedText(candidate.eventKey)));
  identities.push(identity('fingerprint', createEventFingerprint(candidate)));
  return identities;
}

function materialUpdateReason(
  existing: SeenDiscoveryRecord,
  candidate: DiscoveryIdentityCandidate
): string | undefined {
  if (!candidate.contentHash || !existing.contentHash || candidate.contentHash === existing.contentHash) return undefined;
  const existingFacts = new Set((existing.materialFacts ?? []).map(normalizedText));
  const newFacts = (candidate.materialFacts ?? [])
    .map(normalizedText)
    .filter((fact) => fact && !existingFacts.has(fact));
  const versionChanged = Boolean(candidate.version && existing.version && candidate.version !== existing.version);
  const newerPublication = Boolean(
    candidate.publishedAt
    && (!existing.publishedAt || Date.parse(candidate.publishedAt) > Date.parse(existing.publishedAt))
  );
  if (versionChanged) return 'version_changed';
  if (newFacts.length >= 2) return 'multiple_new_material_facts';
  if (newerPublication && newFacts.length >= 1) return 'newer_publication_with_new_fact';
  return undefined;
}

const IDENTITY_ORDER: readonly DiscoverySeenIdentityType[] = [
  'external_id',
  'canonical_url',
  'content_hash',
  'event_key',
  'fingerprint'
];

export function classifyDiscoveryAgainstSeen(input: {
  candidate: DiscoveryIdentityCandidate;
  existing: readonly SeenDiscoveryRecord[];
  revivalAfterDays?: number;
}): DiscoveryDedupResult {
  const identities = createDiscoverySeenIdentities(input.candidate);
  for (const type of IDENTITY_ORDER) {
    const candidateIdentity = identities.find((item) => item.type === type);
    if (!candidateIdentity) continue;
    const match = input.existing.find((record) =>
      record.identities.some((item) => item.type === type && item.hash === candidateIdentity.hash)
    );
    if (!match) continue;

    if (type === 'external_id' || type === 'canonical_url') {
      const materialReason = materialUpdateReason(match, input.candidate);
      if (materialReason) {
        return {
          outcome: 'material_update',
          layer: type,
          existingDiscoveryId: match.discoveryId,
          attachEvidenceOnly: false,
          reason: materialReason,
          identities
        };
      }
    }
    return {
      outcome: 'duplicate',
      layer: type,
      existingDiscoveryId: match.discoveryId,
      attachEvidenceOnly: Boolean(
        input.candidate.contentHash
        && match.contentHash
        && input.candidate.contentHash !== match.contentHash
      ),
      reason: `${type}_already_seen`,
      identities
    };
  }

  const topicFingerprint = createTopicFingerprint(input.candidate.topics);
  const topicMatch = topicFingerprint
    ? input.existing.find((record) => record.topicFingerprint === topicFingerprint)
    : undefined;
  if (topicMatch) {
    const ageDays = Math.max(
      0,
      (Date.parse(input.candidate.observedAt) - Date.parse(topicMatch.seenAt)) / (24 * 60 * 60 * 1_000)
    );
    if (ageDays >= (input.revivalAfterDays ?? 7)) {
      return {
        outcome: 'revival',
        layer: 'topic',
        existingDiscoveryId: topicMatch.discoveryId,
        attachEvidenceOnly: false,
        reason: 'topic_resurfaced_with_new_event',
        identities
      };
    }
  }

  return {
    outcome: 'new',
    attachEvidenceOnly: false,
    reason: 'no_seen_identity_match',
    identities
  };
}
