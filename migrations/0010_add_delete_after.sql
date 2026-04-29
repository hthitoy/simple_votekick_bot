-- Migration: 0010_add_delete_after.sql
-- Run with: wrangler d1 execute votekick-db --file=migrations/0010_add_delete_after.sql --remote

ALTER TABLE bot_messages ADD COLUMN delete_after INTEGER;