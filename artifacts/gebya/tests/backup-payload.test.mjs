// The snapshot the app uploads must satisfy the restore screen's own check.
// It did not: the restore path requires `gebya_backup_version === 1` and the
// uploader never wrote it, so every automatic snapshot was unrestorable.
import { describe, it, expect } from 'vitest';
import { buildBackupPayload, isRestorableBackup, BACKUP_VERSION } from '../src/utils/backupPayload.js';

describe('backup payload', () => {
  const tables = { transactions: [{ id: 1 }], customers: [] };

  it('stamps the version the restore screen requires', () => {
    const data = JSON.parse(buildBackupPayload(tables, 1));
    expect(data.gebya_backup_version).toBe(BACKUP_VERSION);
    expect(isRestorableBackup(data)).toBe(true);
  });

  it('keeps the tables and the count the server stores', () => {
    const data = JSON.parse(buildBackupPayload(tables, 1));
    expect(data.tables).toEqual(tables);
    expect(data.count).toBe(1);
  });

  it('rejects a payload with no version, which is what the app used to upload', () => {
    const legacy = JSON.parse(JSON.stringify({ tables, count: 1 }));
    expect(isRestorableBackup(legacy)).toBe(false);
  });

  it('rejects a payload without a transactions table', () => {
    expect(isRestorableBackup({ gebya_backup_version: 1, tables: { customers: [] } })).toBe(false);
  });

  it('rejects a non-object payload', () => {
    expect(isRestorableBackup(null)).toBe(false);
    expect(isRestorableBackup('nope')).toBe(false);
  });
});