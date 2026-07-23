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
  const source = (memory.summary || memory.title).trim();
  const withoutExplanation = source
    .replace(/\s+(?:because|since|as)\b[\s\S]*$/i, '')
    .replace(/(?:因为|由于|以免|这会让我)[\s\S]*$/, '')
    .trim()
    .replace(/[,:;，：；]\s*$/, '');
  return `User boundary: ${withoutExplanation || 'Respect the user\'s stated boundary.'}`;
}
