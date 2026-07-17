export const sqliteSchema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  package_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_profiles (
  character_id TEXT PRIMARY KEY,
  core_personality_json TEXT NOT NULL,
  expertise_json TEXT NOT NULL,
  speaking_style_json TEXT NOT NULL,
  behavior_rules_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_state (
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

CREATE TABLE IF NOT EXISTS journeys (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journey_milestones (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(journey_id) REFERENCES journeys(id)
);

CREATE TABLE IF NOT EXISTS memory_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  importance_score REAL NOT NULL DEFAULT 0,
  source TEXT,
  source_url TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_marked_wrong INTEGER NOT NULL DEFAULT 0,
  companion_id TEXT,
  user_id TEXT DEFAULT 'local',
  memory_type TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  compressed_at TEXT
);

CREATE TABLE IF NOT EXISTS memory_edges (
  id TEXT PRIMARY KEY,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.8,
  created_at TEXT NOT NULL,
  FOREIGN KEY(from_node_id) REFERENCES memory_nodes(id),
  FOREIGN KEY(to_node_id) REFERENCES memory_nodes(id)
);

CREATE TABLE IF NOT EXISTS discoveries (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT,
  interest_score REAL NOT NULL DEFAULT 0,
  history_score REAL NOT NULL DEFAULT 0,
  expertise_score REAL NOT NULL DEFAULT 0,
  novelty_score REAL NOT NULL DEFAULT 0,
  usefulness_score REAL NOT NULL DEFAULT 0,
  final_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'candidate',
  why_this_matters TEXT,
  recommended_action TEXT,
  short_message TEXT,
  companion_id TEXT,
  cycle_id TEXT,
  presentation_command_id TEXT,
  eligible_at TEXT,
  queued_at TEXT,
  presenting_at TEXT,
  announced_at TEXT,
  updated_at TEXT,
  status_reason TEXT,
  -- Retained only so existing databases can be migrated to announced_at.
  shared_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS engine_traces (
  id TEXT PRIMARY KEY,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  cycle_id TEXT,
  companion_id TEXT NOT NULL,
  engine TEXT NOT NULL,
  operation TEXT NOT NULL,
  provider_mode TEXT NOT NULL,
  input_refs_json TEXT NOT NULL DEFAULT '[]',
  output_refs_json TEXT NOT NULL DEFAULT '[]',
  state_before_hash TEXT,
  state_after_hash TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms REAL,
  status TEXT NOT NULL,
  skip_reason TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  confidence REAL NOT NULL,
  strength REAL NOT NULL,
  freshness REAL NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interest_nodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  weight REAL NOT NULL,
  confidence REAL NOT NULL,
  freshness REAL NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interest_edges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL NOT NULL,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS curiosity_targets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL,
  exploration_type TEXT NOT NULL,
  priority REAL NOT NULL,
  confidence REAL NOT NULL,
  reason TEXT NOT NULL,
  expected_value TEXT NOT NULL,
  related_memory_ids_json TEXT NOT NULL DEFAULT '[]',
  related_pattern_ids_json TEXT NOT NULL DEFAULT '[]',
  related_interest_node_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  curiosity_target_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  objective TEXT NOT NULL,
  preferred_source_types_json TEXT NOT NULL DEFAULT '[]',
  domain_hints_json TEXT NOT NULL DEFAULT '[]',
  excluded_domains_json TEXT NOT NULL DEFAULT '[]',
  freshness_days INTEGER,
  evidence_requirements_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  research_intent_id TEXT NOT NULL,
  queries_json TEXT NOT NULL DEFAULT '[]',
  selected_capabilities_json TEXT NOT NULL DEFAULT '[]',
  limits_json TEXT NOT NULL,
  created_at TEXT NOT NULL
  ,outcome_json TEXT NOT NULL DEFAULT '{}'
);

-- Search payloads are deliberately transient. This table contains only
-- observability metadata and never stores result URLs, titles, snippets, or ranks.
CREATE TABLE IF NOT EXISTS research_search_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  research_intent_id TEXT NOT NULL,
  research_plan_id TEXT NOT NULL,
  query TEXT NOT NULL,
  provider TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  result_count INTEGER NOT NULL,
  domains_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS web_page_evidence (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  research_intent_id TEXT NOT NULL,
  research_plan_id TEXT NOT NULL,
  search_result_id TEXT NOT NULL,
  query TEXT NOT NULL,
  provider TEXT NOT NULL,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content_type TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  published_at TEXT,
  source_type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discovery_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  source_name TEXT,
  agent_type TEXT NOT NULL,
  related_curiosity_target_id TEXT NOT NULL,
  relevance_score REAL NOT NULL,
  novelty_score REAL NOT NULL,
  evidence_score REAL NOT NULL,
  usefulness_score REAL NOT NULL,
  research_plan_id TEXT,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  raw_evidence TEXT,
  collected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companion_insights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  insight TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  why_ann_found_it TEXT NOT NULL,
  confidence REAL NOT NULL,
  novelty REAL NOT NULL,
  emotional_relevance REAL NOT NULL,
  practical_relevance REAL NOT NULL,
  supporting_candidate_ids_json TEXT NOT NULL DEFAULT '[]',
  related_memory_ids_json TEXT NOT NULL DEFAULT '[]',
  related_pattern_ids_json TEXT NOT NULL DEFAULT '[]',
  suggested_question TEXT,
  suggested_action TEXT,
  narration TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exploration_cycles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  state TEXT NOT NULL,
  curiosity_target_ids_json TEXT NOT NULL DEFAULT '[]',
  selected_curiosity_target_id TEXT,
  research_intent_id TEXT,
  research_plan_id TEXT,
  discovery_candidate_ids_json TEXT NOT NULL DEFAULT '[]',
  insight_ids_json TEXT NOT NULL DEFAULT '[]',
  selected_insight_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS exploration_loop_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  state TEXT NOT NULL,
  message TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discovery_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  insight_id TEXT,
  discovery_candidate_id TEXT,
  value TEXT NOT NULL,
  note TEXT,
  feedback_domain TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diary_entries (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  related_journey_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_history (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companion_messages (
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

CREATE TABLE IF NOT EXISTS conversation_sessions (
  id TEXT PRIMARY KEY,
  companion_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'local',
  phase TEXT NOT NULL DEFAULT 'inactive',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  last_message_at TEXT,
  updated_at TEXT NOT NULL,
  close_reason TEXT,
  unfinished_topic TEXT
);

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

CREATE TABLE IF NOT EXISTS companion_relationships (
  user_id TEXT NOT NULL DEFAULT 'local',
  companion_id TEXT NOT NULL,
  familiarity REAL NOT NULL DEFAULT 0,
  trust REAL NOT NULL DEFAULT 0,
  comfort REAL NOT NULL DEFAULT 0,
  preferred_interaction_frequency TEXT NOT NULL DEFAULT 'normal',
  preferred_interaction_style TEXT NOT NULL DEFAULT 'balanced',
  recent_positive_interactions INTEGER NOT NULL DEFAULT 0,
  recent_ignored_interactions INTEGER NOT NULL DEFAULT 0,
  recent_corrections INTEGER NOT NULL DEFAULT 0,
  shared_experience_ids_json TEXT NOT NULL DEFAULT '[]',
  known_boundaries_json TEXT NOT NULL DEFAULT '[]',
  last_meaningful_interaction_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, companion_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_nodes_type ON memory_nodes(type);
CREATE INDEX IF NOT EXISTS idx_memory_edges_from ON memory_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_to ON memory_edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_discoveries_score ON discoveries(final_score);
CREATE INDEX IF NOT EXISTS idx_discoveries_status ON discoveries(status);
CREATE INDEX IF NOT EXISTS idx_engine_traces_correlation ON engine_traces(correlation_id, started_at);
CREATE INDEX IF NOT EXISTS idx_engine_traces_cycle ON engine_traces(cycle_id, started_at);
CREATE INDEX IF NOT EXISTS idx_engine_traces_companion ON engine_traces(companion_id, started_at);
CREATE INDEX IF NOT EXISTS idx_patterns_user ON patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_interest_nodes_user ON interest_nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_curiosity_targets_user ON curiosity_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_exploration_cycles_state ON exploration_cycles(state);
CREATE INDEX IF NOT EXISTS idx_exploration_events_cycle ON exploration_loop_events(cycle_id);
CREATE INDEX IF NOT EXISTS idx_discovery_feedback_cycle ON discovery_feedback(cycle_id);
CREATE INDEX IF NOT EXISTS idx_companion_messages_created ON companion_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companion_messages_character_created ON companion_messages(character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_companion ON conversation_sessions(companion_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_companion ON pending_companion_actions(companion_id, status);

CREATE TABLE IF NOT EXISTS companions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  personality_description TEXT,
  personality_json TEXT NOT NULL DEFAULT '{}',
  asset_root TEXT NOT NULL DEFAULT 'assets/companions/default',
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  settings_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_companions_primary ON companions(is_primary);

CREATE TABLE IF NOT EXISTS network_companion_links (
  server_origin TEXT NOT NULL,
  network_account_id TEXT NOT NULL,
  local_companion_id TEXT NOT NULL,
  network_companion_id TEXT NOT NULL,
  active_asset_pack_id TEXT,
  last_manifest_hash TEXT,
  last_published_at TEXT,
  publish_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (server_origin, network_account_id, local_companion_id),
  UNIQUE (server_origin, network_account_id, network_companion_id)
);
CREATE TABLE IF NOT EXISTS network_asset_cache (
  server_origin TEXT NOT NULL,
  asset_pack_id TEXT NOT NULL,
  network_companion_id TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  cache_root TEXT NOT NULL,
  total_bytes INTEGER NOT NULL,
  downloaded_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (server_origin, asset_pack_id)
);
CREATE INDEX IF NOT EXISTS idx_network_asset_cache_lru ON network_asset_cache(last_used_at);
`;
