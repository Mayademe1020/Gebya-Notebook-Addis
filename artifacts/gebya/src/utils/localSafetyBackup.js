// A last-resort copy of the data that is about to be replaced by a restore.
//
// It lives in its own local-only Dexie table (`local_backups`) under one fixed
// key: we keep the most recent copy only, which is exactly what "undo the
// restore I just made" needs. It is never uploaded and never synced.
import db from '../db';
import { buildBackupPayload } from './backupPayload';
import { collectBackupTables } from './backupTables';

export const LOCAL_SAFETY_KEY = 'pre-restore';

/**
 * Snapshot the current local ledger into `local_backups` before a destructive
 * restore. Returns the stored row.
 * @param {object} [target] Dexie-like db (injectable for tests)
 */
export async function takeLocalSafetySnapshot(target = db, { now = Date.now() } = {}) {
  const { tables, recordCount } = await collectBackupTables(target);
  const payload = buildBackupPayload(tables, recordCount);
  const row = {
    key: LOCAL_SAFETY_KEY,
    created_at: now,
    record_count: recordCount,
    payload,
  };
  await target.local_backups.put(row);
  return row;
}

/** Read the stored pre-restore copy, if any. */
export async function getLocalSafetySnapshot(target = db) {
  const row = await target.local_backups.get(LOCAL_SAFETY_KEY);
  if (!row) return null;
  let data;
  try {
    data = JSON.parse(row.payload);
  } catch {
    return null;
  }
  return { ...row, data };
}

/** Forget the pre-restore copy (after it has been used or discarded). */
export async function clearLocalSafetySnapshot(target = db) {
  await target.local_backups.delete(LOCAL_SAFETY_KEY);
}
