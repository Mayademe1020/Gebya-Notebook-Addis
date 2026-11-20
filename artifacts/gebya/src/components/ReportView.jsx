import { useMemo, useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Eye, EyeOff, Search, Share2 } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { usePrivacy } from '../context/PrivacyContext';
import { getCurrentEthiopianDate, formatEthiopianShort } from '../utils/ethiopianCalendar';
import { useTimeOfDay } from '../hooks/useTimeOfDay';
import {
  ALL_SCOPE,
  OWNER_SCOPE,
  buildReportRows,
  buildStaffReportRows,
  computeReportMetrics,
  startOfLocalDay,
  amountOf,
  collectedAmount,
} from '../utils/reportSelectors';
import {
  computeCreditSummary,
  computeStaffSummary,
  computeSalesSummary,
  computePeriodVerdict,
} from '../utils/shopStory';
import { fmt } from '../utils/numformat';
import { fireToast } from './Toast';
import db, { getAllSettlements } from '../db';

import HeroStatus from './HeroStatus';
import TodayBusiness from './TodayBusiness';
import DoThisNext from './DoThisNext';
import WhatINoticed from './WhatINoticed';
import TodayStory from './TodayStory';
import TimelineView from './TimelineView';
import PeriodInsights from './PeriodInsights';
import HandoverStatus from './HandoverStatus';
import SearchSheet from './SearchSheet';
import ErrorBoundary from './report/ErrorBoundary';
import { label } from '../labels/index.js';

const SettlementSheet = lazy(() => import('./report/SettlementSheet'));

const DAY_MS = 86400000;

const EMPTY_CLOSING = { done: false, cashVariance: 0, cashInHand: 0, staffReports: {} };

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

function SectionHeading({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginTop: 14, marginBottom: 6,
    }}>
      <div style={{ flex: 1, height: 1, background: 'var(--color-bg-disabled)' }} />
      <span style={{
        fontSize: 11, fontWeight: 900, color: 'var(--color-text-soft)',
        letterSpacing: '0.06em', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--color-bg-disabled)' }} />
    </div>
  );
}

export default function ReportView({
  transactions = [],
  ledgerTransactions = [],
  enrichedCustomerSummaries = [],
  customers = [],
  catalogEntries = [],
  shopProfile,
  onEdit,
  onShareReport,
  scope = ALL_SCOPE,
  staffMembers = [],
  canSwitchPeople = false,
  myStaffId = null,
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
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState(() => {
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  });
  const [showSearchSheet, setShowSearchSheet] = useState(false);

  // ── Surrender / handover (reuses the existing SettlementSheet flow) ──
  const [sheetTarget, setSheetTarget] = useState(null); // { staff, settlement|null }
  const [handoverRefresh, setHandoverRefresh] = useState(0);

  // ── Per-person day view ──────────────────────────────────────
  // RBAC: ONLY owner/manager (or explicitly permitted) devices may see
  // other people's records and switch between them. Everyone else is
  // locked to their own day — even if their device isn't linked yet
  // (they then see an empty report instead of shop-wide data).
  const UNLINKED_SCOPE = '__unlinked__';
  const isPersonalLocked = !canSwitchPeople;
  const [selectedPerson, setSelectedPerson] = useState(() => {
    if (!canSwitchPeople) return String(myStaffId ?? UNLINKED_SCOPE);
    try { return localStorage.getItem('gebya_report_person') || 'all'; } catch { return 'all'; }
  });
  const activePerson = isPersonalLocked ? String(myStaffId ?? UNLINKED_SCOPE) : selectedPerson;
  const selectPerson = useCallback((id) => {
    if (isPersonalLocked) return;
    setSelectedPerson(id);
    try { localStorage.setItem('gebya_report_person', id); } catch {}
  }, [isPersonalLocked]);
  const isPersonScoped = activePerson !== 'all';
  const effectiveScope = activePerson === 'all' ? scope : activePerson;

  const activePersonName = useMemo(() => {
    if (!isPersonScoped) return '';
    if (activePerson === OWNER_SCOPE) return label('reports.owner', lang);
    const member = (staffMembers || []).find(m => String(m.id) === String(activePerson));
    return member?.display_name || member?.name || '';
  }, [activePerson, isPersonScoped, staffMembers, lang]);

  const switchablePeople = useMemo(() => {
    if (!canSwitchPeople) return [];
    return (staffMembers || [])
      .filter(m => m && m.id != null)
      .map(m => ({ id: String(m.id), name: m.display_name || m.name || '?' }));
  }, [canSwitchPeople, staffMembers]);

  // The staff member being viewed in the personal day view (if any).
  const surrenderStaff = useMemo(() => {
    if (!isPersonScoped || activePerson === OWNER_SCOPE) return null;
    return (staffMembers || []).find(m => String(m.id) === String(activePerson)) || null;
  }, [isPersonScoped, activePerson, staffMembers]);

  // todayStart recomputes on each render — useTimeOfDay causes hourly
  // re-renders so this stays fresh across midnight boundaries.
  const todayStart = startOfLocalDay();

  const { period } = useTimeOfDay();
  const isToday = timeRange === 'today';

  const rangeBounds = useMemo(() => {
    const now = Date.now();
    if (timeRange === 'week') return [startOfWeek(now), startOfWeek(now) + 7 * DAY_MS];
    if (timeRange === 'month') return [startOfMonth(now), endOfMonth(now)];
    if (timeRange === 'custom') {
      const fromMs = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : todayStart;
      const toMs = customTo
        ? new Date(`${customTo}T00:00:00`).getTime() + DAY_MS
        : todayStart + DAY_MS;
      // Guard against a reversed range (From after To) — swap instead of
      // silently rendering an empty report.
      if (fromMs > toMs) return [toMs - DAY_MS, fromMs + DAY_MS];
      return [fromMs, toMs];
    }
    return [todayStart, todayStart + DAY_MS];
  }, [timeRange, customFrom, customTo, todayStart]);

  // ── Closing / self-check record, scoped per period (+person) ──
  // The Everyone view closes the whole day; a person view keeps its own
  // separate self-check record ("does my counted cash match my records?").
  const closingKey = useMemo(
    () => `gebya_closing_${isToday ? todayStart : rangeBounds[0]}${isPersonScoped ? `_${activePerson}` : ''}`,
    [isToday, todayStart, rangeBounds, isPersonScoped, activePerson]
  );
  const [closing, setClosing] = useState({ key: null, data: EMPTY_CLOSING });

  // Load the record for the selected period (runs on period switch).
  // Data lives in IndexedDB (survives cache/PWA data clears, included in
  // backup/restore, and synced across owner devices via the KV push filter).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let data = EMPTY_CLOSING;
      try {
        const row = await db.settings.get(closingKey);
        if (row?.value) data = JSON.parse(row.value);
      } catch { /* IndexedDB unavailable — show empty state */ }
      if (!cancelled) setClosing({ key: closingKey, data });
    })();
    return () => { cancelled = true; };
  }, [closingKey]);

  // Persist only when the in-memory state belongs to the current period,
  // so switching periods never writes stale data into the new key.
  useEffect(() => {
    if (closing.key !== closingKey) return;
    const serialized = JSON.stringify(closing.data);
    // Durable copy in IndexedDB. `settings` is a synced KV table — created_at/
    // updated_at are required for the sync engine's KV push filter and the
    // server's last-write-wins merge, so this record propagates to the owner's
    // other devices and is picked up by backup/restore flows.
    (async () => {
      try {
        const now = Date.now();
        const existing = await db.settings.get(closingKey);
        await db.settings.put({
          key: closingKey,
          value: serialized,
          created_at: existing?.created_at || now,
          updated_at: now,
        });
      } catch { /* non-fatal — data stays in memory */ }
    })();
  }, [closing.key, closing.data, closingKey]);

  const closingState = closing.data || EMPTY_CLOSING;

  const [from, to] = rangeBounds;

  const reportRows = useMemo(
    () => buildReportRows({ transactions, ledgerTransactions, customers, from, to, scope: effectiveScope, viewerStaffId: null, filters: {} }),
    [transactions, ledgerTransactions, customers, from, to, effectiveScope]
  );

  const metrics = useMemo(() => computeReportMetrics(reportRows), [reportRows]);

  // Cash you should have — computed once, used by TodayBusiness, handleClose, and retro_close.
  const cashYouShouldHave = (metrics?.cashExpected || 0) + (metrics?.creditCollected || 0) - (metrics?.spentToday || 0);

  const creditSummary = useMemo(
    () => computeCreditSummary(enrichedCustomerSummaries, lang),
    [enrichedCustomerSummaries, lang]
  );

  const staffRows = useMemo(
    () => buildStaffReportRows(reportRows),
    [reportRows]
  );
  const staffSummary = useMemo(
    () => computeStaffSummary(staffRows, lang),
    [staffRows, lang]
  );

  const priorMetrics = useMemo(() => {
    if (!isToday || isPersonScoped) return null;
    const yesterdayStart = todayStart - DAY_MS;
    const priorRows = buildReportRows({
      transactions, ledgerTransactions, customers,
      from: yesterdayStart, to: todayStart,
      scope, viewerStaffId: null, filters: {},
    });
    return computeReportMetrics(priorRows);
  }, [transactions, ledgerTransactions, customers, todayStart, scope, isToday, isPersonScoped]);

  const isEmpty = reportRows.length === 0 && (ledgerTransactions || []).length === 0;
  // An established shop looking at a quiet period is different from a
  // brand-new shop — each needs its own message.
  const quietPeriod = isEmpty && ((transactions || []).length > 0 || (ledgerTransactions || []).length > 0);
  const unlinkedDevice = isPersonalLocked && !myStaffId;

  // ── Beyond-one-day insights (Week / Month / Custom views) ────
  // The immediately preceding period of equal length — for the verdict.
  const priorPeriodMetrics = useMemo(() => {
    if (isToday || isPersonScoped || isEmpty) return null;
    const len = to - from;
    const priorRows = buildReportRows({
      transactions, ledgerTransactions, customers,
      from: from - len, to: from,
      scope: effectiveScope, viewerStaffId: null, filters: {},
    });
    return computeReportMetrics(priorRows);
  }, [isToday, isPersonScoped, isEmpty, from, to, transactions, ledgerTransactions, customers, effectiveScope]);

  const periodVerdict = useMemo(
    () => computePeriodVerdict({ current: metrics, previous: priorPeriodMetrics, lang }),
    [metrics, priorPeriodMetrics, lang]
  );

  // Top sellers for the selected period (revived computeSalesSummary).
  const salesSummary = useMemo(
    () => computeSalesSummary(metrics, lang),
    [metrics, lang]
  );

  // Per-day money-in buckets for the Week view's day strip.
  const weekDays = useMemo(() => {
    if (timeRange !== 'week' || isPersonScoped || isEmpty) return [];
    const days = [];
    for (let i = 0; i < 7; i++) {
      const ds = from + i * DAY_MS;
      const d = new Date(ds);
      days.push({
        start: ds,
        total: 0,
        label: d.toLocaleDateString(label('reports.en-us', lang), { weekday: 'short' }),
        sub: formatEthiopianShort(ds),
        isToday: ds === todayStart,
      });
    }
    for (const row of reportRows) {
      const ts = Number(row.created_at || 0);
      const idx = Math.floor((ts - from) / DAY_MS);
      if (idx < 0 || idx >= 7) continue;
      // Net money-in per day: sales/collections count positive,
      // expenses subtract.
      days[idx].total += row.report_kind === 'expense'
        ? -amountOf(row)
        : collectedAmount(row);
    }
    return days;
  }, [timeRange, isPersonScoped, isEmpty, from, reportRows, lang, todayStart]);

  const handlePickDay = useCallback((dayStart) => {
    const d = new Date(dayStart - new Date(dayStart).getTimezoneOffset() * 60000);
    const iso = d.toISOString().slice(0, 10);
    setTimeRange('custom');
    setCustomFrom(iso);
    setCustomTo(iso);
  }, []);



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
  }, [transactions, todayStart, isToday]);

  const handleExport = useCallback(() => {
    const header = ['date', 'type', 'amount', 'item_or_person', 'payment', 'status'];
    const csvEscape = (v) => {
      if (v == null) return '';
      let s = String(v);
      // Neutralize spreadsheet formula injection: values starting with = + - @
      // (or a tab/CR) would execute as formulas when opened in Excel/Sheets.
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
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
    // BOM so Excel renders Amharic item names correctly.
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gebya-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [reportRows]);

  const handleClose = useCallback(({ cashInHand, cashVariance }) => {
    setClosing(prev => ({
      key: closingKey,
      data: { ...(prev.key === closingKey ? prev.data : EMPTY_CLOSING), done: true, cashInHand, cashVariance },
    }));
    // Persist immediately so the record (the owner's cash-count evidence in
    // any dispute with staff) is durable before we show feedback.
    const payload = { done: true, cashInHand, cashVariance };
    (async () => {
      try {
        const now = Date.now();
        const existing = await db.settings.get(closingKey);
        await db.settings.put({
          key: closingKey,
          value: JSON.stringify(payload),
          created_at: existing?.created_at || now,
          updated_at: now,
        });
      } catch { /* non-fatal — data stays in memory */ }
    })();
    const variance = cashYouShouldHave - (Number(cashInHand) || 0);
    const msg = variance === 0
      ? (label('reports.closing-recorded', lang))
      : (label('reports.difference', lang, () => fmt(variance), () => variance > 0 ? 'over' : 'short', () => variance > 0 ? 'ከፍተው' : 'ታመከ'));
    fireToast(msg, 3500);
    }, [closingKey, lang, cashYouShouldHave]);

  const handleAction = useCallback((actionType) => {
    if (actionType === 'count_cash') {
      const el = document.getElementById('today-business');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else if (actionType === 'retro_close') {
      handleClose({ cashInHand: cashYouShouldHave, cashVariance: 0 });
    } else if (actionType === 'overdue') {
      window.dispatchEvent(new CustomEvent('gebya:navigate', { detail: { tab: 'credit' } }));
    } else if (actionType === 'collect_staff') {
      // Open the settlement sheet inline so the owner can review
      // staff handovers directly from the report, without leaving.
      // Pick the most urgent staff member — one awaiting owner review first,
      // then one who hasn't handed over yet — instead of an arbitrary first row.
      (async () => {
        const candidates = staffMembers.filter(m => m && m.id != null && m.active !== false);
        if (candidates.length === 0) return;
        const latestByStaff = {};
        try {
          const rows = await getAllSettlements(todayStart, Date.now() + 60000);
          for (const s of rows || []) {
            const id = String(s.staff_id);
            const prev = latestByStaff[id];
            if (!prev || Number(s.updated_at || s.created_at || 0) >= Number(prev.updated_at || prev.created_at || 0)) {
              latestByStaff[id] = s;
            }
          }
        } catch { /* no settlement data — fall back to list order */ }
        const urgency = (settlement) => {
          const rs = settlement?.reconciliation_status;
          if (rs === 'staff_submitted') return 3; // waiting for the owner's review
          if (rs === 'disputed') return 2;        // unresolved mismatch
          if (!rs) return 1;                      // not handed over yet
          return 0;                               // confirmed — least urgent
        };
        candidates.sort((a, b) =>
          urgency(latestByStaff[String(b.id)]) - urgency(latestByStaff[String(a.id)]));
        const target = candidates[0];
        setSheetTarget({ staff: target, settlement: latestByStaff[String(target.id)] || null });
      })();
    } else if (actionType === 'sale') {
      window.dispatchEvent(new CustomEvent('gebya:open-form', { detail: { type: 'sale' } }));
    } else if (actionType === 'view_details' || actionType === 'review') {
      document.getElementById('today-business')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [metrics, handleClose, staffMembers, todayStart]);

  const timeRangeLabel = isToday
    ? (label('reports.today', lang))
    : timeRange === 'week'
      ? (label('reports.this-week', lang))
      : timeRange === 'month'
        ? (label('reports.this-month', lang))
        : (label('reports.custom-range', lang));

  // Share summary — plain text for Telegram/WhatsApp via the existing
  // ShareModal flow. Privacy mode masks every amount.
  const buildShareText = useCallback(() => {
    const H = (v) => (hidden ? '••••' : fmt(v || 0));
    const shopName = shopProfile?.name || (label('reports.my-shop', lang));
    const lines = lang === 'am'
      ? [
          `📒 ${shopName} · ${timeRangeLabel}`,
          `🛒 ጠቅላላ ሽያጭ: ${H(metrics.totalSold)} ETB`,
          `📤 ወጪ: ${H(metrics.spentToday)} ETB`,
          `💰 የዕዳ መሰብሰብ: ${H(metrics.creditCollected)} ETB`,
          `📝 አዲስ ዱቤ: ${H(metrics.newDubie)} ETB`,
          `💵 የሚጠበቅ ጥሬ ገንዘብ: ${H(metrics.cashExpected)} ETB`,
        ]
      : [
          `📒 ${shopName} · ${timeRangeLabel}`,
          `🛒 Total sales: ${H(metrics.totalSold)} ETB`,
          `📤 Expenses: ${H(metrics.spentToday)} ETB`,
          `💰 Debt collected: ${H(metrics.creditCollected)} ETB`,
          `📝 New credit given: ${H(metrics.newDubie)} ETB`,
          `💵 Cash expected: ${H(metrics.cashExpected)} ETB`,
        ];
    const top = salesSummary?.topItems?.[0];
    if (top) {
      lines.push(label('reports.top-seller-etb', lang, top.name, H(top.revenue)));
    }
    // Viral signature: every shared report advertises the app.
    lines.push('', '—— Gebya ገበያ');
    return lines.join('\n');
  }, [hidden, lang, shopProfile, timeRangeLabel, metrics, salesSummary]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 0,
      padding: '0 12px 120px',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, padding: '4px 4px 10px',
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 950, color: 'var(--color-primary)', lineHeight: 1.05 }}>
            📒 {label('reports.notebook', lang)}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 650, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{getCurrentEthiopianDate()} · {shopProfile?.name || (label('reports.your-shop', lang))}</span>
            {isToday && (
              <span style={{
                fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 999,
                background: 'var(--color-primary)', color: 'var(--color-bg-white)', lineHeight: '16px',
              }}>
                {label('reports.today-2', lang)}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={togglePrivacy}
          aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 36, minWidth: 36, borderRadius: 999,
            border: hidden ? '1px solid var(--color-warning-border)' : '1px solid var(--color-bg-disabled)',
            background: hidden ? 'rgba(196,136,58,0.10)' : 'var(--color-surface)',
            color: hidden ? 'var(--color-warning)' : 'var(--color-text-muted)',
            cursor: 'pointer',
          }}
        >
          {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Search + Share ── */}
      <div style={{ paddingBottom: 8, display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={() => setShowSearchSheet(true)}
          aria-label={label('reports.search-notebook', lang)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
            border: '1px solid var(--color-bg-disabled)', borderRadius: 10, padding: '6px 10px',
            minHeight: 38, background: 'var(--color-surface)', cursor: 'pointer',
            fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-soft)',
            textAlign: 'left',
          }}
        >
          <Search className="w-4 h-4" style={{ color: 'var(--color-text-soft)', flexShrink: 0 }} />
          <span>{label('reports.search-notebook-2', lang)}</span>
        </button>
        {onShareReport && (
          <button
            type="button"
            onClick={() => onShareReport(buildShareText())}
            aria-label={label('reports.share-report-summary', lang)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              minHeight: 38, padding: '6px 14px', flexShrink: 0,
              border: '1px solid var(--color-primary)', borderRadius: 10,
              background: 'var(--color-primary)', color: 'var(--color-bg-white)',
              fontSize: 12, fontWeight: 800, cursor: 'pointer',
            }}
          >
            <Share2 className="w-4 h-4" />
            <span>{label('reports.share', lang)}</span>
          </button>
        )}
      </div>

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

      {/* ── Time Range Tabs ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'var(--color-surface-subtle)', paddingTop: 4, paddingBottom: 8,
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
          background: 'rgba(27,67,50,0.08)', borderRadius: 12, padding: 4,
        }}>
          {[
            ['today', `🌅 ${label('reports.today', lang)}`],
            ['week', `📅 ${label('reports.week', lang)}`],
            ['month', `🗓 ${label('reports.month', lang)}`],
            ['custom', `✏️ ${label('reports.custom', lang)}`],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTimeRange(id)}
              style={{
                minHeight: 34, border: 'none', borderRadius: 9,
                background: timeRange === id ? 'var(--color-primary)' : 'transparent',
                color: timeRange === id ? 'var(--color-bg-white)' : 'var(--color-text-muted)',
                fontSize: 12, fontWeight: 900, cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Person Switcher — reconcile the day person by person ── */}
      {(canSwitchPeople && switchablePeople.length > 0) && (
        <div style={{
          display: 'flex', gap: 4, overflowX: 'auto',
          paddingBottom: 6, marginBottom: 4, WebkitOverflowScrolling: 'touch',
        }}>
          {[
            ['all', `👥 ${label('reports.everyone', lang)}`],
            [OWNER_SCOPE, `🧑 ${label('reports.owner', lang)}`],
            ...switchablePeople.map(p => [p.id, `👤 ${p.name}`]),
          ].map(([id, label]) => {
            const selected = activePerson === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectPerson(id)}
                style={{
                  flexShrink: 0, minHeight: 32, padding: '4px 12px',
                  border: selected ? '1px solid var(--color-primary)' : '1px solid var(--color-bg-disabled)',
                  borderRadius: 999,
                  background: selected ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: selected ? 'var(--color-bg-white)' : 'var(--color-text-muted)',
                  fontSize: 11.5, fontWeight: 800,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      {isPersonalLocked && (
        <p style={{
          fontSize: 10, fontWeight: 900, color: 'var(--color-text-soft)',
          letterSpacing: '0.06em', margin: '0 4px 6px',
        }}>
          👤 {label('reports.my-day', lang)}
        </p>
      )}

      {timeRange === 'custom' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-text-muted)' }}>
              {label('reports.from', lang)}
            </span>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ minHeight: 38, border: '1px solid var(--color-bg-disabled)', borderRadius: 9, padding: '6px 8px', fontSize: 13 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-text-muted)' }}>
              {label('reports.to', lang)}
            </span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ minHeight: 38, border: '1px solid var(--color-bg-disabled)', borderRadius: 9, padding: '6px 8px', fontSize: 13 }} />
          </label>
        </div>
      )}

      {/* ── Empty State ── */}
      {isEmpty && (
        <div style={{
          background: 'linear-gradient(135deg, var(--color-success-bg) 0%, #ecfdf5 100%)',
          border: '1px solid var(--color-success-border)', borderRadius: 16, padding: 24,
          marginTop: 8, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{unlinkedDevice ? '🔗' : quietPeriod ? '🌙' : '📒'}</div>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-primary)', marginBottom: 8 }}>
            {unlinkedDevice
              ? (label('reports.device-not-linked-yet', lang))
              : quietPeriod
                ? (label('reports.nothing-recorded-in-this-period', lang))
                : (label('reports.welcome-to-your-shop', lang))}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 16, maxWidth: 320, margin: '0 auto 16px' }}>
            {unlinkedDevice
              ? (label('reports.ask-the-owner-to-link-this-device-to-your', lang))
              : quietPeriod
                ? (label('reports.no-entries-in-the-selected-dates-pick', lang))
                : (label('reports.record-your-first-sale-today-your-shop', lang))}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {!unlinkedDevice && !quietPeriod && (
              <button onClick={() => window.dispatchEvent(new CustomEvent('gebya:open-form', { detail: { type: 'sale' } }))}
                style={{ padding: '12px 24px', borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: 'var(--color-bg-white)', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                🛒 {label('reports.record-first-sale', lang)}
              </button>
            )}
            {quietPeriod && (
              <button onClick={() => window.dispatchEvent(new CustomEvent('gebya:open-form', { detail: { type: 'sale' } }))}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--color-primary)', background: 'var(--color-primary)', color: 'var(--color-bg-white)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                🛒 {label('reports.sale', lang)}
              </button>
            )}
          </div>
        </div>
      )}

      {!isEmpty && (
        isPersonScoped ? (
          <>
            {/* ════════════════════════════════════════════ */}
            {/* PERSONAL DAY VIEW — one person's numbers only */}
            {/* Shop-level rituals (cash closing, overdue     */}
            {/* reminders) stay in the Everyone view.         */}
            {/* ════════════════════════════════════════════ */}
            <SectionHeading label={
              activePersonName
                ? `${activePersonName} · ${label('reports.my-day', lang)}`
                : (label('reports.my-day', lang))
            } />

            {/* Surrender card — hands today's collection to the owner via
                the existing settlement flow */}
            {surrenderStaff && (
              <div style={{
                background: 'linear-gradient(135deg, var(--color-success-bg) 0%, #ecfdf5 100%)',
                border: '1px solid var(--color-success-border)',
                borderRadius: 16,
                padding: '14px 16px',
                marginBottom: 10,
              }}>
                <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--color-primary)', marginBottom: 3 }}>
                  🤝 {label('reports.ready-to-hand-over', lang)}
                </p>
                <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 10 }}>
                  {label('reports.expected-cash-digital', lang, hidden ? '••••' : fmt(metrics.cashExpected), hidden ? '••••' : fmt(metrics.transferRecorded))}
                </p>
                <button
                  type="button"
                  onClick={() => setSheetTarget({ staff: surrenderStaff, settlement: null })}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '9px 18px', borderRadius: 10, border: 'none',
                    background: 'var(--color-primary)', color: 'var(--color-bg-white)',
                    fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  }}
                >
                  🤝 {label('reports.surrender', lang)}
                </button>
              </div>
            )}

            <div id="today-business">
              <ErrorBoundary>
                <TodayBusiness
                  metrics={metrics}
                  closingState={closingState}
                  lang={lang}
                  onClose={handleClose}
                  showClosing
                  selfCheck
                  personName={activePersonName}
                  cashYouShouldHave={cashYouShouldHave}
                />
              </ErrorBoundary>
            </div>

            <SectionHeading label={label('reports.entries', lang)} />
            <ErrorBoundary>
              <TimelineView reportRows={reportRows} lang={lang} handleExport={handleExport} onEdit={onEdit} />
            </ErrorBoundary>
          </>
        ) : (
        <>
          {isToday ? (
            <>
              {/* 1. Hero Status */}
              <SectionHeading label={label('reports.shop-status', lang)} />
              <ErrorBoundary>
                <HeroStatus
                  metrics={metrics}
                  closingDone={closingState.done}
                  cashVariance={closingState.cashVariance}
                  overdueCount={creditSummary.overdueCount}
                  staffRows={staffRows}
                  period={period}
                  lang={lang}
                  onAction={handleAction}
                />
              </ErrorBoundary>

              {/* 2. Today's Business */}
              <SectionHeading label={label('reports.today-s-business', lang)} />
              <div id="today-business">
                <ErrorBoundary>
                  <TodayBusiness metrics={metrics} closingState={closingState} lang={lang} onClose={handleClose} cashYouShouldHave={cashYouShouldHave} />
                </ErrorBoundary>
              </div>

              {/* 3. Do This Next */}
              <SectionHeading label={label('reports.do-this-next', lang)} />
              <ErrorBoundary>
                <DoThisNext
                  closingDone={closingState.done}
                  cashExpected={metrics.cashExpected}
                  cashVariance={closingState.cashVariance}
                  overdueCount={creditSummary.overdueCount}
                  overdueAmount={creditSummary.overdueAmount}
                  largestOverdueDays={creditSummary.overdue[0]?.overdue_days || 0}
                  salesCount={metrics.saleRows?.length || 0}
                  avgSalesCount={avgSalesCount}
                  expenses={metrics.spentToday}
                  avgExpenses={avgExpenses}
                  lang={lang}
                  onAction={handleAction}
                />
              </ErrorBoundary>

              {/* Staff handover status — who has surrendered today */}
              {canSwitchPeople && switchablePeople.length > 0 && (
                <>
                  <SectionHeading label={label('reports.staff-handover', lang)} />
                  <ErrorBoundary>
                    <HandoverStatus
                      staffMembers={staffMembers}
                      todayStart={todayStart}
                      lang={lang}
                      refreshKey={handoverRefresh}
                      onOpen={(member, settlement) => setSheetTarget({ staff: member, settlement })}
                    />
                  </ErrorBoundary>
                </>
              )}

              {/* 4. What I Noticed */}
              <SectionHeading label={label('reports.what-i-noticed', lang)} />
              <ErrorBoundary>
                <WhatINoticed
                  metrics={metrics} priorMetrics={priorMetrics}
                  overdueCount={creditSummary.overdueCount} closingDone={closingState.done}
                  creditCollected={metrics.creditCollected} staffSummary={staffSummary}
                  lang={lang}
                />
              </ErrorBoundary>

              {/* 5. Today's Story */}
              <SectionHeading label={label('reports.today-s-story', lang)} />
              <ErrorBoundary>
                <TodayStory
                  metrics={metrics}
                  overdueCount={creditSummary.overdueCount} overdueAmount={creditSummary.overdueAmount}
                  closingDone={closingState.done} cashVariance={closingState.cashVariance}
                  creditCollected={metrics.creditCollected} expenseCount={metrics.expenseRows?.length || 0}
                  staffSummary={staffSummary}
                  lang={lang}
                />
              </ErrorBoundary>
            </>
          ) : (
            /* ════════════════════════════════════════════ */
            /* COMPACT VIEW — for Week / Month / Custom    */
            /* ════════════════════════════════════════════ */
            <>
              {/* Hero Status for past days (retro close) */}
              <SectionHeading label={label('reports.summary', lang)} />
              <ErrorBoundary>
                <HeroStatus
                  metrics={metrics}
                  closingDone={closingState.done}
                  cashVariance={closingState.cashVariance}
                  overdueCount={creditSummary.overdueCount}
                  staffRows={staffRows}
                  period={period}
                  lang={lang}
                  onAction={handleAction}
                  isPast
                />
              </ErrorBoundary>

              {/* Period insights: verdict vs last period, day strip, top items */}
              <ErrorBoundary>
                <PeriodInsights
                  verdict={periodVerdict}
                  days={weekDays}
                  topItems={(salesSummary?.topItems || []).slice(0, 3)}
                  lang={lang}
                  onPickDay={handlePickDay}
                />
              </ErrorBoundary>

              {/* Business Summary */}
              <SectionHeading label={label('reports.business-summary', lang)} />
              <ErrorBoundary>
                <TodayBusiness metrics={metrics} closingState={closingState} lang={lang} onClose={handleClose} />
              </ErrorBoundary>
            </>
          )}

          {/* 7. Today's Entries — always shown */}
          <SectionHeading label={
            isToday
              ? (label('reports.today-s-entries', lang))
              : (label('reports.entries', lang))
          } />
          <ErrorBoundary>
            <TimelineView reportRows={reportRows} lang={lang} handleExport={handleExport} onEdit={onEdit} />
          </ErrorBoundary>


        </>
        )
      )}

      {/* ── Settlement sheet overlay — surrender / review ── */}
      {sheetTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'var(--color-overlay)', backdropFilter: 'blur(2px)' }}>
          <div className="w-full max-w-md rounded-2xl bg-white px-4 pb-6 pt-2 max-h-[90vh] overflow-y-auto" style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
            <div className="w-9 h-1 rounded-full bg-gray-300 mx-auto mb-3" />
            <Suspense fallback={
              <p style={{ textAlign: 'center', padding: 24, fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>
                {label('reports.loading', lang)}
              </p>
            }>
              <SettlementSheet
                staff={sheetTarget.staff}
                existingSettlement={sheetTarget.settlement}
                lang={lang}
                                                onSaved={(staffId) => {
                  setSheetTarget(null);
                  setHandoverRefresh(k => k + 1);
                  fireToast(label('reports.handover-recorded', lang), 2400);
                  store.handleSettlementSaved?.(staffId);
                }}
                onCancel={() => setSheetTarget(null)}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
