-- ============================================================
-- Migration: 0003_permissions.sql
-- Add flexible permissions JSONB to business_members so owners
-- can override role defaults per-team-member without a migration.
-- ============================================================

BEGIN;

-- Add nullable permissions JSONB to business_members
ALTER TABLE business_members
  ADD COLUMN IF NOT EXISTS permissions JSONB;

-- Create a GIN index on the permissions JSONB for fast key lookups
-- (only useful if we start querying inside permissions, but harmless)
CREATE INDEX IF NOT EXISTS biz_members_permissions_idx
  ON business_members USING GIN (permissions);

COMMIT;
