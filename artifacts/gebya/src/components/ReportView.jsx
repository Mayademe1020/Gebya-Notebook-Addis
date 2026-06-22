import { lazy, Suspense, useMemo, useRef, useState, useEffect } from 'react';
import {
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Filter,
  Search,
  X,
} from 'lucide-react';
import { useLang } from '../context/LangContext';
import { usePrivacy } from '../context/PrivacyContext';
import { fmt } from '../utils/numformat';
import { formatEthiopian, getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';
import { matchesSearch } from './HistoryView';

const HistoryView = lazy(() => import('./HistoryView'));

function startOfDay(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

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

function inRange(ts, from, to) {
  return Number(ts || 0) >= from && Number(ts || 0) < to;
}

function netOf(transactions, from, to) {
  let sales = 0;
  let expenses = 0;
  for (const tx of transactions || []) {
    if (!inRange(tx.created_at, from, to)) continue;
    if (tx.type === 'sale') sales += Number(tx.amount || 0);
    if (tx.type === 'expense') expenses += Number(tx.amount || 0);
  }
  return { sales, expenses, expectedCash: sales - expenses };
}

function moneyFlowOf(transactions, ledgerTransactions, from, to) {
  let cash = 0;
  let transfer = 0;

  for (const tx of transactions || []) {
    if (!inRange(tx.created_at, from, to)) continue;
    const paymentType = tx.payment_type || 'cash';
    const amount = Number(tx.cash_received ?? tx.amount ?? 0);
    if (!amount || paymentType === 'credit') continue;

    if (paymentType === 'cash') {
      cash += tx.type === 'expense' ? -amount : amount;
    } else if (tx.type === 'sale') {
      transfer += amount;
    } else if (tx.type === 'expense') {
      transfer -= amount;
    }
  }

  for (const tx of ledgerTransactions || []) {
    if (tx.type !== CUSTOMER_TRANSACTION_TYPES.PAYMENT) continue;
    if (!inRange(tx.created_at, from, to)) continue;
    cash += Number(tx.amount || 0);
  }

  return { cash, transfer };
}

function collectedIn(ledgerTransactions, from, to) {
  let total = 0;
  for (const tx of ledgerTransactions || []) {
    if (tx.type !== CUSTOMER_TRANSACTION_TYPES.PAYMENT) continue;
    if (!inRange(tx.created_at, from, to)) continue;
    total += Number(tx.amount || 0);
  }
  return total;
}

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCSV({ transactions, ledgerTransactions }, from, to, customers = []) {
  const header = ['date', 'type', 'amount', 'item_name', 'item_code', 'customer', 'note', 'quantity', 'entered_by'];
  const rows = [header.join(',')];
  const custName = (id) => customers.find(c => c.id === id)?.display_name || '';

  for (const tx of transactions || []) {
    if (!inRange(tx.created_at, from, to)) continue;
    rows.push([
      new Date(tx.created_at).toISOString(),
      tx.type,
      Number(tx.amount || 0),
      csvEscape(tx.item_name || tx.item_note),
      csvEscape(tx.item_code),
      csvEscape(tx.customer_name),
      csvEscape(tx.note || tx.item_note),
      Number(tx.quantity || 1),
      csvEscape(tx.actor_name_snapshot),
    ].join(','));
  }

  for (const tx of ledgerTransactions || []) {
    if (!inRange(tx.created_at, from, to)) continue;
    rows.push([
      new Date(tx.created_at).toISOString(),
      tx.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT ? 'dubie_payment' : 'dubie_credit',
      Number(tx.amount || 0),
      csvEscape(tx.item_note),
      '',
      csvEscape(custName(tx.customer_id)),
      '',
      tx.quantity || '',
      csvEscape(tx.actor_name_snapshot),
    ].join(','));
  }

  return rows.join('\n');
}

function buildJSON({ transactions, ledgerTransactions, customers, suppliers }, from, to) {
  return JSON.stringify({
    exported_at: new Date().toISOString(),
    range: {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    },
    transactions: (transactions || []).filter(tx => inRange(tx.created_at, from, to)),
    customer_transactions: (ledgerTransactions || []).filter(tx => inRange(tx.created_at, from, to)),
    customers: customers || [],
    suppliers: suppliers || [],
  }, null, 2);
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

function actorKey(tx) {
  return tx.actor_staff_member_id ? String(tx.actor_staff_member_id) : '__owner__';
}

function actorName(tx) {
  return tx.actor_name_snapshot || (actorKey(tx) === '__owner__' ? 'Owner' : 'Unknown');
}

function matchesActor(tx, actorFilter) {
  if (!actorFilter) return true;
  if (actorFilter === '__owner__') return !tx.actor_staff_member_id;
  return String(tx.actor_staff_member_id || '') === String(actorFilter);
}

function buildActorOptions(transactions) {
  const byActor = new Map();
  for (const tx of transactions || []) {
    const key = actorKey(tx);
    if (!byActor.has(key)) byActor.set(key, { id: key, label: actorName(tx) });
  }
  return Array.from(byActor.values()).sort((a, b) => {
    if (a.id === '__owner__') return -1;
    if (b.id === '__owner__') return 1;
    return String(a.label || '').localeCompare(String(b.label || ''));
  });
}

function displayItem(tx, lang) {
  return tx.item_note || tx.item_name || tx.note || (lang === 'am' ? 'መዝገብ' : 'Record');
}

function displayTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Section({ title, action, children, refProp }) {
  return (
    <section ref={refProp} style={{
      background: '#fff',
      border: '1px solid var(--color-border, #ece6d6)',
      borderRadius: 'var(--radius-md, 12px)',
      boxShadow: 'var(--shadow-xs, 0 2px 8px -4px rgba(0,0,0,0.08))',
      padding: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <h3 style={{
          color: '#374151',
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Amount({ value, hidden, tone = 'default', suffix = true }) {
  const colors = {
    default: '#1f2937',
    good: '#15803d',
    bad: '#dc2626',
    warn: '#92400e',
  };
  return (
    <span style={{
      color: colors[tone] || colors.default,
      fontFamily: 'Manrope, system-ui, sans-serif',
      fontVariantNumeric: 'tabular-nums',
      fontWeight: 900,
    }}>
      {hidden ? '••••' : fmt(value || 0)}{suffix && !hidden ? ' birr' : ''}
    </span>
  );
}

function SummaryCard({ label, value, hidden, tone }) {
  return (
    <div style={{
      minWidth: 0,
      padding: '9px 10px',
      background: '#fafaf5',
      border: '1px solid #ece6d6',
      borderRadius: 10,
    }}>
      <p style={{ color: '#6b7280', fontSize: 11, fontWeight: 800, lineHeight: 1.2 }}>
        {label}
      </p>
      <p style={{ marginTop: 5, fontSize: 17, lineHeight: 1.1 }}>
        <Amount value={value} hidden={hidden} tone={tone} suffix={false} />
      </p>
    </div>
  );
}

function RangeChip({ timeRange, customFrom, customTo, lang }) {
  const label = (() => {
    if (timeRange === 'week') return lang === 'am' ? 'የዚህ ሳምንት' : 'This week';
    if (timeRange === 'month') return lang === 'am' ? 'የዚህ ወር' : 'This month';
    if (timeRange === 'custom') return `${customFrom || '...'} - ${customTo || '...'}`;
    return lang === 'am' ? 'ዛሬ' : 'Today';
  })();

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 24,
      padding: '4px 8px',
      borderRadius: 999,
      background: '#f3f4f6',
      color: '#6b7280',
      fontSize: 11,
      fontWeight: 850,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function StaffSalesToday({ rows, hidden, lang }) {
  const visibleRows = (rows || []).slice(0, 4);
  if (!visibleRows.length) {
    return (
      <p style={{ color: '#9ca3af', fontSize: 13, fontWeight: 650 }}>
        {lang === 'am' ? 'ዛሬ የሰራተኛ ሽያጭ የለም።' : 'No staff sales yet today.'}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {visibleRows.map(row => (
        <div key={row.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ color: '#111827', fontSize: 14, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.name}
            </p>
            <p style={{ color: '#6b7280', fontSize: 12, fontWeight: 650 }}>
              {row.count} {row.count === 1 ? 'sale' : 'sales'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <span style={{ fontSize: 14 }}>
              <Amount value={row.total} hidden={hidden} tone="good" suffix />
            </span>
            <ChevronRight className="w-4 h-4" style={{ color: '#d1d5db' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function OwnerAlerts({ alerts, overdueCustomers, settings, hidden, lang }) {
  const saleAlerts = (alerts || []).slice(0, 2).map(alert => ({
    id: `sale-${alert.id}`,
    label: alert.item_name || (lang === 'am' ? 'ትልቅ ሽያጭ' : 'High-value sale'),
    detail: `${alert.actor_name_snapshot || 'Owner'} · ${displayTime(alert.created_at)}`,
    amount: Number(alert.amount || 0),
  }));
  const creditAlerts = (overdueCustomers || []).slice(0, Math.max(0, 2 - saleAlerts.length)).map(customer => ({
    id: `credit-${customer.id}`,
    label: lang === 'am' ? 'የዱቤ ቀን አልፏል' : 'Credit due',
    detail: customer.display_name || customer.name || (lang === 'am' ? 'ደንበኛ' : 'Customer'),
    amount: Math.max(Number(customer.balance || 0), 0),
  }));
  const visibleAlerts = [...saleAlerts, ...creditAlerts].slice(0, 2);

  if (!visibleAlerts.length) {
    return (
      <p style={{ color: '#9ca3af', fontSize: 13, fontWeight: 650 }}>
        {lang === 'am' ? 'አሁን አስፈላጊ ማሳወቂያ የለም።' : 'No important owner alerts right now.'}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {settings?.threshold_amount > 0 && (
        <p style={{ color: '#92400e', fontSize: 11, fontWeight: 800 }}>
          {lang === 'am' ? 'ትልቅ ሽያጭ' : 'High-value'}: {fmt(settings.threshold_amount)}+
        </p>
      )}
      {visibleAlerts.map(alert => (
        <div key={alert.id} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 10,
          padding: '9px 10px',
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ color: '#1f2937', fontSize: 14, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {alert.label}
            </p>
            <p style={{ color: '#92400e', fontSize: 12, fontWeight: 650, marginTop: 2 }}>
              {alert.detail}
            </p>
          </div>
          <span style={{ fontSize: 14, flexShrink: 0 }}>
            <Amount value={alert.amount} hidden={hidden} tone="warn" suffix={false} />
          </span>
        </div>
      ))}
    </div>
  );
}

function TransactionRow({ tx, hidden, lang, onEdit }) {
  return (
    <button
      type="button"
      onClick={() => onEdit?.(tx)}
      className="press-scale"
      style={{
        width: '100%',
        border: 'none',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '9px 0',
        textAlign: 'left',
        cursor: onEdit ? 'pointer' : 'default',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ color: '#111827', fontSize: 14, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayItem(tx, lang)}
        </p>
        <p style={{ color: '#6b7280', fontSize: 12, fontWeight: 650, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tx.type || 'entry'} · Entered by {actorName(tx)} · {displayTime(tx.created_at)}
        </p>
        {tx.item_code && (
          <p style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, marginTop: 1 }}>{tx.item_code}</p>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <span style={{ fontSize: 14 }}>
          <Amount
            value={Number(tx.amount || 0)}
            hidden={hidden}
            tone={tx.type === 'expense' ? 'bad' : 'good'}
            suffix={false}
          />
        </span>
        <ChevronRight className="w-4 h-4" style={{ color: '#d1d5db' }} />
      </div>
    </button>
  );
}

function EmptyText({ children }) {
  return <p style={{ color: '#9ca3af', fontSize: 13, fontWeight: 650 }}>{children}</p>;
}

function ReportView({
  transactions = [],
  ledgerTransactions = [],
  enrichedCustomerSummaries = [],
  supplierSummaries = [],
  customers = [],
  suppliers = [],
  shopProfile,
  onEdit,
  onChaseOverdue,
  ownerAlerts = [],
  ownerAlertSettings,
  todayStaffSalesRows = [],
}) {
  const { lang } = useLang();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const [timeRange, setTimeRange] = useState('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [searchLimit, setSearchLimit] = useState(6);

  useEffect(() => {
    setSearchLimit(6);
  }, [searchQuery]);
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportRange, setExportRange] = useState('month');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));

  const searchRef = useRef(null);
  const staffRef = useRef(null);
  const alertsRef = useRef(null);
  const recentRef = useRef(null);
  const historyRef = useRef(null);

  const now = Date.now();
  const todayStart = startOfDay(now);
  const todayEnd = todayStart + 86400000;
  const weekStart = startOfWeek(now);
  const weekEnd = weekStart + 7 * 86400000;
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const rangeBounds = useMemo(() => {
    if (timeRange === 'week') return [weekStart, weekEnd];
    if (timeRange === 'month') return [monthStart, monthEnd];
    if (timeRange === 'custom') {
      const fromDate = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(todayStart);
      const toDate = customTo ? new Date(`${customTo}T00:00:00`) : new Date(todayStart);
      toDate.setDate(toDate.getDate() + 1);
      return [fromDate.getTime(), toDate.getTime()];
    }
    return [todayStart, todayEnd];
  }, [timeRange, todayStart, todayEnd, weekStart, weekEnd, monthStart, monthEnd, customFrom, customTo]);

  const selectedStats = useMemo(
    () => netOf(transactions, rangeBounds[0], rangeBounds[1]),
    [transactions, rangeBounds]
  );
  const selectedCollected = useMemo(
    () => collectedIn(ledgerTransactions, rangeBounds[0], rangeBounds[1]),
    [ledgerTransactions, rangeBounds]
  );
  const selectedFlow = useMemo(
    () => moneyFlowOf(transactions, ledgerTransactions, rangeBounds[0], rangeBounds[1]),
    [transactions, ledgerTransactions, rangeBounds]
  );

  const rangeTransactions = useMemo(
    () => (transactions || []).filter(tx => inRange(tx.created_at, rangeBounds[0], rangeBounds[1])),
    [transactions, rangeBounds]
  );
  const actorOptions = useMemo(() => buildActorOptions(rangeTransactions), [rangeTransactions]);
  const filteredTransactions = useMemo(
    () => rangeTransactions.filter(tx => matchesSearch(tx, searchQuery) && matchesActor(tx, actorFilter)),
    [rangeTransactions, searchQuery, actorFilter]
  );
  const recentTransactions = useMemo(
    () => filteredTransactions.slice().sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)).slice(0, 3),
    [filteredTransactions]
  );
  const searchResults = useMemo(
    () => searchQuery.trim()
      ? filteredTransactions.slice().sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)).slice(0, searchLimit)
      : [],
    [filteredTransactions, searchQuery, searchLimit]
  );
  const overdueCustomers = useMemo(
    () => (enrichedCustomerSummaries || []).filter(customer => customer.has_overdue && Number(customer.balance || 0) > 0),
    [enrichedCustomerSummaries]
  );

  const scrollTo = (ref) => {
    ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const handleFullHistory = () => {
    setHistoryOpen(true);
    window.setTimeout(() => scrollTo(historyRef), 50);
  };

  const getExportBounds = (range) => {
    if (range === 'today') return [todayStart, todayEnd];
    if (range === 'week') return [weekStart, weekEnd];
    if (range === 'month') return [monthStart, monthEnd];
    return [0, Date.now() + 86400000];
  };

  const handleExportCSV = () => {
    const [from, to] = getExportBounds(exportRange);
    const csv = buildCSV({ transactions, ledgerTransactions }, from, to, customers);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(csv, `gebya-${exportRange}-${stamp}.csv`, 'text/csv;charset=utf-8');
  };

  const handleExportJSON = () => {
    const [from, to] = getExportBounds(exportRange);
    const json = buildJSON({ transactions, ledgerTransactions, customers, suppliers }, from, to);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(json, `gebya-${exportRange}-${stamp}.json`, 'application/json');
  };

  const labels = {
    title: lang === 'am' ? 'የሱቅ ቼክ' : 'Shop Check',
    today: lang === 'am' ? 'ዛሬ' : 'Today',
    week: lang === 'am' ? 'ሳምንት' : 'Week',
    month: lang === 'am' ? 'ወር' : 'Month',
    custom: lang === 'am' ? 'Custom' : 'Custom',
    sold: lang === 'am' ? 'ሽያጭ' : 'Sold',
    spent: lang === 'am' ? 'ወጪ' : 'Spent',
    collected: lang === 'am' ? 'ተሰብስቧል' : 'Collected',
    cashToExpect: lang === 'am' ? 'የሚጠበቅ ጥሬ ገንዘብ' : 'Cash to Expect',
    transferExpected: lang === 'am' ? 'የሚጠበቅ ትራንስፈር' : 'Transfer Expected',
    staffSales: lang === 'am' ? 'የዛሬ የሰራተኛ ሽያጭ' : 'Staff Sales Today',
    ownerAlerts: lang === 'am' ? 'የባለቤት ማሳወቂያ' : 'Owner Alerts',
    recent: lang === 'am' ? 'የቅርብ ግብይቶች' : 'Recent Transactions',
    fullHistory: lang === 'am' ? 'ሙሉ ታሪክ' : 'Full History',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 96 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '2px 2px 0' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ color: '#1B4332', fontSize: 22, fontWeight: 950, lineHeight: 1.05 }}>
            {labels.title}
          </h2>
          <p style={{ color: '#6b7280', fontSize: 12, fontWeight: 650, marginTop: 3 }}>
            {shopProfile?.name || (lang === 'am' ? 'በዚህ ስልክ' : 'Staff on this phone')} · {getCurrentEthiopianDate()}
          </p>
        </div>
        <button
          type="button"
          onClick={togglePrivacy}
          aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
          className="press-scale"
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
          {hidden ? 'Show' : 'Hide'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, background: 'rgba(27,67,50,0.08)', borderRadius: 12, padding: 5 }}>
        {[
          ['today', labels.today],
          ['week', labels.week],
          ['month', labels.month],
          ['custom', labels.custom],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTimeRange(id)}
            className="press-scale"
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

      {timeRange === 'custom' && (
        <Section title={lang === 'am' ? 'Custom range' : 'Custom range'}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#6b7280', fontSize: 11, fontWeight: 850 }}>
              {lang === 'am' ? 'From' : 'From'}
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                style={{ minHeight: 38, border: '1px solid #e5e7eb', borderRadius: 9, padding: '6px 8px', fontSize: 13 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#6b7280', fontSize: 11, fontWeight: 850 }}>
              {lang === 'am' ? 'To' : 'To'}
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                style={{ minHeight: 38, border: '1px solid #e5e7eb', borderRadius: 9, padding: '6px 8px', fontSize: 13 }}
              />
            </label>
          </div>
        </Section>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '-2px 2px' }}>
        <RangeChip timeRange={timeRange} customFrom={customFrom} customTo={customTo} lang={lang} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <SummaryCard label={labels.sold} value={selectedStats.sales} hidden={hidden} tone="good" />
        <SummaryCard label={labels.spent} value={selectedStats.expenses} hidden={hidden} tone="bad" />
        <SummaryCard label={labels.collected} value={selectedCollected} hidden={hidden} tone="warn" />
        <SummaryCard label={labels.cashToExpect} value={selectedFlow.cash} hidden={hidden} tone={selectedFlow.cash >= 0 ? 'good' : 'bad'} />
        <SummaryCard label={labels.transferExpected} value={selectedFlow.transfer} hidden={hidden} tone={selectedFlow.transfer >= 0 ? 'good' : 'bad'} />
      </div>

      <div style={{ position: 'relative' }}>
        <Search className="w-4 h-4" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search item, code, amount, staff, or date"
          style={{
            width: '100%',
            minHeight: 44,
            padding: '10px 42px 10px 36px',
            background: '#fff',
            border: `1px solid ${searchQuery.trim() ? '#1B4332' : 'var(--color-border, #e5e7eb)'}`,
            borderRadius: 12,
            boxShadow: 'var(--shadow-xs, 0 2px 8px -4px rgba(0,0,0,0.08))',
            color: '#374151',
            fontSize: 14,
            outline: 'none',
          }}
        />
        {searchQuery.trim() ? (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="press-scale"
            style={{ position: 'absolute', right: 38, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <X className="w-4 h-4" style={{ color: '#9ca3af' }} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowFilters(value => !value)}
          aria-label="Filter report"
          className="press-scale"
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', padding: 5 }}
        >
          <Filter className="w-4 h-4" style={{ color: actorFilter ? '#1B4332' : '#9ca3af' }} />
        </button>
      </div>

      {showFilters && (
        <Section title={lang === 'am' ? 'Filter' : 'Filter'}>
          <label style={{ display: 'block', color: '#6b7280', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            {lang === 'am' ? 'ሻጭ' : 'Seller'}
          </label>
          <select
            value={actorFilter}
            onChange={e => setActorFilter(e.target.value)}
            style={{
              width: '100%',
              minHeight: 42,
              border: `1px solid ${actorFilter ? '#1B4332' : '#e5e7eb'}`,
              borderRadius: 10,
              padding: '8px 10px',
              background: '#fff',
              color: '#374151',
              fontSize: 14,
              outline: 'none',
            }}
          >
            <option value="">{lang === 'am' ? 'ሁሉም ሻጮች' : 'All sellers'}</option>
            {actorOptions.map(actor => (
              <option key={actor.id} value={actor.id}>{actor.label}</option>
            ))}
          </select>
        </Section>
      )}

      {searchQuery.trim() && (
        <Section title={lang === 'am' ? 'የፍለጋ ውጤት' : 'Search Results'}>
          {searchResults.length ? (
            <>
              <div style={{ divide: '1px solid #f3f4f6' }}>
                {searchResults.map(tx => (
                  <TransactionRow key={tx.id} tx={tx} hidden={hidden} lang={lang} onEdit={onEdit} />
                ))}
              </div>
              {filteredTransactions.length > searchLimit && (
                <button
                  type="button"
                  onClick={() => setSearchLimit(prev => prev + 10)}
                  className="w-full py-2.5 mt-2 text-xs font-bold text-center transition-all press-scale border rounded-xl"
                  style={{
                    borderColor: '#C4883A',
                    color: '#6b4f1d',
                    background: 'rgba(196,136,58,0.04)',
                  }}
                >
                  {lang === 'am' ? 'ተጨማሪ ውጤቶች አሳይ' : 'Load more results'}
                </button>
              )}
            </>
          ) : (
            <EmptyText>{lang === 'am' ? 'ምንም ውጤት የለም።' : `No results for "${searchQuery}".`}</EmptyText>
          )}
        </Section>
      )}

      <Section title={labels.staffSales} refProp={staffRef}>
        <StaffSalesToday rows={todayStaffSalesRows} hidden={hidden} lang={lang} />
      </Section>

      <Section
        title={labels.ownerAlerts}
        refProp={alertsRef}
        action={overdueCustomers.length > 0 && (
          <button
            type="button"
            onClick={onChaseOverdue}
            className="press-scale"
            style={{ border: 'none', background: 'transparent', color: '#92400e', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
          >
            {lang === 'am' ? 'ዱቤ' : 'Credit'}
          </button>
        )}
      >
        <OwnerAlerts
          alerts={ownerAlerts}
          overdueCustomers={overdueCustomers}
          settings={ownerAlertSettings}
          hidden={hidden}
          lang={lang}
        />
      </Section>

      {!searchQuery.trim() && (
        <Section title={labels.recent} refProp={recentRef}>
          {recentTransactions.length ? (
            <div>
              {recentTransactions.map(tx => (
                <TransactionRow key={tx.id} tx={tx} hidden={hidden} lang={lang} onEdit={onEdit} />
              ))}
            </div>
          ) : (
            <EmptyText>{lang === 'am' ? 'ለዚህ ጊዜ መዝገብ የለም።' : 'No transactions in this period yet.'}</EmptyText>
          )}
        </Section>
      )}

      <Section
        title={labels.fullHistory}
        refProp={historyRef}
        action={(
          <button
            type="button"
            onClick={() => setHistoryOpen(value => !value)}
            className="press-scale"
            style={{ border: 'none', background: 'transparent', color: '#1B4332', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
          >
            {historyOpen ? (lang === 'am' ? 'ዝጋ' : 'Hide') : (lang === 'am' ? 'ክፈት' : 'Open')}
          </button>
        )}
      >
        {historyOpen ? (
          <Suspense fallback={<div style={{ padding: 12, color: '#9ca3af', fontSize: 13 }}>Loading...</div>}>
            <HistoryView transactions={filteredTransactions} onEdit={onEdit} />
          </Suspense>
        ) : (
          <button
            type="button"
            onClick={handleFullHistory}
            className="press-scale"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              border: '1px solid #e5e7eb',
              background: '#fafaf5',
              borderRadius: 10,
              padding: '11px 12px',
              color: '#374151',
              fontSize: 14,
              fontWeight: 850,
              cursor: 'pointer',
            }}
          >
            <span>{filteredTransactions.length} {lang === 'am' ? 'መዝገቦች' : 'transactions'}</span>
            <ChevronRight className="w-4 h-4" style={{ color: '#9ca3af' }} />
          </button>
        )}
      </Section>

      {showExport && (
        <Section title={lang === 'am' ? 'Export' : 'Export'}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 5, marginBottom: 9 }}>
            {['today', 'week', 'month', 'all'].map(range => (
              <button
                key={range}
                type="button"
                onClick={() => setExportRange(range)}
                className="press-scale"
                style={{
                  minHeight: 32,
                  border: 'none',
                  borderRadius: 8,
                  background: exportRange === range ? '#1B4332' : '#f3f4f6',
                  color: exportRange === range ? '#fff' : '#6b7280',
                  fontSize: 12,
                  fontWeight: 900,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                }}
              >
                {range}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <button
              type="button"
              onClick={handleExportCSV}
              className="press-scale"
              style={{ minHeight: 40, border: '1px solid #1B4332', borderRadius: 10, background: '#fff', color: '#1B4332', fontWeight: 950, cursor: 'pointer' }}
            >
              CSV
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              className="press-scale"
              style={{ minHeight: 40, border: '1px solid #1B4332', borderRadius: 10, background: '#fff', color: '#1B4332', fontWeight: 950, cursor: 'pointer' }}
            >
              JSON
            </button>
          </div>
        </Section>
      )}

      <div style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 68,
        width: 'calc(100% - 24px)',
        maxWidth: 424,
        zIndex: 25,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 6,
        background: 'rgba(250,250,245,0.96)',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 6,
        backdropFilter: 'blur(8px)',
        boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
      }}>
        <button
          type="button"
          onClick={() => setShowFilters(value => !value)}
          className="press-scale"
          style={{ minHeight: 38, border: 'none', borderRadius: 9, background: showFilters ? '#1B4332' : '#fff', color: showFilters ? '#fff' : '#374151', fontSize: 12, fontWeight: 950, cursor: 'pointer' }}
        >
          <Filter className="w-4 h-4 inline-block mr-1" /> Filter
        </button>
        <button
          type="button"
          onClick={() => setShowExport(value => !value)}
          className="press-scale"
          style={{ minHeight: 38, border: 'none', borderRadius: 9, background: showExport ? '#1B4332' : '#fff', color: showExport ? '#fff' : '#374151', fontSize: 12, fontWeight: 950, cursor: 'pointer' }}
        >
          <Download className="w-4 h-4 inline-block mr-1" /> Export
        </button>
        <button
          type="button"
          onClick={handleFullHistory}
          className="press-scale"
          style={{ minHeight: 38, border: 'none', borderRadius: 9, background: historyOpen ? '#1B4332' : '#fff', color: historyOpen ? '#fff' : '#374151', fontSize: 12, fontWeight: 950, cursor: 'pointer' }}
        >
          History
        </button>
      </div>
    </div>
  );
}

export default ReportView;
