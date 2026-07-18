import type { DatabaseSync } from 'node:sqlite';
import { createSemanticFingerprint } from '@our-companion/shared';

export type PersistedDiscoverySeenIdentityType =
  | 'external_id'
  | 'canonical_url'
  | 'content_hash'
  | 'fingerprint'
  | 'event_key';

export interface PersistedDiscoverySeenIdentity {
  id: string;
  companionId: string;
  type: PersistedDiscoverySeenIdentityType;
  hash: string;
  discoveryId?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  metadata: Readonly<Record<string, unknown>>;
}

export type PersistedDiscoveryBaseState = 'trial' | 'active' | 'expired' | 'muted' | 'blocked' | 'rejected';

export interface PersistedDiscoveryBase {
  id: string;
  companionId: string;
  connectorId: string;
  scope: string;
  locator: string;
  data: Readonly<Record<string, unknown>>;
  origin: string;
  state: PersistedDiscoveryBaseState;
  discoveredAt: string;
  trialStartedAt?: string;
  trialExpiresAt?: string;
  lastCheckedAt?: string;
  updatedAt: string;
}

export interface PersistedDiscoveryBaseFeedback {
  id: string;
  companionId: string;
  discoveryBaseId: string;
  value: string;
  note?: string;
  createdAt: string;
}

export interface AdaptiveDiscoveryMigrationReport {
  identitiesBackfilled: number;
  rowsSkippedWithoutCompanion: number;
}

export type PersistedDiscoveryContextCategory =
  | 'pinned_or_saved'
  | 'recent_unsaved'
  | 'recent_presented'
  | 'feedback_or_ignored';

export interface PersistedDiscoveryContextSource {
  id: string;
  category: PersistedDiscoveryContextCategory;
  summary: string;
  occurredAt: string;
  priority: number;
}

export const ADAPTIVE_DISCOVERY_SQL = `
CREATE TABLE IF NOT EXISTS discovery_seen_identity (
  id TEXT PRIMARY KEY,
  companion_id TEXT NOT NULL,
  identity_type TEXT NOT NULL,
  identity_hash TEXT NOT NULL,
  discovery_id TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (companion_id, identity_type, identity_hash)
);

CREATE TABLE IF NOT EXISTS discovery_bases (
  id TEXT PRIMARY KEY,
  companion_id TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  locator TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  origin TEXT NOT NULL,
  state TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  trial_started_at TEXT,
  trial_expires_at TEXT,
  last_checked_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (companion_id, connector_id, scope, locator)
);

CREATE TABLE IF NOT EXISTS discovery_base_feedback (
  id TEXT PRIMARY KEY,
  companion_id TEXT NOT NULL,
  discovery_base_id TEXT NOT NULL,
  value TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (discovery_base_id) REFERENCES discovery_bases(id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_seen_companion_last_seen
  ON discovery_seen_identity(companion_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_seen_discovery
  ON discovery_seen_identity(discovery_id);
CREATE INDEX IF NOT EXISTS idx_discovery_bases_companion_state
  ON discovery_bases(companion_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_base_feedback_base
  ON discovery_base_feedback(discovery_base_id, created_at DESC);
`;

function normalizedText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || ['ref', 'fbclid', 'gclid'].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.trim();
  }
}

function identityHash(type: PersistedDiscoverySeenIdentityType, normalizedValue: string): string {
  return createSemanticFingerprint('discovery_seen', [type, normalizedValue]);
}

function tableExists(db: DatabaseSync, name: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function tableColumns(db: DatabaseSync, name: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info("${name.replaceAll('"', '""')}")`).all() as Array<{ name: string }>)
    .map((column) => column.name));
}

function companionFallback(db: DatabaseSync): string | undefined {
  if (!tableExists(db, 'companions')) return undefined;
  const companions = db.prepare(
    'SELECT id FROM companions ORDER BY is_primary DESC, created_at ASC LIMIT 2'
  ).all() as Array<{ id: string }>;
  return companions.length === 1 ? String(companions[0]?.id) : undefined;
}

function insertBackfilledIdentity(
  db: DatabaseSync,
  input: {
    companionId: string;
    type: PersistedDiscoverySeenIdentityType;
    normalizedValue: string;
    discoveryId?: string;
    seenAt: string;
    sourceTable: string;
  }
): boolean {
  const hash = identityHash(input.type, input.normalizedValue);
  const result = db.prepare(
    `INSERT OR IGNORE INTO discovery_seen_identity
     (id, companion_id, identity_type, identity_hash, discovery_id, first_seen_at, last_seen_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    createSemanticFingerprint('seen_backfill', [input.companionId, input.type, hash]),
    input.companionId,
    input.type,
    hash,
    input.discoveryId ?? null,
    input.seenAt,
    input.seenAt,
    JSON.stringify({ backfilledFrom: input.sourceTable, normalizedValue: input.normalizedValue })
  );
  return result.changes > 0;
}

function backfillDiscoveryIdentities(db: DatabaseSync): AdaptiveDiscoveryMigrationReport {
  let identitiesBackfilled = 0;
  let rowsSkippedWithoutCompanion = 0;
  const fallbackCompanion = companionFallback(db);
  if (tableExists(db, 'discoveries')) {
    const columns = tableColumns(db, 'discoveries');
    const wanted = ['id', 'companion_id', 'external_id', 'title', 'url', 'canonical_url', 'fingerprint', 'created_at']
      .filter((column) => columns.has(column));
    const rows = db
      .prepare(`SELECT ${wanted.map((column) => `"${column}"`).join(', ')} FROM discoveries`)
      .all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const companionId = String(row.companion_id ?? fallbackCompanion ?? '');
      if (!companionId) {
        rowsSkippedWithoutCompanion += 1;
        continue;
      }
      const seenAt = String(row.created_at ?? new Date(0).toISOString());
      const identities: Array<[PersistedDiscoverySeenIdentityType, string]> = [];
      if (row.external_id) identities.push(['external_id', `legacy:${normalizedText(String(row.external_id))}`]);
      const url = row.canonical_url || row.url;
      if (url) identities.push(['canonical_url', normalizeUrl(String(url))]);
      if (row.fingerprint) identities.push(['fingerprint', String(row.fingerprint)]);
      else if (row.title) {
        const eventFingerprint = createSemanticFingerprint('discovery_event', [
          ...normalizedText(String(row.title)).split(' ').filter((word) => word.length > 2).sort(),
          '|',
          '|',
          '|',
          ''
        ]);
        identities.push(['fingerprint', eventFingerprint]);
      }
      for (const [type, normalizedValue] of identities) {
        if (insertBackfilledIdentity(db, {
          companionId,
          type,
          normalizedValue,
          discoveryId: String(row.id),
          seenAt,
          sourceTable: 'discoveries'
        })) identitiesBackfilled += 1;
      }
    }
  }

  if (tableExists(db, 'web_page_evidence')) {
    const rows = db.prepare(
      'SELECT id, companion_id, canonical_url, content_hash, fetched_at FROM web_page_evidence'
    ).all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const companionId = String(row.companion_id ?? '');
      if (!companionId) {
        rowsSkippedWithoutCompanion += 1;
        continue;
      }
      for (const [type, normalizedValue] of [
        ['canonical_url', normalizeUrl(String(row.canonical_url))],
        ['content_hash', String(row.content_hash).trim().toLowerCase()]
      ] as const) {
        if (insertBackfilledIdentity(db, {
          companionId,
          type,
          normalizedValue,
          seenAt: String(row.fetched_at),
          sourceTable: 'web_page_evidence'
        })) identitiesBackfilled += 1;
      }
    }
  }
  return { identitiesBackfilled, rowsSkippedWithoutCompanion };
}

export function ensureAdaptiveDiscoveryPersistence(db: DatabaseSync): AdaptiveDiscoveryMigrationReport {
  db.exec('BEGIN');
  try {
    db.exec(ADAPTIVE_DISCOVERY_SQL);
    const report = backfillDiscoveryIdentities(db);
    db.exec('COMMIT');
    return report;
  } catch (error) {
    db.exec('ROLLBACK');
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`adaptive_discovery_migration_failed:${message}`, { cause: error });
  }
}

function mapSeen(row: Record<string, unknown>): PersistedDiscoverySeenIdentity {
  return {
    id: String(row.id),
    companionId: String(row.companion_id),
    type: row.identity_type as PersistedDiscoverySeenIdentityType,
    hash: String(row.identity_hash),
    discoveryId: row.discovery_id ? String(row.discovery_id) : undefined,
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    metadata: JSON.parse(String(row.metadata_json || '{}')) as Record<string, unknown>
  };
}

function mapBase(row: Record<string, unknown>): PersistedDiscoveryBase {
  return {
    id: String(row.id),
    companionId: String(row.companion_id),
    connectorId: String(row.connector_id),
    scope: String(row.scope),
    locator: String(row.locator),
    data: JSON.parse(String(row.data_json || '{}')) as Record<string, unknown>,
    origin: String(row.origin),
    state: row.state as PersistedDiscoveryBaseState,
    discoveredAt: String(row.discovered_at),
    trialStartedAt: row.trial_started_at ? String(row.trial_started_at) : undefined,
    trialExpiresAt: row.trial_expires_at ? String(row.trial_expires_at) : undefined,
    lastCheckedAt: row.last_checked_at ? String(row.last_checked_at) : undefined,
    updatedAt: String(row.updated_at)
  };
}

function mapBaseFeedback(row: Record<string, unknown>): PersistedDiscoveryBaseFeedback {
  return {
    id: String(row.id),
    companionId: String(row.companion_id),
    discoveryBaseId: String(row.discovery_base_id),
    value: String(row.value),
    note: row.note ? String(row.note) : undefined,
    createdAt: String(row.created_at)
  };
}

export class AdaptiveDiscoveryPersistence {
  constructor(private readonly db: DatabaseSync) {}

  upsertSeenIdentity(identity: PersistedDiscoverySeenIdentity): PersistedDiscoverySeenIdentity {
    this.db.prepare(
      `INSERT INTO discovery_seen_identity
       (id, companion_id, identity_type, identity_hash, discovery_id, first_seen_at, last_seen_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(companion_id, identity_type, identity_hash) DO UPDATE SET
         discovery_id = COALESCE(excluded.discovery_id, discovery_seen_identity.discovery_id),
         last_seen_at = MAX(excluded.last_seen_at, discovery_seen_identity.last_seen_at),
         metadata_json = excluded.metadata_json`
    ).run(
      identity.id,
      identity.companionId,
      identity.type,
      identity.hash,
      identity.discoveryId ?? null,
      identity.firstSeenAt,
      identity.lastSeenAt,
      JSON.stringify(identity.metadata)
    );
    return this.getSeenIdentity(identity.companionId, identity.type, identity.hash)!;
  }

  getSeenIdentity(
    companionId: string,
    type: PersistedDiscoverySeenIdentityType,
    hash: string
  ): PersistedDiscoverySeenIdentity | undefined {
    const row = this.db.prepare(
      `SELECT * FROM discovery_seen_identity
       WHERE companion_id = ? AND identity_type = ? AND identity_hash = ?`
    ).get(companionId, type, hash) as Record<string, unknown> | undefined;
    return row ? mapSeen(row) : undefined;
  }

  listSeenIdentities(input: {
    companionId: string;
    limit?: number;
  }): readonly PersistedDiscoverySeenIdentity[] {
    const rows = this.db.prepare(
      'SELECT * FROM discovery_seen_identity WHERE companion_id = ? ORDER BY last_seen_at DESC LIMIT ?'
    ).all(input.companionId, Math.min(10_000, Math.max(1, input.limit ?? 100))) as Array<Record<string, unknown>>;
    return rows.map(mapSeen);
  }

  clearSeenIdentityTarget(id: string, companionId: string): boolean {
    const result = this.db.prepare(
      `UPDATE discovery_seen_identity
       SET discovery_id = NULL
       WHERE id = ? AND companion_id = ? AND discovery_id IS NOT NULL`
    ).run(id, companionId);
    return result.changes > 0;
  }

  upsertBase(base: PersistedDiscoveryBase): PersistedDiscoveryBase {
    this.db.prepare(
      `INSERT INTO discovery_bases
       (id, companion_id, connector_id, scope, locator, data_json, origin, state, discovered_at,
        trial_started_at, trial_expires_at, last_checked_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(companion_id, connector_id, scope, locator) DO UPDATE SET
         data_json = excluded.data_json,
         state = excluded.state,
         trial_started_at = excluded.trial_started_at,
         trial_expires_at = excluded.trial_expires_at,
         last_checked_at = excluded.last_checked_at,
         updated_at = excluded.updated_at`
    ).run(
      base.id,
      base.companionId,
      base.connectorId,
      base.scope,
      base.locator,
      JSON.stringify(base.data),
      base.origin,
      base.state,
      base.discoveredAt,
      base.trialStartedAt ?? null,
      base.trialExpiresAt ?? null,
      base.lastCheckedAt ?? null,
      base.updatedAt
    );
    return this.getBase(base.id, base.companionId)
      ?? this.getBaseByLocator(base.companionId, base.connectorId, base.scope, base.locator)!;
  }

  getBase(id: string, companionId: string): PersistedDiscoveryBase | undefined {
    const row = this.db.prepare(
      'SELECT * FROM discovery_bases WHERE id = ? AND companion_id = ?'
    ).get(id, companionId) as Record<string, unknown> | undefined;
    return row ? mapBase(row) : undefined;
  }

  getBaseByLocator(
    companionId: string,
    connectorId: string,
    scope: string,
    locator: string
  ): PersistedDiscoveryBase | undefined {
    const row = this.db.prepare(
      `SELECT * FROM discovery_bases
       WHERE companion_id = ? AND connector_id = ? AND scope = ? AND locator = ?`
    ).get(companionId, connectorId, scope, locator) as Record<string, unknown> | undefined;
    return row ? mapBase(row) : undefined;
  }

  listBases(input: {
    companionId: string;
    state?: PersistedDiscoveryBaseState;
    limit?: number;
  }): readonly PersistedDiscoveryBase[] {
    const limit = Math.min(1_000, Math.max(1, input.limit ?? 100));
    const rows = input.state
      ? this.db.prepare(
        'SELECT * FROM discovery_bases WHERE companion_id = ? AND state = ? ORDER BY updated_at DESC LIMIT ?'
      ).all(input.companionId, input.state, limit)
      : this.db.prepare(
        'SELECT * FROM discovery_bases WHERE companion_id = ? ORDER BY updated_at DESC LIMIT ?'
      ).all(input.companionId, limit);
    return (rows as Array<Record<string, unknown>>).map(mapBase);
  }

  insertBaseFeedback(feedback: PersistedDiscoveryBaseFeedback): PersistedDiscoveryBaseFeedback {
    const base = this.getBase(feedback.discoveryBaseId, feedback.companionId);
    if (!base) throw new Error('discovery_base_feedback_owner_mismatch');
    this.db.prepare(
      `INSERT INTO discovery_base_feedback
       (id, companion_id, discovery_base_id, value, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      feedback.id,
      feedback.companionId,
      feedback.discoveryBaseId,
      feedback.value,
      feedback.note ?? null,
      feedback.createdAt
    );
    return feedback;
  }

  listBaseFeedback(input: {
    companionId: string;
    discoveryBaseId?: string;
    limit?: number;
  }): readonly PersistedDiscoveryBaseFeedback[] {
    const limit = Math.min(1_000, Math.max(1, input.limit ?? 100));
    const rows = input.discoveryBaseId
      ? this.db.prepare(
        `SELECT * FROM discovery_base_feedback
         WHERE companion_id = ? AND discovery_base_id = ? ORDER BY created_at DESC LIMIT ?`
      ).all(input.companionId, input.discoveryBaseId, limit)
      : this.db.prepare(
        'SELECT * FROM discovery_base_feedback WHERE companion_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(input.companionId, limit);
    return (rows as Array<Record<string, unknown>>).map(mapBaseFeedback);
  }

  /**
   * Loads four independently limited context buckets. Unlike list-and-slice,
   * these SQL reads remain bounded even when discovery history is very large.
   */
  loadBoundedDiscoveryContext(input: {
    companionId: string;
    maximumItems?: number;
    maximumSummaryCharacters?: number;
  }): readonly PersistedDiscoveryContextSource[] {
    if (!tableExists(this.db, 'discoveries')) return [];
    const discoveryColumns = tableColumns(this.db, 'discoveries');
    const requiredDiscoveryColumns = ['id', 'companion_id', 'title', 'status', 'final_score', 'created_at'];
    if (requiredDiscoveryColumns.some((column) => !discoveryColumns.has(column))) return [];
    const maximumItems = Math.min(40, Math.max(1, Math.floor(input.maximumItems ?? 40)));
    const summaryCharacters = Math.max(80, Math.floor(input.maximumSummaryCharacters ?? 500));
    const perBucket = Math.max(1, Math.ceil(maximumItems / 4));
    const summaryExpression = discoveryColumns.has('summary')
      ? "COALESCE(NULLIF(summary, ''), title)"
      : 'title';
    const announcedExpression = discoveryColumns.has('announced_at')
      ? 'COALESCE(announced_at, created_at)'
      : 'created_at';
    const discoveryRows = (
      category: PersistedDiscoveryContextCategory,
      statusClause: string,
      occurredAtExpression: string
    ): PersistedDiscoveryContextSource[] => {
      const rows = this.db.prepare(
        `SELECT id, ${summaryExpression} AS summary, ${occurredAtExpression} AS occurred_at, final_score
         FROM discoveries
         WHERE companion_id = ? AND ${statusClause}
         ORDER BY ${occurredAtExpression} DESC
         LIMIT ?`
      ).all(input.companionId, perBucket) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: String(row.id),
        category,
        summary: String(row.summary).trim().slice(0, summaryCharacters),
        occurredAt: String(row.occurred_at),
        priority: Number(row.final_score ?? 0)
      }));
    };
    const items: PersistedDiscoveryContextSource[] = [
      ...discoveryRows('pinned_or_saved', "status = 'saved'", announcedExpression),
      ...discoveryRows('recent_unsaved', "status IN ('candidate', 'eligible', 'queued')", 'created_at'),
      ...discoveryRows(
        'recent_presented',
        "status IN ('announced', 'dismissed', 'rejected', 'archived')",
        announcedExpression
      )
    ];

    if (tableExists(this.db, 'discovery_feedback')) {
      const feedbackColumns = tableColumns(this.db, 'discovery_feedback');
      if (['id', 'companion_id', 'value', 'created_at'].every((column) => feedbackColumns.has(column))) {
        const noteExpression = feedbackColumns.has('note')
          ? "CASE WHEN note IS NULL OR note = '' THEN value ELSE value || ': ' || note END"
          : 'value';
        const rows = this.db.prepare(
          `SELECT id, ${noteExpression} AS summary, created_at
           FROM discovery_feedback
           WHERE companion_id = ?
           ORDER BY created_at DESC
           LIMIT ?`
        ).all(input.companionId, perBucket) as Array<Record<string, unknown>>;
        items.push(...rows.map((row) => ({
          id: String(row.id),
          category: 'feedback_or_ignored' as const,
          summary: String(row.summary).trim().slice(0, summaryCharacters),
          occurredAt: String(row.created_at),
          priority: 1
        })));
      }
    }
    return items
      .sort((left, right) => right.priority - left.priority
        || Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
        || left.id.localeCompare(right.id))
      .slice(0, maximumItems);
  }
}
