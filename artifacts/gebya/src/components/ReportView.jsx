import { lazy, Suspense, useMemo, useRef, useState, useEffect } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronDown,
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
  Clock,
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

// Collapsible Section Component
function Section({ title, action, children, refProp, isCollapsible = false, isExpanded = false, onToggle = null }) {
  return (
    <section ref={refProp} style={{
      background: '#fff',
      border: '1px solid var(--color-border, #ece6d6)',
      borderRadius: 'var(--radius-md, 12px)',
      boxShadow: 'var(--shadow-xs, 0 2px 8px -4px rgba(0,0,0,0.08))',
      padding: 12,
    }}>
      <button
        type="button"
        onClick={onToggle}
        disabled={!isCollapsible}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: isExpanded ? 8 : 0,
          border: 'none',
          background: 'transparent',
          cursor: isCollapsible ? 'pointer' : 'default',
          padding: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <h3 style={{
            color: '#374151',
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            {title}
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {action}
          {isCollapsible && (
            <ChevronDown className="w-4 h-4" style={{
              color: '#d1d5db',
              transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s ease-in-out',
            }} />
          )}
        </div>
      </button>
      {isExpanded && children}
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

// Simplified KPI Card with clickable chevron
function SummaryCard({ label, value, hidden, tone, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press-scale"
      style={{
        minWidth: 0,
        padding: '12px 10px',
        background: '#fafaf5',
        border: '1px solid #ece6d6',
        borderRadius: 10,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ width: 16 }} />
        <ChevronRight className="w-3.5 h-3.5" style={{ color: '#d1d5db' }} />
      </div>
      <div>
        <p style={{ color: '#6b7280', fontSize: 10, fontWeight: 800, lineHeight: 1.2 }}>
          {label}
        </p>
        <p style={{ marginTop: 4, fontSize: 16, lineHeight: 1.1, fontWeight: 900 }}>
          <Amount value={value} hidden={hidden} tone={tone} suffix={false} />
        </p>
      </div>
    </button>
  );
}

// KPI Detail Sheet Component  
function KPIDetailSheet({ kpi, isOpen, onClose, hidden, lang }) {
  if (!isOpen || !kpi) return null;

  const getDetailContent = (kpiType) => {
    const contents = {
      sold: lang === 'am' ? 'ሁሉም የተጠናቀቁ ግብይቶች ከወደሚመረጡ ጊዜ ውስጥ የሸያጭ ድምር።' : 'Total sales amount from all completed transactions during the selected period.',
      spent: lang === 'am' ? 'ሁሉም ተመዝግበው ደገፉ ወጪ ብዙ ወጪዎን እና ግዥዎን ያካትታል።' : 'Total expenses recorded including operational costs and purchases.',
      collected: lang === 'am' ? 'ከደንበኞች ተሰብስቧል ዱቤ ክሬዲት ከእዚህ ጊዜ ውስጥ ለአስተዋወቅ።' : 'Total credit payments collected from customers during this period.',
      cash: lang === 'am' ? 'አጠቅላይ ጥሬ ገንዘብ ተከታትል - ወጪ እና ዝውውር።' : 'Expected cash based on sales minus expenses and transfers.',
      transfer: lang === 'am' ? 'ድምር ሞባይል ገንዘብ ወይም ባንክ ዝውውር ተጠብቋል።' : 'Total mobile money or bank transfers expected.',
    };
    return contents[kpiType] || '';
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 40,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.2s ease-in-out',
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#fff',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          zIndex: 50,
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.12)',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease-in-out',
        }}
      >
        <div style={{ padding: '16px 16px 32px' }}>
          {/* Handle bar */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ width: 40, height: 4, background: '#e5e7eb', borderRadius: 2 }} />
          </div>

          {/* Header with close button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 900, color: '#1f2937' }}>
              {kpi.title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="press-scale"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <X className="w-5 h-5" style={{ color: '#9ca3af' }} />
            </button>
          </div>

          {/* Value */}
          <div style={{ marginBottom: 20, padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
            <p style={{ color: '#6b7280', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              {lang === 'am' ? 'ዋጋ' : 'Value'}
            </p>
            <p style={{ fontSize: 28, fontWeight: 900, color: kpi.tone === 'bad' ? '#dc2626' : kpi.tone === 'good' ? '#15803d' : '#1f2937' }}>
              <Amount value={kpi.value} hidden={hidden} tone={kpi.tone} suffix={true} />
            </p>
          </div>

          {/* Description */}
          <div>
            <p style={{ color: '#6b7280', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              {lang === 'am' ? 'ትርጓሜ' : 'What is this?'}
            </p>
            <p style={{ color: '#4b5563', fontSize: 13, lineHeight: 1.6, fontWeight: 500 }}>
              {getDetailContent(kpi.id)}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// Dashboard Insight Strip Component
function DashboardInsightStrip({ stats, counts, lang }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 12px',
      background: 'linear-gradient(135deg, rgba(27,67,50,0.05) 0%, rgba(27,67,50,0.02) 100%)',
      borderRadius: 10,
      border: '1px solid rgba(27,67,50,0.1)',
      fontSize: 12,
      fontWeight: 700,
      color: '#4b5563',
      overflowX: 'auto',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <Clock className="w-3.5 h-3.5" style={{ color: '#1B4332' }} />
        <span>{lang === 'am' ? 'ዛሬ' : 'Today'}</span>
      </span>
      <span style={{ width: 1, height: 16, background: '#d1d5db', opacity: 0.5 }} />
      <span style={{ flexShrink: 0 }}>
        {lang === 'am' ? 'ሰራተኞች' : 'Staff'}: <strong>{counts.staffCount || 0}</strong>
      </span>
      <span style={{ width: 1, height: 16, background: '#d1d5db', opacity: 0.5 }} />
      <span style={{ flexShrink: 0 }}>
        {lang === 'am' ? 'ሽያጮች' : 'Sales'}: <strong>{counts.salesCount || 0}</strong>
      </span>
      <span style={{ width: 1, height: 16, background: '#d1d5db', opacity: 0.5 }} />
      <span style={{ flexShrink: 0 }}>
        {lang === 'am' ? 'ክሬዲት' : 'Credits'}: <strong>{counts.creditCount || 0}</strong>
      </span>
      <span style={{ width: 1, height: 16, background: '#d1d5db', opacity: 0.5 }} />
      <span style={{ flexShrink: 0 }}>
        {lang === 'am' ? 'ልውውጥ' : 'Transfers'}: <strong>{counts.transferCount || 0}</strong>
      </span>
      <span style={{ width: 1, height: 16, background: '#d1d5db', opacity: 0.5 }} />
      <span style={{ flexShrink: 0 }}>
        {lang === 'am' ? 'ልዩነት' : 'Differences'}: <strong>{counts.diffCount || 0}</strong>
      </span>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [searchLimit, setSearchLimit] = useState(6);

  // State for new features
  const [selectedKPI, setSelectedKPI] = useState(null);
  const [kpiSheetOpen, setKpiSheetOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState(() => {
    try {
      const saved = sessionStorage.getItem('gebya_expanded_sections');
      return saved ? JSON.parse(saved) : { staffSales: true, ownerAlerts: true, recent: true, history: false };
    } catch {
      return { staffSales: true, ownerAlerts: true, recent: true, history: false };
    }
  });

  useEffect(() => {
    setSearchLimit(6);
  }, [searchQuery]);

  // Persist section expansion state
  useEffect(() => {
    try {
      sessionStorage.setItem('gebya_expanded_sections', JSON.stringify(expandedSections));
    } catch {
      // Silently ignore storage errors
    }
  }, [expandedSections]);

  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportRange, setExportRange] = useState('month');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [stickyTop, setStickyTop] = useState(0);

  const searchRef = useRef(null);
  const staffRef = useRef(null);
  const alertsRef = useRef(null);
  const recentRef = useRef(null);
  const historyRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const headerRef = useRef(null);

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

  // Calculate insight counts
  const insightCounts = useMemo(() => {
    const uniqueStaff = new Set();
    let salesCount = 0;
    let creditCount = 0;
    let transferCount = 0;

    for (const tx of rangeTransactions) {
      if (tx.actor_staff_member_id) uniqueStaff.add(tx.actor_staff_member_id);
      if (tx.type === 'sale') salesCount++;
      if (tx.payment_type && tx.payment_type !== 'cash') transferCount++;
    }

    creditCount = (ledgerTransactions || []).filter(tx => inRange(tx.created_at, rangeBounds[0], rangeBounds[1])).length;
    
    return {
      staffCount: uniqueStaff.size + 1,
      salesCount,
      creditCount,
      transferCount,
      diffCount: 0,
    };
  }, [rangeTransactions, ledgerTransactions, rangeBounds]);

  const scrollTo = (ref) => {
    ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
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

  const handleExportJSON = () => {
    const [from, to] = getExportBounds(exportRange);
    const json = buildJSON({ transactions, ledgerTransactions, customers, suppliers }, from, to);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(json, `gebya-${exportRange}-${stamp}.json`, 'application/json');
  };

  const handleKPIClick = (kpiData) => {
    setSelectedKPI(kpiData);
    setKpiSheetOpen(true);
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
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
    <>
      {/* KPI Detail Sheet */}
      <KPIDetailSheet 
        kpi={selectedKPI} 
        isOpen={kpiSheetOpen} 
        onClose={() => setKpiSheetOpen(false)} 
        hidden={hidden} 
        lang={lang} 
      />

      <div ref={scrollContainerRef} style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 120 }}>
        {/* Header - Fixed at top */}
        <div ref={headerRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '2px 2px 0' }}>
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

        {/* Dashboard Insight Strip */}
        <DashboardInsightStrip stats={selectedStats} counts={insightCounts} lang={lang} />

        {/* Sticky Time Range Controls */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: '#fff',
          paddingTop: 8,
          paddingBottom: 8,
          boxShadow: 'rgba(0,0,0,0.06) 0 2px 4px',
        }}>
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
        </div>

        {timeRange === 'custom' && (
          <Section title={lang === 'am' ? 'ጊዜ ክልል' : 'Date Range'}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#6b7280', fontSize: 11, fontWeight: 850 }}>
                {lang === 'am' ? 'ከ' : 'From'}
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  style={{ minHeight: 38, border: '1px solid #e5e7eb', borderRadius: 9, padding: '6px 8px', fontSize: 13 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#6b7280', fontSize: 11, fontWeight: 850 }}>
                {lang === 'am' ? 'ወደ' : 'To'}
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

        {/* Simplified KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <SummaryCard 
            label={labels.sold} 
            value={selectedStats.sales} 
            hidden={hidden} 
            tone="good"
            onClick={() => handleKPIClick({ id: 'sold', title: labels.sold, value: selectedStats.sales, tone: 'good' })}
          />
          <SummaryCard 
            label={labels.spent} 
            value={selectedStats.expenses} 
            hidden={hidden} 
            tone="bad"
            onClick={() => handleKPIClick({ id: 'spent', title: labels.spent, value: selectedStats.expenses, tone: 'bad' })}
          />
          <SummaryCard 
            label={labels.collected} 
            value={selectedCollected} 
            hidden={hidden} 
            tone="warn"
            onClick={() => handleKPIClick({ id: 'collected', title: labels.collected, value: selectedCollected, tone: 'warn' })}
          />
          <SummaryCard 
            label={labels.cashToExpect} 
            value={selectedFlow.cash} 
            hidden={hidden} 
            tone={selectedFlow.cash >= 0 ? 'good' : 'bad'}
            onClick={() => handleKPIClick({ id: 'cash', title: labels.cashToExpect, value: selectedFlow.cash, tone: selectedFlow.cash >= 0 ? 'good' : 'bad' })}
          />
          <SummaryCard 
            label={labels.transferExpected} 
            value={selectedFlow.transfer} 
            hidden={hidden} 
            tone={selectedFlow.transfer >= 0 ? 'good' : 'bad'}
            onClick={() => handleKPIClick({ id: 'transfer', title: labels.transferExpected, value: selectedFlow.transfer, tone: selectedFlow.transfer >= 0 ? 'good' : 'bad' })}
          />
        </div>

        {/* Sticky Search Bar */}
        <div style={{
          position: 'sticky',
          top: 52,
          zIndex: 29,
          background: '#fff',
          paddingBottom: 8,
        }}>
          <div style={{ display: 'relative' }}>
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
        </div>

        {showFilters && (
          <Section title={lang === 'am' ? 'ፈልግ' : 'Filter'}>
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

        {/* Collapsible Staff Sales Section */}
        <Section 
          title={labels.staffSales} 
          refProp={staffRef}
          isCollapsible={true}
          isExpanded={expandedSections.staffSales}
          onToggle={() => toggleSection('staffSales')}
        >
          <StaffSalesToday rows={todayStaffSalesRows} hidden={hidden} lang={lang} />
        </Section>

        {/* Collapsible Owner Alerts Section */}
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
          isCollapsible={true}
          isExpanded={expandedSections.ownerAlerts}
          onToggle={() => toggleSection('ownerAlerts')}
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
          <Section 
            title={labels.recent} 
            refProp={recentRef}
            isCollapsible={true}
            isExpanded={expandedSections.recent}
            onToggle={() => toggleSection('recent')}
          >
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

        {/* Collapsible History Section */}
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
          isCollapsible={true}
          isExpanded={expandedSections.history}
          onToggle={() => toggleSection('history')}
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
      </div>

      {/* Fixed Action Bar above bottom navigation */}
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
          <Clock className="w-4 h-4 inline-block mr-1" /> History
        </button>
      </div>
    </>
  );
}
