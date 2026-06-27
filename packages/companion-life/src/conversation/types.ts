export type ConversationState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'responding'
  | 'paused'
  | 'ended';

export interface ConversationSession {
  id: string;
  characterId: string;
  state: ConversationState;
  topics: Topic[];
  currentTopicIndex: number;
  startedAt: string;
  lastMessageAt: string;
  endedAt?: string;
  messageCount: number;
}

export interface Topic {
  id: string;
  title: string;
  relatedMemoryIds?: string[];
  relatedDiscoveryIds?: string[];
  startedAt: string;
  lastMentionedAt: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
}

export interface ConversationMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  topicId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export const CONVERSATION_STATE_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  idle: ['listening', 'ended'],
  listening: ['thinking', 'paused', 'ended'],
  thinking: ['responding', 'paused', 'ended'],
  responding: ['listening', 'idle', 'ended'],
  paused: ['listening', 'idle', 'ended'],
  ended: ['idle'],
};
