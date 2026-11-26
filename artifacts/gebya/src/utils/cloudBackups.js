// Client for the server-side backup endpoints (api-server/src/routes/backup.ts).
//
// Until now nothing in the client listed or downloaded a snapshot: backups were
// uploaded and then unreachable from the app. These functions are that path —
// a shop that loses its phone can sign in and restore the last good snapshot.
import db from '../db';
import { getAuthToken } from './syncEngine';
import { isRestorableBackup } from './backupPayload';
import { takeLocalSafetySnapshot, LOCAL_SAFETY_KEY } from './localSafetyBackup';
import { restoreFromJSON } from '../components/settings/backup/useBackupData';

const BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '');

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function authToken(explicit) {
  if (explicit) return explicit;
  try {
    return await getAuthToken();
  } catch {
    return null;
  }
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Parse and validate a snapshot payload string. Throws when the payload is not
 * a snapshot this build can restore; callers turn that into a user-facing
 * failure instead of writing anything.
 */
export function validateSnapshotPayload(payload) {
  if (typeof payload !== 'string') throw new Error('Snapshot has no payload');
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    throw new Error('Snapshot payload is not valid JSON');
  }
  if (!isRestorableBackup(data)) {
    throw new Error('Snapshot payload is not a restorable Gebya backup');
  }
  return data;
}

function countTables(tables = {}) {
  return {
    transactions: Array.isArray(tables.transactions) ? tables.transactions.length : 0,
    customers: Array.isArray(tables.customers) ? tables.customers.length : 0,
    suppliers: Array.isArray(tables.suppliers) ? tables.suppliers.length : 0,
  };
}

/**
 * List the signed-in user's snapshots, newest first.
 * @returns {Promise<{ok: true, snapshots: object[]} | {ok: false, error: string}>}
 */
export async function listCloudSnapshots({ fetchImpl = fetch, token } = {}) {
  const auth = await authToken(token);
  if (!auth) return { ok: false, error: 'unauthorized' };
  if (isOffline()) return { ok: false, error: 'offline' };

  try {
    const res = await fetchImpl(`${BASE}/backup/list`, {
      headers: authHeaders(auth),
      credentials: 'include',
    });
    if (res.status === 401) return { ok: false, error: 'unauthorized' };
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, snapshots: Array.isArray(data?.snapshots) ? data.snapshots : [] };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/**
 * Download one snapshot and validate it before it is offered for restore.
 * @returns {Promise<{ok: true, snapshot: object} | {ok: false, error: string}>}
 */
export async function downloadCloudSnapshot(id, { fetchImpl = fetch, token } = {}) {
  const auth = await authToken(token);
  if (!auth) return { ok: false, error: 'unauthorized' };
  if (isOffline()) return { ok: false, error: 'offline' };

  try {
    const res = await fetchImpl(`${BASE}/backup/download/${encodeURIComponent(id)}`, {
      headers: authHeaders(auth),
      credentials: 'include',
    });
    if (res.status === 401) return { ok: false, error: 'unauthorized' };
    if (res.status === 404) return { ok: false, error: 'not-found' };
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    const snapshot = data?.snapshot;
    if (!snapshot) return { ok: false, error: 'invalid' };

    let parsed;
    try {
      parsed = validateSnapshotPayload(snapshot.payload);
    } catch {
      return { ok: false, error: 'invalid' };
    }

    return {
      ok: true,
      snapshot: { ...snapshot, data: parsed, counts: countTables(parsed.tables) },
    };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/**
 * Replace this phone's ledger with an already-downloaded snapshot.
 *
 * The current data is copied to `local_backups` first, so a wrong tap can be
 * undone. An invalid payload changes nothing.
 */
export async function restoreSnapshot(snapshot, {
  target = db,
  restore = restoreFromJSON,
  now = Date.now(),
} = {}) {
  let data;
  try {
    data = validateSnapshotPayload(snapshot?.payload);
  } catch {
    return { ok: false, error: 'invalid' };
  }

  const safety = await takeLocalSafetySnapshot(target, { now });
  data = { ...data, counts: countTables(data.tables) };
  await restore(data);
  return { ok: true, safety };
}

/** Restore the copy taken before the last restore, if one exists. */
export async function restoreLocalSafetySnapshot({
  target = db,
  restore = restoreFromJSON,
} = {}) {
  const row = await target.local_backups.get(LOCAL_SAFETY_KEY);
  if (!row) return { ok: false, error: 'missing' };

  let data;
  try {
    data = validateSnapshotPayload(row.payload);
  } catch {
    return { ok: false, error: 'invalid' };
  }

  data = { ...data, counts: countTables(data.tables) };
  await restore(data);
  return { ok: true };
}
