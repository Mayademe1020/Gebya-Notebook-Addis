import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Filter,
  History,
  Search,
  Settings2,
  ShoppingCart,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import db from '../db';
import { usePrivacy } from '../context/PrivacyContext';
import { fmt } from '../utils/numformat';
import { getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
import {
  ALL_SCOPE,
  OWNER_SCOPE,
  actorName,
  amountOf,
  buildReportRows,
  buildStaffReportRows,
  computeReportMetrics,
  inReportRange,
  isTransferPayment,
  paymentLabel,
  reportRowSearchText,
  startOfLocalDay,
} from '../utils/reportSelectors';
import { matchesSearch } from './HistoryView';

const HistoryView = lazy(() => import('./HistoryView'));
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
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function displayTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function displayPeriod(timeRange, from, to) {
  if (timeRange === 'today') return 'Today';
  if (timeRange === 'week') return 'Week';
  if (timeRange === 'month') return 'Month';
  const a = new Date(from).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const b = new Date(to - 1).toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${a} - ${b}`;
}

function titleOf(row) {
  return row.title || row.item_name || row.item_note || row.customer_name || row.note || 'Record';
}

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCSV(rows) {
  const header = ['date', 'type', 'amount', 'item_or_person', 'payment', 'status', 'entered_by'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.created_at ? new Date(row.created_at).toISOString() : '',
      row.report_kind || row.type,
      amountOf(row),
      csvEscape(titleOf(row)),
      csvEscape(paymentLabel(row)),
      csvEscape(row.status),
      csvEscape(actorName(row)),
    ].join(','));
  }
  return lines.join('\n');
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Amount({ value, hidden, tone = 'default' }) {
  const colors = {
    default: '#1f2937',
    good: '#047857',
    bad: '#dc2626',
    warn: '#d97706',
    transfer: '#1d4ed8',
  };
  return (
    <span style={{
      color: colors[tone] || colors.default,
      fontFamily: 'Manrope, system-ui, sans-serif',
      fontVariantNumeric: 'tabular-nums',
      fontWeight: 950,
      whiteSpace: 'nowrap',
    }}>
      {hidden ? '••••' : fmt(value || 0)}
    </span>
  );
}

function Section({ title, action, children }) {
  return (
    <section style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
      padding: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <h3 style={{ color: '#1f2937', fontSize: 15, lineHeight: 1.15, fontWeight: 950 }}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function SummaryCard({ card, hidden, onOpen }) {
  const Icon = card.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className="press-scale"
      style={{
        minWidth: 0,
        minHeight: 88,
        padding: 9,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
      aria-label={`${card.label} ${card.helper}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 9,
          background: card.bg,
          color: card.color,
          flexShrink: 0,
        }}>
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
        <ChevronRight className="w-4 h-4" style={{ color: '#9ca3af', flexShrink: 0 }} aria-hidden="true" />
      </div>
      <p style={{ marginTop: 7, color: '#1f2937', fontSize: 13, fontWeight: 950, lineHeight: 1.1 }}>
        {card.label}
      </p>
      <p style={{ marginTop: 1, color: '#6b7280', fontSize: 11, fontWeight: 700, lineHeight: 1.15 }}>
        {card.helper}
      </p>
      <p style={{ marginTop: 7, fontSize: 'clamp(16px, 4.5vw, 20px)', lineHeight: 1 }}>
        <Amount value={card.value} hidden={hidden} tone={card.tone} />
      </p>
    </button>
  );
}

function Row({ row, hidden, onEdit, ownerView }) {
  const canEdit = row.source === 'transactions' && onEdit;
  const tone = row.report_kind === 'expense' ? 'bad' : isTransferPayment(row) ? 'transfer' : 'good';
  return (
    <button
      type="button"
      onClick={() => canEdit ? onEdit(row.raw || row) : undefined}
      className="press-scale"
      style={{
        width: '100%',
        border: 'none',
        borderTop: '1px solid #f3f4f6',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '9px 0',
        textAlign: 'left',
        cursor: canEdit ? 'pointer' : 'default',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ color: '#111827', fontSize: 13, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {titleOf(row)}
        </p>
        <p style={{ color: '#6b7280', fontSize: 11, fontWeight: 750, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.report_kind} · {paymentLabel(row)} · {displayTime(row.created_at)}{ownerView ? ` · ${actorName(row)}` : ''}
        </p>
      </div>
      <span style={{ fontSize: 14, flexShrink: 0 }}>
        <Amount value={amountOf(row)} hidden={hidden} tone={tone} />
      </span>
    </button>
  );
}

function ScopeSheet({ open, options, selectedScope, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);
  if (!open) return null;
  const filtered = options.filter(option => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.32)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12 }}>
      <div style={{ width: '100%', maxWidth: 452, maxHeight: '78vh', overflow: 'auto', background: '#fff', borderRadius: 18, padding: 12, boxShadow: '0 22px 70px rgba(15,23,42,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <h3 style={{ color: '#064e3b', fontSize: 18, fontWeight: 950 }}>Report scope</h3>
          <button type="button" onClick={onClose} aria-label="Close scope selector" style={{ border: 'none', width: 34, height: 34, borderRadius: 999, background: '#f3f4f6', display: 'grid', placeItems: 'center' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {options.length > 8 && (
          <div style={{ position: 'relative', marginTop: 10 }}>
            <Search className="w-4 h-4" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search staff" style={{ width: '100%', minHeight: 42, border: '1px solid #e5e7eb', borderRadius: 12, padding: '8px 10px 8px 34px', fontWeight: 800 }} />
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          {filtered.map(option => (
            <button key={option.id} type="button" onClick={() => { onSelect(option.id); onClose(); }} style={{ width: '100%', border: 'none', borderTop: '1px solid #f3f4f6', background: selectedScope === option.id ? '#ecfdf5' : '#fff', display: 'flex', justifyContent: 'space-between', gap: 10, padding: '12px 4px', textAlign: 'left', fontWeight: 900, color: '#1f2937' }}>
              <span>{option.label}</span>
              {selectedScope === option.id && <CheckCircle2 className="w-4 h-4" style={{ color: '#047857' }} />}
            </button>
          ))}
          {!filtered.length && <p style={{ color: '#9ca3af', fontSize: 13, fontWeight: 750, padding: 10 }}>No staff found.</p>}
        </div>
      </div>
    </div>
  );
}

function DetailSheet({ detail, hidden, onClose, onEdit, ownerView, periodLabel, scopeLabel }) {
  if (!detail) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.34)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12 }}>
      <div style={{ width: '100%', maxWidth: 452, maxHeight: '82vh', overflow: 'auto', background: '#fff', borderRadius: 18, boxShadow: '0 22px 70px rgba(15,23,42,0.28)', padding: 14, paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ color: '#6b7280', fontSize: 12, fontWeight: 850 }}>{periodLabel} · {scopeLabel}</p>
            <h3 style={{ color: '#064e3b', fontSize: 22, lineHeight: 1.1, fontWeight: 950 }}>{detail.label}</h3>
            <p style={{ color: '#1f2937', fontSize: 20, marginTop: 5 }}><Amount value={detail.value} hidden={hidden} tone={detail.tone} /></p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close detail" className="press-scale" style={{ border: 'none', background: '#f3f4f6', borderRadius: 999, width: 34, height: 34, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {detail.formula?.length ? (
          <div style={{ display: 'grid', gap: 7, marginBottom: 10 }}>
            {detail.formula.map(part => (
              <div key={part.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 9px' }}>
                <span style={{ color: '#4b5563', fontSize: 12, fontWeight: 800 }}>{part.label}</span>
                <span style={{ fontSize: 13 }}><Amount value={part.value} hidden={hidden} tone={part.tone} /></span>
              </div>
            ))}
          </div>
        ) : null}

        {detail.rows.length ? detail.rows.slice(0, 40).map(row => (
          <Row key={`${row.source}-${row.id}`} row={row} hidden={hidden} onEdit={onEdit} ownerView={ownerView} />
        )) : (
          <p style={{ color: '#9ca3af', fontSize: 14, fontWeight: 750, padding: '10px 0' }}>
            No contributing records in this period.
          </p>
        )}

        {detail.key === 'transfer' && (
          <p style={{ color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 9, marginTop: 10, fontSize: 12, fontWeight: 800 }}>
            Review only: this app does not yet store transfer confirmation status.
          </p>
        )}
      </div>
    </div>
  );
}

function ReportView({
  transactions = [],
  ledgerTransactions = [],
  enrichedCustomerSummaries = [],
  customers = [],
  suppliers = [],
  shopProfile,
  staffMembers = [],
  activeStaffMemberId = null,
  onEdit,
  onChaseOverdue,
}) {
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const [timeRange, setTimeRange] = useState('today');
  const [customFrom, setCustomFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [scope, setScope] = useState(ALL_SCOPE);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [closingReason, setClosingReason] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [closingStatus, setClosingStatus] = useState('');
  const [savedReview, setSavedReview] = useState(null);
  const historyRef = useRef(null);

  const activeStaff = staffMembers.find(member => String(member.id) === String(activeStaffMemberId));
  const viewerStaffId = activeStaff ? String(activeStaff.id) : null;
  const isStaffView = !!viewerStaffId;
  const activeStaffMembers = (staffMembers || []).filter(member => member.active !== false);
  const hasTeam = activeStaffMembers.length > 0;
  const ownerView = !isStaffView;

  const now = Date.now();
  const todayStart = startOfLocalDay(now);
  const todayEnd = todayStart + DAY_MS;
  const weekStart = startOfWeek(now);
  const weekEnd = weekStart + 7 * DAY_MS;
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [from, to] = useMemo(() => {
    if (timeRange === 'week') return [weekStart, weekEnd];
    if (timeRange === 'month') return [monthStart, monthEnd];
    if (timeRange === 'custom') {
      const a = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(todayStart);
      const b = customTo ? new Date(`${customTo}T00:00:00`) : new Date(todayStart);
      b.setDate(b.getDate() + 1);
      return [a.getTime(), b.getTime()];
    }
    return [todayStart, todayEnd];
  }, [timeRange, weekStart, weekEnd, monthStart, monthEnd, todayStart, todayEnd, customFrom, customTo]);

  const periodLabel = displayPeriod(timeRange, from, to);
  const isDailyClosing = timeRange === 'today' && from === todayStart && to === todayEnd;

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchQuery.trim().toLowerCase()), 180);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  const reportRows = useMemo(() => buildReportRows({
    transactions,
    ledgerTransactions,
    customers,
    from,
    to,
    scope,
    viewerStaffId,
  }), [transactions, ledgerTransactions, customers, from, to, scope, viewerStaffId]);

  const metrics = useMemo(() => computeReportMetrics(reportRows), [reportRows]);
  const staffRows = useMemo(() => buildStaffReportRows(reportRows), [reportRows]);
  const scopeOptions = useMemo(() => ([
    { id: ALL_SCOPE, label: 'All Staff' },
    { id: OWNER_SCOPE, label: 'Owner' },
    ...activeStaffMembers.map(member => ({ id: String(member.id), label: member.display_name || 'Staff' })),
  ]), [activeStaffMembers]);
  const scopeLabel = isStaffView
    ? (activeStaff?.display_name || 'My records')
    : (scopeOptions.find(option => option.id === scope)?.label || 'All Staff');

  const searchRows = useMemo(() => {
    if (!debouncedSearch) return [];
    return reportRows
      .filter(row => matchesSearch(row, debouncedSearch) || reportRowSearchText(row).includes(debouncedSearch))
      .slice(0, 25);
  }, [reportRows, debouncedSearch]);
  const recentRows = reportRows.slice(0, 5);

  const reviewId = `${from}-${to}-${viewerStaffId || scope || 'owner'}`;
  useEffect(() => {
    let cancelled = false;
    setSavedReview(null);
    setActualCash('');
    setClosingReason('');
    setClosingNote('');
    setClosingStatus('');
    if (!isDailyClosing || isStaffView) return;
    db.closing_reviews.get(reviewId)
      .then(review => {
        if (cancelled || !review) return;
        setSavedReview(review);
        setActualCash(String(review.actual_cash_counted ?? ''));
        setClosingReason(review.reason || '');
        setClosingNote(review.note || '');
      })
      .catch(() => {
        if (!cancelled) setClosingStatus('Could not load saved review.');
      });
    return () => { cancelled = true; };
  }, [reviewId, isDailyClosing, isStaffView]);

  const actualCashValue = actualCash === '' ? null : Number(actualCash);
  const difference = actualCashValue == null || Number.isNaN(actualCashValue)
    ? 0
    : actualCashValue - metrics.cashExpected;
  const differenceTone = difference === 0 ? 'good' : 'warn';
  const needsReason = actualCashValue != null && difference !== 0;
  const closingState = savedReview
    ? (Number(savedReview.difference || 0) === 0 ? 'Balanced' : 'Difference found')
    : 'Not reviewed';

  const cards = [
    {
      key: 'sold',
      label: isStaffView ? 'My Sold' : 'Total Sold',
      helper: 'Sales value in this period',
      value: metrics.totalSold,
      rows: [...metrics.saleRows, ...metrics.manualCreditRows],
      tone: 'good',
      color: '#047857',
      bg: '#e8f5ed',
      icon: ShoppingCart,
    },
    {
      key: 'cash',
      label: isStaffView ? 'My Cash' : 'Cash Expected',
      helper: 'Cash you should count',
      value: metrics.cashExpected,
      rows: [...metrics.saleRows.filter(row => !isTransferPayment(row) && row.payment_type !== 'credit'), ...metrics.cashCollectionRows, ...metrics.cashExpenseRows],
      formula: [
        { label: 'Cash sales', value: metrics.cashSales, tone: 'good' },
        { label: 'Cash credit collections', value: metrics.cashCollections, tone: 'good' },
        { label: 'Cash expenses', value: metrics.cashExpenses, tone: 'bad' },
        { label: 'Expected cash', value: metrics.cashExpected, tone: metrics.cashExpected >= 0 ? 'good' : 'bad' },
      ],
      tone: metrics.cashExpected >= 0 ? 'good' : 'bad',
      color: '#047857',
      bg: '#e8f5ed',
      icon: Wallet,
    },
    {
      key: 'transfer',
      label: isStaffView ? 'My Transfer' : 'Transfer Recorded',
      helper: 'Bank/mobile payments recorded',
      value: metrics.transferRecorded,
      rows: metrics.transferRows,
      tone: 'transfer',
      color: '#1d4ed8',
      bg: '#eff6ff',
      icon: Banknote,
    },
    {
      key: 'dubie',
      label: isStaffView ? 'My Credit' : 'New Dubie',
      helper: 'Unpaid sales created',
      value: metrics.newDubie,
      rows: metrics.creditRows,
      tone: 'warn',
      color: '#ea580c',
      bg: '#fff7ed',
      icon: UserRound,
    },
    {
      key: 'collected',
      label: isStaffView ? 'My Collections' : 'Credit Collected',
      helper: 'Old Dubie paid',
      value: metrics.creditCollected,
      rows: metrics.collectionRows,
      tone: 'warn',
      color: '#d97706',
      bg: '#fff7ed',
      icon: Wallet,
    },
    {
      key: 'spent',
      label: 'Spent Today',
      helper: 'Money paid out',
      value: metrics.spentToday,
      rows: metrics.expenseRows,
      tone: 'bad',
      color: '#dc2626',
      bg: '#fef2f2',
      icon: Download,
    },
  ];

  const overdueCustomers = useMemo(
    () => (enrichedCustomerSummaries || []).filter(customer => customer.has_overdue && Number(customer.balance || 0) > 0),
    [enrichedCustomerSummaries]
  );
  const alerts = ownerView ? [
    ...(needsReason ? [{
      id: 'difference',
      title: 'Closing difference',
      detail: `${fmt(Math.abs(difference))} birr ${difference > 0 ? 'surplus' : 'shortage'}`,
      action: 'Review',
      tone: 'critical',
    }] : []),
    ...overdueCustomers.slice(0, 1).map(customer => ({
      id: `overdue-${customer.id}`,
      title: 'Overdue Dubie',
      detail: `${customer.display_name || 'Customer'} · ${fmt(customer.balance || 0)} birr`,
      action: 'Review',
      tone: 'warn',
      onClick: onChaseOverdue,
    })),
    ...(metrics.transferRecorded > 0 ? [{
      id: 'transfer',
      title: 'Transfer recorded',
      detail: `${fmt(metrics.transferRecorded)} birr needs review`,
      action: 'Review',
      tone: 'transfer',
      onClick: () => setDetail(cards.find(card => card.key === 'transfer')),
    }] : []),
  ].slice(0, 3) : [];

  const handleSaveClosingReview = async () => {
    if (!isDailyClosing || isStaffView) {
      setClosingStatus('Daily owner review is only available for Today.');
      return;
    }
    if (actualCashValue == null || Number.isNaN(actualCashValue)) {
      setClosingStatus('Count cash first.');
      return;
    }
    if (needsReason && !closingReason && !closingNote.trim()) {
      setClosingStatus('Add a reason or note for the difference.');
      return;
    }
    const nowMs = Date.now();
    const review = {
      id: reviewId,
      shop_id: shopProfile?.name || 'local-shop',
      period_start: from,
      period_end: to,
      actor_staff_member_id: scope || null,
      cash_expected: metrics.cashExpected,
      actual_cash_counted: actualCashValue,
      difference,
      reason: closingReason || null,
      note: closingNote.trim() || null,
      status: difference === 0 ? 'balanced' : 'difference_found',
      reviewed_by: shopProfile?.name || 'Owner',
      created_at: savedReview?.created_at || nowMs,
      updated_at: nowMs,
    };
    await db.closing_reviews.put(review);
    setSavedReview(review);
    setClosingStatus(difference === 0 ? 'Saved as balanced.' : 'Saved with difference.');
  };

  const handleFullHistory = () => {
    setHistoryOpen(true);
    window.setTimeout(() => historyRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 40);
  };

  const exportRows = reportRows.filter(row => inReportRange(row.created_at, from, to));
  const handleExportCSV = () => downloadBlob(buildCSV(exportRows), `gebya-report-${timeRange}.csv`, 'text/csv;charset=utf-8');
  const handleExportJSON = () => downloadBlob(JSON.stringify({ exported_at: new Date().toISOString(), period: { from, to }, scope: scopeLabel, rows: exportRows, customers, suppliers }, null, 2), `gebya-report-${timeRange}.json`, 'application/json');

  const subtitle = isStaffView
    ? `${activeStaff?.display_name || 'Staff'} · ${periodLabel}`
    : `${shopProfile?.name || 'Owner'} · ${periodLabel}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingBottom: 92 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ color: '#064e3b', fontSize: 23, fontWeight: 950, lineHeight: 1 }}>
            {isStaffView ? 'My Sales Report' : 'Shop Check'}
          </h2>
          <p style={{ color: '#6b7280', fontSize: 12, fontWeight: 800, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle} · {getCurrentEthiopianDate()}
          </p>
        </div>
        <button type="button" onClick={togglePrivacy} aria-label={hidden ? 'Show amounts' : 'Hide amounts'} className="press-scale" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '7px 10px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff', color: '#1f2937', fontSize: 12, fontWeight: 900, cursor: 'pointer', flexShrink: 0 }}>
          {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {hidden ? 'Show' : 'Hide'}
        </button>
      </div>

      {isStaffView && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '7px 9px', color: '#1e3a8a', fontSize: 12, fontWeight: 800 }}>
          This report shows your available records.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: ownerView && hasTeam ? '1fr auto' : '1fr', gap: 7, alignItems: 'center' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 12, padding: 4 }}>
          {['today', 'week', 'month', 'custom'].map(id => (
            <button key={id} type="button" onClick={() => setTimeRange(id)} className="press-scale" style={{ minHeight: 32, border: 'none', borderRadius: 9, background: timeRange === id ? '#065f46' : 'transparent', color: timeRange === id ? '#fff' : '#4b5563', fontSize: 12, fontWeight: 950, cursor: 'pointer', textTransform: 'capitalize' }}>
              {id}
            </button>
          ))}
        </div>
        {ownerView && hasTeam && (
          <button type="button" onClick={() => setScopeOpen(true)} className="press-scale" style={{ minHeight: 38, maxWidth: 146, display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', color: '#1f2937', padding: '0 10px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scopeLabel}</span>
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {timeRange === 'custom' && (
        <Section title="Custom range">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#6b7280', fontSize: 12, fontWeight: 850 }}>
              From
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ minHeight: 38, border: '1px solid #d1d5db', borderRadius: 10, padding: '7px 9px' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#6b7280', fontSize: 12, fontWeight: 850 }}>
              To
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ minHeight: 38, border: '1px solid #d1d5db', borderRadius: 10, padding: '7px 9px' }} />
            </label>
          </div>
        </Section>
      )}

      <div style={{ position: 'relative' }}>
        <Search className="w-5 h-5" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={isStaffView ? 'Search my item, code, amount, or date' : 'Search item, code, customer, staff, amount, or date'} style={{ width: '100%', minHeight: 44, padding: '9px 42px 9px 38px', background: '#fff', border: `1px solid ${searchQuery.trim() ? '#065f46' : '#e5e7eb'}`, borderRadius: 13, boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)', color: '#374151', fontSize: 13, fontWeight: 750, outline: 'none' }} />
        {searchQuery.trim() ? (
          <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search" className="press-scale" style={{ position: 'absolute', right: 38, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <X className="w-4 h-4" style={{ color: '#9ca3af' }} />
          </button>
        ) : null}
        <button type="button" onClick={() => setShowFilters(value => !value)} aria-label="Filter report" className="press-scale" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', padding: 5 }}>
          <Settings2 className="w-5 h-5" style={{ color: showFilters ? '#065f46' : '#9ca3af' }} />
        </button>
      </div>

      {showFilters && (
        <Section title="Filters">
          <p style={{ color: '#6b7280', fontSize: 12, fontWeight: 800 }}>
            Active filters: {periodLabel}{ownerView && hasTeam ? ` · ${scopeLabel}` : ''}. Type/payment/status filters need dedicated stored fields before they can be exact.
          </p>
        </Section>
      )}

      {debouncedSearch && (
        <Section title={`Search results (${searchRows.length})`}>
          {searchRows.length ? searchRows.map(row => (
            <Row key={`search-${row.source}-${row.id}`} row={row} hidden={hidden} onEdit={onEdit} ownerView={ownerView} />
          )) : (
            <p style={{ color: '#9ca3af', fontSize: 13, fontWeight: 750 }}>No records match this search in the selected period and scope.</p>
          )}
        </Section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {cards.map(card => <SummaryCard key={card.key} card={card} hidden={hidden} onOpen={setDetail} />)}
      </div>

      <Section title={isStaffView ? 'My Review Status' : "Today's Closing Check"}>
        {!isDailyClosing || isStaffView ? (
          <p style={{ color: '#6b7280', fontSize: 13, fontWeight: 800 }}>
            {isStaffView ? 'Owner cash closing is not shown in staff view.' : 'Cash closing is editable only for Today. Week, Month, and Custom views show report totals only.'}
          </p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7, alignItems: 'end' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: '#4b5563', fontSize: 11, fontWeight: 850 }}>Cash expected</p>
                <p style={{ marginTop: 5, fontSize: 17 }}><Amount value={metrics.cashExpected} hidden={hidden} tone="good" /></p>
              </div>
              <label style={{ minWidth: 0, color: '#4b5563', fontSize: 11, fontWeight: 850 }}>
                Actual counted
                <input aria-label="Actual cash counted" inputMode="decimal" value={actualCash} onChange={e => setActualCash(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" style={{ width: '100%', minHeight: 40, marginTop: 5, border: '1px solid #d1d5db', borderRadius: 10, padding: '8px 9px', fontSize: 15, fontWeight: 800 }} />
              </label>
              <div style={{ minWidth: 0, textAlign: 'right' }}>
                <p style={{ color: '#4b5563', fontSize: 11, fontWeight: 850 }}>Difference</p>
                <p style={{ marginTop: 5, fontSize: 17 }}><Amount value={difference} hidden={hidden} tone={differenceTone} /></p>
                <p style={{ color: difference === 0 ? '#047857' : '#92400e', fontSize: 10, fontWeight: 850 }}>{difference === 0 ? 'Balanced' : difference > 0 ? 'Surplus' : 'Shortage'}</p>
              </div>
            </div>
            <p style={{ color: savedReview ? '#047857' : '#6b7280', fontSize: 12, fontWeight: 850, marginTop: 8 }}>State: {closingState}</p>
            {needsReason && (
              <div style={{ display: 'grid', gap: 7, marginTop: 8 }}>
                <select aria-label="Closing difference reason" value={closingReason} onChange={e => setClosingReason(e.target.value)} style={{ minHeight: 38, border: '1px solid #f59e0b', borderRadius: 10, padding: '7px 9px', color: '#92400e', fontWeight: 800 }}>
                  <option value="">Select reason</option>
                  <option value="transfer_not_reviewed">Transfer not reviewed</option>
                  <option value="staff_cash_pending">Staff cash pending</option>
                  <option value="expense_missing">Expense not recorded</option>
                  <option value="wrong_amount">Wrong amount entered</option>
                  <option value="credit_mistake">Customer credit mistake</option>
                  <option value="other">Other</option>
                </select>
                <input aria-label="Closing note" value={closingNote} onChange={e => setClosingNote(e.target.value)} placeholder="Required note if no reason selected" style={{ minHeight: 38, border: '1px solid #e5e7eb', borderRadius: 10, padding: '7px 9px', fontWeight: 700 }} />
              </div>
            )}
            <button type="button" onClick={handleSaveClosingReview} className="press-scale" style={{ width: '100%', minHeight: 43, marginTop: 10, border: 'none', borderRadius: 11, background: '#065f46', color: '#fff', fontSize: 14, fontWeight: 950, cursor: 'pointer' }}>
              <CheckCircle2 className="w-5 h-5 inline-block mr-2" />
              {savedReview ? 'Update review' : 'Mark day reviewed'}
            </button>
            {closingStatus && <p style={{ color: closingStatus.includes('Add') || closingStatus.includes('Count') ? '#92400e' : '#047857', fontSize: 12, fontWeight: 850, marginTop: 7 }}>{closingStatus}</p>}
          </>
        )}
      </Section>

      {ownerView && staffRows.length > 0 && (
        <Section title="Staff Sales Today" action={staffRows.length > 4 ? <button type="button" onClick={() => setScopeOpen(true)} style={{ border: 'none', background: 'transparent', color: '#065f46', fontSize: 12, fontWeight: 950, cursor: 'pointer' }}>View all</button> : null}>
          {staffRows.slice(0, 4).map(row => (
            <button key={row.id} type="button" onClick={() => setScope(row.id)} className="press-scale" style={{ width: '100%', border: 'none', borderTop: '1px solid #f3f4f6', background: 'transparent', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '9px 0', textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: '#111827', fontSize: 14, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</p>
                <p style={{ color: '#6b7280', fontSize: 11, fontWeight: 750, lineHeight: 1.35 }}>
                  Cash {fmt(row.cash)} · Digital {fmt(row.transfer)}
                </p>
                <p style={{ color: '#6b7280', fontSize: 11, fontWeight: 750, lineHeight: 1.35 }}>
                  New Dubie {fmt(row.newDubie)} · {row.transactionCount} records
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                <span style={{ fontSize: 14 }}><Amount value={row.sold} hidden={hidden} tone="good" /></span>
                <ChevronRight className="w-4 h-4" style={{ color: '#9ca3af' }} />
              </div>
            </button>
          ))}
        </Section>
      )}

      {ownerView && (
        <Section title="Needs Attention">
          {alerts.length ? alerts.map(alert => {
            const color = alert.tone === 'critical' ? '#dc2626' : alert.tone === 'transfer' ? '#1d4ed8' : '#ea580c';
            const bg = alert.tone === 'critical' ? '#fef2f2' : alert.tone === 'transfer' ? '#eff6ff' : '#fff7ed';
            return (
              <button key={alert.id} type="button" onClick={alert.onClick} className="press-scale" style={{ width: '100%', minHeight: 52, border: `1px solid ${color}`, borderRadius: 11, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 7, padding: '8px 9px', textAlign: 'left', cursor: alert.onClick ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <AlertTriangle className="w-5 h-5" style={{ color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ color: '#1f2937', fontSize: 13, fontWeight: 950 }}>{alert.title}</p>
                    <p style={{ color: '#6b7280', fontSize: 11, fontWeight: 750 }}>{alert.detail}</p>
                  </div>
                </div>
                <span style={{ border: `1px solid ${color}`, borderRadius: 8, color, padding: '6px 11px', fontSize: 12, fontWeight: 950 }}>{alert.action}</span>
              </button>
            );
          }) : (
            <p style={{ color: '#9ca3af', fontSize: 13, fontWeight: 750 }}>No action-worthy issues in this period.</p>
          )}
        </Section>
      )}

      {!debouncedSearch && (
        <Section title={isStaffView ? 'My Recent Records' : 'Recent Activity'} action={<button type="button" onClick={handleFullHistory} style={{ border: 'none', background: 'transparent', color: '#065f46', fontSize: 12, fontWeight: 950, cursor: 'pointer' }}>View all</button>}>
          {recentRows.length ? recentRows.map(row => (
            <Row key={`recent-${row.source}-${row.id}`} row={row} hidden={hidden} onEdit={onEdit} ownerView={ownerView} />
          )) : (
            <p style={{ color: '#9ca3af', fontSize: 13, fontWeight: 750 }}>No records in this selected period.</p>
          )}
        </Section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
        <button type="button" onClick={() => setShowFilters(value => !value)} className="press-scale" style={{ minHeight: 43, border: '1px solid #e5e7eb', borderRadius: 11, background: '#fff', color: '#065f46', fontSize: 13, fontWeight: 950, cursor: 'pointer' }}>
          <Filter className="w-4 h-4 inline-block mr-1" /> Filter
        </button>
        <button type="button" onClick={() => setShowExport(value => !value)} className="press-scale" style={{ minHeight: 43, border: '1px solid #e5e7eb', borderRadius: 11, background: '#fff', color: isStaffView ? '#9ca3af' : '#065f46', fontSize: 13, fontWeight: 950, cursor: 'pointer' }}>
          <Download className="w-4 h-4 inline-block mr-1" /> Export
        </button>
        <button type="button" onClick={handleFullHistory} className="press-scale" style={{ minHeight: 43, border: '1px solid #e5e7eb', borderRadius: 11, background: '#fff', color: '#065f46', fontSize: 13, fontWeight: 950, cursor: 'pointer' }}>
          <History className="w-4 h-4 inline-block mr-1" /> History
        </button>
      </div>

      {showExport && (
        <Section title={isStaffView ? 'Export unavailable' : 'Export current report'}>
          {isStaffView ? (
            <p style={{ color: '#92400e', fontSize: 12, fontWeight: 800 }}>Staff export remains disabled until owner-controlled export permission exists.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <button type="button" onClick={handleExportCSV} className="press-scale" style={{ minHeight: 40, border: '1px solid #065f46', borderRadius: 10, background: '#fff', color: '#065f46', fontWeight: 950, cursor: 'pointer' }}>CSV</button>
              <button type="button" onClick={handleExportJSON} className="press-scale" style={{ minHeight: 40, border: '1px solid #065f46', borderRadius: 10, background: '#fff', color: '#065f46', fontWeight: 950, cursor: 'pointer' }}>JSON</button>
            </div>
          )}
        </Section>
      )}

      <section ref={historyRef}>
        {historyOpen && (
          <Section title="Transaction history">
            <p style={{ color: '#6b7280', fontSize: 12, fontWeight: 750, marginBottom: 8 }}>This is transaction history for the selected period, not saved closing-review history.</p>
            <Suspense fallback={<div style={{ padding: 12, color: '#9ca3af', fontSize: 13 }}>Loading...</div>}>
              <HistoryView transactions={reportRows.filter(row => row.source === 'transactions')} onEdit={onEdit} />
            </Suspense>
          </Section>
        )}
      </section>

      <ScopeSheet open={scopeOpen} options={scopeOptions} selectedScope={scope} onSelect={setScope} onClose={() => setScopeOpen(false)} />
      <DetailSheet detail={detail} hidden={hidden} onEdit={onEdit} ownerView={ownerView} onClose={() => setDetail(null)} periodLabel={periodLabel} scopeLabel={scopeLabel} />
    </div>
  );
}

export default ReportView;
