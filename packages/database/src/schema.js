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
  behavior_rules_json TEXT NOT NULL,
  FOREIGN KEY(character_id) REFERENCES characters(id)
);

CREATE TABLE IF NOT EXISTS character_state (
  character_id TEXT PRIMARY KEY,
  core_state TEXT NOT NULL,
  emotion_json TEXT NOT NULL,
  intent TEXT NOT NULL,
  position_json TEXT,
  last_activity_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(character_id) REFERENCES characters(id)
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
  shared_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diary_entries (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  related_journey_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(character_id) REFERENCES characters(id)
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

CREATE INDEX IF NOT EXISTS idx_memory_nodes_type ON memory_nodes(type);
CREATE INDEX IF NOT EXISTS idx_memory_edges_from ON memory_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_to ON memory_edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_discoveries_score ON discoveries(final_score);
CREATE INDEX IF NOT EXISTS idx_discoveries_status ON discoveries(status);
`;
