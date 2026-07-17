import { useState, useEffect } from 'react';
import { Info, Download, Share2 } from 'lucide-react';
import { useLang } from '../../context/LangContext';
import db from '../../db';
import CloudSyncSection from './backup/CloudSyncSection';
import DangerZoneSection from './backup/DangerZoneSection';
import { exportToJSON, shareBackup, exportToCSV } from './backup/useBackupData';

/**
 * BackupDataPanel — thin orchestrator.
 * Heavy logic lives in:
 *   - useBackupData.js      (CSV/JSON build + clearAll + restoreFromJSON)
 *   - CloudSyncSection.jsx  (sync status + cloud backup/restore)
 *   - DangerZoneSection.jsx (file restore + wipe with 2-step confirms)
 */
export default function BackupDataPanel({ transactions, customerSummaries, supplierSummaries }) {
  const { lang, t } = useLang();
  const [lastBackupAt, setLastBackupAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await db.settings.get('gebya_last_backup_at');
        if (!cancelled && row?.value) setLastBackupAt(Number(row.value));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const totalEntries = (transactions || []).length;
  const totalCustomers = (customerSummaries || []).length;

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden divide-y divide-green-100/30">
      {/* ── Header: stored data summary ── */}
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f0fdf4' }}>
          <Info className="w-5 h-5 text-green-700" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{t.storedOnDevice}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {totalEntries} {lang === 'am' ? 'መዝገብ' : 'entries'} · {totalCustomers} {lang === 'am' ? 'ደንበኞች' : 'customers in dubie'}
          </div>
        </div>
      </div>

      {/* ── Cloud sync status + cloud backup/restore ── */}
      <CloudSyncSection lastBackupAt={lastBackupAt} setLastBackupAt={setLastBackupAt} />

      {/* ── Download JSON backup ── */}
      <button
        onClick={() => exportToJSON(lang, setLastBackupAt)}
        className="w-full flex items-center gap-4 px-5 py-4 active:bg-green-50 transition-colors min-h-[64px] text-left"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#dcfce7' }}>
          <Download className="w-5 h-5 text-green-700" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{lang === 'am' ? 'ምትኬ አውርድ (JSON)' : 'Download backup (JSON)'}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {lastBackupAt
              ? `${lang === 'am' ? 'የመጨረሻ ምትኬ' : 'Last backup'}: ${new Date(lastBackupAt).toLocaleDateString()}`
              : lang === 'am' ? 'ምትኬ ምርጥ ልምድ ነው' : 'Backup is a best practice'}
          </div>
        </div>
      </button>

      {/* ── Share backup ── */}
      <button
        onClick={() => shareBackup(lang, setLastBackupAt)}
        className="w-full flex items-center gap-4 px-5 py-4 active:bg-gray-50 transition-colors min-h-[64px] text-left"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f3f4f6' }}>
          <Share2 className="w-5 h-5 text-gray-600" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{lang === 'am' ? 'ምትኬ አጋራ' : 'Share backup'}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {lang === 'am' ? 'ወደ Google Drive ወይም Telegram ላክ' : 'Send to Google Drive, Telegram, etc.'}
          </div>
        </div>
      </button>

      {/* ── CSV export ── */}
      <button
        onClick={() => exportToCSV(transactions, lang)}
        disabled={totalEntries === 0}
        className="w-full flex items-center gap-4 px-5 py-4 active:bg-gray-50 transition-colors min-h-[64px] disabled:opacity-40 text-left"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f3f4f6' }}>
          <Download className="w-5 h-5 text-gray-600" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{lang === 'am' ? 'CSV አውጣ (ለሂሳብ ቤት)' : 'Export CSV (for accountant)'}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {lang === 'am' ? 'ጠፍጣፋ ስፕሬድሺት · ፎቶ የለም' : 'Flat spreadsheet · no photos'}
          </div>
        </div>
      </button>

      {/* ── Restore from file + danger zone ── */}
      <DangerZoneSection
        totalEntries={totalEntries}
        totalCustomers={totalCustomers}
        t={t}
      />
    </div>
  );
}
