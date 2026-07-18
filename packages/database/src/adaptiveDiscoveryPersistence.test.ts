import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  AdaptiveDiscoveryPersistence,
  ensureAdaptiveDiscoveryPersistence,
  type PersistedDiscoveryBase,
  type PersistedDiscoverySeenIdentity
} from './adaptiveDiscoveryPersistence';

const now = '2026-07-18T00:00:00.000Z';

function createLegacyDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE companions (
      id TEXT PRIMARY KEY, is_primary INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE discoveries (
      id TEXT PRIMARY KEY, companion_id TEXT, external_id TEXT, title TEXT NOT NULL, url TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE web_page_evidence (
      id TEXT PRIMARY KEY, companion_id TEXT NOT NULL, canonical_url TEXT NOT NULL,
      content_hash TEXT NOT NULL, fetched_at TEXT NOT NULL
    );
  `);
  return db;
}

describe('adaptive discovery persistence migration', () => {
  it('additively backfills permanent identities and is idempotent without changing legacy rows', () => {
    const db = createLegacyDatabase();
    db.prepare('INSERT INTO companions VALUES (?, 1, ?)').run('companion', now);
    db.prepare('INSERT INTO discoveries VALUES (?, ?, ?, ?, ?, ?)').run(
      'discovery', 'companion', 'external-1', 'A useful release', 'https://example.test/post?utm_source=test', now
    );
    db.prepare('INSERT INTO web_page_evidence VALUES (?, ?, ?, ?, ?)').run(
      'evidence', 'companion', 'https://example.test/post', 'sha256-content', now
    );

    const first = ensureAdaptiveDiscoveryPersistence(db);
    const second = ensureAdaptiveDiscoveryPersistence(db);
    expect(first.identitiesBackfilled).toBeGreaterThanOrEqual(4);
    expect(second.identitiesBackfilled).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM discoveries').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM web_page_evidence').get()).toEqual({ count: 1 });
    expect((db.prepare('SELECT COUNT(*) AS count FROM discovery_seen_identity').get() as { count: number }).count)
      .toBe(first.identitiesBackfilled);
    db.close();
  });

  it('uses a sole companion for legacy unowned discoveries but never merges ambiguous companions', () => {
    const sole = createLegacyDatabase();
    sole.prepare('INSERT INTO companions VALUES (?, 1, ?)').run('sole', now);
    sole.prepare('INSERT INTO discoveries VALUES (?, NULL, NULL, ?, ?, ?)').run(
      'legacy', 'Legacy page', 'https://example.test/legacy', now
    );
    expect(ensureAdaptiveDiscoveryPersistence(sole).rowsSkippedWithoutCompanion).toBe(0);
    expect(sole.prepare('SELECT DISTINCT companion_id FROM discovery_seen_identity').all())
      .toEqual([{ companion_id: 'sole' }]);
    sole.close();

    const ambiguous = createLegacyDatabase();
    ambiguous.prepare('INSERT INTO companions VALUES (?, 1, ?)').run('a', now);
    ambiguous.prepare('INSERT INTO companions VALUES (?, 0, ?)').run('b', now);
    ambiguous.prepare('INSERT INTO discoveries VALUES (?, NULL, NULL, ?, ?, ?)').run(
      'legacy', 'Legacy page', 'https://example.test/legacy', now
    );
    expect(ensureAdaptiveDiscoveryPersistence(ambiguous).rowsSkippedWithoutCompanion).toBe(1);
    expect(ambiguous.prepare('SELECT * FROM discovery_seen_identity').all()).toEqual([]);
    ambiguous.close();
  });
});

describe('adaptive discovery persistence store', () => {
  it('keeps more than 100 identities permanent and companion-isolated', () => {
    const db = createLegacyDatabase();
    ensureAdaptiveDiscoveryPersistence(db);
    const store = new AdaptiveDiscoveryPersistence(db);
    for (let index = 0; index < 125; index += 1) {
      const identity: PersistedDiscoverySeenIdentity = {
        id: `identity-${index}`,
        companionId: 'companion-a',
        type: 'canonical_url',
        hash: `hash-${index}`,
        discoveryId: `discovery-${index}`,
        firstSeenAt: now,
        lastSeenAt: now,
        metadata: {}
      };
      store.upsertSeenIdentity(identity);
    }
    store.upsertSeenIdentity({
      id: 'identity-b',
      companionId: 'companion-b',
      type: 'canonical_url',
      hash: 'hash-124',
      firstSeenAt: now,
      lastSeenAt: now,
      metadata: {}
    });

    expect(store.getSeenIdentity('companion-a', 'canonical_url', 'hash-0')?.discoveryId).toBe('discovery-0');
    expect(store.listSeenIdentities({ companionId: 'companion-a', limit: 200 })).toHaveLength(125);
    expect(store.listSeenIdentities({ companionId: 'companion-b', limit: 200 })).toHaveLength(1);
    db.close();
  });

  it('round-trips open-ended bases and rejects cross-companion feedback', () => {
    const db = createLegacyDatabase();
    ensureAdaptiveDiscoveryPersistence(db);
    const store = new AdaptiveDiscoveryPersistence(db);
    const base: PersistedDiscoveryBase = {
      id: 'base',
      companionId: 'companion-a',
      connectorId: 'custom.connector',
      scope: 'arbitrary-scope',
      locator: 'custom://somewhere',
      data: { freeform: ['data'] },
      origin: 'personality',
      state: 'trial',
      discoveredAt: now,
      trialStartedAt: now,
      trialExpiresAt: '2026-07-28T00:00:00.000Z',
      updatedAt: now
    };
    expect(store.upsertBase(base)).toEqual(base);
    expect(store.listBases({ companionId: 'companion-a', state: 'trial' })).toEqual([base]);
    expect(() => store.insertBaseFeedback({
      id: 'wrong-owner',
      companionId: 'companion-b',
      discoveryBaseId: base.id,
      value: 'useful',
      createdAt: now
    })).toThrow('discovery_base_feedback_owner_mismatch');
    store.insertBaseFeedback({
      id: 'feedback',
      companionId: 'companion-a',
      discoveryBaseId: base.id,
      value: 'useful',
      note: 'Promote this base',
      createdAt: now
    });
    expect(store.listBaseFeedback({ companionId: 'companion-a', discoveryBaseId: base.id }))
      .toEqual([expect.objectContaining({ id: 'feedback', value: 'useful' })]);
    expect(store.listBaseFeedback({ companionId: 'companion-b' })).toEqual([]);
    db.close();
  });

  it('queries bounded context buckets instead of loading all discovery history', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE discoveries (
        id TEXT PRIMARY KEY, companion_id TEXT NOT NULL, external_id TEXT, title TEXT NOT NULL, summary TEXT,
        url TEXT, status TEXT NOT NULL, final_score REAL NOT NULL, announced_at TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE discovery_feedback (
        id TEXT PRIMARY KEY, companion_id TEXT NOT NULL, value TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL
      );
    `);
    const insertDiscovery = db.prepare(
      `INSERT INTO discoveries
       (id, companion_id, title, summary, status, final_score, announced_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const statuses = ['saved', 'candidate', 'announced'] as const;
    for (let index = 0; index < 300; index += 1) {
      const timestamp = new Date(Date.parse(now) - index * 1_000).toISOString();
      insertDiscovery.run(
        `discovery-${index}`,
        'companion-a',
        `Title ${index}`,
        `Summary ${index}`,
        statuses[index % statuses.length],
        (index % 10) / 10,
        timestamp,
        timestamp
      );
    }
    const insertFeedback = db.prepare(
      'INSERT INTO discovery_feedback VALUES (?, ?, ?, ?, ?)'
    );
    for (let index = 0; index < 100; index += 1) {
      insertFeedback.run(`feedback-${index}`, 'companion-a', 'ignored', `Note ${index}`, now);
    }
    ensureAdaptiveDiscoveryPersistence(db);
    const context = new AdaptiveDiscoveryPersistence(db).loadBoundedDiscoveryContext({
      companionId: 'companion-a'
    });
    expect(context).toHaveLength(40);
    expect(new Set(context.map((item) => item.category))).toEqual(new Set([
      'pinned_or_saved', 'recent_unsaved', 'recent_presented', 'feedback_or_ignored'
    ]));
    expect(context.filter((item) => item.category === 'feedback_or_ignored')).toHaveLength(10);
    db.close();
  });
});
