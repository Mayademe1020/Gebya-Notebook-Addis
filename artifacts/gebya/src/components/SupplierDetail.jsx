// SupplierDetail.jsx — simplified supplier detail page
//
// Layout (top → bottom):
//   1. Compact dark header (~80px) · ← Back · status pill · Edit pencil
//   2. Avatar + name + phone
//   3. Balance block · "I owe X" prominent + running stats
//   4. History · simplified rows with left border stripe + chevron
//
// No Telegram (suppliers don't get reminders). No on-time tracking.
// Tap row → TransactionDetailSheet (edit/delete/delete confirmation).
//
// Touch targets ≥44px · privacy mode · Ethiopian calendar.

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Pencil, Truck, CreditCard, Wallet,
} from 'lucide-react';
import { fmt } from '../utils/numformat';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import { SUPPLIER_TRANSACTION_TYPES } from '../utils/supplierLedger';
import { useLang } from '../context/LangContext';
import { label } from '../labels/index';

// ─── helpers ──────────────────────────────────────────────────────────

function pickGradient(name = '') {
  // Stable hash → red-tinted gradient for the avatar (supplier side).
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

// ─── component ────────────────────────────────────────────────────────

function SupplierDetail({
  supplier,
  onBack,
  onAddPurchase,
  onPaySupplier,
  onMarkFullyPaid,
  onEditSupplier,
  onSelectTransaction,         // NEW · tap transaction row → open detail sheet
  isOnline = true,
  isSlowConnection = false,
}) {
  const { t, lang } = useLang();

  if (!supplier) return null;

  const balance = Math.max(Number(supplier.balance || 0), 0);
  const hasBalance = balance > 0;
  const initials = initialsFor(supplier.display_name);
  const grad = pickGradient(supplier.display_name || '');

  // Running balance from oldest → newest
  const historyRows = useMemo(() => {
    let runningBalance = balance;
    return (supplier.transactions || []).map((item) => {
      const balanceAfter = runningBalance;
      runningBalance = item.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT
        ? runningBalance + Number(item.amount || 0)
        : runningBalance - Number(item.amount || 0);
      return { ...item, balance_after: balanceAfter };
    });
  }, [supplier, balance]);

  // Same-day count for the date row (Commit C.1-style polish)
  const oldestPurchase = (supplier.transactions || []).filter(
    t => t.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD
  ).slice(-1)[0];
  const daysOldest = oldestPurchase
    ? Math.floor((Date.now() - oldestPurchase.created_at) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}>

      {/* ═══ 1. COMPACT DARK HEADER ══════════════════════════════════════════ */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2a1010 100%)',
        color: 'var(--color-bg-white)',
        borderRadius: 14,
        padding: '10px 14px 14px',
        boxShadow: '0 4px 16px -4px rgba(220,38,38,0.25)',
      }}>
        {/* Top row · Back + status + Edit */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button
            type="button"
            onClick={onBack}
            className="press-scale"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: 'none', color: 'var(--color-bg-white)',
              fontSize: '0.88rem', fontWeight: 700,
              cursor: 'pointer', padding: '6px 0',
              minHeight: 44,
            }}
          >
            <ArrowLeft className="w-5 h-5" />
            {label('suppliers.back', lang)}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasBalance && daysOldest > 30 && (
              <span style={{
                background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)',
                padding: '2px 8px', borderRadius: 999,
                fontSize: '0.62rem', fontWeight: 800,
                letterSpacing: '0.04em', flexShrink: 0,
              }}>
                {daysOldest}d {label('suppliers.open', lang)}
              </span>
            )}

            {/* Edit supplier — Commit D */}
            {onEditSupplier && (
              <button
                type="button"
                onClick={() => onEditSupplier(supplier)}
                className="press-scale"
                aria-label={label('suppliers.edit-supplier', lang)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'var(--color-bg-white)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Identity row · avatar + name + phone.
            Commit C.5: avatar becomes a tappable button when no photo is set —
            opens edit form so shopkeeper can add a photo retroactively. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          {supplier.photo ? (
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              position: 'relative', flexShrink: 0, overflow: 'hidden',
            }}>
              <img src={supplier.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onEditSupplier?.(supplier)}
              aria-label={label('suppliers.add-photo', lang)}
              className="press-scale"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                position: 'relative', flexShrink: 0, overflow: 'hidden',
                border: '2px dashed rgba(255,255,255,0.35)',
                background: grad,
                padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-bg-white)', fontSize: '1rem', fontWeight: 800,
              }}
            >
              {initials}
                <span style={{
                  position: 'absolute', bottom: -4, right: -4,
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--color-surface)',
                  border: '2px solid var(--color-text)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.85rem',
                  color: 'var(--color-text)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}>📷</span>
            </button>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.15 }}>
              {supplier.display_name}
            </p>
            <p style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {supplier.phone_number ? (
                <a
                  href={`tel:${supplier.phone_number}`}
                  style={{ color: 'var(--color-bg-white)', textDecoration: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  📞 {supplier.phone_number}
                </a>
              ) : (
                <span style={{ fontStyle: 'italic', opacity: 0.7 }}>
                  {label('suppliers.no-phone', lang)}
                </span>
              )}
              {supplier.note && (
                <>
                  <span>·</span>
                  <span style={{ fontStyle: 'italic', opacity: 0.85 }}>{supplier.note}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ═══ 2. BALANCE BLOCK ══════════════════════════════════════════ */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: 14,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        }}
      >
        <div>
          {hasBalance && daysOldest > 30 && (
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'var(--color-danger)', color: 'var(--color-bg-white)',
                fontSize: '0.62rem', fontWeight: 800,
                padding: '3px 8px', borderRadius: 999,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                marginBottom: 5,
              }}
            >
              ⏰ {daysOldest}d {label('suppliers.open-2', lang)}
            </span>
          )}
          <p style={{
            fontSize: '0.6rem', fontWeight: 800,
            color: 'var(--color-text-soft)', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            {label('suppliers.i-owe', lang)}
          </p>
          <p style={{
            fontFamily: 'Manrope, system-ui, sans-serif',
            fontSize: '1.85rem', fontWeight: 800,
            color: hasBalance ? 'var(--color-danger)' : 'var(--color-text-soft)',
            lineHeight: 1, marginTop: 4,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt(balance)}
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-soft)', marginLeft: 4 }}>
              {label('suppliers.birr', lang)}
            </span>
          </p>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end',
          gap: 4, fontSize: '0.7rem', color: 'var(--color-text-muted)',
        }}>
          <span>
            <strong style={{ color: 'var(--color-text)', fontWeight: 700 }}>{supplier.transaction_count || 0}</strong>{' '}
            {label('suppliers.entries', lang)}
          </span>
          {oldestPurchase && (
            <span>
              {label('suppliers.first-purchase', lang)}:{' '}
              <strong style={{ color: 'var(--color-text)', fontWeight: 700 }}>
                {formatEthiopian(oldestPurchase.created_at)}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* ═══ 3. HISTORY ══════════════════════════════════════════ */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{
            fontSize: '0.65rem', fontWeight: 800,
            color: 'var(--color-text-soft)', letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            {label('suppliers.history', lang)} · {historyRows.length} {label('suppliers.entries', lang)}
          </h3>
        </div>

        {historyRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 8px' }}>
            <Truck className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--color-text-soft)' }} />
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-soft)', fontWeight: 600 }}>
              {label('suppliers.no-entries-yet', lang)}
            </p>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-soft)', marginTop: 4 }}>
              {label('suppliers.record-what-you-buy-on-credit-from-this', lang)}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Commit C.5: Same-day grouping — emit a date header when the
                row's date changes from the previous one. Mirrors CustomerDetail. */}
            {(() => {
              const elements = [];
              let lastDate = null;
              historyRows.forEach((tx, idx) => {
                const txDate = formatEthiopian(tx.created_at);
                if (txDate !== lastDate) {
                  const sameDayCount = historyRows.filter(
                    r => formatEthiopian(r.created_at) === txDate
                  ).length;
                  elements.push(
                    <div
                      key={`date_${txDate}_${idx}`}
                      style={{
                        background: 'var(--color-danger-bg)',
                        border: '1px solid var(--color-danger-border)',
                        borderRadius: 8,
                        padding: '5px 10px',
                        fontSize: '0.62rem',
                        fontWeight: 800,
                        color: 'var(--color-danger-text)',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: idx === 0 ? 0 : 4,
                      }}
                    >
                      <span>📅 {txDate}</span>
                      {sameDayCount > 1 && (
                        <span style={{ color: 'var(--color-text-soft)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                          {sameDayCount} {label('suppliers.entries', lang)}
                        </span>
                      )}
                    </div>
                  );
                  lastDate = txDate;
                }
                elements.push(
                  <HistoryRow
                    key={tx.id || idx}
                    tx={tx}
                    isLast={idx === historyRows.length - 1}
                    lang={lang}
                    onSelectTransaction={onSelectTransaction}
                  />
                );
              });
              return elements;
            })()}
          </div>
        )}
      </div>

      {/* ═══ ACTION BAR — Add Purchase + Pay Supplier ═══════════════════ */}
      <div style={{ display: 'flex', gap: 10, padding: '0 0 4px' }}>
        <button
          type="button"
          onClick={() => onAddPurchase?.(supplier)}
          className="press-scale"
          style={{
            flex: 1, padding: '12px 0', minHeight: 48,
            background: 'var(--color-danger)', border: 'none', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: 'pointer',
          }}
        >
          <CreditCard className="w-4 h-4" style={{ color: 'var(--color-bg-white)', strokeWidth: 2.5 }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-bg-white)' }}>
            {label('suppliers.purchase', lang)}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onPaySupplier?.(supplier)}
          disabled={!hasBalance}
          className="press-scale"
          style={{
            flex: 1, padding: '12px 0', minHeight: 48,
            background: 'var(--color-success)', border: 'none', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: hasBalance ? 'pointer' : 'not-allowed',
            opacity: hasBalance ? 1 : 0.5,
          }}
        >
          <Wallet className="w-4 h-4" style={{ color: 'var(--color-bg-white)', strokeWidth: 2.5 }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-bg-white)' }}>
            {label('suppliers.pay', lang)}
          </span>
        </button>
      </div>

      <p style={{ fontSize: '0.65rem', color: 'var(--color-text-soft)', textAlign: 'center', fontStyle: 'italic', padding: '4px 0' }}>
        🔒 {label('suppliers.saved-on-this-phone-only', lang)}
      </p>
    </div>
  );
}

// ─── Simplified History row — date + description + amount + chevron ──
function HistoryRow({ tx, isLast, lang, onSelectTransaction }) {
  const isPayment = tx.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT;

  const amountColor = isPayment ? 'var(--color-success-text)' : 'var(--color-danger)';
  const sign = isPayment ? '−' : '+';
  const borderColor = isPayment ? 'var(--color-success-text)' : 'var(--color-danger)';

  return (
    <div
      onClick={() => onSelectTransaction?.(tx)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelectTransaction?.(tx); }}
      style={{
        padding: '12px 14px',
        background: 'var(--color-surface)',
        borderBottom: isLast ? 'none' : '1px solid var(--color-surface-muted)',
        borderLeft: `3px solid ${borderColor}`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        minHeight: 48,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        {/* Compact date */}
        <span style={{
          fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600,
          whiteSpace: 'nowrap', flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {formatEthiopian(tx.created_at)}
        </span>
        {/* Description */}
        <span style={{
          fontSize: '0.82rem', color: 'var(--color-text)', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {tx.item_name || tx.item_note || (isPayment
            ? (label('suppliers.payment', lang))
            : (label('suppliers.purchase-2', lang)))}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* Amount */}
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.88rem', fontWeight: 700,
          color: amountColor,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {sign}{fmt(tx.amount || 0)}
        </span>
        {/* Chevron */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>
    </div>
  );
}

export default SupplierDetail;
