import type {
  CuriosityCandidate,
  CuriositySource,
  ExplorationType,
  MemoryRecord,
  PatternV2,
  InsightV2,
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';
import { MIN_CANDIDATE_PRIORITY } from './types';

function createCandidate(input: {
  userId: string;
  source: CuriositySource;
  title: string;
  description: string;
  category: string;
  relatedMemoryIds?: string[];
  relatedInsightIds?: string[];
  novelty: number;
  relevance: number;
  confidence: number;
  priority: number;
}): CuriosityCandidate {
  const timestamp = nowIso();
  return {
    id: createId('curiosity'),
    userId: input.userId,
    source: input.source,
    title: input.title,
    description: input.description,
    category: input.category,
    relatedMemoryIds: input.relatedMemoryIds ?? [],
    relatedInsightIds: input.relatedInsightIds ?? [],
    novelty: input.novelty,
    relevance: input.relevance,
    confidence: input.confidence,
    priority: Math.max(MIN_CANDIDATE_PRIORITY, input.priority),
    freshness: 1.0,
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function generateFromMemories(memories: MemoryRecord[], userId: string): CuriosityCandidate[] {
  const candidates: CuriosityCandidate[] = [];
  const seen = new Set<string>();

  for (const memory of memories.slice(0, 5)) {
    const title = memory.content.slice(0, 60);
    if (seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());

    candidates.push(createCandidate({
      userId,
      source: 'memory_trigger',
      title: `Explore: ${title}`,
      description: `Memory suggests interest in ${memory.tags.join(', ') || 'this topic'}.`,
      category: 'memory',
      relatedMemoryIds: [memory.id],
      novelty: 0.5,
      relevance: memory.importance / 100,
      confidence: memory.confidence,
      priority: memory.importance / 100 * 0.8,
    }));
  }

  return candidates;
}

export function generateFromPatterns(patterns: PatternV2[], userId: string): CuriosityCandidate[] {
  const candidates: CuriosityCandidate[] = [];

  for (const pattern of patterns.slice(0, 3)) {
    candidates.push(createCandidate({
      userId,
      source: 'pattern_trigger',
      title: `Investigate: ${pattern.title}`,
      description: pattern.summary,
      category: 'pattern',
      novelty: Math.max(0.2, 1 - pattern.reinforcementCount * 0.1),
      relevance: pattern.strength,
      confidence: pattern.confidence,
      priority: pattern.confidence * 0.9,
    }));
  }

  return candidates;
}

export function generateFromInsights(insights: InsightV2[], userId: string): CuriosityCandidate[] {
  const candidates: CuriosityCandidate[] = [];

  for (const insight of insights.slice(0, 3)) {
    if (insight.confidence < 0.5) continue;

    candidates.push(createCandidate({
      userId,
      source: 'novelty_trigger',
      title: `Deepen: ${insight.title}`,
      description: insight.explanation,
      category: 'insight',
      relatedInsightIds: [insight.id],
      novelty: insight.novelty,
      relevance: insight.importance,
      confidence: insight.confidence,
      priority: insight.importance * 0.85,
    }));
  }

  return candidates;
}

export function generateDefaultCandidate(userId: string): CuriosityCandidate {
  return createCandidate({
    userId,
    source: 'character_trigger',
    title: 'Explore ambient AI companion interfaces',
    description: 'Explore AI interfaces that feel present without becoming a normal chat feed.',
    category: 'default',
    novelty: 0.7,
    relevance: 0.6,
    confidence: 0.6,
    priority: 0.5,
  });
}
