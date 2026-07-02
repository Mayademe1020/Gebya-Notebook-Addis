// CustomerDetail.jsx — simplified credit detail page
//
// Layout (top → bottom):
//   1. Dark header band       · back + photo/avatar + name + phone + status pill
//   2. Telegram link state    · linked / manual / (none — hidden if no phone)
//   3. Balance block          · owes me + days late + on-time/entries/due stats
//   4. History                · simplified rows with left border stripe + chevron
//   5. Trust line             · 🔒 Backed up securely. Amounts auto-hide for privacy.
//
// Touch targets ≥44px · privacy mode · Ethiopian calendar.
// Long-press removed — tap row → TransactionDetailSheet.

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, MessageCircle, Pencil, Phone, Plus, Wallet, X,
} from 'lucide-react';
import { fmt } from '../utils/numformat';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';
import { useLang } from '../context/LangContext';

const DAY_MS = 24 * 60 * 60 * 1000;

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

// ─── component ────────────────────────────────────────────────────────
function CustomerDetail({
  customer,
  shopName,
  onBack,
  onAddCredit,
  onRecordPayment,
  onMarkFullyPaid,
  onToggleTelegramNotify,   // kept for compatibility, surfaced inside the TG block
  onOpenTelegramConnect,
  onResendTelegramUpdate,
  onRemind,
  onEditCustomer,              // Commit C.2 · Edit customer (name/phone/Telegram/photo)
  onSelectTransaction,         // NEW · tap transaction row → open detail sheet
  isOnline = true,
  isSlowConnection = false,
}) {
  const { t, lang } = useLang();

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
              fontSize: '0.85rem', fontWeight: 700,
              cursor: 'pointer', padding: '8px 10px',
              minHeight: 44, minWidth: 44,
              borderRadius: 8,
            }}
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{lang === 'am' ? 'ተመለስ · ደንበኞች' : 'Back · Customers'}</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Compact status pill — saves vertical space */}
            {(customer.has_overdue && customer.overdue_days > 0) && (
              <span style={{
                background: '#fee2e2', color: '#991b1b',
                padding: '2px 8px', borderRadius: 999,
                fontSize: '0.62rem', fontWeight: 800,
                letterSpacing: '0.04em',
                flexShrink: 0,
              }}>
                {customer.overdue_days}{lang === 'am' ? 'ቀን ያለፈው' : 'd OVERDUE'}
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
                👑 {lang === 'am' ? 'በወቅቱ' : 'ON TIME'}
              </span>
            )}

            {/* Edit customer button — Commit C.2.
                Opens CustomerForm pre-filled so the shopkeeper can add or
                update phone, Telegram, photo, or note for an existing customer. */}
            {onEditCustomer && (
              <button
                type="button"
                onClick={() => onEditCustomer(customer)}
                className="press-scale"
                aria-label={lang === 'am' ? 'አስተካክል' : 'Edit customer'}
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

        {/* Identity row — avatar 44 + name + phone/entries one line.
            Commit C.5: When there's no photo, the avatar becomes a tappable
            button that opens the edit form so the shopkeeper can add a photo
            retroactively. Subtle 📷 hint badge nudges discovery. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          {customer.photo ? (
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              position: 'relative', flexShrink: 0, overflow: 'hidden',
            }}>
              <img src={customer.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
          ) : (
            <button
              type="button"
              onClick={() => onEditCustomer?.(customer)}
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
              {/* 📷 hint badge — bottom-right, signals tap-to-add */}
              <span style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 16, height: 16, borderRadius: '50%',
                background: '#fff',
                border: '1.5px solid #1a1a1a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.55rem',
                color: '#1a1a1a',
              }}>📷</span>
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
            </button>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.15 }}>
              {customer.display_name}
            </p>
            {/* Identity line: phone (or Telegram if no phone) — dropped redundant
                "N entries" since OWES ME card shows the same. Commit C.1 polish. */}
            <p style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {customer.phone_number ? (
                <a
                  href={`tel:${customer.phone_number}`}
                  style={{ color: '#fff', textDecoration: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  📞 {customer.phone_number}
                </a>
              ) : customer.telegram_username ? (
                <span>💬 @{customer.telegram_username}</span>
              ) : (
                <span style={{ fontStyle: 'italic', opacity: 0.7 }}>
                  {lang === 'am' ? 'ስልክ ወይም ቴሌግራም የለም' : 'No phone or Telegram'}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ═══ 2. TELEGRAM LINK STATE BLOCK ══════════════════════════════════════════
          Commit T2 polish: the WHOLE row is tappable now (not just the small + Link
          button). Easier to hit on small phones. Action button stays for visual
          affordance but the row click also fires onOpenTelegramConnect. */}
      {tg !== 'none' && (
        <button
          type="button"
          onClick={onOpenTelegramConnect}
          className="press-scale"
          style={{
            background: tg === 'linked' ? '#f0fdf4' : tg === 'manual' ? '#fffbeb' : '#fff',
            border: `1px solid ${tg === 'linked' ? '#a3e9c1' : tg === 'manual' ? '#fde68a' : '#ece6d6'}`,
            borderRadius: 10,
            padding: '8px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10,
            marginTop: -8, // Float slightly into the dark band for visual depth
            position: 'relative', zIndex: 2,
            boxShadow: '0 2px 8px -2px rgba(0,0,0,0.06)',
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
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
            <p style={{
              fontSize: '0.75rem', fontWeight: 700, flex: 1, minWidth: 0,
              color: tg === 'linked' ? '#047857' : tg === 'manual' ? '#92400e' : '#1a1a1a',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {tg === 'linked'
                ? (lang === 'am' ? '✓ ቦት ተገናኝቷል' : '✓ Bot connected')
                : tg === 'manual'
                  ? (lang === 'am' ? `ቴሌḡራም · ${customer.telegram_username || ''}` : `Telegram · ${customer.telegram_username || ''}`)
                  : (lang === 'am' ? 'ለማስታወሻ ቴሌግራም ይጨምሩ' : 'Add Telegram for reminders')}
            </p>
          </div>
          <span
            style={{
              background: tg === 'linked' ? '#047857' : tg === 'manual' ? '#92400e' : '#1a1a1a',
              color: '#fff',
              padding: '5px 10px', borderRadius: 6,
              fontSize: '0.68rem', fontWeight: 800,
              flexShrink: 0,
              minHeight: 28,
              display: 'inline-flex', alignItems: 'center',
            }}
          >
            {tg === 'linked'
              ? (lang === 'am' ? 'አያያዝ' : 'Manage')
              : (lang === 'am' ? '+ አገናኝ' : '+ Link')}
          </span>
        </button>
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
          {/* Prominent OVERDUE badge above the amount — Commit C.1 polish.
              Promotes the urgency signal so shopkeepers immediately know
              this is a chase-now situation, not a "we have time" one. */}
          {customer.has_overdue && customer.overdue_days > 0 && (
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
              🔴 {customer.overdue_days}{lang === 'am' ? 'ቀን ያለፈው' : 'd overdue'}
            </span>
          )}
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
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end',
          gap: 4, fontSize: '0.7rem', color: '#6b7280',
        }}>
          <span>
            <strong style={{ color: '#1f2937', fontWeight: 700 }}>{customer.transaction_count || 0}</strong>{' '}
            {lang === 'am' ? 'መዝገብ' : 'entries'}
          </span>
          {/* On-time rate as a percentage when there's enough data — clearer
              than "0/1" fraction notation. Commit C.1 polish. */}
          {customer.on_time_eligible > 0 && (() => {
            const pct = Math.round((customer.on_time_count / customer.on_time_eligible) * 100);
            const pctColor = pct >= 80 ? '#047857' : pct >= 50 ? '#b8842c' : '#dc2626';
            return (
              <span>
                <strong style={{ color: pctColor, fontWeight: 700 }}>
                  {pct}%
                </strong>{' '}
                {lang === 'am' ? 'በወቅቱ' : 'on time'}
                <span style={{ color: '#9ca3af', marginLeft: 3, fontSize: '0.62rem' }}>
                  ({customer.on_time_count}/{customer.on_time_eligible})
                </span>
              </span>
            );
          })()}
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

      {/* ═══ 5. HISTORY ══════════════════════════════════════════ */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px 4px' }}>
          <p style={{ fontSize: '0.62rem', fontWeight: 800, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {lang === 'am' ? 'መዝገብ' : 'History'} · {historyRows.length} {lang === 'am' ? 'መዝገብ' : 'entries'}
          </p>
          {/* Commit P: stronger discoverability hint for edit/delete */}
          <p
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              background: '#f5f1ea',
              color: '#6b4f1d',
              padding: '2px 8px',
              borderRadius: 999,
              border: '1px solid #ece6d6',
            }}
          >
            {lang === 'am' ? 'ለማስተካከል ⋮ ይንኩ ወይም ይዘմልኩ' : '⋮ or long-press to edit'}
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
            {/* Commit C.5: Same-day grouping. We emit a sticky-style date
                header whenever the row's date changes from the previous row.
                Reduces visual noise when many entries share a date. */}
            {(() => {
              const elements = [];
              let lastDate = null;
              historyRows.forEach((tx, idx) => {
                const txDate = formatEthiopian(tx.created_at);
                if (txDate !== lastDate) {
                  // Count how many entries are on this same date
                  const sameDayCount = historyRows.filter(
                    r => formatEthiopian(r.created_at) === txDate
                  ).length;
                  elements.push(
                    <div
                      key={`date_${txDate}_${idx}`}
                      style={{
                        background: '#faf8f3',
                        borderTop: idx === 0 ? 'none' : '1px solid #f5f1ea',
                        borderBottom: '1px solid #f5f1ea',
                        padding: '6px 14px',
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        color: '#6b7280',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
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

      {/* ═══ 6. TRUST LINE ══════════════════════════════════════════ */}
      <p style={{
        textAlign: 'center', fontSize: '0.66rem', color: '#9ca3af',
        padding: '8px 14px 4px',
      }}>
        🔒 {lang === 'am'
          ? 'በደህንነት ይቀመጣል። መጠኖች በራስ ሰር ይደብቃሉ።'
          : 'Backed up securely. Amounts auto-hide for privacy.'}
      </p>
    </div>
  );
}

// ─── Simplified History row — date + description + amount + chevron ──
function HistoryRow({ tx, isLast, lang, onSelectTransaction }) {
  const isPayment = tx.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT;

  const amountColor = isPayment ? '#047857' : '#b8842c';
  const sign = isPayment ? '−' : '+';
  const borderColor = isPayment ? '#047857' : '#C4883A';

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
          {tx.item_note || (isPayment
            ? (lang === 'am' ? 'ክፍያ' : 'Payment')
            : (lang === 'am' ? 'ዱቤ' : 'Credit'))}
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

export default CustomerDetail;
