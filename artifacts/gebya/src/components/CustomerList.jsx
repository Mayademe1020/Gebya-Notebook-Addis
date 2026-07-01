// CustomerList.jsx — Cockpit Synthesis v0.3 customer list
//
// Layout (top → bottom):
//   - Hero card · Total owed + Overdue + Collected this month + On-time % + streak
//   - Search row · search input + Add button
//   - Filter chips · All · Overdue · 👑 Top · Telegram · Cleared
//   - Top-customers banner (only when 👑 Top filter is active)
//   - Sort line
//   - Customer rows · photo (or initial avatar) + urgency stripe + name + meta
//                     + Telegram-state chip + balance + inline 🔔 (overdue only)
//   - Bulk-remind bar (locked at bottom when overdue customers exist)
//   - Empty state · friendly day-1 onboarding with faded example rows
//
// Privacy: numbers mask to •••• when usePrivacy().hidden is true.
// Names, photos, percentages, streak stay visible.
//
// Sizing (locked per design):
//   touch target ≥ 44 px primary, ≥ 32 px secondary
//   row 60-64 px tall (avatar 40 + 10 padding)
//   filter chips 28 px tall
//   hero card ~140 px total
//   bulk bar 48 px

import { useMemo, useState } from 'react';
import { Plus, Search, Users, Bell, Eye, EyeOff } from 'lucide-react';
import { fmt } from '../utils/numformat';
import { useLang } from '../context/LangContext';
import { usePrivacy } from '../context/PrivacyContext';
import { daysAgoLabel } from '../utils/reminders';

// ───── helpers ─────────────────────────────────────────────────────────────
function matchesCustomer(customer, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    customer.display_name,
    customer.note,
    customer.phone_number,
    customer.telegram_username,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

// Stable initials from a name. "Abebe Tilahun" → "AT", "Selam" → "SE", null → "?"
function initialsOf(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Avatar gradient by first letter — stable, soft, dignified
const AVATAR_GRADIENTS = {
  A: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  B: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
  C: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
  D: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
  E: 'linear-gradient(135deg, #84cc16 0%, #4d7c0f 100%)',
  F: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)',
  G: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
  H: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
  I: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
  J: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
  K: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
  L: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
  M: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  N: 'linear-gradient(135deg, #eab308 0%, #a16207 100%)',
  O: 'linear-gradient(135deg, #d946ef 0%, #a21caf 100%)',
  P: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
  Q: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
  R: 'linear-gradient(135deg, #6366f1 0%, #3730a3 100%)',
  S: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
  T: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
  U: 'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)',
  V: 'linear-gradient(135deg, #f43f5e 0%, #9f1239 100%)',
  W: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
  X: 'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)',
  Y: 'linear-gradient(135deg, #f97316 0%, #9a3412 100%)',
  Z: 'linear-gradient(135deg, #ec4899 0%, #831843 100%)',
};
function gradientFor(name) {
  const init = initialsOf(name);
  return AVATAR_GRADIENTS[init[0]] || AVATAR_GRADIENTS.A;
}

// Urgency color by overdue days / recency
function urgencyColor(customer) {
  if (customer?.has_overdue) return '#dc2626';      // red
  const last = customer?.last_activity_at;
  if (!last) return '#e5e7eb';                       // gray
  const days = Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000));
  if (days <= 2) return '#10b981';                   // green
  if (days <= 14) return '#f59e0b';                  // amber
  return '#e5e7eb';                                  // gray
}

// Status dot — same urgency colors, simpler binary semantics
function statusDot(customer) {
  if (customer?.has_overdue) return 'overdue';
  const last = customer?.last_activity_at;
  if (last && (Date.now() - last) <= 3 * 24 * 60 * 60 * 1000) return 'recent';
  return null;
}

// ───── component ───────────────────────────────────────────────────────────
function CustomerList({
  customers = [],
  metrics = {},
  onSelectCustomer,
  onAddCustomer,
  onRemindCustomer,
  onBulkRemind,
  onQuickCredit,
}) {
  const { t, lang } = useLang();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'overdue' | 'canRemind'

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  // ───── derive filter counts (always show across all customers) ─────
  const counts = useMemo(() => {
    let all = customers.length;
    let overdue = 0;
    let canRemind = 0;
    for (const c of customers) {
      if (c.has_overdue) overdue++;
      if (c.phone_number || c.telegram_chat_id || c.telegram_username) canRemind++;
    }
    return { all, overdue, canRemind };
  }, [customers]);

  // ───── apply filter + search ─────
  const filtered = useMemo(() => {
    let list = customers.filter((c) => {
      if (filter === 'overdue') return c.has_overdue;
      if (filter === 'canRemind') return c.phone_number || c.telegram_chat_id || c.telegram_username;
      return true; // 'all'
    });
    if (hasQuery) list = list.filter((c) => matchesCustomer(c, query));
    return list;
  }, [customers, filter, query, hasQuery]);

  // ───── sort: most overdue first, then highest balance ─────
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      // Overdue first
      if (a.has_overdue !== b.has_overdue) return a.has_overdue ? -1 : 1;
      if (a.has_overdue && b.has_overdue) {
        return (b.overdue_days || 0) - (a.overdue_days || 0);
      }
      // Then highest balance
      return (Number(b.balance) || 0) - (Number(a.balance) || 0);
    });
  }, [filtered, filter]);

  // ───── EMPTY STATE — day-1 zero customers ─────
  if (customers.length === 0) {
    return (
      <div className="space-y-4">
        <div
          className="px-3 py-10 text-center"
          style={{ background: '#fff', border: '1px solid #ece6d6', borderRadius: 'var(--radius-md)' }}
        >
          <div style={{ fontSize: '3rem', lineHeight: 1, marginBottom: 12 }}>📒</div>
          <p className="text-lg font-black" style={{ color: '#1a1a1a', marginBottom: 4 }}>
            {lang === 'am' ? 'ምንም ደንበኛ የለም' : 'No customers yet'}
          </p>
          <p className="text-sm mb-4" style={{ color: '#6b7280', maxWidth: '260px', margin: '0 auto 18px' }}>
            {lang === 'am'
              ? 'ለማን ዱቤ እንዳለ ይያዙ። ይከፍሉ ሲቻላቸው ይከታተሉ።'
              : 'Track who owes you. Send reminders. Mark payments.'}
          </p>
          <button
            type="button"
            onClick={onAddCustomer}
            className="press-scale"
            style={{
              background: '#1a1a1a', color: '#fff',
              padding: '12px 22px', borderRadius: 10,
              fontSize: '0.92rem', fontWeight: 800,
              cursor: 'pointer', minHeight: 44,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus className="w-4 h-4" />
            {lang === 'am' ? 'የመጀመሪያ ደንበኛ አክል' : 'Add your first customer'}
          </button>
        </div>

        {/* Faded example rows so user knows what's coming */}
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9ca3af', paddingLeft: 4 }}>
          {lang === 'am' ? 'ምን እንደሚመስል' : 'What it will look like'}
        </p>
        <div style={{ opacity: 0.55 }}>
          {[
            { name: 'Abebe Tilahun', status: lang === 'am' ? 'መታወቂያ አለ' : 'Can remind', amt: 4500, urg: '#f59e0b' },
            { name: 'Tigist Kebede',  status: lang === 'am' ? 'ያለፈ ጊዜ' : 'Overdue', amt: 3200, urg: '#dc2626' },
          ].map((ex, i) => (
            <div
              key={i}
              className="flex items-center gap-2"
              style={{
                padding: '10px 14px',
                background: '#fff',
                border: '1px dashed #e5e7eb',
                borderRadius: 10,
                marginBottom: 6,
              }}
            >
              <div style={{ width: 3, height: 36, borderRadius: 2, background: ex.urg, flexShrink: 0 }} />
              <div
                style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: gradientFor(ex.name),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: '0.95rem',
                  flexShrink: 0,
                }}
              >
                {initialsOf(ex.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1f2937' }}>{ex.name}</p>
                <p style={{ fontSize: '0.68rem', color: ex.urg }}>{ex.status}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.95rem', fontWeight: 700, color: ex.urg }}>
                  {fmt(ex.amt)}
                </p>
                <p style={{ fontSize: '0.6rem', color: '#9ca3af' }}>{lang === 'am' ? 'ብር' : 'birr'}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs" style={{ color: '#6b4f1d', fontStyle: 'italic', paddingLeft: 4 }}>
          ↑ {lang === 'am' ? 'እነዚህ ምሳሌዎች ናቸው' : 'these are examples · add a real customer to start'}
        </p>
      </div>
    );
  }

  // ───── HERO CARD METRICS ─────
  const heroAmount = hidden ? '••••' : fmt(metrics.totalOwed || 0);
  const overdueAmount = hidden ? '••••' : fmt(metrics.overdueAmount || 0);
  const streak = metrics.streak || 0;

  return (
    <div className="space-y-3">

      {/* ═══ HERO CARD ══════════════════════════════════════════ */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #ece6d6',
          borderRadius: 12,
          padding: 14,
          boxShadow: '0 2px 8px -2px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: '0.6rem', fontWeight: 800,
              color: '#92400e', letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              {lang === 'am' ? 'ሊሰበሰብ የሚገባው ጠቅላላ' : 'Total owed to me'}
            </p>
            <p style={{
              fontFamily: 'Manrope, system-ui, sans-serif',
              fontSize: '1.75rem', fontWeight: 800,
              color: hidden ? '#d1d5db' : '#b8842c',
              lineHeight: 1.05, margin: '4px 0 2px',
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {heroAmount}
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#9ca3af', marginLeft: 4 }}>
                {lang === 'am' ? 'ብር' : 'birr'}
              </span>
            </p>
            <p style={{ fontSize: '0.7rem', color: '#6b7280' }}>
              {customers.length} {lang === 'am' ? 'ደንበኞች' : 'customers'}
              {counts.overdue > 0 && ` · ${counts.overdue} ${lang === 'am' ? 'የዘገዩ' : 'overdue'}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            {streak > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                color: '#92400e',
                padding: '3px 9px', borderRadius: 999,
                fontSize: '0.65rem', fontWeight: 800,
                border: '1px solid rgba(146,64,14,0.15)',
                flexShrink: 0, whiteSpace: 'nowrap',
              }}>
                🔥 {streak}d
              </div>
            )}
            <button
              type="button"
              onClick={togglePrivacy}
              aria-label={lang === 'am' ? 'ቁጥሮችን ደብቅ/አሳይ' : 'Toggle privacy'}
              className="press-scale"
              style={{
                background: hidden ? 'rgba(196,136,58,0.10)' : 'transparent',
                border: hidden ? '1px solid #fde68a' : '1px solid transparent',
                color: hidden ? '#92400e' : '#9ca3af',
                padding: '0 8px',
                minWidth: 32, minHeight: 32,
                borderRadius: 999,
                display: 'flex', alignItems: 'center', gap: 4,
                cursor: 'pointer', fontSize: '0.65rem', fontWeight: 800,
              }}
            >
              {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {hidden && (lang === 'am' ? 'አሳይ' : 'Reveal')}
            </button>
          </div>
        </div>

        {/* Compact stats — Total Owed + Overdue count + Customer count */}
        <div style={{
          display: 'flex', gap: 10, marginTop: 10, paddingTop: 10,
          borderTop: '1px dashed #ece6d6',
          fontSize: '0.7rem', color: '#6b7280',
        }}>
          <span>
            <strong style={{ color: '#1f2937', fontWeight: 700 }}>{customers.length}</strong>{' '}
            {lang === 'am' ? 'ደንበኞች' : 'customers'}
          </span>
          {counts.overdue > 0 && (
            <span style={{ color: '#dc2626', fontWeight: 700 }}>
              {counts.overdue} {lang === 'am' ? 'የዘገዩ' : 'overdue'}
            </span>
          )}
          {streak > 0 && (
            <span>🔥 {streak}d</span>
          )}
        </div>
      </div>

      {/* ═══ SEARCH + ADD ══════════════════════════════════════════ */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search className="w-4 h-4" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#b8842c' }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === 'am' ? 'ስም ወይም ስልክ ይፈልጉ…' : 'Search name or phone…'}
            autoCapitalize="words"
            style={{
              width: '100%', padding: '10px 12px 10px 34px',
              background: '#fff', border: '1px solid #ece6d6',
              borderRadius: 10, fontSize: '0.85rem',
              outline: 'none', color: '#1f2937',
            }}
          />
        </div>
        <button
          type="button"
          onClick={onAddCustomer}
          className="press-scale"
          style={{
            background: '#1a1a1a', color: '#fff',
            padding: '10px 14px', borderRadius: 10,
            fontSize: '0.8rem', fontWeight: 800,
            cursor: 'pointer', minHeight: 44,
            display: 'flex', alignItems: 'center', gap: 4,
            flexShrink: 0,
          }}
        >
          <Plus className="w-4 h-4" /> {lang === 'am' ? 'ደንበኛ መዝግብ' : 'Add'}
        </button>
      </div>

      {/* ═══ FILTER CHIPS ══════════════════════════════════════════ */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }} className="hide-scrollbar">
        {[
          { id: 'all',      label: lang === 'am' ? 'ሁሉም'     : 'All',     count: counts.all,      style: 'default' },
          { id: 'overdue',  label: lang === 'am' ? 'የዘገዩ'    : 'Overdue', count: counts.overdue,  style: 'overdue' },
          { id: 'canRemind', label: lang === 'am' ? 'መታወቂያ አለ'  : 'Can remind', count: counts.canRemind, style: 'default' },
        ].map((f) => {
          const active = filter === f.id;
          const isOverdue = f.style === 'overdue';
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="press-scale"
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: 999,
                fontSize: '0.7rem', fontWeight: active ? 800 : 600,
                background: active
                  ? (isOverdue ? '#fef2f2' : isTop ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' : '#1a1a1a')
                  : '#fff',
                color: active
                  ? (isOverdue ? '#dc2626' : '#fff')
                  : '#4b5563',
                border: active
                  ? `1px solid ${isOverdue ? '#fecaca' : '#1a1a1a'}`
                  : '1px solid #ece6d6',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                minHeight: 28,
              }}
            >
              {f.label}
              <span style={{
                fontSize: '0.62rem',
                background: active ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.06)',
                padding: '0 5px', borderRadius: 999,
              }}>
                {f.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sort + count line */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px', fontSize: '0.7rem', color: '#6b7280' }}>
        <span>
          {lang === 'am' ? 'ቅደም ተከተል፦' : 'Sort:'}{' '}
          <strong style={{ color: '#1f2937' }}>
            {filter === 'top'
              ? (lang === 'am' ? 'በወቅቱ የከፈሉ' : 'Most on-time')
              : (lang === 'am' ? 'ከፍተኛ መዘግየት' : 'Most overdue')}
          </strong>
        </span>
        <span>
          {sorted.length} {sorted.length === 1
            ? (lang === 'am' ? 'ደንበኛ' : 'customer')
            : (lang === 'am' ? 'ደንበኞች' : 'customers')}
        </span>
      </div>

      {/* ═══ ROWS ══════════════════════════════════════════ */}
      <div style={{ paddingBottom: counts.overdue > 0 ? 56 : 4 }}>
        {sorted.map((customer) => {
          const balance = Number(customer.balance || 0);
          const hasBalance = balance > 0;
          const isOverdue = customer.has_overdue;
          const isTop = customer.on_time_eligible > 0 && customer.on_time_count === customer.on_time_eligible && customer.on_time_count >= 3;
          const urg = urgencyColor(customer);
          const dot = statusDot(customer);
          const initials = initialsOf(customer.display_name);
          const canRemind = hasBalance && (customer.telegram_chat_id || customer.telegram_username || customer.phone_number);

          return (
            <div
              key={customer.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectCustomer?.(customer)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSelectCustomer?.(customer); }}
              style={{
                padding: '10px 14px',
                background: isOverdue
                  ? 'linear-gradient(90deg, #fef2f2 0%, #fff 50%)'
                  : '#fff',
                borderBottom: '1px solid #f5f1ea',
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer',
                minHeight: 60,
              }}
            >
              {/* Urgency stripe */}
              <div style={{
                width: 3, alignSelf: 'stretch',
                borderRadius: 2, flexShrink: 0,
                margin: '4px 0',
                background: urg,
              }} />

              {/* Avatar (photo or initials gradient) */}
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                position: 'relative', flexShrink: 0, overflow: 'hidden',
              }}>
                {customer.photo ? (
                  <img
                    src={customer.photo}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: '100%', height: '100%',
                    background: gradientFor(customer.display_name),
                    color: '#fff', fontWeight: 800, fontSize: '0.95rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {initials}
                  </div>
                )}
                {dot && (
                  <div style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 11, height: 11, borderRadius: '50%',
                    border: '2px solid #fff',
                    background: dot === 'overdue' ? '#dc2626' : '#10b981',
                  }} />
                )}
                {isTop && (
                  <div style={{
                    position: 'absolute', top: -5, left: -5,
                    width: 18, height: 18, borderRadius: '50%',
                    border: '2px solid #fff',
                    background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem', lineHeight: 1,
                  }}>👑</div>
                )}
              </div>

              {/* Mid: name + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: '0.9rem', fontWeight: 700,
                  color: '#1f2937', lineHeight: 1.2,
                  display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
                }}>
                  {customer.display_name}
                  {isOverdue && customer.overdue_days > 0 && (
                    <span style={{
                      fontSize: '0.58rem', fontWeight: 800,
                      padding: '1px 6px',
                      background: '#dc2626', color: '#fff',
                      borderRadius: 3, letterSpacing: '0.04em',
                    }}>
                      {customer.overdue_days}{lang === 'am' ? 'ቀን ያለፈው' : 'd OD'}
                    </span>
                  )}
                </p>
                <p style={{
                  fontSize: '0.68rem', color: '#6b7280',
                  marginTop: 2,
                }}>
                  {isOverdue && canRemind && (
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>
                      {lang === 'am' ? 'ያለፈ ጊዜ' : 'Overdue'}
                    </span>
                  )}
                  {!isOverdue && hasBalance && canRemind && (
                    <span style={{ color: '#047857' }}>
                      {lang === 'am' ? 'መታወቂያ አለ' : 'Can remind'}
                    </span>
                  )}
                  {!hasBalance && (
                    <span style={{ color: '#9ca3af' }}>
                      {lang === 'am' ? 'የተፈተነ' : 'Settled'}
                    </span>
                  )}
                </p>
              </div>

              {/* Inline 🔔 on overdue rows */}
              {isOverdue && canRemind && onRemindCustomer && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemindCustomer(customer); }}
                  className="press-scale"
                  aria-label={lang === 'am' ? 'አስታውስ' : 'Remind'}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: '#fef3c7', color: '#b8842c',
                    border: '1px solid #fde68a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <Bell className="w-4 h-4" />
                </button>
              )}

              {/* Right: balance + quick-add */}
              <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div>
                  <p style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.95rem', fontWeight: 700,
                    color: hidden ? '#d1d5db' : (isOverdue ? '#dc2626' : (hasBalance ? '#b8842c' : '#9ca3af')),
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {hidden ? '••••' : fmt(balance)}
                  </p>
                  <p style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 1 }}>
                    {lang === 'am' ? 'ብር' : 'birr'}
                  </p>
                </div>
                {hasBalance && onQuickCredit && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onQuickCredit(customer); }}
                    className="press-scale"
                    aria-label={lang === 'am' ? 'ፋስት ብድር ጨምር' : 'Quick add credit'}
                    style={{
                      width: 28, height: 20, borderRadius: 6,
                      background: isOverdue ? '#dc2626' : '#047857',
                      color: '#fff',
                      border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: '0.7rem', fontWeight: 800,
                    }}
                  >
                    +
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* No-match empty (when filter or search returns 0) */}
        {sorted.length === 0 && (
          <div
            className="flex flex-col items-center justify-center text-center"
            style={{
              padding: '40px 20px',
              background: '#fff',
              border: '1px solid #ece6d6',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Users className="w-8 h-8 mb-2" style={{ color: '#d1d5db' }} />
            <p className="text-sm" style={{ color: '#9ca3af' }}>
              {hasQuery
                ? (lang === 'am' ? 'ምንም አልተገኘም' : 'No matches')
                : (lang === 'am' ? 'በዚህ ምድብ ምንም የለም' : 'Nothing in this filter')}
            </p>
          </div>
        )}
      </div>

      {/* ═══ BULK REMIND BAR (locked at bottom of credit-tab content) ══════════════════════════════════════════ */}
      {counts.overdue > 0 && onBulkRemind && (
        <div
          style={{
            position: 'sticky', bottom: 0,
            background: '#1a1a1a', color: '#fff',
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderTop: '2px solid #f59e0b',
            borderRadius: '0 0 8px 8px',
            margin: '0 -3px',
            minHeight: 48,
            boxShadow: '0 -8px 20px -8px rgba(0,0,0,0.15)',
          }}
        >
          <p style={{ fontSize: '0.78rem' }}>
            <strong style={{ color: '#fbbf24', fontWeight: 800 }}>
              {counts.overdue} {lang === 'am' ? 'የዘገዩ' : 'overdue'}
            </strong>
            {' · '}
            {hidden ? '••••' : fmt(metrics.overdueAmount || 0)} {lang === 'am' ? 'ብር' : 'birr'}
          </p>
          <button
            type="button"
            onClick={onBulkRemind}
            className="press-scale"
            style={{
              background: '#fbbf24', color: '#1a1a1a',
              padding: '7px 14px', borderRadius: 6,
              fontSize: '0.78rem', fontWeight: 800,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            🔔 {lang === 'am' ? `አስታውስ (${counts.overdue})` : `Remind ${counts.overdue}`}
          </button>
        </div>
      )}
    </div>
  );
}

export default CustomerList;
