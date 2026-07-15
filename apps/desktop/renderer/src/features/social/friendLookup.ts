import type { FriendLookupRelationship } from '@our-companion/shared';
import { t, type Lang, type TranslationKey } from '../../i18n';

const relationshipMessageKeys: Record<FriendLookupRelationship, TranslationKey> = {
  none: 'social_relationship_none',
  friend: 'social_relationship_friend',
  incoming_request: 'social_relationship_incoming_request',
  outgoing_request: 'social_relationship_outgoing_request',
};

export function friendLookupRelationshipMessage(relationship: unknown, lang: Lang): string {
  const key = typeof relationship === 'string'
    ? relationshipMessageKeys[relationship as FriendLookupRelationship]
    : undefined;
  return t(lang, key ?? 'social_relationship_unavailable');
}

export function canSendFriendRequest(relationship: unknown): relationship is 'none' {
  return relationship === 'none';
}
