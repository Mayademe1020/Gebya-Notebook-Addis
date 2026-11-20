import { Info, Download, Upload } from 'lucide-react';
import { useState } from 'react';
import { useLang } from '../../context/LangContext';
import DangerZoneSection from './backup/DangerZoneSection';
import { exportToCSV } from './backup/useBackupData';
import { createCloudSnapshot } from '../../utils/useAutoBackup';
import { fireToast } from '../Toast';
import { label } from '../../labels/index.js';

export default function BackupDataPanel({ transactions, customerSummaries }) {
  const { lang, t } = useLang();
  const [manualBackupLoading, setManualBackupLoading] = useState(false);

  const totalEntries = (transactions || []).length;
  const totalCustomers = (customerSummaries || []).length;

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden divide-y divide-green-100/30">
      {/* Header: stored data summary */}
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-success-bg)' }}>
          <Info className="w-5 h-5 text-green-700" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{t.storedOnDevice}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {totalEntries} {label('settings-data.entries', lang)} · {totalCustomers} {label('settings-data.customers-in-dubie', lang)}
          </div>
        </div>
      </div>

      {/* CSV export */}
      <button
        onClick={() => exportToCSV(transactions, lang)}
        disabled={totalEntries === 0}
        className="w-full flex items-center gap-4 px-5 py-4 active:bg-gray-50 transition-colors min-h-[64px] disabled:opacity-40 text-left"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-bg-hover)' }}>
          <Download className="w-5 h-5 text-gray-600" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{label('settings-data.export-csv-for-accountant', lang)}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {label('settings-data.flat-spreadsheet-no-photos', lang)}
          </div>
        </div>
      </button>

      {/* Manual cloud backup button */}
      <button
        onClick={async () => {
          setManualBackupLoading(true);
          try {
            const result = await createCloudSnapshot();
            if (result.ok) {
              fireToast(label('settings-data.backup-completed', lang), 1800);
            } else {
              fireToast(label('settings-data.backup-failed', lang), 2600);
            }
          } catch (err) {
            fireToast(label('settings-data.backup-failed', lang), 2600);
          } finally {
            setManualBackupLoading(false);
          }
        }}
        disabled={manualBackupLoading || totalEntries === 0}
        className="w-full flex items-center gap-4 px-5 py-4 active:bg-gray-50 transition-colors min-h-[64px] disabled:opacity-40 text-left"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-primary-bg, #e8f5f0)' }}>
          <Upload className="w-5 h-5 text-green-700" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{label('settings-data.back-up-to-cloud', lang)}</div>
          <div className="text-xs text-gray-500 mt-0.5">{label('settings-data.requires-sign-in-encrypted-in-transit', lang)}</div>
        </div>
        {manualBackupLoading && (
          <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        )}
      </button>

      {/* Restore from file + danger zone */}
            <DangerZoneSection
        totalEntries={totalEntries}
        totalCustomers={totalCustomers}
        t={t}
      />
    </div>
  );
}