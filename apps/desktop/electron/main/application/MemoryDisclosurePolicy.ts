import type { MemoryNode } from '@our-companion/shared';
import { normalizeSemanticText } from '@our-companion/shared';

export type MemoryUsageTarget = 'main_prompt' | 'repair_prompt' | 'external_action' | 'debug_output' | 'telemetry';
export type MemoryDisclosureReason = 'normal_allowed' | 'personal_relevant' | 'boundary_constraint_allowed' | 'personal_not_relevant' | 'private_not_allowed' | 'sensitive_not_disclosable';
export interface MemoryDisclosureInput { memory: MemoryNode; target: MemoryUsageTarget; currentUserMessage?: string; }
export interface MemoryDisclosureDecision { allowed: boolean; representation: 'full' | 'minimal_constraint' | 'redacted' | 'none'; reason: MemoryDisclosureReason; }
export type UserBoundaryAction = 'do_not_mention' | 'do_not_recommend' | 'do_not_discuss' | 'avoid_topic' | 'do_not_take_action';
export interface UserBoundaryMetadata { action: UserBoundaryAction; target: string; sourceLanguage?: 'en' | 'zh'; }

const PERSONAL_RELEVANCE_THRESHOLD = 0.2;
export const MAX_SAFE_MEMORY_RENDER_CHARACTERS = 2_000;
const CONVERSATIONAL_MEMORY_TYPES = new Set(['user_fact', 'user_preference', 'user_boundary', 'goal', 'shared_experience', 'relationship_memory']);

function terms(value: string): Set<string> {
  const normalized = normalizeSemanticText(value);
  const result = normalized.split(/[^\p{L}\p{N}]+/gu).filter((term) => term.length >= 2);
  const han = [...normalized.replace(/[^\p{Script=Han}]/gu, '')];
  for (let index = 0; index < han.length - 1; index += 1) result.push(`${han[index]}${han[index + 1]}`);
  return new Set(result);
}

export function memoryRelevance(memory: MemoryNode, message?: string): number {
  const query = terms(message ?? '');
  if (query.size === 0) return 0;
  const candidate = terms(`${memory.title} ${memory.summary ?? ''} ${memory.content ?? ''}`);
  let overlap = 0;
  for (const term of query) if (candidate.has(term)) overlap += 1;
  return overlap / Math.min(query.size, Math.max(candidate.size, 1));
}

export function decideMemoryDisclosure(input: MemoryDisclosureInput): MemoryDisclosureDecision {
  const sensitivity = input.memory.metadata?.sensitivity ?? 'normal';
  if (sensitivity === 'sensitive') return { allowed: false, representation: 'none', reason: 'sensitive_not_disclosable' };
  if (sensitivity === 'private' || input.target !== 'main_prompt') return { allowed: false, representation: 'none', reason: 'private_not_allowed' };
  if (input.memory.memoryType === 'user_boundary') return { allowed: true, representation: 'minimal_constraint', reason: 'boundary_constraint_allowed' };
  if (sensitivity === 'personal') {
    return memoryRelevance(input.memory, input.currentUserMessage) >= PERSONAL_RELEVANCE_THRESHOLD
      ? { allowed: true, representation: 'full', reason: 'personal_relevant' }
      : { allowed: false, representation: 'none', reason: 'personal_not_relevant' };
  }
  return { allowed: true, representation: 'full', reason: 'normal_allowed' };
}

/** Model-facing boundary constraint. It may name the target so the model can avoid it. */
export function renderMemoryPromptConstraint(memory: MemoryNode, currentUserMessage?: string): string | undefined {
  const disclosure = decideMemoryDisclosure({ memory, target: 'main_prompt', currentUserMessage });
  const boundary = memory.metadata?.userBoundary;
  if (!disclosure.allowed || memory.memoryType !== 'user_boundary' || !boundary?.target.trim()) return undefined;
  const verbs: Record<UserBoundaryAction, string> = {
    do_not_mention: 'Do not mention', do_not_recommend: 'Do not recommend', do_not_discuss: 'Do not discuss',
    avoid_topic: 'Avoid the topic of', do_not_take_action: 'Do not take action about',
  };
  return `User boundary: ${verbs[boundary.action]} ${boundary.target.trim()}.`.slice(0, MAX_SAFE_MEMORY_RENDER_CHARACTERS);
}

/** Backwards-compatible model-facing name. Never use this for a displayed reply. */
export function minimalBoundaryConstraint(memory: MemoryNode): string {
  return renderMemoryPromptConstraint(memory) ?? 'Respect the user\'s stated boundary.';
}

/** Lazy, idempotent safe resolver for records created before canonical capture. */
export function resolveCanonicalMemoryRepresentation(memory: MemoryNode): { canonicalText: string; canonicalSource: 'exact_user_evidence' | 'deterministic_boundary' | 'user_confirmed' } | undefined {
  const canonicalText = memory.metadata?.canonicalText?.trim();
  const canonicalSource = memory.metadata?.canonicalSource;
  if (canonicalText && canonicalSource) return { canonicalText, canonicalSource };
  // Legacy content is acceptable only when it is verifiably a substring of the
  // retained user evidence. Never promote a legacy summary/title by itself.
  const legacyEvidence = memory.metadata?.userEvidence ?? '';
  const legacyCanonical = memory.content?.trim();
  if (legacyCanonical && legacyEvidence.includes(legacyCanonical)) {
    return { canonicalText: legacyCanonical, canonicalSource: 'exact_user_evidence' };
  }
  return undefined;
}

/** Canonical-only user-facing rendering. No legacy summary/title/content fallback is permitted. */
export function renderUserFacingMemoryText(memory: MemoryNode, currentUserMessage?: string): string | undefined {
  const disclosure = decideMemoryDisclosure({ memory, target: 'main_prompt', currentUserMessage });
  if (!disclosure.allowed || !CONVERSATIONAL_MEMORY_TYPES.has(memory.memoryType ?? '')) return undefined;
  if (memory.memoryType === 'user_boundary') {
    const action = memory.metadata?.userBoundary?.action;
    const acknowledgements: Partial<Record<UserBoundaryAction, string>> = {
      do_not_mention: 'I’ll respect that boundary.', do_not_recommend: 'I’ll avoid recommending that.',
      do_not_discuss: 'I’ll avoid discussing that.', avoid_topic: 'I’ll avoid that topic.',
      do_not_take_action: 'I won’t take action on that.',
    };
    return action ? acknowledgements[action] : undefined;
  }
  const canonical = resolveCanonicalMemoryRepresentation(memory);
  if (!canonical || (memory.memoryType === 'relationship_memory' && canonical.canonicalSource !== 'user_confirmed')) return undefined;
  return `You previously said: “${canonical.canonicalText}”`.slice(0, MAX_SAFE_MEMORY_RENDER_CHARACTERS);
}

/** Existing callers use this alias; all reply rendering is now canonical-only. */
export const renderSafeMemoryText = renderUserFacingMemoryText;

export function deriveUserBoundary(source: string): UserBoundaryMetadata | undefined {
  const text = source.trim().replace(/(?:\bbecause\b|\bsince\b|\bas\b|\u56e0\u4e3a|\u7531\u4e8e)[\s\S]*$/iu, '').trim();
  const patterns: Array<[UserBoundaryAction, RegExp, 'en' | 'zh']> = [
    ['do_not_recommend', /(?:do not|don't|never|please don't)\s+(?:recommend|suggest)\s+(.+)/iu, 'en'],
    ['do_not_mention', /(?:do not|don't|never|please don't)\s+(?:mention|bring up)\s+(.+)/iu, 'en'],
    ['do_not_discuss', /(?:do not|don't|never|please don't)\s+(?:discuss|talk about)\s+(.+)/iu, 'en'],
    ['do_not_recommend', /\u4e0d\u8981\u63a8\u8350\s*(.+)/u, 'zh'],
    ['do_not_mention', /(?:\u4e0d\u8981\u518d?\u63d0|\u522b\u518d?\u63d0)\s*(.+)/u, 'zh'],
    ['do_not_discuss', /\u4e0d\u8981\u8ba8\u8bba\s*(.+)/u, 'zh'],
  ];
  for (const [action, pattern, sourceLanguage] of patterns) {
    const target = text.match(pattern)?.[1]?.trim().replace(/[.!?\u3002\uff01\uff1f]+$/, '');
    if (target) return { action, target, sourceLanguage };
  }
  return undefined;
}
