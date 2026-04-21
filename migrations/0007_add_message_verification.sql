-- Migration: 0007_add_message_verification.sql
-- Run with: wrangler d1 execute votekick-db --file=migrations/0007_add_message_verification.sql --remote

ALTER TABLE group_settings ADD COLUMN message_verification_enabled INTEGER NOT NULL DEFAULT 1;
