import { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Pencil, Search, X } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import { fmt } from '../utils/numformat';
import PhotoAttachment from './PhotoAttachment';

function groupByDay(transactions) {
  const groups = {};
  for (const tx of transactions) {
    const key = new Date(tx.created_at).toDateString();
    if (!groups[key]) groups[key] = { date: tx.created_at, transactions: [] };
    groups[key].transactions.push(tx);
  }
  return Object.values(groups).sort((a, b) => b.date - a.date);
}

function groupByWeek(transactions) {
  const groups = {};
  for (const tx of transactions) {
    const d = new Date(tx.created_at);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const key = monday.getTime();
    if (!groups[key]) groups[key] = { weekStart: monday.getTime(), transactions: [] };
    groups[key].transactions.push(tx);
  }
  return Object.values(groups).sort((a, b) => b.weekStart - a.weekStart);
}

function calcStats(transactions) {
  const sales = transactions.filter(tx => tx.type === 'sale');
  const expenses = transactions.filter(tx => tx.type === 'expense');
  const revenue = sales.reduce((s, tx) => s + (tx.amount || 0), 0);
  const costOfGoods = sales.reduce((s, tx) => s + ((tx.cost_price || 0) * (tx.quantity || 1)), 0);
  const expenseTotal = expenses.reduce((s, tx) => s + (tx.amount || 0), 0);
  const hasCost = sales.some(tx => tx.cost_price > 0);
  const profit = revenue - costOfGoods - expenseTotal;
  return { revenue, profit, hasCost, expenseTotal };
}

// ─── Fix C (Report scalability): month bucketing ──────────────────────────
// As transaction count grows, rendering every day-group at once janks cheap
// phones. We bucket day-groups under Ethiopian-month headers and only render
// the day rows for EXPANDED months — so we never render more than one month's
// rows at a time, no matter how much history exists.

function monthLabelOf(ts) {
  // formatEthiopian returns "DD MonthName YYYY"; month+year are tokens 1..2.
  // Amharic month names are single tokens so this split is safe.
  const parts = String(formatEthiopian(ts)).split(' ');
  return parts.length >= 3 ? `${parts[1]} ${parts[2]}` : String(formatEthiopian(ts));
}

function groupDaysByMonth(dayGroups) {
  const buckets = new Map();
  for (const dg of dayGroups) {
    const label = monthLabelOf(dg.date);
    if (!buckets.has(label)) {
      buckets.set(label, { label, date: dg.date, dayGroups: [], transactions: [] });
    }
    const b = buckets.get(label);
    b.dayGroups.push(dg);
    b.transactions.push(...dg.transactions);
    if (dg.date > b.date) b.date = dg.date; // keep newest date for sort + current-month detection
  }
  return Array.from(buckets.values()).sort((a, b) => b.date - a.date);
}

function getTopProducts(transactions, limit = 5) {
  const byQty = {};
  const byRev = {};
  for (const tx of transactions) {
    if (tx.type !== 'sale') continue;
    const name = tx.item_name || 'Unknown';
    const qty = tx.quantity || 1;
    const amount = tx.amount || 0;
    byQty[name] = (byQty[name] || 0) + qty;
    byRev[name] = (byRev[name] || 0) + amount;
  }
  const topByQty = Object.entries(byQty)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, qty]) => ({ name, qty, revenue: byRev[name] || 0 }));
  const topByRev = Object.entries(byRev)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, revenue]) => ({ name, revenue, qty: byQty[name] || 0 }));
  return { topByQty, topByRev };
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getMonthStart(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getMonthEnd(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function filterCurrentWeek(transactions) {
  const ws = getWeekStart(Date.now());
  const we = ws + 7 * 86400000;
  return transactions.filter(tx => tx.created_at >= ws && tx.created_at < we);
}

function filterCurrentMonth(transactions) {
  const ms = getMonthStart(Date.now());
  const me = getMonthEnd(Date.now());
  return transactions.filter(tx => tx.created_at >= ms && tx.created_at <= me);
}

function matchesSearch(tx, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (tx.item_name || '').toLowerCase().includes(q) ||
    (tx.customer_name || '').toLowerCase().includes(q)
  );
}

function matchesActor(tx, actorFilter) {
  if (!actorFilter) return true;
  if (actorFilter === '__owner__') return !tx.actor_staff_member_id;
  return String(tx.actor_staff_member_id || '') === String(actorFilter);
}

function buildActorOptions(transactions) {
  const byActor = new Map();
  transactions.forEach((tx) => {
    const key = tx.actor_staff_member_id ? String(tx.actor_staff_member_id) : '__owner__';
    if (!byActor.has(key)) {
      byActor.set(key, {
        id: key,
        label: tx.actor_name_snapshot || (key === '__owner__' ? 'Owner' : 'Unknown'),
      });
    }
  });

  return Array.from(byActor.values()).sort((a, b) => {
    if (a.id === '__owner__') return -1;
    if (b.id === '__owner__') return 1;
    return String(a.label || '').localeCompare(String(b.label || ''));
  });
}

function buildActorAuditSummary(transactions) {
  const summaryByActor = new Map();

  transactions.forEach((tx) => {
    const key = tx.actor_staff_member_id ? String(tx.actor_staff_member_id) : '__owner__';
    const existing = summaryByActor.get(key) || {
      id: key,
      label: tx.actor_name_snapshot || (key === '__owner__' ? 'Owner' : 'Unknown'),
      salesAmount: 0,
      salesCount: 0,
      itemsSold: 0,
      expensesAmount: 0,
      transactionCount: 0,
    };

    existing.transactionCount += 1;
    if (tx.type === 'sale') {
      existing.salesAmount += Number(tx.amount || 0);
      existing.salesCount += 1;
      existing.itemsSold += Number(tx.quantity || 1);
    }
    if (tx.type === 'expense') {
      existing.expensesAmount += Number(tx.amount || 0);
    }

    summaryByActor.set(key, existing);
  });

  return Array.from(summaryByActor.values()).sort((a, b) => {
    if (b.salesAmount !== a.salesAmount) return b.salesAmount - a.salesAmount;
    return b.transactionCount - a.transactionCount;
  });
}

const typeIcon  = { sale: '💰', expense: '🛒', credit: '👥' };
const typeColor = { sale: '#15803d', expense: '#dc2626', credit: '#C4883A' };
const medals    = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

function TopProductsList({ transactions, title }) {
  const { t } = useLang();
  const { topByQty, topByRev } = getTopProducts(transactions);
  const [tab, setTab] = useState('qty');

  const items = tab === 'qty' ? topByQty : topByRev;

  if (topByQty.length === 0) return null;

  return (
    <div className="px-4 py-3" style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-500">🏆 {title}</p>
        <div className="flex gap-1">
          <button
            onClick={() => setTab('qty')}
            className="text-xs px-2 py-0.5 rounded-full font-bold transition-all press-scale"
            style={{
              background: tab === 'qty' ? '#1B4332' : '#f5f5f5',
              color: tab === 'qty' ? '#fff' : '#9ca3af',
            }}
          >
            {t.byQuantity}
          </button>
          <button
            onClick={() => setTab('rev')}
            className="text-xs px-2 py-0.5 rounded-full font-bold transition-all press-scale"
            style={{
              background: tab === 'rev' ? '#1B4332' : '#f5f5f5',
              color: tab === 'rev' ? '#fff' : '#9ca3af',
            }}
          >
            {t.byRevenue}
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        {items.map((p, i) => (
          <div key={p.name} className="flex items-center gap-2">
            <span className="text-sm flex-shrink-0">{medals[i] || `${i + 1}.`}</span>
            <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{p.name}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: 'rgba(27,67,50,0.1)', color: '#1B4332' }}>
              {tab === 'qty' ? `×${p.qty}` : `${fmt(p.revenue)} ${t.birr}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsSummary({ transactions }) {
  const { t } = useLang();
  const { revenue, profit, expenseTotal, hasCost } = calcStats(transactions);
  const netProfit = hasCost ? profit : revenue - expenseTotal;

  return (
    <div className="px-4 py-3 space-y-2" style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)' }}>
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500">{t.totalSales}</span>
        <span className="text-sm font-bold text-green-700">
          {`${fmt(revenue)} ${t.birr}`}
        </span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500">{t.totalExpenses}</span>
        <span className="text-sm font-bold text-red-500">
          {`${fmt(expenseTotal)} ${t.birr}`}
        </span>
      </div>
      <div className="border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-gray-600">{t.netProfit}</span>
          <span className={`text-sm font-black ${netProfit >= 0 ? 'text-green-700' : 'text-red-500'}`}>
            {`${netProfit >= 0 ? '+' : ''}${fmt(netProfit)} ${t.birr}`}
          </span>
        </div>
      </div>
    </div>
  );
}

function TxRow({ tx, onEdit, t, lang }) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const hasBreakdown = Array.isArray(tx.items) && tx.items.length > 0;
  const amountColor = typeColor[tx.type];

  return (
    <div className="w-full px-4 py-3" style={{ background: 'transparent' }}>
      <div className="flex justify-between items-center gap-2">
        <button
          onClick={() => onEdit(tx)}
          className="flex-1 flex items-center gap-2.5 min-w-0 text-left press-scale"
        >
          <span className="text-base flex-shrink-0">{typeIcon[tx.type]}</span>
          <div className="min-w-0">
            <span className="font-medium text-gray-800 text-sm truncate block">{tx.item_name}</span>
            {tx.quantity > 1 && <span className="text-xs text-gray-400">×{tx.quantity}</span>}
            {tx.customer_name && <p className="text-xs text-gray-400">{tx.customer_name}</p>}
            {tx.actor_name_snapshot && <p className="text-xs text-gray-500">Entered by {tx.actor_name_snapshot}</p>}
            {tx.updated_at && <p className="text-xs" style={{ color: '#C4883A' }}>{t.edited}</p>}
          </div>
        </button>
        {(tx.photo || (Array.isArray(tx.photos) && tx.photos.length > 0)) && (
          <PhotoAttachment
            photo={tx.photo}
            photos={tx.photos}
            lang={lang}
            label={lang === 'am' ? 'የግብይት ፎቶ ይመልከቱ' : 'View transaction photo'}
          />
        )}
        {hasBreakdown && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setBreakdownOpen(v => !v); }}
            className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold border press-scale flex items-center gap-0.5"
            style={{
              borderColor: breakdownOpen ? '#1B4332' : '#e8e2d8',
              borderRadius: '999px',
              background: breakdownOpen ? 'rgba(27,67,50,0.08)' : '#fff',
              color: breakdownOpen ? '#1B4332' : '#6b7280',
            }}
            aria-label="Show items"
          >
            🧺{tx.items.length}
            {breakdownOpen
              ? <ChevronUp className="w-3 h-3" />
              : <ChevronDown className="w-3 h-3" />
            }
          </button>
        )}
        <button
          onClick={() => onEdit(tx)}
          className="flex items-center gap-1 flex-shrink-0 ml-2 press-scale"
          style={{ minHeight: 44, minWidth: 44, justifyContent: 'flex-end' }}
        >
          <div className="text-right">
            <span className="font-semibold text-sm" style={{ color: amountColor }}>
              {tx.type === 'expense' ? '-' : ''}{fmt(tx.amount || 0)}
            </span>
            {tx.profit !== null && tx.profit !== undefined && (
              <p className={`text-xs ${tx.profit >= 0 ? 'text-green-600' : 'text-red-400'}`}>
                {tx.profit >= 0 ? '+' : ''}{fmt(tx.profit)} {t.profit}
              </p>
            )}
          </div>
          <Pencil className="w-3.5 h-3.5 text-gray-300" />
        </button>
      </div>

      {hasBreakdown && breakdownOpen && (
        <div
          className="mt-2 ml-7 pl-3 py-1.5 space-y-1"
          style={{ borderLeft: '2px solid rgba(27,67,50,0.15)' }}
        >
          {tx.items.map((it, i) => (
            <div key={i} className="flex justify-between items-baseline text-xs">
              <span className="truncate min-w-0" style={{ color: '#374151' }}>• {it.name}</span>
              <span className="font-semibold flex-shrink-0 ml-2" style={{ color: amountColor }}>
                {fmt(it.amount || 0)} {lang === 'am' ? 'ብር' : 'birr'}
              </span>
            </div>
          ))}
          {(() => {
            const sum = tx.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
            const delta = (Number(tx.amount) || 0) - sum;
            if (Math.abs(delta) < 0.01) return null;
            return (
              <div className="flex justify-between items-baseline text-[10px] pt-1 mt-1" style={{ borderTop: '1px dashed rgba(0,0,0,0.08)', color: '#C4883A' }}>
                <span>{delta > 0 ? (lang === 'am' ? 'ቀሪ' : 'Unaccounted') : (lang === 'am' ? 'በላይ' : 'Excess')}</span>
                <span className="font-semibold">{fmt(Math.abs(delta))} {lang === 'am' ? 'ብር' : 'birr'}</span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// Fix C: month-bucketed wrapper around DayGroupList. Shows month header bars;
// only the expanded month renders its day cards. Current month auto-expands.
function MonthBucketedDayList({ dayGroups, onEdit, expandedGroups, toggleGroup, expandedMonths, toggleMonth, t, lang }) {
  const monthBuckets = groupDaysByMonth(dayGroups);
  const currentMonthLabel = monthLabelOf(Date.now());

  return (
    <div className="space-y-3">
      {monthBuckets.map((bucket, idx) => {
        const stats = calcStats(bucket.transactions);
        const isCurrentMonth = bucket.label === currentMonthLabel;
        // Current month + the first bucket default open; others collapsed.
        const expanded = expandedMonths[bucket.label] ?? (isCurrentMonth || idx === 0);
        return (
          <div key={bucket.label}>
            {/* Month header bar — tappable */}
            <button
              type="button"
              onClick={() => toggleMonth(bucket.label, expanded)}
              className="w-full px-4 py-3 flex justify-between items-center press-scale"
              style={{
                background: isCurrentMonth
                  ? 'linear-gradient(135deg, #1B4332 0%, #2d6a4f 100%)'
                  : '#1f2937',
                color: '#fff',
                borderRadius: expanded ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <div className="text-left">
                <span className="font-black text-sm">{bucket.label}</span>
                <div className="text-[11px] mt-0.5" style={{ opacity: 0.7 }}>
                  {bucket.transactions.length} {t.entries}
                  {isCurrentMonth && (
                    <span style={{ marginLeft: 6 }}>
                      · {lang === 'am' ? 'አሁን' : 'current'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-sm font-black" style={{ color: stats.profit >= 0 ? '#86efac' : '#fca5a5' }}>
                    {stats.hasCost
                      ? `${stats.profit >= 0 ? '+' : ''}${fmt(stats.profit)}`
                      : fmt(stats.revenue)} {t.birr}
                  </div>
                  <div className="text-[10px]" style={{ opacity: 0.65 }}>
                    {stats.hasCost ? t.profit : t.revenue}
                  </div>
                </div>
                {expanded
                  ? <ChevronUp className="w-4 h-4" style={{ opacity: 0.8 }} />
                  : <ChevronDown className="w-4 h-4" style={{ opacity: 0.8 }} />}
              </div>
            </button>

            {/* Day cards for this month — only rendered when the month is open */}
            {expanded && (
              <div
                className="pt-3 px-2 pb-2"
                style={{
                  background: 'rgba(0,0,0,0.02)',
                  borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  borderTop: 'none',
                }}
              >
                <DayGroupList
                  groups={bucket.dayGroups}
                  onEdit={onEdit}
                  expandedGroups={expandedGroups}
                  toggleGroup={toggleGroup}
                  t={t}
                  lang={lang}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DayGroupList({ groups, onEdit, expandedGroups, toggleGroup, t, lang }) {
  return (
    <div className="space-y-3">
      {groups.map(group => {
        const stats = calcStats(group.transactions);
        const isToday = new Date(group.date).toDateString() === new Date().toDateString();
        const key = group.date.toString();
        const expanded = expandedGroups[key] ?? isToday;
        return (
          <div
            key={group.date}
            className="border overflow-hidden transition-all animate-slide-up"
            style={{
              background: '#fff',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-xs)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <button className="w-full px-4 py-3 flex justify-between items-center"
              style={{ background: isToday ? 'rgba(27,67,50,0.05)' : '#fafafa' }}
              onClick={() => toggleGroup(key)}>
              <div>
                <span className="font-bold text-gray-800 text-sm font-sans">
                  {isToday ? t.today : formatEthiopian(group.date)}
                </span>
                {!isToday && (
                  <span className="text-xs ml-2" style={{ color: '#9ca3af' }}>
                    {new Date(group.date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                )}
                <div className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                  {group.transactions.length} {t.entries}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className={`text-sm font-black ${stats.profit >= 0 ? 'text-green-700' : 'text-red-500'}`}>
                    {stats.hasCost ? `${stats.profit >= 0 ? '+' : ''}${fmt(stats.profit)}` : fmt(stats.revenue)} {t.birr}
                  </div>
                  <div className="text-xs" style={{ color: '#9ca3af' }}>{stats.hasCost ? t.profit : t.revenue}</div>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {expanded && (
              <div className="divide-y" style={{ borderColor: 'var(--color-border-light)' }}>
                {group.transactions.map(tx => (
                  <TxRow key={tx.id} tx={tx} onEdit={onEdit} t={t} lang={lang} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WeekGroupList({ groups, onEdit, expandedGroups, toggleGroup, t, lang }) {
  return (
    <div className="space-y-3">
      {groups.map(group => {
        const stats = calcStats(group.transactions);
        const weekEnd = new Date(group.weekStart + 6 * 86400000);
        const key = group.weekStart.toString();
        const expanded = expandedGroups[key];
        const isCurrentWeek = Date.now() >= group.weekStart && Date.now() <= group.weekStart + 7 * 86400000;
        return (
          <div key={group.weekStart} className="border overflow-hidden animate-slide-up"
            style={{ background: '#fff', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)' }}>
            <button className="w-full px-4 py-3 flex justify-between items-center"
              style={{ background: isCurrentWeek ? 'rgba(27,67,50,0.05)' : '#fafafa' }}
              onClick={() => toggleGroup(key)}>
              <div>
                <span className="font-bold text-gray-800 text-sm font-sans">
                  {isCurrentWeek ? t.thisWeek : `${formatEthiopian(group.weekStart)} – ${formatEthiopian(weekEnd.getTime())}`}
                </span>
                <div className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                  {group.transactions.length} {t.entries}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className={`text-sm font-black ${stats.profit >= 0 ? 'text-green-700' : 'text-red-500'}`}>
                    {stats.hasCost ? `${stats.profit >= 0 ? '+' : ''}${fmt(stats.profit)}` : fmt(stats.revenue)} {t.birr}
                  </div>
                  <div className="text-xs" style={{ color: '#9ca3af' }}>{stats.hasCost ? t.profit : t.revenue}</div>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {expanded && (
              <div className="divide-y" style={{ borderColor: 'var(--color-border-light)' }}>
                {group.transactions.map(tx => (
                  <TxRow key={tx.id} tx={tx} onEdit={onEdit} t={t} lang={lang} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ hasSearch, searchQuery, t }) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Search className="w-12 h-12 mb-3" style={{ color: '#e5e7eb' }} />
        <p className="text-base font-medium" style={{ color: '#9ca3af' }}>{t.noSearchResults} "{searchQuery}"</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Calendar className="w-12 h-12 mb-3" style={{ color: '#e5e7eb' }} />
      <p className="text-base font-medium" style={{ color: '#9ca3af' }}>{t.noSalesThisPeriod}</p>
    </div>
  );
}

function ActorAuditSummary({ rows, t }) {
  if (!rows.length) return null;

  return (
    <div className="space-y-2">
      <div className="px-1">
        <h3 className="text-sm font-black text-gray-800">Staff sales audit</h3>
        <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
          Review sales, transaction count, and item volume by the person who entered each record.
        </p>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="px-4 py-3 border"
            style={{ background: '#fff', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xs)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-900">{row.label}</p>
                <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                  {row.transactionCount} {t.entries} · {row.salesCount} sales · {row.itemsSold} items sold
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-black text-green-700">{fmt(row.salesAmount)} {t.birr}</p>
                {row.expensesAmount > 0 && (
                  <p className="text-xs text-red-500">Spent {fmt(row.expensesAmount)} {t.birr}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryView({ transactions, onEdit }) {
  const { t, lang } = useLang();
  const [period, setPeriod] = useState('day');
  const [grouping, setGrouping] = useState('day');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedMonths, setExpandedMonths] = useState({}); // Fix C: month bucket expansion
  const [searchQuery, setSearchQuery] = useState('');
  const [actorFilter, setActorFilter] = useState('');

  const toggleGroup = (key) => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  // Fix C: takes the current EFFECTIVE expanded state (which may come from a
  // default-open rule) so the first tap flips correctly instead of re-opening.
  const toggleMonth = (key, currentlyExpanded) =>
    setExpandedMonths(prev => ({ ...prev, [key]: !currentlyExpanded }));

  const actorOptions = buildActorOptions(transactions);
  const filteredTransactions = transactions.filter(tx => (
    matchesSearch(tx, searchQuery) && matchesActor(tx, actorFilter)
  ));
  const actorAuditRows = buildActorAuditSummary(filteredTransactions);

  const dayGroups = groupByDay(filteredTransactions);
  const weekGroups = groupByWeek(filteredTransactions);

  const weekTransactions = filterCurrentWeek(filteredTransactions);
  const monthTransactions = filterCurrentMonth(filteredTransactions);

  const weekDayGroups = groupByDay(weekTransactions);
  const monthDayGroups = groupByDay(monthTransactions);

  const periods = [
    { id: 'day',   label: t.periodDay },
    { id: 'week',  label: t.periodWeek },
    { id: 'month', label: t.periodMonth },
  ];

  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div className="space-y-4 pb-4">
      <h2 className="text-lg font-black text-gray-800 px-1 font-serif">{t.report}</h2>

      <div className="flex gap-1.5 p-1" style={{ background: 'rgba(27,67,50,0.08)', borderRadius: 'var(--radius-md)' }}>
        {periods.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className="flex-1 py-2 text-sm font-bold transition-all press-scale"
            style={{
              background: period === p.id ? '#1B4332' : 'transparent',
              color: period === p.id ? '#fff' : '#6b7280',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#9ca3af' }} />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border outline-none transition-all"
          style={{
            borderColor: hasSearch ? '#1B4332' : 'var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-xs)',
            color: '#374151',
          }}
        />
        {hasSearch && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 press-scale"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" style={{ color: '#9ca3af' }} />
          </button>
        )}
      </div>

      {actorOptions.length > 0 && (
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5">Filter by seller</label>
          <select
            value={actorFilter}
            onChange={e => setActorFilter(e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-white border outline-none"
            style={{
              borderColor: actorFilter ? '#1B4332' : 'var(--color-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-xs)',
              color: '#374151',
            }}
          >
            <option value="">All sellers</option>
            {actorOptions.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <ActorAuditSummary rows={actorAuditRows} t={t} />

      {period === 'day' && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 flex-shrink-0">{t.groupBy}</span>
            <div className="flex gap-1.5 flex-1">
              {[['day', t.daily], ['week', t.weekly]].map(([val, lbl]) => (
                <button key={val} onClick={() => setGrouping(val)}
                  className="px-3 py-1 text-xs font-bold transition-all press-scale"
                  style={{
                    background: grouping === val ? '#1B4332' : '#f0f0f0',
                    color: grouping === val ? '#fff' : '#6b7280',
                    borderRadius: '99px',
                  }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            hasSearch ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="w-12 h-12 mb-4" style={{ color: '#e5e7eb' }} />
                <p className="text-base font-medium" style={{ color: '#9ca3af' }}>{t.noSearchResults} "{searchQuery}"</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Calendar className="w-16 h-16 mb-4" style={{ color: '#e5e7eb' }} />
                <p className="text-lg font-medium" style={{ color: '#9ca3af' }}>{t.noRecords}</p>
                <p className="text-sm mt-1" style={{ color: '#d1d5db' }}>{t.startRecording}</p>
              </div>
            )
          ) : grouping === 'day' ? (
            /* Fix C: month-bucketed so we never render all days at once. */
            <MonthBucketedDayList
              dayGroups={dayGroups}
              onEdit={onEdit}
              expandedGroups={expandedGroups}
              toggleGroup={toggleGroup}
              expandedMonths={expandedMonths}
              toggleMonth={toggleMonth}
              t={t}
              lang={lang}
            />
          ) : (
            <WeekGroupList
              groups={weekGroups}
              onEdit={onEdit}
              expandedGroups={expandedGroups}
              toggleGroup={toggleGroup}
              t={t}
              lang={lang}
            />
          )}
        </>
      )}

      {period === 'week' && (
        <div className="space-y-4">
          {weekTransactions.length === 0 ? (
            <EmptyState hasSearch={hasSearch} searchQuery={searchQuery} t={t} />
          ) : (
            <>
              <StatsSummary transactions={weekTransactions} />
              <DayGroupList
                groups={weekDayGroups}
                onEdit={onEdit}
                expandedGroups={expandedGroups}
                toggleGroup={toggleGroup}
                t={t}
              />
              <TopProductsList transactions={weekTransactions} title={t.topProductsWeek} />
            </>
          )}
        </div>
      )}

      {period === 'month' && (
        <div className="space-y-4">
          {monthTransactions.length === 0 ? (
            <EmptyState hasSearch={hasSearch} searchQuery={searchQuery} t={t} />
          ) : (
            <>
              <StatsSummary transactions={monthTransactions} />
              <DayGroupList
                groups={monthDayGroups}
                onEdit={onEdit}
                expandedGroups={expandedGroups}
                toggleGroup={toggleGroup}
                t={t}
              />
              <TopProductsList transactions={monthTransactions} title={t.topProductsMonth} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default HistoryView;



