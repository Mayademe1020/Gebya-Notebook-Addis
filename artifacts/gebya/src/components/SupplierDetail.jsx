// SupplierDetail.jsx — Cockpit Synthesis v0.3 · "people I OWE" (Khatabook-style).
//
// Commit D: full refactor to mirror CustomerDetail v0.3 patterns but with
// RED accents (supplier side = I owe, customer side = they owe).
//
// Layout (top → bottom):
//   1. Compact dark header (~80px) · ← Back · status pill · Edit pencil
//   2. Avatar + name + phone
//   3. Balance block · "I owe X" prominent + running stats
//   4. 4-icon quick actions · Buy / Pay / Mark paid / Call
//   5. History rows with PURCHASE / PAYMENT tags + ⋮ menu + long-press
//
// No Telegram (suppliers don't get reminders). No on-time tracking (those
// are credit-receiver metrics that don't apply when YOU'RE the borrower).
//
// Long-press: pointerdown + 500ms timer → action sheet (Edit · Delete · Cancel).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, MoreVertical, Phone, Plus, Wallet, X, Pencil, Trash2, Truck,
} from 'lucide-react';
import { fmt } from '../utils/numformat';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import { SUPPLIER_TRANSACTION_TYPES } from '../utils/supplierLedger';
import { useLang } from '../context/LangContext';
import PhotoAttachment from './PhotoAttachment';

// ─── helpers ──────────────────────────────────────────────────────────

function useLongPress(onLongPress, ms = 500) {
  const timerRef = useRef(null);
  const targetRef = useRef(null);
  const start = (e, target) => {
    targetRef.current = target;
    timerRef.current = setTimeout(() => {
      if (targetRef.current) onLongPress(targetRef.current);
    }, ms);
  };
  const cancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    targetRef.current = null;
  };
  useEffect(() => () => cancel(), []);
  return { start, cancel };
}

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
  onEditSupplierTransaction,
  onDeleteSupplierTransaction,
}) {
  const { t, lang } = useLang();
  const [actionSheet, setActionSheet] = useState(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});
  const longPress = useLongPress((tx) => setActionSheet({ tx }));

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
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'transparent', border: 'none', color: '#fff',
              fontSize: '0.78rem', fontWeight: 700, opacity: 0.85,
              cursor: 'pointer', padding: '4px 0',
              minHeight: 28,
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{lang === 'am' ? 'ተመለስ · አቅራቢዎች' : 'Back · Suppliers'}</span>
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

      {/* ═══ 3. QUICK ACTIONS GRID ══════════════════════════════════════════ */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6,
      }}>
        <QuickAction
          variant="primary-red"
          icon={<Plus className="w-4 h-4" />}
          label={lang === 'am' ? 'ግዢ' : 'Buy'}
          onClick={onAddPurchase}
        />
        <QuickAction
          variant="green"
          icon={<Wallet className="w-4 h-4" />}
          label={lang === 'am' ? 'ክፍያ' : 'Pay'}
          onClick={onPaySupplier}
          disabled={!hasBalance}
        />
        <QuickAction
          variant="green"
          icon={<CheckCircle2 className="w-4 h-4" />}
          label={lang === 'am' ? 'ሙሉ' : 'Mark paid'}
          onClick={() => onMarkFullyPaid?.(supplier)}
          disabled={!hasBalance || !onMarkFullyPaid}
        />
        <QuickAction
          variant="amber"
          icon={<Phone className="w-4 h-4" />}
          label={lang === 'am' ? 'ደውል' : 'Call'}
          href={supplier.phone_number ? `tel:${supplier.phone_number}` : null}
          disabled={!supplier.phone_number}
        />
      </div>

      {!hasBalance && (
        <p style={{ fontSize: '0.7rem', color: '#9ca3af', textAlign: 'center', fontStyle: 'italic' }}>
          {lang === 'am' ? 'ምንም ለመክፈል የለም' : 'No outstanding balance'}
        </p>
      )}

      {hasBalance && !supplier.phone_number && (
        <button
          type="button"
          onClick={() => onEditSupplier?.(supplier)}
          className="press-scale"
          style={{
            background: '#fffbeb',
            border: '1px dashed #fbbf24',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: '0.72rem', color: '#92400e', fontWeight: 700,
            textAlign: 'center',
            cursor: 'pointer',
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Pencil className="w-3.5 h-3.5" />
          {lang === 'am'
            ? 'ስልክ ይጨምሩ →'
            : 'Tap to add a phone number →'}
        </button>
      )}

      {/* ═══ 4. HISTORY ══════════════════════════════════════════ */}
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
          {historyRows.length > 0 && (
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 700,
                background: '#fef2f2',
                color: '#991b1b',
                padding: '2px 8px',
                borderRadius: 999,
                border: '1px solid #fecaca',
              }}
            >
              {lang === 'am' ? 'ለማስተካከል ⋮ ይንኩ' : '⋮ tap to edit / delete'}
            </span>
          )}
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
                    key={tx.id}
                    tx={tx}
                    lang={lang}
                    expanded={!!expandedRows[tx.id]}
                    onToggleExpand={() => setExpandedRows(prev => ({ ...prev, [tx.id]: !prev[tx.id] }))}
                    onLongPress={longPress}
                    onOpenActions={() => setActionSheet({ tx })}
                  />
                );
              });
              return elements;
            })()}
          </div>
        )}
      </div>

      <p style={{ fontSize: '0.65rem', color: '#9ca3af', textAlign: 'center', fontStyle: 'italic', padding: '4px 0' }}>
        🔒 {lang === 'am' ? 'መረጃው በዚህ ስልክ ብቻ ይቀመጣል' : 'Saved on this phone only'}
      </p>

      {/* Action sheet — Edit / Delete / Cancel */}
      {actionSheet && (
        <ActionSheet
          tx={actionSheet.tx}
          lang={lang}
          onClose={() => setActionSheet(null)}
          onEdit={() => {
            setActionSheet(null);
            onEditSupplierTransaction?.(actionSheet.tx);
          }}
          onDelete={() => {
            // Commit P: replace window.confirm with proper in-app confirm modal.
            // Routes through deleteConfirmTarget state instead of native dialog.
            setDeleteConfirmTarget(actionSheet.tx);
            setActionSheet(null);
          }}
        />
      )}

      {/* Commit P: in-app delete confirm modal — matches CustomerDetail pattern */}
      {deleteConfirmTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirmTarget(null); }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 20,
              padding: 22,
              width: '100%', maxWidth: 380,
              boxShadow: '0 20px 40px -8px rgba(0,0,0,0.3)',
              border: '2px solid #fecaca',
            }}
          >
            <div style={{ fontSize: '2.4rem', textAlign: 'center', marginBottom: 8 }}>🗑️</div>
            <h3
              style={{
                fontSize: '1.1rem', fontWeight: 800,
                color: '#991b1b', textAlign: 'center', marginBottom: 6,
              }}
            >
              {lang === 'am' ? 'መዝገብ ይሰረዝ?' : 'Delete this entry?'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', textAlign: 'center', marginBottom: 6 }}>
              {deleteConfirmTarget.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT
                ? (lang === 'am' ? 'ክፍያ' : 'Payment')
                : (lang === 'am' ? 'ግዢ' : 'Purchase')}
              {' · '}
              <strong style={{ color: '#1f2937' }}>
                {fmt(deleteConfirmTarget.amount || 0)} {lang === 'am' ? 'ብር' : 'birr'}
              </strong>
              {deleteConfirmTarget.item_name && (
                <span> · {deleteConfirmTarget.item_name}</span>
              )}
            </p>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', marginBottom: 16 }}>
              {lang === 'am'
                ? 'መልሰው ሊያገኙት አይችሉም።'
                : 'This cannot be undone.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  const id = deleteConfirmTarget.id;
                  setDeleteConfirmTarget(null);
                  onDeleteSupplierTransaction?.(id);
                }}
                style={{
                  width: '100%', padding: 14,
                  background: '#dc2626', color: '#fff',
                  border: 'none', borderRadius: 12,
                  fontSize: '0.95rem', fontWeight: 800,
                  cursor: 'pointer', minHeight: 48,
                }}
              >
                {lang === 'am' ? 'አዎ፣ ሰርዝ' : 'Yes, delete'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                style={{
                  width: '100%', padding: 14,
                  background: '#f3f4f6', color: '#374151',
                  border: 'none', borderRadius: 12,
                  fontSize: '0.9rem', fontWeight: 700,
                  cursor: 'pointer', minHeight: 48,
                }}
              >
                {lang === 'am' ? 'ይቅር' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── subcomponents ────────────────────────────────────────────────────

function QuickAction({ icon, label, onClick, href, disabled, variant }) {
  // Variants:
  //   primary-red → solid red (Buy, the supplier-side primary)
  //   green       → green (Pay, Mark paid)
  //   amber       → amber outline (Call)
  const palette = {
    'primary-red': { bg: '#dc2626', color: '#fff', border: '#dc2626' },
    green:         { bg: '#16a34a', color: '#fff', border: '#16a34a' },
    amber:         { bg: '#fff',    color: '#b8842c', border: '#fbbf24' },
  };
  const p = palette[variant] || palette['primary-red'];
  const styles = {
    background: disabled ? '#f3f4f6' : p.bg,
    color: disabled ? '#9ca3af' : p.color,
    border: `1px solid ${disabled ? '#e5e7eb' : p.border}`,
    borderRadius: 10,
    padding: '10px 6px',
    fontSize: '0.72rem', fontWeight: 700,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    transition: 'all 0.12s',
    textDecoration: 'none',
  };
  if (href && !disabled) {
    return <a href={href} style={styles} className="press-scale">{icon}<span>{label}</span></a>;
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="press-scale" style={styles}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function HistoryRow({ tx, lang, expanded, onToggleExpand, onLongPress, onOpenActions }) {
  const isPayment = tx.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT;
  const tagColor = isPayment ? '#166534' : '#991b1b';
  const tagBg = isPayment ? '#d1fae5' : '#fee2e2';
  const amountColor = isPayment ? '#166534' : '#991b1b';

  return (
    <div
      onPointerDown={(e) => onLongPress.start(e, tx)}
      onPointerUp={onLongPress.cancel}
      onPointerLeave={onLongPress.cancel}
      onPointerCancel={onLongPress.cancel}
      style={{
        background: isPayment ? '#f0fdf4' : '#fef2f2',
        border: `1px solid ${isPayment ? '#bbf7d0' : '#fecaca'}`,
        borderRadius: 10,
        padding: '8px 10px',
        display: 'flex', alignItems: 'flex-start', gap: 8,
      }}
    >
      {/* Photo thumbnail (purchase only) */}
      {!isPayment && (tx.photo || (Array.isArray(tx.photos) && tx.photos.length > 0)) && (
        <PhotoAttachment
          photo={tx.photo}
          photos={tx.photos}
          lang={lang}
          label={lang === 'am' ? 'የግዢ ፎቶ ይመልከቱ' : 'View purchase photo'}
          size={40}
        />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'inline-block',
          background: tagBg, color: tagColor,
          padding: '1px 6px', borderRadius: 4,
          fontSize: '0.58rem', fontWeight: 800,
          letterSpacing: '0.06em',
        }}>
          {isPayment
            ? (lang === 'am' ? 'ክፍያ' : 'PAYMENT')
            : (lang === 'am' ? 'ግዢ' : 'PURCHASE')}
        </span>
        {tx.item_name && (
          <p style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600, marginTop: 2 }}>
            {tx.item_name}
          </p>
        )}
        <p style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 2, lineHeight: 1.3 }}>
          {formatEthiopian(tx.created_at)}
          {tx.actor_name_snapshot && <span> · {lang === 'am' ? 'በ' : 'by'} {tx.actor_name_snapshot}</span>}
          {' · '}
          <span>{lang === 'am' ? 'ቀሪ' : 'after'}: {fmt(tx.balance_after || 0)} {lang === 'am' ? 'ብር' : 'birr'}</span>
        </p>
      </div>

      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <p style={{
          fontSize: '0.95rem', fontWeight: 800,
          color: amountColor,
          fontFamily: 'Manrope, system-ui, sans-serif',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {isPayment ? '−' : '+'}{fmt(tx.amount || 0)}
        </p>
        {/* Commit P: bigger ⋮ menu — primary edit/delete affordance (long-press is fallback) */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenActions?.(); }}
          aria-label={lang === 'am' ? 'ምርጫዎች · ለማስተካከል ወይም ለመሰረዝ' : 'More · edit or delete'}
          style={{
            background: '#fff', border: '1px solid #fecaca',
            color: '#991b1b',
            width: 32, height: 32, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            marginTop: 4,
            flexShrink: 0,
          }}
          className="press-scale"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function ActionSheet({ tx, lang, onClose, onEdit, onDelete }) {
  const isPayment = tx.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{
        background: '#fff',
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        width: '100%', maxWidth: 480,
        padding: '14px 16px 20px',
        boxShadow: '0 -8px 24px -8px rgba(0,0,0,0.18)',
      }}>
        <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 12px' }} />
        <p style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
          {isPayment
            ? (lang === 'am' ? 'ክፍያ መዝገብ' : 'Payment entry')
            : (lang === 'am' ? 'ግዢ መዝገብ' : 'Purchase entry')}
          {' · '}
          {fmt(tx.amount || 0)} {lang === 'am' ? 'ብር' : 'birr'}
        </p>
        <button
          type="button"
          onClick={onEdit}
          className="press-scale"
          style={{
            width: '100%', padding: 12, marginBottom: 6,
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 10, fontSize: '0.9rem', fontWeight: 700,
            color: '#991b1b', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Pencil className="w-4 h-4" />
          {lang === 'am' ? 'አስተካክል' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="press-scale"
          style={{
            width: '100%', padding: 12, marginBottom: 6,
            background: '#fff', border: '1px solid #fecaca',
            borderRadius: 10, fontSize: '0.9rem', fontWeight: 700,
            color: '#dc2626', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Trash2 className="w-4 h-4" />
          {lang === 'am' ? 'ሰርዝ' : 'Delete'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="press-scale"
          style={{
            width: '100%', padding: 12,
            background: 'transparent', border: '1px solid #e5e7eb',
            borderRadius: 10, fontSize: '0.9rem', fontWeight: 700,
            color: '#6b7280', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <X className="w-4 h-4" />
          {lang === 'am' ? 'ይቅር' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}

export default SupplierDetail;
