import { createId } from '@our-companion/shared';
import {
  fenceDiscoveryPlatformQuery,
  getDiscoveryPlatformPreset,
  isDiscoveryPlatformId,
  type DiscoveryPlatformId,
} from './discoveryPlatformPresets';
import type { CompanionDiscoveryChannel, CompanionDiscoveryProfile } from './companionDiscoverySeed';

export interface DynamicDiscoveryResearchTask {
  id: string;
  platformId: DiscoveryPlatformId;
  query: string;
  semanticQuery: string;
  rationale: string;
  language?: string;
}

export interface DynamicDiscoveryResearchPlan {
  plannerMode: 'ai' | 'fallback' | 'unavailable';
  plannerReason?: string;
  tasks: DynamicDiscoveryResearchTask[];
  skippedChannels: Array<{
    platformId: DiscoveryPlatformId;
    reason: string;
  }>;
}

const MAX_PLANNER_TASKS = 3;
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 420;

export function enabledDiscoveryChannels(
  channels: readonly CompanionDiscoveryChannel[],
): CompanionDiscoveryChannel[] {
  return channels.filter((channel) => channel.state === 'enabled');
}

export function validateDynamicDiscoveryResearchPlan(input: {
  candidate: unknown;
  enabledPlatformIds: readonly DiscoveryPlatformId[];
  forcedPlatformId?: DiscoveryPlatformId;
}): DynamicDiscoveryResearchPlan | undefined {
  if (!input.candidate || typeof input.candidate !== 'object') return undefined;
  const raw = input.candidate as Record<string, unknown>;
  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const enabled = new Set(input.enabledPlatformIds);
  const seen = new Set<DiscoveryPlatformId>();
  const tasks: DynamicDiscoveryResearchTask[] = [];
  const skippedChannels: DynamicDiscoveryResearchPlan['skippedChannels'] = [];

  for (const entry of tasksRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const task = entry as Record<string, unknown>;
    const platformId = typeof task.platformId === 'string' ? task.platformId : '';
    if (!isDiscoveryPlatformId(platformId)) {
      skippedChannels.push({
        platformId: 'generic-web',
        reason: `Unsupported platform: ${platformId || 'unknown'}`,
      });
      continue;
    }
    if (!enabled.has(platformId)) {
      skippedChannels.push({ platformId, reason: 'Channel is not enabled.' });
      continue;
    }
    if (seen.has(platformId)) {
      skippedChannels.push({ platformId, reason: 'Duplicate platform in planner output.' });
      continue;
    }
    const semanticQuery = typeof task.query === 'string'
      ? task.query.trim().replace(/\s+/g, ' ')
      : '';
    if (semanticQuery.length < MIN_QUERY_LENGTH || semanticQuery.length > MAX_QUERY_LENGTH) {
      skippedChannels.push({ platformId, reason: 'Query length is invalid.' });
      continue;
    }
    if (/^https?:\/\//i.test(semanticQuery) || /\bsite:\s*\S+/i.test(semanticQuery)) {
      skippedChannels.push({ platformId, reason: 'Query must be plain semantic text without URLs or site: operators.' });
      continue;
    }
    const rationale = typeof task.rationale === 'string' && task.rationale.trim()
      ? task.rationale.trim().slice(0, 240)
      : `Explore ${getDiscoveryPlatformPreset(platformId).label} for current curiosity.`;
    const language = typeof task.language === 'string' ? task.language.trim().slice(0, 16) : undefined;
    seen.add(platformId);
    tasks.push({
      id: createId('planner_task'),
      platformId,
      semanticQuery,
      query: fenceDiscoveryPlatformQuery(platformId, semanticQuery),
      rationale,
      language,
    });
    if (tasks.length >= MAX_PLANNER_TASKS) break;
  }

  if (input.forcedPlatformId) {
    const forced = tasks.find((task) => task.platformId === input.forcedPlatformId);
    if (!forced) return undefined;
    return {
      plannerMode: 'ai',
      tasks: [forced],
      skippedChannels,
    };
  }

  if (tasks.length === 0) return undefined;
  return {
    plannerMode: 'ai',
    tasks,
    skippedChannels,
  };
}

export function buildFallbackDiscoveryResearchPlan(input: {
  curiosityTopic: string;
  enabledPlatformIds: readonly DiscoveryPlatformId[];
  forcedPlatformId?: DiscoveryPlatformId;
  language?: string;
  reason: string;
}): DynamicDiscoveryResearchPlan {
  const topic = input.curiosityTopic.trim().replace(/\s+/g, ' ').slice(0, 200);
  const semantic = topic.length >= MIN_QUERY_LENGTH
    ? topic
    : 'useful public examples and recent developments';
  const lower = semantic.toLowerCase();
  const preferred: DiscoveryPlatformId[] = [];

  if (/\b(code|library|repository|implementation|api|sdk|github)\b/.test(lower)) {
    preferred.push('github', 'generic-web');
  } else if (/\b(discussion|opinion|experience|community|reddit)\b/.test(lower)) {
    preferred.push('reddit', 'generic-web');
  } else if (/\b(tutorial|demo|demonstration|workflow|video)\b/.test(lower)) {
    preferred.push('youtube', 'generic-web');
  } else if (/\b(中文|教程|bilibili|哔哩)\b/.test(lower) || input.language === 'zh-CN') {
    preferred.push('bilibili', 'generic-web');
  } else {
    preferred.push('generic-web', 'reddit');
  }

  const enabled = new Set(input.enabledPlatformIds);
  const platformIds = (input.forcedPlatformId
    ? [input.forcedPlatformId]
    : preferred
  ).filter((platformId) => enabled.has(platformId));

  const unique = [...new Set(platformIds)].slice(0, MAX_PLANNER_TASKS);
  const tasks = unique.map((platformId) => ({
    id: createId('planner_task'),
    platformId,
    semanticQuery: semantic,
    query: fenceDiscoveryPlatformQuery(platformId, semantic),
    rationale: `Fallback routing for curiosity about ${semantic}.`,
    language: input.language,
  }));

  return {
    plannerMode: tasks.length > 0 ? 'fallback' : 'unavailable',
    plannerReason: input.reason,
    tasks,
    skippedChannels: input.enabledPlatformIds
      .filter((platformId) => !unique.includes(platformId))
      .map((platformId) => ({ platformId, reason: 'Not selected by fallback routing.' })),
  };
}

export function buildBootstrapCuriosityTopic(profile: CompanionDiscoveryProfile): string {
  const interests = profile.interests.slice(0, 3).join(', ');
  return interests
    ? `What recent tools, discussions or examples could help someone explore ${interests}?`
    : 'What recent public tools, discussions or examples are worth exploring?';
}

export function scorePlatformAffinity(
  platformId: DiscoveryPlatformId,
  affinities: CompanionDiscoveryProfile['platformAffinities'],
): number {
  const value = affinities[platformId];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0.5;
}
