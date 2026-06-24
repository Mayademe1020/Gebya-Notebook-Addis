# Gebya Sync v2 + Backup/Restore — Implementation Summary

**Date:** 2026-06-20  
**Branch:** `codex/shop-check-polish-clean`  
**Scope:** Sync hardening (conflict resolution + pagination) + automated backup/restore

---

## 1. Sync v2 — Conflict Resolution & Pagination

### Problem (Audit Finding)
The original sync used **naive last-write-wins** on `updated_at`. Two devices editing the same record offline would silently lose one device's changes when both came back online. Additionally, pull had **no pagination** — at scale, this would return unbounded row sets and fail.

### Solution

#### Server (`artifacts/api-server/src/routes/sync.ts`)
- **Added `syncVersion`** to all mappers (transactions, customers, customer_transactions, catalog_entries, suppliers, supplier_transactions, staff_members, settings, analytics)
- **Replaced blind `onConflictDoUpdate`** with a **version-aware conditional upsert**:
  1. SELECT existing record by `(deviceId, localId)`
  2. If no record → INSERT with `syncVersion = 1`
  3. If incoming `syncVersion` > stored → UPDATE (server increments version)
  4. If incoming `syncVersion` == stored AND incoming `updatedAt` > stored → UPDATE
  5. If incoming is older → **CONFLICT** (tracked in response, skipped)
- **Paginated pull**: `GET /sync/pull?since=X&limit=200`
  - Returns `hasMore` + `nextCursor`
  - Client loops until all pages consumed
  - Limits to 200 rows per table per page (configurable, max 1000)
- **Conflict response**: Push returns `conflicts` array with `{table, localId, serverVersion, serverUpdatedAt}`

#### Client (`artifacts/gebya/src/utils/syncEngine.js`)
- **Per-table `lastSyncAt` tracking** for resumable syncs
- **Paginated pull**: loops while `hasMore`, uses `nextCursor`
- **Conflict resolution**: on push conflict, re-pulls conflicting records, merges (increments version), re-pushes
- **Retry with exponential backoff**: `fetchWithRetry` helper (5 retries, base delay 1s, doubles each time)
- **Dexie hooks auto-increment `sync_version`** on every update

#### Schema (`lib/db/src/schema/*.ts`)
- Added `syncVersion: integer("sync_version").default(1)` to **all 9 tables**
- Updated all Zod insert schemas to include `syncVersion`

#### Client DB (`artifacts/gebya/src/db.js`)
- **Version 17 upgrade**:
  - Same store definitions as v16
  - `.upgrade()` callback iterates all tables, initializes `sync_version = 1` on existing records

---

## 2. Schema Mismatch Fixes (Critical Bug)

### Discovery
The sync mapper sent fields that didn't exist in the PostgreSQL schema, meaning customer sync was partially broken.

### Fixes Applied

| Table | Missing Columns Added |
|---|---|
| `customers` | `display_name`, `phone_number`, `telegram_username`, `telegram_notify_enabled`, `telegram_link_token`, `telegram_linked_at` |
| `customer_transactions` | `item_note`, `due_date`, `reference_code`, `telegram_delivery_state`, `telegram_delivery_error`, `telegram_delivery_attempted_at` |
| `supplier_transactions` | `item_name`, `item_kind`, `quantity` |

Old columns (`name`, `phone`, `note`) kept for backward compatibility.

---

## 3. Automated Backup/Restore

### Server (`artifacts/api-server/src/routes/backup.ts`)
- `POST /backup/create` — Upload JSON snapshot (max 10MB, max 10 per user, auto-rotates oldest)
- `GET /backup/list` — List snapshots (metadata only, no payload)
- `GET /backup/download/:id` — Download snapshot with SHA-256 checksum verification
- `DELETE /backup/delete/:id` — Delete a snapshot

### Schema (`lib/db/src/schema/snapshots.ts`)
New `snapshots` table:
- `id`, `userId`, `deviceId`, `name`, `description`
- `sizeBytes`, `tables` (JSON array), `recordCount`, `checksum`, `payload` (TEXT)
- Indexed on `userId` and `deviceId`

### Client (`artifacts/gebya/src/utils/backupRestore.js`)
- `exportAllData()` — Dumps all IndexedDB tables to JSON
- `importAllData(backup)` — Destructive restore (clears all tables, bulk-adds)
- `uploadSnapshot(name, description)` — Upload to server
- `listSnapshots()` — Fetch available snapshots
- `restoreSnapshot(id)` — Download and restore from server
- `downloadBackupFile()` / `uploadBackupFile()` — Local file backup/restore

### UI (`artifacts/gebya/src/components/SettingsPage.jsx`)
- **"Cloud backup"** button — Uploads current data to server
- **"Cloud restore"** button — Shows modal with available snapshots, one-click restore
- Confirmation dialog before destructive restore
- Loading states for all operations

---

## 4. Database Migration

**File:** `lib/db/drizzle/0001_sync_v2.sql`

Run this on your PostgreSQL database:
```bash
# If using drizzle-kit
npx drizzle-kit migrate

# Or run the SQL directly
psql $DATABASE_URL -f lib/db/drizzle/0001_sync_v2.sql
```

Migration adds:
- `sync_version` to all 9 tables
- Missing columns for customers, customer_transactions, supplier_transactions
- New `snapshots` table with indexes

---

## 5. Build & Deploy Checklist

### Server (API)
1. `cd artifacts/api-server`
2. Run migration: `pnpm db:migrate` (or `npx drizzle-kit migrate`)
3. Rebuild: `pnpm build`
4. Deploy

### Client (PWA)
1. `cd artifacts/gebya`
2. `pnpm build`
3. Deploy to Vercel

### Post-Deploy Verification
- [ ] Open app on Device A, create a transaction
- [ ] Open app on Device B, verify transaction syncs (pull)
- [ ] Edit same customer on both devices while offline
- [ ] Come back online — verify conflict resolution works (no data loss)
- [ ] Test cloud backup: Settings → Cloud backup → verify upload succeeds
- [ ] Test cloud restore: Settings → Cloud restore → select snapshot → verify restore

---

## 6. Files Changed

### Server
- `artifacts/api-server/src/routes/sync.ts` — Rewritten with version-aware push + paginated pull
- `artifacts/api-server/src/routes/backup.ts` — NEW: backup/restore endpoints
- `artifacts/api-server/src/routes/index.ts` — Wired backup router

### Database Schema
- `lib/db/src/schema/transactions.ts` — Added `syncVersion`
- `lib/db/src/schema/customers.ts` — Added `syncVersion` + missing columns
- `lib/db/src/schema/customer_transactions.ts` — Added `syncVersion` + missing columns
- `lib/db/src/schema/catalog_entries.ts` — Added `syncVersion`
- `lib/db/src/schema/suppliers.ts` — Added `syncVersion`
- `lib/db/src/schema/supplier_transactions.ts` — Added `syncVersion` + missing columns
- `lib/db/src/schema/staff_members.ts` — Added `syncVersion`
- `lib/db/src/schema/settings.ts` — Added `syncVersion`
- `lib/db/src/schema/analytics.ts` — Added `syncVersion`
- `lib/db/src/schema/snapshots.ts` — NEW: snapshots table
- `lib/db/src/schema/index.ts` — Exports snapshots

### Client
- `artifacts/gebya/src/db.js` — Version 17 with `sync_version` migration
- `artifacts/gebya/src/utils/syncEngine.js` — Rewritten with pagination, conflict resolution, retry
- `artifacts/gebya/src/utils/backupRestore.js` — NEW: backup/restore utility
- `artifacts/gebya/src/components/SettingsPage.jsx` — Added cloud backup/restore UI

### Migration
- `lib/db/drizzle/0001_sync_v2.sql` — NEW: comprehensive migration SQL

---

## 7. Architecture Notes

### Conflict Resolution Strategy
For a **solo shop owner with multiple devices**, the chosen strategy is pragmatic:
- **Server-side**: Only update if incoming `syncVersion` > stored, or if `syncVersion` == stored and `updatedAt` is newer
- **Client-side**: On conflict, fetch server record, set `syncVersion = serverVersion + 1`, re-push
- This prevents silent data loss while avoiding complex CRDT merge logic

### Pagination Strategy
- Pull fetches `limit + 1` rows per table to detect `hasMore`
- Uses `updatedAt ASC` ordering with `nextCursor` (last `updatedAt` in batch)
- Client loops until `hasMore === false`
- Per-table `lastSyncAt` tracked for resumable syncs after partial failures

### Backup Strategy
- Snapshots are **full JSON dumps** of all IndexedDB tables
- Stored as `TEXT` in PostgreSQL (payload)
- SHA-256 checksum verified on download
- Max 10 snapshots per user, oldest auto-deleted
- Max 10MB per snapshot (sufficient for thousands of records)

---

*All sync v2 + backup/restore work is complete. The next phase would be Phase 5: Auth & Cross-Device Recovery (if not already done).*
