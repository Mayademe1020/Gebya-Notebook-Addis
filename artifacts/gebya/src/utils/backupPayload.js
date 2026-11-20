// The shape of an auto-backup snapshot.
//
// The restore screen (settings/backup/DangerZoneSection) rejects any payload
// whose `gebya_backup_version` is not 1, and nothing used to write that field,
// so every snapshot the app uploaded was unrestorable by its own restore path.
// Keeping the version here, in one place, means the writer and the reader agree.
export const BACKUP_VERSION = 1;

export function buildBackupPayload(tables, count) {
  return JSON.stringify({ gebya_backup_version: BACKUP_VERSION, tables, count });
}

export function isRestorableBackup(data) {
  return data?.gebya_backup_version === BACKUP_VERSION
    && !!data.tables
    && typeof data.tables === 'object'
    && Array.isArray(data.tables.transactions);
}