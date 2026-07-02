import type {
  CharacterProfile,
  CharacterRuntimeState,
  CompanionInsight,
  CuriosityTarget,
  DiscoveryCandidate,
  InterestGraph,
  Insight,
  InsightV2,
  InsightCategory,
  MemoryNode,
  Pattern
} from '@our-companion/shared';
import { createId, nowIso } from '@our-companion/shared';

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

export interface GenerateCognitiveInsightInput {
  concepts: Array<{ id: string; name: string; summary: string }>;
  patterns: Pattern[];
  discoveryCandidates: DiscoveryCandidate[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
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

export function generateInsights(input: GenerateInsightsInput): InsightV2[] {
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

  const insight: InsightV2 = {
    id: createId('insight'),
    userId: input.userId,
    category,
    title: primaryCandidate ? `A signal around ${input.curiosityTarget.topic}` : `A question about ${input.curiosityTarget.topic}`,
    summary: primaryCandidate?.summary ?? input.curiosityTarget.description,
    explanation: primaryCandidate
      ? `${primaryCandidate.title} points toward ${input.curiosityTarget.topic} being worth a closer look.`
      : `Ann could not find strong outside evidence yet, but ${input.curiosityTarget.topic} still looks meaningful from memory and patterns.`,
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

export function selectPrimaryInsight(insights: InsightV2[]): InsightV2 | undefined {
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

export function generateCognitiveInsight(input: GenerateCognitiveInsightInput): Insight | undefined {
  const pattern = [...input.patterns].sort((left, right) => right.strength - left.strength)[0];
  const concept = input.concepts[0];
  const candidate = [...input.discoveryCandidates].sort(
    (left, right) => right.relevanceScore + right.usefulnessScore - (left.relevanceScore + left.usefulnessScore)
  )[0];

  if (!pattern && !concept && !candidate) return undefined;

  const title = pattern?.title ?? concept?.name ?? candidate?.title ?? 'New cognitive insight';
  const explanation =
    pattern?.description ??
    pattern?.summary ??
    concept?.summary ??
    candidate?.summary ??
    'Ann found a meaningful relationship worth considering later.';
  const confidence = Math.min(1, Math.max(pattern?.confidence ?? 0, candidate?.evidenceScore ?? 0.55));
  const growthValue = Math.round(
    Math.min(100, ((pattern?.strength ?? 0.55) * 45 + (candidate?.usefulnessScore ?? 0.55) * 35 + confidence * 20))
  );

  return {
    id: createId('insight'),
    title,
    explanation,
    relatedConceptIds: [...new Set([...(pattern?.relatedConceptIds ?? []), ...(concept ? [concept.id] : [])])],
    relatedPatternIds: pattern ? [pattern.id] : [],
    confidence,
    growthValue,
    createdAt: nowIso(),
    status: 'candidate'
  };
}

// ============================================================================
// Insight Engine V2 — Enhanced insight generation
// ============================================================================

export { InsightEngine } from './insight-engine';
export { calculateInsightConfidence, calculateInsightImportance, calculateInsightNovelty } from './scoring';
export { generateInterestInsights } from './generators/interest-insight';
export { generateLearningInsights } from './generators/learning-insight';
export { generateProductivityInsights } from './generators/productivity-insight';
export { generateProjectInsights } from './generators/project-insight';
export { generateBehaviourInsights } from './generators/behaviour-insight';
export { generateRelationshipInsights } from './generators/relationship-insight';
export { generateDiscoveryInsights } from './generators/discovery-insight';
export { generateRiskInsights } from './generators/risk-insight';
export {
  MIN_PATTERNS_FOR_INSIGHT,
  MAX_INSIGHTS_PER_GENERATION,
  CONFIDENCE_WEIGHTS,
} from './types';
