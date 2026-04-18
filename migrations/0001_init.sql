-- Migration: 0001_init.sql
-- Run with: wrangler d1 execute votekick-db --file=migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  weight REAL NOT NULL DEFAULT 1.0,
  last_message_at INTEGER,
  last_weight_update_at INTEGER,
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS votes (
  vote_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  target_username TEXT,
  target_first_name TEXT,
  initiator_user_id TEXT NOT NULL,
  initiator_username TEXT,
  initiator_message_id INTEGER,
  target_message_id INTEGER,
  yes_weight REAL NOT NULL DEFAULT 0,
  no_weight REAL NOT NULL DEFAULT 0,
  threshold REAL NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','passed','rejected','expired')),
  quoted_text TEXT,
  message_id INTEGER,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS vote_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vote_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  voter_user_id TEXT NOT NULL,
  choice TEXT NOT NULL CHECK(choice IN ('yes','no')),
  vote_power REAL NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(vote_id, voter_user_id),
  FOREIGN KEY(vote_id) REFERENCES votes(vote_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_chat_status ON votes(chat_id, status);
CREATE INDEX IF NOT EXISTS idx_votes_target ON votes(chat_id, target_user_id, status);
CREATE INDEX IF NOT EXISTS idx_votes_initiator ON votes(chat_id, initiator_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vote_records_vote ON vote_records(vote_id);
CREATE INDEX IF NOT EXISTS idx_users_chat ON users(chat_id, user_id);
