import { useState } from 'react';
import { useLang } from '../../../context/LangContext';
import { fireToast } from '../../Toast';
import { Trash2 } from 'lucide-react';
import { clearAllData, restoreFromJSON } from './useBackupData';

/**
 * Handles local-file restore and the "Start over / wipe phone" danger zone.
 * Props:
 *   totalEntries        – number
 *   totalCustomers      – number
 *   t                   – translation object
 */
export default function DangerZoneSection({ totalEntries, totalCustomers, t }) {
  const { lang } = useLang();

  // Restore flow
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoreConfirmStep2, setRestoreConfirmStep2] = useState(false);

  // Clear-all flow
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showClearConfirmStep2, setShowClearConfirmStep2] = useState(false);
  const [cleared, setCleared] = useState(false);

  const handleImportFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data?.gebya_backup_version !== 1) throw new Error('Not a valid Gebya backup file');
        setRestoreTarget(data);
      } catch (err) {
        fireToast(lang === 'am' ? 'የተበላሸ ምትኬ ፋይል' : 'Invalid backup file', 2400);
        if (import.meta.env.DEV) console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRestoreConfirm = async () => {
    try {
      await restoreFromJSON(restoreTarget, () => {});
      setRestoreTarget(null);
      setRestoreConfirmStep2(false);
      fireToast(lang === 'am' ? '✓ መልሶ ተመለሰ — በመጫን ላይ…' : '✓ Restored — reloading…', 1800);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Restore failed:', err);
      fireToast(lang === 'am' ? 'መልሶ ማስቀመጥ አልተሳካም' : 'Restore failed', 2600);
      setRestoreTarget(null);
      setRestoreConfirmStep2(false);
    }
  };

  return (
    <>
      {/* Restore from file row */}
      <label className="w-full flex items-center gap-4 px-5 py-4 active:bg-amber-50 transition-colors min-h-[64px] cursor-pointer" style={{ background: '#fff' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fef3c7' }}>
          <Trash2 className="w-5 h-5" style={{ color: '#92400e' }} />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{lang === 'am' ? 'ከምትኬ ፋይል መልሰው ይጫኑ' : 'Restore from backup file'}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {lang === 'am' ? 'ሁሉንም መረጃ ይተካል · ሁለት ጊዜ ማረጋገጫ ያስፈልጋል' : 'Replaces all data · two-step confirm'}
          </div>
        </div>
        <input type="file" accept=".json,application/json" onChange={handleImportFileSelected} className="hidden" />
      </label>

      {/* Start over row */}
      <button
        onClick={() => setShowClearConfirm(true)}
        className="w-full flex items-center gap-4 px-5 py-4 active:bg-red-50 transition-colors min-h-[64px] text-left"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fff1f2' }}>
          <Trash2 className="w-5 h-5 text-red-600" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-red-600">{lang === 'am' ? 'መልሰው ጀምር' : 'Start over on this phone'}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {lang === 'am' ? 'ሁሉንም ይሰርዛል — መልሶ ማግኘት አይቻልም' : 'Deletes everything — cannot be undone'}
          </div>
        </div>
      </button>

      {/* ── Clear confirm step 1 ── */}
      {showClearConfirm && !showClearConfirmStep2 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-4xl text-center mb-3">⚠️</div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
              {lang === 'am' ? 'በዚህ ስልክ መልሰው ይጀምሩ?' : 'Start over on this phone?'}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              {lang === 'am'
                ? `ይህ ${totalEntries} መዝገብ፣ ${totalCustomers} ደንበኞች ይሰረዛሉ።`
                : `This will delete ${totalEntries} entries, ${totalCustomers} customer ledgers. Cannot be undone.`}
            </p>
            <div className="space-y-2">
              <button onClick={() => setShowClearConfirmStep2(true)} className="w-full p-4 bg-red-500 text-white rounded-2xl font-bold min-h-[52px]">
                {lang === 'am' ? 'ቀጥል →' : 'Continue →'}
              </button>
              <button onClick={() => setShowClearConfirm(false)} className="w-full p-4 rounded-2xl font-bold min-h-[52px]" style={{ background: '#f5f5f5', color: '#374151' }}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear confirm step 2 ── */}
      {showClearConfirmStep2 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border-2" style={{ borderColor: '#dc2626' }}>
            <div className="text-4xl text-center mb-3">🛑</div>
            <h3 className="text-xl font-black text-red-600 text-center mb-2">{lang === 'am' ? 'እርግጠኛ ነዎት?' : 'Are you sure?'}</h3>
            <p className="text-sm text-gray-700 text-center mb-2 font-bold">
              {lang === 'am' ? 'ይህ የመጨረሻ ማረጋገጫ ነው።' : 'This is your last chance to cancel.'}
            </p>
            <div className="space-y-2">
              <button
                onClick={() => { setShowClearConfirmStep2(false); clearAllData(setCleared, setShowClearConfirm); }}
                className="w-full p-4 bg-red-600 text-white rounded-2xl font-bold min-h-[52px]"
              >
                {lang === 'am' ? 'አዎ፣ አሁን ሰርዝ' : 'Yes, delete everything now'}
              </button>
              <button
                onClick={() => { setShowClearConfirmStep2(false); setShowClearConfirm(false); }}
                className="w-full p-4 rounded-2xl font-bold min-h-[52px]"
                style={{ background: '#1B4332', color: '#fff' }}
              >
                {lang === 'am' ? 'አይ፣ አቁም' : 'No, keep my data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Restore step 1 ── */}
      {restoreTarget && !restoreConfirmStep2 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-4xl text-center mb-3">⚠️</div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
              {lang === 'am' ? 'ምትኬ ይመለስ?' : 'Restore from backup?'}
            </h3>
            <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: '#fafaf5', border: '1px solid #ece6d6' }}>
              <p className="font-bold text-gray-700 mb-1">{lang === 'am' ? 'በዚህ ምትኬ ውስጥ' : 'Backup contains'}:</p>
              <div className="space-y-0.5 text-gray-600">
                <div>{restoreTarget.counts?.transactions || 0} {lang === 'am' ? 'ሽያጭ + ወጪ' : 'sales + expenses'}</div>
                <div>{restoreTarget.counts?.customers || 0} {lang === 'am' ? 'ደንበኞች' : 'customers'}</div>
                <div>{restoreTarget.counts?.suppliers || 0} {lang === 'am' ? 'አቅራቢዎች' : 'suppliers'}</div>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={() => setRestoreConfirmStep2(true)} className="w-full p-4 rounded-2xl text-white font-bold min-h-[52px]" style={{ background: '#C4883A' }}>
                {lang === 'am' ? 'ቀጥል →' : 'Continue →'}
              </button>
              <button onClick={() => setRestoreTarget(null)} className="w-full p-4 rounded-2xl font-bold min-h-[52px]" style={{ background: '#f5f5f5', color: '#374151' }}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Restore step 2 ── */}
      {restoreTarget && restoreConfirmStep2 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border-2" style={{ borderColor: '#dc2626' }}>
            <div className="text-4xl text-center mb-3">🔄</div>
            <h3 className="text-xl font-black text-red-600 text-center mb-2">{lang === 'am' ? 'እርግጠኛ ነዎት?' : 'Are you sure?'}</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              {lang === 'am' ? 'ከመመለስ በፊት የአሁኑን መረጃ ምትኬ ይውሰዱ።' : 'Tip: download a backup of current data first.'}
            </p>
            <div className="space-y-2">
              <button onClick={handleRestoreConfirm} className="w-full p-4 bg-red-600 text-white rounded-2xl font-bold min-h-[52px]">
                {lang === 'am' ? 'አዎ፣ መልሰው ጫን' : 'Yes, restore now'}
              </button>
              <button onClick={() => { setRestoreConfirmStep2(false); setRestoreTarget(null); }} className="w-full p-4 rounded-2xl font-bold min-h-[52px]" style={{ background: '#1B4332', color: '#fff' }}>
                {lang === 'am' ? 'አይ፣ ይተወው' : 'No, keep current data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cleared success overlay */}
      {cleared && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: '#fff1f2' }}>
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
