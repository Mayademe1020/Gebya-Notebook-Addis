// Tables that make up the user's financial ledger (excludes server-managed
// auth/sync metadata). Shared by the cloud-backup writer (useAutoBackup) and
// the local safety copy taken before a restore, so the two can never drift.
export const BACKUP_TABLES = [
  'transactions',
  'customers',
  'customer_transactions',
  'catalog_entries',
  'suppliers',
  'supplier_transactions',
  'staff_members',
  'settings',
];

// Strip IndexedDB internal keys & server shadow columns before persisting or
// sending a row. Keep the exact set the backup uploader has always stripped.
export function cleanBackupRow(row) {
  const { lid, sync_version, created_locally, pending_sync, ...rest } = row;
  return rest;
}

/**
 * Read every backup table from a Dexie-like source (`db[table].toArray()`).
 * A missing table yields an empty array, matching the uploader's old
 * behaviour.
 * @returns {Promise<{ tables: Record<string, object[]>, recordCount: number }>}
 */
export async function collectBackupTables(source) {
  const tables = {};
  let recordCount = 0;

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await source[table].toArray();
      const clean = rows.map(cleanBackupRow);
      tables[table] = clean;
      recordCount += clean.length;
    } catch {
      tables[table] = [];
    }
  }

  return { tables, recordCount };
}
