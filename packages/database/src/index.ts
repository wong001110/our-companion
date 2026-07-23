import { DatabaseSync } from 'node:sqlite';
import type {
  CharacterProfile,
  CharacterRuntimeState,
  CompanionAppendMessageInput,
  CompanionHistoryInput,
  CompanionInsight,
  CompanionMessage,
  CompanionPersonality,
  CompanionProfile,
  ConversationPhase,
  ConversationSessionRecord,
  CreateCompanionInput,
  UpdateCompanionInput,
  CuriosityTarget,
  DebugDataResetInput,
  DebugDataResetResult,
  DebugDataResetTarget,
  DiaryEntry,
  Discovery,
  DiscoveryCandidate,
  DiscoveryFeedback,
  DiscoveryStatus,
  EngineTrace,
  ExplorationCycle,
  ExplorationLoopEvent,
  InterestEdge,
  InterestGraph,
  InterestNode,
  Journey,
  JourneyMilestone,
  MemoryEdge,
  MemoryNode,
  MemoryProcessingState,
  Pattern,
  UserCompanionRelationship,
  PendingCompanionAction,
  SessionCloseReason,
  CompanionDecision
  ,UserTopicPreference, NetworkCompanionLink, CachedAssetPack,
  ResearchIntent,
  ResearchPlan,
  ResearchSearchRecord,
  WebPageEvidence,
  DeveloperDebugEventQuery,
  DeveloperDebugEventKind
} from '@our-companion/shared';
import type { ActionPermissionState } from '@our-companion/shared';
import {
  COMPANION_CHAT_RETENTION_DAYS,
  CURIOSITY_COOLDOWN_MS,
  createId,
  createSemanticFingerprint,
  normalizeSemanticText,
  nowIso,
  score100ToUnit,
  unitToScore100
} from '@our-companion/shared';
import { sqliteSchema } from './schema';
import {
  AdaptiveDiscoveryPersistence,
  ensureAdaptiveDiscoveryPersistence,
  type PersistedDiscoveryBase,
  type PersistedDiscoveryBaseFeedback,
  type PersistedDiscoveryBaseState,
  type PersistedDiscoveryContextSource,
  type PersistedDiscoverySeenIdentity,
  type PersistedDiscoverySeenIdentityType,
} from './adaptiveDiscoveryPersistence';
export * from './adaptiveDiscoveryPersistence';

const DISCOVERY_ANNOUNCED_KEY = 'discovery.announcedIds';
const ALL_DEBUG_DATA_TARGETS: DebugDataResetTarget[] = ['discoveries', 'memory', 'journeys', 'diary', 'chat', 'autonomy'];

const LEGAL_DISCOVERY_TRANSITIONS: Readonly<Record<DiscoveryStatus, readonly DiscoveryStatus[]>> = {
  candidate: ['eligible', 'archived'],
  eligible: ['queued', 'archived'],
  queued: ['presenting', 'eligible', 'archived'],
  presenting: ['announced', 'queued', 'eligible', 'archived'],
  announced: ['saved', 'rejected', 'dismissed', 'archived'],
  saved: ['archived'],
  rejected: ['archived'],
  dismissed: ['archived'],
  archived: []
};

export interface DiscoveryLifecycleTransitionInput {
  at?: string;
  companionId?: string;
  cycleId?: string;
  commandId?: string;
  reason?: string;
}

export interface EngineTraceQuery {
  correlationId?: string;
  cycleId?: string;
  companionId?: string;
  limit?: number;
}

/** Research artifacts are always read through the captured cycle owner. */
export interface ResearchArtifactQuery {
  companionId: string;
  cycleId?: string;
  limit?: number;
}

export interface CognitiveUpsertResult<T> {
  record: T;
  outcome: 'created' | 'updated' | 'deduplicated' | 'cooldown' | 'reopened';
}

type SqliteDatabase = DatabaseSync;

export interface DatabaseServiceOptions {
  path?: string;
  priorAnnHasCustomAssets?: () => boolean;
}

export class DatabaseService {
  private readonly db: SqliteDatabase;
  private readonly adaptiveDiscovery: AdaptiveDiscoveryPersistence;
  private readonly priorAnnHasCustomAssets: () => boolean;
  private embeddingJobNotifier?: () => void;
  private vectorDeletionHandler?: (memoryId: string) => void;

  constructor(options: DatabaseServiceOptions = {}) {
    this.priorAnnHasCustomAssets = options.priorAnnHasCustomAssets ?? (() => false);
    // Extension loading is enabled only long enough for the pinned sqlite-vec
    // binary in the Electron main process; VectorIndex disables it again.
    this.db = new DatabaseSync(options.path ?? ':memory:', { allowExtension: true });
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(sqliteSchema);
    this.runMigrations();
    this.ensureCompatibilityIndexes();
    ensureAdaptiveDiscoveryPersistence(this.db);
    this.adaptiveDiscovery = new AdaptiveDiscoveryPersistence(this.db);
  }

  getDiscoverySeenIdentity(
    companionId: string,
    type: PersistedDiscoverySeenIdentityType,
    hash: string,
  ): PersistedDiscoverySeenIdentity | undefined {
    return this.adaptiveDiscovery.getSeenIdentity(companionId, type, hash);
  }

  upsertDiscoverySeenIdentity(identity: PersistedDiscoverySeenIdentity): PersistedDiscoverySeenIdentity {
    return this.adaptiveDiscovery.upsertSeenIdentity(identity);
  }

  listDiscoverySeenIdentities(
    companionId: string,
    limit = 100,
  ): readonly PersistedDiscoverySeenIdentity[] {
    return this.adaptiveDiscovery.listSeenIdentities({ companionId, limit });
  }

  clearDiscoverySeenIdentityTarget(id: string, companionId: string): boolean {
    return this.adaptiveDiscovery.clearSeenIdentityTarget(id, companionId);
  }

  listDiscoveryBases(
    companionId: string,
    state?: PersistedDiscoveryBaseState,
    limit = 100,
  ): readonly PersistedDiscoveryBase[] {
    return this.adaptiveDiscovery.listBases({ companionId, state, limit });
  }

  listDiscoveryBasesForExecution(
    companionId: string,
    limit = 32,
  ): readonly PersistedDiscoveryBase[] {
    return this.adaptiveDiscovery.listBasesForExecution({ companionId, limit });
  }

  upsertDiscoveryBase(base: PersistedDiscoveryBase): PersistedDiscoveryBase {
    return this.adaptiveDiscovery.upsertBase(base);
  }

  updateDiscoveryBase(base: PersistedDiscoveryBase): PersistedDiscoveryBase {
    return this.adaptiveDiscovery.updateBase(base);
  }

  getDiscoveryBase(id: string, companionId: string): PersistedDiscoveryBase | undefined {
    return this.adaptiveDiscovery.getBase(id, companionId);
  }

  getDiscoveryBaseByLocator(
    companionId: string,
    connectorId: string,
    scope: string,
    locator: string,
  ): PersistedDiscoveryBase | undefined {
    return this.adaptiveDiscovery.getBaseByLocator(companionId, connectorId, scope, locator);
  }

  deleteDiscoveryBase(id: string, companionId: string): boolean {
    return this.adaptiveDiscovery.deleteBase(id, companionId);
  }

  insertDiscoveryBaseFeedback(
    feedback: PersistedDiscoveryBaseFeedback,
  ): PersistedDiscoveryBaseFeedback {
    return this.adaptiveDiscovery.insertBaseFeedback(feedback);
  }

  listDiscoveryBaseFeedback(
    companionId: string,
    discoveryBaseId?: string,
    limit = 100,
  ): readonly PersistedDiscoveryBaseFeedback[] {
    return this.adaptiveDiscovery.listBaseFeedback({
      companionId,
      discoveryBaseId,
      limit,
    });
  }

  loadBoundedDiscoveryContext(
    companionId: string,
    maximumItems = 40,
  ): readonly PersistedDiscoveryContextSource[] {
    return this.adaptiveDiscovery.loadBoundedDiscoveryContext({
      companionId,
      maximumItems,
    });
  }

  private runMigrations(): void {
    const migrations: Array<{ column: string; sql: string }> = [
      { column: 'animation_intent', sql: 'ALTER TABLE character_state ADD COLUMN animation_intent TEXT' },
      { column: 'life_activity', sql: "ALTER TABLE character_state ADD COLUMN life_activity TEXT NOT NULL DEFAULT 'idle'" },
      { column: 'companion_id', sql: 'ALTER TABLE memory_nodes ADD COLUMN companion_id TEXT' },
      { column: 'user_id', sql: "ALTER TABLE memory_nodes ADD COLUMN user_id TEXT DEFAULT 'local'" },
      { column: 'memory_type', sql: 'ALTER TABLE memory_nodes ADD COLUMN memory_type TEXT' },
      { column: 'metadata_json', sql: 'ALTER TABLE memory_nodes ADD COLUMN metadata_json TEXT' },
      { column: 'memory_fingerprint', sql: "ALTER TABLE memory_nodes ADD COLUMN memory_fingerprint TEXT NOT NULL DEFAULT ''" },
      { column: 'confidence', sql: 'ALTER TABLE memory_nodes ADD COLUMN confidence REAL NOT NULL DEFAULT 0.5' },
      { column: 'observation_count', sql: 'ALTER TABLE memory_nodes ADD COLUMN observation_count INTEGER NOT NULL DEFAULT 1' },
      { column: 'last_observed_at', sql: 'ALTER TABLE memory_nodes ADD COLUMN last_observed_at TEXT' },
      { column: 'memory_status', sql: "ALTER TABLE memory_nodes ADD COLUMN memory_status TEXT NOT NULL DEFAULT 'active'" },
      { column: 'canonical_key', sql: 'ALTER TABLE memory_nodes ADD COLUMN canonical_key TEXT' },
      { column: 'source_message_ids_json', sql: "ALTER TABLE memory_nodes ADD COLUMN source_message_ids_json TEXT NOT NULL DEFAULT '[]'" },
      { column: 'emotional_weight', sql: 'ALTER TABLE memory_nodes ADD COLUMN emotional_weight REAL' },
      { column: 'access_count', sql: "ALTER TABLE memory_nodes ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0" },
      { column: 'last_accessed_at', sql: 'ALTER TABLE memory_nodes ADD COLUMN last_accessed_at TEXT' },
      { column: 'session_id', sql: 'ALTER TABLE companion_messages ADD COLUMN session_id TEXT' },
      { column: 'is_builtin', sql: 'ALTER TABLE companions ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0' },
      { column: 'close_reason', sql: 'ALTER TABLE conversation_sessions ADD COLUMN close_reason TEXT' },
      { column: 'unfinished_topic', sql: 'ALTER TABLE conversation_sessions ADD COLUMN unfinished_topic TEXT' },
      { column: 'feedback_domain', sql: 'ALTER TABLE discovery_feedback ADD COLUMN feedback_domain TEXT' },
      { column: 'companion_id', sql: 'ALTER TABLE discoveries ADD COLUMN companion_id TEXT' },
      { column: 'cycle_id', sql: 'ALTER TABLE discoveries ADD COLUMN cycle_id TEXT' },
      { column: 'presentation_command_id', sql: 'ALTER TABLE discoveries ADD COLUMN presentation_command_id TEXT' },
      { column: 'eligible_at', sql: 'ALTER TABLE discoveries ADD COLUMN eligible_at TEXT' },
      { column: 'queued_at', sql: 'ALTER TABLE discoveries ADD COLUMN queued_at TEXT' },
      { column: 'presenting_at', sql: 'ALTER TABLE discoveries ADD COLUMN presenting_at TEXT' },
      { column: 'announced_at', sql: 'ALTER TABLE discoveries ADD COLUMN announced_at TEXT' },
      { column: 'updated_at', sql: 'ALTER TABLE discoveries ADD COLUMN updated_at TEXT' },
      { column: 'status_reason', sql: 'ALTER TABLE discoveries ADD COLUMN status_reason TEXT' },
      { column: 'canonical_url', sql: 'ALTER TABLE discoveries ADD COLUMN canonical_url TEXT' },
      { column: 'published_at', sql: 'ALTER TABLE discoveries ADD COLUMN published_at TEXT' },
      { column: 'fingerprint', sql: 'ALTER TABLE discoveries ADD COLUMN fingerprint TEXT' },
      { column: 'research_plan_id', sql: 'ALTER TABLE discovery_candidates ADD COLUMN research_plan_id TEXT' },
      { column: 'evidence_ids_json', sql: "ALTER TABLE discovery_candidates ADD COLUMN evidence_ids_json TEXT NOT NULL DEFAULT '[]'" },
      { column: 'research_intent_id', sql: 'ALTER TABLE exploration_cycles ADD COLUMN research_intent_id TEXT' },
      { column: 'research_plan_id', sql: 'ALTER TABLE exploration_cycles ADD COLUMN research_plan_id TEXT' }
      ,{ column: 'outcome_json', sql: "ALTER TABLE research_plans ADD COLUMN outcome_json TEXT NOT NULL DEFAULT '{}'" }
      ,{ column: 'companion_id', sql: "ALTER TABLE patterns ADD COLUMN companion_id TEXT NOT NULL DEFAULT 'default'" }
      ,{ column: 'semantic_fingerprint', sql: "ALTER TABLE patterns ADD COLUMN semantic_fingerprint TEXT NOT NULL DEFAULT ''" }
      ,{ column: 'normalized_topics_json', sql: "ALTER TABLE patterns ADD COLUMN normalized_topics_json TEXT NOT NULL DEFAULT '[]'" }
      ,{ column: 'observation_count', sql: 'ALTER TABLE patterns ADD COLUMN observation_count INTEGER NOT NULL DEFAULT 1' }
      ,{ column: 'frequency', sql: 'ALTER TABLE patterns ADD COLUMN frequency REAL NOT NULL DEFAULT 0' }
      ,{ column: 'last_observed_at', sql: "ALTER TABLE patterns ADD COLUMN last_observed_at TEXT NOT NULL DEFAULT ''" }
      ,{ column: 'topic_fingerprint', sql: "ALTER TABLE curiosity_targets ADD COLUMN topic_fingerprint TEXT NOT NULL DEFAULT ''" }
      ,{ column: 'source_fingerprint', sql: "ALTER TABLE curiosity_targets ADD COLUMN source_fingerprint TEXT NOT NULL DEFAULT ''" }
      ,{ column: 'generated_from_ids_json', sql: "ALTER TABLE curiosity_targets ADD COLUMN generated_from_ids_json TEXT NOT NULL DEFAULT '[]'" }
      ,{ column: 'status', sql: "ALTER TABLE curiosity_targets ADD COLUMN status TEXT NOT NULL DEFAULT 'open'" }
      ,{ column: 'last_generated_at', sql: 'ALTER TABLE curiosity_targets ADD COLUMN last_generated_at TEXT' }
      ,{ column: 'last_explored_at', sql: 'ALTER TABLE curiosity_targets ADD COLUMN last_explored_at TEXT' }
      ,{ column: 'cooldown_until', sql: 'ALTER TABLE curiosity_targets ADD COLUMN cooldown_until TEXT' }
      ,{ column: 'generation_count', sql: 'ALTER TABLE curiosity_targets ADD COLUMN generation_count INTEGER NOT NULL DEFAULT 1' }
      ,{ column: 'ignore_count', sql: 'ALTER TABLE curiosity_targets ADD COLUMN ignore_count INTEGER NOT NULL DEFAULT 0' }
      ,{ column: 'updated_at', sql: "ALTER TABLE curiosity_targets ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''" }
    ];
    for (const migration of migrations) {
      try {
        const table = migration.sql.match(/ALTER TABLE (\w+)/)?.[1];
        if (!table) continue;
        const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        if (!cols.some((c) => c.name === migration.column)) {
          this.db.exec(migration.sql);
        }
      } catch {
        // Column may already exist in fresh schema
      }
    }
    this.removeLegacyCharacterStateForeignKey();
    const discoveryColumns = new Set(
      (this.db.prepare('PRAGMA table_info(discoveries)').all() as Array<{ name: string }>)
        .map((column) => column.name)
    );
    const missingDiscoveryProvenance = ['canonical_url', 'published_at', 'fingerprint']
      .filter((column) => !discoveryColumns.has(column));
    if (missingDiscoveryProvenance.length > 0) {
      throw new Error(
        `discovery_provenance_migration_failed:${missingDiscoveryProvenance.join(',')}`
      );
    }
    this.ensurePendingActionsTable();
    this.ensureTopicPreferencesTable();
    this.addSearchResultIdToWebEvidence();
    this.removePersistedSearchDomains();
    this.migratePriorDiscoveryLifecycle();
    this.migratePriorConversationImportance();
    this.migratePriorBuiltinAnn();
    this.backfillMemoryFingerprints();
    this.backfillCognitiveFingerprints();
    this.removeCompanionMessagesForeignKey();
    this.backfillMemoryRetrievalData();
  }

  /**
   * Older databases tied character_state to the retired characters table.
   * Runtime character IDs now come from companions, so upgraded databases must
   * match the unconstrained character_state table in the current schema.
   */
  private removeLegacyCharacterStateForeignKey(): void {
    const foreignKeys = this.db
      .prepare('PRAGMA foreign_key_list(character_state)')
      .all() as Array<{ table: string }>;
    if (foreignKeys.length === 0) return;

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`
        CREATE TABLE character_state_without_legacy_owner (
          character_id TEXT PRIMARY KEY,
          core_state TEXT NOT NULL,
          emotion_json TEXT NOT NULL,
          intent TEXT NOT NULL,
          position_json TEXT,
          animation_intent TEXT,
          life_activity TEXT NOT NULL DEFAULT 'idle',
          last_activity_at TEXT,
          updated_at TEXT NOT NULL
        );
        INSERT INTO character_state_without_legacy_owner (
          character_id, core_state, emotion_json, intent, position_json,
          animation_intent, life_activity, last_activity_at, updated_at
        )
        SELECT
          character_id, core_state, emotion_json, intent, position_json,
          animation_intent, life_activity, last_activity_at, updated_at
        FROM character_state;
        DROP TABLE character_state;
        ALTER TABLE character_state_without_legacy_owner RENAME TO character_state;
      `);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private removeCompanionMessagesForeignKey(): void {
    const foreignKeys = this.db
      .prepare('PRAGMA foreign_key_list(companion_messages)')
      .all() as Array<{ table: string }>;
    if (foreignKeys.length === 0) return;

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`
        CREATE TABLE companion_messages_without_fk (
          id TEXT PRIMARY KEY,
          character_id TEXT NOT NULL,
          session_id TEXT,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ok',
          metadata_json TEXT,
          created_at TEXT NOT NULL
        );
        INSERT INTO companion_messages_without_fk (
          id, character_id, session_id, role, content, source, status, metadata_json, created_at
        )
        SELECT
          id, character_id, session_id, role, content, source, status, metadata_json, created_at
        FROM companion_messages;
        DROP TABLE companion_messages;
        ALTER TABLE companion_messages_without_fk RENAME TO companion_messages;
      `);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private backfillMemoryFingerprints(): void {
    const rows = this.db.prepare(
      "SELECT id, companion_id, memory_type, type, title, summary, created_at, updated_at FROM memory_nodes WHERE memory_fingerprint = ''"
    ).all() as Array<Record<string, unknown>>;
    const seen = new Set<string>();
    for (const row of rows) {
      const companionId = String(row.companion_id ?? '');
      if (!companionId) continue;
      const memoryType = String(row.memory_type || row.type);
      const summary = String(row.summary || row.title);
      const canonical = createSemanticFingerprint('memory', [companionId, memoryType, normalizeSemanticText(summary)]);
      const identity = `${companionId}:${memoryType}:${canonical}`;
      const fingerprint = seen.has(identity)
        ? createSemanticFingerprint('memory_legacy_duplicate', [canonical, String(row.id)])
        : canonical;
      seen.add(identity);
      this.db.prepare(
        `UPDATE memory_nodes
         SET memory_fingerprint = ?, last_observed_at = COALESCE(last_observed_at, updated_at, created_at)
         WHERE id = ?`
      ).run(fingerprint, String(row.id));
    }
  }

  private backfillCognitiveFingerprints(): void {
    const patternRows = this.db.prepare(
      "SELECT * FROM patterns WHERE semantic_fingerprint = '' OR last_observed_at = ''"
    ).all() as Array<Record<string, unknown>>;
    const patternGroups = new Map<string, Array<Record<string, unknown>>>();
    for (const row of patternRows) {
      const topics = JSON.parse(String(row.normalized_topics_json ?? '[]')) as string[];
      const normalizedTopics = (topics.length ? topics : [String(row.title)]).map(normalizeSemanticText).filter(Boolean).sort();
      const fingerprint = createSemanticFingerprint('pattern', [String(row.type), ...normalizedTopics]);
      const key = `${row.user_id}:${row.companion_id}:${fingerprint}`;
      const group = patternGroups.get(key) ?? [];
      group.push({ ...row, fingerprint, normalizedTopics });
      patternGroups.set(key, group);
    }
    for (const group of patternGroups.values()) {
      const [keeper, ...duplicates] = group;
      if (!keeper) continue;
      const evidence = new Map<string, unknown>();
      for (const row of group) {
        for (const item of JSON.parse(String(row.evidence_json ?? '[]')) as Array<Record<string, unknown>>) {
          evidence.set(`${item.sourceType}:${item.sourceId ?? ''}:${normalizeSemanticText(String(item.summary ?? ''))}`, item);
        }
      }
      for (const duplicate of duplicates) {
        this.db.prepare('DELETE FROM patterns WHERE id = ?').run(String(duplicate.id));
      }
      this.db.prepare(
        `UPDATE patterns SET semantic_fingerprint = ?, normalized_topics_json = ?, evidence_json = ?,
         observation_count = ?, frequency = ?, strength = ?, last_observed_at = ?, updated_at = ? WHERE id = ?`
      ).run(
        String(keeper.fingerprint),
        JSON.stringify(keeper.normalizedTopics),
        JSON.stringify([...evidence.values()]),
        group.reduce((sum, row) => sum + Number(row.observation_count ?? 1), 0),
        Math.max(...group.map((row) => Number(row.frequency ?? 0))),
        Math.max(...group.map((row) => Number(row.strength ?? 0))),
        String(keeper.last_observed_at || keeper.updated_at || keeper.created_at),
        String(keeper.updated_at || keeper.created_at),
        String(keeper.id),
      );
    }

    const curiosityRows = this.db.prepare(
      "SELECT * FROM curiosity_targets WHERE topic_fingerprint = '' OR updated_at = ''"
    ).all() as Array<Record<string, unknown>>;
    const curiosityGroups = new Map<string, Array<Record<string, unknown>>>();
    for (const row of curiosityRows) {
      const fingerprint = createSemanticFingerprint('curiosity_topic', [String(row.topic)]);
      const key = `${row.user_id}:${row.companion_id}:${fingerprint}`;
      const group = curiosityGroups.get(key) ?? [];
      group.push({ ...row, fingerprint });
      curiosityGroups.set(key, group);
    }
    for (const group of curiosityGroups.values()) {
      const [keeper, ...duplicates] = group;
      if (!keeper) continue;
      const generatedFromIds = [...new Set(group.flatMap((row) => [
        ...(JSON.parse(String(row.related_memory_ids_json ?? '[]')) as string[]),
        ...(JSON.parse(String(row.related_pattern_ids_json ?? '[]')) as string[]),
        ...(JSON.parse(String(row.related_interest_node_ids_json ?? '[]')) as string[]),
      ]))].sort();
      for (const duplicate of duplicates) {
        this.db.prepare('DELETE FROM curiosity_targets WHERE id = ?').run(String(duplicate.id));
      }
      this.db.prepare(
        `UPDATE curiosity_targets SET topic_fingerprint = ?, source_fingerprint = ?, generated_from_ids_json = ?,
         generation_count = ?, last_generated_at = ?, updated_at = ? WHERE id = ?`
      ).run(
        String(keeper.fingerprint),
        createSemanticFingerprint('curiosity_source', [String(keeper.source), ...generatedFromIds]),
        JSON.stringify(generatedFromIds),
        group.reduce((sum, row) => sum + Number(row.generation_count ?? 1), 0),
        String(keeper.last_generated_at || keeper.created_at),
        String(keeper.updated_at || keeper.created_at),
        String(keeper.id),
      );
    }
  }

  /**
   * Ensure search-result provenance survives durable research evidence rows for
   * offline review and deterministic insight tracing.
   */
  private addSearchResultIdToWebEvidence(): void {
    const columns = this.db.prepare('PRAGMA table_info(web_page_evidence)').all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === 'search_result_id')) return;
    this.db.exec("ALTER TABLE web_page_evidence ADD COLUMN search_result_id TEXT NOT NULL DEFAULT ''");
  }

  /** Result-domain lists are derived from transient provider payloads and are not durable metadata. */
  private removePersistedSearchDomains(): void {
    const columns = this.db.prepare('PRAGMA table_info(research_search_records)').all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'domains_json')) return;
    this.db.exec('ALTER TABLE research_search_records DROP COLUMN domains_json');
  }

  private ensureCompatibilityIndexes(): void {
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_companion_messages_session ON companion_messages(session_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_memory_nodes_companion ON memory_nodes(companion_id)');
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_nodes_fingerprint ON memory_nodes(companion_id, memory_type, memory_fingerprint) WHERE memory_fingerprint <> ''");
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_memory_processing_dirty ON memory_processing_state(companion_id, processed_revision, revision)');
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_identity ON patterns(user_id, companion_id, semantic_fingerprint) WHERE semantic_fingerprint <> ''");
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_curiosity_identity ON curiosity_targets(user_id, companion_id, topic_fingerprint) WHERE topic_fingerprint <> ''");
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_discoveries_status_announced ON discoveries(status, announced_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_discoveries_companion_status ON discoveries(companion_id, status)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_engine_traces_correlation ON engine_traces(correlation_id, started_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_engine_traces_cycle ON engine_traces(cycle_id, started_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_engine_traces_companion ON engine_traces(companion_id, started_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_research_intents_companion_cycle ON research_intents(companion_id, cycle_id, created_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_research_plans_companion_cycle ON research_plans(companion_id, cycle_id, created_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_research_plans_intent ON research_plans(research_intent_id, created_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_research_search_records_companion_cycle ON research_search_records(companion_id, cycle_id, created_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_research_search_records_plan ON research_search_records(research_plan_id, created_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_web_page_evidence_companion_cycle ON web_page_evidence(companion_id, cycle_id, fetched_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_web_page_evidence_plan ON web_page_evidence(research_plan_id, fetched_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_discovery_candidates_research_plan ON discovery_candidates(research_plan_id, collected_at)');
  }

  private migratePriorDiscoveryLifecycle(): void {
    const announcedIds = this.getAppSetting<string[]>(DISCOVERY_ANNOUNCED_KEY) ?? [];

    this.db.exec('BEGIN');
    try {
      this.db.prepare(
        `UPDATE discoveries
         SET status = 'candidate', updated_at = COALESCE(updated_at, created_at)
         WHERE status = 'new'`
      ).run();
      this.db.prepare(
        `UPDATE discoveries
         SET status = 'dismissed',
             announced_at = COALESCE(announced_at, shared_at, created_at),
             updated_at = COALESCE(updated_at, created_at)
         WHERE status = 'ignored'`
      ).run();
      this.db.prepare(
        `UPDATE discoveries
         SET status = 'saved',
             announced_at = COALESCE(announced_at, shared_at, created_at),
             updated_at = COALESCE(updated_at, created_at)
         WHERE status = 'journey'`
      ).run();
      this.db.prepare(
        `UPDATE discoveries
         SET status = 'announced',
             announced_at = COALESCE(announced_at, shared_at, created_at),
             updated_at = COALESCE(updated_at, created_at)
         WHERE status = 'viewed'`
      ).run();

      if (announcedIds.length > 0) {
        const markPriorAnnounced = this.db.prepare(
          `UPDATE discoveries
           SET status = CASE
             WHEN status IN ('saved', 'rejected', 'dismissed', 'archived') THEN status
             ELSE 'announced'
           END,
           announced_at = COALESCE(announced_at, shared_at, created_at),
           updated_at = COALESCE(updated_at, created_at)
           WHERE id = ?`
        );
        for (const id of announcedIds) markPriorAnnounced.run(id);
      }

      this.db.prepare(
        `UPDATE discoveries
         SET status = 'eligible',
             eligible_at = COALESCE(eligible_at, shared_at, created_at),
             updated_at = COALESCE(updated_at, created_at)
         WHERE status = 'shared' AND announced_at IS NULL`
      ).run();
      this.db.prepare(
        `UPDATE discoveries
         SET updated_at = COALESCE(updated_at, created_at),
             eligible_at = CASE
               WHEN status IN ('eligible', 'queued', 'presenting', 'announced', 'saved', 'rejected', 'dismissed')
                 THEN COALESCE(eligible_at, created_at)
               ELSE eligible_at
             END
         WHERE updated_at IS NULL OR (
           eligible_at IS NULL AND status IN ('eligible', 'queued', 'presenting', 'announced', 'saved', 'rejected', 'dismissed')
         )`
      ).run();
      this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(DISCOVERY_ANNOUNCED_KEY);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private migratePriorConversationImportance(): void {
    this.db.prepare(
      `UPDATE memory_nodes
       SET importance_score = importance_score * 100
       WHERE source = 'conversation'
         AND importance_score > 0
         AND importance_score <= 1`
    ).run();
  }

  private ensureTopicPreferencesTable(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS user_topic_preferences (
      user_id TEXT NOT NULL, topic_key TEXT NOT NULL, interest_score REAL NOT NULL DEFAULT 0,
      positive_count INTEGER NOT NULL DEFAULT 0, negative_count INTEGER NOT NULL DEFAULT 0,
      last_feedback_at TEXT NOT NULL, PRIMARY KEY (user_id, topic_key)
    )`);
  }

  recordTopicPreference(userId: string, topicKey: string, positive: boolean): UserTopicPreference {
    const current = this.db.prepare('SELECT * FROM user_topic_preferences WHERE user_id = ? AND topic_key = ?').get(userId, topicKey) as Record<string, unknown> | undefined;
    const next = {
      interestScore: Number(current?.interest_score ?? 0) + (positive ? 1 : -1),
      positiveCount: Number(current?.positive_count ?? 0) + (positive ? 1 : 0),
      negativeCount: Number(current?.negative_count ?? 0) + (positive ? 0 : 1),
      lastFeedbackAt: nowIso()
    };
    this.db.prepare(`INSERT INTO user_topic_preferences (user_id, topic_key, interest_score, positive_count, negative_count, last_feedback_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, topic_key) DO UPDATE SET interest_score = excluded.interest_score, positive_count = excluded.positive_count, negative_count = excluded.negative_count, last_feedback_at = excluded.last_feedback_at`)
      .run(userId, topicKey, next.interestScore, next.positiveCount, next.negativeCount, next.lastFeedbackAt);
    return { userId, topicKey, ...next };
  }

  listTopicPreferences(userId = 'local'): UserTopicPreference[] {
    return (this.db.prepare('SELECT * FROM user_topic_preferences WHERE user_id = ? ORDER BY last_feedback_at DESC').all(userId) as Array<Record<string, unknown>>).map((row) => ({
      userId: String(row.user_id), topicKey: String(row.topic_key), interestScore: Number(row.interest_score), positiveCount: Number(row.positive_count), negativeCount: Number(row.negative_count), lastFeedbackAt: String(row.last_feedback_at)
    }));
  }

  private ensurePendingActionsTable(): void {
    const row = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_companion_actions'")
      .get();
    if (row) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_companion_actions (
        id TEXT PRIMARY KEY,
        companion_id TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT 'local',
        decision_json TEXT NOT NULL,
        discovery_id TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        defer_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_pending_actions_companion ON pending_companion_actions(companion_id, status);
    `);
  }

  /**
   * Removes only the untouched prior built-in profile. Any Ann record with user
   * data or customization is retained as a normal user Companion; no user data
   * is ever deleted by this migration.
   */
  private migratePriorBuiltinAnn(): void {
    const ann = this.db.prepare('SELECT * FROM companions WHERE id = ? AND is_builtin = 1').get('ann') as Record<string, unknown> | undefined;
    if (!ann) return;
    if (this.shouldDeleteUntouchedPriorAnn(ann)) {
      this.db.prepare('DELETE FROM companions WHERE id = ?').run('ann');
      return;
    }
    this.db.prepare('UPDATE companions SET is_builtin = 0 WHERE id = ?').run('ann');
  }

  private shouldDeleteUntouchedPriorAnn(ann: Record<string, unknown>): boolean {
    const isOriginalProfile = ann.id === 'ann' &&
      ann.is_builtin === 1 &&
      ann.name === 'Ann' &&
      ann.personality_description === 'A curious, warm desktop companion.' &&
      ann.personality_json === '{}' &&
      ann.asset_root === 'assets/companions/ann';
    if (!isOriginalProfile) return false;

    try {
      if (this.priorAnnHasCustomAssets()) return false;
      if (this.hasPriorAnnOwnedRecords()) return false;
      if (this.hasMeaningfulApplicationActivity()) return false;
      return true;
    } catch {
      return false;
    }
  }

  private hasPriorAnnOwnedRecords(): boolean {
    const identityColumns = new Set(['companion_id', 'character_id', 'from_companion_id', 'to_companion_id']);
    for (const table of this.listUserTables()) {
      const columns = this.db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as Array<{ name: string }>;
      for (const column of columns) {
        if (!identityColumns.has(column.name)) continue;
        const row = this.db.prepare(`SELECT 1 FROM ${quoteIdent(table)} WHERE ${quoteIdent(column.name)} = ? LIMIT 1`).get('ann');
        if (row) return true;
      }
    }
    return false;
  }

  private hasMeaningfulApplicationActivity(): boolean {
    const ignored = new Set(['companions', 'sqlite_sequence']);
    for (const table of this.listUserTables()) {
      if (ignored.has(table)) continue;
      const row = this.db.prepare(`SELECT 1 FROM ${quoteIdent(table)} LIMIT 1`).get();
      if (row) return true;
    }
    return false;
  }

  private listUserTables(): string[] {
    return (this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>)
      .map((row) => String(row.name));
  }

  tryResolveActiveCompanionId(): string | null {
    return this.getPrimaryCompanion()?.id ?? null;
  }

  /** Single source of truth for active companion ID in production paths. */
  resolveActiveCompanionId(characterId?: string): string {
    if (characterId) {
      if (!this.getCompanion(characterId)) throw new Error(`Companion not found: ${characterId}`);
      return characterId;
    }
    const active = this.tryResolveActiveCompanionId();
    if (!active) throw new Error('NO_ACTIVE_COMPANION: No active Companion. Complete Companion creation first.');
    return active;
  }

  close(): void {
    this.db.close();
  }

  /** Main-process-only escape hatch used by the VectorIndex abstraction. */
  getExtensionDatabase(): SqliteDatabase {
    return this.db;
  }

  /** Main-process services register these hooks; database code remains renderer-agnostic. */
  setEmbeddingJobNotifier(notifier: (() => void) | undefined): void { this.embeddingJobNotifier = notifier; }
  setVectorDeletionHandler(handler: ((memoryId: string) => void) | undefined): void { this.vectorDeletionHandler = handler; }

  // ─── Developer Debug Events ────────────────────────────────────────────────

  insertDeveloperDebugEvent(event: import('@our-companion/shared').DeveloperDebugEvent): import('@our-companion/shared').DeveloperDebugEvent {
    this.db.prepare(
      `INSERT INTO developer_debug_events
       (id, kind, operation, status, provider, model, user_id, device_id, companion_id,
        correlation_id, cycle_id, turn_id, summary, payload_json, error_code, error_message,
        created_at, sync_status, sync_attempt_count, last_sync_attempt_at, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      event.id, event.kind, event.operation ?? null, event.status ?? null,
      event.provider ?? null, event.model ?? null, null, null,
      event.companionId ?? null, event.correlationId ?? null,
      event.cycleId ?? null, event.turnId ?? null, event.summary ?? null,
      event.payload ? JSON.stringify(event.payload) : null,
      event.errorCode ?? null, event.errorMessage ?? null,
      event.createdAt, event.syncStatus, event.syncAttemptCount,
      event.lastSyncAttemptAt ?? null, event.uploadedAt ?? null
    );
    return event;
  }

  listDeveloperDebugEvents(options?: DeveloperDebugEventQuery): import('@our-companion/shared').DeveloperDebugEvent[] {
    const limit = Math.min(options?.limit ?? 100, 500);
    const offset = options?.offset ?? 0;
    const { where, params } = this.buildDeveloperDebugEventWhere(options);
    const sql = `SELECT * FROM developer_debug_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    return (this.db.prepare(sql).all(...params, limit, offset) as Array<Record<string, unknown>>).map(mapDeveloperDebugEvent);
  }

  getDeveloperDebugEvent(id: string): import('@our-companion/shared').DeveloperDebugEvent | undefined {
    const row = this.db.prepare('SELECT * FROM developer_debug_events WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapDeveloperDebugEvent(row) : undefined;
  }

  markDeveloperDebugEventsUploading(ids: string[]): void {
    const stmt = this.db.prepare(
      "UPDATE developer_debug_events SET sync_status = 'uploading', sync_attempt_count = sync_attempt_count + 1, last_sync_attempt_at = ? WHERE id = ?"
    );
    const at = nowIso();
    for (const id of ids) stmt.run(at, id);
  }

  markDeveloperDebugEventsUploaded(ids: string[]): void {
    const stmt = this.db.prepare(
      "UPDATE developer_debug_events SET sync_status = 'uploaded', uploaded_at = ? WHERE id = ?"
    );
    const at = nowIso();
    for (const id of ids) stmt.run(at, id);
  }

  markDeveloperDebugEventsPending(ids: string[]): void {
    const stmt = this.db.prepare(
      "UPDATE developer_debug_events SET sync_status = 'pending' WHERE id = ?"
    );
    for (const id of ids) stmt.run(id);
  }

  resetUploadingDeveloperDebugEventsToPending(): number {
    const stmt = this.db.prepare(
      `UPDATE developer_debug_events SET sync_status = 'pending', sync_attempt_count = 0 WHERE sync_status = 'uploading'`
    );
    const result = stmt.run();
    return Number(result.changes);
  }

  pruneDeveloperDebugEvents(olderThanDays = 14): number {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.prepare('DELETE FROM developer_debug_events WHERE created_at < ?').run(cutoff);
    return Number(result.changes);
  }

  countDeveloperDebugEvents(options?: DeveloperDebugEventQuery): number {
    const { where, params } = this.buildDeveloperDebugEventWhere(options);
    const sql = `SELECT COUNT(*) as count FROM developer_debug_events ${where}`;
    const row = this.db.prepare(sql).get(...params) as { count: number };
    return row.count;
  }

  private buildDeveloperDebugEventWhere(options?: DeveloperDebugEventQuery): { where: string; params: (string | number)[] } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options?.kinds?.length) {
      const placeholders = options.kinds.map(() => '?').join(',');
      conditions.push(`kind IN (${placeholders})`);
      params.push(...options.kinds);
    }
    if (options?.operation) {
      conditions.push(`operation LIKE ?`);
      params.push(`%${options.operation}%`);
    }
    if (options?.status) {
      conditions.push(`status = ?`);
      params.push(options.status);
    }
    if (options?.provider) {
      conditions.push(`provider LIKE ?`);
      params.push(`%${options.provider}%`);
    }
    if (options?.cycleId) {
      conditions.push(`cycle_id LIKE ?`);
      params.push(`%${options.cycleId}%`);
    }
    if (options?.correlationId) {
      conditions.push(`correlation_id LIKE ?`);
      params.push(`%${options.correlationId}%`);
    }
    if (options?.turnId) {
      conditions.push(`turn_id LIKE ?`);
      params.push(`%${options.turnId}%`);
    }
    if (options?.syncStatus) {
      conditions.push(`sync_status = ?`);
      params.push(options.syncStatus);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }

  getCharacterState(characterId?: string): CharacterRuntimeState {
    const id = this.resolveActiveCompanionId(characterId);
    const row = this.db
      .prepare('SELECT * FROM character_state WHERE character_id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return createInitialCharacterStateLocal(id);
    return {
      characterId: String(row.character_id),
      coreState: row.core_state as CharacterRuntimeState['coreState'],
      emotion: JSON.parse(String(row.emotion_json)),
      intent: row.intent as CharacterRuntimeState['intent'],
      position: row.position_json ? JSON.parse(String(row.position_json)) : undefined,
      animationIntent: row.animation_intent ? String(row.animation_intent) : undefined,
      lifeActivity: (row.life_activity as CharacterRuntimeState['lifeActivity']) ?? 'idle',
      lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : undefined,
      updatedAt: String(row.updated_at)
    };
  }

  saveCharacterState(state: CharacterRuntimeState): CharacterRuntimeState {
    this.db
      .prepare(
        `INSERT INTO character_state
         (character_id, core_state, emotion_json, intent, position_json, animation_intent, life_activity, last_activity_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(character_id) DO UPDATE SET
           core_state = excluded.core_state,
           emotion_json = excluded.emotion_json,
           intent = excluded.intent,
           position_json = excluded.position_json,
           animation_intent = excluded.animation_intent,
           life_activity = excluded.life_activity,
           last_activity_at = excluded.last_activity_at,
           updated_at = excluded.updated_at`
      )
      .run(
        state.characterId,
        state.coreState,
        JSON.stringify(state.emotion),
        state.intent,
        state.position ? JSON.stringify(state.position) : null,
        state.animationIntent ?? null,
        state.lifeActivity ?? 'idle',
        state.lastActivityAt ?? null,
        state.updatedAt ?? nowIso()
      );
    return state;
  }

  getActiveCharacters(): CharacterProfile[] {
    return this.listCompanions().slice(0, 3).map((companion) => ({
      id: companion.id,
      name: companion.name,
      packageId: companion.assetRoot,
      isPrimary: companion.isPrimary,
      isActive: true,
      corePersonality: companion.personalityDescription ? [companion.personalityDescription] : [],
      expertise: [],
      speakingStyle: { tone: 'warm', length: 'concise', avoid: [] }
    }));
  }

  getCharacterBehaviorRules(characterId?: string): Record<string, unknown> {
    const stored = this.getAppSetting<Record<string, unknown>>(`companion.behavior.${this.resolveActiveCompanionId(characterId)}`);
    return stored ?? { discovery: 35, movement: 'normal' };
  }

  setPrimaryCharacter(characterId: string): CharacterProfile {
    const companion = this.setPrimaryCompanion(characterId);
    return {
      id: companion.id,
      name: companion.name,
      packageId: companion.assetRoot,
      isPrimary: true,
      isActive: true,
      corePersonality: companion.personalityDescription ? [companion.personalityDescription] : [],
      expertise: [],
      speakingStyle: { tone: 'warm', length: 'concise', avoid: [] }
    };
  }

  // ─── Companion CRUD ──────────────────────────────────────────────────────

  createCompanion(input: CreateCompanionInput): CompanionProfile {
    const id = createId('companion');
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO companions (id, name, personality_description, personality_json, asset_root, is_primary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(id, input.name, input.personalityDescription, JSON.stringify(input.personality), input.assetRoot, timestamp, timestamp);
    return this.getCompanion(id)!;
  }

  getCompanion(id: string): CompanionProfile | null {
    const row = this.db
      .prepare('SELECT * FROM companions WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return mapCompanionProfile(row);
  }

  listCompanions(): CompanionProfile[] {
    const rows = this.db
      .prepare('SELECT * FROM companions ORDER BY is_primary DESC, created_at ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map(mapCompanionProfile);
  }

  updateCompanion(id: string, input: UpdateCompanionInput): CompanionProfile {
    const existing = this.getCompanion(id);
    if (!existing) throw new Error(`Companion not found: ${id}`);
    const timestamp = nowIso();
    const name = input.name ?? existing.name;
    const personalityDescription = input.personalityDescription ?? existing.personalityDescription;
    const personality = input.personality ?? existing.personality;
    const assetRoot = input.assetRoot ?? existing.assetRoot;
    this.db
      .prepare(
        `UPDATE companions SET name = ?, personality_description = ?, personality_json = ?, asset_root = ?, updated_at = ? WHERE id = ?`
      )
      .run(name, personalityDescription, JSON.stringify(personality), assetRoot, timestamp, id);
    return this.getCompanion(id)!;
  }

  getNetworkCompanionLink(serverOrigin: string, networkAccountId: string, localCompanionId: string): NetworkCompanionLink | undefined {
    const row = this.db.prepare('SELECT * FROM network_companion_links WHERE server_origin = ? AND network_account_id = ? AND local_companion_id = ?').get(serverOrigin, networkAccountId, localCompanionId) as Record<string, unknown> | undefined;
    return row ? mapNetworkCompanionLink(row) : undefined;
  }

  getNetworkCompanionLinkByNetworkId(serverOrigin: string, networkAccountId: string, networkCompanionId: string): NetworkCompanionLink | undefined {
    const row = this.db.prepare('SELECT * FROM network_companion_links WHERE server_origin = ? AND network_account_id = ? AND network_companion_id = ?').get(serverOrigin, networkAccountId, networkCompanionId) as Record<string, unknown> | undefined;
    return row ? mapNetworkCompanionLink(row) : undefined;
  }

  upsertNetworkCompanionLink(link: NetworkCompanionLink): NetworkCompanionLink {
    const timestamp = nowIso();
    this.db.prepare(`INSERT INTO network_companion_links (server_origin, network_account_id, local_companion_id, network_companion_id, active_asset_pack_id, last_manifest_hash, last_published_at, publish_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_origin, network_account_id, local_companion_id) DO UPDATE SET network_companion_id = excluded.network_companion_id, active_asset_pack_id = excluded.active_asset_pack_id, last_manifest_hash = excluded.last_manifest_hash, last_published_at = excluded.last_published_at, publish_status = excluded.publish_status, updated_at = excluded.updated_at`)
      .run(link.serverOrigin, link.networkAccountId, link.localCompanionId, link.networkCompanionId, link.activeAssetPackId ?? null, link.lastPublishedManifestHash ?? null, link.lastPublishedAt ?? null, link.publishStatus ?? null, timestamp, timestamp);
    return this.getNetworkCompanionLink(link.serverOrigin, link.networkAccountId, link.localCompanionId)!;
  }

  getCachedNetworkAssetPack(serverOrigin: string, assetPackId: string): CachedAssetPack | undefined {
    const row = this.db.prepare('SELECT * FROM network_asset_cache WHERE server_origin = ? AND asset_pack_id = ?').get(serverOrigin, assetPackId) as Record<string, unknown> | undefined;
    return row ? mapCachedNetworkAssetPack(row) : undefined;
  }

  upsertCachedNetworkAssetPack(cache: CachedAssetPack & { cacheRoot: string }): CachedAssetPack & { cacheRoot: string } {
    this.db.prepare(`INSERT INTO network_asset_cache (server_origin, asset_pack_id, network_companion_id, manifest_hash, cache_root, total_bytes, downloaded_at, last_used_at, pinned, verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_origin, asset_pack_id) DO UPDATE SET network_companion_id = excluded.network_companion_id, manifest_hash = excluded.manifest_hash, cache_root = excluded.cache_root, total_bytes = excluded.total_bytes, downloaded_at = excluded.downloaded_at, last_used_at = excluded.last_used_at, pinned = excluded.pinned, verified = excluded.verified`)
      .run(cache.serverOrigin, cache.assetPackId, cache.networkCompanionId, cache.manifestHash, cache.cacheRoot, cache.totalBytes, cache.downloadedAt, cache.lastUsedAt, cache.pinned ? 1 : 0, cache.verified ? 1 : 0);
    return this.getCachedNetworkAssetPackWithRoot(cache.serverOrigin, cache.assetPackId)!;
  }

  getCachedNetworkAssetPackWithRoot(serverOrigin: string, assetPackId: string): (CachedAssetPack & { cacheRoot: string }) | undefined {
    const row = this.db.prepare('SELECT * FROM network_asset_cache WHERE server_origin = ? AND asset_pack_id = ?').get(serverOrigin, assetPackId) as Record<string, unknown> | undefined;
    return row ? mapCachedNetworkAssetPack(row) : undefined;
  }

  listCachedNetworkAssetPacks(): Array<CachedAssetPack & { cacheRoot: string }> {
    return (this.db.prepare('SELECT * FROM network_asset_cache ORDER BY last_used_at ASC').all() as Array<Record<string, unknown>>).map(mapCachedNetworkAssetPack);
  }

  deleteCachedNetworkAssetPack(serverOrigin: string, assetPackId: string): void { this.db.prepare('DELETE FROM network_asset_cache WHERE server_origin = ? AND asset_pack_id = ?').run(serverOrigin, assetPackId); }

  deleteCompanion(id: string): { id: string; deleted: true } {
    if (this.listCompanions().length <= 1) {
      throw new Error('Create another Companion before deleting your only Companion.');
    }
    this.db.prepare('DELETE FROM companions WHERE id = ?').run(id);
    return { id, deleted: true };
  }

  setPrimaryCompanion(id: string): CompanionProfile {
    if (!this.getCompanion(id)) throw new Error(`Companion not found: ${id}`);
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE companions SET is_primary = 0').run();
      this.db.prepare('UPDATE companions SET is_primary = 1 WHERE id = ?').run(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.getCompanion(id)!;
  }

  getPrimaryCompanion(): CompanionProfile | null {
    const row = this.db
      .prepare('SELECT * FROM companions WHERE is_primary = 1 LIMIT 1')
      .get() as Record<string, unknown> | undefined;
    if (!row) return null;
    return mapCompanionProfile(row);
  }

  insertMemoryNode(node: MemoryNode): MemoryNode {
    if (!node.companionId) {
      throw new Error('Memory companion ownership is required.');
    }
    this.db
      .prepare(
        `INSERT INTO memory_nodes
         (id, type, title, summary, content, importance_score, source, source_url, is_pinned, is_marked_wrong,
          companion_id, user_id, memory_type, metadata_json, memory_fingerprint, confidence, observation_count,
          last_observed_at, memory_status, canonical_key, source_message_ids_json, emotional_weight, access_count,
          last_accessed_at, created_at, updated_at, compressed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        node.id,
        node.type,
        node.title,
        node.summary ?? null,
        node.content ?? null,
        unitToScore100(node.importance),
        node.source ?? null,
        node.sourceUrl ?? null,
        node.isPinned ? 1 : 0,
        node.isMarkedWrong ? 1 : 0,
        node.companionId ?? null,
        node.userId ?? 'local',
        node.memoryType ?? null,
        node.metadata ? JSON.stringify(node.metadata) : null,
        node.fingerprint ?? '',
        node.confidence ?? node.metadata?.confidence ?? 0.5,
        node.observationCount ?? 1,
        node.lastObservedAt ?? node.updatedAt,
        node.status ?? (node.isMarkedWrong ? 'superseded' : 'active'),
        node.canonicalKey ?? null,
        JSON.stringify(node.sourceMessageIds ?? node.metadata?.sourceMessageIds ?? []),
        node.emotionalWeight ?? null,
        node.accessCount ?? 0,
        node.lastAccessedAt ?? null,
        node.createdAt,
        node.updatedAt,
        node.compressedAt ?? null
    );
    this.markMemoryDirty(node);
    this.syncMemoryFts(node);
    this.queueEmbeddingForMemory(node);
    return node;
  }

  updateMemoryNode(node: MemoryNode): MemoryNode {
    if (!node.companionId) {
      throw new Error('Memory companion ownership is required.');
    }
    this.db
      .prepare(
        `UPDATE memory_nodes SET
          type = ?, title = ?, summary = ?, content = ?, importance_score = ?, source = ?, source_url = ?,
          is_pinned = ?, is_marked_wrong = ?, companion_id = ?, user_id = ?, memory_type = ?, metadata_json = ?,
          memory_fingerprint = ?, confidence = ?, observation_count = ?, last_observed_at = ?,
          memory_status = ?, canonical_key = ?, source_message_ids_json = ?, emotional_weight = ?, access_count = ?,
          last_accessed_at = ?, updated_at = ?, compressed_at = ?
         WHERE id = ?`
      )
      .run(
        node.type,
        node.title,
        node.summary ?? null,
        node.content ?? null,
        unitToScore100(node.importance),
        node.source ?? null,
        node.sourceUrl ?? null,
        node.isPinned ? 1 : 0,
        node.isMarkedWrong ? 1 : 0,
        node.companionId ?? null,
        node.userId ?? 'local',
        node.memoryType ?? null,
        node.metadata ? JSON.stringify(node.metadata) : null,
        node.fingerprint ?? '',
        node.confidence ?? node.metadata?.confidence ?? 0.5,
        node.observationCount ?? 1,
        node.lastObservedAt ?? node.updatedAt,
        node.status ?? (node.isMarkedWrong ? 'superseded' : 'active'),
        node.canonicalKey ?? null,
        JSON.stringify(node.sourceMessageIds ?? node.metadata?.sourceMessageIds ?? []),
        node.emotionalWeight ?? null,
        node.accessCount ?? 0,
        node.lastAccessedAt ?? null,
        node.updatedAt,
        node.compressedAt ?? null,
        node.id
    );
    this.markMemoryDirty(node);
    this.syncMemoryFts(node);
    this.queueEmbeddingForMemory(node);
    return node;
  }

  deleteMemoryNode(id: string): void {
    if (!this.getMemoryNode(id)) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // The handler removes the vec0 row synchronously while the authoritative
      // mapping still exists. The relational derived records then disappear in
      // the same transaction, so no delete job can outlive its parent memory.
      this.vectorDeletionHandler?.(id);
      this.db.prepare('DELETE FROM memory_embeddings WHERE memory_id = ?').run(id);
      this.db.prepare('DELETE FROM embedding_jobs WHERE memory_id = ?').run(id);
      this.db.prepare('DELETE FROM memory_fts WHERE memory_id = ?').run(id);
      this.db.prepare('DELETE FROM memory_edges WHERE from_node_id = ? OR to_node_id = ?').run(id, id);
      this.db.prepare('DELETE FROM memory_processing_state WHERE memory_id = ?').run(id);
      this.db.prepare('DELETE FROM memory_nodes WHERE id = ?').run(id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  getMemoryNode(id: string, companionId?: string): MemoryNode | undefined {
    const row = companionId
      ? this.db.prepare('SELECT * FROM memory_nodes WHERE id = ? AND companion_id = ?').get(id, companionId)
      : this.db.prepare('SELECT * FROM memory_nodes WHERE id = ?').get(id);
    return row ? mapMemoryNode(row) : undefined;
  }

  listMemoryNodes(companionId?: string): MemoryNode[] {
    if (companionId) {
      return (this.db.prepare('SELECT * FROM memory_nodes WHERE companion_id = ? ORDER BY updated_at DESC').all(companionId) as Array<Record<string, unknown>>).map(mapMemoryNode);
    }
    return (this.db.prepare('SELECT * FROM memory_nodes ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>).map(
      mapMemoryNode
    );
  }

  listMemoryContextCandidates(companionId: string, limit = 80, userId = 'local'): MemoryNode[] {
    return (this.db.prepare(
      `SELECT * FROM memory_nodes
       WHERE companion_id = ? AND user_id = ? AND COALESCE(memory_status, 'active') = 'active' AND is_marked_wrong = 0
       ORDER BY is_pinned DESC, is_marked_wrong ASC, importance_score DESC, updated_at DESC
       LIMIT ?`
    ).all(companionId, userId, Math.max(1, limit)) as Array<Record<string, unknown>>).map(mapMemoryNode);
  }

  searchMemoryFts(input: { query: string; companionId: string; userId: string; limit?: number }): Array<{ memory: MemoryNode; rank: number; keywordScore: number }> {
    const tokens = input.query.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 12) ?? [];
    if (tokens.length === 0) return [];
    const expression = tokens.map((token) => `"${token.replace(/"/g, '')}"`).join(' OR ');
    try {
      const rows = this.db.prepare(`SELECT memories.*, bm25(memory_fts) AS fts_rank FROM memory_fts fts
        JOIN memory_nodes memories ON memories.id = fts.memory_id
        WHERE memory_fts MATCH ? AND fts.companion_id = ? AND fts.user_id = ?
          AND COALESCE(memories.memory_status, 'active') = 'active' AND memories.is_marked_wrong = 0
        ORDER BY bm25(memory_fts) LIMIT ?`)
        .all(expression, input.companionId, input.userId, Math.max(1, input.limit ?? 12)) as Array<Record<string, unknown>>;
      return rows.map((row) => {
        const rank = Number(row.fts_rank);
        // sqlite FTS5 BM25 is lower (normally more negative) for a stronger
        // hit. Preserve the gradient instead of flattening every hit to 1.
        return { memory: mapMemoryNode(row), rank, keywordScore: Math.abs(rank) / (1 + Math.abs(rank)) };
      });
    } catch {
      return [];
    }
  }

  getMemoryNodesByIds(input: { memoryIds: string[]; userId: string; companionId: string }): MemoryNode[] {
    const ids = [...new Set(input.memoryIds)].filter(Boolean);
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    return (this.db.prepare(`SELECT * FROM memory_nodes WHERE id IN (${placeholders}) AND user_id = ? AND companion_id = ?`)
      .all(...ids, input.userId, input.companionId) as Array<Record<string, unknown>>).map(mapMemoryNode);
  }

  listCognitionMemoryCandidates(companionId: string, focusMemoryId?: string, limit = 30): MemoryNode[] {
    return (this.db.prepare(
      `SELECT memory_nodes.* FROM memory_nodes
       LEFT JOIN memory_processing_state processing ON processing.memory_id = memory_nodes.id
       WHERE memory_nodes.companion_id = ? AND memory_nodes.is_marked_wrong = 0
       ORDER BY CASE WHEN memory_nodes.id = ? THEN 0
                     WHEN COALESCE(processing.processed_revision, 0) < COALESCE(processing.revision, 0) THEN 1
                     WHEN memory_nodes.is_pinned = 1 THEN 2 ELSE 3 END,
                memory_nodes.importance_score DESC, memory_nodes.updated_at DESC
       LIMIT ?`
    ).all(companionId, focusMemoryId ?? '', Math.max(1, limit)) as Array<Record<string, unknown>>).map(mapMemoryNode);
  }

  getMemoryByFingerprint(
    companionId: string,
    memoryType: NonNullable<MemoryNode['memoryType']>,
    fingerprint: string,
  ): MemoryNode | undefined {
    const row = this.db.prepare(
      'SELECT * FROM memory_nodes WHERE companion_id = ? AND memory_type = ? AND memory_fingerprint = ?'
    ).get(companionId, memoryType, fingerprint) as Record<string, unknown> | undefined;
    return row ? mapMemoryNode(row) : undefined;
  }

  upsertCapturedMemory(node: MemoryNode): { record: MemoryNode; outcome: 'created' | 'updated' | 'observed'; previous?: MemoryNode } {
    if (!node.companionId || !node.memoryType || !node.fingerprint) {
      throw new Error('Captured Memory requires companion, type, and fingerprint.');
    }
    this.db.exec('BEGIN');
    try {
      const existing = this.getMemoryByFingerprint(node.companionId, node.memoryType, node.fingerprint);
      if (!existing) {
        const record = this.insertMemoryNode(node);
        this.db.exec('COMMIT');
        return { record, outcome: 'created' };
      }
      const stronger = (node.confidence ?? 0) > (existing.confidence ?? existing.metadata?.confidence ?? 0)
        || node.importance > existing.importance
        || (node.summary?.length ?? 0) > (existing.summary?.length ?? 0);
      const next: MemoryNode = {
        ...existing,
        ...(stronger ? {
          title: node.title,
          summary: node.summary,
          content: node.content,
          importance: Math.max(existing.importance, node.importance),
          confidence: Math.max(existing.confidence ?? 0, node.confidence ?? 0),
          metadata: node.metadata ? {
            ...node.metadata,
            ...existing.metadata,
            ...node.metadata,
            createdAt: existing.metadata?.createdAt ?? node.metadata.createdAt,
          } : existing.metadata,
        } : {}),
        observationCount: (existing.observationCount ?? 1) + 1,
        lastObservedAt: node.lastObservedAt ?? node.updatedAt,
        updatedAt: node.updatedAt,
      };
      if (stronger) this.updateMemoryNode(next);
      else {
        this.db.prepare(
          'UPDATE memory_nodes SET observation_count = ?, last_observed_at = ?, updated_at = ? WHERE id = ?'
        ).run(next.observationCount ?? 1, next.lastObservedAt ?? next.updatedAt, next.updatedAt, next.id);
      }
      this.db.exec('COMMIT');
      return { record: next, outcome: stronger ? 'updated' : 'observed', previous: existing };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getMemoryProcessingState(memoryId: string): MemoryProcessingState | undefined {
    const row = this.db.prepare('SELECT * FROM memory_processing_state WHERE memory_id = ?')
      .get(memoryId) as Record<string, unknown> | undefined;
    return row ? mapMemoryProcessingState(row) : undefined;
  }

  listDirtyMemoryProcessing(companionId: string, limit = 30): MemoryProcessingState[] {
    return (this.db.prepare(
      `SELECT * FROM memory_processing_state
       WHERE companion_id = ? AND processed_revision < revision
       ORDER BY revision DESC LIMIT ?`
    ).all(companionId, Math.max(1, limit)) as Array<Record<string, unknown>>).map(mapMemoryProcessingState);
  }

  listCognitiveUserIds(companionId: string, fallbackUserId = 'default'): string[] {
    const rows = this.db.prepare(
      `SELECT user_id FROM memory_nodes WHERE companion_id = ?
       UNION SELECT user_id FROM patterns WHERE companion_id = ?
       UNION SELECT user_id FROM curiosity_targets WHERE companion_id = ?`
    ).all(companionId, companionId, companionId) as Array<{ user_id: string | null }>;
    const interestScopeSuffix = `:${companionId}`;
    const interestUserIds = (this.db.prepare(
      'SELECT DISTINCT user_id FROM interest_nodes WHERE user_id LIKE ?'
    ).all(`%${interestScopeSuffix}`) as Array<{ user_id: string | null }>)
      .map((row) => String(row.user_id ?? ''))
      .filter((scopeId) => scopeId.endsWith(interestScopeSuffix))
      .map((scopeId) => scopeId.slice(0, -interestScopeSuffix.length))
      .filter(Boolean);
    return [...new Set([
      fallbackUserId,
      ...rows.map((row) => String(row.user_id ?? '')).filter(Boolean),
      ...interestUserIds,
    ])];
  }

  markMemoriesProcessed(memoryIds: string[], processedAt = nowIso()): void {
    const statement = this.db.prepare(
      `UPDATE memory_processing_state
       SET processed_revision = revision, processed_at = ?
       WHERE memory_id = ? AND deleted_at IS NULL`
    );
    for (const memoryId of new Set(memoryIds)) statement.run(processedAt, memoryId);
  }

  markDeletedMemoriesProcessed(memoryIds: string[], processedAt = nowIso()): void {
    const statement = this.db.prepare(
      `UPDATE memory_processing_state
       SET processed_revision = revision, processed_at = ?
       WHERE memory_id = ? AND deleted_at IS NOT NULL`
    );
    for (const memoryId of new Set(memoryIds)) statement.run(processedAt, memoryId);
  }

  private markMemoryDirty(node: MemoryNode, deleted = false): void {
    if (!node.companionId) return;
    const contentHash = createSemanticFingerprint('memory_content', [
      node.type,
      node.memoryType ?? '',
      normalizeSemanticText(node.title),
      normalizeSemanticText(node.summary ?? ''),
      normalizeSemanticText(node.content ?? ''),
      String(Boolean(node.isPinned)),
      String(Boolean(node.isMarkedWrong)),
    ]);
    const existing = this.getMemoryProcessingState(node.id);
    const changed = !existing || existing.contentHash !== contentHash || Boolean(existing.deletedAt) !== deleted;
    const revision = existing ? existing.revision + (changed ? 1 : 0) : 1;
    this.db.prepare(
      `INSERT INTO memory_processing_state
       (memory_id, companion_id, content_hash, revision, processed_revision, processed_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(memory_id) DO UPDATE SET
         companion_id = excluded.companion_id,
         content_hash = excluded.content_hash,
         revision = excluded.revision,
         deleted_at = excluded.deleted_at`
    ).run(
      node.id,
      node.companionId,
      contentHash,
      revision,
      existing?.processedRevision ?? 0,
      existing?.processedAt ?? null,
      deleted ? nowIso() : null,
    );
  }

  private isEmbeddingEligible(node: MemoryNode): boolean {
    if (node.isMarkedWrong || node.status === 'archived' || node.status === 'superseded') return false;
    if (node.metadata?.sourceType === 'system' || node.memoryType === 'temporary_context') return false;
    return ['user_preference', 'user_fact', 'user_boundary', 'goal', 'shared_experience', 'relationship_memory', 'conversation_episode']
      .includes(node.memoryType ?? '');
  }

  private syncMemoryFts(node: MemoryNode): void {
    this.db.prepare('DELETE FROM memory_fts WHERE memory_id = ?').run(node.id);
    if (node.status === 'archived' || node.status === 'superseded' || node.isMarkedWrong) return;
    const content = [node.title, node.summary, node.content].filter(Boolean).join('\n').slice(0, 8_000);
    if (!content) return;
    this.db.prepare('INSERT INTO memory_fts (memory_id, companion_id, user_id, content) VALUES (?, ?, ?, ?)')
      .run(node.id, node.companionId ?? '', node.userId ?? 'local', content);
  }

  private queueEmbeddingForMemory(node: MemoryNode): void {
    if (!this.isEmbeddingEligible(node)) {
      this.enqueueEmbeddingJob(node.id, 'delete');
      return;
    }
    this.db.prepare("UPDATE memory_embeddings SET status = 'stale', updated_at = ? WHERE memory_id = ?")
      .run(nowIso(), node.id);
    this.enqueueEmbeddingJob(node.id, 'upsert');
  }

  private enqueueEmbeddingJob(memoryId: string, operation: 'upsert' | 'delete'): void {
    const now = nowIso();
    const existing = this.db.prepare("SELECT id FROM embedding_jobs WHERE memory_id = ? AND status IN ('pending', 'processing') ORDER BY created_at DESC LIMIT 1")
      .get(memoryId) as { id?: unknown } | undefined;
    if (existing?.id) {
      this.db.prepare("UPDATE embedding_jobs SET operation = ?, status = 'pending', updated_at = ? WHERE id = ?")
        .run(operation, now, String(existing.id));
      this.embeddingJobNotifier?.();
      return;
    }
    this.db.prepare(`INSERT INTO embedding_jobs (id, memory_id, operation, status, attempts, embedding_model, embedding_version, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?)`)
      .run(createId('embedding_job'), memoryId, operation, 'Xenova/multilingual-e5-small', 1, now, now);
    this.embeddingJobNotifier?.();
  }

  listPendingEmbeddingJobs(limit = 8): Array<{ id: string; memoryId: string; operation: 'upsert' | 'delete'; attempts: number }> {
    return (this.db.prepare("SELECT id, memory_id, operation, attempts FROM embedding_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?")
      .all(Math.max(1, limit)) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id), memoryId: String(row.memory_id), operation: row.operation as 'upsert' | 'delete', attempts: Number(row.attempts),
    }));
  }

  getEmbeddingJobCounts(): Record<string, number> {
    const rows = this.db.prepare('SELECT status, COUNT(*) AS count FROM embedding_jobs GROUP BY status').all() as Array<{ status: string; count: number }>;
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
  }

  blockEmbeddingJob(id: string, error: string): void {
    this.db.prepare("UPDATE embedding_jobs SET status = 'blocked', last_error = ?, updated_at = ? WHERE id = ?")
      .run(error, nowIso(), id);
  }

  requeueEmbeddingJob(id: string, error: string): void {
    this.db.prepare("UPDATE embedding_jobs SET status = 'pending', last_error = ?, updated_at = ? WHERE id = ?")
      .run(error, nowIso(), id);
    this.embeddingJobNotifier?.();
  }

  unblockEmbeddingJobs(): number {
    const result = this.db.prepare("UPDATE embedding_jobs SET status = 'pending', last_error = NULL, updated_at = ? WHERE status = 'blocked'")
      .run(nowIso()) as { changes?: number | bigint };
    const changed = Number(result.changes ?? 0);
    if (changed) this.embeddingJobNotifier?.();
    return changed;
  }

  claimEmbeddingJob(id: string): boolean {
    const result = this.db.prepare("UPDATE embedding_jobs SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'")
      .run(nowIso(), id) as { changes?: number };
    return Number(result.changes ?? 0) === 1;
  }

  finishEmbeddingJob(id: string, error?: string): void {
    this.db.prepare('UPDATE embedding_jobs SET status = ?, last_error = ?, updated_at = ? WHERE id = ?')
      .run(error ? 'failed' : 'completed', error ?? null, nowIso(), id);
  }

  recoverEmbeddingJobs(): void {
    this.db.prepare("UPDATE embedding_jobs SET status = 'pending', updated_at = ? WHERE status = 'processing'").run(nowIso());
  }

  retryFailedEmbeddingJobs(): number {
    const result = this.db.prepare("UPDATE embedding_jobs SET status = 'pending', last_error = NULL, updated_at = ? WHERE status = 'failed'")
      .run(nowIso()) as { changes?: number | bigint };
    const changed = Number(result.changes ?? 0);
    if (changed) this.embeddingJobNotifier?.();
    return changed;
  }

  queueAllEligibleEmbeddings(force = false): number {
    const nodes = this.listMemoryNodes().filter((node) => this.isEmbeddingEligible(node));
    let queued = 0;
    for (const node of nodes) {
      if (force || this.memoryNeedsEmbedding(node)) { this.queueEmbeddingForMemory(node); queued += 1; }
    }
    return queued;
  }

  recordMemoryAccess(memoryIds: string[]): void {
    const statement = this.db.prepare('UPDATE memory_nodes SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ? AND memory_status = \'active\'');
    const now = nowIso();
    for (const id of new Set(memoryIds)) statement.run(now, id);
  }

  private backfillMemoryRetrievalData(): void {
    this.db.exec("UPDATE memory_nodes SET memory_status = CASE WHEN is_marked_wrong = 1 THEN 'superseded' ELSE COALESCE(NULLIF(memory_status, ''), 'active') END");
    const rows = this.db.prepare('SELECT * FROM memory_nodes').all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const node = mapMemoryNode(row);
      const ftsExists = this.db.prepare('SELECT 1 FROM memory_fts WHERE memory_id = ? LIMIT 1').get(node.id);
      if (!ftsExists) this.syncMemoryFts(node);
      if (this.isEmbeddingEligible(node) && this.memoryNeedsEmbedding(node)) this.enqueueEmbeddingJob(node.id, 'upsert');
    }
  }

  private memoryNeedsEmbedding(node: MemoryNode): boolean {
    const state = this.getMemoryProcessingState(node.id);
    const embedding = this.db.prepare('SELECT content_hash, embedding_model, embedding_version, dimensions, status, vector_row_id FROM memory_embeddings WHERE memory_id = ?')
      .get(node.id) as Record<string, unknown> | undefined;
    return !embedding
      || String(embedding.status) !== 'ready'
      || !embedding.vector_row_id
      || String(embedding.content_hash) !== String(state?.contentHash ?? '')
      || String(embedding.embedding_model) !== 'Xenova/multilingual-e5-small'
      || Number(embedding.embedding_version) !== 1
      || Number(embedding.dimensions) !== 384;
  }

  insertMemoryEdge(edge: MemoryEdge): MemoryEdge {
    this.db
      .prepare(
        `INSERT INTO memory_edges (id, from_node_id, to_node_id, relation_type, confidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(edge.id, edge.fromNodeId, edge.toNodeId, edge.relationType, edge.confidence, edge.createdAt);
    return edge;
  }

  listMemoryEdges(companionId?: string): MemoryEdge[] {
    const rows = companionId
      ? this.db.prepare(
          `SELECT edges.* FROM memory_edges edges
           INNER JOIN memory_nodes source ON source.id = edges.from_node_id
           INNER JOIN memory_nodes target ON target.id = edges.to_node_id
           WHERE source.companion_id = ? AND target.companion_id = ?
           ORDER BY edges.created_at DESC`
        ).all(companionId, companionId)
      : this.db.prepare('SELECT * FROM memory_edges ORDER BY created_at DESC').all();
    return (rows as Array<Record<string, unknown>>).map(
      (row) => ({
        id: String(row.id),
        fromNodeId: String(row.from_node_id),
        toNodeId: String(row.to_node_id),
        relationType: row.relation_type as MemoryEdge['relationType'],
        confidence: Number(row.confidence),
        createdAt: String(row.created_at)
      })
    );
  }

  insertDiscovery(discovery: Discovery): Discovery {
    this.db
      .prepare(
        `INSERT INTO discoveries
         (id, source, external_id, title, summary, url, canonical_url, published_at, tags_json, raw_json, fingerprint, interest_score, history_score, expertise_score,
          novelty_score, usefulness_score, final_score, status, why_this_matters, recommended_action, short_message,
          companion_id, cycle_id, presentation_command_id, eligible_at, queued_at, presenting_at, announced_at,
          updated_at, status_reason, shared_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source = excluded.source,
           external_id = excluded.external_id,
           title = excluded.title,
           summary = excluded.summary,
           url = excluded.url,
           canonical_url = COALESCE(excluded.canonical_url, discoveries.canonical_url),
           published_at = COALESCE(excluded.published_at, discoveries.published_at),
           tags_json = excluded.tags_json,
           raw_json = excluded.raw_json,
           fingerprint = COALESCE(excluded.fingerprint, discoveries.fingerprint),
           interest_score = excluded.interest_score,
           history_score = excluded.history_score,
           expertise_score = excluded.expertise_score,
           novelty_score = excluded.novelty_score,
           usefulness_score = excluded.usefulness_score,
           final_score = excluded.final_score,
           why_this_matters = COALESCE(excluded.why_this_matters, discoveries.why_this_matters),
           recommended_action = COALESCE(excluded.recommended_action, discoveries.recommended_action),
           short_message = COALESCE(excluded.short_message, discoveries.short_message),
           companion_id = COALESCE(excluded.companion_id, discoveries.companion_id),
           cycle_id = COALESCE(excluded.cycle_id, discoveries.cycle_id),
           updated_at = excluded.updated_at`
      )
      .run(
        discovery.id,
        discovery.source,
        discovery.externalId ?? null,
        discovery.title,
        discovery.summary ?? null,
        discovery.url ?? null,
        discovery.canonicalUrl ?? null,
        discovery.publishedAt ?? null,
        JSON.stringify(discovery.tags),
        JSON.stringify(discovery.raw),
        discovery.fingerprint ?? null,
        unitToScore100(discovery.userInterestScore),
        unitToScore100(discovery.userHistoryScore),
        unitToScore100(discovery.characterExpertiseScore),
        unitToScore100(discovery.noveltyScore),
        unitToScore100(discovery.usefulnessScore),
        unitToScore100(discovery.finalScore),
        discovery.status,
        discovery.whyThisMatters ?? null,
        discovery.recommendedAction ?? null,
        discovery.shortMessage ?? null,
        discovery.companionId ?? null,
        discovery.cycleId ?? null,
        discovery.presentationCommandId ?? null,
        discovery.eligibleAt ?? null,
        discovery.queuedAt ?? null,
        discovery.presentingAt ?? null,
        discovery.announcedAt ?? null,
        discovery.updatedAt ?? discovery.createdAt,
        discovery.statusReason ?? null,
        null,
        discovery.createdAt
      );
    return discovery;
  }

  transitionDiscoveryStatus(
    id: string,
    status: DiscoveryStatus,
    input: DiscoveryLifecycleTransitionInput = {}
  ): Discovery {
    const current = this.getDiscovery(id);
    if (!current) throw new Error(`Discovery not found: ${id}`);
    if (current.status === status) return current;
    if (!LEGAL_DISCOVERY_TRANSITIONS[current.status].includes(status)) {
      throw new Error(`Illegal Discovery lifecycle transition: ${current.status} -> ${status}`);
    }

    const at = input.at ?? nowIso();
    const eligibleAt =
      status === 'eligible' ? current.eligibleAt ?? at : current.eligibleAt;
    const queuedAt =
      status === 'queued' ? current.queuedAt ?? at : current.queuedAt;
    const presentingAt =
      status === 'presenting' ? current.presentingAt ?? at : current.presentingAt;
    const announcedAt =
      status === 'announced' ? current.announcedAt ?? at : current.announcedAt;

    this.db.prepare(
      `UPDATE discoveries SET
        status = ?,
        companion_id = COALESCE(?, companion_id),
        cycle_id = COALESCE(?, cycle_id),
        presentation_command_id = COALESCE(?, presentation_command_id),
        eligible_at = ?,
        queued_at = ?,
        presenting_at = ?,
        announced_at = ?,
        updated_at = ?,
        status_reason = ?
       WHERE id = ?`
    ).run(
      status,
      input.companionId ?? null,
      input.cycleId ?? null,
      input.commandId ?? null,
      eligibleAt ?? null,
      queuedAt ?? null,
      presentingAt ?? null,
      announcedAt ?? null,
      at,
      input.reason ?? null,
      id
    );
    return this.getDiscovery(id)!;
  }

  getDiscovery(id: string): Discovery | undefined {
    const row = this.db.prepare('SELECT * FROM discoveries WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapDiscovery(row) : undefined;
  }

  listDiscoveries(input: { companionId?: string; status?: DiscoveryStatus; limit?: number } = {}): Discovery[] {
    const limit = input.limit ?? 20;
    const rows = input.companionId && input.status
      ? this.db
          .prepare('SELECT * FROM discoveries WHERE companion_id = ? AND status = ? ORDER BY final_score DESC LIMIT ?')
          .all(input.companionId, input.status, limit)
      : input.companionId
        ? this.db
            .prepare('SELECT * FROM discoveries WHERE companion_id = ? ORDER BY final_score DESC LIMIT ?')
            .all(input.companionId, limit)
        : input.status
          ? this.db
              .prepare('SELECT * FROM discoveries WHERE status = ? ORDER BY final_score DESC LIMIT ?')
              .all(input.status, limit)
          : this.db.prepare('SELECT * FROM discoveries ORDER BY final_score DESC LIMIT ?').all(limit);
    return (rows as Array<Record<string, unknown>>).map(mapDiscovery);
  }

  countAnnouncedToday(companionId?: string, now: Date = new Date()): number {
    const day = now.toISOString().slice(0, 10);
    const start = `${day}T00:00:00.000Z`;
    const endDate = new Date(start);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const end = endDate.toISOString();
    const row = companionId
      ? this.db.prepare(
          `SELECT COUNT(*) as count FROM discoveries
           WHERE announced_at >= ? AND announced_at < ? AND companion_id = ?`
        ).get(start, end, companionId) as { count: number }
      : this.db.prepare(
          `SELECT COUNT(*) as count FROM discoveries
           WHERE announced_at >= ? AND announced_at < ?`
        ).get(start, end) as { count: number };
    return Number(row.count);
  }

  getAnnouncedDiscoveryIds(): string[] {
    return (this.db.prepare(
      'SELECT id FROM discoveries WHERE announced_at IS NOT NULL ORDER BY announced_at ASC'
    ).all() as Array<{ id: string }>).map((row) => String(row.id));
  }

  isDiscoveryAnnounced(id: string): boolean {
    return Boolean(this.db.prepare(
      'SELECT 1 FROM discoveries WHERE id = ? AND announced_at IS NOT NULL'
    ).get(id));
  }

  clearAnnouncedDiscoveryIds(): void {
    this.db.prepare(
      `UPDATE discoveries
       SET status = 'eligible', announced_at = NULL, presenting_at = NULL,
           presentation_command_id = NULL, updated_at = ?
       WHERE status = 'announced'`
    ).run(nowIso());
  }

  listQueuedOrEligible(limit = 20, companionId?: string): Discovery[] {
    const rows = companionId
      ? this.db.prepare(
          `SELECT * FROM discoveries
           WHERE status IN ('queued', 'eligible') AND companion_id = ?
           ORDER BY CASE status WHEN 'queued' THEN 0 ELSE 1 END,
                    COALESCE(queued_at, eligible_at, created_at) ASC
           LIMIT ?`
        ).all(companionId, limit)
      : this.db.prepare(
          `SELECT * FROM discoveries
           WHERE status IN ('queued', 'eligible')
           ORDER BY CASE status WHEN 'queued' THEN 0 ELSE 1 END,
                    COALESCE(queued_at, eligible_at, created_at) ASC
           LIMIT ?`
        ).all(limit);
    return (rows as Array<Record<string, unknown>>).map(mapDiscovery);
  }

  getOldestQueuedDiscovery(companionId?: string): Discovery | null {
    return this.listQueuedOrEligible(1, companionId)[0] ?? null;
  }

  insertEngineTrace(trace: EngineTrace): EngineTrace {
    this.db.prepare(
      `INSERT OR REPLACE INTO engine_traces
       (id, correlation_id, causation_id, cycle_id, companion_id, engine, operation, provider_mode,
        input_refs_json, output_refs_json, state_before_hash, state_after_hash, started_at, completed_at,
        duration_ms, status, skip_reason, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      trace.id,
      trace.correlationId,
      trace.causationId ?? null,
      trace.cycleId ?? null,
      trace.companionId,
      trace.engine,
      trace.operation,
      trace.providerMode,
      JSON.stringify(trace.inputRefs),
      JSON.stringify(trace.outputRefs),
      trace.stateBeforeHash ?? null,
      trace.stateAfterHash ?? null,
      trace.startedAt,
      trace.completedAt ?? null,
      trace.durationMs ?? null,
      trace.status,
      trace.skipReason ?? null,
      trace.error ?? null
    );
    return trace;
  }

  listEngineTraces(input: EngineTraceQuery = {}): EngineTrace[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (input.correlationId) {
      conditions.push('correlation_id = ?');
      params.push(input.correlationId);
    }
    if (input.cycleId) {
      conditions.push('cycle_id = ?');
      params.push(input.cycleId);
    }
    if (input.companionId) {
      conditions.push('companion_id = ?');
      params.push(input.companionId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(input.limit ?? 100);
    const rows = this.db.prepare(
      `SELECT * FROM engine_traces ${where} ORDER BY started_at ASC, rowid ASC LIMIT ?`
    ).all(...params) as Array<Record<string, unknown>>;
    return rows.map(mapEngineTrace);
  }

  upsertPattern(pattern: Pattern): CognitiveUpsertResult<Pattern> {
    const companionId = pattern.companionId ?? 'default';
    const normalizedTopics = (pattern.normalizedTopics?.length ? pattern.normalizedTopics : [pattern.title])
      .map(normalizeSemanticText)
      .filter(Boolean)
      .sort();
    const semanticFingerprint = pattern.semanticFingerprint
      ?? createSemanticFingerprint('pattern', [pattern.type, ...normalizedTopics]);
    const existingRow = this.db.prepare(
      'SELECT * FROM patterns WHERE user_id = ? AND companion_id = ? AND semantic_fingerprint = ?'
    ).get(pattern.userId, companionId, semanticFingerprint) as Record<string, unknown> | undefined;
    if (existingRow) {
      const existing = mapPattern(existingRow);
      const evidence = new Map<string, Pattern['evidence'][number]>();
      for (const item of [...existing.evidence, ...pattern.evidence]) {
        evidence.set(`${item.sourceType}:${item.sourceId ?? ''}:${normalizeSemanticText(item.summary)}`, item);
      }
      const updated: Pattern = {
        ...existing,
        title: pattern.title,
        summary: pattern.summary,
        normalizedTopics: [...new Set([...(existing.normalizedTopics ?? []), ...normalizedTopics])].sort(),
        confidence: Math.max(existing.confidence, pattern.confidence),
        strength: Math.max(existing.strength, pattern.strength),
        freshness: Math.max(existing.freshness, pattern.freshness),
        frequency: Math.max(existing.frequency ?? 0, pattern.frequency ?? 0),
        evidence: [...evidence.values()],
        observationCount: (existing.observationCount ?? 1) + 1,
        lastObservedAt: pattern.lastObservedAt ?? pattern.updatedAt,
        updatedAt: pattern.updatedAt,
      };
      this.writePattern(updated);
      return {
        record: updated,
        outcome: updated.evidence.length > existing.evidence.length ? 'updated' : 'deduplicated',
      };
    }
    const created: Pattern = {
      ...pattern,
      companionId,
      semanticFingerprint,
      normalizedTopics,
      observationCount: pattern.observationCount ?? 1,
      frequency: pattern.frequency ?? 0,
      lastObservedAt: pattern.lastObservedAt ?? pattern.updatedAt,
    };
    this.writePattern(created);
    return { record: created, outcome: 'created' };
  }

  insertPattern(pattern: Pattern): Pattern {
    return this.upsertPattern(pattern).record;
  }

  private writePattern(pattern: Pattern): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO patterns
         (id, user_id, companion_id, semantic_fingerprint, normalized_topics_json, type, title, summary, confidence,
          strength, freshness, evidence_json, observation_count, frequency, last_observed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        pattern.id,
        pattern.userId,
        pattern.companionId ?? 'default',
        pattern.semanticFingerprint ?? '',
        JSON.stringify(pattern.normalizedTopics ?? []),
        pattern.type,
        pattern.title,
        pattern.summary,
        pattern.confidence,
        pattern.strength,
        pattern.freshness,
        JSON.stringify(pattern.evidence),
        pattern.observationCount ?? 1,
        pattern.frequency ?? 0,
        pattern.lastObservedAt ?? pattern.updatedAt,
        pattern.createdAt,
        pattern.updatedAt
      );
  }

  listPatterns(userId = 'default', limit = 20, companionId?: string): Pattern[] {
    const rows = companionId
      ? this.db.prepare('SELECT * FROM patterns WHERE user_id = ? AND companion_id = ? ORDER BY strength DESC LIMIT ?').all(userId, companionId, limit)
      : this.db.prepare('SELECT * FROM patterns WHERE user_id = ? ORDER BY strength DESC LIMIT ?').all(userId, limit);
    return (rows as Array<Record<string, unknown>>).map(mapPattern);
  }

  pruneDeletedMemoryPatternEvidence(
    userId: string,
    companionId: string,
    deletedMemoryIds: readonly string[],
    updatedAt = nowIso(),
  ): { deletedPatternIds: string[]; updatedPatternIds: string[] } {
    const deletedIds = new Set(deletedMemoryIds);
    const deletedPatternIds: string[] = [];
    const updatedPatternIds: string[] = [];
    if (deletedIds.size === 0) return { deletedPatternIds, updatedPatternIds };

    for (const pattern of this.listPatterns(userId, 10_000, companionId)) {
      const evidence = pattern.evidence.filter(
        (item) => item.sourceType !== 'memory' || !item.sourceId || !deletedIds.has(item.sourceId)
      );
      if (evidence.length === pattern.evidence.length) continue;

      // Every persisted Pattern currently represents recurrence across at least
      // two observations. A single surviving observation is no longer a Pattern.
      if (evidence.length < 2) {
        this.db.prepare('DELETE FROM patterns WHERE id = ?').run(pattern.id);
        deletedPatternIds.push(pattern.id);
        continue;
      }

      const averageWeight = evidence.reduce((sum, item) => sum + item.weight, 0) / evidence.length;
      const retainedRatio = evidence.length / pattern.evidence.length;
      const updated: Pattern = {
        ...pattern,
        evidence,
        confidence: Math.min(pattern.confidence, Math.max(0.4, averageWeight)),
        strength: Math.min(pattern.strength, Math.max(0, averageWeight * retainedRatio)),
        frequency: Math.min(pattern.frequency ?? 1, retainedRatio),
        observationCount: Math.min(pattern.observationCount ?? evidence.length, evidence.length),
        updatedAt,
      };
      this.writePattern(updated);
      updatedPatternIds.push(pattern.id);
    }
    return { deletedPatternIds, updatedPatternIds };
  }

  upsertInterestGraph(graph: InterestGraph): InterestGraph {
    for (const node of graph.nodes) {
      this.insertInterestNode(node);
    }
    for (const edge of graph.edges) {
      this.insertInterestEdge(edge);
    }
    this.setAppSetting(`interestGraph.${graph.userId}.recommendedExpansionPaths`, graph.recommendedExpansionPaths ?? []);
    return graph;
  }

  replaceInterestGraph(graph: InterestGraph): { graph: InterestGraph; removedNodeIds: string[] } {
    const existingNodeIds = new Set(this.getInterestGraph(graph.userId).nodes.map((node) => node.id));
    const nextNodeIds = new Set(graph.nodes.map((node) => node.id));
    const removedNodeIds = [...existingNodeIds].filter((id) => !nextNodeIds.has(id));

    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM interest_edges WHERE user_id = ?').run(graph.userId);
      this.db.prepare('DELETE FROM interest_nodes WHERE user_id = ?').run(graph.userId);
      for (const node of graph.nodes) this.insertInterestNode(node);
      for (const edge of graph.edges) this.insertInterestEdge(edge);
      this.setAppSetting(`interestGraph.${graph.userId}.recommendedExpansionPaths`, graph.recommendedExpansionPaths ?? []);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { graph, removedNodeIds };
  }

  insertInterestNode(node: InterestNode): InterestNode {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO interest_nodes
         (id, user_id, label, description, type, weight, confidence, freshness, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        node.id,
        node.userId,
        node.label,
        node.description ?? null,
        node.type,
        node.weight,
        node.confidence,
        node.freshness,
        node.source,
        node.createdAt,
        node.updatedAt
      );
    return node;
  }

  insertInterestEdge(edge: InterestEdge): InterestEdge {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO interest_edges
         (id, user_id, from_node_id, to_node_id, relation, weight, confidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(edge.id, edge.userId, edge.fromNodeId, edge.toNodeId, edge.relation, edge.weight, edge.confidence, edge.createdAt);
    return edge;
  }

  getInterestGraph(userId = 'default'): InterestGraph {
    const nodes = (this.db
      .prepare('SELECT * FROM interest_nodes WHERE user_id = ? ORDER BY weight DESC')
      .all(userId) as Array<Record<string, unknown>>).map(mapInterestNode);
    const edges = (this.db
      .prepare('SELECT * FROM interest_edges WHERE user_id = ? ORDER BY weight DESC')
      .all(userId) as Array<Record<string, unknown>>).map(mapInterestEdge);
    return {
      userId,
      nodes,
      edges,
      recommendedExpansionPaths: this.getAppSetting<string[][]>(`interestGraph.${userId}.recommendedExpansionPaths`) ?? [],
      updatedAt: nowIso()
    };
  }

  upsertCuriosityTarget(target: CuriosityTarget, at = target.lastGeneratedAt ?? target.updatedAt ?? target.createdAt): CognitiveUpsertResult<CuriosityTarget> {
    const topicFingerprint = target.topicFingerprint ?? createSemanticFingerprint('curiosity_topic', [target.topic]);
    const generatedFromIds = target.generatedFromIds ?? [
      ...(target.relatedMemoryIds ?? []),
      ...(target.relatedPatternIds ?? []),
      ...(target.relatedInterestNodeIds ?? []),
    ].sort();
    const existingRow = this.db.prepare(
      'SELECT * FROM curiosity_targets WHERE user_id = ? AND companion_id = ? AND topic_fingerprint = ?'
    ).get(target.userId, target.companionId, topicFingerprint) as Record<string, unknown> | undefined;
    if (existingRow) {
      const existing = mapCuriosityTarget(existingRow);
      const newEvidence = generatedFromIds.some((id) => !(existing.generatedFromIds ?? []).includes(id));
      const materiallyStronger = newEvidence && target.priority >= existing.priority + 0.15;
      const cooldownActive = Boolean(existing.cooldownUntil && Date.parse(existing.cooldownUntil) > Date.parse(at));
      if (cooldownActive && !materiallyStronger) {
        return { record: existing, outcome: 'cooldown' };
      }
      const shouldReopen = ['completed', 'ignored', 'cooldown'].includes(existing.status ?? '')
        && (!cooldownActive || materiallyStronger);
      const mergedGeneratedIds = [...new Set([...(existing.generatedFromIds ?? []), ...generatedFromIds])].sort();
      const updated: CuriosityTarget = {
        ...existing,
        topic: target.topic,
        description: target.description,
        source: target.source,
        sourceFingerprint: createSemanticFingerprint('curiosity_source', [
          existing.sourceFingerprint ?? existing.source,
          target.sourceFingerprint ?? target.source,
          ...mergedGeneratedIds,
        ].sort()),
        generatedFromIds: mergedGeneratedIds,
        explorationType: target.explorationType,
        priority: Math.max(existing.priority, target.priority),
        confidence: Math.max(existing.confidence, target.confidence),
        reason: target.reason,
        expectedValue: target.expectedValue,
        relatedMemoryIds: [...new Set([...(existing.relatedMemoryIds ?? []), ...(target.relatedMemoryIds ?? [])])],
        relatedPatternIds: [...new Set([...(existing.relatedPatternIds ?? []), ...(target.relatedPatternIds ?? [])])],
        relatedInterestNodeIds: [...new Set([...(existing.relatedInterestNodeIds ?? []), ...(target.relatedInterestNodeIds ?? [])])],
        status: shouldReopen ? 'open' : existing.status ?? 'open',
        cooldownUntil: shouldReopen ? undefined : existing.cooldownUntil,
        lastGeneratedAt: at,
        generationCount: (existing.generationCount ?? 1) + 1,
        updatedAt: at,
      };
      this.writeCuriosityTarget(updated);
      return { record: updated, outcome: shouldReopen ? 'reopened' : 'deduplicated' };
    }
    const created: CuriosityTarget = {
      ...target,
      topicFingerprint,
      sourceFingerprint: target.sourceFingerprint
        ?? createSemanticFingerprint('curiosity_source', [target.source, ...generatedFromIds]),
      generatedFromIds,
      status: target.status ?? 'open',
      lastGeneratedAt: target.lastGeneratedAt ?? at,
      generationCount: target.generationCount ?? 1,
      ignoreCount: target.ignoreCount ?? 0,
      updatedAt: target.updatedAt ?? at,
    };
    this.writeCuriosityTarget(created);
    return { record: created, outcome: 'created' };
  }

  insertCuriosityTarget(target: CuriosityTarget): CuriosityTarget {
    return this.upsertCuriosityTarget(target).record;
  }

  reconcileCuriositySources(input: {
    userId: string;
    companionId: string;
    validMemoryIds: readonly string[];
    validPatternIds: readonly string[];
    validInterestNodeIds: readonly string[];
    updatedAt?: string;
  }): { updatedTargetIds: string[]; closedTargetIds: string[] } {
    const validMemoryIds = new Set(input.validMemoryIds);
    const validPatternIds = new Set(input.validPatternIds);
    const validInterestNodeIds = new Set(input.validInterestNodeIds);
    const validSourceIds = new Set([
      ...validMemoryIds,
      ...validPatternIds,
      ...validInterestNodeIds,
    ]);
    const updatedAt = input.updatedAt ?? nowIso();
    const updatedTargetIds: string[] = [];
    const closedTargetIds: string[] = [];

    for (const target of this.listCuriosityTargets(input.userId, 10_000, input.companionId)) {
      const relatedMemoryIds = (target.relatedMemoryIds ?? []).filter((id) => validMemoryIds.has(id));
      const relatedPatternIds = (target.relatedPatternIds ?? []).filter((id) => validPatternIds.has(id));
      const relatedInterestNodeIds = (target.relatedInterestNodeIds ?? []).filter((id) => validInterestNodeIds.has(id));
      const previousSourceIds = [
        ...(target.relatedMemoryIds ?? []),
        ...(target.relatedPatternIds ?? []),
        ...(target.relatedInterestNodeIds ?? []),
      ];
      const generatedFromIds = [...new Set([
        ...(target.generatedFromIds ?? previousSourceIds).filter((id) => validSourceIds.has(id)),
        ...relatedMemoryIds,
        ...relatedPatternIds,
        ...relatedInterestNodeIds,
      ])].sort();
      const priorGeneratedFromIds = target.generatedFromIds ?? previousSourceIds;
      const changed = (target.relatedMemoryIds ?? []).length !== relatedMemoryIds.length
        || (target.relatedPatternIds ?? []).length !== relatedPatternIds.length
        || (target.relatedInterestNodeIds ?? []).length !== relatedInterestNodeIds.length
        || priorGeneratedFromIds.length !== generatedFromIds.length
        || priorGeneratedFromIds.some((id) => !generatedFromIds.includes(id));
      if (!changed) continue;

      const unsupported = (previousSourceIds.length > 0 || priorGeneratedFromIds.length > 0)
        && generatedFromIds.length === 0;
      const updated: CuriosityTarget = {
        ...target,
        relatedMemoryIds,
        relatedPatternIds,
        relatedInterestNodeIds,
        generatedFromIds,
        sourceFingerprint: createSemanticFingerprint('curiosity_source', [target.source, ...generatedFromIds]),
        status: unsupported ? 'completed' : target.status,
        cooldownUntil: unsupported
          ? new Date(Date.parse(updatedAt) + CURIOSITY_COOLDOWN_MS.completed).toISOString()
          : target.cooldownUntil,
        updatedAt,
      };
      this.writeCuriosityTarget(updated);
      updatedTargetIds.push(target.id);
      if (unsupported) closedTargetIds.push(target.id);
    }
    return { updatedTargetIds, closedTargetIds };
  }

  private writeCuriosityTarget(target: CuriosityTarget): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO curiosity_targets
         (id, user_id, companion_id, topic, topic_fingerprint, source_fingerprint, generated_from_ids_json,
          description, source, exploration_type, priority, confidence, reason, expected_value,
          related_memory_ids_json, related_pattern_ids_json, related_interest_node_ids_json, status,
          last_generated_at, last_explored_at, cooldown_until, generation_count, ignore_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        target.id,
        target.userId,
        target.companionId,
        target.topic,
        target.topicFingerprint ?? '',
        target.sourceFingerprint ?? '',
        JSON.stringify(target.generatedFromIds ?? []),
        target.description,
        target.source,
        target.explorationType,
        target.priority,
        target.confidence,
        target.reason,
        target.expectedValue,
        JSON.stringify(target.relatedMemoryIds ?? []),
        JSON.stringify(target.relatedPatternIds ?? []),
        JSON.stringify(target.relatedInterestNodeIds ?? []),
        target.status ?? 'open',
        target.lastGeneratedAt ?? null,
        target.lastExploredAt ?? null,
        target.cooldownUntil ?? null,
        target.generationCount ?? 1,
        target.ignoreCount ?? 0,
        target.createdAt,
        target.updatedAt ?? target.createdAt,
      );
  }

  setCuriosityTargetStatus(
    id: string,
    status: 'open' | 'exploring' | 'completed' | 'ignored' | 'cooldown',
    at: string,
  ): CuriosityTarget | undefined {
    const existing = this.getCuriosityTarget(id);
    if (!existing) return undefined;
    const ignoreCount = (existing.ignoreCount ?? 0) + (status === 'ignored' ? 1 : 0);
    const cooldownMs = status === 'completed'
      ? CURIOSITY_COOLDOWN_MS.completed
      : status === 'ignored'
        ? ignoreCount >= 3
          ? CURIOSITY_COOLDOWN_MS.ignoredRepeatedly
          : ignoreCount === 2
            ? CURIOSITY_COOLDOWN_MS.ignoredTwice
            : CURIOSITY_COOLDOWN_MS.ignoredOnce
        : 0;
    const updated: CuriosityTarget = {
      ...existing,
      status,
      ignoreCount,
      lastExploredAt: ['exploring', 'completed'].includes(status) ? at : existing.lastExploredAt,
      cooldownUntil: cooldownMs ? new Date(Date.parse(at) + cooldownMs).toISOString() : undefined,
      updatedAt: at,
    };
    this.writeCuriosityTarget(updated);
    return updated;
  }

  getCuriosityTarget(id: string): CuriosityTarget | undefined {
    const row = this.db.prepare('SELECT * FROM curiosity_targets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapCuriosityTarget(row) : undefined;
  }

  insertResearchIntent(intent: ResearchIntent): ResearchIntent {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO research_intents
         (id, user_id, companion_id, cycle_id, curiosity_target_id, topic, objective, preferred_source_types_json,
          domain_hints_json, excluded_domains_json, freshness_days, evidence_requirements_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        intent.id,
        intent.userId,
        intent.companionId,
        intent.cycleId,
        intent.curiosityTargetId,
        intent.topic,
        intent.objective,
        JSON.stringify(intent.preferredSourceTypes),
        JSON.stringify(intent.domainHints ?? []),
        JSON.stringify(intent.excludedDomains ?? []),
        intent.freshnessDays ?? null,
        JSON.stringify(intent.evidenceRequirements),
        intent.createdAt
      );
    return intent;
  }

  getResearchIntent(id: string, companionId: string): ResearchIntent | undefined {
    const row = this.db.prepare(
      'SELECT * FROM research_intents WHERE id = ? AND companion_id = ?'
    ).get(id, companionId) as Record<string, unknown> | undefined;
    return row ? mapResearchIntent(row) : undefined;
  }

  listResearchIntents(input: ResearchArtifactQuery): ResearchIntent[] {
    const conditions = ['companion_id = ?'];
    const params: Array<string | number> = [input.companionId];
    if (input.cycleId) {
      conditions.push('cycle_id = ?');
      params.push(input.cycleId);
    }
    params.push(input.limit ?? 20);
    const rows = this.db.prepare(
      `SELECT * FROM research_intents WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`
    ).all(...params) as Array<Record<string, unknown>>;
    return rows.map(mapResearchIntent);
  }

  insertResearchPlan(plan: ResearchPlan): ResearchPlan {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO research_plans
         (id, user_id, companion_id, cycle_id, research_intent_id, queries_json, selected_capabilities_json, limits_json, created_at, outcome_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        plan.id,
        plan.userId,
        plan.companionId,
        plan.cycleId,
        plan.researchIntentId,
        JSON.stringify(plan.queries),
        JSON.stringify(plan.selectedCapabilities),
        JSON.stringify(plan.limits),
        plan.createdAt,
        JSON.stringify(plan.outcome ?? {})
      );
    return plan;
  }

  getResearchPlan(id: string, companionId: string): ResearchPlan | undefined {
    const row = this.db.prepare(
      'SELECT * FROM research_plans WHERE id = ? AND companion_id = ?'
    ).get(id, companionId) as Record<string, unknown> | undefined;
    return row ? mapResearchPlan(row) : undefined;
  }

  listResearchPlans(input: ResearchArtifactQuery): ResearchPlan[] {
    const conditions = ['companion_id = ?'];
    const params: Array<string | number> = [input.companionId];
    if (input.cycleId) {
      conditions.push('cycle_id = ?');
      params.push(input.cycleId);
    }
    params.push(input.limit ?? 20);
    const rows = this.db.prepare(
      `SELECT * FROM research_plans WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`
    ).all(...params) as Array<Record<string, unknown>>;
    return rows.map(mapResearchPlan);
  }

  insertResearchSearchRecord(record: ResearchSearchRecord): ResearchSearchRecord {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO research_search_records
         (id, user_id, companion_id, cycle_id, research_intent_id, research_plan_id, query, provider, mode, status,
          result_count, created_at, error_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.userId,
        record.companionId,
        record.cycleId,
        record.researchIntentId,
        record.researchPlanId,
        record.query,
        record.provider,
        record.mode,
        record.status,
        record.resultCount,
        record.createdAt,
        record.errorCode ?? null
      );
    return record;
  }

  getResearchSearchRecord(id: string, companionId: string): ResearchSearchRecord | undefined {
    const row = this.db.prepare(
      'SELECT * FROM research_search_records WHERE id = ? AND companion_id = ?'
    ).get(id, companionId) as Record<string, unknown> | undefined;
    return row ? mapResearchSearchRecord(row) : undefined;
  }

  listResearchSearchRecords(input: ResearchArtifactQuery): ResearchSearchRecord[] {
    const conditions = ['companion_id = ?'];
    const params: Array<string | number> = [input.companionId];
    if (input.cycleId) {
      conditions.push('cycle_id = ?');
      params.push(input.cycleId);
    }
    params.push(input.limit ?? 50);
    const rows = this.db.prepare(
      `SELECT * FROM research_search_records WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`
    ).all(...params) as Array<Record<string, unknown>>;
    return rows.map(mapResearchSearchRecord);
  }

  insertWebPageEvidence(evidence: WebPageEvidence): WebPageEvidence {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO web_page_evidence
         (id, user_id, companion_id, cycle_id, research_intent_id, research_plan_id, search_result_id, query, provider,
          url, canonical_url, domain, title, extracted_text, excerpt, content_hash, content_type, fetched_at, published_at, source_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        evidence.id,
        evidence.userId,
        evidence.companionId,
        evidence.cycleId,
        evidence.researchIntentId,
        evidence.researchPlanId,
        evidence.searchResultId,
        evidence.query,
        evidence.provider,
        evidence.url,
        evidence.canonicalUrl,
        evidence.domain,
        evidence.title,
        evidence.extractedText,
        evidence.excerpt,
        evidence.contentHash,
        evidence.contentType,
        evidence.fetchedAt,
        evidence.publishedAt ?? null,
        evidence.sourceType
      );
    return evidence;
  }

  getWebPageEvidence(id: string, companionId: string): WebPageEvidence | undefined {
    const row = this.db.prepare(
      'SELECT * FROM web_page_evidence WHERE id = ? AND companion_id = ?'
    ).get(id, companionId) as Record<string, unknown> | undefined;
    return row ? mapWebPageEvidence(row) : undefined;
  }

  listWebPageEvidence(input: ResearchArtifactQuery): WebPageEvidence[] {
    const conditions = ['companion_id = ?'];
    const params: Array<string | number> = [input.companionId];
    if (input.cycleId) {
      conditions.push('cycle_id = ?');
      params.push(input.cycleId);
    }
    params.push(input.limit ?? 50);
    const rows = this.db.prepare(
      `SELECT * FROM web_page_evidence WHERE ${conditions.join(' AND ')} ORDER BY fetched_at DESC LIMIT ?`
    ).all(...params) as Array<Record<string, unknown>>;
    return rows.map(mapWebPageEvidence);
  }

  insertDiscoveryCandidate(candidate: DiscoveryCandidate): DiscoveryCandidate {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO discovery_candidates
         (id, user_id, companion_id, title, summary, source_type, source_url, source_name, agent_type, related_curiosity_target_id,
          relevance_score, novelty_score, evidence_score, usefulness_score, research_plan_id, evidence_ids_json, raw_evidence, collected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        candidate.id,
        candidate.userId,
        candidate.companionId,
        candidate.title,
        candidate.summary,
        candidate.sourceType,
        candidate.sourceUrl ?? null,
        candidate.sourceName ?? null,
        candidate.agentType,
        candidate.relatedCuriosityTargetId,
        candidate.relevanceScore,
        candidate.noveltyScore,
        candidate.evidenceScore,
        candidate.usefulnessScore,
        candidate.researchPlanId ?? null,
        JSON.stringify(candidate.evidenceIds ?? []),
        candidate.rawEvidence ?? null,
        candidate.collectedAt
      );
    return candidate;
  }

  getDiscoveryCandidate(id: string): DiscoveryCandidate | undefined {
    const row = this.db.prepare('SELECT * FROM discovery_candidates WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapDiscoveryCandidate(row) : undefined;
  }

  insertCompanionInsight(insight: CompanionInsight): CompanionInsight {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO companion_insights
         (id, user_id, companion_id, title, type, summary, insight, why_it_matters, why_ann_found_it, confidence, novelty,
          emotional_relevance, practical_relevance, supporting_candidate_ids_json, related_memory_ids_json, related_pattern_ids_json,
          suggested_question, suggested_action, narration, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        insight.id,
        insight.userId,
        insight.companionId,
        insight.title,
        insight.type,
        insight.summary,
        insight.insight,
        insight.whyItMatters,
        insight.whyCompanionFoundIt,
        insight.confidence,
        insight.novelty,
        insight.emotionalRelevance,
        insight.practicalRelevance,
        JSON.stringify(insight.supportingCandidateIds),
        JSON.stringify(insight.relatedMemoryIds ?? []),
        JSON.stringify(insight.relatedPatternIds ?? []),
        insight.suggestedQuestion ?? null,
        insight.suggestedAction ?? null,
        insight.narration ?? null,
        insight.createdAt
      );
    return insight;
  }

  getCompanionInsight(id: string): CompanionInsight | undefined {
    const row = this.db.prepare('SELECT * FROM companion_insights WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapCompanionInsight(row) : undefined;
  }

  insertExplorationCycle(cycle: ExplorationCycle): ExplorationCycle {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO exploration_cycles
         (id, user_id, companion_id, trigger, state, curiosity_target_ids_json, selected_curiosity_target_id, research_intent_id, research_plan_id,
          discovery_candidate_ids_json, insight_ids_json, selected_insight_id, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        cycle.id,
        cycle.userId,
        cycle.companionId,
        cycle.trigger,
        cycle.state,
        JSON.stringify(cycle.curiosityTargetIds),
        cycle.selectedCuriosityTargetId ?? null,
        cycle.researchIntentId ?? null,
        cycle.researchPlanId ?? null,
        JSON.stringify(cycle.discoveryCandidateIds),
        JSON.stringify(cycle.insightIds),
        cycle.selectedInsightId ?? null,
        cycle.startedAt,
        cycle.completedAt ?? null
      );
    return cycle;
  }

  getExplorationCycle(id: string): ExplorationCycle | undefined {
    const row = this.db.prepare('SELECT * FROM exploration_cycles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapExplorationCycle(row) : undefined;
  }

  getCurrentExplorationCycle(): ExplorationCycle | undefined {
    const row = this.db
      .prepare("SELECT * FROM exploration_cycles WHERE completed_at IS NULL ORDER BY started_at DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    return row ? mapExplorationCycle(row) : undefined;
  }

  getCurrentExplorationCycleForCompanion(companionId: string): ExplorationCycle | undefined {
    const row = this.db
      .prepare("SELECT * FROM exploration_cycles WHERE companion_id = ? AND completed_at IS NULL ORDER BY started_at DESC LIMIT 1")
      .get(companionId) as Record<string, unknown> | undefined;
    return row ? mapExplorationCycle(row) : undefined;
  }

  listExplorationCycles(limit = 20): ExplorationCycle[] {
    return (this.db.prepare('SELECT * FROM exploration_cycles ORDER BY started_at DESC LIMIT ?').all(limit) as Array<
      Record<string, unknown>
    >).map(mapExplorationCycle);
  }

  insertExplorationEvent(event: ExplorationLoopEvent): ExplorationLoopEvent {
    this.db
      .prepare(
        `INSERT INTO exploration_loop_events
         (id, user_id, companion_id, cycle_id, state, message, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.userId,
        event.companionId,
        event.cycleId,
        event.state,
        event.message ?? null,
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.createdAt
      );
    return event;
  }

  listCuriosityTargets(userId = 'default', limit = 20, companionId?: string): CuriosityTarget[] {
    const rows = companionId
      ? this.db.prepare('SELECT * FROM curiosity_targets WHERE user_id = ? AND companion_id = ? ORDER BY priority DESC LIMIT ?').all(userId, companionId, limit)
      : this.db.prepare('SELECT * FROM curiosity_targets WHERE user_id = ? ORDER BY priority DESC LIMIT ?').all(userId, limit);
    return (rows as Array<Record<string, unknown>>).map(mapCuriosityTarget);
  }

  listDiscoveryCandidates(userId = 'default', limit = 20, companionId?: string): DiscoveryCandidate[] {
    const rows = companionId
      ? this.db.prepare('SELECT * FROM discovery_candidates WHERE user_id = ? AND companion_id = ? ORDER BY collected_at DESC LIMIT ?').all(userId, companionId, limit)
      : this.db.prepare('SELECT * FROM discovery_candidates WHERE user_id = ? ORDER BY collected_at DESC LIMIT ?').all(userId, limit);
    return (rows as Array<Record<string, unknown>>).map(mapDiscoveryCandidate);
  }

  listCompanionInsights(userId = 'default', limit = 20, companionId?: string): CompanionInsight[] {
    const rows = companionId
      ? this.db.prepare('SELECT * FROM companion_insights WHERE user_id = ? AND companion_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, companionId, limit)
      : this.db.prepare('SELECT * FROM companion_insights WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
    return (rows as Array<Record<string, unknown>>).map(mapCompanionInsight);
  }

  listExplorationEvents(cycleId?: string, limit = 50): ExplorationLoopEvent[] {
    if (cycleId) {
      return (this.db
        .prepare('SELECT * FROM exploration_loop_events WHERE cycle_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(cycleId, limit) as Array<Record<string, unknown>>).map(mapExplorationLoopEvent);
    }
    return (this.db
      .prepare('SELECT * FROM exploration_loop_events ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>).map(mapExplorationLoopEvent);
  }

  listExplorationEventsForCycle(cycleId: string): ExplorationLoopEvent[] {
    return (this.db
      .prepare('SELECT * FROM exploration_loop_events WHERE cycle_id = ? ORDER BY created_at ASC')
      .all(cycleId) as Array<Record<string, unknown>>).map(mapExplorationLoopEvent);
  }

  insertDiscoveryFeedback(feedback: DiscoveryFeedback): DiscoveryFeedback {
    this.db
      .prepare(
        `INSERT INTO discovery_feedback
         (id, user_id, companion_id, cycle_id, insight_id, discovery_candidate_id, value, note, feedback_domain, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        feedback.id,
        feedback.userId,
        feedback.companionId,
        feedback.cycleId,
        feedback.insightId ?? null,
        feedback.discoveryCandidateId ?? null,
        feedback.value,
        feedback.note ?? null,
        feedback.feedbackDomain ?? null,
        feedback.createdAt
      );
    return feedback;
  }

  listDiscoveryFeedback(
    limit = 100,
    domain?: DiscoveryFeedback['feedbackDomain'],
    companionId?: string
  ): DiscoveryFeedback[] {
    const rows = companionId && domain
      ? this.db.prepare(
          `SELECT * FROM discovery_feedback
           WHERE companion_id = ? AND feedback_domain = ?
           ORDER BY created_at DESC LIMIT ?`
        ).all(companionId, domain, limit)
      : companionId
        ? this.db.prepare(
            'SELECT * FROM discovery_feedback WHERE companion_id = ? ORDER BY created_at DESC LIMIT ?'
          ).all(companionId, limit)
        : domain
          ? this.db.prepare(
              'SELECT * FROM discovery_feedback WHERE feedback_domain = ? ORDER BY created_at DESC LIMIT ?'
            ).all(domain, limit)
          : this.db.prepare('SELECT * FROM discovery_feedback ORDER BY created_at DESC LIMIT ?').all(limit);
    return (rows as Array<Record<string, unknown>>).map(mapDiscoveryFeedback);
  }

  listInteractionFeedbackActions(limit = 20): string[] {
    return (this.db.prepare(
      `SELECT value FROM discovery_feedback WHERE feedback_domain = 'interaction' ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as Array<{ value: string }>).map((r) => r.value);
  }

  insertJourney(journey: Journey): Journey {
    this.db
      .prepare(
        `INSERT INTO journeys (id, title, description, status, started_at, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        journey.id,
        journey.title,
        journey.description ?? null,
        journey.status,
        journey.startedAt,
        journey.completedAt ?? null,
        journey.createdAt,
        journey.updatedAt
      );
    return journey;
  }

  listActiveJourneys(): Journey[] {
    return (this.db.prepare("SELECT * FROM journeys WHERE status = 'active' ORDER BY started_at DESC").all() as Array<
      Record<string, unknown>
    >).map(mapJourney);
  }

  insertMilestone(milestone: JourneyMilestone): JourneyMilestone {
    this.db
      .prepare(
        `INSERT INTO journey_milestones (id, journey_id, title, summary, type, occurred_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        milestone.id,
        milestone.journeyId,
        milestone.title,
        milestone.summary ?? null,
        milestone.type,
        milestone.occurredAt,
        milestone.createdAt
      );
    return milestone;
  }

  listMilestones(journeyId?: string): JourneyMilestone[] {
    const rows = journeyId
      ? this.db.prepare('SELECT * FROM journey_milestones WHERE journey_id = ? ORDER BY occurred_at DESC').all(journeyId)
      : this.db.prepare('SELECT * FROM journey_milestones ORDER BY occurred_at DESC').all();
    return (rows as Array<Record<string, unknown>>).map(mapMilestone);
  }

  insertDiary(entry: DiaryEntry): DiaryEntry {
    this.db
      .prepare(
        `INSERT INTO diary_entries (id, character_id, type, title, content, related_journey_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.characterId,
        entry.type,
        entry.title ?? null,
        entry.content,
        entry.relatedJourneyId ?? null,
        entry.createdAt
      );
    return entry;
  }

  listDiaryEntries(input: { characterId?: string; type?: DiaryEntry['type']; limit?: number } = {}): DiaryEntry[] {
    const limit = input.limit ?? 20;
    const rows = input.characterId && input.type
      ? this.db.prepare('SELECT * FROM diary_entries WHERE character_id = ? AND type = ? ORDER BY created_at DESC LIMIT ?').all(input.characterId, input.type, limit)
      : input.characterId
        ? this.db.prepare('SELECT * FROM diary_entries WHERE character_id = ? ORDER BY created_at DESC LIMIT ?').all(input.characterId, limit)
        : input.type
          ? this.db.prepare('SELECT * FROM diary_entries WHERE type = ? ORDER BY created_at DESC LIMIT ?').all(input.type, limit)
          : this.db.prepare('SELECT * FROM diary_entries ORDER BY created_at DESC LIMIT ?').all(limit);
    return (rows as Array<Record<string, unknown>>).map(mapDiary);
  }

  getAppSetting<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key) as
      | { value_json: string }
      | undefined;
    return row ? (JSON.parse(row.value_json) as T) : undefined;
  }

  setAppSetting<T>(key: string, value: T): T {
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .run(key, JSON.stringify(value), nowIso());
    return value;
  }

  getUser(): { id: string; username: string; displayName: string; email?: string; passwordHash: string; createdAt: string; updatedAt: string } | null {
    const row = this.db.prepare('SELECT * FROM users LIMIT 1').get() as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      username: String(row.username),
      displayName: String(row.display_name),
      email: row.email ? String(row.email) : undefined,
      passwordHash: String(row.password_hash),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  getUserByUsername(username: string): { id: string; username: string; displayName: string; email?: string; passwordHash: string; createdAt: string; updatedAt: string } | null {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      username: String(row.username),
      displayName: String(row.display_name),
      email: row.email ? String(row.email) : undefined,
      passwordHash: String(row.password_hash),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  createUser(input: { username: string; displayName: string; email?: string; password: string }): { id: string; username: string; displayName: string; email?: string; createdAt: string; updatedAt: string } {
    const existing = this.db.prepare('SELECT 1 FROM users WHERE username = ?').get(input.username);
    if (existing) throw new Error('Username already taken');
    const id = createId('user');
    const now = nowIso();
    this.db.prepare(
      `INSERT INTO users (id, username, display_name, email, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.username, input.displayName, input.email ?? null, input.password, now, now);
    return { id, username: input.username, displayName: input.displayName, email: input.email, createdAt: now, updatedAt: now };
  }

  getActionPermissions(): ActionPermissionState {
    return this.getAppSetting<ActionPermissionState>('action.permissions') ?? {
      browser: 'ask',
      automation: 'ask',
      files: 'ask',
      clipboard: 'ask',
      calendar: 'ask',
    };
  }

  setActionPermissions(state: ActionPermissionState): ActionPermissionState {
    return this.setAppSetting('action.permissions', state);
  }

  getCompanionRetentionDays(): number {
    return this.getAppSetting<number>('companion.chatRetentionDays') ?? COMPANION_CHAT_RETENTION_DAYS;
  }

  pruneCompanionMessages(retentionDays = this.getCompanionRetentionDays()): void {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare('DELETE FROM companion_messages WHERE created_at < ?').run(cutoff);
  }

  insertCompanionMessage(input: CompanionAppendMessageInput): CompanionMessage {
    const id = createId('msg');
    const now = nowIso();
    const characterId = this.resolveActiveCompanionId(input.characterId);
    this.db
      .prepare(
        `INSERT INTO companion_messages (id, character_id, session_id, role, content, source, status, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        characterId,
        input.sessionId ?? null,
        input.role,
        input.content,
        input.source,
        input.status ?? 'ok',
        input.metadata ? JSON.stringify(input.metadata) : null,
        now
      );
    this.pruneCompanionMessages();
    return {
      id,
      characterId,
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      source: input.source,
      status: input.status ?? 'ok',
      metadata: input.metadata,
      createdAt: now
    };
  }

  listCompanionMessages(input: CompanionHistoryInput = {}): CompanionMessage[] {
    const { characterId, limit = 200, source, status, query } = input;
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (characterId) {
      conditions.push('character_id = ?');
      params.push(characterId);
    }
    if (source && source !== 'all') {
      conditions.push('source = ?');
      params.push(source);
    }
    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (query) {
      conditions.push('content LIKE ?');
      params.push(`%${query}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    const rows = this.db
      .prepare(`SELECT * FROM companion_messages ${where} ORDER BY created_at ASC, rowid ASC LIMIT ?`)
      .all(...params) as Array<Record<string, unknown>>;
    return rows.map(mapCompanionMessage);
  }

  listCompanionContext(characterId: string, limit: number): CompanionMessage[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM companion_messages
         WHERE character_id = ? AND status = 'ok' AND role IN ('user', 'assistant')
         ORDER BY created_at DESC, rowid DESC LIMIT ?`
      )
      .all(characterId, limit) as Array<Record<string, unknown>>;
    return rows.map(mapCompanionMessage).reverse();
  }

  clearCompanionMessages(characterId?: string): void {
    if (characterId) {
      this.db.prepare('DELETE FROM companion_messages WHERE character_id = ?').run(characterId);
    } else {
      this.db.prepare('DELETE FROM companion_messages').run();
    }
  }

  resetDebugData(input: DebugDataResetInput): DebugDataResetResult {
    const targets = expandResetTargets(input.targets);
    const clearedTables = new Set<string>();

    const clearTable = (table: string) => {
      this.db.prepare(`DELETE FROM ${table}`).run();
      clearedTables.add(table);
    };

    this.db.exec('BEGIN');
    try {
      if (targets.includes('chat')) {
        clearTable('companion_messages');
      }
      if (targets.includes('diary')) {
        clearTable('diary_entries');
      }
      if (targets.includes('journeys')) {
        clearTable('journey_milestones');
        clearTable('journeys');
      }
      if (targets.includes('memory')) {
        clearTable('memory_edges');
        clearTable('memory_processing_state');
        clearTable('memory_nodes');
      }
      if (targets.includes('discoveries')) {
        clearTable('discovery_seen_identity');
        clearTable('discoveries');
        this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(DISCOVERY_ANNOUNCED_KEY);
        clearedTables.add('app_settings.discovery_announced');
      }
      if (targets.includes('autonomy')) {
        clearTable('discovery_base_feedback');
        clearTable('discovery_bases');
        clearTable('engine_traces');
        clearTable('discovery_feedback');
        clearTable('exploration_loop_events');
        clearTable('exploration_cycles');
        clearTable('companion_insights');
        clearTable('discovery_candidates');
        clearTable('web_page_evidence');
        clearTable('research_search_records');
        clearTable('research_plans');
        clearTable('research_intents');
        clearTable('curiosity_targets');
        clearTable('patterns');
        clearTable('interest_edges');
        clearTable('interest_nodes');
        this.db.prepare("DELETE FROM app_settings WHERE key LIKE 'interestGraph.%'").run();
        clearedTables.add('app_settings.interest_graph');
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return {
      targets,
      clearedTables: [...clearedTables],
      completedAt: nowIso()
    };
  }

  // ─── Relationship ────────────────────────────────────────────────────────

  getRelationship(userId: string, companionId: string): UserCompanionRelationship {
    const row = this.db
      .prepare('SELECT * FROM companion_relationships WHERE user_id = ? AND companion_id = ?')
      .get(userId, companionId) as Record<string, unknown> | undefined;
    if (!row) {
      const now = nowIso();
      const defaultRel: UserCompanionRelationship = {
        userId,
        companionId,
        familiarity: 0.1,
        trust: 0.1,
        comfort: 0.1,
        preferredInteractionFrequency: 'normal',
        preferredInteractionStyle: 'balanced',
        recentPositiveInteractions: 0,
        recentIgnoredInteractions: 0,
        recentCorrections: 0,
        sharedExperienceIds: [],
        knownBoundaries: [],
        updatedAt: now
      };
      this.saveRelationship(defaultRel);
      return defaultRel;
    }
    return mapRelationship(row);
  }

  saveRelationship(rel: UserCompanionRelationship): UserCompanionRelationship {
    this.db.prepare(
      `INSERT INTO companion_relationships
       (user_id, companion_id, familiarity, trust, comfort, preferred_interaction_frequency,
        preferred_interaction_style, recent_positive_interactions, recent_ignored_interactions,
        recent_corrections, shared_experience_ids_json, known_boundaries_json,
        last_meaningful_interaction_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, companion_id) DO UPDATE SET
         familiarity = excluded.familiarity, trust = excluded.trust, comfort = excluded.comfort,
         preferred_interaction_frequency = excluded.preferred_interaction_frequency,
         preferred_interaction_style = excluded.preferred_interaction_style,
         recent_positive_interactions = excluded.recent_positive_interactions,
         recent_ignored_interactions = excluded.recent_ignored_interactions,
         recent_corrections = excluded.recent_corrections,
         shared_experience_ids_json = excluded.shared_experience_ids_json,
         known_boundaries_json = excluded.known_boundaries_json,
         last_meaningful_interaction_at = excluded.last_meaningful_interaction_at,
         updated_at = excluded.updated_at`
    ).run(
      rel.userId, rel.companionId,
      unitToScore100(rel.familiarity), unitToScore100(rel.trust), unitToScore100(rel.comfort),
      rel.preferredInteractionFrequency, rel.preferredInteractionStyle,
      rel.recentPositiveInteractions, rel.recentIgnoredInteractions, rel.recentCorrections,
      JSON.stringify(rel.sharedExperienceIds), JSON.stringify(rel.knownBoundaries),
      rel.lastMeaningfulInteractionAt ?? null, rel.updatedAt
    );
    return rel;
  }

  // ─── Conversation Sessions ───────────────────────────────────────────────

  createConversationSession(companionId: string, userId = 'local'): ConversationSessionRecord {
    const id = createId('session');
    const now = nowIso();
    const session: ConversationSessionRecord = {
      id,
      companionId,
      userId,
      phase: 'opening',
      startedAt: now,
      lastMessageAt: now,
      updatedAt: now
    };
    this.db.prepare(
      `INSERT INTO conversation_sessions (id, companion_id, user_id, phase, started_at, last_message_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, companionId, userId, session.phase, now, now, now);
    return session;
  }

  getActiveConversationSession(companionId: string, userId = 'local'): ConversationSessionRecord | null {
    const row = this.db.prepare(
      `SELECT * FROM conversation_sessions WHERE companion_id = ? AND user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
    ).get(companionId, userId) as Record<string, unknown> | undefined;
    return row ? mapConversationSession(row) : null;
  }

  listActiveConversationSessions(userId = 'local'): ConversationSessionRecord[] {
    return (this.db.prepare(
      `SELECT * FROM conversation_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC`
    ).all(userId) as Array<Record<string, unknown>>).map(mapConversationSession);
  }

  closeConversationSession(
    sessionId: string,
    closeReason: SessionCloseReason,
    unfinishedTopic?: string
  ): ConversationSessionRecord {
    const now = nowIso();
    this.db.prepare(
      `UPDATE conversation_sessions SET phase = 'inactive', updated_at = ?, ended_at = ?, close_reason = ?, unfinished_topic = ? WHERE id = ?`
    ).run(now, now, closeReason, unfinishedTopic ?? null, sessionId);
    const row = this.db.prepare('SELECT * FROM conversation_sessions WHERE id = ?').get(sessionId) as Record<string, unknown>;
    return mapConversationSession(row);
  }

  insertPendingAction(action: PendingCompanionAction, userId = 'local'): PendingCompanionAction {
    this.db.prepare(
      `INSERT INTO pending_companion_actions
       (id, companion_id, user_id, decision_json, discovery_id, created_at, expires_at, status, defer_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      action.id,
      action.companionId,
      userId,
      JSON.stringify(action.decision),
      action.discoveryId ?? null,
      action.createdAt,
      action.expiresAt,
      action.status,
      action.deferReason ?? null
    );
    return action;
  }

  updatePendingActionStatus(id: string, status: PendingCompanionAction['status']): void {
    this.db.prepare('UPDATE pending_companion_actions SET status = ? WHERE id = ?').run(status, id);
  }

  /** Used only to roll back an uncommitted creation attempt. */
  rollbackCompanionCreation(id: string): void {
    this.db.exec('BEGIN');
    try {
      this.db.prepare(
        `DELETE FROM discovery_base_feedback
         WHERE discovery_base_id IN (
           SELECT id FROM discovery_bases WHERE companion_id = ?
         )`,
      ).run(id);
      this.db.prepare('DELETE FROM discovery_bases WHERE companion_id = ?').run(id);
      this.db.prepare('DELETE FROM companions WHERE id = ?').run(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  updatePendingActionDeferReason(id: string, deferReason: string): void {
    this.db.prepare('UPDATE pending_companion_actions SET defer_reason = ? WHERE id = ?').run(deferReason, id);
  }

  listPendingActions(companionId: string, userId = 'local'): PendingCompanionAction[] {
    return (this.db.prepare(
      `SELECT * FROM pending_companion_actions WHERE companion_id = ? AND user_id = ? AND status IN ('pending', 'ready') ORDER BY created_at ASC`
    ).all(companionId, userId) as Array<Record<string, unknown>>).map(mapPendingAction);
  }

  listAllPendingActions(userId = 'local'): PendingCompanionAction[] {
    return (this.db.prepare(
      `SELECT * FROM pending_companion_actions WHERE user_id = ? AND status IN ('pending', 'ready') ORDER BY created_at ASC`
    ).all(userId) as Array<Record<string, unknown>>).map(mapPendingAction);
  }

  updateConversationSessionPhase(sessionId: string, phase: ConversationPhase): ConversationSessionRecord {
    const now = nowIso();
    const endedAt = phase === 'inactive' || phase === 'closing' ? now : null;
    this.db.prepare(
      `UPDATE conversation_sessions SET phase = ?, updated_at = ?, ended_at = COALESCE(ended_at, ?) WHERE id = ?`
    ).run(phase, now, endedAt, sessionId);
    const row = this.db.prepare('SELECT * FROM conversation_sessions WHERE id = ?').get(sessionId) as Record<string, unknown>;
    return mapConversationSession(row);
  }
}

function expandResetTargets(targets: DebugDataResetTarget[]): DebugDataResetTarget[] {
  const expanded = new Set<DebugDataResetTarget>();
  for (const target of targets) {
    if (target === 'all_debug_data') {
      for (const item of ALL_DEBUG_DATA_TARGETS) expanded.add(item);
    } else {
      expanded.add(target);
    }
  }
  return [...expanded];
}

function mapMemoryNode(row: Record<string, unknown>): MemoryNode {
  return {
    id: String(row.id),
    type: row.type as MemoryNode['type'],
    title: String(row.title),
    summary: row.summary ? String(row.summary) : undefined,
    content: row.content ? String(row.content) : undefined,
    importance: score100ToUnit(Number(row.importance_score)),
    source: row.source ? String(row.source) : undefined,
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    isPinned: Number(row.is_pinned) === 1,
    isMarkedWrong: Number(row.is_marked_wrong) === 1,
    companionId: row.companion_id ? String(row.companion_id) : undefined,
    userId: row.user_id ? String(row.user_id) : undefined,
    memoryType: row.memory_type ? (row.memory_type as MemoryNode['memoryType']) : undefined,
    metadata: row.metadata_json ? JSON.parse(String(row.metadata_json)) : undefined,
    fingerprint: row.memory_fingerprint ? String(row.memory_fingerprint) : undefined,
    confidence: row.confidence === undefined ? undefined : Number(row.confidence),
    observationCount: row.observation_count === undefined ? undefined : Number(row.observation_count),
    lastObservedAt: row.last_observed_at ? String(row.last_observed_at) : undefined,
    status: (row.memory_status ? String(row.memory_status) : (Number(row.is_marked_wrong) === 1 ? 'superseded' : 'active')) as MemoryNode['status'],
    canonicalKey: row.canonical_key ? String(row.canonical_key) : undefined,
    sourceMessageIds: JSON.parse(String(row.source_message_ids_json ?? '[]')) as string[],
    emotionalWeight: row.emotional_weight === null || row.emotional_weight === undefined ? undefined : Number(row.emotional_weight),
    accessCount: row.access_count === undefined ? 0 : Number(row.access_count),
    lastAccessedAt: row.last_accessed_at ? String(row.last_accessed_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    compressedAt: row.compressed_at ? String(row.compressed_at) : undefined
  };
}

function mapMemoryProcessingState(row: Record<string, unknown>): MemoryProcessingState {
  return {
    memoryId: String(row.memory_id),
    companionId: String(row.companion_id),
    contentHash: String(row.content_hash),
    revision: Number(row.revision),
    processedRevision: Number(row.processed_revision),
    processedAt: row.processed_at ? String(row.processed_at) : undefined,
    deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
  };
}

function mapRelationship(row: Record<string, unknown>): UserCompanionRelationship {
  return {
    userId: String(row.user_id),
    companionId: String(row.companion_id),
    familiarity: score100ToUnit(Number(row.familiarity)),
    trust: score100ToUnit(Number(row.trust)),
    comfort: score100ToUnit(Number(row.comfort)),
    preferredInteractionFrequency: row.preferred_interaction_frequency as UserCompanionRelationship['preferredInteractionFrequency'],
    preferredInteractionStyle: row.preferred_interaction_style as UserCompanionRelationship['preferredInteractionStyle'],
    recentPositiveInteractions: Number(row.recent_positive_interactions),
    recentIgnoredInteractions: Number(row.recent_ignored_interactions),
    recentCorrections: Number(row.recent_corrections),
    sharedExperienceIds: JSON.parse(String(row.shared_experience_ids_json ?? '[]')),
    knownBoundaries: JSON.parse(String(row.known_boundaries_json ?? '[]')),
    lastMeaningfulInteractionAt: row.last_meaningful_interaction_at ? String(row.last_meaningful_interaction_at) : undefined,
    updatedAt: String(row.updated_at)
  };
}

function mapConversationSession(row: Record<string, unknown>): ConversationSessionRecord {
  return {
    id: String(row.id),
    companionId: String(row.companion_id),
    userId: String(row.user_id),
    phase: row.phase as ConversationSessionRecord['phase'],
    startedAt: String(row.started_at),
    endedAt: row.ended_at ? String(row.ended_at) : undefined,
    lastMessageAt: row.last_message_at ? String(row.last_message_at) : undefined,
    updatedAt: String(row.updated_at),
    closeReason: row.close_reason ? (row.close_reason as ConversationSessionRecord['closeReason']) : undefined,
    unfinishedTopic: row.unfinished_topic ? String(row.unfinished_topic) : undefined
  };
}

function mapPendingAction(row: Record<string, unknown>): PendingCompanionAction {
  return {
    id: String(row.id),
    companionId: String(row.companion_id),
    decision: JSON.parse(String(row.decision_json)) as CompanionDecision,
    discoveryId: row.discovery_id ? String(row.discovery_id) : undefined,
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    status: row.status as PendingCompanionAction['status'],
    deferReason: row.defer_reason ? String(row.defer_reason) : undefined
  };
}

function mapDiscovery(row: Record<string, unknown>): Discovery {
  return {
    id: String(row.id),
    source: row.source as Discovery['source'],
    externalId: row.external_id ? String(row.external_id) : undefined,
    title: String(row.title),
    summary: row.summary ? String(row.summary) : undefined,
    url: row.url ? String(row.url) : undefined,
    canonicalUrl: row.canonical_url ? String(row.canonical_url) : undefined,
    publishedAt: row.published_at ? String(row.published_at) : undefined,
    tags: JSON.parse(String(row.tags_json ?? '[]')),
    raw: row.raw_json ? JSON.parse(String(row.raw_json)) : {},
    fingerprint: row.fingerprint ? String(row.fingerprint) : undefined,
    userInterestScore: score100ToUnit(Number(row.interest_score)),
    userHistoryScore: score100ToUnit(Number(row.history_score)),
    characterExpertiseScore: score100ToUnit(Number(row.expertise_score)),
    noveltyScore: score100ToUnit(Number(row.novelty_score)),
    usefulnessScore: score100ToUnit(Number(row.usefulness_score)),
    finalScore: score100ToUnit(Number(row.final_score)),
    status: row.status as Discovery['status'],
    whyThisMatters: row.why_this_matters ? String(row.why_this_matters) : undefined,
    recommendedAction: row.recommended_action as Discovery['recommendedAction'],
    shortMessage: row.short_message ? String(row.short_message) : undefined,
    companionId: row.companion_id ? String(row.companion_id) : undefined,
    cycleId: row.cycle_id ? String(row.cycle_id) : undefined,
    presentationCommandId: row.presentation_command_id ? String(row.presentation_command_id) : undefined,
    eligibleAt: row.eligible_at ? String(row.eligible_at) : undefined,
    queuedAt: row.queued_at ? String(row.queued_at) : undefined,
    presentingAt: row.presenting_at ? String(row.presenting_at) : undefined,
    announcedAt: row.announced_at ? String(row.announced_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
    statusReason: row.status_reason ? String(row.status_reason) : undefined,
    createdAt: String(row.created_at)
  };
}

function mapEngineTrace(row: Record<string, unknown>): EngineTrace {
  return {
    id: String(row.id),
    correlationId: String(row.correlation_id),
    causationId: row.causation_id ? String(row.causation_id) : undefined,
    cycleId: row.cycle_id ? String(row.cycle_id) : undefined,
    companionId: String(row.companion_id),
    engine: String(row.engine),
    operation: String(row.operation),
    providerMode: row.provider_mode as EngineTrace['providerMode'],
    inputRefs: JSON.parse(String(row.input_refs_json ?? '[]')),
    outputRefs: JSON.parse(String(row.output_refs_json ?? '[]')),
    stateBeforeHash: row.state_before_hash ? String(row.state_before_hash) : undefined,
    stateAfterHash: row.state_after_hash ? String(row.state_after_hash) : undefined,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? undefined : Number(row.duration_ms),
    status: row.status as EngineTrace['status'],
    skipReason: row.skip_reason ? String(row.skip_reason) : undefined,
    error: row.error ? String(row.error) : undefined
  };
}

function mapPattern(row: Record<string, unknown>): Pattern {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companionId: String(row.companion_id ?? 'default'),
    semanticFingerprint: String(row.semantic_fingerprint ?? ''),
    normalizedTopics: JSON.parse(String(row.normalized_topics_json ?? '[]')),
    type: row.type as Pattern['type'],
    title: String(row.title),
    summary: String(row.summary),
    confidence: Number(row.confidence),
    strength: Number(row.strength),
    freshness: Number(row.freshness),
    evidence: JSON.parse(String(row.evidence_json ?? '[]')),
    observationCount: Number(row.observation_count ?? 1),
    frequency: Number(row.frequency ?? 0),
    lastObservedAt: String(row.last_observed_at || row.updated_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapInterestNode(row: Record<string, unknown>): InterestNode {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    label: String(row.label),
    description: row.description ? String(row.description) : undefined,
    type: row.type as InterestNode['type'],
    weight: Number(row.weight),
    confidence: Number(row.confidence),
    freshness: Number(row.freshness),
    source: row.source as InterestNode['source'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapInterestEdge(row: Record<string, unknown>): InterestEdge {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    fromNodeId: String(row.from_node_id),
    toNodeId: String(row.to_node_id),
    relation: row.relation as InterestEdge['relation'],
    weight: Number(row.weight),
    confidence: Number(row.confidence),
    createdAt: String(row.created_at)
  };
}

function mapCuriosityTarget(row: Record<string, unknown>): CuriosityTarget {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companionId: String(row.companion_id),
    topic: String(row.topic),
    topicFingerprint: String(row.topic_fingerprint ?? ''),
    sourceFingerprint: String(row.source_fingerprint ?? ''),
    generatedFromIds: JSON.parse(String(row.generated_from_ids_json ?? '[]')),
    description: String(row.description),
    source: row.source as CuriosityTarget['source'],
    explorationType: row.exploration_type as CuriosityTarget['explorationType'],
    priority: Number(row.priority),
    confidence: Number(row.confidence),
    reason: String(row.reason),
    expectedValue: String(row.expected_value),
    relatedMemoryIds: JSON.parse(String(row.related_memory_ids_json ?? '[]')),
    relatedPatternIds: JSON.parse(String(row.related_pattern_ids_json ?? '[]')),
    relatedInterestNodeIds: JSON.parse(String(row.related_interest_node_ids_json ?? '[]')),
    status: (row.status ?? 'open') as CuriosityTarget['status'],
    lastGeneratedAt: row.last_generated_at ? String(row.last_generated_at) : undefined,
    lastExploredAt: row.last_explored_at ? String(row.last_explored_at) : undefined,
    cooldownUntil: row.cooldown_until ? String(row.cooldown_until) : undefined,
    generationCount: Number(row.generation_count ?? 1),
    ignoreCount: Number(row.ignore_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at || row.created_at),
  };
}

function mapResearchIntent(row: Record<string, unknown>): ResearchIntent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companionId: String(row.companion_id),
    cycleId: String(row.cycle_id),
    curiosityTargetId: String(row.curiosity_target_id),
    topic: String(row.topic),
    objective: row.objective as ResearchIntent['objective'],
    preferredSourceTypes: JSON.parse(String(row.preferred_source_types_json ?? '[]')),
    domainHints: JSON.parse(String(row.domain_hints_json ?? '[]')),
    excludedDomains: JSON.parse(String(row.excluded_domains_json ?? '[]')),
    freshnessDays: row.freshness_days === null || row.freshness_days === undefined ? undefined : Number(row.freshness_days),
    evidenceRequirements: JSON.parse(String(row.evidence_requirements_json)),
    createdAt: String(row.created_at)
  };
}

function mapResearchPlan(row: Record<string, unknown>): ResearchPlan {
  const outcome = JSON.parse(String(row.outcome_json ?? '{}')) as ResearchPlan['outcome'];
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companionId: String(row.companion_id),
    cycleId: String(row.cycle_id),
    researchIntentId: String(row.research_intent_id),
    queries: JSON.parse(String(row.queries_json ?? '[]')),
    selectedCapabilities: JSON.parse(String(row.selected_capabilities_json ?? '[]')),
    limits: JSON.parse(String(row.limits_json)),
    createdAt: String(row.created_at),
    ...(outcome && typeof outcome.stopReason === 'string' ? { outcome } : {})
  };
}

function mapResearchSearchRecord(row: Record<string, unknown>): ResearchSearchRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companionId: String(row.companion_id),
    cycleId: String(row.cycle_id),
    researchIntentId: String(row.research_intent_id),
    researchPlanId: String(row.research_plan_id),
    query: String(row.query),
    provider: String(row.provider),
    mode: row.mode as ResearchSearchRecord['mode'],
    status: row.status as ResearchSearchRecord['status'],
    resultCount: Number(row.result_count),
    createdAt: String(row.created_at),
    errorCode: row.error_code ? String(row.error_code) : undefined
  };
}

function mapWebPageEvidence(row: Record<string, unknown>): WebPageEvidence {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companionId: String(row.companion_id),
    cycleId: String(row.cycle_id),
    researchIntentId: String(row.research_intent_id),
    researchPlanId: String(row.research_plan_id),
    searchResultId: String(row.search_result_id),
    query: String(row.query),
    provider: String(row.provider),
    url: String(row.url),
    canonicalUrl: String(row.canonical_url),
    domain: String(row.domain),
    title: String(row.title),
    extractedText: String(row.extracted_text),
    excerpt: String(row.excerpt),
    contentHash: String(row.content_hash),
    contentType: String(row.content_type),
    fetchedAt: String(row.fetched_at),
    publishedAt: row.published_at ? String(row.published_at) : undefined,
    sourceType: row.source_type as WebPageEvidence['sourceType']
  };
}

function mapDiscoveryCandidate(row: Record<string, unknown>): DiscoveryCandidate {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companionId: String(row.companion_id),
    title: String(row.title),
    summary: String(row.summary),
    sourceType: row.source_type as DiscoveryCandidate['sourceType'],
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    sourceName: row.source_name ? String(row.source_name) : undefined,
    agentType: row.agent_type as DiscoveryCandidate['agentType'],
    relatedCuriosityTargetId: String(row.related_curiosity_target_id),
    relevanceScore: Number(row.relevance_score),
    noveltyScore: Number(row.novelty_score),
    evidenceScore: Number(row.evidence_score),
    usefulnessScore: Number(row.usefulness_score),
    researchPlanId: row.research_plan_id ? String(row.research_plan_id) : undefined,
    evidenceIds: JSON.parse(String(row.evidence_ids_json ?? '[]')),
    rawEvidence: row.raw_evidence ? String(row.raw_evidence) : undefined,
    collectedAt: String(row.collected_at)
  };
}

function mapCompanionInsight(row: Record<string, unknown>): CompanionInsight {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companionId: String(row.companion_id),
    title: String(row.title),
    type: row.type as CompanionInsight['type'],
    summary: String(row.summary),
    insight: String(row.insight),
    whyItMatters: String(row.why_it_matters),
    whyCompanionFoundIt: String(row.why_ann_found_it),
    confidence: Number(row.confidence),
    novelty: Number(row.novelty),
    emotionalRelevance: Number(row.emotional_relevance),
    practicalRelevance: Number(row.practical_relevance),
    supportingCandidateIds: JSON.parse(String(row.supporting_candidate_ids_json ?? '[]')),
    relatedMemoryIds: JSON.parse(String(row.related_memory_ids_json ?? '[]')),
    relatedPatternIds: JSON.parse(String(row.related_pattern_ids_json ?? '[]')),
    suggestedQuestion: row.suggested_question ? String(row.suggested_question) : undefined,
    suggestedAction: row.suggested_action ? String(row.suggested_action) : undefined,
    narration: row.narration ? String(row.narration) : undefined,
    createdAt: String(row.created_at)
  };
}

function mapExplorationCycle(row: Record<string, unknown>): ExplorationCycle {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companionId: String(row.companion_id),
    trigger: row.trigger as ExplorationCycle['trigger'],
    state: row.state as ExplorationCycle['state'],
    curiosityTargetIds: JSON.parse(String(row.curiosity_target_ids_json ?? '[]')),
    selectedCuriosityTargetId: row.selected_curiosity_target_id ? String(row.selected_curiosity_target_id) : undefined,
    researchIntentId: row.research_intent_id ? String(row.research_intent_id) : undefined,
    researchPlanId: row.research_plan_id ? String(row.research_plan_id) : undefined,
    discoveryCandidateIds: JSON.parse(String(row.discovery_candidate_ids_json ?? '[]')),
    insightIds: JSON.parse(String(row.insight_ids_json ?? '[]')),
    selectedInsightId: row.selected_insight_id ? String(row.selected_insight_id) : undefined,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined
  };
}

function mapExplorationLoopEvent(row: Record<string, unknown>): ExplorationLoopEvent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companionId: String(row.companion_id),
    cycleId: String(row.cycle_id),
    state: row.state as ExplorationLoopEvent['state'],
    message: row.message ? String(row.message) : undefined,
    metadata: row.metadata_json ? (JSON.parse(String(row.metadata_json)) as Record<string, unknown>) : undefined,
    createdAt: String(row.created_at)
  };
}

function mapDiscoveryFeedback(row: Record<string, unknown>): DiscoveryFeedback {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companionId: String(row.companion_id),
    cycleId: String(row.cycle_id),
    insightId: row.insight_id ? String(row.insight_id) : undefined,
    discoveryCandidateId: row.discovery_candidate_id ? String(row.discovery_candidate_id) : undefined,
    value: row.value as DiscoveryFeedback['value'],
    note: row.note ? String(row.note) : undefined,
    feedbackDomain: row.feedback_domain ? (row.feedback_domain as DiscoveryFeedback['feedbackDomain']) : undefined,
    createdAt: String(row.created_at)
  };
}

function mapJourney(row: Record<string, unknown>): Journey {
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description ? String(row.description) : undefined,
    status: row.status as Journey['status'],
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapMilestone(row: Record<string, unknown>): JourneyMilestone {
  return {
    id: String(row.id),
    journeyId: String(row.journey_id),
    title: String(row.title),
    summary: row.summary ? String(row.summary) : undefined,
    type: row.type as JourneyMilestone['type'],
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at)
  };
}

function mapDiary(row: Record<string, unknown>): DiaryEntry {
  return {
    id: String(row.id),
    characterId: String(row.character_id),
    type: row.type as DiaryEntry['type'],
    title: row.title ? String(row.title) : undefined,
    content: String(row.content),
    relatedJourneyId: row.related_journey_id ? String(row.related_journey_id) : undefined,
    createdAt: String(row.created_at)
  };
}

function mapCompanionMessage(row: Record<string, unknown>): CompanionMessage {
  return {
    id: String(row.id),
    characterId: String(row.character_id),
    role: row.role as CompanionMessage['role'],
    content: String(row.content),
    source: row.source as CompanionMessage['source'],
    status: row.status as CompanionMessage['status'],
    metadata: row.metadata_json ? (JSON.parse(String(row.metadata_json)) as Record<string, unknown>) : undefined,
    createdAt: String(row.created_at)
  };
}

function createInitialCharacterStateLocal(characterId: string) {
  return {
    characterId,
    coreState: 'idle' as const,
    intent: 'waiting' as const,
    emotion: {
      neutral: 70, curious: 35, happy: 20, excited: 0,
      shy: 45, confused: 0, focused: 50, tired: 10,
      proud: 0, concerned: 0
    },
    position: { x: 120, y: 320 },
    lastActivityAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function mapCompanionProfile(row: Record<string, unknown>): CompanionProfile {
  return {
    id: String(row.id),
    name: String(row.name),
    personalityDescription: row.personality_description ? String(row.personality_description) : '',
    personality: JSON.parse(String(row.personality_json || '{}')) as CompanionPersonality,
    assetRoot: String(row.asset_root),
    isPrimary: Number(row.is_primary) === 1,
    isBuiltIn: Number(row.is_builtin) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapNetworkCompanionLink(row: Record<string, unknown>): NetworkCompanionLink {
  return {
    serverOrigin: String(row.server_origin), networkAccountId: String(row.network_account_id), localCompanionId: String(row.local_companion_id), networkCompanionId: String(row.network_companion_id),
    activeAssetPackId: row.active_asset_pack_id ? String(row.active_asset_pack_id) : undefined,
    lastPublishedManifestHash: row.last_manifest_hash ? String(row.last_manifest_hash) : undefined,
    lastPublishedAt: row.last_published_at ? String(row.last_published_at) : undefined,
    publishStatus: row.publish_status ? String(row.publish_status) : undefined,
  };
}

function mapCachedNetworkAssetPack(row: Record<string, unknown>): CachedAssetPack & { cacheRoot: string } {
  return {
    serverOrigin: String(row.server_origin), assetPackId: String(row.asset_pack_id), networkCompanionId: String(row.network_companion_id), manifestHash: String(row.manifest_hash), cacheRoot: String(row.cache_root),
    totalBytes: Number(row.total_bytes), downloadedAt: String(row.downloaded_at), lastUsedAt: String(row.last_used_at), pinned: Number(row.pinned) === 1, verified: Number(row.verified) === 1,
  };
}

function mapDeveloperDebugEvent(row: Record<string, unknown>): import('@our-companion/shared').DeveloperDebugEvent {
  return {
    id: String(row.id),
    kind: String(row.kind) as import('@our-companion/shared').DeveloperDebugEventKind,
    operation: row.operation ? String(row.operation) : undefined,
    status: row.status ? String(row.status) : undefined,
    provider: row.provider ? String(row.provider) : undefined,
    model: row.model ? String(row.model) : undefined,
    companionId: row.companion_id ? String(row.companion_id) : undefined,
    correlationId: row.correlation_id ? String(row.correlation_id) : undefined,
    cycleId: row.cycle_id ? String(row.cycle_id) : undefined,
    turnId: row.turn_id ? String(row.turn_id) : undefined,
    summary: row.summary ? String(row.summary) : undefined,
    payload: row.payload_json ? JSON.parse(String(row.payload_json)) : undefined,
    errorCode: row.error_code ? String(row.error_code) : undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    createdAt: String(row.created_at),
    syncStatus: String(row.sync_status) as 'pending' | 'uploading' | 'uploaded',
    syncAttemptCount: Number(row.sync_attempt_count),
    lastSyncAttemptAt: row.last_sync_attempt_at ? String(row.last_sync_attempt_at) : undefined,
    uploadedAt: row.uploaded_at ? String(row.uploaded_at) : undefined,
  };
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
