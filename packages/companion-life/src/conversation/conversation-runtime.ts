import { createId, nowIso } from '@our-companion/shared';
import type {
  ConversationSession,
  ConversationState,
  ConversationMessage,
} from './types';
import { CONVERSATION_STATE_TRANSITIONS } from './types';
import { TopicManager } from './topic-manager';

export interface ConversationRuntimeDeps {
  loadMessages(sessionId: string, limit: number): ConversationMessage[];
  saveMessage(message: ConversationMessage): ConversationMessage;
  emitEvent?(type: string, payload?: Record<string, unknown>): void;
}

export class ConversationRuntime {
  private session: ConversationSession | null = null;
  private readonly topicManager = new TopicManager();
  private readonly deps: ConversationRuntimeDeps;

  constructor(deps: ConversationRuntimeDeps) {
    this.deps = deps;
  }

  getSession(): ConversationSession | null {
    return this.session ? { ...this.session } : null;
  }

  getTopics(): TopicManager {
    return this.topicManager;
  }

  canTransition(to: ConversationState): boolean {
    if (!this.session) return to === 'idle';
    return CONVERSATION_STATE_TRANSITIONS[this.session.state]?.includes(to) ?? false;
  }

  start(characterId: string): ConversationSession {
    this.session = {
      id: createId('conv'),
      characterId,
      state: 'listening',
      topics: [],
      currentTopicIndex: -1,
      startedAt: nowIso(),
      lastMessageAt: nowIso(),
      messageCount: 0,
    };
    this.deps.emitEvent?.('ConversationStarted', { sessionId: this.session.id });
    return { ...this.session };
  }

  transition(to: ConversationState): boolean {
    if (!this.session) return false;
    if (!this.canTransition(to)) return false;

    const from = this.session.state;
    this.session = {
      ...this.session,
      state: to,
      ...(to === 'ended' ? { endedAt: nowIso() } : {}),
    };

    this.deps.emitEvent?.('ConversationStateChanged', {
      sessionId: this.session.id,
      from,
      to,
    });

    return true;
  }

  addUserMessage(content: string, topicId?: string): ConversationMessage {
    if (!this.session) throw new Error('No active conversation');
    this.transition('thinking');

    const message: ConversationMessage = {
      id: createId('msg'),
      sessionId: this.session.id,
      role: 'user',
      content,
      topicId,
      timestamp: nowIso(),
    };

    this.deps.saveMessage(message);
    this.session = {
      ...this.session,
      lastMessageAt: nowIso(),
      messageCount: this.session.messageCount + 1,
    };

    return message;
  }

  addAssistantMessage(content: string, topicId?: string): ConversationMessage {
    if (!this.session) throw new Error('No active conversation');

    const message: ConversationMessage = {
      id: createId('msg'),
      sessionId: this.session.id,
      role: 'assistant',
      content,
      topicId,
      timestamp: nowIso(),
    };

    this.deps.saveMessage(message);
    this.session = {
      ...this.session,
      state: 'listening',
      lastMessageAt: nowIso(),
      messageCount: this.session.messageCount + 1,
    };

    return message;
  }

  pause(): boolean {
    return this.transition('paused');
  }

  resume(): boolean {
    return this.transition('listening');
  }

  end(): boolean {
    return this.transition('ended');
  }

  getContextMessages(limit = 20): ConversationMessage[] {
    if (!this.session) return [];
    return this.deps.loadMessages(this.session.id, limit);
  }
}
