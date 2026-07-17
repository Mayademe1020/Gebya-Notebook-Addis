import { useMemo, useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { usePrivacy } from '../context/PrivacyContext';
import { getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
import { useTimeOfDay } from '../hooks/useTimeOfDay';
import {
  ALL_SCOPE,
  buildReportRows,
  buildStaffReportRows,
  computeReportMetrics,
  startOfLocalDay,
} from '../utils/reportSelectors';
import {
  computeCreditSummary,
  computeStaffSummary,
  computeStaffReconciliation,
} from '../utils/shopStory';

import HeroStatus from './HeroStatus';
import TodayBusiness from './TodayBusiness';
import DoThisNext from './DoThisNext';
import StaffReportSheet from './StaffReportSheet';
import WhatINoticed from './WhatINoticed';
import TodayStory from './TodayStory';
import TimelineView from './TimelineView';
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

export default function ReportView({
  transactions = [],
  ledgerTransactions = [],
  enrichedCustomerSummaries = [],
  customers = [],
  shopProfile,
  onEdit,
  activeStaffMemberId = null,
  scope = ALL_SCOPE,
}) {
  const { lang } = useLang();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const [timeRange, _setTimeRange] = useState(() => {
    try { return localStorage.getItem('gebya_report_time_range') || 'today'; } catch { return 'today'; }
  });
  const setTimeRange = (value) => {
    _setTimeRange(value);
    try { localStorage.setItem('gebya_report_time_range', value); } catch {}
  };
  const [customFrom, setCustomFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));

  const now = Date.now();
  const todayStart = startOfLocalDay(now);

  const closingKey = `gebya_closing_${todayStart}`;
  const [closingState, setClosingState] = useState(() => {
    try {
      const saved = localStorage.getItem(closingKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { done: false, cashVariance: 0, cashInHand: 0, staffReports: {} };
  });

  useEffect(() => {
    try { localStorage.setItem(closingKey, JSON.stringify(closingState)); } catch {}
  }, [closingKey, closingState]);
  const isStaffView = Boolean(activeStaffMemberId);
  const viewerStaffId = isStaffView ? activeStaffMemberId : null;
  const { period } = useTimeOfDay();
  const isToday = timeRange === 'today';

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

  const reportRows = useMemo(
    () => buildReportRows({ transactions, ledgerTransactions, customers, from, to, scope, viewerStaffId, filters: {} }),
    [transactions, ledgerTransactions, customers, from, to, scope, viewerStaffId]
  );

  const metrics = useMemo(() => computeReportMetrics(reportRows), [reportRows]);
  const staffRows = useMemo(() => buildStaffReportRows(reportRows), [reportRows]);
  const staffSummary = useMemo(() => computeStaffSummary(staffRows, lang), [staffRows, lang]);
  const creditSummary = useMemo(
    () => computeCreditSummary(enrichedCustomerSummaries, lang),
    [enrichedCustomerSummaries, lang]
  );

  const priorMetrics = useMemo(() => {
    if (!isToday) return null;
    const yesterdayStart = todayStart - DAY_MS;
    const priorRows = buildReportRows({
      transactions, ledgerTransactions, customers,
      from: yesterdayStart, to: todayStart,
      scope, viewerStaffId, filters: {},
    });
    return computeReportMetrics(priorRows);
  }, [transactions, ledgerTransactions, customers, todayStart, scope, viewerStaffId, isToday]);

  const { avgSalesCount, avgExpenses } = useMemo(() => {
    if (!isToday) return { avgSalesCount: 0, avgExpenses: 0 };
    const dayStart7 = todayStart - (7 * DAY_MS);
    const salesByDay = new Map();
    const expensesByDay = new Map();
    for (const tx of transactions || []) {
      const ts = tx.created_at || 0;
      if (ts < dayStart7 || ts >= todayStart) continue;
      if (tx.type !== 'sale' && tx.type !== 'expense') continue;
      const dayKey = Math.floor(ts / DAY_MS);
      if (tx.type === 'sale') salesByDay.set(dayKey, (salesByDay.get(dayKey) || 0) + 1);
      else expensesByDay.set(dayKey, (expensesByDay.get(dayKey) || 0) + (Number(tx.amount) || 0));
    }
    const totalSales = Array.from(salesByDay.values()).reduce((s, v) => s + v, 0);
    const totalExpenses = Array.from(expensesByDay.values()).reduce((s, v) => s + v, 0);
    return { avgSalesCount: Math.round(totalSales / 7), avgExpenses: Math.round(totalExpenses / 7) };
  }, [transactions, ledgerTransactions, todayStart, isToday]);

  const unconfirmedStaffCount = useMemo(() =>
    staffRows.filter(s => !closingState.staffReports?.[s.id]?.confirmed).length,
    [staffRows, closingState.staffReports]
  );

  const staffReconciliation = useMemo(() =>
    computeStaffReconciliation(staffRows, closingState),
    [staffRows, closingState]
  );

  const isEmpty = reportRows.length === 0 && (ledgerTransactions || []).length === 0 && isToday;

  const handleExport = () => {
    const header = ['date', 'type', 'amount', 'item_or_person', 'payment', 'status'];
    const csvEscape = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = reportRows.map(row => [
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

  const handleAction = (actionType) => {
    if (actionType === 'count_cash') {
      const el = document.getElementById('today-business');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else if (actionType === 'retro_close') {
      const cashYouShouldHave = (metrics.cashExpected || 0) + (metrics.creditCollected || 0) - (metrics.spentToday || 0);
      handleClose({ cashInHand: cashYouShouldHave, cashVariance: 0 });
    } else if (actionType === 'overdue') {
      window.dispatchEvent(new CustomEvent('gebya:navigate', { detail: { tab: 'credit' } }));
    } else if (actionType === 'sale') {
      window.dispatchEvent(new CustomEvent('gebya:open-form', { detail: { type: 'sale' } }));
    } else if (actionType === 'view_details' || actionType === 'review') {
      document.getElementById('today-business')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleClose = ({ cashInHand, cashVariance }) => {
    setClosingState(prev => ({ ...prev, done: true, cashInHand, cashVariance }));
  };

  const handleStaffConfirm = (staffId, report) => {
    setClosingState(prev => ({
      ...prev,
      staffReports: { ...prev.staffReports, [staffId]: report },
    }));
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      padding: '0 12px 120px',
    }}>
      {/* Header — title + date + privacy toggle only (no search icon) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '4px 4px 12px',
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 950, color: '#1B4332', lineHeight: 1.05 }}>
            📒 {lang === 'am' ? 'ማስታወሻ ደብተር' : 'Notebook'}
          </h1>
          <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 650, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{getCurrentEthiopianDate()} · {shopProfile?.name || (lang === 'am' ? 'ሱቅህ' : 'Your shop')}</span>
            {isToday && (
              <span style={{
                fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 999,
                background: '#1B4332', color: '#fff', lineHeight: '16px',
              }}>
                {lang === 'am' ? 'ዛሬ' : 'TODAY'}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={togglePrivacy}
            aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 36,
              minWidth: 36,
              borderRadius: 999,
              border: hidden ? '1px solid #fde68a' : '1px solid #e5e7eb',
              background: hidden ? 'rgba(196,136,58,0.10)' : '#fff',
              color: hidden ? '#92400e' : '#6b7280',
              cursor: 'pointer',
            }}
          >
            {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Time Range — sticky */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: '#fafaf5', paddingTop: 4, paddingBottom: 8,
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
          background: 'rgba(27,67,50,0.08)', borderRadius: 12, padding: 4,
        }}>
          {[
            ['today', lang === 'am' ? 'ዛሬ' : 'Today'],
            ['week', lang === 'am' ? 'ሳምንት' : 'Week'],
            ['month', lang === 'am' ? 'ወር' : 'Month'],
            ['custom', 'Custom'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTimeRange(id)}
              style={{
                minHeight: 34, border: 'none', borderRadius: 9,
                background: timeRange === id ? '#1B4332' : 'transparent',
                color: timeRange === id ? '#fff' : '#6b7280',
                fontSize: 12, fontWeight: 900, cursor: 'pointer',
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

      {/* Empty state */}
      {isEmpty && (
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
          border: '1px solid #bbf7d0', borderRadius: 16, padding: 24,
          marginTop: 8, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📒</div>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1B4332', marginBottom: 8 }}>
            {lang === 'am' ? 'ወደ ሱቅ ታሪክ እንኳን በደህና መጡ' : 'Welcome to your shop'}
          </h2>
          <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6, marginBottom: 16, maxWidth: 320, margin: '0 auto 16px' }}>
            {lang === 'am'
              ? 'ዝግጁ ሲሆን ሽያጭ ወይም ወጪ መዝግብ። ሱቅዎ ሁኔታ ይሄ በፈጣን ይዘርጋል።'
              : 'Record a sale or expense to get started. Your report will appear here.'}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('gebya:open-form', { detail: { type: 'sale' } }))}
              style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#1B4332', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
            >
              {lang === 'am' ? '🛒 ሽያጭ መዝግብ' : 'Record a Sale'}
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('gebya:open-form', { detail: { type: 'expense' } }))}
              style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #1B4332', background: '#fff', color: '#1B4332', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
            >
              {lang === 'am' ? '📤 ወጪ መዝግብ' : 'Record Expense'}
            </button>
          </div>
        </div>
      )}

      {!isEmpty && (
        <>
          {/* 1. Hero Status — "Am I okay?" + one CTA */}
          {!isStaffView && (
            <ErrorBoundary>
              <h3 style={{ fontSize: 12, fontWeight: 900, color: '#1f2937', marginBottom: 6, marginTop: 6, letterSpacing: '0.03em' }}>
                {lang === 'am' ? 'የሱቅ ሁኔታ' : 'SHOP STATUS'}
              </h3>
              <HeroStatus
                metrics={metrics}
                closingDone={closingState.done}
                cashVariance={closingState.cashVariance}
                overdueCount={creditSummary.overdueCount}
                staffRows={staffReconciliation}
                period={period}
                lang={lang}
                onAction={handleAction}
                isPast={!isToday}
              />
            </ErrorBoundary>
          )}

          {/* 2. Today's Business — expandable money card */}
          <h3 style={{ fontSize: 12, fontWeight: 900, color: '#1f2937', marginBottom: 6, marginTop: 6, letterSpacing: '0.03em' }}>
            {lang === 'am' ? 'የዛሬ ንግድ' : "TODAY'S BUSINESS"}
          </h3>
          <div id="today-business">
            <ErrorBoundary>
              <TodayBusiness
                metrics={metrics}
                closingState={closingState}
                lang={lang}
                onClose={handleClose}
              />
            </ErrorBoundary>
          </div>

          {/* 3. Do This Next — urgency action cards */}
          {isToday && !isStaffView && (
            <ErrorBoundary>
              <DoThisNext
                closingDone={closingState.done}
                cashExpected={metrics.cashExpected}
                cashVariance={closingState.cashVariance}
                overdueCount={creditSummary.overdueCount}
                overdueAmount={creditSummary.overdueAmount}
                largestOverdueDays={creditSummary.overdue[0]?.overdue_days || 0}
                unconfirmedStaff={unconfirmedStaffCount}
                salesCount={metrics.saleRows?.length || 0}
                avgSalesCount={avgSalesCount}
                expenses={metrics.spentToday}
                avgExpenses={avgExpenses}
                lang={lang}
                onAction={handleAction}
                staffReportContent={
                  <StaffReportSheet
                    staffRows={staffRows}
                    closingState={closingState}
                    lang={lang}
                    onStaffConfirm={handleStaffConfirm}
                  />
                }
              />
            </ErrorBoundary>
          )}

          {/* 4. What I Noticed — recommendations */}
          {isToday && !isStaffView && (
            <ErrorBoundary>
              <WhatINoticed
                metrics={metrics}
                priorMetrics={priorMetrics}
                staffSummary={staffSummary}
                overdueCount={creditSummary.overdueCount}
                closingDone={closingState.done}
                creditCollected={metrics.creditCollected}
                lang={lang}
              />
            </ErrorBoundary>
          )}

          {/* 5. Today's Story — narrative paragraph */}
          {isToday && !isStaffView && (
            <ErrorBoundary>
              <TodayStory
                metrics={metrics}
                staffSummary={staffSummary}
                overdueCount={creditSummary.overdueCount}
                overdueAmount={creditSummary.overdueAmount}
                closingDone={closingState.done}
                cashVariance={closingState.cashVariance}
                creditCollected={metrics.creditCollected}
                expenseCount={metrics.expenseRows?.length || 0}
                lang={lang}
              />
            </ErrorBoundary>
          )}

          {/* 6. Today's Entries — search + filter + timeline */}
          <ErrorBoundary>
            <TimelineView
              reportRows={reportRows}
              lang={lang}
              handleExport={handleExport}
              onEdit={onEdit}
            />
          </ErrorBoundary>

          {/* Footer — time range links + export */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center',
            marginTop: 20, padding: '10px 0',
          }}>
            {[
              ['today', lang === 'am' ? 'ዛሬ' : 'Today'],
              ['week', lang === 'am' ? 'ሳምንት' : 'This Week'],
              ['month', lang === 'am' ? 'ወር' : 'This Month'],
              ['custom', lang === 'am' ? 'ብጁ' : 'Custom Range'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTimeRange(id)}
                style={{
                  padding: '4px 10px', borderRadius: 999, border: 'none',
                  background: timeRange === id ? '#1B4332' : '#f3f4f6',
                  color: timeRange === id ? '#fff' : '#6b7280',
                  fontSize: 11, fontWeight: 800, cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleExport}
              style={{
                padding: '4px 10px', borderRadius: 999, border: 'none',
                background: '#f3f4f6', color: '#374151',
                fontSize: 11, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {lang === 'am' ? 'ላክ CSV' : 'Export CSV'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
