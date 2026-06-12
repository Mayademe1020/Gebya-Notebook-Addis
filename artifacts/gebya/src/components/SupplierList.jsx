// SupplierList.jsx — Cockpit Synthesis v0.3 · "people I OWE" view (Commit D).
//
// Mirror of CustomerList but with RED accents (I owe = red side of the ledger).
// Layout:
//   1. Hero card · big total "I owe X birr" in red + supplier count + add button
//   2. Search bar
//   3. Filter chips · All · 30d+ open · Cleared
//   4. Supplier rows with urgency stripes (red ≥30 days, amber ≥14, green <14),
//      photo-or-initials avatars, balance with running days
//
// Khatabook insight: shopkeepers feel relief when they SEE how much they owe
// total. Hero card answers "where am I exposed?" before any individual row.

import { useMemo, useState } from 'react';
import { Plus, Search, Truck } from 'lucide-react';
import { fmt } from '../utils/numformat';
import { useLang } from '../context/LangContext';

function matchesSupplier(supplier, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [supplier.display_name, supplier.note, supplier.phone_number]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function pickGradient(name = '') {
  const palette = [
    ['#7f1d1d', '#dc2626'],
    ['#991b1b', '#ef4444'],
    ['#9f1239', '#e11d48'],
    ['#7c2d12', '#ea580c'],
    ['#6b21a8', '#a21caf'],
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const [a, b] = palette[Math.abs(hash) % palette.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

function initialsFor(name = '?') {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

// Compute days since the oldest unpaid purchase. >= 30 = red urgency,
// 14-29 = amber, < 14 = green. No outstanding balance → "cleared".
function urgencyFor(supplier) {
  const balance = Number(supplier.balance || 0);
  if (balance <= 0) return { stripe: '#d1d5db', tone: 'cleared', days: 0 };
  // Approximate oldest open purchase by walking transactions newest→oldest
  // and subtracting payments greedily (FIFO settlement).
  const txs = (supplier.transactions || []).slice();
  let remaining = balance;
  let oldestOpenAt = null;
  // sort ascending by created_at (oldest first)
  txs.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
  let availablePayments = txs
    .filter(t => t.type === 'payment')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  for (const t of txs) {
    if (t.type !== 'purchase_add') continue;
    const amt = Number(t.amount || 0);
    const settled = Math.min(amt, availablePayments);
    availablePayments -= settled;
    const stillOwed = amt - settled;
    if (stillOwed > 0) {
      oldestOpenAt = t.created_at;
      break;
    }
  }
  if (!oldestOpenAt) return { stripe: '#86efac', tone: 'recent', days: 0 };
  const days = Math.floor((Date.now() - oldestOpenAt) / (1000 * 60 * 60 * 24));
  if (days >= 30) return { stripe: '#dc2626', tone: 'overdue', days };
  if (days >= 14) return { stripe: '#fbbf24', tone: 'aging', days };
  return { stripe: '#86efac', tone: 'recent', days };
}

function SupplierList({ suppliers = [], onSelectSupplier, onAddSupplier }) {
  const { t, lang } = useLang();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | aging | cleared

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  // Enrich with urgency once
  const enriched = useMemo(
    () => suppliers.map(s => ({ ...s, _urgency: urgencyFor(s) })),
    [suppliers]
  );

  const totalOwed = useMemo(
    () => enriched.reduce((sum, s) => sum + Math.max(s.balance || 0, 0), 0),
    [enriched]
  );

  const counts = useMemo(() => ({
    all: enriched.length,
    aging: enriched.filter(s => s._urgency.tone === 'overdue' || s._urgency.tone === 'aging').length,
    cleared: enriched.filter(s => s._urgency.tone === 'cleared').length,
  }), [enriched]);

  const filteredSuppliers = useMemo(() => {
    return enriched.filter((s) => {
      if (!matchesSupplier(s, query)) return false;
      if (filter === 'aging' && !(s._urgency.tone === 'overdue' || s._urgency.tone === 'aging')) return false;
      if (filter === 'cleared' && s._urgency.tone !== 'cleared') return false;
      return true;
    });
  }, [enriched, query, filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ═══ 1. HERO CARD ════════════════════════════════════════════════ */}
      <div
        style={{
          background: 'linear-gradient(135deg, #fff5f5 0%, #fff 100%)',
          border: '1px solid #fecaca',
          borderRadius: 14,
          padding: 16,
          boxShadow: '0 2px 12px -4px rgba(220,38,38,0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: '0.62rem', fontWeight: 800,
              color: '#dc2626', letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              {lang === 'am' ? 'ለአቅራቢዎች ለመክፈል' : 'I owe (suppliers)'}
            </p>
            <p style={{
              fontFamily: 'Manrope, system-ui, sans-serif',
              fontSize: '1.85rem', fontWeight: 800,
              color: totalOwed > 0 ? '#dc2626' : '#9ca3af',
              lineHeight: 1, marginTop: 4,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}>
              −{fmt(totalOwed)}
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#9ca3af', marginLeft: 4 }}>
                {lang === 'am' ? 'ብር' : 'birr'}
              </span>
            </p>
            <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4 }}>
              {enriched.length} {lang === 'am'
                ? 'አቅራቢ'
                : (enriched.length === 1 ? 'supplier' : 'suppliers')}
              {counts.aging > 0 && (
                <>
                  <span style={{ color: '#9ca3af', margin: '0 4px' }}>·</span>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>
                    {counts.aging} {lang === 'am' ? 'ቆይቷል' : 'open ≥14d'}
                  </span>
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onAddSupplier}
            className="press-scale"
            style={{
              background: '#dc2626', color: '#fff',
              border: 'none', borderRadius: 10,
              padding: '8px 12px',
              fontSize: '0.82rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', gap: 4,
              cursor: 'pointer',
              flexShrink: 0,
              minHeight: 40,
            }}
          >
            <Plus className="w-4 h-4" />
            {lang === 'am' ? 'አክል' : 'Add'}
          </button>
        </div>
      </div>

      {/* ═══ 2. SEARCH ═══════════════════════════════════════════════════ */}
      <div style={{ position: 'relative' }}>
        <Search
          className="w-4 h-4"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === 'am' ? 'አቅራቢ ይፈልጉ' : 'Search supplier'}
          autoCapitalize="words"
          style={{
            width: '100%',
            paddingLeft: 36, paddingRight: 16,
            paddingTop: 12, paddingBottom: 12,
            fontSize: '0.88rem',
            background: '#fff',
            border: '1px solid #ece6d6',
            borderRadius: 10,
            outline: 'none',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        />
      </div>

      {/* ═══ 3. FILTER CHIPS ═════════════════════════════════════════════ */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        <FilterChip
          label={lang === 'am' ? 'ሁሉ' : 'All'}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          count={counts.all}
          tone="neutral"
        />
        <FilterChip
          label={`⏰ ${lang === 'am' ? 'ቆይቷል' : 'Open ≥14d'}`}
          active={filter === 'aging'}
          onClick={() => setFilter('aging')}
          count={counts.aging}
          tone="red"
        />
        <FilterChip
          label={`✓ ${lang === 'am' ? 'የተዘጋ' : 'Cleared'}`}
          active={filter === 'cleared'}
          onClick={() => setFilter('cleared')}
          count={counts.cleared}
          tone="green"
        />
      </div>

      {/* ═══ 4. SUPPLIER ROWS ════════════════════════════════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredSuppliers.length === 0 ? (
          <div style={{
            background: '#fff', border: '1px solid #ece6d6', borderRadius: 12,
            padding: '20px 16px', textAlign: 'center',
          }}>
            <Truck className="w-8 h-8 mx-auto mb-2" style={{ color: '#d1d5db' }} />
            <p style={{ fontSize: '0.88rem', color: '#6b7280', fontWeight: 700 }}>
              {suppliers.length === 0
                ? (lang === 'am' ? 'ምንም አቅራቢ የለም' : 'No suppliers yet')
                : hasQuery
                  ? (lang === 'am' ? 'ምንም አልተገኘም' : 'No matches')
                  : (lang === 'am' ? 'ይህ ምድብ ባዶ ነው' : 'This filter is empty')}
            </p>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4, maxWidth: 280, margin: '4px auto 0' }}>
              {lang === 'am'
                ? 'ከአቅራቢ የሚገዙትን ዱቤ እዚህ ይመዝግቡ።'
                : 'Track what you buy on credit from your wholesalers and suppliers here.'}
            </p>
          </div>
        ) : (
          filteredSuppliers.map((supplier) => (
            <SupplierRow
              key={supplier.id}
              supplier={supplier}
              lang={lang}
              onClick={() => onSelectSupplier?.(supplier)}
            />
          ))
        )}
      </div>

      <p style={{
        fontSize: '0.65rem', color: '#9ca3af',
        textAlign: 'center', fontStyle: 'italic',
        padding: '4px 0 8px',
      }}>
        🔒 {lang === 'am' ? 'መረጃው በዚህ ስልክ ብቻ ይቀመጣል' : 'Saved on this phone only'}
      </p>
    </div>
  );
}

// ─── subcomponents ────────────────────────────────────────────────────

function FilterChip({ label, active, onClick, count, tone }) {
  const palette = {
    neutral: { activeBg: '#1a1a1a', activeColor: '#fff', idleBg: '#f3f4f6', idleColor: '#6b7280' },
    red:     { activeBg: '#dc2626', activeColor: '#fff', idleBg: '#fef2f2', idleColor: '#991b1b' },
    green:   { activeBg: '#16a34a', activeColor: '#fff', idleBg: '#f0fdf4', idleColor: '#166534' },
  };
  const p = palette[tone] || palette.neutral;
  return (
    <button
      type="button"
      onClick={onClick}
      className="press-scale"
      style={{
        flexShrink: 0,
        padding: '6px 12px',
        borderRadius: 999,
        background: active ? p.activeBg : p.idleBg,
        color: active ? p.activeColor : p.idleColor,
        fontSize: '0.72rem', fontWeight: 700,
        border: 'none',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span style={{
          background: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
          padding: '1px 6px', borderRadius: 999,
          fontSize: '0.65rem', fontWeight: 800,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

function SupplierRow({ supplier, lang, onClick }) {
  const balance = Math.max(Number(supplier.balance || 0), 0);
  const hasBalance = balance > 0;
  const urgency = supplier._urgency || { stripe: '#d1d5db', tone: 'cleared', days: 0 };
  const initials = initialsFor(supplier.display_name);
  const grad = pickGradient(supplier.display_name || '');

  return (
    <button
      type="button"
      onClick={onClick}
      className="press-scale"
      style={{
        background: '#fff',
        border: '1px solid #ece6d6',
        borderRadius: 12,
        padding: 12,
        display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer',
        textAlign: 'left',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Urgency stripe on left edge */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 4,
        background: urgency.stripe,
      }} />

      {/* Avatar */}
      <div style={{
        marginLeft: 4,
        width: 40, height: 40, borderRadius: '50%',
        flexShrink: 0, overflow: 'hidden',
        position: 'relative',
      }}>
        {supplier.photo ? (
          <img src={supplier.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: grad,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '0.9rem', fontWeight: 800,
          }}>{initials}</div>
        )}
        {/* Tiny overdue dot when ≥30 days */}
        {urgency.tone === 'overdue' && (
          <div style={{
            position: 'absolute', bottom: -1, right: -1,
            width: 12, height: 12, borderRadius: '50%',
            background: '#dc2626',
            border: '2px solid #fff',
          }} />
        )}
      </div>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: '0.92rem', fontWeight: 800, color: '#1f2937',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {supplier.display_name}
        </p>
        <div style={{
          display: 'flex', gap: 6, alignItems: 'center',
          fontSize: '0.7rem', color: '#9ca3af', marginTop: 2,
        }}>
          <span>{supplier.transaction_count || 0} {lang === 'am' ? 'መዝገብ' : 'entries'}</span>
          {urgency.tone === 'overdue' && (
            <>
              <span>·</span>
              <span style={{ color: '#dc2626', fontWeight: 700 }}>
                ⏰ {urgency.days}d {lang === 'am' ? 'ቆይቷል' : 'open'}
              </span>
            </>
          )}
          {urgency.tone === 'aging' && (
            <>
              <span>·</span>
              <span style={{ color: '#b8842c', fontWeight: 700 }}>
                {urgency.days}d
              </span>
            </>
          )}
        </div>
      </div>

      {/* Balance */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{
          fontSize: '0.95rem', fontWeight: 800,
          color: hasBalance ? '#dc2626' : '#9ca3af',
          fontFamily: 'Manrope, system-ui, sans-serif',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {hasBalance ? `−${fmt(balance)}` : '✓ 0'}
        </p>
        <p style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 2 }}>
          {lang === 'am' ? 'ብር' : 'birr'}
        </p>
      </div>
    </button>
  );
}

export default SupplierList;
