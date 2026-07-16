import { Suspense } from 'react';
import { Share2 } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { useAppStore } from '../stores/appStore';
import ProfitCard from './ProfitCard';
import TxRow from './TxRow';
import { PanelFallback } from './Fallbacks';
import { DailySuggestions, LearningInsights } from '../utils/lazyImports';
import { fmt } from '../utils/numformat';

export default function TodayTab({
  transactions,
  todayTransactions,
  yesterdayNet,
  ledgerTransactions,
  lastSavedSnapshot,
  lastBackupAt,
  onShareReport,
}) {
  const { lang, t } = useLang();
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const setShowForm = useAppStore(s => s.setShowForm);
  const setEditTarget = useAppStore(s => s.setEditTarget);
  const setDeleteTarget = useAppStore(s => s.setDeleteTarget);
  const backupNudgeDismissed = useAppStore(s => s.backupNudgeDismissed);
  const setBackupNudgeDismissed = useAppStore(s => s.setBackupNudgeDismissed);

  return (
    <div className="space-y-4">
      <ProfitCard transactions={todayTransactions} yesterdayNet={yesterdayNet} />

      {/* Data-loss backup nudge */}
      {(() => {
        if (backupNudgeDismissed || lastBackupAt === undefined) return null;
        const hasData = (transactions.length + ledgerTransactions.length) >= 5;
        if (!hasData) return null;
        const stale = lastBackupAt === null || (Date.now() - lastBackupAt) > 7 * 86400000;
        if (!stale) return null;
        const neverBackedUp = lastBackupAt === null;
        return (
          <div style={{ background: neverBackedUp ? '#fef2f2' : '#fffbeb', border: `1px solid ${neverBackedUp ? '#fecaca' : '#fde68a'}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{neverBackedUp ? '⚠️' : '⏰'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 800, color: neverBackedUp ? '#991b1b' : '#92400e' }}>
                {neverBackedUp ? (lang === 'am' ? 'የማስታወሻ ደብተርዎን ያስቀምጡ' : 'Back up your notebook') : (lang === 'am' ? 'ደብተርዎን ለማስቀመጥ ጊዜው አልፏል' : 'Backup is overdue')}
              </p>
              <p style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: 1, lineHeight: 1.35 }}>
                {lang === 'am' ? 'የእርስዎ መረጃ የሚገኘው በዚህ ስልክ ላይ ብቻ ነው።' : 'Your data lives only on this phone. Back it up so a lost phone doesn\'t mean lost records.'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              <button type="button" onClick={() => setActiveTab('settings')} className="press-scale" style={{ background: neverBackedUp ? '#dc2626' : '#C4883A', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {lang === 'am' ? 'ያስቀምጡ' : 'Back up'}
              </button>
              <button type="button" onClick={() => setBackupNudgeDismissed(true)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '0.66rem', fontWeight: 600, cursor: 'pointer', padding: '2px' }}>
                {lang === 'am' ? 'በኋላ' : 'Later'}
              </button>
            </div>
          </div>
        );
      })()}

      <Suspense fallback={<PanelFallback label={t.loading} />}>
        <DailySuggestions todayTransactions={todayTransactions} onAction={(type) => setShowForm(type)} />
      </Suspense>

      <Suspense fallback={null}>
        <LearningInsights />
      </Suspense>

      {/* Today entries */}
      <div>
        <div className="flex items-center justify-between pb-1.5">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 font-sans">
            {lang === 'am' ? 'ምዝገባዎች' : 'ENTRIES'}
            <span className="ml-2 text-[11px] font-semibold text-gray-400 tracking-normal normal-case">{todayTransactions.length}</span>
          </h3>
          <button onClick={onShareReport} className="p-1.5 press-scale" aria-label={lang === 'am' ? 'አጋራ' : 'Share'}>
            <Share2 className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {todayTransactions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium" style={{ color: '#6b7280' }}>{lang === 'am' ? 'ገና ምንም ምዝገባ የለም' : 'No entries yet'}</p>
            <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>{lang === 'am' ? 'ለመጀመር ከላይ ይጫኑ' : 'Tap above to start'}</p>
            {transactions.length === 0 && ledgerTransactions.length === 0 && (
              <div style={{
                marginTop: 16,
                padding: 16,
                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                border: '1px solid #bbf7d0',
                borderRadius: 12,
              }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1B4332', marginBottom: 12 }}>
                  {lang === 'am' ? '📒 ደብተርዎን ጀምር' : '📒 Start your notebook'}
                </p>
                <p style={{ fontSize: 11, color: '#4b5563', marginBottom: 12, lineHeight: 1.5 }}>
                  {lang === 'am'
                    ? 'ሽያጭ ወይም ወጪ መዝግብ። ሁሉም መረጃ በዚህ ስልክ ላይ ይቀመጣል።'
                    : 'Record sales and expenses. All data stays on this phone.'
                  }
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('credit')}
                  className="press-scale"
                  style={{
                    background: '#1B4332',
                    color: '#fff', border: 'none', borderRadius: 8,
                    padding: '8px 16px', fontSize: 12, fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {lang === 'am' ? 'ተጨማሪ ይያዩ' : 'View Credit Page'} →
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
            {todayTransactions.map(tx => (
              <TxRow
                key={tx.id}
                tx={tx}
                onTap={() => setEditTarget(tx)}
                onEdit={() => setEditTarget(tx)}
                onDelete={() => setDeleteTarget(tx)}
                t={t}
                lang={lang}
                fmt={fmt}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
