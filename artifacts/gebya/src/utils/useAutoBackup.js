import db from '../db';
import { getAuthToken } from './syncEngine';
import { getOrCreateCloudProofDeviceId } from './cloudProof';
import { fireToast } from '../components/Toast';
import { useLang } from '../context/LangContext';
import { label } from '../labels/index.js';
import { buildBackupPayload } from './backupPayload';

const BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '');
const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LAST_BACKUP_KEY = 'gebya_last_auto_backup_at';

// Tables that make up the user's financial ledger (excludes server-managed auth/sync metadata)
const BACKUP_TABLES = [
  'transactions',
  'customers',
  'customer_transactions',
  'catalog_entries',
  'suppliers',
  'supplier_transactions',
  'staff_members',
  'settings',
];

let active = false;

export async function shouldAutoBackup() {
  const last = await db.settings.get(LAST_BACKUP_KEY);
  if (!last) return true;
  return Date.now() - Number(last.value) > BACKUP_INTERVAL_MS;
}

export function useAutoBackup() {
  const { lang, t } = useLang();
  return { lang, t };
}

export async function createCloudSnapshot() {
  const token = await getAuthToken();
  if (!token) return { ok: false, error: 'No auth token' };

  const deviceId = await getOrCreateCloudProofDeviceId();
  const tables = {};
  let recordCount = 0;

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await db[table].toArray();
      // Strip IndexedDB internal keys & server shadow columns before sending
      const clean = rows.map((row) => {
        const { lid, sync_version, created_locally, pending_sync, ...rest } = row;
        return rest;
      });
      tables[table] = clean;
      recordCount += clean.length;
    } catch {
      tables[table] = [];
    }
  }

  const payload = buildBackupPayload(tables, recordCount);

  const res = await fetch(`${BASE}/backup/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
    body: JSON.stringify({
      device_id: deviceId,
      name: `Auto-backup ${new Date().toISOString().slice(0, 10)}`,
      description: 'Weekly auto-backup from Gebya',
      payload,
      tables: Object.keys(tables),
      record_count: recordCount,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
  return { ok: true, snapshot: data.snapshot };
}

export async function checkAndAutoBackup({ silent = true } = {}) {
  if (active) return null;
  active = true;
  try {
    // Only auto-backup when online AND authenticated
    if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
    const token = await getAuthToken();
    if (!token) return null;

    const needsBackup = await shouldAutoBackup();
    if (!needsBackup) return null;

    const result = await createCloudSnapshot();
    if (result.ok) {
      await db.settings.put({
        key: LAST_BACKUP_KEY,
        value: Date.now(),
      });
      const { lang, t } = useAutoBackup();
      if (!silent && t) {
        fireToast(
          label('common.auto-backup-completed', lang),
          1800
        );
      }
      return result.snapshot;
    }
    console.warn('Auto-backup failed:', result.error);
    return result;
  } finally {
    active = false;
  }
}
