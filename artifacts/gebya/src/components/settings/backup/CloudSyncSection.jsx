import { useState, useMemo } from 'react';
import { useLang } from '../../../context/LangContext';
import { fireToast } from '../../Toast';
import { getSyncEngine } from '../../../utils/syncEngine';
import { useSyncStore } from '../../../stores/syncStore';
import { uploadSnapshot, listSnapshots, restoreSnapshot } from '../../../utils/backupRestore';
import { RefreshCw } from 'lucide-react';

/**
 * Cloud-sync status row + cloud backup / restore controls.
 * Props:
 *   lastBackupAt – Date.now() timestamp | null
 *   setLastBackupAt – setter
 */
export default function CloudSyncSection({ lastBackupAt, setLastBackupAt }) {
  const { lang } = useLang();
  const syncStatus = useSyncStore((s) => s.status);
  const syncLastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const syncError = useSyncStore((s) => s.error);
  const syncOnline = useSyncStore((s) => s.online);

  const [cloudSnapshots, setCloudSnapshots] = useState([]);
  const [showCloudRestore, setShowCloudRestore] = useState(false);
  const [cloudBackupLoading, setCloudBackupLoading] = useState(false);
  const [cloudRestoreLoading, setCloudRestoreLoading] = useState(false);

  const syncStatusLabel = useMemo(() => {
    if (syncStatus === 'syncing') return lang === 'am' ? 'በመቀነስ ላይ…' : 'Syncing…';
    if (syncStatus === 'error')   return lang === 'am' ? 'ማቀነስ አልተሳካም' : 'Sync failed';
    if (!syncLastSyncAt)          return lang === 'am' ? 'አሁን ይቀነሱ' : 'Not synced yet';
    const mins = Math.floor((Date.now() - syncLastSyncAt) / 60000);
    if (mins < 1)  return lang === 'am' ? 'ዛሬ ተቀነሰ' : 'Synced just now';
    if (mins < 60) return lang === 'am' ? `ከ ${mins} ደቂቃ በፊት ተቀነሰ` : `Synced ${mins} min${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return lang === 'am' ? `ከ ${hours} ሰዓት በፊት ተቀነሰ` : `Synced ${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return lang === 'am' ? `ከ ${days} ቀን በፊት ተቀነሰ` : `Synced ${days} day${days === 1 ? '' : 's'} ago`;
  }, [syncStatus, syncLastSyncAt, lang]);

  const handleCloudBackup = async () => {
    setCloudBackupLoading(true);
    try {
      const name = `Backup ${new Date().toLocaleDateString()}`;
      const result = await uploadSnapshot(name);
      if (result.ok) {
        fireToast(lang === 'am' ? '✓ በደመና ተቀመጠ' : '✓ Saved to cloud', 2400);
        setLastBackupAt(Date.now());
      }
    } catch {
      fireToast(lang === 'am' ? 'የደመና ምትኬ አልተሳካም' : 'Cloud backup failed', 2400);
    } finally {
      setCloudBackupLoading(false);
    }
  };

  const handleLoadCloudSnapshots = async () => {
    setCloudRestoreLoading(true);
    try {
      const snaps = await listSnapshots();
      setCloudSnapshots(snaps);
      setShowCloudRestore(true);
    } catch {
      fireToast(lang === 'am' ? 'የደመና ምትኬዎችን መቅዳት አልተሳካም' : 'Could not load cloud snapshots', 2400);
    } finally {
      setCloudRestoreLoading(false);
    }
  };

  const handleCloudRestore = async (snapshotId) => {
    if (!window.confirm(lang === 'am' ? 'ይህ ሁሉንም ውሂብ ይተካል። እርግጠኛ ነዎት?' : 'This will replace all data on this phone. Are you sure?')) return;
    setCloudRestoreLoading(true);
    try {
      await restoreSnapshot(snapshotId);
      fireToast(lang === 'am' ? '✓ ከደመና ተመለሰ — በመጫን ላይ…' : '✓ Restored from cloud — reloading…', 2400);
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      fireToast(lang === 'am' ? 'መልሶ ማስቀመጥ አልተሳካም' : 'Restore failed', 2600);
    } finally {
      setCloudRestoreLoading(false);
      setShowCloudRestore(false);
    }
  };

  return (
    <>
      {/* Sync status row */}
      <div className="px-5 py-3" style={{ background: '#f0f9ff', borderTop: '1px solid rgba(0,0,0,0.04)', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '0.95rem' }}>
            {syncStatus === 'syncing' ? '🔄' : syncStatus === 'error' ? '⚠️' : syncLastSyncAt ? '✅' : '☁️'}
          </span>
          <div className="flex-1">
            <p className="text-xs font-bold" style={{ color: syncStatus === 'error' ? '#991b1b' : '#065f46' }}>
              {syncStatusLabel}
            </p>
            <p className="text-[11px]" style={{ color: '#6b7280' }}>
              {lang === 'am'
                ? 'የእርስዎ መረጃ በደመና ላይ ይቀመጣል — ስልክ ከተጠለቀ ወይም ከተሰረዘ መልሰው ያግኙ'
                : 'Your data is stored in the cloud — recover if phone is lost or replaced'}
            </p>
          </div>
          <button
            onClick={() => { const e = getSyncEngine(); if (e) e.sync(); }}
            disabled={syncStatus === 'syncing' || !syncOnline}
            className="px-3 py-1.5 rounded-lg text-xs font-bold min-h-[32px]"
            style={{
              background: syncStatus === 'syncing' ? '#e5e7eb' : '#1B4332',
              color: syncStatus === 'syncing' ? '#9ca3af' : '#fff',
            }}
          >
            {syncStatus === 'syncing' ? (lang === 'am' ? 'ይጠብቁ…' : 'Wait…') : (lang === 'am' ? 'አሁን ቀነስ' : 'Sync now')}
          </button>
        </div>
      </div>

      {/* Cloud backup button */}
      <button
        onClick={handleCloudBackup}
        disabled={cloudBackupLoading}
        className="w-full flex items-center gap-4 px-5 py-4 active:bg-blue-50 transition-colors min-h-[64px] text-left"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#dbeafe' }}>
          <RefreshCw className="w-5 h-5" style={{ color: '#1d4ed8' }} />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{lang === 'am' ? 'ወደ ደመና ይምዝገቡ' : 'Cloud backup'}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {cloudBackupLoading
              ? (lang === 'am' ? 'በመላክ ላይ…' : 'Uploading…')
              : (lang === 'am' ? 'ሁሉንም ውሂብ ወደ ደመና ይቀምጡ' : 'Save all data to cloud')}
          </div>
        </div>
      </button>

      {/* Cloud restore button */}
      <button
        onClick={handleLoadCloudSnapshots}
        disabled={cloudRestoreLoading}
        className="w-full flex items-center gap-4 px-5 py-4 active:bg-amber-50 transition-colors min-h-[64px] text-left"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fef3c7' }}>
          <RefreshCw className="w-5 h-5" style={{ color: '#92400e' }} />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{lang === 'am' ? 'ከደመና ይምለሱ' : 'Cloud restore'}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {cloudRestoreLoading
              ? (lang === 'am' ? 'በመጫን ላይ…' : 'Loading…')
              : (lang === 'am' ? 'ከደመና ምትኬ ይምረጡ' : 'Browse and restore cloud snapshots')}
          </div>
        </div>
      </button>

      {/* Cloud snapshots modal */}
      {showCloudRestore && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {lang === 'am' ? 'የደመና ምትኬዎች' : 'Cloud snapshots'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {lang === 'am' ? 'ለመመለስ የሚፈልጉትን ምትኬ ይምረጡ' : 'Select a snapshot to restore'}
            </p>
            <div className="space-y-2 mb-4">
              {cloudSnapshots.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  {lang === 'am' ? 'ምንም ምትኬዎች አልተገኙም' : 'No snapshots found'}
                </p>
              ) : (
                cloudSnapshots.map((snap) => (
                  <button
                    key={snap.id}
                    onClick={() => handleCloudRestore(snap.id)}
                    disabled={cloudRestoreLoading}
                    className="w-full text-left p-3 rounded-xl border transition-colors hover:bg-amber-50 active:bg-amber-100 disabled:opacity-50"
                    style={{ borderColor: '#e8e2d8', background: '#fafaf5' }}
                  >
                    <div className="font-bold text-sm text-gray-800">{snap.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {snap.recordCount} {lang === 'am' ? 'መዝገቦች' : 'records'} · {new Date(snap.createdAt).toLocaleDateString()}
                    </div>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => setShowCloudRestore(false)}
              className="w-full p-3 rounded-2xl font-bold text-sm"
              style={{ background: '#f5f5f5', color: '#374151' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
