-- Migration: 0008_add_message_verified.sql
-- Run with: wrangler d1 execute votekick-db --file=migrations/0008_add_message_verified.sql --remote

ALTER TABLE user_verifications ADD COLUMN message_verified INTEGER NOT NULL DEFAULT 0;
