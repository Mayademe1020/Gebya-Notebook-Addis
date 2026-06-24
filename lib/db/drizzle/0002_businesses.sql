-- ============================================================
-- Migration: 0002_businesses.sql
-- Add multi-tenant business foundation without breaking any
-- existing user data.
-- Runs as a single atomic transaction — any failure rolls back
-- the entire migration leaving the database untouched.
-- ============================================================

BEGIN;

-- ── 1. New tables ────────────────────────────────────────────

CREATE TABLE businesses (
  id              SERIAL PRIMARY KEY,
  owner_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL DEFAULT 'My Shop',
  slug            VARCHAR(64) UNIQUE,
  preferred_lang  VARCHAR(8) DEFAULT 'am',
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX businesses_owner_idx ON businesses(owner_user_id);

CREATE TABLE business_members (
  id                    SERIAL PRIMARY KEY,
  business_id           INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                  VARCHAR(32) NOT NULL DEFAULT 'cashier',
  invited_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  joined_at             TIMESTAMP WITH TIME ZONE,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)       -- V1: one user belongs to exactly one business
);
CREATE INDEX biz_members_business_idx ON business_members(business_id);

CREATE TABLE invites (
  id                    SERIAL PRIMARY KEY,
  business_id           INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invited_by_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number          TEXT NOT NULL,
  role                  VARCHAR(32) NOT NULL DEFAULT 'cashier',
  token                 VARCHAR(128) NOT NULL UNIQUE,
  expires_at            TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at           TIMESTAMP WITH TIME ZONE,
  revoked_at            TIMESTAMP WITH TIME ZONE,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX invites_business_idx ON invites(business_id);
CREATE INDEX invites_token_idx    ON invites(token);
CREATE INDEX invites_phone_idx    ON invites(phone_number);

-- ── 2. Seed one business per existing user ───────────────────
-- Pull shop_name from settings (key = 'shop_name'), fall back to 'My Shop'.

INSERT INTO businesses (owner_user_id, name, created_at, updated_at)
SELECT
  u.id,
  COALESCE(
    NULLIF(TRIM((
      SELECT s.value
      FROM settings s
      JOIN devices d ON d.device_id = s.device_id
      WHERE d.user_id = u.id
        AND s.key = 'shop_name'
        AND s.value IS NOT NULL
        AND TRIM(s.value) <> ''
      ORDER BY s.updated_at DESC NULLS LAST
      LIMIT 1
    )), ''),
    'My Shop'
  ),
  u.created_at,
  NOW()
FROM users u;

-- ── 3. Seed owner membership for every existing user ─────────

INSERT INTO business_members (business_id, user_id, role, joined_at, active, created_at)
SELECT b.id, b.owner_user_id, 'owner', b.created_at, TRUE, b.created_at
FROM businesses b;

-- ── 4. Add nullable business_id to all data tables ───────────
-- ON DELETE RESTRICT: a business with live data cannot be deleted.

ALTER TABLE transactions          ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE RESTRICT;
ALTER TABLE customers             ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE RESTRICT;
ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE RESTRICT;
ALTER TABLE catalog_entries       ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE RESTRICT;
ALTER TABLE suppliers             ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE RESTRICT;
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE RESTRICT;
ALTER TABLE staff_members         ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE RESTRICT;
ALTER TABLE settings              ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE RESTRICT;
ALTER TABLE analytics             ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(id) ON DELETE RESTRICT;

-- ── 5. Back-fill business_id on all existing rows ────────────
-- Chain: row.device_id → devices.user_id → businesses.owner_user_id

UPDATE transactions t
SET business_id = b.id
FROM devices d
JOIN businesses b ON b.owner_user_id = d.user_id
WHERE t.device_id = d.device_id AND t.business_id IS NULL;

UPDATE customers t
SET business_id = b.id
FROM devices d
JOIN businesses b ON b.owner_user_id = d.user_id
WHERE t.device_id = d.device_id AND t.business_id IS NULL;

UPDATE customer_transactions t
SET business_id = b.id
FROM devices d
JOIN businesses b ON b.owner_user_id = d.user_id
WHERE t.device_id = d.device_id AND t.business_id IS NULL;

UPDATE catalog_entries t
SET business_id = b.id
FROM devices d
JOIN businesses b ON b.owner_user_id = d.user_id
WHERE t.device_id = d.device_id AND t.business_id IS NULL;

UPDATE suppliers t
SET business_id = b.id
FROM devices d
JOIN businesses b ON b.owner_user_id = d.user_id
WHERE t.device_id = d.device_id AND t.business_id IS NULL;

UPDATE supplier_transactions t
SET business_id = b.id
FROM devices d
JOIN businesses b ON b.owner_user_id = d.user_id
WHERE t.device_id = d.device_id AND t.business_id IS NULL;

UPDATE staff_members t
SET business_id = b.id
FROM devices d
JOIN businesses b ON b.owner_user_id = d.user_id
WHERE t.device_id = d.device_id AND t.business_id IS NULL;

UPDATE settings t
SET business_id = b.id
FROM devices d
JOIN businesses b ON b.owner_user_id = d.user_id
WHERE t.device_id = d.device_id AND t.business_id IS NULL;

UPDATE analytics t
SET business_id = b.id
FROM devices d
JOIN businesses b ON b.owner_user_id = d.user_id
WHERE t.device_id = d.device_id AND t.business_id IS NULL;

-- ── 6. Indexes on business_id ────────────────────────────────

CREATE INDEX IF NOT EXISTS transactions_business_idx          ON transactions(business_id);
CREATE INDEX IF NOT EXISTS customers_business_idx             ON customers(business_id);
CREATE INDEX IF NOT EXISTS customer_transactions_business_idx ON customer_transactions(business_id);
CREATE INDEX IF NOT EXISTS catalog_entries_business_idx       ON catalog_entries(business_id);
CREATE INDEX IF NOT EXISTS suppliers_business_idx             ON suppliers(business_id);
CREATE INDEX IF NOT EXISTS supplier_transactions_business_idx ON supplier_transactions(business_id);
CREATE INDEX IF NOT EXISTS staff_members_business_idx         ON staff_members(business_id);
CREATE INDEX IF NOT EXISTS settings_business_idx              ON settings(business_id);
CREATE INDEX IF NOT EXISTS analytics_business_idx             ON analytics(business_id);

-- ── 7. Verification — all orphaned_rows must be 0 ────────────

SELECT 'transactions orphaned'          AS check_name, COUNT(*) AS orphaned_rows FROM transactions          WHERE business_id IS NULL;
SELECT 'customers orphaned'             AS check_name, COUNT(*) AS orphaned_rows FROM customers             WHERE business_id IS NULL;
SELECT 'customer_transactions orphaned' AS check_name, COUNT(*) AS orphaned_rows FROM customer_transactions WHERE business_id IS NULL;
SELECT 'catalog_entries orphaned'       AS check_name, COUNT(*) AS orphaned_rows FROM catalog_entries       WHERE business_id IS NULL;
SELECT 'suppliers orphaned'             AS check_name, COUNT(*) AS orphaned_rows FROM suppliers             WHERE business_id IS NULL;
SELECT 'supplier_transactions orphaned' AS check_name, COUNT(*) AS orphaned_rows FROM supplier_transactions WHERE business_id IS NULL;
SELECT 'staff_members orphaned'         AS check_name, COUNT(*) AS orphaned_rows FROM staff_members         WHERE business_id IS NULL;
SELECT 'settings orphaned'             AS check_name, COUNT(*) AS orphaned_rows FROM settings              WHERE business_id IS NULL;
SELECT 'analytics orphaned'            AS check_name, COUNT(*) AS orphaned_rows FROM analytics             WHERE business_id IS NULL;
SELECT 'users without business'        AS check_name, COUNT(*) AS orphaned_rows FROM users u WHERE NOT EXISTS (SELECT 1 FROM businesses b WHERE b.owner_user_id = u.id);
SELECT 'users without membership'      AS check_name, COUNT(*) AS orphaned_rows FROM users u WHERE NOT EXISTS (SELECT 1 FROM business_members bm WHERE bm.user_id = u.id);

COMMIT;
