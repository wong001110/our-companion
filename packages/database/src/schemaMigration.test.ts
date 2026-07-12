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
});
