-- Migration: 0009_add_group_message_id.sql
-- Run with: wrangler d1 execute votekick-db --file=migrations/0009_add_group_message_id.sql --remote

ALTER TABLE user_verifications ADD COLUMN group_message_id INTEGER;