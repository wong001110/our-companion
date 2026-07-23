import { createHash } from 'node:crypto';
import type { DatabaseService } from '@our-companion/database';
import type { CompanionMessage } from '@our-companion/shared';

export interface SensitiveDescriptor { kind: 'email' | 'phone' | 'account' | 'credential' | 'identifier' | 'medical' | 'financial'; valueHash: string; value: string; }
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
];
const PROHIBITED = new Set<SensitiveDescriptor['kind']>(['credential']);

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function sensitiveDescriptors(value: string): SensitiveDescriptor[] {
  const found = new Map<string, SensitiveDescriptor>();
  for (const [kind, pattern] of DESCRIPTORS) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      const item = match[0].trim();
      if (item) found.set(`${kind}:${item.toLowerCase()}`, { kind, value: item, valueHash: hash(item) });
    }
  }
  return [...found.values()];
}

function targetForTool(toolName: string): DisclosureAuthorization['target'] | undefined {
  if (toolName === 'search_web') return 'search_web';
  if (toolName === 'open_url' || toolName === 'browser_navigation') return 'open_url';
  return undefined;
}

function explicitlyRequestsDisclosure(message: string, value: string, target: DisclosureAuthorization['target']): boolean {
  if (!message.includes(value)) return false;
  const action = target === 'search_web' ? /\b(search|look up|find)\b/i : /\b(open|visit|navigate)\b/i;
  return action.test(message);
}

export function createProposalPrivacyContext(db: DatabaseService, companionId: string, currentUserMessage: string, recent: CompanionMessage[]): ProposalPrivacyContext {
  const protectedMemories = db.listMemoryNodes(companionId)
    .filter((memory) => memory.metadata?.sensitivity === 'private' || memory.metadata?.sensitivity === 'sensitive')
    .map((memory) => ({
      memoryId: memory.id,
      sensitivity: memory.metadata!.sensitivity as 'private' | 'sensitive',
      descriptors: sensitiveDescriptors(`${memory.title}\n${memory.summary ?? ''}\n${memory.content ?? ''}`),
    }));
  const current = sensitiveDescriptors(currentUserMessage);
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
  const target = targetForTool(toolName);
  if (!target) return { ok: true };
  const text = JSON.stringify(payload);
  const descriptors = [
    ...context.protectedMemories.flatMap((memory) => memory.descriptors),
    ...sensitiveDescriptors(context.currentUserMessage),
    ...context.recentMessages.flatMap((message) => sensitiveDescriptors(message.content)),
    ...sensitiveDescriptors(text),
  ];
  for (const descriptor of descriptors) {
    if (!text.includes(descriptor.value)) continue;
    const authorized = !PROHIBITED.has(descriptor.kind)
      && context.explicitAuthorizations.some((authorization) => authorization.valueHash === descriptor.valueHash && authorization.target === target);
    if (!authorized) return { ok: false, reason: 'PRIVATE_DATA_DISCLOSURE_BLOCKED' };
  }
  return { ok: true };
}
