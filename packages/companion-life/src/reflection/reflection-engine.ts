import { createId, nowIso } from '@our-companion/shared';

export type ReflectionType =
  | 'daily'
  | 'discovery'
  | 'conversation'
  | 'journey'
  | 'relationship';

export interface ReflectionEntry {
  id: string;
  characterId: string;
  type: ReflectionType;
  title: string;
  content: string;
  relatedMemoryIds?: string[];
  relatedDiscoveryIds?: string[];
  relatedJourneyId?: string;
  createdAt: string;
}

export interface GenerateReflectionInput {
  characterId: string;
  type: ReflectionType;
  events: ReflectionEvent[];
  recentMemories: Array<{ id: string; title: string; summary?: string }>;
  recentDiscoveries: Array<{ id: string; title: string; summary?: string }>;
  journeyTitle?: string;
}

export interface ReflectionEvent {
  type: string;
  summary: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export function generateReflection(input: GenerateReflectionInput): ReflectionEntry {
  const eventSummary = input.events
    .slice(0, 5)
    .map((e) => `- ${e.summary}`)
    .join('\n');

  const memoryRefs = input.recentMemories.slice(0, 3).map((m) => m.id);
  const discoveryRefs = input.recentDiscoveries.slice(0, 3).map((d) => d.id);

  const titles: Record<ReflectionType, string> = {
    daily: `Daily reflection for ${new Date().toLocaleDateString()}`,
    discovery: `Discovery reflection: ${input.recentDiscoveries[0]?.title ?? 'new findings'}`,
    conversation: 'Conversation reflection',
    journey: `Journey reflection: ${input.journeyTitle ?? 'ongoing'}`,
    relationship: 'Relationship reflection',
  };

  const contents: Record<ReflectionType, string> = {
    daily: `Today's events:\n${eventSummary || 'A quiet day.'}`,
    discovery: `Discoveries reviewed:\n${input.recentDiscoveries.map((d) => `- ${d.title}`).join('\n') || 'No new discoveries.'}`,
    conversation: `Conversations today:\n${eventSummary || 'No significant conversations.'}`,
    journey: `Journey progress: ${input.journeyTitle ?? 'ongoing'}\n${eventSummary || 'Continuing steadily.'}`,
    relationship: `Relationship observations:\n${eventSummary || 'Growing together naturally.'}`,
  };

  return {
    id: createId('reflect'),
    characterId: input.characterId,
    type: input.type,
    title: titles[input.type],
    content: contents[input.type],
    relatedMemoryIds: memoryRefs.length > 0 ? memoryRefs : undefined,
    relatedDiscoveryIds: discoveryRefs.length > 0 ? discoveryRefs : undefined,
    relatedJourneyId: input.journeyTitle ? undefined : undefined,
    createdAt: nowIso(),
  };
}

export function shouldGenerateReflection(
  type: ReflectionType,
  lastReflectionAt?: string
): boolean {
  if (!lastReflectionAt) return true;
  const elapsed = Date.now() - new Date(lastReflectionAt).getTime();
  const cooldowns: Record<ReflectionType, number> = {
    daily: 20 * 60 * 60 * 1000,
    discovery: 4 * 60 * 60 * 1000,
    conversation: 2 * 60 * 60 * 1000,
    journey: 24 * 60 * 60 * 1000,
    relationship: 48 * 60 * 60 * 1000,
  };
  return elapsed >= cooldowns[type];
}
