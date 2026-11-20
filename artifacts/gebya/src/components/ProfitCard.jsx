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

import { useState } from 'react';
import { Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { usePrivacy } from '../context/PrivacyContext';
import { fmt } from '../utils/numformat';
import { getCurrentEthiopianDate } from '../utils/ethiopianCalendar';
import { heroFontSize } from '../utils/todaySummary';
import { label } from '../labels/index.js';

function ProfitCard({ transactions, yesterdayNet, compact = false }) {
  const { lang } = useLang();
  const { hidden, toggle } = usePrivacy();
  // Compact mode (Unified Sale Workspace v1): the scoreboard collapses to ONE
  // line so the capture strip fits above the fold. Tap to expand for the full
  // breakdown; the trust line and privacy toggle are preserved in both forms.
  const [expanded, setExpanded] = useState(!compact);

  const sales = transactions.filter(tx => tx.type === 'sale');
  const expenses = transactions.filter(tx => tx.type === 'expense');

  const salesTotal = sales.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const expensesTotal = expenses.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const net = salesTotal - expensesTotal;

  const heroStyle = heroFontSize(net);
  const netColor = net >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
  const sign = net > 0 ? '+' : (net < 0 ? '−' : '');
  const absNet = Math.abs(net);

  // Trend — only shown if yesterdayNet provided AND non-zero
  let trend = null;
  if (yesterdayNet !== undefined && yesterdayNet !== null && yesterdayNet !== 0) {
    const pct = ((net - yesterdayNet) / Math.abs(yesterdayNet)) * 100;
    const up = pct >= 0;
    trend = {
      arrow: up ? '▲' : '▼',
      color: up ? 'var(--color-success)' : 'var(--color-danger)',
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

  // ─── Compact one-line scoreboard (tap to expand) ───
  if (compact && !expanded) {
    return (
      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <span className="text-[10px] font-bold uppercase tracking-widest flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          {label('today.today-net', lang)}
        </span>
        <span className="text-base font-bold flex-shrink-0" style={{ color: netColor }}>
          {display} {hidden ? '' : (label('today.birr', lang))}
        </span>
        {trend && !hidden && (
          <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: trend.color }}>
            {trend.arrow}{trend.pct}%
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 flex-shrink-0">
          <button
            onClick={toggle}
            aria-label={label('today.toggle-privacy', lang)}
            className="press-scale flex items-center justify-center"
            style={{ minWidth: '32px', minHeight: '32px', color: hidden ? 'var(--color-warning)' : 'var(--color-text-soft)' }}
          >
            {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setExpanded(true)}
            aria-label={label('today.show-details', lang)}
            className="press-scale flex items-center justify-center"
            style={{ minWidth: '32px', minHeight: '32px', color: 'var(--color-text-soft)' }}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div
      className="px-3 sm:px-4 py-3"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      {/* Eyebrow + privacy toggle */}
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
          {label('today.today-net', lang)}
          <span className="ml-2 font-normal normal-case tracking-normal" style={{ color: 'var(--color-text-soft)' }}>
            {getCurrentEthiopianDate()} · {todayDateShort}
          </span>
        </p>
        <button
          onClick={toggle}
          aria-label={label('today.toggle-privacy', lang)}
          className="press-scale flex items-center gap-1 px-2"
          style={{
            minHeight: '32px',
            background: hidden ? 'rgba(196,136,58,0.10)' : 'transparent',
            border: hidden ? '1px solid var(--color-warning-border)' : '1px solid transparent',
            borderRadius: '999px',
            color: hidden ? 'var(--color-warning)' : 'var(--color-text-soft)',
            fontSize: '11px',
            fontWeight: hidden ? 700 : 500,
          }}
        >
          {hidden
            ? <EyeOff className="w-4 h-4" />
            : <Eye className="w-4 h-4" />}
          {hidden && (
            <span>{label('today.reveal', lang)}</span>
          )}
        </button>
        {compact && (
          <button
            onClick={() => setExpanded(false)}
            aria-label={label('today.collapse', lang)}
            className="press-scale flex items-center justify-center"
            style={{ minWidth: '32px', minHeight: '32px', color: 'var(--color-text-soft)' }}
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        )}
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
            {label('today.birr', lang)}
          </span>
        )}
      </div>

      {/* Trend indicator */}
      {trend && !hidden && (
        <p className="text-xs font-medium mb-2" style={{ color: trend.color }}>
          {trend.arrow} {trend.sign}{trend.pct}% {label('today.vs-yesterday', lang)}
        </p>
      )}

      {/* Sales + Spent chips */}
      <div className="flex gap-4 text-sm font-semibold mt-1.5">
        <span style={{ color: 'var(--color-success)' }}>
          {label('today.sales', lang)} {hidden ? '••••' : fmt(salesTotal)}
        </span>
        <span style={{ color: 'var(--color-danger)' }}>
          {label('today.spent', lang)} {hidden ? '••••' : fmt(expensesTotal)}
        </span>
      </div>

      {/* Trust line — explicit, professional: data is YOURS, not ours.
          Tax filing is the shopkeeper's choice, not the app's job. */}
      <p className="text-[10px] mt-2 pt-2 border-t" style={{ color: 'var(--color-text-soft)', borderColor: 'rgba(0,0,0,0.05)' }}>
        🔒 {label('today.saved-on-this-phone-only-we-never-send-your', lang)}
      </p>
    </div>
  );
}

export default ProfitCard;
