-- Migration: 0006_add_trigger_message_id.sql
-- Adds the missing trigger_message_id column to user_verifications.
-- The column was referenced in application code and migration 0003's comment
-- claimed it "already exists", but it was never actually created.
--
-- Run with: wrangler d1 execute votekick-db --file=migrations/0006_add_trigger_message_id.sql

ALTER TABLE user_verifications ADD COLUMN trigger_message_id INTEGER;
