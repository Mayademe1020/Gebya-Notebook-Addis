-- Migration: Add sync_version and missing columns for sync v2
-- Generated: 2026-06-20

-- Add sync_version to all tables
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sync_version integer DEFAULT 1;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sync_version integer DEFAULT 1;
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS sync_version integer DEFAULT 1;
ALTER TABLE catalog_entries ADD COLUMN IF NOT EXISTS sync_version integer DEFAULT 1;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS sync_version integer DEFAULT 1;
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS sync_version integer DEFAULT 1;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS sync_version integer DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS sync_version integer DEFAULT 1;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS sync_version integer DEFAULT 1;

-- Add missing customer columns (client uses display_name, phone_number, etc.)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS telegram_username text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS telegram_notify_enabled boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS telegram_link_token text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS telegram_linked_at bigint;

-- Add missing customer_transaction columns
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS item_note text;
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS due_date bigint;
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS reference_code text;
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS telegram_delivery_state varchar(32);
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS telegram_delivery_error text;
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS telegram_delivery_attempted_at bigint;

-- Add missing supplier_transaction columns
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS item_name text;
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS item_kind varchar(32);
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1;

-- Create snapshots table for cloud backup/restore
CREATE TABLE IF NOT EXISTS snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  name VARCHAR(256) NOT NULL,
  description TEXT,
  size_bytes INTEGER,
  tables TEXT NOT NULL,
  record_count INTEGER DEFAULT 0,
  checksum VARCHAR(64),
  payload TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT
);

CREATE INDEX IF NOT EXISTS snapshots_user_idx ON snapshots(user_id);
CREATE INDEX IF NOT EXISTS snapshots_device_idx ON snapshots(device_id);

-- Initialize sync_version on existing rows
UPDATE transactions SET sync_version = 1 WHERE sync_version IS NULL;
UPDATE customers SET sync_version = 1 WHERE sync_version IS NULL;
UPDATE customer_transactions SET sync_version = 1 WHERE sync_version IS NULL;
UPDATE catalog_entries SET sync_version = 1 WHERE sync_version IS NULL;
UPDATE suppliers SET sync_version = 1 WHERE sync_version IS NULL;
UPDATE supplier_transactions SET sync_version = 1 WHERE sync_version IS NULL;
UPDATE staff_members SET sync_version = 1 WHERE sync_version IS NULL;
UPDATE settings SET sync_version = 1 WHERE sync_version IS NULL;
UPDATE analytics SET sync_version = 1 WHERE sync_version IS NULL;
