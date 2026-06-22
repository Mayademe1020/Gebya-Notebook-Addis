import { useEffect, useMemo, useState } from 'react';
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
import { getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
import { fmt } from '../utils/numformat';
import {
  ALL_SCOPE,
  OWNER_SCOPE,
  actorName,
  amountOf,
  buildReportRows,
  buildStaffReportRows,
  computeReportMetrics,
  paymentLabel,
  reportRowSearchText,
  startOfLocalDay,
} from '../utils/reportSelectors';

const DAY_MS = 86400000;
const EMPTY_FILTERS = { type: '', payment: '', status: '' };

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

function displayDate(ms) {
  return new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function displayTime(ms) {
  return ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

function displayPeriod(timeRange, from, to) {
  if (timeRange === 'today') return 'Today';
  if (timeRange === 'week') return 'This week';
  if (timeRange === 'month') return 'This month';
  return `${displayDate(from)} - ${displayDate(to - 1)}`;
}

function titleOf(row) {
  return row.title || row.item_name || row.item_note || row.customer_name || row.note || 'Record';
}

function csvEscape(value) {
  if (value == null) return '';
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildCSV(rows) {
  const header = ['date', 'type', 'amount', 'item_or_person', 'payment', 'status', 'entered_by'];
  return [
    header.join(','),
    ...rows.map(row => [
      row.created_at ? new Date(row.created_at).toISOString() : '',
      row.report_kind || row.type,
      amountOf(row),
      csvEscape(titleOf(row)),
      csvEscape(paymentLabel(row)),
      csvEscape(row.status || 'recorded'),
      csvEscape(actorName(row)),
    ].join(',')),
  ].join('\n');
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
  const colors = { default: '#1f2937', good: '#047857', bad: '#dc2626', warn: '#d97706', transfer: '#1d4ed8' };
  return (
    <span style={{ color: colors[tone] || colors.default, fontFamily: 'Manrope, system-ui, sans-serif', fontVariantNumeric: 'tabular-nums', fontWeight: 950, whiteSpace: 'nowrap' }}>
      {hidden ? '••••' : fmt(value || 0)}
    </span>
  );
}

function MetricCard({ item, hidden, onOpen }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="press-scale"
      style={{
        minWidth: 0,
        minHeight: 120,
        padding: 12,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        boxShadow: '0 2px 8px -6px rgba(0,0,0,0.22)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr 16px', gap: 8, alignItems: 'start' }}>
        <span style={{ width: 34, height: 34, borderRadius: 8, background: item.bg, display: 'grid', placeItems: 'center' }}>
          <Icon className="w-5 h-5" style={{ color: item.color }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ color: '#1f2937', fontSize: 13, fontWeight: 950, lineHeight: 1.15 }}>
            {item.label}
          </p>
          <p style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, marginTop: 3, lineHeight: 1.2 }}>
            {item.helper}
          </p>
        </div>
        <ChevronRight className="w-4 h-4" style={{ color: '#6b7280', marginTop: 8 }} />
      </div>
      <p style={{ marginTop: 14, fontSize: 'clamp(18px, 6vw, 22px)', lineHeight: 1.05 }}>
        <Amount value={item.value} hidden={hidden} tone={item.tone} />
      </p>
    </button>
  );
}

function RecordRow({ row, hidden, onEdit }) {
  const isOut = row.report_kind === 'expense';
  return (
    <button
      type="button"
      onClick={() => onEdit?.(row)}
      style={{ width: '100%', border: 'none', borderTop: '1px solid #f3f4f6', background: '#fff', padding: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left' }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ color: '#1f2937', fontSize: 13, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(row)}</p>
        <p style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {paymentLabel(row)} · {actorName(row)} · {displayTime(row.created_at)}
        </p>
      </div>
      <span style={{ fontSize: 14, flexShrink: 0 }}>
        <Amount value={amountOf(row)} hidden={hidden} tone={isOut ? 'bad' : 'good'} />
      </span>
    </button>
  );
}

function Sheet({ title, children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(17,24,39,0.28)', display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', maxHeight: '82vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -18px 48px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <h3 style={{ color: '#1f2937', fontSize: 18, fontWeight: 950 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 18, border: '1px solid #e5e7eb', background: '#fff', display: 'grid', placeItems: 'center' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SelectRow({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'grid', gap: 5, color: '#667085', fontSize: 12, fontWeight: 850 }}>
      {label}
      <select value={value} onChange={event => onChange(event.target.value)} style={{ minHeight: 42, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: '8px 10px', color: '#1f2937', fontSize: 14 }}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
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
}) {
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const [timeRange, setTimeRange] = useState('today');
  const [customFrom, setCustomFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [scope, setScope] = useState(ALL_SCOPE);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeQuery, setScopeQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [rawSearch, setRawSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [actualCash, setActualCash] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [savedReview, setSavedReview] = useState(null);
  const [closingMessage, setClosingMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [searchPlaceholder, setSearchPlaceholder] = useState('Search shop records');

  useEffect(() => {
    const setPlaceholder = () => {
      setSearchPlaceholder(window.innerWidth < 360 ? 'Search shop records' : 'Search item, code, customer, staff, amount, or date');
    };
    setPlaceholder();
    window.addEventListener('resize', setPlaceholder);
    return () => window.removeEventListener('resize', setPlaceholder);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(rawSearch.trim().toLowerCase()), 180);
    return () => window.clearTimeout(timer);
  }, [rawSearch]);

  const now = Date.now();
  const todayStart = startOfLocalDay(now);
  const activeStaff = staffMembers.find(member => String(member.id) === String(activeStaffMemberId));
  const isStaffView = Boolean(activeStaffMemberId);
  const viewerStaffId = isStaffView ? activeStaffMemberId : null;

  const [from, to] = useMemo(() => {
    if (timeRange === 'week') return [startOfWeek(now), startOfWeek(now) + 7 * DAY_MS];
    if (timeRange === 'month') return [startOfMonth(now), endOfMonth(now)];
    if (timeRange === 'custom') {
      const start = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : todayStart;
      const endDate = customTo ? new Date(`${customTo}T00:00:00`) : new Date(todayStart);
      endDate.setDate(endDate.getDate() + 1);
      return [start, endDate.getTime()];
    }
    return [todayStart, todayStart + DAY_MS];
  }, [timeRange, customFrom, customTo, todayStart, now]);

  const reportRows = useMemo(() => buildReportRows({ transactions, ledgerTransactions, customers, from, to, scope, viewerStaffId, filters }), [transactions, ledgerTransactions, customers, from, to, scope, viewerStaffId, filters]);
  const metrics = useMemo(() => computeReportMetrics(reportRows), [reportRows]);
  const staffRows = useMemo(() => buildStaffReportRows(reportRows), [reportRows]);
  const searchRows = useMemo(() => {
    if (!searchQuery) return [];
    return reportRows.filter(row => reportRowSearchText(row).includes(searchQuery)).slice(0, 8);
  }, [reportRows, searchQuery]);

  const reviewId = `${new Date(todayStart).toISOString().slice(0, 10)}::${scope || 'all'}::owner`;
  const reviewSettingKey = `closing_review::${reviewId}`;
  const isToday = timeRange === 'today';
  const canReviewClosing = !isStaffView && isToday;
  const difference = Number(actualCash || 0) - metrics.cashExpected;

  useEffect(() => {
    if (!canReviewClosing) {
      setSavedReview(null);
      setClosingMessage('');
      return;
    }
    let cancelled = false;
    db.settings.get(reviewSettingKey).then(row => {
      if (cancelled) return;
      const review = row?.value ? JSON.parse(row.value) : null;
      setSavedReview(review || null);
      setActualCash(review?.actual_cash_counted != null ? String(review.actual_cash_counted) : '');
      setReviewNote(review?.note || '');
    }).catch(() => {
      if (!cancelled) setClosingMessage('Closing review storage is not ready on this device.');
    });
    return () => { cancelled = true; };
  }, [canReviewClosing, reviewSettingKey]);

  useEffect(() => {
    if (!historyOpen) return;
    let cancelled = false;
    db.settings.toArray().then(rows => {
      if (cancelled) return;
      setHistoryRows(rows
        .filter(row => String(row.key || '').startsWith('closing_review::'))
        .map(row => {
          try { return JSON.parse(row.value); } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0)));
    }).catch(() => setHistoryRows([]));
    return () => { cancelled = true; };
  }, [historyOpen]);

  const cards = [
    { key: 'sold', label: isStaffView ? 'My Sold' : 'Total Sold', helper: 'Sales value in this period', value: metrics.totalSold, rows: [...metrics.saleRows, ...metrics.creditRows], tone: 'good', color: '#047857', bg: '#ecfdf5', icon: ShoppingCart },
    { key: 'cash', label: isStaffView ? 'My Cash' : 'Cash Expected', helper: 'Cash you should count', value: metrics.cashExpected, rows: metrics.cashRows, tone: metrics.cashExpected >= 0 ? 'good' : 'bad', color: '#047857', bg: '#ecfdf5', icon: Wallet },
    { key: 'transfer', label: isStaffView ? 'My Transfer' : 'Transfer Recorded', helper: 'Bank/mobile payments recorded', value: metrics.transferRecorded, rows: metrics.transferRows, tone: 'transfer', color: '#1d4ed8', bg: '#eff6ff', icon: Banknote },
    { key: 'dubie', label: isStaffView ? 'My Credit' : 'New Dubie', helper: 'Unpaid sales created', value: metrics.newDubie, rows: metrics.creditRows, tone: 'warn', color: '#ea580c', bg: '#fff7ed', icon: UserRound },
    { key: 'collected', label: isStaffView ? 'My Collections' : 'Credit Collected', helper: 'Old Dubie paid', value: metrics.creditCollected, rows: metrics.collectionRows, tone: 'warn', color: '#c2410c', bg: '#fff7ed', icon: Wallet },
    { key: 'spent', label: 'Spent Today', helper: 'Money paid out', value: metrics.spentToday, rows: metrics.expenseRows, tone: 'bad', color: '#dc2626', bg: '#fef2f2', icon: AlertTriangle },
  ];

  const hasStaffMembers = staffMembers.length > 0;
  const scopeOptions = [
    ...(hasStaffMembers ? [{ id: ALL_SCOPE, label: 'All Staff', helper: 'Owner + active staff' }] : []),
    { id: OWNER_SCOPE, label: 'Owner', helper: shopProfile?.name || 'Owner records' },
    ...staffMembers.filter(member => member.active !== false).map(member => ({ id: String(member.id), label: member.display_name || 'Staff', helper: member.role || 'Staff' })),
  ];
  const visibleScopeOptions = scopeOptions.filter(option => `${option.label} ${option.helper}`.toLowerCase().includes(scopeQuery.toLowerCase()));
  const selectedScope = isStaffView ? { label: activeStaff?.display_name || 'My records', helper: 'Staff view' } : scopeOptions.find(option => option.id === scope) || scopeOptions[0];
  const activeFilterLabels = [
    filters.type && `Type: ${filters.type}`,
    filters.payment && `Payment: ${filters.payment}`,
    filters.status && `Status: ${filters.status}`,
  ].filter(Boolean);

  const handleSaveReview = async () => {
    if (!canReviewClosing) return;
    if (actualCash === '') {
      setClosingMessage('Enter the actual cash counted first.');
      return;
    }
    if (Math.abs(difference) > 0.004 && !reviewNote.trim()) {
      setClosingMessage('Add a short reason before saving a cash difference.');
      return;
    }
    const nowMs = Date.now();
    const review = {
      id: reviewId,
      period_start: todayStart,
      period_end: todayStart + DAY_MS,
      reviewer: shopProfile?.name || 'Owner',
      expected_cash: metrics.cashExpected,
      actual_cash_counted: Number(actualCash || 0),
      difference,
      status: Math.abs(difference) < 0.005 ? 'balanced' : 'difference',
      note: reviewNote.trim(),
      created_at: savedReview?.created_at || nowMs,
      updated_at: nowMs,
    };
    await db.settings.put({ key: reviewSettingKey, value: JSON.stringify(review) });
    setSavedReview(review);
    setClosingMessage(review.status === 'balanced' ? 'Saved as balanced.' : 'Saved with difference noted.');
  };

  const exportRows = (format) => {
    if (isStaffView) {
      setActionMessage('Export is owner-only on this device.');
      return;
    }
    setActionMessage('');
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
      downloadBlob(JSON.stringify({ exported_at: new Date().toISOString(), period: { from, to }, scope: selectedScope.label, filters, rows: reportRows, customers, suppliers }, null, 2), `gebya-report-${stamp}.json`, 'application/json');
      return;
    }
    downloadBlob(buildCSV(reportRows), `gebya-report-${stamp}.csv`, 'text/csv;charset=utf-8');
  };

  const overdueCredits = (enrichedCustomerSummaries || []).filter(customer => customer.has_overdue && Number(customer.balance || 0) > 0).slice(0, 2);
  const attentionRows = [
    ...overdueCredits.map(customer => ({ id: `credit-${customer.id}`, title: 'Overdue credit', detail: `${customer.display_name || customer.name || 'Customer'} · ${fmt(customer.balance || 0)} ETB`, action: 'Review', onClick: () => onChaseOverdue?.(customer) })),
    ...metrics.transferRows.slice(0, 1).map(row => ({ id: `transfer-${row.report_id}`, title: 'Transfer recorded today', detail: `${fmt(amountOf(row))} ETB · ${actorName(row)}`, action: 'Review', onClick: () => setSelectedCard(cards.find(card => card.key === 'transfer')) })),
    ...(ownerAlerts || []).slice(0, 1).map(alert => ({ id: `alert-${alert.id}`, title: alert.item_name || 'Owner alert', detail: `${fmt(alert.amount || 0)} ETB · ${actorName(alert)}`, action: 'Review' })),
  ].slice(0, 3);

  return (
    <div data-report-root style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 'calc(176px + env(safe-area-inset-bottom, 0px))' }}>
      <header style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ color: '#115c37', fontFamily: 'Georgia, serif', fontSize: 29, fontWeight: 900, lineHeight: 1.05 }}>{isStaffView ? 'My Sales Report' : 'Shop Check'}</h2>
          <p style={{ color: '#667085', fontSize: 13, fontWeight: 800, marginTop: 4 }}>{displayDate(from)} · {getCurrentEthiopianDate()}</p>
          {isStaffView && <p style={{ color: '#667085', fontSize: 12, fontWeight: 750, marginTop: 2 }}>Showing only records saved as {activeStaff?.display_name || 'this staff member'} on this device.</p>}
        </div>
        <button type="button" onClick={togglePrivacy} style={{ minHeight: 38, border: '1px solid #e5e7eb', borderRadius: 999, background: '#fff', padding: '7px 11px', display: 'inline-flex', alignItems: 'center', gap: 7, color: '#374151', fontSize: 13, fontWeight: 900 }}>
          {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {hidden ? 'Show' : 'Hide'}
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 5, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 12, padding: 5 }}>
        {['today', 'week', 'month', 'custom'].map(id => (
          <button key={id} type="button" onClick={() => setTimeRange(id)} style={{ minHeight: 34, border: 'none', borderRadius: 8, background: timeRange === id ? '#005B36' : 'transparent', color: timeRange === id ? '#fff' : '#4b5563', fontSize: 12, fontWeight: 950, textTransform: 'capitalize' }}>{id}</button>
        ))}
      </div>

      {timeRange === 'custom' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <input aria-label="From date" type="date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} style={{ minHeight: 40, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 9px' }} />
          <input aria-label="To date" type="date" value={customTo} onChange={event => setCustomTo(event.target.value)} style={{ minHeight: 40, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 9px' }} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isStaffView || staffMembers.length === 0 ? '1fr' : '1fr auto', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Search className="w-4 h-4" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#667085' }} />
          <input value={rawSearch} onChange={event => setRawSearch(event.target.value)} placeholder={searchPlaceholder} style={{ width: '100%', minHeight: 45, border: `1px solid ${rawSearch ? '#005B36' : '#e5e7eb'}`, borderRadius: 10, background: '#fff', padding: '10px 38px 10px 38px', color: '#1f2937', fontSize: 13, outline: 'none' }} />
          {rawSearch && <button type="button" aria-label="Clear search" onClick={() => setRawSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#667085' }}><X className="w-4 h-4" /></button>}
        </div>
        {!isStaffView && hasStaffMembers && (
          <button type="button" onClick={() => setScopeOpen(true)} style={{ minHeight: 45, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', padding: '8px 10px', display: 'inline-flex', alignItems: 'center', gap: 8, color: '#005B36', fontSize: 13, fontWeight: 950 }}>
            {selectedScope.label}
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ color: '#667085', fontSize: 12, fontWeight: 800 }}>{displayPeriod(timeRange, from, to)} · {selectedScope.label}</span>
        {activeFilterLabels.map(label => (
          <button key={label} type="button" onClick={() => setFilters(EMPTY_FILTERS)} style={{ border: '1px solid #bbf7d0', borderRadius: 999, background: '#f0fdf4', color: '#047857', padding: '2px 8px', fontSize: 11, fontWeight: 850 }}>{label} ×</button>
        ))}
      </div>

      {searchQuery && (
        <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3 style={{ color: '#1f2937', fontSize: 14, fontWeight: 950, marginBottom: 4 }}>Search results ({searchRows.length})</h3>
          {searchRows.length ? searchRows.map(row => <RecordRow key={row.report_id} row={row} hidden={hidden} onEdit={onEdit} />) : <p style={{ color: '#667085', fontSize: 13, fontWeight: 750 }}>No matching shop records in this period and scope.</p>}
        </section>
      )}

      <section data-report-metrics style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        {cards.map(card => <MetricCard key={card.key} item={card} hidden={hidden} onOpen={setSelectedCard} />)}
      </section>

      {!isStaffView && staffRows.length > 0 && (
        <section data-report-section="staff-sales" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3 style={{ color: '#1f2937', fontSize: 16, fontWeight: 950, marginBottom: 8 }}>Staff sales in this report</h3>
          {staffRows.slice(0, 6).map(row => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, borderTop: '1px solid #f3f4f6', padding: '10px 0' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: '#1f2937', fontSize: 13, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</p>
                {row.records > 0 ? (
                  <p style={{ color: '#667085', fontSize: 11, fontWeight: 750 }}>{row.records} records<br />Cash {fmt(row.cash)} · Transfer {fmt(row.transfer)} · Dubie {fmt(row.newDubie)}</p>
                ) : (
                  <p style={{ color: '#667085', fontSize: 11, fontWeight: 750 }}>No activity in this period</p>
                )}
              </div>
              <span style={{ fontSize: 14 }}><Amount value={row.sold} hidden={hidden} tone={row.sold > 0 ? 'good' : 'default'} /></span>
            </div>
          ))}
        </section>
      )}

      {!isStaffView && hasStaffMembers && staffRows.length === 0 && (
        <section data-report-section="staff-sales" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3 style={{ color: '#1f2937', fontSize: 16, fontWeight: 950 }}>Staff sales in this report</h3>
          <p style={{ color: '#667085', fontSize: 13, fontWeight: 750, marginTop: 6 }}>No staff activity in this period.</p>
        </section>
      )}

      <section data-report-section="closing" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <CheckCircle2 className="w-5 h-5" style={{ color: savedReview?.status === 'balanced' ? '#047857' : '#667085' }} />
          <h3 style={{ color: '#1f2937', fontSize: 16, fontWeight: 950 }}>Today's Closing Check</h3>
        </div>
        {isStaffView ? (
          <p style={{ color: '#667085', fontSize: 13, fontWeight: 750 }}>Owner cash closing is not shown in staff view.</p>
        ) : !isToday ? (
          <p style={{ color: '#667085', fontSize: 13, fontWeight: 750 }}>Cash closing is editable only for Today. Week, Month, and Custom views show report totals only.</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, alignItems: 'end' }}>
              <div><p style={{ color: '#667085', fontSize: 11, fontWeight: 850 }}>Cash expected</p><p style={{ fontSize: 16 }}><Amount value={metrics.cashExpected} hidden={hidden} tone="good" /></p></div>
              <label style={{ color: '#667085', fontSize: 11, fontWeight: 850 }}>Actual cash counted<input value={actualCash} onChange={event => setActualCash(event.target.value)} inputMode="decimal" placeholder="0.00" style={{ width: '100%', minHeight: 38, marginTop: 4, border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 9px', color: '#1f2937' }} /></label>
              <div><p style={{ color: '#667085', fontSize: 11, fontWeight: 850 }}>Difference</p><p style={{ fontSize: 16 }}><Amount value={actualCash === '' ? 0 : difference} hidden={hidden} tone={Math.abs(difference) < 0.005 ? 'default' : 'bad'} /></p></div>
            </div>
            {actualCash !== '' && Math.abs(difference) > 0.004 && <textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} placeholder="Reason for cash difference" style={{ width: '100%', minHeight: 64, marginTop: 8, border: '1px solid #d1d5db', borderRadius: 8, padding: 9, fontSize: 13 }} />}
            {savedReview && <p style={{ color: '#667085', fontSize: 12, fontWeight: 750, marginTop: 8 }}>Reviewed by {savedReview.reviewer || 'Owner'} · {displayTime(savedReview.updated_at)} · {savedReview.status === 'balanced' ? 'Balanced' : 'Difference noted'}</p>}
            {closingMessage && <p style={{ color: closingMessage.includes('Saved') ? '#047857' : '#dc2626', fontSize: 12, fontWeight: 850, marginTop: 8 }}>{closingMessage}</p>}
            <button type="button" onClick={handleSaveReview} style={{ width: '100%', minHeight: 44, marginTop: 10, border: 'none', borderRadius: 8, background: '#005B36', color: '#fff', fontSize: 14, fontWeight: 950, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}><CheckCircle2 className="w-4 h-4" />Mark day reviewed</button>
          </>
        )}
      </section>

      {!isStaffView && attentionRows.length > 0 && (
        <section data-report-section="attention" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <h3 style={{ color: '#1f2937', fontSize: 16, fontWeight: 950, display: 'inline-flex', alignItems: 'center', gap: 7 }}><AlertTriangle className="w-5 h-5" style={{ color: '#ea580c' }} />Needs Attention</h3>
            <span style={{ color: '#005B36', fontSize: 12, fontWeight: 950 }}>View all</span>
          </div>
          {attentionRows.map(row => (
            <div key={row.id} style={{ border: '1px solid #fed7aa', borderRadius: 8, padding: 9, display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10, marginTop: 7, background: '#fff7ed' }}>
              <div style={{ minWidth: 0 }}><p style={{ color: '#1f2937', fontSize: 13, fontWeight: 950 }}>{row.title}</p><p style={{ color: '#667085', fontSize: 12, fontWeight: 750 }}>{row.detail}</p></div>
              <button type="button" onClick={row.onClick} style={{ minHeight: 34, minWidth: 86, border: '1px solid #ea580c', borderRadius: 7, background: '#fff', color: '#c2410c', fontSize: 13, fontWeight: 950 }}>{row.action}</button>
            </div>
          ))}
        </section>
      )}

      <section data-report-section="recent" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ color: '#1f2937', fontSize: 16, fontWeight: 950 }}>Recent Transactions</h3>
          <button type="button" onClick={() => setHistoryOpen(true)} style={{ border: 'none', background: 'transparent', color: '#005B36', fontSize: 12, fontWeight: 950 }}>View history</button>
        </div>
        {reportRows.slice(0, 4).map(row => <RecordRow key={row.report_id} row={row} hidden={hidden} onEdit={onEdit} />)}
        {!reportRows.length && <p style={{ color: '#667085', fontSize: 13, fontWeight: 750, marginTop: 8 }}>No records in this period.</p>}
      </section>

      <div data-report-actions style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <button type="button" onClick={() => setFilterOpen(true)} style={{ minHeight: 46, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#005B36', fontSize: 13, fontWeight: 950, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Settings2 className="w-4 h-4" />Filter</button>
        <button type="button" onClick={() => exportRows('csv')} style={{ minHeight: 46, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: isStaffView ? '#9ca3af' : '#005B36', fontSize: 13, fontWeight: 950, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Download className="w-4 h-4" />Export</button>
        <button type="button" onClick={() => setHistoryOpen(true)} style={{ minHeight: 46, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#005B36', fontSize: 13, fontWeight: 950, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><History className="w-4 h-4" />History</button>
      </div>
      {actionMessage && <p style={{ color: '#667085', fontSize: 12, fontWeight: 800, marginTop: -4 }}>{actionMessage}</p>}

      {selectedCard && (
        <Sheet title={selectedCard.label} onClose={() => setSelectedCard(null)}>
          <p style={{ color: '#667085', fontSize: 13, fontWeight: 750, marginBottom: 10 }}>{displayPeriod(timeRange, from, to)} · {selectedScope.label}</p>
          <p style={{ fontSize: 26, marginBottom: 10 }}><Amount value={selectedCard.value} hidden={hidden} tone={selectedCard.tone} /></p>
          {selectedCard.key === 'cash' && <p style={{ color: '#667085', fontSize: 12, fontWeight: 750, marginBottom: 10 }}>Formula: cash sales + cash credit collections - cash expenses. Digital transfers are not counted as drawer cash.</p>}
          {selectedCard.key === 'transfer' && <p style={{ color: '#667085', fontSize: 12, fontWeight: 750, marginBottom: 10 }}>Transfer Recorded shows bank/mobile payments entered on this device. Current status: recorded/unverified.</p>}
          {(selectedCard.rows || []).slice(0, 12).map(row => <RecordRow key={row.report_id} row={row} hidden={hidden} onEdit={onEdit} />)}
          {!(selectedCard.rows || []).length && <p style={{ color: '#667085', fontSize: 13, fontWeight: 750 }}>No matching records for this card.</p>}
        </Sheet>
      )}

      {scopeOpen && !isStaffView && (
        <Sheet title="Report scope" onClose={() => setScopeOpen(false)}>
          {scopeOptions.length > 8 && <input value={scopeQuery} onChange={event => setScopeQuery(event.target.value)} placeholder="Search staff" style={{ width: '100%', minHeight: 42, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }} />}
          {visibleScopeOptions.map(option => (
            <button key={option.id || 'all'} type="button" onClick={() => { setScope(option.id); setScopeOpen(false); }} style={{ width: '100%', border: 'none', borderTop: '1px solid #f3f4f6', background: option.id === scope ? '#ecfdf5' : '#fff', padding: '11px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left' }}>
              <span><strong style={{ color: '#1f2937', fontSize: 14 }}>{option.label}</strong><br /><span style={{ color: '#667085', fontSize: 12, fontWeight: 750 }}>{option.helper}</span></span>
              {option.id === scope && <CheckCircle2 className="w-5 h-5" style={{ color: '#005B36' }} />}
            </button>
          ))}
        </Sheet>
      )}

      {filterOpen && (
        <Sheet title="Report filters" onClose={() => setFilterOpen(false)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <SelectRow label="Type" value={filters.type} onChange={value => setFilters(prev => ({ ...prev, type: value }))} options={[{ value: '', label: 'All types' }, { value: 'sale', label: 'Sales' }, { value: 'credit', label: 'New Dubie' }, { value: 'collection', label: 'Collections' }, { value: 'expense', label: 'Expenses' }]} />
            <SelectRow label="Payment" value={filters.payment} onChange={value => setFilters(prev => ({ ...prev, payment: value }))} options={[{ value: '', label: 'All payments' }, { value: 'cash', label: 'Cash / Dubie' }, { value: 'transfer', label: 'Transfer' }]} />
            <SelectRow label="Status" value={filters.status} onChange={value => setFilters(prev => ({ ...prev, status: value }))} options={[{ value: '', label: 'All statuses' }, { value: 'recorded', label: 'Recorded' }, { value: 'recorded/unverified', label: 'Recorded / unverified' }]} />
            <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setFilterOpen(false); }} style={{ minHeight: 42, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#005B36', fontWeight: 950 }}>Clear filters</button>
          </div>
        </Sheet>
      )}

      {historyOpen && (
        <Sheet title="Report history" onClose={() => setHistoryOpen(false)}>
          <p style={{ color: '#667085', fontSize: 13, fontWeight: 750, marginBottom: 10 }}>Saved closing reviews on this device.</p>
          {historyRows.length ? historyRows.map(review => (
            <div key={review.id} style={{ borderTop: '1px solid #f3f4f6', padding: '10px 0' }}>
              <p style={{ color: '#1f2937', fontWeight: 950 }}>{displayDate(review.period_start)} · {review.status === 'balanced' ? 'Balanced' : 'Difference noted'}</p>
              <p style={{ color: '#667085', fontSize: 12, fontWeight: 750 }}>Expected {fmt(review.expected_cash)} · Counted {fmt(review.actual_cash_counted)} · Difference {fmt(review.difference)}</p>
            </div>
          )) : <p style={{ color: '#667085', fontSize: 13, fontWeight: 750 }}>No saved closing reviews yet.</p>}
        </Sheet>
      )}
    </div>
  );
}
