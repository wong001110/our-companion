import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { DatabaseService } from './index';
import type { Discovery, MemoryNode } from '@our-companion/shared';

describe('normalized score persistence boundaries', () => {
  it.each([
    [0, 0],
    [0.5, 50],
    [1, 100]
  ])('stores Memory importance %s as score100 %s and maps it back', (importance, stored) => {
    const db = new DatabaseService({ path: ':memory:' });
    const node: MemoryNode = {
      id: `memory-${stored}`,
      type: 'topic',
      title: 'Boundary memory',
      importance,
      source: 'test',
      createdAt: '2026-07-17T01:00:00.000Z',
      updatedAt: '2026-07-17T01:00:00.000Z'
    };
    db.insertMemoryNode(node);

    const raw = (db as unknown as { db: DatabaseSync }).db;
    expect(raw.prepare('SELECT importance_score FROM memory_nodes WHERE id = ?').get(node.id))
      .toEqual({ importance_score: stored });
    expect(db.getMemoryNode(node.id)?.importance).toBe(importance);
    db.close();
  });

  it.each([
    [0, 0],
    [0.5, 50],
    [1, 100]
  ])('stores Discovery UnitScore %s as score100 %s and maps it back', (score, stored) => {
    const db = new DatabaseService({ path: ':memory:' });
    const discovery: Discovery = {
      id: `discovery-${stored}`,
      source: 'github',
      title: 'Boundary discovery',
      tags: [],
      raw: {},
      userInterestScore: score,
      userHistoryScore: score,
      characterExpertiseScore: score,
      noveltyScore: score,
      usefulnessScore: score,
      finalScore: score,
      status: 'candidate',
      createdAt: '2026-07-17T01:00:00.000Z'
    };
    db.insertDiscovery(discovery);

    const raw = (db as unknown as { db: DatabaseSync }).db;
    expect(raw.prepare(
      `SELECT interest_score, history_score, expertise_score, novelty_score, usefulness_score, final_score
       FROM discoveries WHERE id = ?`
    ).get(discovery.id)).toEqual({
      interest_score: stored,
      history_score: stored,
      expertise_score: stored,
      novelty_score: stored,
      usefulness_score: stored,
      final_score: stored
    });
    expect(db.getDiscovery(discovery.id)).toEqual(expect.objectContaining({
      userInterestScore: score,
      userHistoryScore: score,
      characterExpertiseScore: score,
      noveltyScore: score,
      usefulnessScore: score,
      finalScore: score
    }));
    db.close();
  });

  it.each([
    [0, 0],
    [0.5, 50],
    [1, 100]
  ])('stores relationship UnitScore %s as score100 %s and maps it back', (score, stored) => {
    const db = new DatabaseService({ path: ':memory:' });
    const relationship = db.getRelationship('local', 'companion-score-boundary');
    relationship.familiarity = score;
    relationship.trust = score;
    relationship.comfort = score;
    db.saveRelationship(relationship);

    const raw = (db as unknown as { db: DatabaseSync }).db;
    expect(raw.prepare(
      `SELECT familiarity, trust, comfort
       FROM companion_relationships WHERE user_id = ? AND companion_id = ?`
    ).get('local', relationship.companionId)).toEqual({
      familiarity: stored,
      trust: stored,
      comfort: stored
    });
    expect(db.getRelationship('local', relationship.companionId)).toEqual(expect.objectContaining({
      familiarity: score,
      trust: score,
      comfort: score
    }));
    db.close();
  });
});
