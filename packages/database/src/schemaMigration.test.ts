import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { DatabaseService } from './index';

describe('schema compatibility migrations', () => {
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
