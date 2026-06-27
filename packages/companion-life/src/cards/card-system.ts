import { createId, nowIso } from '@our-companion/shared';
import type {
  Card,
  CardCategory,
  CardState,
  CardAction,
} from './types';
import { CARD_PRIORITY } from './types';

export class CardSystem {
  private cards: Card[] = [];

  getCards(): Card[] {
    return this.cards.map((c) => ({ ...c }));
  }

  getVisibleCards(): Card[] {
    return this.cards
      .filter((c) => c.state === 'visible' || c.state === 'pinned')
      .sort((a, b) => CARD_PRIORITY[b.category] - CARD_PRIORITY[a.category]);
  }

  getCardsByCategory(category: CardCategory): Card[] {
    return this.cards.filter((c) => c.category === category).map((c) => ({ ...c }));
  }

  getCard(cardId: string): Card | undefined {
    return this.cards.find((c) => c.id === cardId);
  }

  createCard(
    category: CardCategory,
    title: string,
    summary: string,
    options?: {
      tags?: string[];
      metadata?: Record<string, unknown>;
      characterComment?: string;
      relatedDiscoveryId?: string;
      relatedMemoryId?: string;
      relatedJourneyId?: string;
      expiresAt?: string;
    }
  ): Card {
    const now = nowIso();
    const card: Card = {
      id: createId('card'),
      category,
      state: 'generated',
      title,
      summary,
      tags: options?.tags,
      metadata: options?.metadata,
      characterComment: options?.characterComment,
      relatedDiscoveryId: options?.relatedDiscoveryId,
      relatedMemoryId: options?.relatedMemoryId,
      relatedJourneyId: options?.relatedJourneyId,
      expiresAt: options?.expiresAt,
      timestamp: now,
      createdAt: now,
      updatedAt: now,
    };
    this.cards.push(card);
    return card;
  }

  updateCardState(cardId: string, newState: CardState): Card | undefined {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return undefined;
    card.state = newState;
    card.updatedAt = nowIso();
    return card;
  }

  presentCard(cardId: string): Card | undefined {
    return this.updateCardState(cardId, 'visible');
  }

  pinCard(cardId: string): Card | undefined {
    return this.updateCardState(cardId, 'pinned');
  }

  archiveCard(cardId: string): Card | undefined {
    return this.updateCardState(cardId, 'archived');
  }

  completeCard(cardId: string): Card | undefined {
    return this.updateCardState(cardId, 'completed');
  }

  expireStaleCards(): Card[] {
    const now = Date.now();
    const expired: Card[] = [];
    for (const card of this.cards) {
      if (card.expiresAt && new Date(card.expiresAt).getTime() < now && card.state !== 'archived') {
        card.state = 'expired';
        card.updatedAt = nowIso();
        expired.push(card);
      }
    }
    return expired;
  }

  linkCards(cardId: string, relatedCardId: string): void {
    const card = this.cards.find((c) => c.id === cardId);
    if (card && !card.relatedCardIds?.includes(relatedCardId)) {
      card.relatedCardIds = [...(card.relatedCardIds ?? []), relatedCardId];
      card.updatedAt = nowIso();
    }
  }

  getRelatedCards(cardId: string): Card[] {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card?.relatedCardIds) return [];
    return card.relatedCardIds
      .map((id) => this.cards.find((c) => c.id === id))
      .filter((c): c is Card => c !== undefined);
  }

  search(query: string): Card[] {
    const lower = query.toLowerCase();
    return this.cards.filter(
      (c) =>
        c.title.toLowerCase().includes(lower) ||
        c.summary.toLowerCase().includes(lower) ||
        c.tags?.some((t) => t.toLowerCase().includes(lower))
    );
  }

  getExpiringSoon(withinMs = 3_600_000): Card[] {
    const now = Date.now();
    return this.cards.filter(
      (c) =>
        c.expiresAt &&
        c.state !== 'archived' &&
        c.state !== 'expired' &&
        new Date(c.expiresAt).getTime() - now < withinMs
    );
  }
}
