import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_CHARACTER_ID, nowIso } from '@our-companion/shared';
import { createInitialCharacterState } from '@our-companion/character-engine';
import { sqliteSchema } from './schema';
export class DatabaseService {
    db;
    constructor(options = {}) {
        this.db = new DatabaseSync(options.path ?? ':memory:');
        this.db.exec('PRAGMA foreign_keys = ON');
        this.db.exec(sqliteSchema);
        this.seedAnn();
    }
    close() {
        this.db.close();
    }
    seedAnn() {
        const timestamp = nowIso();
        this.db
            .prepare(`INSERT OR IGNORE INTO characters (id, name, package_id, is_primary, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(DEFAULT_CHARACTER_ID, 'Ann', 'ann', 1, 1, timestamp, timestamp);
        this.db
            .prepare(`INSERT OR IGNORE INTO character_profiles
         (character_id, core_personality_json, expertise_json, speaking_style_json, behavior_rules_json)
         VALUES (?, ?, ?, ?, ?)`)
            .run(DEFAULT_CHARACTER_ID, JSON.stringify(['introverted', 'curious', 'warm', 'observant']), JSON.stringify(['web', 'frontend', 'ux']), JSON.stringify({ tone: 'warm', length: 'short', avoid: ['romantic', 'clingy', 'preachy'] }), JSON.stringify({ movement: 25, discovery: 35, curiosity: 80, focus: 85, shyness: 70, reflection: 95 }));
        const state = createInitialCharacterState(DEFAULT_CHARACTER_ID);
        this.saveCharacterState(state);
    }
    getCharacterState(characterId = DEFAULT_CHARACTER_ID) {
        const row = this.db
            .prepare('SELECT * FROM character_state WHERE character_id = ?')
            .get(characterId);
        if (!row)
            return createInitialCharacterState(characterId);
        return {
            characterId: String(row.character_id),
            coreState: row.core_state,
            emotion: JSON.parse(String(row.emotion_json)),
            intent: row.intent,
            position: row.position_json ? JSON.parse(String(row.position_json)) : undefined,
            lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : undefined,
            updatedAt: String(row.updated_at)
        };
    }
    saveCharacterState(state) {
        this.db
            .prepare(`INSERT INTO character_state
         (character_id, core_state, emotion_json, intent, position_json, last_activity_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(character_id) DO UPDATE SET
           core_state = excluded.core_state,
           emotion_json = excluded.emotion_json,
           intent = excluded.intent,
           position_json = excluded.position_json,
           last_activity_at = excluded.last_activity_at,
           updated_at = excluded.updated_at`)
            .run(state.characterId, state.coreState, JSON.stringify(state.emotion), state.intent, state.position ? JSON.stringify(state.position) : null, state.lastActivityAt ?? null, state.updatedAt ?? nowIso());
        return state;
    }
    getActiveCharacters() {
        const rows = this.db
            .prepare(`SELECT c.*, p.core_personality_json, p.expertise_json, p.speaking_style_json
         FROM characters c
         JOIN character_profiles p ON p.character_id = c.id
         WHERE c.is_active = 1
         ORDER BY c.is_primary DESC, c.created_at ASC
         LIMIT 3`)
            .all();
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
    getCharacterBehaviorRules(characterId = DEFAULT_CHARACTER_ID) {
        const row = this.db
            .prepare('SELECT behavior_rules_json FROM character_profiles WHERE character_id = ?')
            .get(characterId);
        return row ? JSON.parse(row.behavior_rules_json) : {};
    }
    setPrimaryCharacter(characterId) {
        this.db.prepare('UPDATE characters SET is_primary = 0').run();
        this.db.prepare('UPDATE characters SET is_primary = 1 WHERE id = ?').run(characterId);
        const character = this.getActiveCharacters().find((item) => item.id === characterId);
        if (!character)
            throw new Error(`Character not found: ${characterId}`);
        return character;
    }
    insertMemoryNode(node) {
        this.db
            .prepare(`INSERT INTO memory_nodes
         (id, type, title, summary, content, importance_score, source, source_url, is_pinned, is_marked_wrong, created_at, updated_at, compressed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(node.id, node.type, node.title, node.summary ?? null, node.content ?? null, node.importanceScore, node.source ?? null, node.sourceUrl ?? null, node.isPinned ? 1 : 0, node.isMarkedWrong ? 1 : 0, node.createdAt, node.updatedAt, node.compressedAt ?? null);
        return node;
    }
    updateMemoryNode(node) {
        this.db
            .prepare(`UPDATE memory_nodes SET
          type = ?, title = ?, summary = ?, content = ?, importance_score = ?, source = ?, source_url = ?,
          is_pinned = ?, is_marked_wrong = ?, updated_at = ?, compressed_at = ?
         WHERE id = ?`)
            .run(node.type, node.title, node.summary ?? null, node.content ?? null, node.importanceScore, node.source ?? null, node.sourceUrl ?? null, node.isPinned ? 1 : 0, node.isMarkedWrong ? 1 : 0, node.updatedAt, node.compressedAt ?? null, node.id);
        return node;
    }
    deleteMemoryNode(id) {
        this.db.prepare('DELETE FROM memory_edges WHERE from_node_id = ? OR to_node_id = ?').run(id, id);
        this.db.prepare('DELETE FROM memory_nodes WHERE id = ?').run(id);
    }
    getMemoryNode(id) {
        const row = this.db.prepare('SELECT * FROM memory_nodes WHERE id = ?').get(id);
        return row ? mapMemoryNode(row) : undefined;
    }
    listMemoryNodes() {
        return this.db.prepare('SELECT * FROM memory_nodes ORDER BY updated_at DESC').all().map(mapMemoryNode);
    }
    insertMemoryEdge(edge) {
        this.db
            .prepare(`INSERT INTO memory_edges (id, from_node_id, to_node_id, relation_type, confidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`)
            .run(edge.id, edge.fromNodeId, edge.toNodeId, edge.relationType, edge.confidence, edge.createdAt);
        return edge;
    }
    listMemoryEdges() {
        return this.db.prepare('SELECT * FROM memory_edges ORDER BY created_at DESC').all().map((row) => ({
            id: String(row.id),
            fromNodeId: String(row.from_node_id),
            toNodeId: String(row.to_node_id),
            relationType: row.relation_type,
            confidence: Number(row.confidence),
            createdAt: String(row.created_at)
        }));
    }
    insertDiscovery(discovery) {
        this.db
            .prepare(`INSERT OR REPLACE INTO discoveries
         (id, source, external_id, title, summary, url, tags_json, raw_json, interest_score, history_score, expertise_score,
          novelty_score, usefulness_score, final_score, status, why_this_matters, recommended_action, short_message, shared_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(discovery.id, discovery.source, discovery.externalId ?? null, discovery.title, discovery.summary ?? null, discovery.url ?? null, JSON.stringify(discovery.tags), JSON.stringify(discovery.raw), discovery.userInterestScore, discovery.userHistoryScore, discovery.characterExpertiseScore, discovery.noveltyScore, discovery.usefulnessScore, discovery.finalScore, discovery.status, discovery.whyThisMatters ?? null, discovery.recommendedAction ?? null, discovery.shortMessage ?? null, discovery.sharedAt ?? null, discovery.createdAt);
        return discovery;
    }
    updateDiscoveryStatus(id, status) {
        this.db.prepare('UPDATE discoveries SET status = ? WHERE id = ?').run(status, id);
        const discovery = this.getDiscovery(id);
        if (!discovery)
            throw new Error(`Discovery not found: ${id}`);
        return discovery;
    }
    getDiscovery(id) {
        const row = this.db.prepare('SELECT * FROM discoveries WHERE id = ?').get(id);
        return row ? mapDiscovery(row) : undefined;
    }
    listDiscoveries(input = {}) {
        const limit = input.limit ?? 20;
        const rows = input.status
            ? this.db
                .prepare('SELECT * FROM discoveries WHERE status = ? ORDER BY final_score DESC LIMIT ?')
                .all(input.status, limit)
            : this.db.prepare('SELECT * FROM discoveries ORDER BY final_score DESC LIMIT ?').all(limit);
        return rows.map(mapDiscovery);
    }
    countSharedToday() {
        const today = new Date().toISOString().slice(0, 10);
        const row = this.db
            .prepare("SELECT COUNT(*) as count FROM discoveries WHERE status = 'shared' AND shared_at LIKE ?")
            .get(`${today}%`);
        return Number(row.count);
    }
    insertJourney(journey) {
        this.db
            .prepare(`INSERT INTO journeys (id, title, description, status, started_at, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(journey.id, journey.title, journey.description ?? null, journey.status, journey.startedAt, journey.completedAt ?? null, journey.createdAt, journey.updatedAt);
        return journey;
    }
    listActiveJourneys() {
        return this.db.prepare("SELECT * FROM journeys WHERE status = 'active' ORDER BY started_at DESC").all().map(mapJourney);
    }
    insertMilestone(milestone) {
        this.db
            .prepare(`INSERT INTO journey_milestones (id, journey_id, title, summary, type, occurred_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(milestone.id, milestone.journeyId, milestone.title, milestone.summary ?? null, milestone.type, milestone.occurredAt, milestone.createdAt);
        return milestone;
    }
    listMilestones(journeyId) {
        const rows = journeyId
            ? this.db.prepare('SELECT * FROM journey_milestones WHERE journey_id = ? ORDER BY occurred_at DESC').all(journeyId)
            : this.db.prepare('SELECT * FROM journey_milestones ORDER BY occurred_at DESC').all();
        return rows.map(mapMilestone);
    }
    insertDiary(entry) {
        this.db
            .prepare(`INSERT INTO diary_entries (id, character_id, type, title, content, related_journey_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(entry.id, entry.characterId, entry.type, entry.title ?? null, entry.content, entry.relatedJourneyId ?? null, entry.createdAt);
        return entry;
    }
    listDiaryEntries(input = {}) {
        const limit = input.limit ?? 20;
        const rows = input.type
            ? this.db.prepare('SELECT * FROM diary_entries WHERE type = ? ORDER BY created_at DESC LIMIT ?').all(input.type, limit)
            : this.db.prepare('SELECT * FROM diary_entries ORDER BY created_at DESC LIMIT ?').all(limit);
        return rows.map(mapDiary);
    }
    getAppSetting(key) {
        const row = this.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key);
        return row ? JSON.parse(row.value_json) : undefined;
    }
    setAppSetting(key, value) {
        this.db
            .prepare(`INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`)
            .run(key, JSON.stringify(value), nowIso());
        return value;
    }
}
function mapMemoryNode(row) {
    return {
        id: String(row.id),
        type: row.type,
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
function mapDiscovery(row) {
    return {
        id: String(row.id),
        source: row.source,
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
        status: row.status,
        whyThisMatters: row.why_this_matters ? String(row.why_this_matters) : undefined,
        recommendedAction: row.recommended_action,
        shortMessage: row.short_message ? String(row.short_message) : undefined,
        sharedAt: row.shared_at ? String(row.shared_at) : undefined,
        createdAt: String(row.created_at)
    };
}
function mapJourney(row) {
    return {
        id: String(row.id),
        title: String(row.title),
        description: row.description ? String(row.description) : undefined,
        status: row.status,
        startedAt: String(row.started_at),
        completedAt: row.completed_at ? String(row.completed_at) : undefined,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at)
    };
}
function mapMilestone(row) {
    return {
        id: String(row.id),
        journeyId: String(row.journey_id),
        title: String(row.title),
        summary: row.summary ? String(row.summary) : undefined,
        type: row.type,
        occurredAt: String(row.occurred_at),
        createdAt: String(row.created_at)
    };
}
function mapDiary(row) {
    return {
        id: String(row.id),
        characterId: String(row.character_id),
        type: row.type,
        title: row.title ? String(row.title) : undefined,
        content: String(row.content),
        relatedJourneyId: row.related_journey_id ? String(row.related_journey_id) : undefined,
        createdAt: String(row.created_at)
    };
}
