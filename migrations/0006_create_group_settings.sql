-- Migration: 0006_create_group_settings.sql
-- Run with: wrangler d1 execute votekick-db --file=migrations/0006_create_group_settings.sql --remote

CREATE TABLE IF NOT EXISTS group_settings (
    chat_id TEXT PRIMARY KEY,
    vote_kick_enabled INTEGER NOT NULL DEFAULT 1,  -- 1 = true, 0 = false
    verification_enabled INTEGER NOT NULL DEFAULT 1,
    auto_cleanup_enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);