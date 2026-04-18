-- Migration: 0002_add_verifications.sql
-- Run with: wrangler d1 execute votekick-db --file=migrations/0002_add_verifications.sql

CREATE TABLE IF NOT EXISTS user_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  verification_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','failed','expired','banned')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  message_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  verified_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_verifications_pending_unique
ON user_verifications(chat_id, user_id)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_verifications_chat_status ON user_verifications(chat_id, status);
CREATE INDEX IF NOT EXISTS idx_verifications_user ON user_verifications(chat_id, user_id);
CREATE INDEX IF NOT EXISTS idx_verifications_expires ON user_verifications(expires_at);
