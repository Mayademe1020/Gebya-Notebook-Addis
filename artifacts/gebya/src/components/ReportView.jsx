// ReportView.jsx — Commit R · the redesigned Report tab.
//
// Replaces HistoryView at the Report tab slot, but keeps HistoryView's
// transaction log embedded as the collapsible "ALL HISTORY" section.
//
// Structure (top → bottom):
//   1. RIGHT NOW   — net cash · dubie owed · dubie I owe + overdue chase row
//   2. TODAY        — today's net + delta vs yesterday + top sale + collected
//   3. THIS WEEK    — week net + delta vs last week + best day + top customer/product
//   4. THIS MONTH   — month net + top 5 customers + top 5 products + dubie movement
//   5. ALL HISTORY  — collapsed by default; embeds HistoryView for the power-user log
//   6. SHARE / EXPORT — Telegram-share weekly summary, CSV/JSON export for current period
//
// Designed to answer the three shopkeeper questions:
//   🌅 morning  — "Where do I stand? Who do I need to chase?"
//   ☀️ midday   — "How's today going?"
//   🌆 evening  — "What did I make? Did anyone pay back?"

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronUp, Download, Share2,
  Wallet, Users, Truck, TrendingUp, Calendar as CalendarIcon, Crown, Package, Bell,
  Eye, EyeOff,
} from 'lucide-react';
import { useLang } from '../context/LangContext';
import { usePrivacy } from '../context/PrivacyContext';
import { fmt } from '../utils/numformat';
import { formatEthiopian, getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';

const HistoryView = lazy(() => import('./HistoryView'));

// ─── time helpers ────────────────────────────────────────────────

function startOfDay(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfWeek(ms = Date.now()) {
  const d = new Date(ms);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7)); // Monday
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
  return ts >= from && ts < to;
}

// ─── stats ───────────────────────────────────────────────────────

function netOf(transactions, from = -Infinity, to = Infinity) {
  let sales = 0;
  let expenses = 0;
  for (const tx of transactions) {
    if (tx.created_at < from || tx.created_at >= to) continue;
    if (tx.type === 'sale') sales += Number(tx.amount || 0);
    else if (tx.type === 'expense') expenses += Number(tx.amount || 0);
  }
  return { sales, expenses, net: sales - expenses };
}

function collectedIn(ledgerTransactions, from, to) {
  let total = 0;
  for (const tx of ledgerTransactions) {
    if (tx.type !== CUSTOMER_TRANSACTION_TYPES.PAYMENT) continue;
    if (tx.created_at < from || tx.created_at >= to) continue;
    total += Number(tx.amount || 0);
  }
  return total;
}

function newCreditsIn(ledgerTransactions, from, to) {
  let total = 0;
  for (const tx of ledgerTransactions) {
    if (tx.type !== CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD) continue;
    if (tx.created_at < from || tx.created_at >= to) continue;
    total += Number(tx.amount || 0);
  }
  return total;
}

function bestSaleOf(transactions, from, to) {
  let best = null;
  for (const tx of transactions) {
    if (tx.type !== 'sale') continue;
    if (tx.created_at < from || tx.created_at >= to) continue;
    if (!best || tx.amount > best.amount) best = tx;
  }
  return best;
}

// Bucket transactions by day-of-week (Mon..Sun) inside a window, return the
// day with the highest net.
function bestDayOfWeek(transactions, from, to, lang) {
  const buckets = [0, 0, 0, 0, 0, 0, 0]; // Mon..Sun
  for (const tx of transactions) {
    if (tx.created_at < from || tx.created_at >= to) continue;
    const day = new Date(tx.created_at).getDay(); // Sun=0..Sat=6
    const idx = (day + 6) % 7; // Mon=0..Sun=6
    if (tx.type === 'sale') buckets[idx] += Number(tx.amount || 0);
    else if (tx.type === 'expense') buckets[idx] -= Number(tx.amount || 0);
  }
  let maxIdx = 0;
  let maxVal = -Infinity;
  buckets.forEach((v, i) => { if (v > maxVal) { maxVal = v; maxIdx = i; } });
  const dayNames = lang === 'am'
    ? ['ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ', 'እሁድ']
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (maxVal <= 0) return null;
  return { name: dayNames[maxIdx], net: maxVal };
}

// Top customers by SALES VOLUME (different from "by debt" used elsewhere).
// We sum credits + payments in the window per customer.
function topCustomersByVolume(ledgerTransactions, customers, from, to, limit = 5) {
  const byCust = new Map();
  const customerLookup = customers instanceof Map
    ? customers
    : new Map((customers || []).map((customer) => [customer.id, customer]));
  for (const tx of ledgerTransactions) {
    if (tx.created_at < from || tx.created_at >= to) continue;
    const id = tx.customer_id;
    if (!id) continue;
    byCust.set(id, (byCust.get(id) || 0) + Number(tx.amount || 0));
  }
  const rows = Array.from(byCust.entries())
    .map(([id, total]) => {
      const c = customerLookup.get(id);
      return c ? { id, name: c.display_name, total } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
  return rows;
}

function createNetBucket() {
  return { sales: 0, expenses: 0, net: 0 };
}

function createLedgerBucket() {
  return { collected: 0, newCredits: 0 };
}

function buildReportBuckets(transactions = [], ledgerTransactions = [], windows = {}) {
  const nets = {};
  const ledger = {};
  const entries = Object.entries(windows);

  for (const [key] of entries) {
    nets[key] = createNetBucket();
    ledger[key] = createLedgerBucket();
  }

  for (const tx of transactions) {
    const ts = Number(tx.created_at || 0);
    for (const [key, range] of entries) {
      if (!inRange(ts, range.from, range.to)) continue;
      if (tx.type === 'sale') nets[key].sales += Number(tx.amount || 0);
      else if (tx.type === 'expense') nets[key].expenses += Number(tx.amount || 0);
    }
  }

  for (const tx of ledgerTransactions) {
    const ts = Number(tx.created_at || 0);
    for (const [key, range] of entries) {
      if (!inRange(ts, range.from, range.to)) continue;
      if (tx.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT) ledger[key].collected += Number(tx.amount || 0);
      else if (tx.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD) ledger[key].newCredits += Number(tx.amount || 0);
    }
  }

  for (const key of Object.keys(nets)) {
    nets[key].net = nets[key].sales - nets[key].expenses;
  }

  return { nets, ledger };
}

// Top products by quantity sold (sale rows only).
function topProductsByQty(transactions, from, to, limit = 5) {
  const map = new Map();
  for (const tx of transactions) {
    if (tx.type !== 'sale') continue;
    if (tx.created_at < from || tx.created_at >= to) continue;
    const name = (tx.item_name || '').trim();
    if (!name) continue;
    const qty = Number(tx.quantity || 1);
    const entry = map.get(name) || { name, qty: 0, revenue: 0 };
    entry.qty += qty;
    entry.revenue += Number(tx.amount || 0);
    map.set(name, entry);
  }
  return Array.from(map.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

// ─── export helpers ──────────────────────────────────────────────

function buildWeeklySummaryText({
  shopName, weekNet, weekSales, weekExpenses, lastWeekNet,
  weekCollected, weekNewCredits, weekBestDay, weekTopCustomer, weekTopProduct,
  totalOwed, totalIOwe, overdueCount, lang,
}) {
  const delta = lastWeekNet
    ? Math.round(((weekNet - lastWeekNet) / Math.abs(lastWeekNet)) * 100)
    : null;
  const trend = delta != null
    ? ` (${delta >= 0 ? '▲' : '▼'} ${delta >= 0 ? '+' : ''}${delta}%)`
    : '';

  if (lang === 'am') {
    const lines = [
      `📊 ${shopName || 'ሱቅ'} — የሳምንት አጠቃላይ`,
      `📅 ${getCurrentEthiopianDate()}`,
      '',
      `💰 ቀሪ: ${weekNet >= 0 ? '+' : ''}${fmt(weekNet)} ብር${trend}`,
      `   ሽያጭ ${fmt(weekSales)} · ወጪ ${fmt(weekExpenses)}`,
    ];
    if (weekCollected > 0) lines.push(`✓ የዱቤ መሰብሰብ: ${fmt(weekCollected)} ብር`);
    if (weekNewCredits > 0) lines.push(`+ አዲስ ዱቤ: ${fmt(weekNewCredits)} ብር`);
    if (weekBestDay) lines.push(`🏆 ምርጥ ቀን: ${weekBestDay.name} (${fmt(weekBestDay.net)} ብር)`);
    if (weekTopCustomer) lines.push(`👑 ምርጥ ደንበኛ: ${weekTopCustomer.name} (${fmt(weekTopCustomer.total)} ብር)`);
    if (weekTopProduct) lines.push(`📦 ምርጥ ምርት: ${weekTopProduct.name} × ${weekTopProduct.qty}`);
    lines.push('');
    lines.push(`📒 ዱቤ ለእኔ: ${fmt(totalOwed)} ብር${overdueCount > 0 ? ` (${overdueCount} የዘገዩ)` : ''}`);
    lines.push(`📋 ለመክፈል ላለኝ: ${fmt(totalIOwe)} ብር`);
    lines.push('');
    lines.push('— Gebya · የንግድ ማስታወሻ');
    return lines.join('\n');
  }

  const lines = [
    `📊 ${shopName || 'Shop'} — Weekly summary`,
    `📅 ${getCurrentEthiopianDate()}`,
    '',
    `💰 Net: ${weekNet >= 0 ? '+' : ''}${fmt(weekNet)} birr${trend}`,
    `   Sales ${fmt(weekSales)} · Spent ${fmt(weekExpenses)}`,
  ];
  if (weekCollected > 0) lines.push(`✓ Dubie collected: ${fmt(weekCollected)} birr`);
  if (weekNewCredits > 0) lines.push(`+ New credits: ${fmt(weekNewCredits)} birr`);
  if (weekBestDay) lines.push(`🏆 Best day: ${weekBestDay.name} (${fmt(weekBestDay.net)} birr)`);
  if (weekTopCustomer) lines.push(`👑 Top customer: ${weekTopCustomer.name} (${fmt(weekTopCustomer.total)} birr)`);
  if (weekTopProduct) lines.push(`📦 Top product: ${weekTopProduct.name} × ${weekTopProduct.qty}`);
  lines.push('');
  lines.push(`📒 Dubie owed to me: ${fmt(totalOwed)} birr${overdueCount > 0 ? ` (${overdueCount} overdue)` : ''}`);
  lines.push(`📋 I owe suppliers: ${fmt(totalIOwe)} birr`);
  lines.push('');
  lines.push('— Gebya · የንግድ ማስታወሻ');
  return lines.join('\n');
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
  const header = ['date', 'type', 'amount', 'item_name', 'customer', 'note', 'quantity'];
  const rows = [header.join(',')];
  const custName = (id) => {
    const c = customers.find(c => c.id === id);
    return c?.display_name || '';
  };
  for (const tx of transactions) {
    if (tx.created_at < from || tx.created_at >= to) continue;
    rows.push([
      new Date(tx.created_at).toISOString(),
      tx.type,
      Number(tx.amount || 0),
      csvEscape(tx.item_name),
      csvEscape(tx.customer_name),
      csvEscape(tx.note),
      Number(tx.quantity || 1),
    ].join(','));
  }
  for (const tx of ledgerTransactions) {
    if (tx.created_at < from || tx.created_at >= to) continue;
    rows.push([
      new Date(tx.created_at).toISOString(),
      tx.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT ? 'dubie_payment' : 'dubie_credit',
      Number(tx.amount || 0),
      csvEscape(tx.item_note),
      csvEscape(custName(tx.customer_id)),
      '',
      tx.quantity || '',
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
    transactions: transactions.filter(tx => tx.created_at >= from && tx.created_at < to),
    customer_transactions: ledgerTransactions.filter(tx => tx.created_at >= from && tx.created_at < to),
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

// ─── UI · subcomponents ──────────────────────────────────────────

function SectionCard({ children, style }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #ece6d6',
        borderRadius: 14,
        padding: 14,
        boxShadow: '0 2px 8px -4px rgba(0,0,0,0.05)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ icon, label, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
      <span style={{ fontSize: '0.95rem' }}>{icon}</span>
      <p style={{
        fontSize: '0.7rem', fontWeight: 800,
        color: '#6b7280', letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}>
        {label}
      </p>
      {sub && (
        <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500 }}>
          · {sub}
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, color, sub, big }) {
  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <p style={{
        fontSize: '0.58rem', fontWeight: 800,
        color: '#9ca3af', letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: 'Manrope, system-ui, sans-serif',
        fontSize: big ? '1.55rem' : '1.1rem',
        fontWeight: 800, lineHeight: 1.05,
        marginTop: 3,
        color: color || '#1f2937',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.01em',
      }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: '0.62rem', color: '#9ca3af', marginTop: 2 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function TrendChip({ delta, lang }) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const up = delta >= 0;
  const color = up ? '#15803d' : '#dc2626';
  const bg = up ? '#d1fae5' : '#fee2e2';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      background: bg, color,
      padding: '2px 6px', borderRadius: 999,
      fontSize: '0.65rem', fontWeight: 800,
      letterSpacing: '0.02em',
    }}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {up ? '+' : ''}{delta}%
      <span style={{ fontWeight: 600, marginLeft: 1 }}>
        {lang === 'am' ? 'ካለፈው' : 'vs prev'}
      </span>
    </span>
  );
}

// ─── UI · main sections ──────────────────────────────────────────

function RightNowSection({ todayNet, totalOwed, totalIOwe, overdueCount, overdueAmount, onChaseOverdue, lang, hidden }) {
  return (
    <SectionCard style={{
      background: 'linear-gradient(135deg, #fafaf5 0%, #fff 100%)',
      borderColor: '#e8e2d8',
    }}>
      <SectionLabel
        icon="🌅"
        label={lang === 'am' ? 'አሁን ላይ' : 'Right now'}
        sub={lang === 'am' ? 'የተጠቃላይ ሁኔታ' : 'Standing'}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <Stat
          label={lang === 'am' ? 'የዛሬ ቀሪ' : 'Net today'}
          value={hidden ? '••••' : `${todayNet >= 0 ? '+' : ''}${fmt(todayNet)}`}
          color={todayNet >= 0 ? '#15803d' : '#dc2626'}
          sub={lang === 'am' ? 'ብር' : 'birr'}
        />
        <Stat
          label={lang === 'am' ? 'ለእኔ ይከፍላሉ' : 'Owed me'}
          value={hidden ? '••••' : fmt(totalOwed)}
          color={totalOwed > 0 ? '#b8842c' : '#9ca3af'}
          sub={lang === 'am' ? 'ብር' : 'birr'}
        />
        <Stat
          label={lang === 'am' ? 'ለመክፈል' : 'I owe'}
          value={hidden ? '••••' : (totalIOwe > 0 ? `−${fmt(totalIOwe)}` : '0')}
          color={totalIOwe > 0 ? '#dc2626' : '#9ca3af'}
          sub={lang === 'am' ? 'ብር' : 'birr'}
        />
      </div>
      {/* Overdue chase strip */}
      {overdueCount > 0 && (
        <button
          type="button"
          onClick={onChaseOverdue}
          className="press-scale"
          style={{
            marginTop: 12,
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 10,
            padding: '10px 12px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <Bell className="w-4 h-4 flex-shrink-0" style={{ color: '#dc2626' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 800, color: '#991b1b' }}>
              {lang === 'am'
                ? `${overdueCount} ደንበኛ የዘገዩ — ${fmt(overdueAmount)} ብር`
                : `${overdueCount} customer${overdueCount === 1 ? '' : 's'} overdue — ${fmt(overdueAmount)} birr`}
            </p>
            <p style={{ fontSize: '0.65rem', color: '#dc2626', marginTop: 1 }}>
              {lang === 'am' ? 'ለማስታወሻ ይንኩ' : 'Tap to chase'}
            </p>
          </div>
          <span style={{ fontSize: '0.95rem', color: '#dc2626' }}>→</span>
        </button>
      )}
    </SectionCard>
  );
}

function TodaySection({ todayNet, todaySales, todayExpenses, deltaPct, collected, newCredits, bestSale, lang, hidden }) {
  return (
    <SectionCard>
      <SectionLabel icon="☀️" label={lang === 'am' ? 'ዛሬ' : 'Today'} sub={getCurrentEthiopianDate()} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'Manrope, system-ui, sans-serif',
          fontSize: '1.85rem', fontWeight: 800, lineHeight: 1,
          color: todayNet >= 0 ? '#15803d' : '#dc2626',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}>
          {hidden ? '••••' : `${todayNet >= 0 ? '+' : ''}${fmt(todayNet)}`}
        </span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af' }}>
          {lang === 'am' ? 'ብር' : 'birr'}
        </span>
        <TrendChip delta={deltaPct} lang={lang} />
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: '0.78rem' }}>
        <span style={{ color: '#16a34a', fontWeight: 600 }}>
          {lang === 'am' ? 'ሽያጭ' : 'Sales'} {hidden ? '••••' : fmt(todaySales)}
        </span>
        <span style={{ color: '#dc2626', fontWeight: 600 }}>
          {lang === 'am' ? 'ወጪ' : 'Spent'} {hidden ? '••••' : fmt(todayExpenses)}
        </span>
        {collected > 0 && (
          <span style={{ color: '#b8842c', fontWeight: 600 }}>
            {lang === 'am' ? 'ተሰብስቧል' : 'Collected'} {hidden ? '••••' : fmt(collected)}
          </span>
        )}
      </div>
      {bestSale && (
        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          background: '#fafaf5',
          border: '1px solid #ece6d6',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Crown className="w-3.5 h-3.5" style={{ color: '#b8842c', flexShrink: 0 }} />
          <p style={{ fontSize: '0.72rem', flex: 1, minWidth: 0 }}>
            <span style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ምርጥ ሽያጭ' : 'Top sale'}:{' '}
            </span>
            <strong style={{ color: '#1f2937' }}>
              {bestSale.item_name || (lang === 'am' ? 'ያልተሰየመ' : 'Untitled')}
            </strong>
            <span style={{ color: '#9ca3af', marginLeft: 5 }}>
              {fmt(bestSale.amount)} {lang === 'am' ? 'ብር' : 'birr'}
            </span>
          </p>
        </div>
      )}
      {newCredits > 0 && (
        <p style={{ fontSize: '0.7rem', color: '#b8842c', marginTop: 6 }}>
          {lang === 'am' ? '+ አዲስ ዱቤ ዛሬ' : '+ New credit today'}:{' '}
          <strong>{hidden ? '••••' : fmt(newCredits)} {lang === 'am' ? 'ብር' : 'birr'}</strong>
        </p>
      )}
    </SectionCard>
  );
}

function ThisWeekSection({ weekNet, weekSales, weekExpenses, deltaPct, bestDay, topCustomer, topProduct, lang, hidden }) {
  return (
    <SectionCard>
      <SectionLabel icon="📅" label={lang === 'am' ? 'በዚህ ሳምንት' : 'This week'} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'Manrope, system-ui, sans-serif',
          fontSize: '1.55rem', fontWeight: 800, lineHeight: 1,
          color: weekNet >= 0 ? '#15803d' : '#dc2626',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {hidden ? '••••' : `${weekNet >= 0 ? '+' : ''}${fmt(weekNet)}`}
        </span>
        <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
          {lang === 'am' ? 'ብር' : 'birr'}
        </span>
        <TrendChip delta={deltaPct} lang={lang} />
      </div>
      <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>
        {lang === 'am' ? 'ሽያጭ' : 'Sales'} {hidden ? '••••' : fmt(weekSales)} ·{' '}
        {lang === 'am' ? 'ወጪ' : 'Spent'} {hidden ? '••••' : fmt(weekExpenses)}
      </p>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bestDay && (
          <InsightRow
            icon="🏆"
            label={lang === 'am' ? 'ምርጥ ቀን' : 'Best day'}
            value={bestDay.name}
            sub={`${fmt(bestDay.net)} ${lang === 'am' ? 'ብር' : 'birr'}`}
          />
        )}
        {topCustomer && (
          <InsightRow
            icon="👑"
            label={lang === 'am' ? 'ምርጥ ደንበኛ' : 'Top customer'}
            value={topCustomer.name}
            sub={`${fmt(topCustomer.total)} ${lang === 'am' ? 'ብር' : 'birr'}`}
          />
        )}
        {topProduct && (
          <InsightRow
            icon="📦"
            label={lang === 'am' ? 'ምርጥ ምርት' : 'Top product'}
            value={topProduct.name}
            sub={`× ${topProduct.qty} · ${fmt(topProduct.revenue)} ${lang === 'am' ? 'ብር' : 'birr'}`}
          />
        )}
      </div>
    </SectionCard>
  );
}

function ThisMonthSection({ monthNet, monthSales, monthExpenses, deltaPct, topCustomers, topProducts, monthCollected, monthNewCredits, lang, hidden }) {
  return (
    <SectionCard>
      <SectionLabel
        icon="🗓"
        label={lang === 'am' ? 'በዚህ ወር' : 'This month'}
        sub={getCurrentEthiopianDate().split('-').slice(1).join('-')}
      />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'Manrope, system-ui, sans-serif',
          fontSize: '1.55rem', fontWeight: 800, lineHeight: 1,
          color: monthNet >= 0 ? '#15803d' : '#dc2626',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {hidden ? '••••' : `${monthNet >= 0 ? '+' : ''}${fmt(monthNet)}`}
        </span>
        <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
          {lang === 'am' ? 'ብር' : 'birr'}
        </span>
        <TrendChip delta={deltaPct} lang={lang} />
      </div>
      <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>
        {lang === 'am' ? 'ሽያጭ' : 'Sales'} {hidden ? '••••' : fmt(monthSales)} ·{' '}
        {lang === 'am' ? 'ወጪ' : 'Spent'} {hidden ? '••••' : fmt(monthExpenses)}
      </p>
      {(monthCollected > 0 || monthNewCredits > 0) && (
        <div style={{
          marginTop: 8,
          padding: '8px 10px',
          background: '#fafaf5',
          border: '1px solid #ece6d6',
          borderRadius: 8,
          display: 'flex', gap: 14, flexWrap: 'wrap',
        }}>
          {monthCollected > 0 && (
            <span style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 700 }}>
              ✓ {lang === 'am' ? 'ተሰብስቧል' : 'Collected'} {hidden ? '••••' : fmt(monthCollected)}
            </span>
          )}
          {monthNewCredits > 0 && (
            <span style={{ fontSize: '0.72rem', color: '#b8842c', fontWeight: 700 }}>
              + {lang === 'am' ? 'አዲስ ዱቤ' : 'New credit'} {hidden ? '••••' : fmt(monthNewCredits)}
            </span>
          )}
        </div>
      )}
      {topCustomers.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{
            fontSize: '0.6rem', fontWeight: 800,
            color: '#9ca3af', letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: 5,
          }}>
            <Users className="w-3 h-3 inline mb-0.5" /> {lang === 'am' ? 'ምርጥ 5 ደንበኞች' : 'Top 5 customers'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {topCustomers.map((c, i) => (
              <CompactRow key={c.id} rank={i + 1} name={c.name} value={`${fmt(c.total)} ${lang === 'am' ? 'ብር' : 'birr'}`} hidden={hidden} />
            ))}
          </div>
        </div>
      )}
      {topProducts.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{
            fontSize: '0.6rem', fontWeight: 800,
            color: '#9ca3af', letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: 5,
          }}>
            <Package className="w-3 h-3 inline mb-0.5" /> {lang === 'am' ? 'ምርጥ 5 ምርቶች' : 'Top 5 products'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {topProducts.map((p, i) => (
              <CompactRow key={p.name} rank={i + 1} name={p.name} value={`× ${p.qty}`} sub={`${fmt(p.revenue)}`} hidden={hidden} />
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function InsightRow({ icon, label, value, sub }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px',
      background: '#fafaf5',
      border: '1px solid #ece6d6',
      borderRadius: 8,
    }}>
      <span style={{ fontSize: '0.95rem', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: '0.6rem', fontWeight: 700,
          color: '#9ca3af', letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          {label}
        </p>
        <p style={{
          fontSize: '0.85rem', fontWeight: 700, color: '#1f2937',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value}
        </p>
      </div>
      <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>
        {sub}
      </span>
    </div>
  );
}

function CompactRow({ rank, name, value, sub, hidden }) {
  const medals = ['🥇', '🥈', '🥉'];
  const medal = medals[rank - 1] || `${rank}.`;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 0',
    }}>
      <span style={{ fontSize: '0.8rem', width: 22, textAlign: 'center', flexShrink: 0 }}>{medal}</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: '0.78rem', fontWeight: 600, color: '#1f2937',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {name}
      </span>
      <span style={{
        fontSize: '0.72rem', fontWeight: 700, color: '#1B4332',
        background: 'rgba(27,67,50,0.08)',
        padding: '2px 8px', borderRadius: 999,
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {hidden ? '••••' : value}
      </span>
      {sub && !hidden && (
        <span style={{ fontSize: '0.62rem', color: '#9ca3af', flexShrink: 0 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function AllHistoryCollapsible({ transactions, onEdit, lang }) {
  const hasPhotoTransactions = useMemo(
    () => transactions.some(tx => !!tx.photo || (Array.isArray(tx.photos) && tx.photos.length > 0)),
    [transactions]
  );
  const [open, setOpen] = useState(() => hasPhotoTransactions);

  useEffect(() => {
    if (hasPhotoTransactions) setOpen(true);
  }, [hasPhotoTransactions]);

  return (
    <SectionCard>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="press-scale"
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', padding: 0,
          cursor: 'pointer',
        }}
      >
        <SectionLabel
          icon="📜"
          label={lang === 'am' ? 'ሁሉም መዝገብ' : 'All history'}
          sub={hasPhotoTransactions
            ? (lang === 'am' ? 'ፎቶ ያላቸው መዝገቦች እዚህ ይታያሉ' : 'Photo records shown here')
            : (lang === 'am' ? 'ሽያጭ + ወጪ ሙሉ ዝርዝር' : 'Full sales + expenses log')}
        />
        {open ? <ChevronUp className="w-4 h-4" style={{ color: '#6b7280' }} />
              : <ChevronDown className="w-4 h-4" style={{ color: '#6b7280' }} />}
      </button>
      {open && (
        <div style={{ marginTop: 4 }}>
          <Suspense fallback={
            <div style={{ padding: 12, color: '#9ca3af', fontSize: '0.85rem' }}>
              {lang === 'am' ? 'እየጫነ…' : 'Loading…'}
            </div>
          }>
            <HistoryView transactions={transactions} onEdit={onEdit} />
          </Suspense>
        </div>
      )}
    </SectionCard>
  );
}

function ShareExportSection({ onShareWeekly, onExportCSV, onExportJSON, exportRange, setExportRange, lang }) {
  const ranges = [
    { id: 'week', label: lang === 'am' ? 'ሳምንት' : 'Week' },
    { id: 'month', label: lang === 'am' ? 'ወር' : 'Month' },
    { id: 'all', label: lang === 'am' ? 'ሁሉም' : 'All' },
  ];
  return (
    <SectionCard>
      <SectionLabel
        icon="📤"
        label={lang === 'am' ? 'አጋራ ወይም አውጣ' : 'Share or export'}
      />
      <button
        type="button"
        onClick={onShareWeekly}
        className="press-scale"
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: '#1B4332', color: '#fff',
          padding: '12px', borderRadius: 10,
          fontSize: '0.9rem', fontWeight: 800,
          border: 'none', cursor: 'pointer',
          marginBottom: 10,
        }}
      >
        <Share2 className="w-4 h-4" />
        {lang === 'am' ? 'የሳምንት ሪፖርት ላክ' : 'Share weekly summary'}
      </button>

      <p style={{
        fontSize: '0.6rem', fontWeight: 800,
        color: '#9ca3af', letterSpacing: '0.08em',
        textTransform: 'uppercase', marginBottom: 5,
      }}>
        <Download className="w-3 h-3 inline mb-0.5" /> {lang === 'am' ? 'አውጣ' : 'Export'}
      </p>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {ranges.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => setExportRange(r.id)}
            className="press-scale"
            style={{
              flex: 1,
              padding: '6px 8px',
              background: exportRange === r.id ? '#1B4332' : '#f3f4f6',
              color: exportRange === r.id ? '#fff' : '#6b7280',
              border: 'none', borderRadius: 8,
              fontSize: '0.72rem', fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onExportCSV}
          className="press-scale"
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            background: '#fff', color: '#1B4332',
            border: '1.5px solid #1B4332', borderRadius: 8,
            padding: '8px 10px',
            fontSize: '0.78rem', fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          <Download className="w-3.5 h-3.5" />
          CSV
        </button>
        <button
          type="button"
          onClick={onExportJSON}
          className="press-scale"
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            background: '#fff', color: '#1B4332',
            border: '1.5px solid #1B4332', borderRadius: 8,
            padding: '8px 10px',
            fontSize: '0.78rem', fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          <Download className="w-3.5 h-3.5" />
          JSON
        </button>
      </div>
      <p style={{ fontSize: '0.62rem', color: '#9ca3af', marginTop: 6, textAlign: 'center' }}>
        🔒 {lang === 'am' ? 'ፋይል በስልክዎ ይወርዳል' : 'File downloads to your phone'}
      </p>
    </SectionCard>
  );
}

// ─── main component ──────────────────────────────────────────────

function ReportView({
  transactions = [],
  ledgerTransactions = [],
  enrichedCustomerSummaries = [],
  customerSummaries = [],
  supplierSummaries = [],
  customers = [],
  suppliers = [],
  shopProfile,
  onEdit,
  onChaseOverdue,
  onShareReport,
}) {
  const { lang, t } = useLang();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const [exportRange, setExportRange] = useState('month');

  // ─── time windows ───
  const now = Date.now();
  const todayStart = startOfDay(now);
  const todayEnd = todayStart + 86400000;
  const yesterdayStart = todayStart - 86400000;
  const weekStart = startOfWeek(now);
  const weekEnd = weekStart + 7 * 86400000;
  const lastWeekStart = weekStart - 7 * 86400000;
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const lastMonthEnd = monthStart;
  const lastMonthStart = startOfMonth(monthStart - 1);

  // ─── derived stats ───
  const reportWindows = useMemo(() => ({
    today: { from: todayStart, to: todayEnd },
    yesterday: { from: yesterdayStart, to: todayStart },
    week: { from: weekStart, to: weekEnd },
    lastWeek: { from: lastWeekStart, to: weekStart },
    month: { from: monthStart, to: monthEnd },
    lastMonth: { from: lastMonthStart, to: lastMonthEnd },
  }), [
    todayStart,
    todayEnd,
    yesterdayStart,
    weekStart,
    weekEnd,
    lastWeekStart,
    monthStart,
    monthEnd,
    lastMonthStart,
    lastMonthEnd,
  ]);

  const reportBuckets = useMemo(
    () => buildReportBuckets(transactions, ledgerTransactions, reportWindows),
    [transactions, ledgerTransactions, reportWindows]
  );

  const today = reportBuckets.nets.today;
  const yesterday = reportBuckets.nets.yesterday;
  const week = reportBuckets.nets.week;
  const lastWeek = reportBuckets.nets.lastWeek;
  const month = reportBuckets.nets.month;
  const lastMonth = reportBuckets.nets.lastMonth;

  const todayCollected = reportBuckets.ledger.today.collected;
  const todayNewCredits = reportBuckets.ledger.today.newCredits;
  const weekCollected = reportBuckets.ledger.week.collected;
  const weekNewCredits = reportBuckets.ledger.week.newCredits;
  const monthCollected = reportBuckets.ledger.month.collected;
  const monthNewCredits = reportBuckets.ledger.month.newCredits;

  const bestSale = useMemo(() => bestSaleOf(transactions, todayStart, todayEnd), [transactions, todayStart, todayEnd]);
  const bestDay = useMemo(() => bestDayOfWeek(transactions, weekStart, weekEnd, lang), [transactions, weekStart, weekEnd, lang]);

  const customerLookup = useMemo(
    () => new Map((customers || []).map((customer) => [customer.id, customer])),
    [customers]
  );
  const weekTopCustomers = useMemo(
    () => topCustomersByVolume(ledgerTransactions, customerLookup, weekStart, weekEnd, 1),
    [ledgerTransactions, customerLookup, weekStart, weekEnd]
  );
  const weekTopProducts = useMemo(() => topProductsByQty(transactions, weekStart, weekEnd, 1), [transactions, weekStart, weekEnd]);
  const monthTopCustomers = useMemo(
    () => topCustomersByVolume(ledgerTransactions, customerLookup, monthStart, monthEnd, 5),
    [ledgerTransactions, customerLookup, monthStart, monthEnd]
  );
  const monthTopProducts = useMemo(() => topProductsByQty(transactions, monthStart, monthEnd, 5), [transactions, monthStart, monthEnd]);

  const totalOwed = useMemo(
    () => (enrichedCustomerSummaries || []).reduce((s, c) => s + Math.max(c.balance || 0, 0), 0),
    [enrichedCustomerSummaries]
  );
  const totalIOwe = useMemo(
    () => (supplierSummaries || []).reduce((s, c) => s + Math.max(c.balance || 0, 0), 0),
    [supplierSummaries]
  );
  const overdueCustomers = useMemo(
    () => (enrichedCustomerSummaries || []).filter(c => c.has_overdue && (c.balance || 0) > 0),
    [enrichedCustomerSummaries]
  );
  const overdueAmount = useMemo(
    () => overdueCustomers.reduce((s, c) => s + Math.max(c.balance || 0, 0), 0),
    [overdueCustomers]
  );

  // ─── deltas ───
  const yesterdayNet = yesterday.net;
  const lastWeekNet = lastWeek.net;
  const lastMonthNet = lastMonth.net;
  const dayDelta = yesterdayNet !== 0 ? Math.round(((today.net - yesterdayNet) / Math.abs(yesterdayNet)) * 100) : null;
  const weekDelta = lastWeekNet !== 0 ? Math.round(((week.net - lastWeekNet) / Math.abs(lastWeekNet)) * 100) : null;
  const monthDelta = lastMonthNet !== 0 ? Math.round(((month.net - lastMonthNet) / Math.abs(lastMonthNet)) * 100) : null;

  // ─── share ───
  const handleShareWeekly = () => {
    const text = buildWeeklySummaryText({
      shopName: shopProfile?.name,
      weekNet: week.net,
      weekSales: week.sales,
      weekExpenses: week.expenses,
      lastWeekNet,
      weekCollected,
      weekNewCredits,
      weekBestDay: bestDay,
      weekTopCustomer: weekTopCustomers[0],
      weekTopProduct: weekTopProducts[0],
      totalOwed,
      totalIOwe,
      overdueCount: overdueCustomers.length,
      lang,
    });
    onShareReport?.(text);
  };

  // ─── export ───
  const rangeBounds = (range) => {
    if (range === 'week') return [weekStart, weekEnd];
    if (range === 'month') return [monthStart, monthEnd];
    return [0, Date.now() + 86400000]; // all
  };
  const handleExportCSV = () => {
    const [from, to] = rangeBounds(exportRange);
    const csv = buildCSV({ transactions, ledgerTransactions }, from, to, customers);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(csv, `gebya-${exportRange}-${stamp}.csv`, 'text/csv;charset=utf-8');
  };
  const handleExportJSON = () => {
    const [from, to] = rangeBounds(exportRange);
    const json = buildJSON({ transactions, ledgerTransactions, customers, suppliers }, from, to);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(json, `gebya-${exportRange}-${stamp}.json`, 'application/json');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '4px 2px 0' }}>
        <h2 style={{
          fontSize: '1.15rem', fontWeight: 800,
          color: '#1B4332',
        }}>
          {lang === 'am' ? 'ሪፖርት' : 'Report'}
        </h2>
        <button
          type="button"
          onClick={togglePrivacy}
          aria-label={hidden ? (lang === 'am' ? 'ቁጥሮችን አሳይ' : 'Show amounts') : (lang === 'am' ? 'ቁጥሮችን ደብቅ' : 'Hide amounts')}
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
            fontSize: '0.72rem',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {hidden ? (lang === 'am' ? 'አሳይ' : 'Show') : (lang === 'am' ? 'ደብቅ' : 'Hide')}
        </button>
      </div>

      <RightNowSection
        todayNet={today.net}
        totalOwed={totalOwed}
        totalIOwe={totalIOwe}
        overdueCount={overdueCustomers.length}
        overdueAmount={overdueAmount}
        onChaseOverdue={onChaseOverdue}
        lang={lang}
        hidden={hidden}
      />

      <TodaySection
        todayNet={today.net}
        todaySales={today.sales}
        todayExpenses={today.expenses}
        deltaPct={dayDelta}
        collected={todayCollected}
        newCredits={todayNewCredits}
        bestSale={bestSale}
        lang={lang}
        hidden={hidden}
      />

      <ThisWeekSection
        weekNet={week.net}
        weekSales={week.sales}
        weekExpenses={week.expenses}
        deltaPct={weekDelta}
        bestDay={bestDay}
        topCustomer={weekTopCustomers[0] || null}
        topProduct={weekTopProducts[0] || null}
        lang={lang}
        hidden={hidden}
      />

      <ThisMonthSection
        monthNet={month.net}
        monthSales={month.sales}
        monthExpenses={month.expenses}
        deltaPct={monthDelta}
        topCustomers={monthTopCustomers}
        topProducts={monthTopProducts}
        monthCollected={monthCollected}
        monthNewCredits={monthNewCredits}
        lang={lang}
        hidden={hidden}
      />

      <AllHistoryCollapsible
        transactions={transactions}
        onEdit={onEdit}
        lang={lang}
      />

      <ShareExportSection
        onShareWeekly={handleShareWeekly}
        onExportCSV={handleExportCSV}
        onExportJSON={handleExportJSON}
        exportRange={exportRange}
        setExportRange={setExportRange}
        lang={lang}
      />
    </div>
  );
}

export default ReportView;
