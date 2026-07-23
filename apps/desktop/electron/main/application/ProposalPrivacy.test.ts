import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import { createMemoryNode } from '@our-companion/memory-engine';
import { createProposalPrivacyContext, sensitiveDescriptors, validateExternalActionDisclosure } from './ProposalPrivacy';

function protectedMemory(db: DatabaseService, sensitivity: 'private' | 'sensitive', summary: string): void {
  const node = createMemoryNode({ companionId: 'ann', type: 'topic', title: summary, summary });
  db.insertMemoryNode({ ...node, companionId: 'ann', memoryType: 'user_fact', metadata: { sourceType: 'user_explicit', confidence: 1, sensitivity, scope: 'companion', createdAt: node.createdAt } });
}

describe('ProposalPrivacy', () => {
  it('blocks nested payload values from unselected private Memory and recent messages', () => {
    const db = new DatabaseService();
    protectedMemory(db, 'private', 'Reach me at private-canary@example.com');
    const context = createProposalPrivacyContext(db, 'ann', 'Search for restaurants.', [{ role: 'assistant', content: 'Call +1 212 555 0199', source: 'panel', characterId: 'ann', id: 'm', status: 'ok', createdAt: '' }]);
    expect(validateExternalActionDisclosure('search_web', { nested: { contact: 'private-canary@example.com' } }, context)).toEqual({ ok: false, reason: 'PRIVATE_DATA_DISCLOSURE_BLOCKED' });
    expect(validateExternalActionDisclosure('open_url', { url: 'https://example.test/?phone=+1 212 555 0199' }, context)).toEqual({ ok: false, reason: 'PRIVATE_DATA_DISCLOSURE_BLOCKED' });
    db.close();
  });

  it('allows only target-specific current-turn email disclosure and never credentials', () => {
    const db = new DatabaseService();
    const emailContext = createProposalPrivacyContext(db, 'ann', 'Search for user@example.com.', []);
    expect(validateExternalActionDisclosure('search_web', { query: 'user@example.com' }, emailContext)).toEqual({ ok: true });
    expect(validateExternalActionDisclosure('open_url', { url: 'https://example.test/user@example.com' }, emailContext)).toEqual({ ok: false, reason: 'PRIVATE_DATA_DISCLOSURE_BLOCKED' });
    const keyContext = createProposalPrivacyContext(db, 'ann', 'Search for sk-testkey-123456789012.', []);
    expect(validateExternalActionDisclosure('search_web', { query: 'sk-testkey-123456789012' }, keyContext)).toEqual({ ok: false, reason: 'PRIVATE_DATA_DISCLOSURE_BLOCKED' });
    expect(sensitiveDescriptors('There are 42 apples.')).toEqual([]);
    db.close();
  });
});
