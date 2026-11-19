import { useState } from 'react';
import { useLang } from '../../../context/LangContext';
import { fireToast } from '../../Toast';
import { Trash2 } from 'lucide-react';
import { clearAllData, restoreFromJSON } from './useBackupData';
import ConfirmDialog from '../../ConfirmDialog';
import { label } from '../../../labels/index.js';

export default function DangerZoneSection({ totalEntries, totalCustomers, t }) {
  const { lang } = useLang();

  const [restoreTarget, setRestoreTarget] = useState(null);
  const [showClearStep, setShowClearStep] = useState(0);
  const [showRestoreStep, setShowRestoreStep] = useState(0);
  const [cleared, setCleared] = useState(false);

  const handleImportFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data?.gebya_backup_version !== 1) throw new Error('Not a valid Gebya backup file');
        if (!data.tables || typeof data.tables !== 'object') throw new Error('Missing tables in backup');
        if (!Array.isArray(data.tables.transactions)) throw new Error('Missing transactions table');
        setRestoreTarget(data);
        setShowRestoreStep(1);
      } catch (err) {
        fireToast(label('settings-data.invalid-backup-file', lang), 2400);
        if (import.meta.env.DEV) console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRestoreConfirm = async () => {
    try {
      await restoreFromJSON(restoreTarget);
      setRestoreTarget(null);
      setShowRestoreStep(0);
      fireToast(label('settings-data.restored-reloading', lang), 1800);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Restore failed:', err);
      fireToast(label('settings-data.restore-failed', lang), 2600);
      setRestoreTarget(null);
      setShowRestoreStep(0);
    }
  };

  return (
    <>
      <label className="w-full flex items-center gap-4 px-5 py-4 active:bg-amber-50 transition-colors min-h-[64px] cursor-pointer" style={{ background: 'var(--color-surface)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-warning-bg)' }}>
          <Trash2 className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{label('settings-data.restore-from-backup-file', lang)}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {label('settings-data.replaces-all-data-two-step-confirm', lang)}
          </div>
        </div>
        <input type="file" accept=".json,application/json" onChange={handleImportFileSelected} className="hidden" />
      </label>

      <button
        onClick={() => setShowClearStep(1)}
        className="w-full flex items-center gap-4 px-5 py-4 active:bg-red-50 transition-colors min-h-[64px] text-left"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-danger-bg)' }}>
          <Trash2 className="w-5 h-5 text-red-600" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-red-600">{label('settings-data.start-over-on-this-phone', lang)}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {label('settings-data.deletes-everything-cannot-be-undone', lang)}
          </div>
        </div>
      </button>

      <ConfirmDialog
        open={showClearStep === 1}
        title={label('settings-data.start-over-on-this-phone-2', lang)}
        message={label('settings-data.this-will-delete-entries-and-customer', lang, totalEntries, totalCustomers)}
        confirmLabel={label('settings-data.continue', lang)}
        cancelLabel={t.cancel}
        tone="danger"
        onConfirm={() => { setShowClearStep(2); }}
        onCancel={() => setShowClearStep(0)}
      />

      <ConfirmDialog
        open={showClearStep === 2}
        title={label('settings-data.are-you-sure', lang)}
        message={label('settings-data.this-is-your-last-chance-all-data-will-be', lang)}
        confirmLabel={label('settings-data.yes-delete-everything', lang)}
        cancelLabel={label('settings-data.no-keep-my-data', lang)}
        tone="danger"
        onConfirm={() => { setShowClearStep(0); clearAllData(setCleared, () => setShowClearStep(0)); }}
        onCancel={() => setShowClearStep(0)}
      />

      <ConfirmDialog
        open={showRestoreStep === 1}
        title={label('settings-data.restore-from-backup', lang)}
        message={label('settings-data.backup-contains-sales-expenses-customers', lang, restoreTarget?.counts?.transactions || 0, restoreTarget?.counts?.customers || 0, restoreTarget?.counts?.suppliers || 0)}
        confirmLabel={label('settings-data.continue', lang)}
        cancelLabel={t.cancel}
        tone="default"
        onConfirm={() => setShowRestoreStep(2)}
        onCancel={() => { setRestoreTarget(null); setShowRestoreStep(0); }}
      />

      <ConfirmDialog
        open={showRestoreStep === 2}
        title={label('settings-data.are-you-sure', lang)}
        message={label('settings-data.tip-download-a-backup-of-current-data-first', lang)}
        confirmLabel={label('settings-data.yes-restore-now', lang)}
        cancelLabel={label('settings-data.no-keep-current-data', lang)}
        tone="danger"
        onConfirm={handleRestoreConfirm}
        onCancel={() => { setShowRestoreStep(0); setRestoreTarget(null); }}
      />

      {cleared && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--color-danger-bg)' }}>
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <p className="font-bold text-gray-800">{t.dataCleared}</p>
            <p className="text-sm text-gray-500 mt-1">{t.reloading}</p>
          </div>
        </div>
      )}
    </>
  );
}
