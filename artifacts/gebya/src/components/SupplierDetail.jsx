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
        color: '#fff',
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
              background: 'transparent', border: 'none', color: '#fff',
              fontSize: '0.88rem', fontWeight: 700,
              cursor: 'pointer', padding: '6px 0',
              minHeight: 44,
            }}
          >
            <ArrowLeft className="w-5 h-5" />
            {lang === 'am' ? 'ተመለስ' : 'Back'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasBalance && daysOldest > 30 && (
              <span style={{
                background: '#fee2e2', color: '#991b1b',
                padding: '2px 8px', borderRadius: 999,
                fontSize: '0.62rem', fontWeight: 800,
                letterSpacing: '0.04em', flexShrink: 0,
              }}>
                {daysOldest}d {lang === 'am' ? 'ቆይቷል' : 'OPEN'}
              </span>
            )}

            {/* Edit supplier — Commit D */}
            {onEditSupplier && (
              <button
                type="button"
                onClick={() => onEditSupplier(supplier)}
                className="press-scale"
                aria-label={lang === 'am' ? 'አስተካክል' : 'Edit supplier'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
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
              aria-label={lang === 'am' ? 'ፎቶ ይጨምሩ' : 'Add photo'}
              className="press-scale"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                position: 'relative', flexShrink: 0, overflow: 'hidden',
                border: '2px dashed rgba(255,255,255,0.35)',
                background: grad,
                padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '1rem', fontWeight: 800,
              }}
            >
              {initials}
              <span style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 16, height: 16, borderRadius: '50%',
                background: '#fff',
                border: '1.5px solid #1a1a1a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.55rem',
                color: '#1a1a1a',
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
                  style={{ color: '#fff', textDecoration: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  📞 {supplier.phone_number}
                </a>
              ) : (
                <span style={{ fontStyle: 'italic', opacity: 0.7 }}>
                  {lang === 'am' ? 'ስልክ የለም' : 'No phone'}
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
          background: '#fff',
          border: '1px solid #ece6d6',
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
                background: '#dc2626', color: '#fff',
                fontSize: '0.62rem', fontWeight: 800,
                padding: '3px 8px', borderRadius: 999,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                marginBottom: 5,
              }}
            >
              ⏰ {daysOldest}d {lang === 'am' ? 'ቆይቷል' : 'open'}
            </span>
          )}
          <p style={{
            fontSize: '0.6rem', fontWeight: 800,
            color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            {lang === 'am' ? 'ለመክፈል' : 'I owe'}
          </p>
          <p style={{
            fontFamily: 'Manrope, system-ui, sans-serif',
            fontSize: '1.85rem', fontWeight: 800,
            color: hasBalance ? '#dc2626' : '#9ca3af',
            lineHeight: 1, marginTop: 4,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt(balance)}
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#9ca3af', marginLeft: 4 }}>
              {lang === 'am' ? 'ብር' : 'birr'}
            </span>
          </p>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end',
          gap: 4, fontSize: '0.7rem', color: '#6b7280',
        }}>
          <span>
            <strong style={{ color: '#1f2937', fontWeight: 700 }}>{supplier.transaction_count || 0}</strong>{' '}
            {lang === 'am' ? 'መዝገብ' : 'entries'}
          </span>
          {oldestPurchase && (
            <span>
              {lang === 'am' ? 'የመጀመሪያ ግዢ' : 'First purchase'}:{' '}
              <strong style={{ color: '#1f2937', fontWeight: 700 }}>
                {formatEthiopian(oldestPurchase.created_at)}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* ═══ 3. HISTORY ══════════════════════════════════════════ */}
      <div style={{
        background: '#fff',
        border: '1px solid #ece6d6',
        borderRadius: 12,
        padding: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{
            fontSize: '0.65rem', fontWeight: 800,
            color: '#9ca3af', letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            {lang === 'am' ? 'መዝገብ' : 'History'} · {historyRows.length} {lang === 'am' ? 'መዝገብ' : 'entries'}
          </h3>
        </div>

        {historyRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 8px' }}>
            <Truck className="w-7 h-7 mx-auto mb-2" style={{ color: '#d1d5db' }} />
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 600 }}>
              {lang === 'am' ? 'መዝገብ የለም' : 'No entries yet'}
            </p>
            <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 4 }}>
              {lang === 'am'
                ? 'ከዚህ አቅራቢ ግዢዎችን ይመዝግቡ።'
                : 'Record what you buy on credit from this supplier.'}
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
                        background: '#fff5f5',
                        border: '1px solid #fecaca',
                        borderRadius: 8,
                        padding: '5px 10px',
                        fontSize: '0.62rem',
                        fontWeight: 800,
                        color: '#991b1b',
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
                        <span style={{ color: '#9ca3af', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                          {sameDayCount} {lang === 'am' ? 'መዝገብ' : 'entries'}
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
            background: '#dc2626', border: 'none', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: 'pointer',
          }}
        >
          <CreditCard className="w-4 h-4" style={{ color: '#fff', strokeWidth: 2.5 }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff' }}>
            {lang === 'am' ? 'ግዢ ጨምር (+)' : 'PURCHASE (+)'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onPaySupplier?.(supplier)}
          disabled={!hasBalance}
          className="press-scale"
          style={{
            flex: 1, padding: '12px 0', minHeight: 48,
            background: '#16a34a', border: 'none', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: hasBalance ? 'pointer' : 'not-allowed',
            opacity: hasBalance ? 1 : 0.5,
          }}
        >
          <Wallet className="w-4 h-4" style={{ color: '#fff', strokeWidth: 2.5 }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff' }}>
            {lang === 'am' ? 'ክፍያ (-)' : 'PAY (-)'}
          </span>
        </button>
      </div>

      <p style={{ fontSize: '0.65rem', color: '#9ca3af', textAlign: 'center', fontStyle: 'italic', padding: '4px 0' }}>
        🔒 {lang === 'am' ? 'መረጃው በዚህ ስልክ ብቻ ይቀመጣል' : 'Saved on this phone only'}
      </p>
    </div>
  );
}

// ─── Simplified History row — date + description + amount + chevron ──
function HistoryRow({ tx, isLast, lang, onSelectTransaction }) {
  const isPayment = tx.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT;

  const amountColor = isPayment ? '#166534' : '#991b1b';
  const sign = isPayment ? '−' : '+';
  const borderColor = isPayment ? '#166534' : '#dc2626';

  return (
    <div
      onClick={() => onSelectTransaction?.(tx)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelectTransaction?.(tx); }}
      style={{
        padding: '12px 14px',
        background: '#fff',
        borderBottom: isLast ? 'none' : '1px solid #f5f1ea',
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
          fontSize: '0.72rem', color: '#6b7280', fontWeight: 600,
          whiteSpace: 'nowrap', flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {formatEthiopian(tx.created_at)}
        </span>
        {/* Description */}
        <span style={{
          fontSize: '0.82rem', color: '#1f2937', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {tx.item_name || tx.item_note || (isPayment
            ? (lang === 'am' ? 'ክፍያ' : 'Payment')
            : (lang === 'am' ? 'ግዢ' : 'Purchase'))}
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
