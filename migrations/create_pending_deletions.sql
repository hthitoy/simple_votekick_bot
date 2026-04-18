-- Migration: create pending_deletions table
-- Run with: npx wrangler d1 execute votekick-db --file=create_pending_deletions.sql

CREATE TABLE IF NOT EXISTS pending_deletions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  content TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'failed', 'deleted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER,
  deleted_at INTEGER,
  UNIQUE(chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_deletions_status ON pending_deletions(status);
CREATE INDEX IF NOT EXISTS idx_pending_deletions_expires ON pending_deletions(expires_at);
CREATE INDEX IF NOT EXISTS idx_pending_deletions_chat ON pending_deletions(chat_id);