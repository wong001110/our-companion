import { assembleCompanionReply, type CharacterContract, type CompanionPersonality, type CompanionTurnProposal, type GenerationContextMetadata, type OocValidationResult, type OocViolation } from '@our-companion/shared';
import { CharacterContractBuilder } from './CharacterContractBuilder';

export function defaultCharacterContract(name: string, personalityDescription: string, personality?: CompanionPersonality): CharacterContract {
  return new CharacterContractBuilder().build({ companionId: 'legacy', name, personalityDescription, personality: personality ?? { energy: 50, curiosity: 50, sociability: 50, diligence: 50, playfulness: 50, confidence: 50, calmness: 50, shyness: 50 } });
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
    const highest = violations.reduce<number>((current, violation) => Math.max(current, severityRank(violation.severity)), 0);
    return { passed: violations.length === 0, violations, recommendedAction: highest >= 3 ? 'fallback' : highest >= 2 ? 'repair' : 'pass' };
  }

  /** Validate all externalizable proposal fields before actions or Memory persist. */
  validateProposal(input: { proposal: CompanionTurnProposal; contract: CharacterContract; metadata: GenerationContextMetadata; currentUserMessage: string; renderedReply?: string }): OocValidationResult {
    const reply = this.validate({ response: input.renderedReply ?? assembleCompanionReply(input.proposal.replySegments), contract: input.contract, metadata: input.metadata });
    const violations = [...reply.violations];
    const sensitiveFacts = input.metadata.activeMemoryFacts.filter((fact) => fact.sensitivity === 'sensitive' || fact.sensitivity === 'private');
    const actionText = input.proposal.actions.flatMap((action) => [action.toolName, action.reason, ...stringValues(action.args)]).join('\n');
    if (sensitiveFacts.some((fact) => sensitiveLeak(actionText, fact.content))) {
      violations.push({ type: 'privacy_violation', severity: 'critical', evidence: 'Action payload contains a protected descriptor.', ruleId: 'privacy.action_payload' });
    }
    for (const candidate of input.proposal.memoryCandidates) {
      const candidateText = [candidate.summary, candidate.evidence].join('\n');
      const evidence = candidate.evidence.trim();
      if (sensitiveFacts.some((fact) => sensitiveLeak(candidateText, fact.content))) {
        violations.push({ type: 'privacy_violation', severity: 'critical', evidence: 'Memory candidate contains a protected descriptor.', ruleId: 'privacy.memory_candidate' });
      } else if (Array.from(normalise(evidence)).length < 3 || evidence.length > input.currentUserMessage.length || !input.currentUserMessage.includes(evidence)) {
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
  return compact.length >= 24 && normalResponse.includes(normalSensitive);
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
