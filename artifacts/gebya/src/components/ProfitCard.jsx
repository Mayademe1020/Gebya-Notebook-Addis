// ProfitCard.jsx — rewritten as TodaySummary (v4 lightweight design).
// Keeps the filename + default export so App.jsx imports unchanged.
//
// Renders:
// - TODAY · NET eyebrow with Ethiopian + Gregorian dates
// - Privacy eye toggle (top right)
// - Hero net number (auto-scaling 1-9 digit font)
// - Trend indicator vs yesterday (▲ green / ▼ red) — optional, hidden if yesterdayNet missing/zero
// - Sales + Spent text chips
//
// Profit-from-cost-prices is intentionally NOT shown — we don't force basic users
// to enter cost prices. Net = Sales − Spent. Advanced profit calcs can come later.

import { Eye, EyeOff } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { usePrivacy } from '../context/PrivacyContext';
import { fmt } from '../utils/numformat';
import { getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
import { heroFontSize } from '../utils/todaySummary';

function ProfitCard({ transactions, yesterdayNet }) {
  const { lang } = useLang();
  const { hidden, toggle } = usePrivacy();

  const sales = transactions.filter(tx => tx.type === 'sale');
  const expenses = transactions.filter(tx => tx.type === 'expense');

  const salesTotal = sales.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const expensesTotal = expenses.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const net = salesTotal - expensesTotal;

  const heroStyle = heroFontSize(net);
  const netColor = net >= 0 ? '#16a34a' : '#dc2626';
  const sign = net > 0 ? '+' : (net < 0 ? '−' : '');
  const absNet = Math.abs(net);

  // Trend — only shown if yesterdayNet provided AND non-zero
  let trend = null;
  if (yesterdayNet !== undefined && yesterdayNet !== null && yesterdayNet !== 0) {
    const pct = ((net - yesterdayNet) / Math.abs(yesterdayNet)) * 100;
    const up = pct >= 0;
    trend = {
      arrow: up ? '▲' : '▼',
      color: up ? '#16a34a' : '#dc2626',
      sign: up ? '+' : '−',
      pct: Math.abs(Math.round(pct)),
    };
  }

  const display = hidden ? '••••' : `${sign}${fmt(absNet)}`;
  const todayDateShort = new Date().toLocaleDateString('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div
      className="px-4 py-3"
      style={{
        background: '#ffffff',
        border: '1px solid #e8e2d8',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      {/* Eyebrow + privacy toggle */}
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
          {lang === 'am' ? 'ዛሬ · ቀሪ' : 'TODAY · NET'}
          <span className="ml-2 font-normal normal-case tracking-normal" style={{ color: '#9ca3af' }}>
            {getCurrentEthiopianDate()} · {todayDateShort}
          </span>
        </p>
        <button
          onClick={toggle}
          aria-label={lang === 'am' ? 'ቁጥሮችን ደብቅ/አሳይ' : 'Toggle privacy'}
          className="p-1 press-scale"
          style={{ minWidth: '32px', minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {hidden
            ? <EyeOff className="w-4 h-4" style={{ color: '#9ca3af' }} />
            : <Eye className="w-4 h-4" style={{ color: '#9ca3af' }} />}
        </button>
      </div>

      {/* Hero net number */}
      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
        <span
          className="font-bold"
          style={{
            color: netColor,
            fontSize: heroStyle.size,
            lineHeight: heroStyle.lineHeight,
          }}
        >
          {display}
        </span>
        {!hidden && (
          <span className="text-base font-semibold" style={{ color: netColor }}>
            {lang === 'am' ? 'ብር' : 'birr'}
          </span>
        )}
      </div>

      {/* Trend indicator */}
      {trend && !hidden && (
        <p className="text-xs font-medium mb-2" style={{ color: trend.color }}>
          {trend.arrow} {trend.sign}{trend.pct}% {lang === 'am' ? 'ካለፈው ቀን' : 'vs yesterday'}
        </p>
      )}

      {/* Sales + Spent chips */}
      <div className="flex gap-4 text-sm font-semibold mt-1.5">
        <span style={{ color: '#16a34a' }}>
          {lang === 'am' ? 'ሽያጭ' : 'Sales'} {hidden ? '••••' : fmt(salesTotal)}
        </span>
        <span style={{ color: '#dc2626' }}>
          {lang === 'am' ? 'ወጪ' : 'Spent'} {hidden ? '••••' : fmt(expensesTotal)}
        </span>
      </div>
    </div>
  );
}

export default ProfitCard;
