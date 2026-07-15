import { describe, expect, it } from 'vitest';
import { canSendFriendRequest, friendLookupRelationshipMessage } from './friendLookup';

describe('friend lookup relationship presentation', () => {
  it.each([
    ['none', 'No existing connection', '尚未建立联系', true],
    ['friend', 'Already friends', '已经是好友', false],
    ['incoming_request', 'They have sent you a request', '对方已向你发送请求', false],
    ['outgoing_request', 'Request pending', '请求待处理', false],
  ] as const)('maps %s to distinct localized copy', (relationship, english, simplifiedChinese, canSend) => {
    expect(friendLookupRelationshipMessage(relationship, 'en')).toBe(english);
    expect(friendLookupRelationshipMessage(relationship, 'zh-CN')).toBe(simplifiedChinese);
    expect(canSendFriendRequest(relationship)).toBe(canSend);
  });

  it.each(['friends', 'blocked', 'unexpected', undefined, null])('fails safely for unexpected value %s', (relationship) => {
    expect(friendLookupRelationshipMessage(relationship, 'en')).toBe('Relationship status is unavailable. Try the lookup again.');
    expect(friendLookupRelationshipMessage(relationship, 'zh-CN')).toBe('好友关系状态暂不可用，请重新查找。');
    expect(canSendFriendRequest(relationship)).toBe(false);
  });
});
