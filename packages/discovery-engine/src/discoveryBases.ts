import type { ExplorationIntent } from './adaptiveDiscovery';

export type DiscoveryBaseState = 'trial' | 'active' | 'expired' | 'muted' | 'blocked' | 'rejected';
export type DiscoveryBaseOrigin =
  | 'generic_web'
  | 'search_result'
  | 'feed_detection'
  | 'user'
  | 'connector'
  | 'personality';

export interface DiscoveryBase {
  id: string;
  companionId: string;
  connectorId: string;
  scope: string;
  locator: string;
  data: Readonly<Record<string, unknown>>;
  origin: DiscoveryBaseOrigin;
  state: DiscoveryBaseState;
  discoveredAt: string;
  trialStartedAt?: string;
  trialExpiresAt?: string;
  lastCheckedAt?: string;
  updatedAt: string;
}

export interface DiscoveryConnectorManifest {
  connectorId: string;
  version: string;
  displayName: string;
  scopes: readonly string[];
  capabilities: readonly string[];
  providerMode: 'live' | 'fixture' | 'unavailable';
}

export const MVP_DISCOVERY_CONNECTOR_MANIFESTS: readonly DiscoveryConnectorManifest[] = Object.freeze([
  {
    connectorId: 'generic-web',
    version: '1',
    displayName: 'Generic Web',
    scopes: ['page', 'domain'],
    capabilities: ['safe_fetch', 'generic_extract', 'feed_detect'],
    providerMode: 'live'
  },
  {
    connectorId: 'rss',
    version: '1',
    displayName: 'RSS and Atom',
    scopes: ['feed'],
    capabilities: ['rss', 'atom'],
    providerMode: 'live'
  },
  {
    connectorId: 'brave-search',
    version: '1',
    displayName: 'Brave Search',
    scopes: ['query'],
    capabilities: ['search'],
    providerMode: 'unavailable'
  },
  {
    connectorId: 'fixture-search',
    version: '1',
    displayName: 'Fixture Search',
    scopes: ['query'],
    capabilities: ['search'],
    providerMode: 'fixture'
  }
]);

export interface DiscoveryConnectorResult {
  externalId?: string;
  title: string;
  url?: string;
  content?: string;
  publishedAt?: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface DynamicDiscoveryConnector {
  manifest: DiscoveryConnectorManifest;
  validateBase(base: DiscoveryBase): boolean;
  discover(input: {
    base: DiscoveryBase;
    intent: ExplorationIntent;
    limit: number;
  }): Promise<readonly DiscoveryConnectorResult[]>;
}

export class DiscoveryConnectorRegistry {
  private readonly connectors = new Map<string, DynamicDiscoveryConnector>();

  constructor(connectors: readonly DynamicDiscoveryConnector[] = []) {
    for (const connector of connectors) this.register(connector);
  }

  register(connector: DynamicDiscoveryConnector): void {
    const id = connector.manifest.connectorId.trim();
    if (!id) throw new Error('discovery_connector_id_required');
    if (this.connectors.has(id)) throw new Error(`duplicate_discovery_connector:${id}`);
    this.connectors.set(id, connector);
  }

  get(connectorId: string): DynamicDiscoveryConnector | undefined {
    return this.connectors.get(connectorId);
  }

  manifests(): readonly DiscoveryConnectorManifest[] {
    return [...this.connectors.values()]
      .map((connector) => connector.manifest)
      .sort((left, right) => left.connectorId.localeCompare(right.connectorId));
  }

  compatible(base: DiscoveryBase): DynamicDiscoveryConnector | undefined {
    const connector = this.get(base.connectorId);
    return connector?.validateBase(base) ? connector : undefined;
  }
}

export type DiscoveredLinkClassification = 'one_time_evidence' | 'trial' | 'active' | 'reject';

export function classifyDiscoveredLink(input: {
  connectorAvailable: boolean;
  blocked?: boolean;
  explicitUserRequest?: boolean;
  explicitlyTrusted?: boolean;
  feedDetected?: boolean;
  personalSite?: boolean;
  trustScore?: number;
  relevanceScore?: number;
}): DiscoveredLinkClassification {
  if (input.blocked || !input.connectorAvailable) return 'reject';
  if (input.explicitUserRequest && input.explicitlyTrusted) return 'active';
  if (input.explicitUserRequest) return 'trial';
  // A personal site may be useful evidence without becoming a durable subscription.
  if (input.personalSite) return 'one_time_evidence';
  if (input.feedDetected && (input.trustScore ?? 0) >= 0.6 && (input.relevanceScore ?? 0) >= 0.6) {
    return 'trial';
  }
  return 'one_time_evidence';
}

export interface DiscoveryTrialPolicy {
  trialDays: number;
  maxNewTrialsPerDay: number;
  maxTrialBases: number;
  maxActiveBases: number;
  maxTotalBases?: number;
}

export const DEFAULT_DISCOVERY_TRIAL_POLICY: Readonly<DiscoveryTrialPolicy> = Object.freeze({
  trialDays: 10,
  maxNewTrialsPerDay: 2,
  maxTrialBases: 8,
  maxActiveBases: 24,
  maxTotalBases: 32
});

function dayKey(value: string): string {
  return value.slice(0, 10);
}

export function canStartDiscoveryTrial(input: {
  companionId: string;
  bases: readonly DiscoveryBase[];
  now: string;
  policy?: DiscoveryTrialPolicy;
}): {
  allowed: boolean;
  reason?: 'daily_trial_limit' | 'trial_base_limit' | 'active_base_limit' | 'total_base_limit';
} {
  const policy = input.policy ?? DEFAULT_DISCOVERY_TRIAL_POLICY;
  const owned = input.bases.filter((base) => base.companionId === input.companionId);
  if (
    owned.filter((base) => base.state === 'active' || base.state === 'trial').length
    >= (policy.maxTotalBases ?? policy.maxActiveBases + policy.maxTrialBases)
  ) {
    return { allowed: false, reason: 'total_base_limit' };
  }
  if (owned.filter((base) => base.state === 'active').length >= policy.maxActiveBases) {
    return { allowed: false, reason: 'active_base_limit' };
  }
  if (owned.filter((base) => base.state === 'trial').length >= policy.maxTrialBases) {
    return { allowed: false, reason: 'trial_base_limit' };
  }
  const today = dayKey(input.now);
  const trialsStartedToday = owned.filter((base) =>
    base.trialStartedAt && dayKey(base.trialStartedAt) === today
  ).length;
  if (trialsStartedToday >= policy.maxNewTrialsPerDay) {
    return { allowed: false, reason: 'daily_trial_limit' };
  }
  return { allowed: true };
}

export function startDiscoveryTrial(input: {
  base: Omit<DiscoveryBase, 'state' | 'trialStartedAt' | 'trialExpiresAt' | 'updatedAt'>;
  now: string;
  policy?: DiscoveryTrialPolicy;
}): DiscoveryBase {
  const policy = input.policy ?? DEFAULT_DISCOVERY_TRIAL_POLICY;
  const trialDays = Math.min(14, Math.max(7, Math.floor(policy.trialDays)));
  return {
    ...input.base,
    state: 'trial',
    trialStartedAt: input.now,
    trialExpiresAt: new Date(Date.parse(input.now) + trialDays * 24 * 60 * 60 * 1_000).toISOString(),
    updatedAt: input.now
  };
}

export type DiscoveryBaseFeedback = 'useful' | 'saved' | 'ignored' | 'disliked' | 'mute' | 'block' | 'none';

export function transitionDiscoveryBase(input: {
  base: DiscoveryBase;
  feedback: DiscoveryBaseFeedback;
  now: string;
}): DiscoveryBase {
  if (input.base.state === 'blocked') return input.base;
  let state: DiscoveryBaseState = input.base.state;
  if (input.feedback === 'block') state = 'blocked';
  else if (input.feedback === 'mute') state = 'muted';
  else if (input.feedback === 'useful' || input.feedback === 'saved') state = 'active';
  else if (input.feedback === 'ignored' || input.feedback === 'disliked') state = 'rejected';
  else if (
    input.base.state === 'trial'
    && input.base.trialExpiresAt
    && Date.parse(input.now) >= Date.parse(input.base.trialExpiresAt)
  ) {
    state = 'expired';
  }
  return state === input.base.state ? input.base : { ...input.base, state, updatedAt: input.now };
}
