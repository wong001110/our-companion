export type DiscoveryMode = 'core' | 'adjacent' | 'wildcard' | 'challenge';

export type DiscoveryModeWeights = Readonly<Record<DiscoveryMode, number>>;

export const DEFAULT_DISCOVERY_MODE_WEIGHTS: DiscoveryModeWeights = Object.freeze({
  core: 0.5,
  adjacent: 0.3,
  wildcard: 0.15,
  challenge: 0.05
});

export const MAX_PERSONALITY_MODE_SHIFT = 0.05;

const DISCOVERY_MODES: readonly DiscoveryMode[] = ['core', 'adjacent', 'wildcard', 'challenge'];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundedWeights(weights: Record<DiscoveryMode, number>): DiscoveryModeWeights {
  const rounded = Object.fromEntries(
    DISCOVERY_MODES.map((mode) => [mode, Math.round(weights[mode] * 1_000_000) / 1_000_000])
  ) as Record<DiscoveryMode, number>;
  const total = DISCOVERY_MODES.reduce((sum, mode) => sum + rounded[mode], 0);
  rounded.core = Math.round((rounded.core + 1 - total) * 1_000_000) / 1_000_000;
  return rounded;
}

/**
 * Applies a deliberately small personality bias, then shifts discovery away
 * from core topics when recent-topic saturation is high.
 */
export function adjustDiscoveryModeWeights(input: {
  base?: DiscoveryModeWeights;
  personalityBias?: Partial<Record<DiscoveryMode, number>>;
  saturationPenalty?: number;
} = {}): DiscoveryModeWeights {
  const base = input.base ?? DEFAULT_DISCOVERY_MODE_WEIGHTS;
  const requested = DISCOVERY_MODES.map((mode) =>
    clamp(input.personalityBias?.[mode] ?? 0, -MAX_PERSONALITY_MODE_SHIFT, MAX_PERSONALITY_MODE_SHIFT)
  );
  const mean = requested.reduce((sum, value) => sum + value, 0) / requested.length;
  const centered = requested.map((value) => value - mean);
  const largestShift = Math.max(...centered.map(Math.abs), 0);
  const scale = largestShift > MAX_PERSONALITY_MODE_SHIFT
    ? MAX_PERSONALITY_MODE_SHIFT / largestShift
    : 1;
  const weights = Object.fromEntries(
    DISCOVERY_MODES.map((mode, index) => [
      mode,
      Math.max(0, base[mode] + (centered[index] ?? 0) * scale)
    ])
  ) as Record<DiscoveryMode, number>;

  const personalityTotal = DISCOVERY_MODES.reduce((sum, mode) => sum + weights[mode], 0);
  for (const mode of DISCOVERY_MODES) weights[mode] /= personalityTotal;

  const saturationPenalty = clamp(input.saturationPenalty ?? 0, 0, 1);
  const saturationShift = Math.min(weights.core, saturationPenalty * 0.2);
  weights.core -= saturationShift;
  weights.adjacent += saturationShift * 0.5;
  weights.wildcard += saturationShift * 0.3;
  weights.challenge += saturationShift * 0.2;
  return roundedWeights(weights);
}

export function selectDiscoveryMode(
  roll: number,
  weights: DiscoveryModeWeights = DEFAULT_DISCOVERY_MODE_WEIGHTS
): DiscoveryMode {
  const normalizedRoll = clamp(roll, 0, 0.999999999);
  let cumulative = 0;
  for (const mode of DISCOVERY_MODES) {
    cumulative = Math.round((cumulative + weights[mode]) * 1_000_000_000) / 1_000_000_000;
    if (normalizedRoll < cumulative) return mode;
  }
  return 'challenge';
}

export type ExplorationFreshness = 'breaking' | 'recent' | 'evergreen' | 'any';
export type ExplorationTrustRequirement = 'primary' | 'corroborated' | 'open';

export interface ExplorationIntent {
  mode: DiscoveryMode;
  topic: string;
  question: string;
  expectedValue: string;
  evidenceRequirements: readonly string[];
  freshness: ExplorationFreshness;
  trustRequirement: ExplorationTrustRequirement;
  languages: readonly string[];
  regions: readonly string[];
  domainHints: readonly string[];
  searchTasks: readonly string[];
  createdAt: string;
}

const MODE_QUESTIONS: Readonly<Record<DiscoveryMode, (topic: string) => string>> = {
  core: (topic) => `What useful development most directly advances ${topic}?`,
  adjacent: (topic) => `What neighboring idea could improve how ${topic} is understood or practiced?`,
  wildcard: (topic) => `What surprising connection could create new value around ${topic}?`,
  challenge: (topic) => `What credible evidence challenges current assumptions about ${topic}?`
};

export function createExplorationIntent(input: {
  mode: DiscoveryMode;
  topic: string;
  question?: string;
  expectedValue?: string;
  evidenceRequirements?: readonly string[];
  freshness?: ExplorationFreshness;
  trustRequirement?: ExplorationTrustRequirement;
  languages?: readonly string[];
  regions?: readonly string[];
  domainHints?: readonly string[];
  searchTasks?: readonly string[];
  createdAt: string;
}): ExplorationIntent {
  const topic = input.topic.trim();
  if (!topic) throw new Error('exploration_intent_topic_required');
  const question = input.question?.trim() || MODE_QUESTIONS[input.mode](topic);
  const domainHints = (input.domainHints ?? []).flatMap((value) => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return [];
    try {
      const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
      return /^[a-z0-9.-]+$/i.test(parsed.hostname) ? [parsed.hostname] : [];
    } catch {
      return [];
    }
  });
  return {
    mode: input.mode,
    topic,
    question,
    expectedValue: input.expectedValue?.trim() || 'Provide specific, evidence-backed information that changes what the companion can suggest.',
    evidenceRequirements: input.evidenceRequirements?.length
      ? [...input.evidenceRequirements]
      : ['readable evidence', 'clear provenance'],
    freshness: input.freshness ?? 'any',
    trustRequirement: input.trustRequirement ?? 'corroborated',
    languages: input.languages?.length ? [...input.languages] : ['en'],
    regions: input.regions?.length ? [...input.regions] : [],
    domainHints: [...new Set(domainHints)],
    searchTasks: input.searchTasks?.map((task) => task.trim()).filter(Boolean) ?? [question],
    createdAt: input.createdAt
  };
}

export type TopicHistoryDisposition = 'presented' | 'saved' | 'ignored';

export interface TopicHistoryItem {
  topicFingerprint: string;
  eventKey?: string;
  disposition: TopicHistoryDisposition;
  occurredAt: string;
}

export interface TopicSaturationResult {
  blocked: boolean;
  reason?: 'same_event_seen' | 'ignored_topic_cooldown' | 'saved_requires_material_update';
  penalty: number;
  modeWeights: DiscoveryModeWeights;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

export function evaluateTopicSaturation(input: {
  topicFingerprint: string;
  eventKey?: string;
  materialUpdate?: boolean;
  history: readonly TopicHistoryItem[];
  now: string;
  baseWeights?: DiscoveryModeWeights;
}): TopicSaturationResult {
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) throw new Error('invalid_topic_saturation_time');

  if (
    !input.materialUpdate
    && input.eventKey
    && input.history.some((item) => item.eventKey === input.eventKey)
  ) {
    return {
      blocked: true,
      reason: 'same_event_seen',
      penalty: 1,
      modeWeights: adjustDiscoveryModeWeights({ base: input.baseWeights, saturationPenalty: 1 })
    };
  }

  const matching = input.history.filter((item) => item.topicFingerprint === input.topicFingerprint);
  const ignoredRecently = matching.some((item) =>
    item.disposition === 'ignored' && nowMs - Date.parse(item.occurredAt) <= 90 * DAY_MS
  );
  if (ignoredRecently) {
    return {
      blocked: true,
      reason: 'ignored_topic_cooldown',
      penalty: 1,
      modeWeights: adjustDiscoveryModeWeights({ base: input.baseWeights, saturationPenalty: 1 })
    };
  }

  if (!input.materialUpdate && matching.some((item) => item.disposition === 'saved')) {
    return {
      blocked: true,
      reason: 'saved_requires_material_update',
      penalty: 1,
      modeWeights: adjustDiscoveryModeWeights({ base: input.baseWeights, saturationPenalty: 1 })
    };
  }

  let penalty = 0;
  for (const item of matching) {
    const ageMs = nowMs - Date.parse(item.occurredAt);
    if (ageMs <= 3 * DAY_MS) penalty = Math.max(penalty, 0.9);
    else if (ageMs <= 7 * DAY_MS) penalty = Math.max(penalty, 0.6);
  }
  return {
    blocked: false,
    penalty,
    modeWeights: adjustDiscoveryModeWeights({ base: input.baseWeights, saturationPenalty: penalty })
  };
}
