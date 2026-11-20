import { Suspense } from 'react';
import { Share2 } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { useAppStore } from '../stores/appStore';
import ProfitCard from './ProfitCard';
import TxRow from './TxRow';
import TrustCard from './TrustCard';
import { PanelFallback } from './Fallbacks';
import { DailySuggestions, LearningInsights, SaleWorkspace } from '../utils/lazyImports';
import RunningTotalPill from './RunningTotalPill';
import { computeStaffTodayTotals, computeTodayTotalsByStaff } from '../utils/staffTodayTotals';
import { fmt } from '../utils/numformat';
import { label } from '../labels/index.js';

export default function TodayTab({
  transactions,
  todayTransactions,
  yesterdayNet,
  ledgerTransactions,
  lastSavedSnapshot,
  onShareReport,
  onSave,
  onDeleteTransaction,
  enabledProviders,
  catalogEntries,
  customers,
  onSaveCatalogEntry,
  onAddCustomerInline,
  onAddProvider,
  todaysSales,
  actorLabel,
  shopProfile,
  initialPaymentType,
  initialPaymentProvider,
  activeStaffMemberId = null,
  staffMembers = [],
}) {
  const todaySales = todaysSales;
  const { lang, t } = useLang();
  const setShowForm = useAppStore(s => s.setShowForm);
  const setEditTarget = useAppStore(s => s.setEditTarget);
  const setDeleteTarget = useAppStore(s => s.setDeleteTarget);

  // Phase 8c: live running totals
  const isStaffActor = activeStaffMemberId != null
    && staffMembers.some(m => String(m.id) === String(activeStaffMemberId) && m.active !== false);
  const staffOwnTotals = isStaffActor
    ? computeStaffTodayTotals(todayTransactions, activeStaffMemberId)
    : null;
  const ownerBreakdown = isStaffActor ? null : computeTodayTotalsByStaff(todayTransactions, staffMembers);
  const activeStaffToday = ownerBreakdown ? ownerBreakdown.byStaff.filter(s => s.salesCount > 0) : [];

  return (
    <div className="space-y-4">
      <ProfitCard transactions={todayTransactions} yesterdayNet={yesterdayNet} compact={true} />

      {/* Phase 8c: live running totals */}
      {isStaffActor && staffOwnTotals ? (
        <div>
          <RunningTotalPill
            total={staffOwnTotals.salesTotal}
            count={staffOwnTotals.salesCount}
            creditCount={staffOwnTotals.creditCount}
            lang={lang}
          />
        </div>
      ) : (ownerBreakdown && (ownerBreakdown.owner.salesCount > 0 || activeStaffToday.length > 0)) ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {ownerBreakdown.owner.salesCount > 0 && (
            <RunningTotalPill
              total={ownerBreakdown.owner.salesTotal}
              count={ownerBreakdown.owner.salesCount}
              creditCount={ownerBreakdown.owner.creditCount}
              lang={lang}
              compact
            />
          )}
          {activeStaffToday.map(s => (
            <RunningTotalPill
              key={s.staffId}
              label={s.name}
              total={s.salesTotal}
              count={s.salesCount}
              creditCount={s.creditCount}
              lang={lang}
              compact
            />
          ))}
        </div>
      ) : null}

      {/* Unified Sale Workspace — inline capture strip (zero-tap simple sales).
          Grows in place via "+ Add details"; full-screen variant opens from
          the action bar's "+ New Sale" button. */}
      <Suspense fallback={<PanelFallback label={t.loading} />}>
        <SaleWorkspace
          variant="inline"
          onSave={onSave}
          onDeleteTransaction={onDeleteTransaction}
          enabledProviders={enabledProviders}
          catalogEntries={catalogEntries}
          customers={customers}
          onSaveCatalogEntry={onSaveCatalogEntry}
          onAddCustomerInline={onAddCustomerInline}
          onAddProvider={onAddProvider}
          transactions={todaySales}
          actorLabel={actorLabel}
          shopProfile={shopProfile}
          initialPaymentType={initialPaymentType}
          initialPaymentProvider={initialPaymentProvider}
        />
      </Suspense>

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
            {label('today.entries', lang)}
            <span className="ml-2 text-[11px] font-semibold text-gray-400 tracking-normal normal-case">{todayTransactions.length}</span>
          </h3>
          <button onClick={onShareReport} className="p-1.5 press-scale" aria-label={label('today.share', lang)}>
            <Share2 className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {todayTransactions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>{label('today.no-entries-yet', lang)}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-soft)' }}>{label('today.tap-above-to-start', lang)}</p>
            {transactions.length === 0 && ledgerTransactions.length === 0 && (
              <TrustCard
                totalEntries={0}
                todayCount={0}
                lastSavedSnapshot={lastSavedSnapshot}
                onStartSale={() => setShowForm('sale')}
                t={t}
              />
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
