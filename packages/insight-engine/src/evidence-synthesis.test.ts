import { describe, expect, it } from 'vitest';
import {
  buildEvidenceSynthesisPrompt,
  validateSynthesisResult,
  synthesizeDiscoveryInsight,
  synthesizeDiscoveryInsightDeterministic,
  convertSynthesisToInsight,
} from './index';
import type {
  EvidenceInput,
  EvidenceSynthesisResult,
  SynthesizeDiscoveryInsightInput,
} from '@our-companion/shared';

const emotion = {
  neutral: 70, curious: 65, happy: 20, excited: 0, shy: 45,
  confused: 0, focused: 50, tired: 10, proud: 0, concerned: 0,
};

function makeEvidence(id: string): EvidenceInput {
  return {
    id,
    title: `Evidence ${id}`,
    canonicalUrl: `https://example.com/${id}`,
    domain: 'example.com',
    excerpt: `Excerpt for ${id}`,
    extractedText: `Full extracted text for evidence ${id}. This contains detailed information.`,
    contentHash: `hash_${id}`,
  };
}

function makeInput(evidenceIds: string[] = ['ev1', 'ev2']): SynthesizeDiscoveryInsightInput {
  return {
    evidence: evidenceIds.map(makeEvidence),
    candidates: evidenceIds.map((id) => ({
      id: `candidate_${id}`,
      title: `Candidate ${id}`,
      summary: `Summary for ${id}`,
      relevanceScore: 0.8,
      noveltyScore: 0.7,
      usefulnessScore: 0.6,
      evidenceIds: [id],
    })),
    context: {
      userId: 'default',
      companionId: 'ann',
      characterState: { characterId: 'ann', coreState: 'idle', intent: 'waiting', emotion },
      memoryNodes: [],
      patterns: [],
      interestGraph: { userId: 'default', nodes: [], edges: [], updatedAt: 'now' },
      curiosityTarget: {
        id: 'curiosity_1', userId: 'default', companionId: 'ann', topic: 'Ambient AI',
        description: 'Explore ambient AI', source: 'character_trigger', explorationType: 'adjacent',
        priority: 0.8, confidence: 0.7, reason: 'It fits.', expectedValue: 'Useful.', createdAt: 'now',
      },
    },
  };
}

function makeValidSynthesis(evidenceIds: string[]): EvidenceSynthesisResult {
  return {
    title: 'Synthesis title',
    summary: 'Synthesis summary',
    keyFacts: [{ statement: 'Key fact 1', evidenceIds: [evidenceIds[0]] }],
    whyRelevant: 'Why this matters',
    uncertainties: ['Some uncertainty'],
    supportingEvidenceIds: evidenceIds,
  };
}

describe('evidence synthesis', () => {
  describe('buildEvidenceSynthesisPrompt', () => {
    it('builds a prompt with evidence inputs', () => {
      const prompt = buildEvidenceSynthesisPrompt([makeEvidence('ev1'), makeEvidence('ev2')]);
      expect(prompt).toContain('ev1');
      expect(prompt).toContain('ev2');
      expect(prompt).toContain('JSON');
    });

    it('truncates to MAX_EVIDENCE_RECORDS', () => {
      const evidences = Array.from({ length: 10 }, (_, i) => makeEvidence(`ev${i}`));
      const prompt = buildEvidenceSynthesisPrompt(evidences);
      expect(prompt).toContain('ev0');
      expect(prompt).toContain('ev4');
      expect(prompt).not.toContain('ev5');
    });
  });

  describe('validateSynthesisResult', () => {
    it('accepts valid synthesis', () => {
      const result = validateSynthesisResult(makeValidSynthesis(['ev1', 'ev2']), ['ev1', 'ev2']);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.title).toBe('Synthesis title');
        expect(result.data.supportingEvidenceIds).toEqual(['ev1', 'ev2']);
      }
    });

    it('rejects unknown evidence ID in supportingEvidenceIds', () => {
      const synthesis = makeValidSynthesis(['ev1', 'unknown']);
      const result = validateSynthesisResult(synthesis, ['ev1', 'ev2']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('unknown_supporting_evidence');
      }
    });

    it('rejects fact without evidence ID', () => {
      const synthesis: EvidenceSynthesisResult = {
        ...makeValidSynthesis(['ev1']),
        keyFacts: [{ statement: 'A fact', evidenceIds: [] }],
      };
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('keyFact_missing_evidence');
      }
    });

    it('rejects title too long', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.title = 'x'.repeat(201);
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('title_too_long');
      }
    });

    it('rejects summary too long', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.summary = 'x'.repeat(2001);
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('summary_too_long');
      }
    });

    it('rejects no supporting evidence', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.supportingEvidenceIds = [];
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('no_supporting_evidence');
      }
    });

    it('rejects duplicate supporting evidence', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.supportingEvidenceIds = ['ev1', 'ev1'];
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('duplicate_supporting_evidence');
      }
    });

    it('rejects non-object input', () => {
      expect(validateSynthesisResult(null, []).valid).toBe(false);
      expect(validateSynthesisResult('string', []).valid).toBe(false);
      expect(validateSynthesisResult(42, []).valid).toBe(false);
    });

    it('rejects keyFacts exceeding max', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.keyFacts = Array.from({ length: 7 }, (_, i) => ({
        statement: `Fact ${i}`,
        evidenceIds: ['ev1'],
      }));
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('keyFacts_too_many');
      }
    });

    it('rejects uncertainties exceeding max', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.uncertainties = Array.from({ length: 6 }, (_, i) => `Uncertainty ${i}`);
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('uncertainties_too_many');
      }
    });

    it('rejects uncertainty with non-string value', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.uncertainties = [123 as unknown as string];
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('uncertainty_not_string');
      }
    });

    it('rejects uncertainty with null value', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.uncertainties = [null as unknown as string];
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('uncertainty_not_string');
      }
    });

    it('rejects uncertainty that is empty after trim', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.uncertainties = [''];
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('uncertainty_empty');
      }
    });

    it('rejects uncertainty that exceeds max length', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.uncertainties = ['a'.repeat(501)];
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('uncertainty_too_long');
      }
    });

    it('rejects key fact evidenceIds with non-string value', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.keyFacts = [{ statement: 'Fact 1', evidenceIds: [123 as unknown as string] }];
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('keyFact_invalid_evidence_id');
      }
    });

    it('rejects key fact evidenceIds with duplicate', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.keyFacts = [{ statement: 'Fact 1', evidenceIds: ['ev1', 'ev1'] }];
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('keyFact_duplicate_evidence');
      }
    });

    it('rejects supportingEvidenceIds with non-string value', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.supportingEvidenceIds = [{} as unknown as string];
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('supporting_invalid_evidence_id');
      }
    });

    it('rejects key fact statement exceeding max length', () => {
      const synthesis = makeValidSynthesis(['ev1']);
      synthesis.keyFacts = [{ statement: 'a'.repeat(501), evidenceIds: ['ev1'] }];
      const result = validateSynthesisResult(synthesis, ['ev1']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('keyFact_statement_too_long');
      }
    });
  });

  describe('synthesizeDiscoveryInsightDeterministic', () => {
    it('returns a valid fallback result', () => {
      const input = makeInput();
      const result = synthesizeDiscoveryInsightDeterministic(input);
      expect(result.usedFallback).toBe(true);
      expect(result.insight).toBeDefined();
      expect(result.insight.category).toBe('discovery');
      expect(result.insight.status).toBe('active');
    });
  });

  describe('convertSynthesisToInsight', () => {
    it('converts synthesis to insight result', () => {
      const input = makeInput();
      const synthesis = makeValidSynthesis(['ev1', 'ev2']);
      const result = convertSynthesisToInsight(synthesis, input);
      expect(result.usedFallback).toBe(false);
      expect(result.insight.title).toBe('Synthesis title');
      expect(result.insight.summary).toBe('Synthesis summary');
      expect(result.insight.explanation).toBe('Why this matters');
      expect(result.synthesisResult).toEqual(synthesis);
      expect(result.evidenceIds).toEqual(['ev1', 'ev2']);
    });
  });

  describe('synthesizeDiscoveryInsight', () => {
    it('uses deterministic fallback when no aiCaller', async () => {
      const input = makeInput();
      const result = await synthesizeDiscoveryInsight(input);
      expect(result.usedFallback).toBe(true);
      expect(result.debugMetadata?.validated).toBe(true);
    });

    it('falls back on invalid JSON from AI', async () => {
      const input = makeInput();
      const aiCaller = async () => 'not json at all';
      const result = await synthesizeDiscoveryInsight(input, aiCaller);
      expect(result.usedFallback).toBe(true);
      expect(result.debugMetadata?.rejectionReason).toBe('invalid_json');
    });

    it('falls back on AI failure', async () => {
      const input = makeInput();
      const aiCaller = async () => { throw new Error('API error'); };
      const result = await synthesizeDiscoveryInsight(input, aiCaller);
      expect(result.usedFallback).toBe(true);
      expect(result.debugMetadata?.rejectionReason).toBe('ai_failure');
    });

    it('falls back on validation failure', async () => {
      const input = makeInput();
      const aiCaller = async () => JSON.stringify({ title: '', summary: '' });
      const result = await synthesizeDiscoveryInsight(input, aiCaller);
      expect(result.usedFallback).toBe(true);
      expect(result.debugMetadata?.validated).toBe(false);
    });

    it('uses synthesis when AI returns valid JSON', async () => {
      const input = makeInput();
      const synthesis = makeValidSynthesis(['ev1', 'ev2']);
      const aiCaller = async () => JSON.stringify(synthesis);
      const result = await synthesizeDiscoveryInsight(input, aiCaller);
      expect(result.usedFallback).toBe(false);
      expect(result.insight.title).toBe('Synthesis title');
      expect(result.synthesisResult).toEqual(synthesis);
    });

    it('returns only one insight', async () => {
      const input = makeInput();
      const result = await synthesizeDiscoveryInsight(input);
      expect(result.insight).toBeDefined();
      expect(typeof result.insight.id).toBe('string');
    });

    it('has unique supporting evidence IDs', async () => {
      const input = makeInput();
      const synthesis = makeValidSynthesis(['ev1', 'ev2']);
      synthesis.supportingEvidenceIds = ['ev1', 'ev2', 'ev1'];
      const aiCaller = async () => JSON.stringify(synthesis);
      const result = await synthesizeDiscoveryInsight(input, aiCaller);
      // Validation catches duplicates, so it falls back
      expect(result.usedFallback).toBe(true);
    });

    it('has at least one supporting evidence', async () => {
      const input = makeInput();
      const synthesis = makeValidSynthesis(['ev1']);
      const aiCaller = async () => JSON.stringify(synthesis);
      const result = await synthesizeDiscoveryInsight(input, aiCaller);
      expect(result.usedFallback).toBe(false);
      expect(result.evidenceIds.length).toBeGreaterThanOrEqual(1);
    });
  });
});
