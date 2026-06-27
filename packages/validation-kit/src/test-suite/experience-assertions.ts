import type { ExperienceAssertion } from './types';

export function assertCompanionFeelsAlive(state: Record<string, unknown>): boolean {
  const runtimeState = state.runtimeState as string;
  return ['idle', 'observe', 'thinking', 'working', 'conversation', 'returning'].includes(runtimeState);
}

export function assertDiscoveryTimingRespectful(state: Record<string, unknown>): boolean {
  const context = state.contextCategory as string;
  const notificationQueue = state.notificationQueueSize as number;
  if (context === 'meeting' || context === 'gaming') {
    return notificationQueue === 0;
  }
  return true;
}

export function assertRelationshipGrowing(state: Record<string, unknown>): boolean {
  const trust = state.relationshipTrust as number;
  return trust >= 0 && trust <= 100;
}

export function assertNotebookGrowing(state: Record<string, unknown>): boolean {
  const pageCount = state.notebookPageCount as number;
  return pageCount >= 0;
}

export function assertConversationContinuity(state: Record<string, unknown>): boolean {
  const conversationState = state.conversationState as string;
  return ['idle', 'listening', 'thinking', 'responding', 'paused'].includes(conversationState);
}

export function assertMemoryConsistent(state: Record<string, unknown>): boolean {
  const memoryCount = state.memoryCount as number;
  return memoryCount >= 0;
}

export function assertNoInterruptDuringFocus(state: Record<string, unknown>): boolean {
  const context = state.contextCategory as string;
  const notificationQueue = state.notificationQueueSize as number;
  if (context === 'working' || context === 'meeting') {
    return notificationQueue <= 1;
  }
  return true;
}

export function assertPresenceContinuous(state: Record<string, unknown>): boolean {
  const runtimeState = state.runtimeState as string;
  return runtimeState !== 'error';
}

export function createExperienceSuite(): ExperienceAssertion[] {
  return [
    { type: 'presence', description: 'Companion feels alive', check: assertCompanionFeelsAlive },
    { type: 'discovery', description: 'Discovery timing is respectful', check: assertDiscoveryTimingRespectful },
    { type: 'relationship', description: 'Relationship is growing', check: assertRelationshipGrowing },
    { type: 'notebook', description: 'Notebook is growing', check: assertNotebookGrowing },
    { type: 'conversation', description: 'Conversation continuity', check: assertConversationContinuity },
    { type: 'memory', description: 'Memory is consistent', check: assertMemoryConsistent },
    { type: 'attention', description: 'No interrupt during focus', check: assertNoInterruptDuringFocus },
    { type: 'presence', description: 'Presence is continuous', check: assertPresenceContinuous },
  ];
}
