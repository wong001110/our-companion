import type {
  CharacterProfile,
  CharacterRuntimeState,
  CompanionInsight,
  CuriosityTarget,
  DiscoveryCandidate,
  InterestGraph,
  InsightCategory,
  ExplorationCycleResult,
  MemoryNode,
  Pattern
} from '@our-companion/shared';
import { clamp01, createId, nowIso } from '@our-companion/shared';

type GeneratedInsight = ExplorationCycleResult['insights'][number];

export interface GenerateInsightsInput {
  userId: string;
  companionId: string;
  characterState: CharacterRuntimeState;
  characterProfile?: CharacterProfile;
  memoryNodes: MemoryNode[];
  patterns: Pattern[];
  interestGraph: InterestGraph;
  curiosityTarget: CuriosityTarget;
  discoveryCandidates: DiscoveryCandidate[];
}

export interface InsightSelectionScore {
  confidence: number;
  novelty: number;
  emotionalRelevance: number;
  practicalRelevance: number;
  relationshipFit: number;
  finalScore: number;
}

export function scoreInsight(input: Omit<InsightSelectionScore, 'finalScore'>): InsightSelectionScore {
  const finalScore = clamp01(
    input.confidence * 0.2 +
      input.novelty * 0.2 +
      input.emotionalRelevance * 0.25 +
      input.practicalRelevance * 0.2 +
      input.relationshipFit * 0.15
  );
  return { ...input, finalScore };
}

export function narrateInsight(insight: CompanionInsight): string {
  return [
    'I found something interesting while exploring.',
    insight.insight,
    insight.whyItMatters
  ]
    .filter(Boolean)
    .join('\n\n');
}

function average(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function generateInsights(input: GenerateInsightsInput): GeneratedInsight[] {
  const candidates = input.discoveryCandidates;
  const primaryCandidate = [...candidates].sort(
    (left, right) =>
      right.relevanceScore + right.noveltyScore + right.usefulnessScore - (left.relevanceScore + left.noveltyScore + left.usefulnessScore)
  )[0];
  const relatedPattern = input.patterns.find((pattern) =>
    input.curiosityTarget.relatedPatternIds?.includes(pattern.id)
  ) ?? input.patterns[0];
  const relatedMemoryIds = input.curiosityTarget.relatedMemoryIds ?? input.memoryNodes.slice(0, 2).map((memory) => memory.id);
  const supportingCandidateIds = candidates.slice(0, 4).map((candidate) => candidate.id);
  const timestamp = nowIso();
  const confidence = average(candidates.map((candidate) => candidate.evidenceScore), input.curiosityTarget.confidence);
  const novelty = average(candidates.map((candidate) => candidate.noveltyScore), 0.55);
  const practicalRelevance = average(candidates.map((candidate) => candidate.usefulnessScore), 0.5);

  const category: InsightCategory = input.curiosityTarget.explorationType === 'practical' ? 'project' : 'discovery';

  const insight: GeneratedInsight = {
    id: createId('insight'),
    userId: input.userId,
    category,
    title: primaryCandidate ? `A signal around ${input.curiosityTarget.topic}` : `A question about ${input.curiosityTarget.topic}`,
    summary: primaryCandidate?.summary ?? input.curiosityTarget.description,
    explanation: primaryCandidate
      ? `${primaryCandidate.title} points toward ${input.curiosityTarget.topic} being worth a closer look.`
      : `Companion could not find strong outside evidence yet, but ${input.curiosityTarget.topic} still looks meaningful from memory and patterns.`,
    supportingPatternIds: relatedPattern ? [relatedPattern.id] : [],
    supportingMemoryIds: relatedMemoryIds,
    confidence,
    importance: practicalRelevance,
    novelty,
    evidenceCount: supportingCandidateIds.length,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return [insight];
}

export function selectPrimaryInsight(insights: GeneratedInsight[]): GeneratedInsight | undefined {
  return [...insights].sort((left, right) => {
    const leftScore = scoreInsight({
      confidence: left.confidence,
      novelty: left.novelty,
      emotionalRelevance: 0.5,
      practicalRelevance: left.importance,
      relationshipFit: 0.7
    }).finalScore;
    const rightScore = scoreInsight({
      confidence: right.confidence,
      novelty: right.novelty,
      emotionalRelevance: 0.5,
      practicalRelevance: right.importance,
      relationshipFit: 0.7
    }).finalScore;
    return rightScore - leftScore;
  })[0];
}
