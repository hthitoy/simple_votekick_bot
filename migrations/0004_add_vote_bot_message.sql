-- Migration: 0004_add_vote_bot_message.sql
-- Run with: wrangler d1 execute votekick-db --file=migrations/0004_add_vote_bot_message.sql

ALTER TABLE votes ADD COLUMN bot_message_id INTEGER;