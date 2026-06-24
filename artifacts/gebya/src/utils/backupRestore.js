import db from '../db';

const BACKUP_API_BASE = import.meta.env.VITE_SYNC_API_URL || '/api';

async function getAuthToken() {
  const row = await db.settings.get('gebya_auth_token');
  return row?.value || null;
}

// ─── Export all IndexedDB data to a JSON payload ───
export async function exportAllData() {
  const tables = [
    'transactions', 'customers', 'customer_transactions',
    'catalog_entries', 'suppliers', 'supplier_transactions', 'staff_members',
    'settings', 'analytics', 'sync_queue',
  ];

  const payload = {};
  let totalRecords = 0;

  for (const name of tables) {
    const table = db[name];
    if (!table) continue;
    const rows = await table.toArray();
    payload[name] = rows;
    totalRecords += rows.length;
  }

  return {
    version: 2, // backup format version
    exportedAt: Date.now(),
    deviceId: await db.settings.get('cloud_proof_device_id')?.value || 'unknown',
    tables,
    recordCount: totalRecords,
    data: payload,
  };
}

// ─── Import JSON payload into IndexedDB (destructive restore) ───
export async function importAllData(backup) {
  if (!backup || !backup.data) {
    throw new Error('Invalid backup payload');
  }

  if (backup.version !== 2 && backup.version !== 1) {
    throw new Error(`Unsupported backup version: ${backup.version}`);
  }

  const tables = [
    'transactions', 'customers', 'customer_transactions',
    'catalog_entries', 'suppliers', 'supplier_transactions', 'staff_members',
    'settings', 'analytics', 'sync_queue',
  ];

  // Clear all tables first (destructive restore)
  await db.transaction('rw', tables.map((t) => db[t]).filter(Boolean), async () => {
    for (const name of tables) {
      const table = db[name];
      if (!table) continue;
      await table.clear();
    }
  });

  // Import data
  await db.transaction('rw', tables.map((t) => db[t]).filter(Boolean), async () => {
    for (const [name, rows] of Object.entries(backup.data)) {
      const table = db[name];
      if (!table || !Array.isArray(rows)) continue;

      for (const row of rows) {
        // Ensure sync_version is set for v2 backups
        if (row.sync_version === undefined || row.sync_version === null) {
          row.sync_version = 1;
        }
        await table.put(row);
      }
    }
  });

  return { imported: true, recordCount: backup.recordCount || 0 };
}

// ─── Upload snapshot to server ───
export async function uploadSnapshot(name, description = '') {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const backup = await exportAllData();
  const payload = JSON.stringify(backup);

  const res = await fetch(`${BACKUP_API_BASE}/backup/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      device_id: backup.deviceId,
      name,
      description,
      payload,
      tables: backup.tables,
      record_count: backup.recordCount,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed: ${res.status}`);
  }

  return await res.json();
}

// ─── List snapshots from server ───
export async function listSnapshots() {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${BACKUP_API_BASE}/backup/list`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  const { snapshots } = await res.json();
  return snapshots || [];
}

// ─── Download and restore snapshot from server ───
export async function restoreSnapshot(snapshotId) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${BACKUP_API_BASE}/backup/download/${snapshotId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const { snapshot } = await res.json();
  if (!snapshot?.payload) throw new Error('Snapshot has no payload');

  const backup = JSON.parse(snapshot.payload);
  return await importAllData(backup);
}

// ─── Delete snapshot from server ───
export async function deleteSnapshot(snapshotId) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${BACKUP_API_BASE}/backup/delete/${snapshotId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  return await res.json();
}

// ─── Export to file (local download) ───
export function downloadBackupFile(backup, filename) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `gebya-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Import from file (local upload) ───
export async function uploadBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        const result = await importAllData(backup);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
