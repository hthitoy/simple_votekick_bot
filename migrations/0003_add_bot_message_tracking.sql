-- Migration: 0003_add_bot_message_tracking.sql
-- Run with: wrangler d1 execute votekick-db --file=0003_add_bot_message_tracking.sql

-- Note: trigger_message_id already exists from previous migration, skip this line

CREATE TABLE IF NOT EXISTS bot_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'deleted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_bot_messages_chat_status ON bot_messages(chat_id, status);
CREATE INDEX IF NOT EXISTS idx_bot_messages_created_at ON bot_messages(created_at);
