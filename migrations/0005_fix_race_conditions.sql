-- Migration: 0005_fix_race_conditions.sql
-- Fix duplicate active votes: enforce at DB level that only one active vote
-- can exist per (chat_id, target_user_id) pair at any time.
-- This is a safety net that catches concurrent requests which both pass the
-- application-level guard before either has committed its INSERT.
--
-- Run with: wrangler d1 execute votekick-db --file=migrations/0005_fix_race_conditions.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_active_target_unique
  ON votes(chat_id, target_user_id)
  WHERE status = 'active';
