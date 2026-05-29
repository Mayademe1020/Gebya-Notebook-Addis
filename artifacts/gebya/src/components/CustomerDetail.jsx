// CustomerDetail.jsx — Cockpit Synthesis v0.3 customer detail page
//
// Layout (top → bottom):
//   1. Dark header band       · back + photo/avatar + name + phone + status pill
//   2. Telegram link state    · linked / manual / (none — hidden if no phone)
//   3. Balance block          · owes me + days late + on-time/entries/due stats
//   4. 4-icon quick actions   · Credit · Payment · Mark paid · Remind
//   5. History                · tagged rows with settlement breadcrumb badges
//                               + 🧺 breakdown expander + long-press action sheet
//   6. Trust line             · 🔒 Saved on this phone only
//
// Sizes locked: avatar 56px detail · action 48px min · history row ~64px ·
// touch targets ≥44px primary / ≥32px secondary.
//
// Long-press: pointerdown + 500ms timer → action sheet (Edit · Delete · Cancel).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Bell, CheckCircle2, ChevronDown, ChevronUp,
  Link2, MessageCircle, MoreVertical, Phone, Plus, RefreshCcw, Wallet, X, Pencil, Trash2,
} from 'lucide-react';
import { fmt } from '../utils/numformat';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';
import { useLang } from '../context/LangContext';
import { daysAgoLabel } from '../utils/reminders';

const DAY_MS = 24 * 60 * 60 * 1000;
const LONG_PRESS_MS = 500;

// ─── helpers ──────────────────────────────────────────────────────────
function initialsOf(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

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

function telegramState(customer) {
  if (customer?.telegram_chat_id) return 'linked';
  if (customer?.telegram_username) return 'manual';
  return 'none';
}

// ─── long-press hook ──────────────────────────────────────────────────
function useLongPress(onLongPress) {
  const timerRef = useRef(null);
  const targetRef = useRef(null);
  const triggeredRef = useRef(false);

  const handlers = {
    onPointerDown: (e, payload) => {
      triggeredRef.current = false;
      targetRef.current = payload;
      timerRef.current = setTimeout(() => {
        triggeredRef.current = true;
        onLongPress?.(payload);
      }, LONG_PRESS_MS);
    },
    onPointerUp: () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } },
    onPointerLeave: () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } },
    onPointerCancel: () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } },
    wasLongPressed: () => triggeredRef.current,
  };
  return handlers;
}

// ─── component ────────────────────────────────────────────────────────
function CustomerDetail({
  customer,
  onBack,
  onAddCredit,
  onRecordPayment,
  onMarkFullyPaid,
  onToggleTelegramNotify,   // kept for compatibility, surfaced inside the TG block
  onOpenTelegramConnect,
  onResendTelegramUpdate,
  onRemind,
  onEditCustomerTransaction,   // NEW · long-press → Edit
  onDeleteCustomerTransaction, // NEW · long-press → Delete
  isOnline = true,
  isSlowConnection = false,
}) {
  const { t, lang } = useLang();
  const [actionSheet, setActionSheet] = useState(null); // null | { tx }
  const [expandedRows, setExpandedRows] = useState({}); // { [txId]: true }
  const longPress = useLongPress((tx) => setActionSheet({ tx }));

  if (!customer) return null;

  const balance = Number(customer.balance || 0);
  const hasBalance = balance > 0;
  const tg = telegramState(customer);
  const initials = initialsOf(customer.display_name);
  const grad = gradientFor(customer.display_name);

  // ─── Telegram link sub-state (from existing fields) ──────────────────
  const hasLinkedBorrower = !!customer.telegram_chat_id;
  const hasManualTelegram = !!customer.telegram_username;
  const hasPendingLink = !hasLinkedBorrower && !!customer.telegram_link_requested_at;
  const isTelegramNotifyEnabled = hasLinkedBorrower && customer.telegram_notify_enabled;

  // ─── History rows with running balance + settlement breadcrumb ───────
  const historyRows = useMemo(() => {
    let runningBalance = balance;
    return (customer.transactions || []).map((item) => {
      const balanceAfter = runningBalance;
      runningBalance = item.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT
        ? runningBalance + Number(item.amount || 0)
        : runningBalance - Number(item.amount || 0);
      return { ...item, balance_after: balanceAfter };
    });
  }, [customer.transactions, balance]);

  // Top customer detection (matches CustomerList logic)
  const isTopCustomer = customer.on_time_eligible > 0
    && customer.on_time_count === customer.on_time_eligible
    && customer.on_time_count >= 3;

  // ─── render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-3" style={{ paddingBottom: 16 }}>

      {/* ═══ 1. DARK HEADER BAND · compact (~80px) ══════════════════════════════════════════ */}
      <div
        style={{
          background: 'linear-gradient(180deg, #1a1a1a 0%, #2a2a2a 100%)',
          color: '#fff',
          padding: '8px 14px 12px',
          marginLeft: -12, marginRight: -12, marginTop: -12,
        }}
      >
        {/* Top row: back link + status pill on the right (so they share one line) */}
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
            <span>{lang === 'am' ? 'ተመለስ · ደንበኞች' : 'Back · Customers'}</span>
          </button>

          {/* Compact status pill on the right — saves vertical space */}
          {(customer.has_overdue && customer.overdue_days > 0) && (
            <span style={{
              background: '#fee2e2', color: '#991b1b',
              padding: '2px 8px', borderRadius: 999,
              fontSize: '0.62rem', fontWeight: 800,
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}>
              {customer.overdue_days}d {lang === 'am' ? 'ቆይቷል' : 'OVERDUE'}
            </span>
          )}
          {!customer.has_overdue && isTopCustomer && (
            <span style={{
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#1a1a1a',
              padding: '2px 8px', borderRadius: 999,
              fontSize: '0.62rem', fontWeight: 800,
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}>
              👑 {lang === 'am' ? 'በሰዓቱ' : 'ON TIME'}
            </span>
          )}
        </div>

        {/* Identity row — avatar 44 + name + phone/entries one line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          {/* Smaller avatar (44 → was 56) */}
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            position: 'relative', flexShrink: 0, overflow: 'hidden',
          }}>
            {customer.photo ? (
              <img src={customer.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: grad,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '1rem', fontWeight: 800,
              }}>{initials}</div>
            )}
            {isTopCustomer && (
              <div style={{
                position: 'absolute', top: -4, left: -4,
                width: 18, height: 18, borderRadius: '50%',
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                border: '2px solid #1a1a1a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem',
              }}>👑</div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.15 }}>
              {customer.display_name}
            </p>
            <p style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: 1, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {customer.phone_number && (
                <a
                  href={`tel:${customer.phone_number}`}
                  style={{ color: '#fff', textDecoration: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  📞 {customer.phone_number}
                </a>
              )}
              {customer.phone_number && customer.transaction_count > 0 && <span>·</span>}
              {customer.transaction_count > 0 && (
                <span>
                  {customer.transaction_count} {lang === 'am' ? 'መዝገብ' : 'entries'}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ═══ 2. TELEGRAM LINK STATE BLOCK ══════════════════════════════════════════ */}
      {(tg !== 'none' || customer.phone_number) && (
        <div
          style={{
            background: tg === 'linked' ? '#f0fdf4' : tg === 'manual' ? '#fffbeb' : '#fff',
            border: `1px solid ${tg === 'linked' ? '#a3e9c1' : tg === 'manual' ? '#fde68a' : '#ece6d6'}`,
            borderRadius: 10,
            padding: '10px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10,
            marginTop: -8, // Float slightly into the dark band for visual depth
            position: 'relative', zIndex: 2,
            boxShadow: '0 2px 8px -2px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <MessageCircle
              className="w-4 h-4"
              style={{
                color: tg === 'linked' ? '#047857' : tg === 'manual' ? '#92400e' : '#9ca3af',
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{
                fontSize: '0.78rem', fontWeight: 700,
                color: tg === 'linked' ? '#047857' : tg === 'manual' ? '#92400e' : '#1a1a1a',
              }}>
                {tg === 'linked'
                  ? (lang === 'am' ? '✓ ቦት ተገናኝቷል' : '✓ Bot connected')
                  : tg === 'manual'
                    ? (lang === 'am' ? 'ቴሌግራም በእጅ' : 'Manual Telegram')
                    : (lang === 'am' ? 'ቴሌግራም አልተገናኘም' : 'No Telegram link')}
                {tg === 'manual' && customer.telegram_username && (
                  <span style={{ marginLeft: 5, fontWeight: 500, opacity: 0.85 }}>
                    · {customer.telegram_username}
                  </span>
                )}
              </p>
              <p style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: 1 }}>
                {tg === 'linked'
                  ? (isTelegramNotifyEnabled
                    ? (lang === 'am' ? 'ራስ-ሰር ማሳወቂያ በርቷል' : 'Auto-updates ON')
                    : (lang === 'am' ? 'ራስ-ሰር ማሳወቂያ ጠፍቷል' : 'Auto-updates OFF'))
                  : tg === 'manual'
                    ? (lang === 'am' ? 'ቦት ለማገናኘት ይጫኑ' : 'Link bot to send auto-updates')
                    : hasPendingLink
                      ? (lang === 'am' ? 'ቦት ይጠብቃል' : 'Waiting for bot start')
                      : (lang === 'am' ? 'ለማስታወሻ ቴሌግራም ይጨምሩ' : 'Add Telegram for reminders')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenTelegramConnect}
            className="press-scale"
            style={{
              background: tg === 'linked' ? '#047857' : tg === 'manual' ? '#92400e' : '#1a1a1a',
              color: '#fff',
              padding: '6px 10px', borderRadius: 6,
              fontSize: '0.7rem', fontWeight: 800,
              cursor: 'pointer', minHeight: 32,
              flexShrink: 0,
              border: 'none',
            }}
          >
            {tg === 'linked'
              ? (lang === 'am' ? 'አያያዝ' : 'Manage')
              : (lang === 'am' ? '+ አገናኝ' : '+ Link')}
          </button>
        </div>
      )}

      {/* ═══ 3. BALANCE BLOCK ══════════════════════════════════════════ */}
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
          <p style={{
            fontSize: '0.6rem', fontWeight: 800,
            color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            {lang === 'am' ? 'ለእኔ ይከፍላሉ' : 'Owes me'}
          </p>
          <p style={{
            fontFamily: 'Manrope, system-ui, sans-serif',
            fontSize: '1.85rem', fontWeight: 800,
            color: customer.has_overdue ? '#dc2626' : hasBalance ? '#b8842c' : '#9ca3af',
            lineHeight: 1, marginTop: 4,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt(balance)}
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#9ca3af', marginLeft: 4 }}>
              {lang === 'am' ? 'ብር' : 'birr'}
            </span>
          </p>
          {customer.has_overdue && customer.overdue_days > 0 && (
            <p style={{ fontSize: '0.65rem', color: '#dc2626', fontWeight: 700, marginTop: 3 }}>
              {lang === 'am'
                ? `−${customer.overdue_days} ቀን ቆይቷል`
                : `−${customer.overdue_days} days late`}
            </p>
          )}
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end',
          gap: 4, fontSize: '0.7rem', color: '#6b7280',
        }}>
          <span>
            <strong style={{ color: '#1f2937', fontWeight: 700 }}>{customer.transaction_count || 0}</strong>{' '}
            {lang === 'am' ? 'መዝገብ' : 'entries'}
          </span>
          {customer.on_time_eligible > 0 && (
            <span>
              <strong style={{ color: '#047857', fontWeight: 700 }}>
                {customer.on_time_count}/{customer.on_time_eligible}
              </strong>{' '}
              {lang === 'am' ? 'በሰዓቱ' : 'on time'}
            </span>
          )}
          {customer.avg_pay_days !== null && customer.avg_pay_days !== undefined && (
            <span>
              {lang === 'am' ? 'አማካይ ክፍያ' : 'Avg pay'}:{' '}
              <strong style={{ color: '#1f2937', fontWeight: 700 }}>{customer.avg_pay_days}d</strong>
            </span>
          )}
          {customer.latest_due_date && (
            <span>
              {lang === 'am' ? 'መጨረሻ ቀን' : 'Due'}:{' '}
              <strong style={{ color: '#1f2937', fontWeight: 700 }}>
                {formatEthiopian(customer.latest_due_date)}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* ═══ 4. QUICK ACTIONS GRID ══════════════════════════════════════════ */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6,
      }}>
        <QuickAction
          variant="primary"
          icon={<Plus className="w-4 h-4" />}
          label={lang === 'am' ? 'ዱቤ' : 'Credit'}
          onClick={onAddCredit}
        />
        <QuickAction
          variant="green"
          icon={<Wallet className="w-4 h-4" />}
          label={lang === 'am' ? 'ክፍያ' : 'Payment'}
          onClick={onRecordPayment}
          disabled={!hasBalance}
        />
        <QuickAction
          variant="green"
          icon={<CheckCircle2 className="w-4 h-4" />}
          label={lang === 'am' ? 'ሙሉ' : 'Mark paid'}
          onClick={() => onMarkFullyPaid?.(customer)}
          disabled={!hasBalance || !onMarkFullyPaid}
        />
        <QuickAction
          variant="amber"
          icon={<Bell className="w-4 h-4" />}
          label={lang === 'am' ? 'አስታውስ' : 'Remind'}
          onClick={() => onRemind?.(customer)}
          disabled={!hasBalance || (!customer.telegram_chat_id && !customer.telegram_username && !customer.phone_number)}
        />
      </div>

      {!hasBalance && (
        <p style={{ fontSize: '0.7rem', color: '#9ca3af', textAlign: 'center', fontStyle: 'italic' }}>
          {lang === 'am' ? 'ምንም ቀሪ ዱቤ የለም' : 'No outstanding balance'}
        </p>
      )}

      {/* ═══ 5. HISTORY ══════════════════════════════════════════ */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px 4px' }}>
          <p style={{ fontSize: '0.62rem', fontWeight: 800, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {lang === 'am' ? 'መዝገብ' : 'History'} · {historyRows.length} {lang === 'am' ? 'መዝገብ' : 'entries'}
          </p>
          <p style={{ fontSize: '0.62rem', color: '#9ca3af', fontStyle: 'italic' }}>
            {lang === 'am' ? '⋮ ለማስተካከል' : 'tap ⋮ to edit'}
          </p>
        </div>

        {historyRows.length === 0 ? (
          <div style={{
            padding: 24,
            background: '#fff',
            border: '1px solid #ece6d6',
            borderRadius: 12,
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
              {lang === 'am' ? 'መዝገብ የለም' : 'No entries yet'}
            </p>
            <p style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 8 }}>
              {lang === 'am' ? 'ለመጀመር ዱቤ ይጨምሩ' : 'Tap + Credit to start'}
            </p>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #ece6d6', borderRadius: 12, overflow: 'hidden' }}>
            {historyRows.map((tx, idx) => (
              <HistoryRow
                key={tx.id || idx}
                tx={tx}
                isLast={idx === historyRows.length - 1}
                expanded={!!expandedRows[tx.id]}
                onToggleExpand={() => setExpandedRows(prev => ({ ...prev, [tx.id]: !prev[tx.id] }))}
                onActionMenu={(t) => setActionSheet({ tx: t })}
                lang={lang}
                longPress={longPress}
              />
            ))}
          </div>
        )}
      </div>

      {/* ═══ 6. TRUST LINE ══════════════════════════════════════════ */}
      <p style={{
        textAlign: 'center', fontSize: '0.66rem', color: '#9ca3af',
        padding: '8px 14px 4px',
      }}>
        🔒 {lang === 'am'
          ? 'በዚህ ስልክ ብቻ ይቀመጣል። ለማንም አንልክም።'
          : 'Saved on this phone only. We never send your numbers anywhere.'}
      </p>

      {/* ═══ ACTION SHEET (long-press) ══════════════════════════════════════════ */}
      {actionSheet && (
        <ActionSheet
          tx={actionSheet.tx}
          lang={lang}
          onClose={() => setActionSheet(null)}
          onEdit={() => {
            const tx = actionSheet.tx;
            setActionSheet(null);
            onEditCustomerTransaction?.(tx);
          }}
          onDelete={() => {
            const tx = actionSheet.tx;
            setActionSheet(null);
            onDeleteCustomerTransaction?.(tx);
          }}
        />
      )}
    </div>
  );
}

// ─── Quick action button ──────────────────────────────────────────────
function QuickAction({ variant, icon, label, onClick, disabled }) {
  const styles = {
    primary: { bg: '#1a1a1a', border: '#1a1a1a', fg: '#fff', labelFg: '#fff' },
    green:   { bg: '#d1f4e0', border: '#a3e9c1', fg: '#047857', labelFg: '#047857' },
    amber:   { bg: '#fff7ed', border: '#fed7aa', fg: '#b8842c', labelFg: '#b8842c' },
    default: { bg: '#fff',    border: '#ece6d6', fg: '#4b5563', labelFg: '#4b5563' },
  };
  const s = styles[variant] || styles.default;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press-scale"
      style={{
        background: disabled ? '#f5f1ea' : s.bg,
        border: `1px solid ${disabled ? '#e5e7eb' : s.border}`,
        borderRadius: 10,
        padding: '10px 4px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        minHeight: 48,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', color: disabled ? '#9ca3af' : s.fg }}>{icon}</div>
      <p style={{
        fontSize: '0.62rem', fontWeight: 700,
        color: disabled ? '#9ca3af' : s.labelFg,
        marginTop: 4,
      }}>
        {label}
      </p>
    </button>
  );
}

// ─── History row with settlement breadcrumb + breakdown expander ──────
function HistoryRow({ tx, isLast, expanded, onToggleExpand, onActionMenu, lang, longPress }) {
  const isPayment = tx.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT;
  const items = Array.isArray(tx.items) && tx.items.length > 0 ? tx.items : null;
  const settlementMode = tx.settlement_mode || null; // 'partial' | 'later' | null

  const amountColor = isPayment ? '#047857' : '#b8842c';
  const sign = isPayment ? '−' : '+';

  return (
    <div
      onPointerDown={(e) => longPress.onPointerDown(e, tx)}
      onPointerUp={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerLeave}
      onPointerCancel={longPress.onPointerCancel}
      style={{
        padding: '12px 14px',
        background: isPayment ? '#f0fdf4' : '#fffbeb',
        borderBottom: isLast ? 'none' : '1px solid #f5f1ea',
        cursor: 'pointer',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Tag row · CREDIT/PAYMENT + settlement breadcrumb */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4, alignItems: 'center' }}>
            <span style={{
              fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.04em',
              padding: '1px 6px', borderRadius: 3,
              background: isPayment ? '#d1f4e0' : '#fef3c7',
              color: isPayment ? '#047857' : '#92400e',
            }}>
              {isPayment
                ? (lang === 'am' ? 'ክፍያ' : 'PAYMENT')
                : (lang === 'am' ? 'ዱቤ' : 'CREDIT')}
            </span>
            {settlementMode === 'partial' && (
              <span style={{
                fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.04em',
                padding: '1px 6px', borderRadius: 3,
                background: '#ede9fe', color: '#6d28d9',
              }}>
                {lang === 'am' ? 'ከሽያጭ' : 'from sale'}
              </span>
            )}
            {settlementMode === 'later' && (
              <span style={{
                fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.04em',
                padding: '1px 6px', borderRadius: 3,
                background: '#ffe4e6', color: '#be123c',
              }}>
                {lang === 'am' ? 'ኋላ ይከፍላል' : 'pay-later'}
              </span>
            )}
          </div>

          {/* Note + meta */}
          {tx.item_note && (
            <p style={{ fontSize: '0.82rem', color: '#1f2937', marginTop: 2, marginBottom: 2 }}>
              {tx.item_note}
            </p>
          )}
          <p style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span>{formatEthiopian(tx.created_at)}</span>
            {!isPayment && tx.due_date && (
              <span>{lang === 'am' ? 'መጨረሻ' : 'due'}: {formatEthiopian(tx.due_date)}</span>
            )}
            {tx.actor_name_snapshot && (
              <span>{lang === 'am' ? 'በ' : 'by'} {tx.actor_name_snapshot}</span>
            )}
            <span>{lang === 'am' ? 'ቀሪ' : 'after'}: {fmt(tx.balance_after || 0)} {lang === 'am' ? 'ብር' : 'birr'}</span>
          </p>

          {/* 🧺 breakdown expander */}
          {items && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                marginTop: 6,
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: '0.62rem', fontWeight: 700,
                color: expanded ? '#fff' : '#1a1a1a',
                background: expanded ? '#1a1a1a' : '#f3f4f6',
                padding: '2px 8px', borderRadius: 999,
                cursor: 'pointer', border: 'none',
                minHeight: 24,
              }}
            >
              🧺 {items.length} {lang === 'am' ? 'ዕቃ' : 'items'}
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          {items && expanded && (
            <div style={{
              marginTop: 6,
              padding: '8px 10px',
              background: '#fff',
              border: '1px solid #ece6d6',
              borderLeft: '3px solid #b8842c',
              borderRadius: 8,
            }}>
              {items.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: '0.74rem', padding: '3px 0',
                }}>
                  <span style={{ color: '#4b5563' }}>• {item.name}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#b8842c' }}>
                    {fmt(item.amount || 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <p style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.95rem', fontWeight: 700,
            color: amountColor,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {sign}{fmt(tx.amount || 0)}
          </p>
          {/* Visible 3-dot menu — for users who don't know to long-press.
              Long-press still works as a power-user shortcut. */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onActionMenu?.(tx); }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={lang === 'am' ? 'ምርጫዎች' : 'More'}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'rgba(0,0,0,0.04)',
              border: 'none',
              color: '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Action sheet (long-press) ──────────────────────────────────────────
function ActionSheet({ tx, lang, onClose, onEdit, onDelete }) {
  // Close on background click; lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const isPayment = tx?.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT;
  const headerLabel = isPayment
    ? (lang === 'am' ? 'ክፍያ' : 'PAYMENT')
    : (lang === 'am' ? 'ዱቤ' : 'CREDIT');

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 60,
        animation: 'gebya-fade-in 0.15s ease',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 480,
          background: '#fff',
          borderRadius: '14px 14px 0 0',
          padding: '14px 0 0',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0) + 12px)',
        }}
      >
        <div style={{ width: 40, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 12px' }} />
        <p style={{
          fontSize: '0.7rem', fontWeight: 800,
          color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase',
          textAlign: 'center', padding: '0 16px 8px',
          borderBottom: '1px solid #ece6d6',
        }}>
          {lang === 'am' ? 'ቀጥሎ' : 'Long-press'} · {headerLabel} {fmt(tx?.amount || 0)} {lang === 'am' ? 'ብር' : 'birr'}
        </p>
        <ActionButton
          icon={<Pencil className="w-4 h-4" />}
          label={lang === 'am' ? 'አስተካክል' : 'Edit entry'}
          onClick={onEdit}
        />
        <ActionButton
          icon={<Trash2 className="w-4 h-4" />}
          label={lang === 'am' ? 'ሰርዝ' : 'Delete'}
          onClick={onDelete}
          danger
        />
        <div
          onClick={onClose}
          style={{
            padding: 14,
            background: '#f5f1ea',
            textAlign: 'center',
            fontSize: '0.9rem', fontWeight: 700,
            color: '#6b7280',
            cursor: 'pointer',
            marginTop: 4,
          }}
        >
          {lang === 'am' ? 'ሰርዝ' : 'Cancel'}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        padding: '14px 18px',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid #f5f1ea',
        display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer',
        fontSize: '0.95rem', fontWeight: 600,
        color: danger ? '#dc2626' : '#1a1a1a',
        minHeight: 48,
        textAlign: 'left',
      }}
    >
      <span style={{ color: danger ? '#dc2626' : '#1a1a1a' }}>{icon}</span>
      {label}
    </button>
  );
}

export default CustomerDetail;
