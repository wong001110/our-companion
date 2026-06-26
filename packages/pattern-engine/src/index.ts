import type { Concept, Discovery, DiscoveryFeedback, JourneyMilestone, MemoryNode, Pattern, PatternEvidence, PatternType } from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

export interface DetectPatternsInput {
  userId: string;
  memoryNodes: MemoryNode[];
  journeyMilestones: JourneyMilestone[];
  discoveryHistory: Discovery[];
  feedbackHistory: DiscoveryFeedback[];
  conversationSummaries?: string[];
}

export interface PatternScore {
  frequency: number;
  recency: number;
  emotionalWeight: number;
  feedbackWeight: number;
  finalScore: number;
}

export interface DetectCognitivePatternsInput {
  userId: string;
  concepts: Concept[];
  discoveries: Discovery[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function scorePattern(input: Omit<PatternScore, 'finalScore'>): PatternScore {
  const finalScore = clamp01(
    input.frequency * 0.35 + input.recency * 0.25 + input.emotionalWeight * 0.2 + input.feedbackWeight * 0.2
  );
  return { ...input, finalScore };
}

function tokenize(value: string): string[] {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'ann', 'our']);
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stop.has(token));
}

function createPattern(input: {
  userId: string;
  type: PatternType;
  title: string;
  summary: string;
  score: PatternScore;
  evidence: PatternEvidence[];
}): Pattern {
  const timestamp = nowIso();
  return {
    id: createId('pattern'),
    userId: input.userId,
    type: input.type,
    title: input.title,
    summary: input.summary,
    confidence: Math.max(0.4, input.score.finalScore),
    strength: input.score.finalScore,
    freshness: input.score.recency,
    evidence: input.evidence,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function detectPatterns(input: DetectPatternsInput): Pattern[] {
  const textItems = [
    ...input.memoryNodes.map((node) => ({
      sourceType: 'memory' as const,
      sourceId: node.id,
      text: `${node.title} ${node.summary ?? ''} ${node.content ?? ''}`,
      weight: node.importanceScore / 100
    })),
    ...input.journeyMilestones.map((milestone) => ({
      sourceType: 'journey_event' as const,
      sourceId: milestone.id,
      text: `${milestone.title} ${milestone.summary ?? ''}`,
      weight: 0.7
    })),
    ...input.discoveryHistory.map((discovery) => ({
      sourceType: discovery.status === 'rejected' ? ('dismissed_discovery' as const) : ('saved_discovery' as const),
      sourceId: discovery.id,
      text: `${discovery.title} ${discovery.summary ?? ''} ${discovery.tags.join(' ')}`,
      weight: discovery.status === 'saved' ? 0.9 : 0.45
    })),
    ...(input.conversationSummaries ?? []).map((summary) => ({
      sourceType: 'conversation' as const,
      sourceId: undefined,
      text: summary,
      weight: 0.65
    }))
  ];

  const counts = new Map<string, { count: number; weight: number; evidence: PatternEvidence[] }>();
  for (const item of textItems) {
    for (const token of new Set(tokenize(item.text))) {
      const existing = counts.get(token) ?? { count: 0, weight: 0, evidence: [] };
      existing.count += 1;
      existing.weight += item.weight;
      existing.evidence.push({
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        summary: item.text.slice(0, 160),
        weight: item.weight
      });
      counts.set(token, existing);
    }
  }

  const patterns: Pattern[] = [];
  const repeated = [...counts.entries()]
    .filter(([, value]) => value.count >= 2)
    .sort((left, right) => right[1].weight - left[1].weight)
    .slice(0, 4);

  for (const [token, value] of repeated) {
    const score = scorePattern({
      frequency: clamp01(value.count / Math.max(textItems.length, 1)),
      recency: 0.85,
      emotionalWeight: clamp01(value.weight / Math.max(value.count, 1)),
      feedbackWeight: input.feedbackHistory.some((feedback) => feedback.value === 'saved' || feedback.value === 'talk_about_this') ? 0.8 : 0.45
    });
    patterns.push(
      createPattern({
        userId: input.userId,
        type: 'repeated_theme',
        title: `${token[0].toUpperCase()}${token.slice(1)} keeps appearing`,
        summary: `Ann noticed "${token}" appearing across memory, journey, or discovery history.`,
        score,
        evidence: value.evidence.slice(0, 5)
      })
    );
  }

  const saved = input.discoveryHistory.filter((item) => item.status === 'saved');
  const rejected = input.discoveryHistory.filter((item) => item.status === 'rejected');
  if (saved.length >= 2) {
    patterns.push(
      createPattern({
        userId: input.userId,
        type: 'returning_topic',
        title: 'Saved discoveries are forming a direction',
        summary: 'The user has saved multiple discoveries, so Ann should bias curiosity toward this cluster.',
        score: scorePattern({ frequency: 0.7, recency: 0.8, emotionalWeight: 0.65, feedbackWeight: 0.9 }),
        evidence: saved.slice(0, 5).map((item) => ({
          sourceType: 'saved_discovery',
          sourceId: item.id,
          summary: item.title,
          weight: 0.85
        }))
      })
    );
  }

  if (rejected.length >= 2) {
    patterns.push(
      createPattern({
        userId: input.userId,
        type: 'abandoned_direction',
        title: 'Some discovery directions are losing fit',
        summary: 'The user dismissed multiple discoveries, so related future topics should decay.',
        score: scorePattern({ frequency: 0.6, recency: 0.8, emotionalWeight: 0.45, feedbackWeight: 0.85 }),
        evidence: rejected.slice(0, 5).map((item) => ({
          sourceType: 'dismissed_discovery',
          sourceId: item.id,
          summary: item.title,
          weight: 0.8
        }))
      })
    );
  }

  return patterns.sort((left, right) => right.strength - left.strength).slice(0, 8);
}

export function detectCognitivePatterns(input: DetectCognitivePatternsInput): Pattern[] {
  const timestamp = nowIso();
  const patterns: Pattern[] = [];
  const activeConcepts = input.concepts.filter((concept) => concept.status === 'active');
  const sourceCounts = new Map<string, Set<string>>();

  for (const discovery of input.discoveries) {
    for (const tag of discovery.tags) {
      const sources = sourceCounts.get(tag) ?? new Set<string>();
      sources.add(discovery.source);
      sourceCounts.set(tag, sources);
    }
  }

  for (const concept of activeConcepts.filter((item) => item.relatedDiscoveryIds.length >= 2).slice(0, 4)) {
    patterns.push({
      id: createId('pattern'),
      userId: input.userId,
      type: 'repeated_topic',
      title: `${concept.name} keeps resurfacing`,
      summary: concept.summary,
      description: `The concept has ${concept.relatedDiscoveryIds.length} related discoveries.`,
      relatedConceptIds: [concept.id],
      relatedDiscoveryIds: concept.relatedDiscoveryIds,
      confidence: Math.min(1, concept.strength / 5),
      strength: Math.min(1, concept.strength / 5),
      freshness: 0.85,
      evidence: concept.relatedDiscoveryIds.map((id) => ({
        sourceType: 'discovery_feedback',
        sourceId: id,
        summary: concept.name,
        weight: 0.7
      })),
      detectedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  for (const [tag, sources] of [...sourceCounts.entries()].filter(([, sourcesForTag]) => sourcesForTag.size >= 2).slice(0, 3)) {
    const related = input.discoveries.filter((discovery) => discovery.tags.includes(tag));
    patterns.push({
      id: createId('pattern'),
      userId: input.userId,
      type: 'cross_source_trend',
      title: `${tag} appears across sources`,
      summary: `${tag} appeared in ${sources.size} source types.`,
      description: 'Multiple sources are pointing at the same topic.',
      relatedDiscoveryIds: related.map((discovery) => discovery.id),
      confidence: Math.min(1, sources.size / 4),
      strength: Math.min(1, related.length / 4),
      freshness: 0.8,
      evidence: related.map((discovery) => ({
        sourceType: discovery.status === 'saved' ? 'saved_discovery' : 'discovery_feedback',
        sourceId: discovery.id,
        summary: discovery.title,
        weight: 0.65
      })),
      detectedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  return patterns.sort((left, right) => right.strength - left.strength);
}
