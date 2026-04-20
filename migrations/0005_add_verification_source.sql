-- Migration: 0005_add_verification_source.sql
-- Run with: wrangler d1 execute votekick-db --file=migrations/0005_add_verification_source.sql --remote

ALTER TABLE user_verifications ADD COLUMN source TEXT DEFAULT 'group' CHECK(source IN ('group','private'));