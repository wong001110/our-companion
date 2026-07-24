import type { DatabaseService } from '@our-companion/database';
import type { CompanionMessage, SensitiveDescriptor, SensitiveDescriptorKind } from '@our-companion/shared';
import { detectSensitiveDescriptors, getActionCapability, isCredentialDescriptor, resolveActionDisclosureTarget } from '@our-companion/shared';

export type { SensitiveDescriptor, SensitiveDescriptorKind } from '@our-companion/shared';
export interface DisclosureAuthorization { valueHash: string; target: 'search_web' | 'open_url' | 'http_request' | 'specific_tool'; source: 'current_user_message'; expiresAtTurnEnd: true; }
export interface ProposalPrivacyContext {
  protectedMemories: Array<{ memoryId: string; sensitivity: 'private' | 'sensitive'; descriptors: SensitiveDescriptor[] }>;
  currentUserMessage: string;
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  explicitAuthorizations: DisclosureAuthorization[];
}

/** Compatibility export; all descriptor matching lives in @our-companion/shared. */
export const sensitiveDescriptors = detectSensitiveDescriptors;

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
    for (const descriptor of detectSensitiveDescriptors(content, { source: 'history' })) {
      const label = descriptor.kind === 'credential' ? '[credential removed]' : `[${descriptor.kind.replace(/_/g, ' ')} removed]`;
      sanitized = sanitized.split(descriptor.value).join(label);
      redactions.push(descriptor.kind);
    }
    return { role: role as 'user' | 'assistant', content: sanitized, redactions: [...new Set(redactions)] };
  });
}

export function createProposalPrivacyContext(db: DatabaseService, companionId: string, currentUserMessage: string, recent: CompanionMessage[]): ProposalPrivacyContext {
  const protectedMemories = db.listMemoryNodes(companionId)
    .map((memory) => ({
      memory,
      descriptors: detectSensitiveDescriptors([memory.metadata?.canonicalText, memory.metadata?.userEvidence, memory.content, memory.summary, memory.title].filter(Boolean).join('\n'), { source: 'private_memory' }),
    }))
    .filter(({ memory, descriptors }) => memory.metadata?.sensitivity === 'private' || memory.metadata?.sensitivity === 'sensitive' || descriptors.length > 0)
    .map(({ memory, descriptors }) => ({
      memoryId: memory.id,
      sensitivity: (memory.metadata?.sensitivity === 'private' ? 'private' : 'sensitive') as 'private' | 'sensitive',
      descriptors,
    }));
  const current = detectSensitiveDescriptors(currentUserMessage, { source: 'current_message' });
  const explicitAuthorizations: DisclosureAuthorization[] = [];
  for (const descriptor of current) {
    if (isCredentialDescriptor(descriptor.kind)) continue;
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
    ...detectSensitiveDescriptors(context.currentUserMessage, { source: 'current_message' }),
    ...context.recentMessages.flatMap((message) => detectSensitiveDescriptors(message.content, { source: 'history' })),
    ...detectSensitiveDescriptors(text, { source: 'action_payload' }),
  ];
  for (const descriptor of descriptors) {
    if (!text.includes(descriptor.value)) continue;
    const authorized = !isCredentialDescriptor(descriptor.kind)
      && context.explicitAuthorizations.some((authorization) => authorization.valueHash === descriptor.valueHash && authorization.target === target);
    if (!authorized) return { ok: false, reason: 'PRIVATE_DATA_DISCLOSURE_BLOCKED' };
  }
  return { ok: true };
}
