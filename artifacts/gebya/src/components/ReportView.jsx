// ReportView.jsx — The Owner's Desk
//
// Thin orchestrator. Computes data, renders chapters.
// Each chapter answers ONE question.
// Progressive disclosure: summary → inline expand → dedicated page.

import { useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { usePrivacy } from '../context/PrivacyContext';
import { getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
import AskNotebookFAB from './AskNotebookFAB';
import SearchSheet from './SearchSheet';
import {
  ALL_SCOPE,
  amountOf,
  buildReportRows,
  buildStaffReportRows,
  computeReportMetrics,
  startOfLocalDay,
} from '../utils/reportSelectors';
import {
  computeShopStory,
  computeMoneySummary,
  computeSalesSummary,
  computeCreditSummary,
  computeStaffSummary,
  computeAttentionItems,
  computeTimeline,
  computeShopDiary,
} from '../utils/shopStory';

// Chapter components
import StoryCard from './report/StoryCard';
import MoneySection from './report/MoneySection';
import SalesSection from './report/SalesSection';
import CreditSection from './report/CreditSection';
import StaffSection from './report/StaffSection';
import ClosingSection from './report/ClosingSection';
import AttentionSection from './report/AttentionSection';
import TimelineSection from './report/TimelineSection';
import HistorySection from './report/HistorySection';
import DiarySection from './report/DiarySection';
import ErrorBoundary from './report/ErrorBoundary';

const DAY_MS = 86400000;

function startOfWeek(ms = Date.now()) {
  const d = new Date(ms);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(ms = Date.now()) {
  const d = new Date(ms);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfMonth(ms = Date.now()) {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function computeExpenseBreakdown(rows = []) {
  const byCategory = new Map();
  for (const row of rows) {
    if (row.report_kind !== 'expense') continue;
    const category = row.item_note || row.item_name || row.note || 'Other';
    const existing = byCategory.get(category) || { category, total: 0 };
    existing.total += amountOf(row);
    byCategory.set(category, existing);
  }
  return Array.from(byCategory.values()).sort((a, b) => b.total - a.total);
}

export default function ReportView({
  transactions = [],
  ledgerTransactions = [],
  enrichedCustomerSummaries = [],
  customers = [],
  suppliers = [],
  shopProfile,
  onEdit,
  onChaseOverdue,
  ownerAlerts = [],
  staffMembers = [],
  activeStaffMemberId = null,
  lang = 'en',
  todayStaffSalesRows = [],
  ownerAlertSettings = {},
  scope = ALL_SCOPE,
  catalogEntries = [],
}) {
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const [showSearchSheet, setShowSearchSheet] = useState(false);
  const [timeRange, _setTimeRange] = useState(() => {
    try { return localStorage.getItem('gebya_report_time_range') || 'today'; } catch { return 'today'; }
  });
  const setTimeRange = (value) => {
    _setTimeRange(value);
    try { localStorage.setItem('gebya_report_time_range', value); } catch {}
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [customFrom, setCustomFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [closingState, setClosingState] = useState({ done: false, cashVariance: 0 });

  const now = Date.now();
  const todayStart = startOfLocalDay(now);
  const isStaffView = Boolean(activeStaffMemberId);
  const viewerStaffId = isStaffView ? activeStaffMemberId : null;

  // Compute time range bounds
  const rangeBounds = useMemo(() => {
    if (timeRange === 'week') return [startOfWeek(now), startOfWeek(now) + 7 * DAY_MS];
    if (timeRange === 'month') return [startOfMonth(now), endOfMonth(now)];
    if (timeRange === 'custom') {
      const start = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : todayStart;
      const endDate = customTo ? new Date(`${customTo}T00:00:00`) : new Date(todayStart);
      endDate.setDate(endDate.getDate() + 1);
      return [start, endDate.getTime()];
    }
    return [todayStart, todayStart + DAY_MS];
  }, [timeRange, customFrom, customTo]);

  const [from, to] = rangeBounds;

  // Build report rows (the expensive computation)
  const reportRows = useMemo(
    () => buildReportRows({ transactions, ledgerTransactions, customers, from, to, scope, viewerStaffId, filters: {} }),
    [transactions, ledgerTransactions, customers, from, to, scope, viewerStaffId]
  );

  // Compute metrics
  const metrics = useMemo(() => computeReportMetrics(reportRows), [reportRows]);

  // Compute staff summary
  const staffRows = useMemo(() => buildStaffReportRows(reportRows), [reportRows]);
  const staffSummary = useMemo(() => computeStaffSummary(staffRows, lang), [staffRows, lang]);

  // Compute credit summary
  const creditSummary = useMemo(
    () => computeCreditSummary(enrichedCustomerSummaries, lang),
    [enrichedCustomerSummaries, lang]
  );

  // Compute expense breakdown
  const expenseBreakdown = useMemo(() => computeExpenseBreakdown(reportRows), [reportRows]);

  // Compute prior period metrics for comparison
  const priorMetrics = useMemo(() => {
    if (timeRange !== 'today') return null;
    const yesterdayStart = todayStart - DAY_MS;
    const priorRows = buildReportRows({
      transactions, ledgerTransactions, customers,
      from: yesterdayStart, to: todayStart,
      scope, viewerStaffId, filters: {},
    });
    return computeReportMetrics(priorRows);
  }, [transactions, ledgerTransactions, customers, todayStart, scope, viewerStaffId, timeRange]);

  // Compute 7-day averages in a single pass (not 7 separate queries)
  const { avgSalesCount, avgExpenses } = useMemo(() => {
    if (timeRange !== 'today') return { avgSalesCount: 0, avgExpenses: 0 };

    // Single pass: group transactions by day for last 7 days
    const dayStart7 = todayStart - (7 * DAY_MS);
    const salesByDay = new Map();
    const expensesByDay = new Map();

    for (const tx of transactions || []) {
      const ts = tx.created_at || 0;
      if (ts < dayStart7 || ts >= todayStart) continue;
      if (tx.type !== 'sale' && tx.type !== 'expense') continue;
      const dayKey = Math.floor(ts / DAY_MS);
      if (tx.type === 'sale') {
        salesByDay.set(dayKey, (salesByDay.get(dayKey) || 0) + 1);
      } else {
        expensesByDay.set(dayKey, (expensesByDay.get(dayKey) || 0) + (Number(tx.amount) || 0));
      }
    }

    // Also count credit transactions from ledger
    for (const entry of ledgerTransactions || []) {
      const ts = entry.created_at || 0;
      if (ts < dayStart7 || ts >= todayStart) continue;
      const isCredit = entry.type === 'credit_add' || entry.type === 'sale_credit';
      if (isCredit) {
        const dayKey = Math.floor(ts / DAY_MS);
        // Credit adds count as sales for anomaly detection
      }
    }

    const totalSales = Array.from(salesByDay.values()).reduce((s, v) => s + v, 0);
    const totalExpenses = Array.from(expensesByDay.values()).reduce((s, v) => s + v, 0);
    const daysWithSales = salesByDay.size || 1;

    return {
      avgSalesCount: Math.round(totalSales / 7),
      avgExpenses: Math.round(totalExpenses / 7),
    };
  }, [transactions, ledgerTransactions, todayStart, timeRange]);

  // Compute shop story
  const story = useMemo(() => {
    const overdueRatio = creditSummary.totalCount > 0 ? creditSummary.overdueCount / creditSummary.totalCount : 0;

    return computeShopStory({
      metrics,
      priorMetrics,
      overdueCount: creditSummary.overdueCount,
      overdueRatio,
      closingDone: closingState.done,
      cashVariance: closingState.cashVariance,
      lang,
    });
  }, [metrics, priorMetrics, creditSummary, closingState, lang]);

  // Compute money summary
  const money = useMemo(() => computeMoneySummary(metrics, lang), [metrics, lang]);

  // Compute sales summary
  const sales = useMemo(() => computeSalesSummary(metrics, lang), [metrics, lang]);

  // Compute attention items
  const attentionItems = useMemo(() => {
    const largestOverdueDays = creditSummary.overdue.length > 0 ? (creditSummary.overdue[0].overdue_days || 0) : 0;

    return computeAttentionItems({
      closingDone: closingState.done,
      cashExpected: metrics.cashExpected,
      cashVariance: closingState.cashVariance,
      overdueCount: creditSummary.overdueCount,
      overdueAmount: creditSummary.overdueAmount,
      largestOverdueDays,
      salesCount: metrics.saleRows?.length || 0,
      avgSalesCount,
      expenses: metrics.spentToday,
      avgExpenses,
      lang,
    });
  }, [metrics, creditSummary, closingState, avgSalesCount, avgExpenses, lang]);

  // Compute timeline
  const timeline = useMemo(() => computeTimeline(reportRows, lang), [reportRows, lang]);

  // Compute diary
  const diary = useMemo(() => {
    const topItem = sales.topItems?.length > 0 ? sales.topItems[0] : null;
    return computeShopDiary({
      metrics,
      topItem,
      overdueCount: creditSummary.overdueCount,
      closingDone: closingState.done,
      cashMismatch: closingState.done && Math.abs(closingState.cashVariance) > (metrics.cashExpected || 1) * 0.05,
      staffSummary,
      lang,
    });
  }, [metrics, sales, creditSummary, staffSummary, closingState, lang]);

  // Check if this is an empty state (no transactions yet)
  const isEmpty = reportRows.length === 0 && (ledgerTransactions || []).length === 0 && timeRange === 'today';

  // Filtered transactions for history
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return reportRows;
    const q = searchQuery.toLowerCase();
    return reportRows.filter(row =>
      (row.title || '').toLowerCase().includes(q) ||
      (row.item_name || '').toLowerCase().includes(q) ||
      (row.customer_name || '').toLowerCase().includes(q) ||
      String(row.amount || '').includes(q)
    );
  }, [reportRows, searchQuery]);

  // CSV export function
  const handleExport = () => {
    const header = ['date', 'type', 'amount', 'item_or_person', 'payment', 'status'];
    const csvEscape = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filteredTransactions.map(row => [
      row.created_at ? new Date(row.created_at).toISOString() : '',
      row.report_kind || row.type,
      row.amount || 0,
      csvEscape(row.title || row.item_name || row.customer_name || ''),
      csvEscape(row.payment_type || 'Cash'),
      csvEscape(row.status || 'recorded'),
    ].join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gebya-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filter handler (placeholder — shows alert for now)
  const handleFilter = () => {
    // TODO: implement filter sheet
    alert(lang === 'am' ? 'ማጣሪያ ገና አልተዘረዘረም' : 'Filter coming soon');
  };

  // Build story with metrics attached for expanded view
  const storyWithMetrics = useMemo(() => ({
    ...story,
    metrics,
  }), [story, metrics]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      padding: '0 12px 120px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '4px 4px 12px',
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 950, color: '#1B4332', lineHeight: 1.05 }}>
            {lang === 'am' ? 'የሱቅ ሁኔታ' : 'Shop Status'}
          </h1>
          <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 650, marginTop: 3 }}>
            {shopProfile?.name || (lang === 'am' ? 'በዚህ ስልክ' : 'Your shop')} · {getCurrentEthiopianDate()}
          </p>
        </div>
        <button
          type="button"
          onClick={togglePrivacy}
          aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minHeight: 36,
            padding: '7px 10px',
            borderRadius: 999,
            border: hidden ? '1px solid #fde68a' : '1px solid #e5e7eb',
            background: hidden ? 'rgba(196,136,58,0.10)' : '#fff',
            color: hidden ? '#92400e' : '#6b7280',
            fontSize: 12,
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {hidden ? (lang === 'am' ? 'አሳይ' : 'Show') : (lang === 'am' ? 'ደብቅ' : 'Hide')}
        </button>
      </div>

      {/* Time Range — sticky utility bar */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        background: '#fafaf5',
        paddingTop: 4,
        paddingBottom: 8,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 4,
          background: 'rgba(27,67,50,0.08)',
          borderRadius: 12,
          padding: 4,
        }}>
          {[
            ['today', lang === 'am' ? 'ዛሬ' : 'Today'],
            ['week', lang === 'am' ? 'ሳምንት' : 'Week'],
            ['month', lang === 'am' ? 'ወር' : 'Month'],
            ['custom', lang === 'am' ? 'Custom' : 'Custom'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTimeRange(id)}
              style={{
                minHeight: 34,
                border: 'none',
                borderRadius: 9,
                background: timeRange === id ? '#1B4332' : 'transparent',
                color: timeRange === id ? '#fff' : '#6b7280',
                fontSize: 12,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range */}
      {timeRange === 'custom' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#6b7280' }}>
              {lang === 'am' ? 'ከ' : 'From'}
            </span>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              style={{ minHeight: 38, border: '1px solid #e5e7eb', borderRadius: 9, padding: '6px 8px', fontSize: 13 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#6b7280' }}>
              {lang === 'am' ? 'ወደ' : 'To'}
            </span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              style={{ minHeight: 38, border: '1px solid #e5e7eb', borderRadius: 9, padding: '6px 8px', fontSize: 13 }}
            />
          </label>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* THE 10 SECTIONS — Each answers ONE question       */}
      {/* ═══════════════════════════════════════════════════ */}

      {/* Empty state — no transactions yet */}
      {isEmpty && (
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
          border: '1px solid #bbf7d0',
          borderRadius: 16,
          padding: 24,
          marginTop: 8,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📒</div>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1B4332', marginBottom: 8 }}>
            {lang === 'am' ? 'ወደ ሱቅ ታሪክ እንኳን በደህና መጡ' : 'Welcome to your shop'}
          </h2>
          <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6, marginBottom: 16, maxWidth: 320, margin: '0 auto 16px' }}>
            {lang === 'am'
              ? 'ዝግጁ ሲሆን ሽያጭ ወይም ወጪ መዝግብ። ሱቅዎ ሁኔታ ይሄ በፈጣን ይዘርጋል።'
              : 'Record a sale or expense to get started. Your shop status will appear here.'
            }
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('gebya:open-form', { detail: { type: 'sale' } }))}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                border: 'none',
                background: '#1B4332',
                color: '#fff',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {lang === 'am' ? '🛒 ሽያጭ መዝግብ' : 'Record a Sale'}
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('gebya:open-form', { detail: { type: 'expense' } }))}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                border: '1px solid #1B4332',
                background: '#fff',
                color: '#1B4332',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {lang === 'am' ? '📤 ወጪ መዝግብ' : 'Record Expense'}
            </button>
          </div>
        </div>
      )}

      {/* 1. Shop Story — "Is my shop okay?" */}
      <ErrorBoundary>
        <StoryCard story={storyWithMetrics} hidden={hidden} lang={lang} />
      </ErrorBoundary>

      {/* 2. Money — "Where is my money?" */}
      <ErrorBoundary>
        <MoneySection money={money} expenseBreakdown={expenseBreakdown} hidden={hidden} lang={lang} />
      </ErrorBoundary>

      {/* 3. Sales Summary — "What did we sell?" */}
      <ErrorBoundary>
        <SalesSection sales={sales} hidden={hidden} lang={lang} />
      </ErrorBoundary>

      {/* 4. Credit & Customers — "Who owes me?" */}
      {!isStaffView && (
        <ErrorBoundary>
          <CreditSection credit={creditSummary} hidden={hidden} lang={lang} />
        </ErrorBoundary>
      )}

      {/* 5. Staff — "How is everyone doing?" */}
      {!isStaffView && staffSummary && (
        <ErrorBoundary>
          <StaffSection staffSummary={staffSummary} hidden={hidden} lang={lang} />
        </ErrorBoundary>
      )}

      {/* 6. Shop Closing — "Can I close today?" */}
      <ErrorBoundary>
        <ClosingSection
          metrics={metrics}
          isStaffView={isStaffView}
          timeRange={timeRange}
          shopProfile={shopProfile}
          lang={lang}
          onClosingChange={setClosingState}
        />
      </ErrorBoundary>

      {/* 7. Attention — "What needs me?" (only if items exist) */}
      {!isStaffView && attentionItems.length > 0 && (
        <ErrorBoundary>
          <AttentionSection
            items={attentionItems}
            lang={lang}
            onAction={(item) => {
              if (item.type === 'cash_pending') {
                document.querySelector('[data-report-section="closing"]')?.scrollIntoView({ behavior: 'smooth' });
              } else if (item.type === 'overdue_customers') {
                window.dispatchEvent(new CustomEvent('gebya:navigate', { detail: { tab: 'credit' } }));
              }
            }}
          />
        </ErrorBoundary>
      )}

      {/* 8. Timeline — "What happened today?" */}
      <ErrorBoundary>
        <TimelineSection timeline={timeline} hidden={hidden} lang={lang} onAction={onEdit} />
      </ErrorBoundary>

      {/* 9. History & Reports — "What if I need old records?" */}
      <ErrorBoundary>
        <HistorySection
          transactions={filteredTransactions}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onEdit={onEdit}
          onExport={handleExport}
          onFilter={handleFilter}
          hidden={hidden}
          lang={lang}
        />
      </ErrorBoundary>

      {/* 10. Shop Diary — "What should I remember?" */}
      {!isStaffView && timeRange === 'today' && (
        <ErrorBoundary>
          <DiarySection diary={diary} lang={lang} />
        </ErrorBoundary>
      )}

      <AskNotebookFAB onClick={() => setShowSearchSheet(true)} />

      {showSearchSheet && (
        <SearchSheet
          transactions={transactions}
          ledgerTransactions={ledgerTransactions}
          customers={customers}
          catalogEntries={catalogEntries}
          lang={lang}
          onClose={() => setShowSearchSheet(false)}
        />
      )}
    </div>
  );
}
