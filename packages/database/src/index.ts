import { DatabaseSync } from 'node:sqlite';
import type {
  CharacterProfile,
  CharacterRuntimeState,
  CompanionAppendMessageInput,
  CompanionHistoryInput,
  CompanionInsight,
  CompanionMessage,
  CuriosityTarget,
  DebugDataResetInput,
  DebugDataResetResult,
  DebugDataResetTarget,
  DiaryEntry,
  Discovery,
  DiscoveryCandidate,
  DiscoveryFeedback,
  DiscoveryStatus,
  ExplorationCycle,
  ExplorationLoopEvent,
  ExplorationPlan,
  InterestEdge,
  InterestGraph,
  InterestNode,
  Journey,
  JourneyMilestone,
  MemoryEdge,
  MemoryNode,
  Pattern
} from '@our-companion/shared';
import type { ActionPermissionState } from '@our-companion/shared';
import { COMPANION_CHAT_RETENTION_DAYS, DEFAULT_CHARACTER_ID, createId, nowIso } from '@our-companion/shared';
import { createInitialCharacterState } from '@our-companion/character-engine';
import { sqliteSchema } from './schema';

const DISCOVERY_ANNOUNCED_KEY = 'discovery.announcedIds';
const MAX_ANNOUNCED_DISCOVERY_IDS = 500;
const ALL_DEBUG_DATA_TARGETS: DebugDataResetTarget[] = ['discoveries', 'memory', 'journeys', 'diary', 'chat', 'autonomy'];

type SqliteDatabase = DatabaseSync;

export interface DatabaseServiceOptions {
  path?: string;
}

export class DatabaseService {
  private readonly db: SqliteDatabase;

  constructor(options: DatabaseServiceOptions = {}) {
    this.db = new DatabaseSync(options.path ?? ':memory:');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(sqliteSchema);
    this.seedAnn();
  }

  close(): void {
    this.db.close();
  }

  seedAnn(): void {
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO characters (id, name, package_id, is_primary, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(DEFAULT_CHARACTER_ID, 'Ann', 'ann', 1, 1, timestamp, timestamp);

    this.db
      .prepare(
        `INSERT OR IGNORE INTO character_profiles
         (character_id, core_personality_json, expertise_json, speaking_style_json, behavior_rules_json)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        DEFAULT_CHARACTER_ID,
        JSON.stringify(['introverted', 'curious', 'warm', 'observant']),
        JSON.stringify(['web', 'frontend', 'ux']),
        JSON.stringify({ tone: 'warm', length: 'short', avoid: ['romantic', 'clingy', 'preachy'] }),
        JSON.stringify({ movement: 25, discovery: 35, curiosity: 80, focus: 85, shyness: 70, reflection: 95 })
      );

    const state = createInitialCharacterState(DEFAULT_CHARACTER_ID);
    this.saveCharacterState(state);
  }

  getCharacterState(characterId = DEFAULT_CHARACTER_ID): CharacterRuntimeState {
    const row = this.db
      .prepare('SELECT * FROM character_state WHERE character_id = ?')
      .get(characterId) as Record<string, unknown> | undefined;
    if (!row) return createInitialCharacterState(characterId);
    return {
      characterId: String(row.character_id),
      coreState: row.core_state as CharacterRuntimeState['coreState'],
      emotion: JSON.parse(String(row.emotion_json)),
      intent: row.intent as CharacterRuntimeState['intent'],
      position: row.position_json ? JSON.parse(String(row.position_json)) : undefined,
      lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : undefined,
      updatedAt: String(row.updated_at)
    };
  }

  saveCharacterState(state: CharacterRuntimeState): CharacterRuntimeState {
    this.db
      .prepare(
        `INSERT INTO character_state
         (character_id, core_state, emotion_json, intent, position_json, last_activity_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(character_id) DO UPDATE SET
           core_state = excluded.core_state,
           emotion_json = excluded.emotion_json,
           intent = excluded.intent,
           position_json = excluded.position_json,
           last_activity_at = excluded.last_activity_at,
           updated_at = excluded.updated_at`
      )
      .run(
        state.characterId,
        state.coreState,
        JSON.stringify(state.emotion),
        state.intent,
        state.position ? JSON.stringify(state.position) : null,
        state.lastActivityAt ?? null,
        state.updatedAt ?? nowIso()
      );
    return state;
  }

  getActiveCharacters(): CharacterProfile[] {
    const rows = this.db
      .prepare(
        `SELECT c.*, p.core_personality_json, p.expertise_json, p.speaking_style_json
         FROM characters c
         JOIN character_profiles p ON p.character_id = c.id
         WHERE c.is_active = 1
         ORDER BY c.is_primary DESC, c.created_at ASC
         LIMIT 3`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      packageId: String(row.package_id),
      isPrimary: Number(row.is_primary) === 1,
      isActive: Number(row.is_active) === 1,
      corePersonality: JSON.parse(String(row.core_personality_json)),
      expertise: JSON.parse(String(row.expertise_json)),
      speakingStyle: JSON.parse(String(row.speaking_style_json))
    }));
  }

  getCharacterBehaviorRules(characterId = DEFAULT_CHARACTER_ID): Record<string, unknown> {
    const row = this.db
      .prepare('SELECT behavior_rules_json FROM character_profiles WHERE character_id = ?')
      .get(characterId) as { behavior_rules_json: string } | undefined;
    return row ? (JSON.parse(row.behavior_rules_json) as Record<string, unknown>) : {};
  }

  setPrimaryCharacter(characterId: string): CharacterProfile {
    this.db.prepare('UPDATE characters SET is_primary = 0').run();
    this.db.prepare('UPDATE characters SET is_primary = 1 WHERE id = ?').run(characterId);
    const character = this.getActiveCharacters().find((item) => item.id === characterId);
    if (!character) throw new Error(`Character not found: ${characterId}`);
    return character;
  }

  insertMemoryNode(node: MemoryNode): MemoryNode {
    this.db
      .prepare(
        `INSERT INTO memory_nodes
         (id, type, title, summary, content, importance_score, source, source_url, is_pinned, is_marked_wrong, created_at, updated_at, compressed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        node.id,
        node.type,
        node.title,
        node.summary ?? null,
        node.content ?? null,
        node.importanceScore,
        node.source ?? null,
        node.sourceUrl ?? null,
        node.isPinned ? 1 : 0,
        node.isMarkedWrong ? 1 : 0,
        node.createdAt,
        node.updatedAt,
        node.compressedAt ?? null
      );
    return node;
  }

  updateMemoryNode(node: MemoryNode): MemoryNode {
    this.db
      .prepare(
        `UPDATE memory_nodes SET
          type = ?, title = ?, summary = ?, content = ?, importance_score = ?, source = ?, source_url = ?,
          is_pinned = ?, is_marked_wrong = ?, updated_at = ?, compressed_at = ?
         WHERE id = ?`
      )
      .run(
        node.type,
        node.title,
        node.summary ?? null,
        node.content ?? null,
        node.importanceScore,
        node.source ?? null,
        node.sourceUrl ?? null,
        node.isPinned ? 1 : 0,
        node.isMarkedWrong ? 1 : 0,
        node.updatedAt,
        node.compressedAt ?? null,
        node.id
      );
    return node;
  }

  deleteMemoryNode(id: string): void {
    this.db.prepare('DELETE FROM memory_edges WHERE from_node_id = ? OR to_node_id = ?').run(id, id);
    this.db.prepare('DELETE FROM memory_nodes WHERE id = ?').run(id);
  }

  getMemoryNode(id: string): MemoryNode | undefined {
    const row = this.db.prepare('SELECT * FROM memory_nodes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapMemoryNode(row) : undefined;
  }

  listMemoryNodes(): MemoryNode[] {
    return (this.db.prepare('SELECT * FROM memory_nodes ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>).map(
      mapMemoryNode
    );
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

  listMemoryEdges(): MemoryEdge[] {
    return (this.db.prepare('SELECT * FROM memory_edges ORDER BY created_at DESC').all() as Array<Record<string, unknown>>).map(
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
        `INSERT OR REPLACE INTO discoveries
         (id, source, external_id, title, summary, url, tags_json, raw_json, interest_score, history_score, expertise_score,
          novelty_score, usefulness_score, final_score, status, why_this_matters, recommended_action, short_message, shared_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        discovery.id,
        discovery.source,
        discovery.externalId ?? null,
        discovery.title,
        discovery.summary ?? null,
        discovery.url ?? null,
        JSON.stringify(discovery.tags),
        JSON.stringify(discovery.raw),
        discovery.userInterestScore,
        discovery.userHistoryScore,
        discovery.characterExpertiseScore,
        discovery.noveltyScore,
        discovery.usefulnessScore,
        discovery.finalScore,
        discovery.status,
        discovery.whyThisMatters ?? null,
        discovery.recommendedAction ?? null,
        discovery.shortMessage ?? null,
        discovery.sharedAt ?? null,
        discovery.createdAt
      );
    return discovery;
  }

  updateDiscoveryStatus(id: string, status: DiscoveryStatus): Discovery {
    this.db.prepare('UPDATE discoveries SET status = ? WHERE id = ?').run(status, id);
    const discovery = this.getDiscovery(id);
    if (!discovery) throw new Error(`Discovery not found: ${id}`);
    return discovery;
  }

  getDiscovery(id: string): Discovery | undefined {
    const row = this.db.prepare('SELECT * FROM discoveries WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapDiscovery(row) : undefined;
  }

  listDiscoveries(input: { status?: DiscoveryStatus; limit?: number } = {}): Discovery[] {
    const limit = input.limit ?? 20;
    const rows = input.status
      ? this.db
          .prepare('SELECT * FROM discoveries WHERE status = ? ORDER BY final_score DESC LIMIT ?')
          .all(input.status, limit)
      : this.db.prepare('SELECT * FROM discoveries ORDER BY final_score DESC LIMIT ?').all(limit);
    return (rows as Array<Record<string, unknown>>).map(mapDiscovery);
  }

  countSharedToday(): number {
    const today = new Date().toISOString().slice(0, 10);
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM discoveries WHERE status = 'shared' AND shared_at LIKE ?")
      .get(`${today}%`) as { count: number };
    return Number(row.count);
  }

  getAnnouncedDiscoveryIds(): string[] {
    return this.getAppSetting<string[]>(DISCOVERY_ANNOUNCED_KEY) ?? [];
  }

  isDiscoveryAnnounced(id: string): boolean {
    return this.getAnnouncedDiscoveryIds().includes(id);
  }

  markDiscoveryAnnounced(id: string): void {
    const announced = this.getAnnouncedDiscoveryIds();
    if (announced.includes(id)) return;
    const next = [...announced, id].slice(-MAX_ANNOUNCED_DISCOVERY_IDS);
    this.setAppSetting(DISCOVERY_ANNOUNCED_KEY, next);
  }

  listUnannouncedShared(limit = 20): Discovery[] {
    const announced = new Set(this.getAnnouncedDiscoveryIds());
    return this.listDiscoveries({ status: 'shared', limit: limit + announced.size })
      .filter((discovery) => !announced.has(discovery.id))
      .slice(0, limit);
  }

  insertPattern(pattern: Pattern): Pattern {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO patterns
         (id, user_id, type, title, summary, confidence, strength, freshness, evidence_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        pattern.id,
        pattern.userId,
        pattern.type,
        pattern.title,
        pattern.summary,
        pattern.confidence,
        pattern.strength,
        pattern.freshness,
        JSON.stringify(pattern.evidence),
        pattern.createdAt,
        pattern.updatedAt
      );
    return pattern;
  }

  listPatterns(userId = 'default', limit = 20): Pattern[] {
    return (this.db.prepare('SELECT * FROM patterns WHERE user_id = ? ORDER BY strength DESC LIMIT ?').all(userId, limit) as Array<
      Record<string, unknown>
    >).map(mapPattern);
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

  insertCuriosityTarget(target: CuriosityTarget): CuriosityTarget {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO curiosity_targets
         (id, user_id, companion_id, topic, description, source, exploration_type, priority, confidence, reason, expected_value,
          related_memory_ids_json, related_pattern_ids_json, related_interest_node_ids_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        target.id,
        target.userId,
        target.companionId,
        target.topic,
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
        target.createdAt
      );
    return target;
  }

  getCuriosityTarget(id: string): CuriosityTarget | undefined {
    const row = this.db.prepare('SELECT * FROM curiosity_targets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapCuriosityTarget(row) : undefined;
  }

  insertExplorationPlan(plan: ExplorationPlan): ExplorationPlan {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO exploration_plans
         (id, curiosity_target_id, objective, agents_json, search_queries_json, constraints_json, max_candidates_per_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        plan.id,
        plan.curiosityTargetId,
        plan.objective,
        JSON.stringify(plan.agents),
        JSON.stringify(plan.searchQueries),
        JSON.stringify(plan.constraints ?? []),
        plan.maxCandidatesPerAgent,
        plan.createdAt
      );
    return plan;
  }

  getExplorationPlan(id: string): ExplorationPlan | undefined {
    const row = this.db.prepare('SELECT * FROM exploration_plans WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? mapExplorationPlan(row) : undefined;
  }

  insertDiscoveryCandidate(candidate: DiscoveryCandidate): DiscoveryCandidate {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO discovery_candidates
         (id, user_id, companion_id, title, summary, source_type, source_url, source_name, agent_type, related_curiosity_target_id,
          relevance_score, novelty_score, evidence_score, usefulness_score, raw_evidence, collected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        insight.whyAnnFoundIt,
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
         (id, user_id, companion_id, trigger, state, curiosity_target_ids_json, selected_curiosity_target_id, exploration_plan_id,
          discovery_candidate_ids_json, insight_ids_json, selected_insight_id, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        cycle.id,
        cycle.userId,
        cycle.companionId,
        cycle.trigger,
        cycle.state,
        JSON.stringify(cycle.curiosityTargetIds),
        cycle.selectedCuriosityTargetId ?? null,
        cycle.explorationPlanId ?? null,
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

  insertDiscoveryFeedback(feedback: DiscoveryFeedback): DiscoveryFeedback {
    this.db
      .prepare(
        `INSERT INTO discovery_feedback
         (id, user_id, companion_id, cycle_id, insight_id, discovery_candidate_id, value, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        feedback.createdAt
      );
    return feedback;
  }

  listDiscoveryFeedback(limit = 100): DiscoveryFeedback[] {
    return (this.db.prepare('SELECT * FROM discovery_feedback ORDER BY created_at DESC LIMIT ?').all(limit) as Array<
      Record<string, unknown>
    >).map(mapDiscoveryFeedback);
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

  listDiaryEntries(input: { type?: DiaryEntry['type']; limit?: number } = {}): DiaryEntry[] {
    const limit = input.limit ?? 20;
    const rows = input.type
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
    const characterId = input.characterId ?? DEFAULT_CHARACTER_ID;
    this.db
      .prepare(
        `INSERT INTO companion_messages (id, character_id, role, content, source, status, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        characterId,
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
        clearTable('memory_nodes');
      }
      if (targets.includes('discoveries')) {
        clearTable('discoveries');
        this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(DISCOVERY_ANNOUNCED_KEY);
        clearedTables.add('app_settings.discovery_announced');
      }
      if (targets.includes('autonomy')) {
        clearTable('discovery_feedback');
        clearTable('exploration_loop_events');
        clearTable('exploration_cycles');
        clearTable('companion_insights');
        clearTable('discovery_candidates');
        clearTable('exploration_plans');
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
    importanceScore: Number(row.importance_score),
    source: row.source ? String(row.source) : undefined,
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    isPinned: Number(row.is_pinned) === 1,
    isMarkedWrong: Number(row.is_marked_wrong) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    compressedAt: row.compressed_at ? String(row.compressed_at) : undefined
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
    tags: JSON.parse(String(row.tags_json ?? '[]')),
    raw: row.raw_json ? JSON.parse(String(row.raw_json)) : {},
    userInterestScore: Number(row.interest_score),
    userHistoryScore: Number(row.history_score),
    characterExpertiseScore: Number(row.expertise_score),
    noveltyScore: Number(row.novelty_score),
    usefulnessScore: Number(row.usefulness_score),
    finalScore: Number(row.final_score),
    status: row.status as Discovery['status'],
    whyThisMatters: row.why_this_matters ? String(row.why_this_matters) : undefined,
    recommendedAction: row.recommended_action as Discovery['recommendedAction'],
    shortMessage: row.short_message ? String(row.short_message) : undefined,
    sharedAt: row.shared_at ? String(row.shared_at) : undefined,
    createdAt: String(row.created_at)
  };
}

function mapPattern(row: Record<string, unknown>): Pattern {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: row.type as Pattern['type'],
    title: String(row.title),
    summary: String(row.summary),
    confidence: Number(row.confidence),
    strength: Number(row.strength),
    freshness: Number(row.freshness),
    evidence: JSON.parse(String(row.evidence_json ?? '[]')),
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
    createdAt: String(row.created_at)
  };
}

function mapExplorationPlan(row: Record<string, unknown>): ExplorationPlan {
  return {
    id: String(row.id),
    curiosityTargetId: String(row.curiosity_target_id),
    objective: row.objective as ExplorationPlan['objective'],
    agents: JSON.parse(String(row.agents_json ?? '[]')),
    searchQueries: JSON.parse(String(row.search_queries_json ?? '[]')),
    constraints: JSON.parse(String(row.constraints_json ?? '[]')),
    maxCandidatesPerAgent: Number(row.max_candidates_per_agent),
    createdAt: String(row.created_at)
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
    whyAnnFoundIt: String(row.why_ann_found_it),
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
    explorationPlanId: row.exploration_plan_id ? String(row.exploration_plan_id) : undefined,
    discoveryCandidateIds: JSON.parse(String(row.discovery_candidate_ids_json ?? '[]')),
    insightIds: JSON.parse(String(row.insight_ids_json ?? '[]')),
    selectedInsightId: row.selected_insight_id ? String(row.selected_insight_id) : undefined,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined
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
