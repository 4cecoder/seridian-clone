-- Seridian Local Memory Schema
-- SQLite database for agent orchestration, caching, and offline autonomy

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  capacity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'idle',
  last_heartbeat INTEGER,
  last_claimed_work TEXT,
  created_at INTEGER,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY,
  lane TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  claimed_by TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  dependencies TEXT,
  result TEXT,
  priority TEXT DEFAULT 'medium',
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  turn INTEGER,
  timestamp INTEGER,
  decision TEXT NOT NULL,
  reasoning TEXT,
  confidence REAL,
  metrics TEXT,
  synced INTEGER DEFAULT 0,
  FOREIGN KEY(agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS memory_snapshots (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  data TEXT NOT NULL,
  timestamp INTEGER,
  UNIQUE(entity_type, entity_id, timestamp)
);

CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY,
  timestamp INTEGER,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost REAL,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  direction TEXT,
  entity_type TEXT,
  entity_id TEXT,
  timestamp INTEGER,
  status TEXT,
  error TEXT
);

-- Crash recovery: tracks work items still 'claimed' across an unclean
-- orchestrator restart (missing ~/.seridian/.clean_shutdown marker), so a
-- crash doesn't either silently strand a claim forever or blindly reassign
-- work that's actually still in progress. Pattern borrowed from
-- hermes-agent's session-lifecycle resume_pending/stuck-loop design.
CREATE TABLE IF NOT EXISTS crash_recovery (
  work_item_id TEXT PRIMARY KEY,
  first_flagged_at INTEGER,
  last_flagged_at INTEGER,
  restart_count INTEGER DEFAULT 1,
  resolved INTEGER DEFAULT 0
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_work_items_lane ON work_items(lane);
CREATE INDEX IF NOT EXISTS idx_work_items_claimed ON work_items(claimed_by);
CREATE INDEX IF NOT EXISTS idx_checkpoints_agent ON checkpoints(agent_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_synced ON checkpoints(synced);
CREATE INDEX IF NOT EXISTS idx_memory_snapshots_entity ON memory_snapshots(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
