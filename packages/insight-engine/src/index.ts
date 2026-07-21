import type {
  CharacterProfile,
  CharacterRuntimeState,
  CompanionInsight,
  CuriosityTarget,
  DiscoveryCandidate,
  EvidenceInput,
  EvidenceSynthesisResult,
  InterestGraph,
  InsightCategory,
  ExplorationCycleResult,
  MemoryNode,
  Pattern,
  SynthesizeDiscoveryInsightInput,
  SynthesizeDiscoveryInsightResult,
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

// Constants for evidence limits
const MAX_EVIDENCE_RECORDS = 5;
const MAX_TOTAL_EXTRACTED_CHARS = 12_000;
const MAX_PER_EVIDENCE_CHARS = 4_000;
const MAX_KEY_FACTS = 6;
const MAX_UNCERTAINTIES = 5;
const MAX_TITLE_CHARS = 200;
const MAX_SUMMARY_CHARS = 2000;
const MAX_WHY_RELEVANT_CHARS = 1000;
const MAX_KEY_FACT_STATEMENT_CHARS = 500;
const MAX_UNCERTAINTY_CHARS = 500;

export function buildEvidenceSynthesisPrompt(evidence: EvidenceInput[]): string {
  const bounded = evidence.slice(0, MAX_EVIDENCE_RECORDS);
  let totalChars = 0;
  const inputs = bounded.map((e) => {
    let text = e.extractedText.slice(0, MAX_PER_EVIDENCE_CHARS);
    totalChars += text.length;
    if (totalChars > MAX_TOTAL_EXTRACTED_CHARS) {
      const remaining = MAX_TOTAL_EXTRACTED_CHARS - (totalChars - text.length);
      text = text.slice(0, Math.max(0, remaining));
      totalChars = MAX_TOTAL_EXTRACTED_CHARS;
    }
    return { id: e.id, title: e.title, domain: e.domain, text };
  });

  return `You are an evidence synthesizer. Given the following evidence records, produce a structured synthesis.

Evidence inputs:
${JSON.stringify(inputs, null, 2)}

Return ONLY valid JSON matching this schema:
{
  "title": "string (max ${MAX_TITLE_CHARS} chars)",
  "summary": "string (max ${MAX_SUMMARY_CHARS} chars)",
  "keyFacts": [{ "statement": "string", "evidenceIds": ["string"] }],
  "whyRelevant": "string (max ${MAX_WHY_RELEVANT_CHARS} chars)",
  "uncertainties": ["string"],
  "supportingEvidenceIds": ["string"]
}

Rules:
- title and summary must be non-empty and bounded
- keyFacts: max ${MAX_KEY_FACTS} facts, each with at least one valid evidence ID
- supportingEvidenceIds: must reference existing evidence IDs, no duplicates
- uncertainties: max ${MAX_UNCERTAINTIES} items
- All evidence IDs must be from the input set
- Do not fabricate evidence IDs`; 
}

export function validateSynthesisResult(
  result: unknown,
  validEvidenceIds: string[],
): { valid: true; data: EvidenceSynthesisResult } | { valid: false; reason: string } {
  if (!result || typeof result !== 'object') return { valid: false, reason: 'not_object' };
  const obj = result as Record<string, unknown>;

  if (typeof obj.title !== 'string' || !obj.title.trim()) return { valid: false, reason: 'missing_title' };
  if (obj.title.length > MAX_TITLE_CHARS) return { valid: false, reason: 'title_too_long' };
  if (typeof obj.summary !== 'string' || !obj.summary.trim()) return { valid: false, reason: 'missing_summary' };
  if (obj.summary.length > MAX_SUMMARY_CHARS) return { valid: false, reason: 'summary_too_long' };

  const validSet = new Set(validEvidenceIds);

  if (!Array.isArray(obj.keyFacts)) return { valid: false, reason: 'keyFacts_not_array' };
  if (obj.keyFacts.length > MAX_KEY_FACTS) return { valid: false, reason: 'keyFacts_too_many' };
  for (const fact of obj.keyFacts) {
    if (!fact || typeof fact !== 'object') return { valid: false, reason: 'keyFact_invalid' };
    const f = fact as Record<string, unknown>;
    if (typeof f.statement !== 'string' || !f.statement.trim()) return { valid: false, reason: 'keyFact_missing_statement' };
    if (f.statement.trim().length > MAX_KEY_FACT_STATEMENT_CHARS) return { valid: false, reason: 'keyFact_statement_too_long' };
    if (!Array.isArray(f.evidenceIds) || f.evidenceIds.length === 0) return { valid: false, reason: 'keyFact_missing_evidence' };
    const seenFactEids = new Set<string>();
    for (const eid of f.evidenceIds) {
      if (typeof eid !== 'string') return { valid: false, reason: 'keyFact_invalid_evidence_id' };
      if (!eid.trim()) return { valid: false, reason: 'keyFact_empty_evidence_id' };
      if (!validSet.has(eid)) return { valid: false, reason: `keyFact_unknown_evidence:${eid}` };
      if (seenFactEids.has(eid)) return { valid: false, reason: `keyFact_duplicate_evidence:${eid}` };
      seenFactEids.add(eid);
    }
  }

  if (typeof obj.whyRelevant !== 'string' || !obj.whyRelevant.trim()) return { valid: false, reason: 'missing_whyRelevant' };
  if (obj.whyRelevant.length > MAX_WHY_RELEVANT_CHARS) return { valid: false, reason: 'whyRelevant_too_long' };

  if (!Array.isArray(obj.uncertainties)) return { valid: false, reason: 'uncertainties_not_array' };
  if (obj.uncertainties.length > MAX_UNCERTAINTIES) return { valid: false, reason: 'uncertainties_too_many' };
  for (const u of obj.uncertainties) {
    if (typeof u !== 'string') return { valid: false, reason: 'uncertainty_not_string' };
    if (!u.trim()) return { valid: false, reason: 'uncertainty_empty' };
    if (u.trim().length > MAX_UNCERTAINTY_CHARS) return { valid: false, reason: 'uncertainty_too_long' };
  }

  if (!Array.isArray(obj.supportingEvidenceIds)) return { valid: false, reason: 'supportingEvidenceIds_not_array' };
  const seenIds = new Set<string>();
  for (const eid of obj.supportingEvidenceIds) {
    if (typeof eid !== 'string') return { valid: false, reason: 'supporting_invalid_evidence_id' };
    if (!eid.trim()) return { valid: false, reason: 'supporting_empty_evidence_id' };
    if (!validSet.has(eid)) return { valid: false, reason: `unknown_supporting_evidence:${eid}` };
    if (seenIds.has(eid)) return { valid: false, reason: `duplicate_supporting_evidence:${eid}` };
    seenIds.add(eid);
  }
  if (seenIds.size === 0) return { valid: false, reason: 'no_supporting_evidence' };

  const data: EvidenceSynthesisResult = {
    title: (obj.title as string).trim(),
    summary: (obj.summary as string).trim(),
    keyFacts: (obj.keyFacts as Array<{ statement: string; evidenceIds: string[] }>).map((f) => ({
      statement: f.statement.trim(),
      evidenceIds: f.evidenceIds.map((e) => e.trim()),
    })),
    whyRelevant: (obj.whyRelevant as string).trim(),
    uncertainties: (obj.uncertainties as string[]).map((u) => u.trim()),
    supportingEvidenceIds: (obj.supportingEvidenceIds as string[]).map((e) => e.trim()),
  };
  return { valid: true, data };
}

export function synthesizeDiscoveryInsightDeterministic(
  input: SynthesizeDiscoveryInsightInput,
): SynthesizeDiscoveryInsightResult {
  const insight = generateInsights({
    userId: input.context.userId,
    companionId: input.context.companionId,
    characterState: input.context.characterState,
    characterProfile: input.context.characterProfile,
    memoryNodes: input.context.memoryNodes,
    patterns: input.context.patterns,
    interestGraph: input.context.interestGraph,
    curiosityTarget: input.context.curiosityTarget,
    discoveryCandidates: input.candidates as DiscoveryCandidate[],
  });
  const primary = insight[0];
  return {
    insight: primary ?? {
      id: createId('insight'),
      userId: input.context.userId,
      category: 'discovery' as InsightCategory,
      title: `A question about ${input.context.curiosityTarget.topic}`,
      summary: input.context.curiosityTarget.description,
      explanation: 'No evidence available.',
      supportingPatternIds: [],
      supportingMemoryIds: [],
      confidence: 0.3,
      importance: 0.3,
      novelty: 0.3,
      evidenceCount: 0,
      status: 'active' as const,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    evidenceIds: input.candidates.flatMap((c) => c.evidenceIds ?? []).slice(0, 4),
    usedFallback: true,
    debugMetadata: {
      inputCharacterCount: input.evidence.reduce((sum, e) => sum + e.extractedText.length, 0),
      evidenceCount: input.evidence.length,
      validated: true,
    },
  };
}

export function convertSynthesisToInsight(
  synthesis: EvidenceSynthesisResult,
  input: SynthesizeDiscoveryInsightInput,
): SynthesizeDiscoveryInsightResult {
  const primaryCandidate = [...input.candidates].sort(
    (a, b) => b.relevanceScore + b.noveltyScore + b.usefulnessScore - (a.relevanceScore + a.noveltyScore + a.usefulnessScore)
  )[0];
  const relatedPattern = input.context.patterns.find((p) =>
    input.context.curiosityTarget.relatedPatternIds?.includes(p.id)
  ) ?? input.context.patterns[0];
  const supportingCandidateIds = input.candidates.slice(0, 4).map((c) => c.id);
  const supportingMemoryIds = input.context.curiosityTarget.relatedMemoryIds ?? input.context.memoryNodes.slice(0, 2).map((m) => m.id);
  const timestamp = nowIso();
  const confidence = average(input.candidates.map((c) => c.evidenceScore ?? 0.5), input.context.curiosityTarget.confidence);
  const novelty = average(input.candidates.map((c) => c.noveltyScore), 0.55);
  const practicalRelevance = average(input.candidates.map((c) => c.usefulnessScore), 0.5);
  const category: InsightCategory = input.context.curiosityTarget.explorationType === 'practical' ? 'project' : 'discovery';

  return {
    insight: {
      id: createId('insight'),
      userId: input.context.userId,
      category,
      title: synthesis.title,
      summary: synthesis.summary,
      explanation: synthesis.whyRelevant,
      supportingPatternIds: relatedPattern ? [relatedPattern.id] : [],
      supportingMemoryIds,
      confidence,
      importance: practicalRelevance,
      novelty,
      evidenceCount: supportingCandidateIds.length,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    evidenceIds: synthesis.supportingEvidenceIds,
    synthesisResult: synthesis,
    usedFallback: false,
    debugMetadata: {
      inputCharacterCount: input.evidence.reduce((sum, e) => sum + e.extractedText.length, 0),
      evidenceCount: input.evidence.length,
      validated: true,
    },
  };
}

export async function synthesizeDiscoveryInsight(
  input: SynthesizeDiscoveryInsightInput,
  aiCaller?: (prompt: string) => Promise<string>,
): Promise<SynthesizeDiscoveryInsightResult> {
  const evidenceIds = input.evidence.map((e) => e.id);
  const prompt = buildEvidenceSynthesisPrompt(input.evidence);
  const inputCharCount = input.evidence.reduce((sum, e) => sum + e.extractedText.length, 0);

  if (!aiCaller) {
    return { ...synthesizeDiscoveryInsightDeterministic(input), debugMetadata: { inputCharacterCount: inputCharCount, evidenceCount: input.evidence.length, validated: true } };
  }

  try {
    const raw = await aiCaller(prompt);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return { ...synthesizeDiscoveryInsightDeterministic(input), debugMetadata: { inputCharacterCount: inputCharCount, evidenceCount: input.evidence.length, validated: false, rejectionReason: 'invalid_json' } };
    }
    const validation = validateSynthesisResult(parsed, evidenceIds);
    if (!validation.valid) {
      return { ...synthesizeDiscoveryInsightDeterministic(input), debugMetadata: { inputCharacterCount: inputCharCount, evidenceCount: input.evidence.length, validated: false, rejectionReason: validation.reason } };
    }
    return convertSynthesisToInsight(validation.data, input);
  } catch {
    return { ...synthesizeDiscoveryInsightDeterministic(input), debugMetadata: { inputCharacterCount: inputCharCount, evidenceCount: input.evidence.length, validated: false, rejectionReason: 'ai_failure' } };
  }
}
