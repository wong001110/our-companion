import { describe, expect, it } from 'vitest';
import { DatabaseService } from '@our-companion/database';
import { RelationshipPolicy } from './RelationshipPolicy';

describe('RelationshipPolicy', () => {
  it('conversation_completed does not increase trust', () => {
    const db = new DatabaseService();
    const policy = new RelationshipPolicy(db);
    const before = db.getRelationship('local', 'ann').trust;
    policy.applySignal('local', 'ann', 'conversation_completed');
    const after = db.getRelationship('local', 'ann');
    expect(after.trust).toBe(before);
    expect(after.familiarity).toBeGreaterThan(0);
    db.close();
  });

  it('not_interested does not increment ignored count', () => {
    const db = new DatabaseService();
    const policy = new RelationshipPolicy(db);
    const before = db.getRelationship('local', 'ann').recentIgnoredInteractions;
    policy.applySignal('local', 'ann', 'not_interested');
    const after = db.getRelationship('local', 'ann').recentIgnoredInteractions;
    expect(after).toBe(before);
    db.close();
  });

  it('positive_feedback increases positive interactions', () => {
    const db = new DatabaseService();
    const policy = new RelationshipPolicy(db);
    const before = db.getRelationship('local', 'ann').recentPositiveInteractions;
    policy.applySignal('local', 'ann', 'positive_feedback');
    expect(db.getRelationship('local', 'ann').recentPositiveInteractions).toBe(before + 1);
    db.close();
  });

  it('not_now has no relationship effect', () => {
    const db = new DatabaseService();
    const policy = new RelationshipPolicy(db);
    const before = db.getRelationship('local', 'ann');
    policy.applySignal('local', 'ann', 'not_now');
    const after = db.getRelationship('local', 'ann');
    expect(after.recentPositiveInteractions).toBe(before.recentPositiveInteractions);
    expect(after.recentIgnoredInteractions).toBe(before.recentIgnoredInteractions);
    db.close();
  });
});
