import type { MemoryNode } from '@our-companion/shared';
import { normalizeSemanticText } from '@our-companion/shared';

export type MemoryUsageTarget = 'main_prompt' | 'repair_prompt' | 'external_action' | 'debug_output' | 'telemetry';
export type MemoryDisclosureReason =
  | 'normal_allowed'
  | 'personal_relevant'
  | 'boundary_constraint_allowed'
  | 'personal_not_relevant'
  | 'private_not_allowed'
  | 'sensitive_not_disclosable';

export interface MemoryDisclosureInput {
  memory: MemoryNode;
  target: MemoryUsageTarget;
  currentUserMessage?: string;
}

export interface MemoryDisclosureDecision {
  allowed: boolean;
  representation: 'full' | 'minimal_constraint' | 'redacted' | 'none';
  reason: MemoryDisclosureReason;
}
export type UserBoundaryAction = 'do_not_mention' | 'do_not_recommend' | 'do_not_discuss' | 'avoid_topic' | 'do_not_take_action';
export interface UserBoundaryMetadata { action: UserBoundaryAction; target: string; sourceLanguage?: 'en' | 'zh'; }

const PERSONAL_RELEVANCE_THRESHOLD = 0.2;

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
  // A short, high-signal fact ("peanut allergy") remains relevant to a
  // longer request ("Which peanut-free snack should I make?").
  return overlap / Math.min(query.size, Math.max(candidate.size, 1));
}

/**
 * Decides disclosure before a context item is made.  In particular, a personal
 * boundary remains usable as a constraint while its explanation stays local.
 */
export function decideMemoryDisclosure(input: MemoryDisclosureInput): MemoryDisclosureDecision {
  const sensitivity = input.memory.metadata?.sensitivity ?? 'normal';
  const type = input.memory.memoryType;
  if (sensitivity === 'sensitive') {
    return { allowed: false, representation: 'none', reason: 'sensitive_not_disclosable' };
  }
  // Older databases can contain this forward-compatible value even though the
  // original shared union did not name it.
  if (sensitivity === 'private') {
    return { allowed: false, representation: 'none', reason: 'private_not_allowed' };
  }
  if (input.target !== 'main_prompt') {
    return { allowed: false, representation: 'none', reason: 'private_not_allowed' };
  }
  if (type === 'user_boundary') {
    return { allowed: true, representation: 'minimal_constraint', reason: 'boundary_constraint_allowed' };
  }
  if (sensitivity === 'personal') {
    return memoryRelevance(input.memory, input.currentUserMessage) >= PERSONAL_RELEVANCE_THRESHOLD
      ? { allowed: true, representation: 'full', reason: 'personal_relevant' }
      : { allowed: false, representation: 'none', reason: 'personal_not_relevant' };
  }
  return { allowed: true, representation: 'full', reason: 'normal_allowed' };
}

/** Removes causal/personal explanation while retaining an actionable limit. */
export function minimalBoundaryConstraint(memory: MemoryNode): string {
  const boundary = memory.metadata?.userBoundary ?? deriveUserBoundary(memory.content ?? memory.metadata?.userEvidence ?? memory.summary ?? memory.title);
  if (boundary) {
    const verbs: Record<UserBoundaryAction, string> = { do_not_mention: 'Do not mention', do_not_recommend: 'Do not recommend', do_not_discuss: 'Do not discuss', avoid_topic: 'Avoid the topic of', do_not_take_action: 'Do not take action about' };
    return `User boundary: ${verbs[boundary.action]} ${boundary.target}.`;
  }
  const source = (memory.content || memory.metadata?.userEvidence || memory.summary || memory.title).trim();
  const withoutExplanation = source
    .replace(/\s+(?:because|since|as)\b[\s\S]*$/i, '')
    .replace(/(?:因为|由于|以免|这会让我)[\s\S]*$/, '')
    .trim()
    .replace(/[,:;，：；]\s*$/, '');
  return `User boundary: ${withoutExplanation || 'Respect the user\'s stated boundary.'}`;
}

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
