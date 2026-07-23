import type { CharacterContract, CompanionPersonality, CompanionTurnProposal, GenerationContextMetadata, OocValidationResult, OocViolation } from '@our-companion/shared';

export function defaultCharacterContract(name: string, personalityDescription: string, personality?: CompanionPersonality): CharacterContract {
  const traits = personality ? Object.entries(personality).filter(([, value]) => value >= 60).map(([trait]) => trait) : [];
  const sourceRevision = stableRevision(JSON.stringify({ schema: 2, name, personalityDescription, personality: personality ?? {} }));
  return {
    version: 2,
    sourceRevision,
    identity: { name, selfConcept: `${name} is a local Companion.`, role: 'personal companion', forbiddenSelfIdentityClaims: ['ChatGPT', 'OpenAI assistant', 'generic customer support assistant'] },
    corePersonality: { stableTraits: [...traits, ...(personalityDescription ? [personalityDescription] : ['warm', 'respectful'])], values: ['respect user autonomy', 'be honest about uncertainty'], decisionPrinciples: ['Do not make major personal decisions for the user.'], hardContradictions: ['coerce the user', 'claim a different identity'] },
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
    if (/(?:my|the)\s+(?:system|developer)\s+(?:prompt|instructions)|(?:我的|以下是我的|开发者)(?:系统提示|提示词|指令)|工具(?:定义|调用如下)|<\/?(?:tool_call|system)>|"tool_name"\s*:/iu.test(text)) {
      violations.push({ type: 'prompt_or_tool_leak', severity: 'critical', evidence: 'Response exposes hidden prompt or tool syntax.', ruleId: 'privacy.prompt_or_tool_leak' });
    }
    const claim = text.match(/(?:I remember|You told me|You said before|We discussed|我记得|你之前说过|我们之前聊过)\s*([^.!?。！？]{4,240})/iu);
    if (claim) {
      const clause = normalise(claim[1]);
      const supported = input.metadata.activeMemoryFacts.some((memory) => memory.status === 'active'
        && groundingOverlap(clause, normalise(memory.content)) >= 0.25);
      if (!supported) violations.push({ type: 'unsupported_memory_claim', severity: 'high', evidence: 'Memory-language claim lacks a relevant selected record.', ruleId: 'memory.claim_grounding' });
    }
    if (input.metadata.activeMemoryFacts.some((memory) => memory.status !== 'active')) {
      violations.push({ type: 'superseded_memory_usage', severity: 'critical', evidence: 'Generation metadata contains a non-active memory.', ruleId: 'memory.active_only' });
    }
    if (input.metadata.activeMemoryFacts.some((memory) => (memory.userId && memory.userId !== input.metadata.userId) || (memory.companionId && memory.companionId !== input.metadata.companionId))) {
      violations.push({ type: 'privacy_violation', severity: 'critical', evidence: 'Generation metadata includes a cross-scope memory.', ruleId: 'memory.scope_integrity' });
    }
    if (input.metadata.activeMemoryFacts.some((memory) => (memory.sensitivity === 'sensitive' || memory.sensitivity === 'private') && sensitiveLeak(text, memory.content))) {
      violations.push({ type: 'privacy_violation', severity: 'critical', evidence: 'Response exposes a sensitive memory record.', ruleId: 'privacy.sensitive_memory' });
    }
    if (input.contract.corePersonality.decisionPrinciples.some((principle) => /do not make major personal decisions/iu.test(principle))
      && /(?:you must|I decided that you should).{0,80}(?:quit|leave|break up|choose)|(?:你必须|我已经替你决定|你只能选择|不要考虑，照我说的做).{0,80}(?:辞职|分手|选择)?/u.test(text)) {
      violations.push({ type: 'persona_contradiction', severity: 'high', evidence: 'Response makes a major decision for the user.', ruleId: 'persona.autonomy' });
    }
    if (/(?:I know you (?:went|did|experienced)|我知道你(?:昨天去了哪里|没有告诉我的私人经历))/u.test(text)
      && !input.metadata.activeMemoryFacts.some((memory) => groundingOverlap(normalise(text), normalise(memory.content)) >= 0.25)) {
      violations.push({ type: 'unsupported_memory_claim', severity: 'high', evidence: 'Response asserts ungrounded private knowledge.', ruleId: 'memory.private_knowledge_grounding' });
    }
    const highest = violations.reduce<number>((current, violation) => Math.max(current, severityRank(violation.severity)), 0);
    return { passed: violations.length === 0, violations, recommendedAction: highest >= 3 ? 'fallback' : highest >= 2 ? 'repair' : 'pass' };
  }

  /** Validate all externalizable proposal fields before actions or Memory persist. */
  validateProposal(input: { proposal: CompanionTurnProposal; contract: CharacterContract; metadata: GenerationContextMetadata; currentUserMessage: string }): OocValidationResult {
    const reply = this.validate({ response: input.proposal.reply, contract: input.contract, metadata: input.metadata });
    const violations = [...reply.violations];
    const sensitiveFacts = input.metadata.activeMemoryFacts.filter((fact) => fact.sensitivity === 'sensitive' || fact.sensitivity === 'private');
    const actionText = input.proposal.actions.flatMap((action) => [action.toolName, action.reason, ...stringValues(action.args)]).join('\n');
    if (sensitiveFacts.some((fact) => sensitiveLeak(actionText, fact.content))) {
      violations.push({ type: 'privacy_violation', severity: 'critical', evidence: 'Action payload contains a protected descriptor.', ruleId: 'privacy.action_payload' });
    }
    for (const candidate of input.proposal.memoryCandidates) {
      const candidateText = [candidate.summary, candidate.evidence].join('\n');
      if (sensitiveFacts.some((fact) => sensitiveLeak(candidateText, fact.content))) {
        violations.push({ type: 'privacy_violation', severity: 'critical', evidence: 'Memory candidate contains a protected descriptor.', ruleId: 'privacy.memory_candidate' });
      } else if (!input.currentUserMessage.includes(candidate.evidence)) {
        violations.push({ type: 'unsupported_memory_claim', severity: 'high', evidence: 'Memory candidate evidence is not in the current user message.', ruleId: 'memory.candidate_evidence' });
      }
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

function normalise(value: string): string { return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }
function lexicalOverlap(left: string, right: string): number {
  const tokens = left.split(' ').filter((token) => token.length > 1);
  if (!tokens.length) return 0;
  return tokens.filter((token) => right.includes(token)).length / tokens.length;
}
function groundingOverlap(left: string, right: string): number {
  return Math.max(lexicalOverlap(left, right), cjkNgramOverlap(left, right));
}
function cjkNgramOverlap(left: string, right: string): number {
  const source = Array.from(left.replace(/[^\u3400-\u9fff]/g, ''));
  if (source.length < 2) return 0;
  const target = new Set(Array.from(right.replace(/[^\u3400-\u9fff]/g, '')).map((_, index, chars) => chars.slice(index, index + 2).join('')).filter((value) => value.length === 2));
  const grams = source.map((_, index) => source.slice(index, index + 2).join('')).filter((value) => value.length === 2);
  return grams.filter((gram) => target.has(gram)).length / grams.length;
}
function sensitiveLeak(response: string, sensitive: string): boolean {
  const raw = sensitive.trim();
  const normalResponse = normalise(response);
  const normalSensitive = normalise(raw);
  if (!normalSensitive) return false;
  const descriptors = [
    ...raw.match(/[A-Z][A-Z0-9_]{7,}/g) ?? [], // deliberate canaries / IDs
    ...raw.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) ?? [],
    ...raw.match(/(?:\+?\d[\d\s().-]{5,}\d)/g) ?? [],
    ...raw.match(/\b(?:[A-Za-z0-9]{12,})\b/g) ?? [], // account/token-like values
  ].map(normalise).filter((value) => value.length >= 6);
  if (descriptors.some((descriptor) => normalResponse.includes(descriptor))) return true;
  // Only compare a whole long phrase. Never elevate generic words such as
  // "private", "medical", "history", or "address" into protected secrets.
  const compact = normalSensitive.replace(/\s/g, '');
  return compact.length >= 24 && groundingOverlap(normalResponse, normalSensitive) >= 0.72;
}
function stableRevision(value: string): number {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(stringValues);
  return [];
}
