import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { DatabaseService } from './index';

describe('schema compatibility migrations', () => {
  it('keeps web page evidence search-result provenance while trimming search-record domains', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'our-companion-page-evidence-db-'));
    const dbPath = path.join(directory, 'legacy.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE web_page_evidence (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, companion_id TEXT NOT NULL, cycle_id TEXT NOT NULL,
        research_intent_id TEXT NOT NULL, research_plan_id TEXT NOT NULL, search_result_id TEXT NOT NULL,
        query TEXT NOT NULL, provider TEXT NOT NULL, url TEXT NOT NULL, canonical_url TEXT NOT NULL,
        domain TEXT NOT NULL, title TEXT NOT NULL, extracted_text TEXT NOT NULL, excerpt TEXT NOT NULL,
        content_hash TEXT NOT NULL, content_type TEXT NOT NULL, fetched_at TEXT NOT NULL, published_at TEXT,
        source_type TEXT NOT NULL
      );
      CREATE INDEX idx_web_page_evidence_search_result ON web_page_evidence(search_result_id);
      CREATE TABLE research_search_records (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, companion_id TEXT NOT NULL, cycle_id TEXT NOT NULL,
        research_intent_id TEXT NOT NULL, research_plan_id TEXT NOT NULL, query TEXT NOT NULL,
        provider TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, result_count INTEGER NOT NULL,
        domains_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, error_code TEXT
      );
    `);
    legacy.prepare(
      `INSERT INTO web_page_evidence
       VALUES ('evidence', 'user', 'companion', 'cycle', 'intent', 'plan', 'transient-result-id', 'query',
        'brave', 'https://example.test/page', 'https://example.test/page', 'example.test', 'Page title',
        'Fetched public evidence.', 'Excerpt', 'hash', 'text/html', '2026-07-18T00:00:00.000Z', NULL, 'official')`
    ).run();
    legacy.prepare(
      `INSERT INTO research_search_records
       VALUES ('search', 'user', 'companion', 'cycle', 'intent', 'plan', 'query', 'brave', 'live', 'completed',
        1, '["example.test"]', '2026-07-18T00:00:00.000Z', NULL)`
    ).run();
    legacy.close();

    const db = new DatabaseService({ path: dbPath });
    const raw = (db as unknown as { db: DatabaseSync }).db;
    const columns = raw.prepare('PRAGMA table_info(web_page_evidence)').all() as Array<{ name: string }>;
    expect(columns.some((column) => column.name === 'search_result_id')).toBe(true);
    expect(db.getWebPageEvidence('evidence', 'companion')).toEqual(expect.objectContaining({
      id: 'evidence', url: 'https://example.test/page', title: 'Page title', searchResultId: 'transient-result-id'
    }));
    const searchRecordColumns = raw.prepare('PRAGMA table_info(research_search_records)').all() as Array<{ name: string }>;
    expect(searchRecordColumns.some((column) => column.name === 'domains_json')).toBe(false);
    expect(db.getResearchSearchRecord('search', 'companion')).toEqual(expect.objectContaining({
      id: 'search', provider: 'brave', resultCount: 1
    }));
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('adds research provenance columns to existing discovery candidates and exploration cycles', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'our-companion-research-db-'));
    const dbPath = path.join(directory, 'legacy.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE discovery_candidates (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, companion_id TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL,
        source_type TEXT NOT NULL, source_url TEXT, source_name TEXT, agent_type TEXT NOT NULL,
        related_curiosity_target_id TEXT NOT NULL, relevance_score REAL NOT NULL, novelty_score REAL NOT NULL,
        evidence_score REAL NOT NULL, usefulness_score REAL NOT NULL, raw_evidence TEXT, collected_at TEXT NOT NULL
      );
      CREATE TABLE exploration_cycles (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, companion_id TEXT NOT NULL, trigger TEXT NOT NULL, state TEXT NOT NULL,
        curiosity_target_ids_json TEXT NOT NULL DEFAULT '[]', selected_curiosity_target_id TEXT, exploration_plan_id TEXT,
        discovery_candidate_ids_json TEXT NOT NULL DEFAULT '[]', insight_ids_json TEXT NOT NULL DEFAULT '[]', selected_insight_id TEXT,
        started_at TEXT NOT NULL, completed_at TEXT
      );
    `);
    legacy.close();

    const db = new DatabaseService({ path: dbPath });
    const raw = (db as unknown as { db: DatabaseSync }).db;
    const candidateColumns = raw.prepare('PRAGMA table_info(discovery_candidates)').all() as Array<{ name: string }>;
    const cycleColumns = raw.prepare('PRAGMA table_info(exploration_cycles)').all() as Array<{ name: string }>;
    expect(candidateColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'research_plan_id',
      'evidence_ids_json'
    ]));
    expect(cycleColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'research_intent_id',
      'research_plan_id'
    ]));
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('adds durable canonical, publication, and fingerprint provenance to legacy discoveries', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'our-companion-discovery-provenance-db-'));
    const dbPath = path.join(directory, 'legacy.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE discoveries (
        id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT, title TEXT NOT NULL, summary TEXT,
        url TEXT, tags_json TEXT NOT NULL DEFAULT '[]', raw_json TEXT,
        interest_score REAL NOT NULL DEFAULT 0, history_score REAL NOT NULL DEFAULT 0,
        expertise_score REAL NOT NULL DEFAULT 0, novelty_score REAL NOT NULL DEFAULT 0,
        usefulness_score REAL NOT NULL DEFAULT 0, final_score REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'candidate', why_this_matters TEXT, recommended_action TEXT,
        short_message TEXT, shared_at TEXT, created_at TEXT NOT NULL
      );
    `);
    legacy.close();

    const db = new DatabaseService({ path: dbPath });
    const raw = (db as unknown as { db: DatabaseSync }).db;
    const columns = raw.prepare('PRAGMA table_info(discoveries)').all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'canonical_url',
      'published_at',
      'fingerprint',
    ]));

    const createdAt = '2026-07-18T00:00:00.000Z';
    db.insertDiscovery({
      id: 'discovery-provenance',
      source: 'internet',
      externalId: 'source-42',
      title: 'Durable research result',
      summary: 'Preserves source lineage across process restarts.',
      url: 'https://example.test/article?utm_source=test',
      canonicalUrl: 'https://example.test/article',
      publishedAt: '2026-07-17T00:00:00.000Z',
      tags: ['research'],
      raw: { evidenceIds: ['evidence-1'] },
      fingerprint: 'fingerprint-42',
      userInterestScore: 0.8,
      userHistoryScore: 0.7,
      characterExpertiseScore: 0.6,
      noveltyScore: 0.9,
      usefulnessScore: 0.85,
      finalScore: 0.82,
      status: 'candidate',
      createdAt,
    });
    expect(db.getDiscovery('discovery-provenance')).toEqual(expect.objectContaining({
      canonicalUrl: 'https://example.test/article',
      publishedAt: '2026-07-17T00:00:00.000Z',
      fingerprint: 'fingerprint-42',
    }));
    db.close();

    const reopened = new DatabaseService({ path: dbPath });
    expect(reopened.getDiscovery('discovery-provenance')).toEqual(expect.objectContaining({
      canonicalUrl: 'https://example.test/article',
      publishedAt: '2026-07-17T00:00:00.000Z',
      fingerprint: 'fingerprint-42',
    }));
    reopened.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('adds session_id before creating its index for an existing companion_messages table', () => {
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'our-companion-db-')), 'legacy.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE companion_messages (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
      source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ok', metadata_json TEXT, created_at TEXT NOT NULL
    )`);
    legacy.close();

    const db = new DatabaseService({ path: dbPath });
    const columns = (db as unknown as { db: DatabaseSync }).db.prepare('PRAGMA table_info(companion_messages)').all() as Array<{ name: string }>;
    const indexes = (db as unknown as { db: DatabaseSync }).db.prepare('PRAGMA index_list(companion_messages)').all() as Array<{ name: string }>;
    expect(columns.some((column) => column.name === 'session_id')).toBe(true);
    expect(indexes.some((index) => index.name === 'idx_companion_messages_session')).toBe(true);
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('migrates the legacy announcement list into durable lifecycle timestamps once', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'our-companion-discovery-db-'));
    const dbPath = path.join(directory, 'legacy.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE discoveries (
        id TEXT PRIMARY KEY, source TEXT NOT NULL, external_id TEXT, title TEXT NOT NULL, summary TEXT,
        url TEXT, tags_json TEXT NOT NULL DEFAULT '[]', raw_json TEXT,
        interest_score REAL NOT NULL DEFAULT 0, history_score REAL NOT NULL DEFAULT 0,
        expertise_score REAL NOT NULL DEFAULT 0, novelty_score REAL NOT NULL DEFAULT 0,
        usefulness_score REAL NOT NULL DEFAULT 0, final_score REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'candidate', why_this_matters TEXT, recommended_action TEXT,
        short_message TEXT, shared_at TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    const selectedAt = '2026-07-16T03:00:00.000Z';
    legacy.prepare(
      `INSERT INTO discoveries
       (id, source, title, tags_json, interest_score, history_score, expertise_score, novelty_score,
        usefulness_score, final_score, status, shared_at, created_at)
       VALUES (?, 'github', ?, '[]', 80, 70, 60, 50, 40, 75, 'shared', ?, ?)`
    ).run('legacy-announced', 'Already rendered', selectedAt, selectedAt);
    legacy.prepare(
      `INSERT INTO discoveries
       (id, source, title, tags_json, interest_score, history_score, expertise_score, novelty_score,
        usefulness_score, final_score, status, shared_at, created_at)
       VALUES (?, 'github', ?, '[]', 80, 70, 60, 50, 40, 75, 'shared', ?, ?)`
    ).run('legacy-eligible', 'Not yet rendered', selectedAt, selectedAt);
    legacy.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)`
    ).run('discovery.announcedIds', JSON.stringify(['legacy-announced']), selectedAt);
    legacy.close();

    const db = new DatabaseService({ path: dbPath });
    expect(db.getDiscovery('legacy-announced')).toEqual(expect.objectContaining({
      status: 'announced',
      announcedAt: selectedAt,
      finalScore: 0.75
    }));
    expect(db.getDiscovery('legacy-eligible')).toEqual(expect.objectContaining({
      status: 'eligible',
      eligibleAt: selectedAt
    }));
    expect(db.getAnnouncedDiscoveryIds()).toEqual(['legacy-announced']);
    const raw = (db as unknown as { db: DatabaseSync }).db;
    expect(raw.prepare('SELECT 1 FROM app_settings WHERE key = ?').get('discovery.announcedIds')).toBeUndefined();
    db.close();

    const reopened = new DatabaseService({ path: dbPath });
    expect(reopened.getDiscovery('legacy-announced')?.announcedAt).toBe(selectedAt);
    expect(reopened.getDiscovery('legacy-eligible')?.status).toBe('eligible');
    reopened.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('rescales only legacy conversation importance values in the old 0–1 range', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'our-companion-memory-db-'));
    const dbPath = path.join(directory, 'legacy.sqlite');
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE memory_nodes (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, summary TEXT, content TEXT,
        importance_score REAL NOT NULL DEFAULT 0, source TEXT, source_url TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0, is_marked_wrong INTEGER NOT NULL DEFAULT 0,
        companion_id TEXT, user_id TEXT DEFAULT 'local', memory_type TEXT, metadata_json TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, compressed_at TEXT
      );
    `);
    const timestamp = '2026-07-16T03:00:00.000Z';
    const insert = legacy.prepare(
      `INSERT INTO memory_nodes
       (id, type, title, importance_score, source, created_at, updated_at)
       VALUES (?, 'topic', ?, ?, ?, ?, ?)`
    );
    insert.run('conversation-unit', 'Conversation unit', 0.85, 'conversation', timestamp, timestamp);
    insert.run('conversation-percent', 'Conversation percent', 75, 'conversation', timestamp, timestamp);
    insert.run('non-conversation-unit', 'Other unit', 0.85, 'imported', timestamp, timestamp);
    legacy.close();

    const db = new DatabaseService({ path: dbPath });
    const raw = (db as unknown as { db: DatabaseSync }).db;
    expect(raw.prepare('SELECT importance_score FROM memory_nodes WHERE id = ?').get('conversation-unit'))
      .toEqual({ importance_score: 85 });
    expect(raw.prepare('SELECT importance_score FROM memory_nodes WHERE id = ?').get('conversation-percent'))
      .toEqual({ importance_score: 75 });
    expect(raw.prepare('SELECT importance_score FROM memory_nodes WHERE id = ?').get('non-conversation-unit'))
      .toEqual({ importance_score: 0.85 });
    expect(db.getMemoryNode('conversation-unit')?.importance).toBe(0.85);
    db.close();

    const reopened = new DatabaseService({ path: dbPath });
    expect((reopened as unknown as { db: DatabaseSync }).db
      .prepare('SELECT importance_score FROM memory_nodes WHERE id = ?').get('conversation-unit'))
      .toEqual({ importance_score: 85 });
    reopened.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
