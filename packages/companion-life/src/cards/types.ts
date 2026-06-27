export type CardCategory =
  | 'discovery'
  | 'memory'
  | 'reflection'
  | 'journey'
  | 'conversation'
  | 'reminder'
  | 'system';

export type CardState =
  | 'generated'
  | 'prepared'
  | 'visible'
  | 'pinned'
  | 'completed'
  | 'archived'
  | 'expired';

export type CardAction =
  | 'open'
  | 'discuss'
  | 'pin'
  | 'save'
  | 'archive'
  | 'dismiss'
  | 'share'
  | 'continue';

export interface Card {
  id: string;
  category: CardCategory;
  state: CardState;
  title: string;
  summary: string;
  illustration?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  timestamp: string;
  characterComment?: string;
  relatedCardIds?: string[];
  relatedPageId?: string;
  relatedDiscoveryId?: string;
  relatedMemoryId?: string;
  relatedJourneyId?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const CARD_PRIORITY: Record<CardCategory, number> = {
  system: 100,
  journey: 80,
  conversation: 70,
  discovery: 60,
  reflection: 50,
  reminder: 40,
  memory: 30,
};
