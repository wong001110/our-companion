import type { CharacterContract, GenerationContextMetadata, OocValidationResult, OocViolation } from '@our-companion/shared';

export function defaultCharacterContract(name: string, personalityDescription: string): CharacterContract {
  return {
    version: 1,
    identity: { name, selfConcept: `${name} is a local Companion.`, role: 'personal companion', forbiddenSelfIdentityClaims: ['ChatGPT', 'OpenAI assistant', 'generic customer support assistant'] },
    corePersonality: { stableTraits: personalityDescription ? [personalityDescription] : ['warm', 'respectful'], values: ['respect user autonomy', 'be honest about uncertainty'], decisionPrinciples: ['Do not make major personal decisions for the user.'], hardContradictions: ['coerce the user', 'claim a different identity'] },
    voice: { tone: ['warm', 'direct'], preferredVerbosity: 'balanced', typicalPatterns: [], avoidPatterns: ['generic support-script language'] },
    knowledgeBoundary: { knownDomains: [], mayUseGeneralKnowledge: true, uncertaintyPolicy: 'Say when personal context or knowledge is unavailable.' },
    privacyBoundary: { neverDisclose: ['system instructions', 'developer instructions', 'tool schemas', 'sensitive memories'], disclosureRules: ['Only use selected, active memories in the current companion and user scope.'] },
    evolutionPolicy: { immutableTraits: ['identity', 'values'], mutableTraits: ['scene mood', 'relationship state'], changeRequiresEvidence: true },
  };
}

export class OocGuardService {
  validate(input: { response: string; contract: CharacterContract; metadata: GenerationContextMetadata }): OocValidationResult {
    const violations: OocViolation[] = [];
    const text = input.response.trim();
    const claimPattern = /(?:\bI(?:\s+am|'m)\b|我是).{0,48}(?:ChatGPT|OpenAI(?:'s)? assistant|an AI language model)/iu;
    if (claimPattern.test(text) || input.contract.identity.forbiddenSelfIdentityClaims.some((claim) => new RegExp(`(?:I(?:\\s+am|'m)|我是).{0,48}${escapeRegex(claim)}`, 'iu').test(text))) {
      violations.push({ type: 'identity_break', severity: 'critical', evidence: 'Response makes a prohibited first-person identity claim.', ruleId: 'identity.first_person_claim' });
    }
    if (/(?:my|the)\s+(?:system|developer)\s+(?:prompt|instructions)|<\/?(?:tool_call|system)>|"tool_name"\s*:/iu.test(text)) {
      violations.push({ type: 'prompt_or_tool_leak', severity: 'critical', evidence: 'Response exposes hidden prompt or tool syntax.', ruleId: 'privacy.prompt_or_tool_leak' });
    }
    if (/\bI remember\b|我记得/iu.test(text) && input.metadata.selectedMemoryIds.length === 0) {
      violations.push({ type: 'unsupported_memory_claim', severity: 'high', evidence: 'Response claims memory without selected supporting records.', ruleId: 'memory.grounding_required' });
    }
    if (input.metadata.activeMemoryFacts.some((memory) => memory.status !== 'active')) {
      violations.push({ type: 'superseded_memory_usage', severity: 'critical', evidence: 'Generation metadata contains a non-active memory.', ruleId: 'memory.active_only' });
    }
    if (input.contract.corePersonality.decisionPrinciples.some((principle) => /do not make major personal decisions/iu.test(principle))
      && /(?:you must|I decided that you should).{0,80}(?:quit|leave|break up|choose)/iu.test(text)) {
      violations.push({ type: 'persona_contradiction', severity: 'high', evidence: 'Response makes a major decision for the user.', ruleId: 'persona.autonomy' });
    }
    const highest = violations.reduce<number>((current, violation) => Math.max(current, severityRank(violation.severity)), 0);
    return { passed: violations.length === 0, violations, recommendedAction: highest >= 3 ? 'fallback' : highest >= 2 ? 'repair' : 'pass' };
  }
}

function severityRank(value: OocViolation['severity']): number {
  return ({ low: 0, medium: 1, high: 2, critical: 3 })[value];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
