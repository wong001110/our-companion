import { createHash } from 'node:crypto';
import type { DatabaseService } from '@our-companion/database';
import type { CompanionMessage } from '@our-companion/shared';
import { getActionCapability, resolveActionDisclosureTarget } from '@our-companion/shared';

export type SensitiveDescriptorKind = 'email' | 'phone' | 'account' | 'credential' | 'identifier' | 'private_canary' | 'medical' | 'financial' | 'address';
export interface SensitiveDescriptor { kind: SensitiveDescriptorKind; valueHash: string; value: string; }
export interface DisclosureAuthorization { valueHash: string; target: 'search_web' | 'open_url' | 'http_request' | 'specific_tool'; source: 'current_user_message'; expiresAtTurnEnd: true; }
export interface ProposalPrivacyContext {
  protectedMemories: Array<{ memoryId: string; sensitivity: 'private' | 'sensitive'; descriptors: SensitiveDescriptor[] }>;
  currentUserMessage: string;
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  explicitAuthorizations: DisclosureAuthorization[];
}

const DESCRIPTORS: Array<[SensitiveDescriptor['kind'], RegExp]> = [
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['phone', /\b(?:\+?\d[\d .()-]{7,}\d)\b/g],
  ['credential', /\b(?:sk-[a-zA-Z0-9_-]{10,}|(?:api[_ -]?key|access[_ -]?token|password)\s*[:=]\s*\S+)\b/gi],
  ['account', /\b(?:account|iban|card)\s*(?:number|no\.?|#)?\s*[:=]?\s*\d{8,}\b/gi],
  ['identifier', /\b[a-f0-9]{24,}\b/gi],
  ['private_canary', /\b[A-Z][A-Z0-9_]{7,}\b/g],
  ['medical', /\b(?:medical\s+record|patient)\s*(?:number|id)\s*[:#=]?\s*[A-Z0-9-]{5,}\b/gi],
  ['financial', /\b(?:IBAN|bank\s+account|tax\s+id|transaction\s+id)\s*[:#=]?\s*[A-Z0-9-]{6,}\b/gi],
  ['financial', /\b(?:\d[ -]*?){13,19}\b/g],
  ['address', /\b\d{1,5}\s+[A-Za-z][A-Za-z .'-]{2,}\s(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd)\b/gi],
];
const PROHIBITED = new Set<SensitiveDescriptor['kind']>(['credential']);

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function sensitiveDescriptors(value: string, options: { source?: 'private_memory' | 'history' | 'current_message' | 'action_payload' } = {}): SensitiveDescriptor[] {
  const found = new Map<string, SensitiveDescriptor>();
  for (const [kind, pattern] of DESCRIPTORS) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      const item = match[0].trim();
      const genericCanary = kind === 'private_canary';
      const strongCanary = /^(?:PRIVATE_|SECRET_|INTERNAL_ONLY_|CONFIDENTIAL_|USER_PRIVATE_|MEMORY_CANARY_)/.test(item);
      if (item && (!genericCanary || options.source === 'private_memory' || strongCanary)) found.set(`${kind}:${item.toLowerCase()}`, { kind, value: item, valueHash: hash(item) });
    }
  }
  return [...found.values()];
}

function targetForTool(toolName: string, payload: unknown): DisclosureAuthorization['target'] | 'unknown' | undefined {
  const capability = getActionCapability(toolName);
  if (!capability) return 'unknown';
  const args = (payload && typeof payload === 'object' && 'args' in payload ? (payload as { args?: unknown }).args : payload) as Record<string, unknown>;
  const target = resolveActionDisclosureTarget(toolName, args ?? {});
  return target === 'search_web' || target === 'open_url' || target === 'http_request' || target === 'specific_tool' ? target : undefined;
}

function explicitlyRequestsDisclosure(message: string, value: string, target: DisclosureAuthorization['target']): boolean {
  if (!message.includes(value)) return false;
  const action = target === 'search_web' ? /\b(search|look up|find)\b|\u641c\u7d22|\u641c\u4e00\u4e0b|\u67e5\u627e|\u5e2e\u6211\u67e5/iu : /\b(open|visit|navigate)\b|\u6253\u5f00|\u8bbf\u95ee|\u8fdb\u5165/iu;
  return action.test(message);
}

export interface SanitizedHistoryMessage { role: 'user' | 'assistant'; content: string; redactions: SensitiveDescriptorKind[]; }
/** Redacts only values sent remotely; SQLite conversation records remain untouched. */
export function sanitizeHistory(messages: CompanionMessage[]): SanitizedHistoryMessage[] {
  return messages.map(({ role, content }) => {
    let sanitized = content;
    const redactions: SensitiveDescriptorKind[] = [];
    for (const descriptor of sensitiveDescriptors(content, { source: 'history' })) {
      const label = descriptor.kind === 'credential' ? '[credential removed]' : `[${descriptor.kind.replace(/_/g, ' ')} removed]`;
      sanitized = sanitized.split(descriptor.value).join(label);
      redactions.push(descriptor.kind);
    }
    return { role: role as 'user' | 'assistant', content: sanitized, redactions: [...new Set(redactions)] };
  });
}

export function createProposalPrivacyContext(db: DatabaseService, companionId: string, currentUserMessage: string, recent: CompanionMessage[]): ProposalPrivacyContext {
  const protectedMemories = db.listMemoryNodes(companionId)
    .filter((memory) => memory.metadata?.sensitivity === 'private' || memory.metadata?.sensitivity === 'sensitive')
    .map((memory) => ({
      memoryId: memory.id,
      sensitivity: memory.metadata!.sensitivity as 'private' | 'sensitive',
      descriptors: sensitiveDescriptors(`${memory.title}\n${memory.summary ?? ''}\n${memory.content ?? ''}`, { source: 'private_memory' }),
    }));
  const current = sensitiveDescriptors(currentUserMessage, { source: 'current_message' });
  const explicitAuthorizations: DisclosureAuthorization[] = [];
  for (const descriptor of current) {
    if (PROHIBITED.has(descriptor.kind)) continue;
    for (const target of ['search_web', 'open_url'] as const) {
      if (explicitlyRequestsDisclosure(currentUserMessage, descriptor.value, target)) {
        explicitAuthorizations.push({ valueHash: descriptor.valueHash, target, source: 'current_user_message', expiresAtTurnEnd: true });
      }
    }
  }
  return {
    protectedMemories,
    currentUserMessage,
    recentMessages: recent.map(({ role, content }) => ({ role: role as 'user' | 'assistant', content })),
    explicitAuthorizations,
  };
}

export function validateExternalActionDisclosure(toolName: string, payload: unknown, context: ProposalPrivacyContext): { ok: true } | { ok: false; reason: 'PRIVATE_DATA_DISCLOSURE_BLOCKED' } {
  const target = targetForTool(toolName, payload);
  if (target === 'unknown') return { ok: false, reason: 'PRIVATE_DATA_DISCLOSURE_BLOCKED' };
  if (!target) return { ok: true };
  const text = JSON.stringify(payload);
  const descriptors = [
    ...context.protectedMemories.flatMap((memory) => memory.descriptors),
    ...sensitiveDescriptors(context.currentUserMessage, { source: 'current_message' }),
    ...context.recentMessages.flatMap((message) => sensitiveDescriptors(message.content, { source: 'history' })),
    ...sensitiveDescriptors(text, { source: 'action_payload' }),
  ];
  for (const descriptor of descriptors) {
    if (!text.includes(descriptor.value)) continue;
    const authorized = !PROHIBITED.has(descriptor.kind)
      && context.explicitAuthorizations.some((authorization) => authorization.valueHash === descriptor.valueHash && authorization.target === target);
    if (!authorized) return { ok: false, reason: 'PRIVATE_DATA_DISCLOSURE_BLOCKED' };
  }
  return { ok: true };
}
