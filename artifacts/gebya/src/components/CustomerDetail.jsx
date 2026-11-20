// CustomerDetail.jsx — credit detail page (Timeline Intelligence enhancement)
//
// Layout (top → bottom):
//   1. White header          · back + status pill + avatar/name/phone + edit
//   2. Balance block (sticky)· you are owed + stats (Mark Fully Paid lives in row 3)
//   3. Quick Actions         · Mark Fully Paid (Tier 1, dominant) + Transfer + Call
//                              + SMS + Telegram + More
//                              (More sheet: Send Reminder / Edit / Archive —
//                               every previous action stays reachable)
//   4. Follow-up             · Promise to pay + Reminder history, grouped
//   5. Timeline              · search + filter + grouped by date, direction stripe
//   6. Trust line            · 🔒 Backed up securely. Amounts auto-hide for privacy.
//   7. Bottom action bar     · You gave / You got (fixed to bottom)
//
// Shop-owner view intentionally omits the "On-time %" KPI. The underlying
// calculation is untouched and remains visible in the Credit Report (print/
// PDF/CSV), the bank analytics payload, and the platform Admin shop deep-dive.
//
// Touch targets ≥44px · privacy mode · Ethiopian calendar.

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Archive, ArchiveRestore, CalendarClock, CreditCard, MessageSquare, MoreVertical, Pencil, Phone, Wallet, Search, Send, X, ArrowRightLeft, SlidersHorizontal,
} from 'lucide-react';
import { fmt } from '../utils/numformat';
import { formatDays, formatDaysOverdue } from '../utils/durationFormat';
import { toTelUrl, isValidEthiopianPhone } from '../utils/phoneNumber';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import db from '../db';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';
import { getCreditAllocationStatus, getPaymentSettlementCount } from '../utils/customerLedgerMutations';
import { useLang } from '../context/LangContext';
import CustomerReminderHistory from './CustomerReminderHistory';
import { TransactionRow, transactionLabel, transactionStatusBadge } from '@/components/TransactionRow';
import { TelegramIcon, initialsOf, telegramState, DAY_MS } from "./customerDetailHelpers";
import { useAppStore } from '../stores/appStore';
import { label as tr } from '../labels/index.js';


// ─── component ────────────────────────────────────────────────────────
function CustomerDetail({
  customer,
   shopName,
   shopPlan,
   onBack,
  onAddCredit,
  onRecordPayment,
  onMarkFullyPaid,
  onToggleTelegramNotify,
  onOpenTelegramConnect,
  onResendTelegramUpdate,
  onRemind,
  onSmsCustomer,
  onEditCustomer,
  onSelectTransaction,
  onTransfer,
  onArchiveCustomer,
  onRecordPromise,
  onClearPromise,
  isOnline = true,
  isSlowConnection = false,
}) {
  const { t, lang } = useLang();

  if (!customer) return null;

  const balance = Number(customer.balance || 0);
  const hasBalance = balance > 0;
  const tg = telegramState(customer);
  const initials = initialsOf(customer.display_name);
  const isSettled = !hasBalance && (customer.transaction_count || 0) > 0;

  // ─── Telegram link sub-state ────────────────────────────────────────
  const hasLinkedBorrower = !!customer.telegram_chat_id;
  const hasManualTelegram = !!customer.telegram_username;
  const hasPendingLink = !hasLinkedBorrower && !!customer.telegram_link_requested_at;
  const isTelegramNotifyEnabled = hasLinkedBorrower && customer.telegram_notify_enabled;

  // ─── Sticky balance collapse state ──────────────────────────────────
  const [isBalanceCollapsed, setIsBalanceCollapsed] = useState(false);

  // ─── Promise form state ─────────────────────────────────────────────
  const [showPromiseForm, setShowPromiseForm] = useState(false);
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseNote, setPromiseNote] = useState('');

  // ─── Archive confirmation state ────────────────────────────────────
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // ─── More-actions bottom sheet state ────────────────────────────────
  const [showMoreSheet, setShowMoreSheet] = useState(false);

  // Hide the persistent bottom action bar while a transaction sheet/modal is
  // open over it — otherwise the fixed bar (z-45) intercepts clicks meant for
  // the sheet's controls and visually bleeds through.
  const transactionSheetOpen = useAppStore(
    (s) => !!s.customerTransactionModal || !!s.customerTransactionEditTarget || !!s.supplierTransactionModal
  );

  // ─── Tabs + new-tab state (Timeline | Promises | Notes) ───────────────
  const [activeTab, setActiveTab] = useState('timeline');
  const [dateRange, setDateRange] = useState('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [promiseAmount, setPromiseAmount] = useState('');
  const [notesList, setNotesList] = useState(() => Array.isArray(customer.notes) ? customer.notes : []);
  const [promiseHistory, setPromiseHistory] = useState(() => Array.isArray(customer.promise_history) ? customer.promise_history : []);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteText, setEditNoteText] = useState('');

  // ─── Search & Filter state ──────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'credit' | 'pay'

  // ─── Success overlay state ──────────────────────────────────────────
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

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

  // ─── Filtered history rows (incl. Promise-to-Pay as a timeline entry) ───
  const filteredRows = useMemo(() => {
    // Promise to Pay is surfaced in the timeline, grouped by its due date.
    const promiseEntry = customer.promised_pay_date
      ? {
          id: 'promise-entry',
          isPromise: true,
          type: 'promise',
          created_at: customer.promised_pay_date,
          item_note: customer.promise_note || '',
          promiseNote: customer.promise_note || '',
        }
      : null;
    let rows = promiseEntry ? [...historyRows, promiseEntry] : [...historyRows];
    // Newest first so the promise lands under its own due-date group.
    rows = rows.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    if (filterType !== 'all') {
      rows = rows.filter(tx => {
        if (tx.isPromise) return false; // promise is neither a credit nor a payment
        if (filterType === 'credit') return tx.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD;
        if (filterType === 'pay') return tx.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT;
        return true;
      });
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter(tx => {
        if (tx.isPromise) return (tx.promiseNote || '').toLowerCase().includes(term);
        return (tx.item_note || '').toLowerCase().includes(term);
      });
    }
    return rows;
  }, [historyRows, filterType, searchTerm, customer.promised_pay_date, customer.promise_note]);

    // ─── Sticky balance scroll handler ──────────────────────────────────
  useEffect(() => {
    // The scroll container used to carry id="scrollable"; the current AppShell
    // layout scrolls <main>. Fall back to it so the sticky balance block
    // actually collapses on scroll (restores the intended behavior).
    // Also listen to window scroll as a robustness fallback — on some layouts
    // (e.g. desktop viewport where <main> content doesn't overflow) the window
    // is the effective scroll container.
    const scrollable =
      document.getElementById('scrollable')
      || document.querySelector('main');

    const handleScroll = () => {
      let scrollTop = 0;
      if (scrollable) scrollTop = scrollable.scrollTop;
      // Window scroll as fallback when the container itself can't scroll
      if (scrollTop === 0) {
        scrollTop = window.scrollY || window.pageYOffset || 0;
      }
      setIsBalanceCollapsed(scrollTop > 30);
    };

    scrollable?.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollable?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // ─── Promise handlers ───────────────────────────────────────────────
  const handleRecordPromise = () => {
    if (!promiseDate) return;
    const parsed = new Date(promiseDate + 'T23:59:59').getTime();
    if (isNaN(parsed)) return;
    onRecordPromise?.(customer.id, parsed, promiseNote);
    setShowPromiseForm(false);
    setPromiseDate('');
    setPromiseNote('');
  };

  const handleCancelPromise = () => {
    setShowPromiseForm(false);
    setPromiseDate('');
    setPromiseNote('');
  };

  // ─── Notes (private, per-customer) ────────────────────────────────────
  const persistNotes = (next) => {
    setNotesList(next);
    db.customers.update(customer.id, { notes: next }).catch(() => {});
  };
  const addNote = (text) => persistNotes([...notesList, { id: 'n_' + Date.now(), text, created_at: Date.now() }]);
  const updateNote = (id, text) => persistNotes(notesList.map(n => n.id === id ? { ...n, text } : n));
  const deleteNote = (id) => persistNotes(notesList.filter(n => n.id !== id));

  // ─── Promise history (past promises: cleared / missed / paid) ─────────
  const recordPromiseHistory = (status) => {
    const entry = {
      id: 'p_' + Date.now(),
      due: customer.promised_pay_date || null,
      amount: customer.promise_amount || null,
      status,
      at: Date.now(),
    };
    const next = [entry, ...promiseHistory];
    setPromiseHistory(next);
    db.customers.update(customer.id, { promise_history: next }).catch(() => {});
  };
  const handleRecordPromiseExt = () => {
    if (!promiseDate) return;
    const parsed = new Date(promiseDate + 'T23:59:59').getTime();
    if (isNaN(parsed)) return;
    const amt = promiseAmount ? Number(promiseAmount) : null;
    onRecordPromise?.(customer.id, parsed, promiseNote, amt);
    setShowPromiseForm(false);
    setPromiseDate('');
    setPromiseNote('');
    setPromiseAmount('');
  };
  const handleClearPromiseExt = () => {
    const missed = customer.promised_pay_date && customer.promised_pay_date < Date.now();
    recordPromiseHistory(missed ? 'missed' : 'cleared');
    onClearPromise?.(customer.id);
  };

  // ─── Archive handler ────────────────────────────────────────────────
  const handleArchive = () => {
    onArchiveCustomer?.(customer);
    setShowArchiveConfirm(false);
  };

  // ─── Mark fully paid handler (with success overlay) ─────────────────
  const handleMarkFullyPaid = () => {
    setShowSuccessOverlay(true);
    setTimeout(() => {
      setShowSuccessOverlay(false);
      onMarkFullyPaid?.(customer);
    }, 1500);
  };

  // ─── render ──────────────────────────────────────────────────────────
  return (
    <div style={{ paddingBottom: 0, position: 'relative' }}>

      {/* ═══════════════════════════════════════════════════════════════
          1. WHITE HEADER · back + status pill + identity + edit/transfer
          ═══════════════════════════════════════════════════════════════ */}
      <div style={{
        background: '#FFFFFF',
        color: '#171a17',
        padding: '8px 14px 12px',
        borderBottom: '1px solid #e4e6df',
      }}>
        {/* Top row: back button + status pill */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button
            type="button"
            onClick={onBack}
            className="press-scale"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'transparent', border: 'none', color: '#171a17',
              fontSize: '0.85rem', fontWeight: 700,
              cursor: 'pointer', padding: '8px 10px',
              minHeight: 44, minWidth: 44,
              borderRadius: 8,
            }}
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{tr('customers.back-customers', lang)}</span>
          </button>

          {/* Status Pill — single source of truth for overdue state */}
          {(customer.has_overdue && customer.overdue_days > 0) && (
            <span style={{
              background: '#f5e7e1', color: '#a0402a',
              padding: '4px 10px', borderRadius: 999,
              fontSize: '0.62rem', fontWeight: 800,
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}>
              {formatDaysOverdue(customer.overdue_days, lang)}
            </span>
          )}
          {isSettled && (
            <span style={{
              background: '#e7f0e9', color: '#2e6a47',
              padding: '4px 10px', borderRadius: 999,
              fontSize: '0.62rem', fontWeight: 800,
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}>
              {tr('customers.settled', lang)}
            </span>
          )}
          {customer.promised_pay_date && customer.promised_pay_date > Date.now() && !isSettled && (
            <span style={{
              background: '#f9eed4', color: '#7a5416',
              padding: '4px 10px', borderRadius: 999,
              fontSize: '0.62rem', fontWeight: 800,
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}>
              {tr('customers.promise', lang)}
            </span>
          )}
        </div>

        {/* Identity row — avatar + name + phone + edit/transfer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          {customer.photo ? (
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              position: 'relative', flexShrink: 0, overflow: 'hidden',
            }}>
              <img src={customer.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <button
                type="button"
                onClick={() => onEditCustomer?.(customer)}
                aria-label={t.addPhoto}
                className="press-scale"
                style={{
                  width: 44, height: 44, borderRadius: '50%',
                  position: 'relative', flexShrink: 0, overflow: 'hidden',
                  border: '2px dashed #e4e6df',
                  background: '#1b4332',
                  padding: 0, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: '1rem', fontWeight: 800,
                }}
              >
                {initials}
                <span style={{
                  position: 'absolute', bottom: -4, right: -4,
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#fff',
                  border: '2px solid #171a17',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.85rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}>📷</span>
              </button>
              <span style={{
                fontSize: '0.6875rem',
                color: '#8b9086',
                fontWeight: 600,
              }}>
                {t.addPhoto}
              </span>
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.15, margin: 0 }}>
              {customer.display_name}
            </p>
            <p style={{ fontSize: '0.7rem', color: '#5b6158', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', margin: 0 }}>
              {customer.phone_number ? (
                <a
                  href={`tel:${customer.phone_number}`}
                  style={{ color: '#5b6158', textDecoration: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  📞 {customer.phone_number}
                </a>
              ) : customer.telegram_username ? (
                <span>💬 @{customer.telegram_username}</span>
              ) : (
                <span style={{ fontStyle: 'italic', color: '#8b9086' }}>
                  {tr('customers.no-phone-or-telegram', lang)}
                </span>
              )}
            </p>
          </div>

          {/* Edit and Transfer buttons */}
          {onEditCustomer && (
            <button
              type="button"
              onClick={() => onEditCustomer(customer)}
              className="press-scale"
              aria-label={tr('customers.edit-customer', lang)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32,
                borderRadius: '50%',
                background: '#f5f6f2',
                border: 'none',
                color: '#5b6158',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          COMPACT STICKY HEADER — shows when scrolled past main header
          ═══════════════════════════════════════════════════════════════ */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 15,
          background: '#fff',
          borderBottom: isBalanceCollapsed ? '1px solid #e4e6df' : 'none',
          padding: isBalanceCollapsed ? '10px 14px' : '0',
          display: 'flex',
          alignItems: 'center',
          gap: isBalanceCollapsed ? 10 : 0,
          opacity: isBalanceCollapsed ? 1 : 0,
          pointerEvents: isBalanceCollapsed ? 'auto' : 'none',
          height: isBalanceCollapsed ? 'auto' : 0,
          overflow: 'hidden',
          transition: 'opacity 0.2s ease, padding 0.2s ease, height 0.2s ease',
        }}
      >
        {/* Small avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: '#1b4332', color: '#fff',
          fontSize: '0.7rem', fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {initials}
        </div>
        {/* Name + balance */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: '0.85rem', fontWeight: 700, margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {customer.display_name}
          </p>
          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.75rem', fontWeight: 700,
            color: isSettled ? '#2e6a47' : '#a0402a',
            margin: 0,
          }}>
            {fmt(balance)} <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#8b9086' }}>{tr('customers.birr', lang)}</span>
          </p>
        </div>
        {/* Contextual date/status chip — keeps the key "when" visible on scroll */}
        {(() => {
          const due = customer.promised_pay_date;
          const isPromise = due && due > Date.now();
          if (isSettled) {
            return <span style={{ background: '#e7f0e9', color: '#2e6a47', padding: '3px 8px', borderRadius: 999, fontSize: '0.58rem', fontWeight: 800, flexShrink: 0 }}>✓ {tr('customers.settled-2', lang)}</span>;
          }
          if (isPromise) {
            return <span style={{ background: '#f9eed4', color: '#7a5416', padding: '3px 8px', borderRadius: 999, fontSize: '0.58rem', fontWeight: 800, flexShrink: 0 }}>{tr('customers.due', lang)} {formatEthiopian(due)}</span>;
          }
          if (customer.has_overdue && customer.overdue_days > 0) {
            return <span style={{ background: '#f5e7e1', color: '#a0402a', padding: '3px 8px', borderRadius: 999, fontSize: '0.58rem', fontWeight: 800, flexShrink: 0 }}>{formatDays(customer.overdue_days, lang)}</span>;
          }
          return null;
        })()}
      </div>
      <div
        id="balanceBlock"
        style={{
          background: '#f5f6f2',
          padding: '8px 14px 14px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          transition: 'opacity 0.2s ease',
          display: isBalanceCollapsed ? 'none' : 'block',
        }}
      >
        {isBalanceCollapsed ? (
          /* Collapsed state */
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1, minWidth: 0 }}>
              <span style={{
                fontSize: '0.65rem', fontWeight: 800,
                color: '#8b9086', letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                {isSettled
                  ? (tr('customers.settled-2', lang))
                  : (tr('customers.you-are-owed', lang))}
              </span>
              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 800,
                color: isSettled ? '#2e6a47' : hasBalance ? '#a0402a' : '#8b9086',
                fontSize: '1.2rem',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                transition: 'all 0.3s ease',
              }}>
                {fmt(balance)} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#8b9086' }}>{tr('customers.birr', lang)}</span>
              </p>
            </div>

            {isSettled && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 6,
                fontSize: '0.7rem', fontWeight: 700,
                color: '#2e6a47',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                {tr('customers.paid', lang)}
              </span>
            )}
          </>
        ) : (
          /* Expanded state */
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, transition: 'all 0.3s ease' }}>
              <div style={{ flex: 1 }}>
                <p style={{
                  fontSize: '0.7rem', fontWeight: 800,
                  color: '#8b9086', letterSpacing: '0.08em', textTransform: 'uppercase',
                  margin: 0, transition: 'all 0.3s ease',
                }}>
                  {isSettled
                    ? (tr('customers.settled-2', lang))
                    : (tr('customers.you-are-owed', lang))}
                </p>
                <p style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '1.8rem', fontWeight: 800,
                  color: isSettled ? '#2e6a47' : '#a0402a',
                  lineHeight: 1, marginTop: 4,
                  letterSpacing: '-0.02em',
                  transition: 'all 0.3s ease',
                }}>
                  {fmt(balance)}
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8b9086', marginLeft: 4 }}>
                    {tr('customers.birr', lang)}
                  </span>
                </p>
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end',
                gap: 4, fontSize: '0.7rem', color: '#5b6158', transition: 'all 0.3s ease',
              }}>
                <span>
                  <span style={{ fontWeight: 700, color: '#171a17' }}>{customer.transaction_count || 0}</span>{' '}
                  {tr('customers.entries', lang)}
                </span>
                {/* On-time % intentionally not shown in the shop-owner view.
                    Data + calculation remain available for admin/analytics. */}
                {customer.avg_pay_days !== null && customer.avg_pay_days !== undefined && (
                  <span>
                    {tr('customers.avg-pay', lang)}:{' '}
                    <span style={{ fontWeight: 700, color: '#171a17' }}>{formatDays(customer.avg_pay_days, lang)}</span>
                  </span>
                )}
              </div>
            </div>
            {isSettled && (
              <div style={{
                width: '100%', padding: '12px',
                background: '#e7f0e9', color: '#2e6a47',
                border: 'none', borderRadius: 10,
                fontSize: '0.82rem', fontWeight: 800,
                minHeight: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                {tr('customers.balance-fully-paid', lang)}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
           3. QUICK ACTIONS · Call + SMS + Telegram + Send Reminder
           ═══════════════════════════════════════════════════════════════ */}
      {shopPlan !== 'plus' && hasBalance && hasLinkedBorrower && (
        <div style={{ padding: '0 14px 8px' }}>
          <p style={{ margin: 0, fontSize: '0.66rem', color: '#a8ada2', lineHeight: 1.4 }}>
            {tr('customers.automated-reminders-are-a-plus-feature-on', lang)}
          </p>
        </div>
      )}
      <div className="hide-scrollbar" style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, padding: '14px 14px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {/* Tier 1 — financially critical. Placed as the dominant action,
            immediately beside Transfer per the design hierarchy. */}
        {hasBalance && onMarkFullyPaid && (
          <button
            type="button"
            onClick={handleMarkFullyPaid}
            className="press-scale"
            style={{
              flex: '0 0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: '#1b4332',
              border: '1px solid transparent',
              borderRadius: 10,
              padding: '10px 12px',
              color: '#fff',
              fontWeight: 800,
              fontSize: '0.78rem',
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            <Wallet className="w-4 h-4" />
            {tr('customers.mark-fully-paid', lang)}
          </button>
        )}
        {/* Tier 2 — Promise to Pay (record). Hidden while a promise is active;
            the Follow-up section shows the live promise state + Clear. */}
        {!customer.promised_pay_date && onRecordPromise && (
          <button
            type="button"
            onClick={() => { setShowPromiseForm(true); setActiveTab('promises'); }}
            className="press-scale"
            style={{
              flex: '0 0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: '#f9eed4',
              border: '1px solid transparent',
              borderRadius: 10,
              padding: '10px 12px',
              color: '#7a5416',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            <CalendarClock className="w-4 h-4" />
            {tr('customers.promise-2', lang)}
          </button>
        )}
        {isValidEthiopianPhone(customer.phone_number) && (
          <a
            href={toTelUrl(customer.phone_number)}
            className="press-scale"
            style={{
              flex: '0 0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: '#e7f0e9',
              border: '1px solid transparent',
              borderRadius: 10,
              padding: '10px 12px',
              color: '#2e6a47',
              fontWeight: 700,
              fontSize: '0.78rem',
              textDecoration: 'none',
              minHeight: 44,
            }}
          >
            <Phone className="w-4 h-4" />
            {tr('customers.call', lang)}
          </a>
        )}
        {isValidEthiopianPhone(customer.phone_number) && (
          <button
            type="button"
            onClick={() => onSmsCustomer?.(customer)}
            className="press-scale"
            style={{
              flex: '0 0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: '#e6f0f7',
              border: '1px solid transparent',
              borderRadius: 10,
              padding: '10px 12px',
              color: '#2a6690',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            <MessageSquare className="w-4 h-4" />
            SMS
          </button>
        )}
        {/* Transfer, Telegram/Connect and the rest live in the More sheet to
            reduce visual competition (hierarchy pass). */}
        {(
          <button
            type="button"
            onClick={() => setShowMoreSheet(true)}
            className="press-scale"
            aria-label={tr('customers.more-actions', lang)}
            style={{
              flex: '0 0 auto',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: '#fff',
              border: '1px solid #e4e6df',
              borderRadius: 10,
              padding: '10px 12px',
              color: '#5b6158',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            <MoreVertical className="w-4 h-4" />
            {tr('customers.more', lang)}
          </button>
        )}
      </div>

      {/* ─── Compact context rows (point 5): active promise + reminders, only when relevant ─── */}
      {(() => {
        const promiseDateVal = customer.promised_pay_date;
        const now = Date.now();
        const isMissed = promiseDateVal && promiseDateVal < now;
        const isToday = promiseDateVal && Math.abs(promiseDateVal - now) < 86400000;
        const showPromise = !!promiseDateVal && onRecordPromise;
        const showReminder = customer.has_overdue;
        if (!showPromise && !showReminder) return null;
        return (
          <div style={{ padding: '8px 14px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {showPromise && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 10, background: isMissed ? '#f5e7e1' : '#f9eed4', border: `1px solid ${isMissed ? '#E7C3B7' : '#E4D5B0'}` }}>
                  <span style={{ fontSize: '0.76rem', fontWeight: 600, color: isMissed ? '#a0402a' : '#7a5416', display: 'flex', alignItems: 'center', gap: 6 }}>
                    📅 {isMissed
                      ? (tr('customers.missed-promise-due', lang, formatEthiopian(promiseDateVal)))
                      : isToday
                        ? (tr('customers.promised-to-pay-today', lang))
                        : (tr('customers.promised-to-pay-by', lang, formatEthiopian(promiseDateVal)))}
                    {customer.promise_note && <span style={{ fontWeight: 400, opacity: 0.8 }}> — {customer.promise_note}</span>}
                  </span>
                  <button type="button" onClick={handleClearPromiseExt} style={{ background: 'none', border: 'none', fontSize: '0.65rem', fontWeight: 700, color: '#8b9086', cursor: 'pointer', padding: '4px 8px' }}>{tr('customers.clear', lang)}</button>
                </div>
              )}
              {showReminder && (
                <div style={{ padding: '2px 0' }}>
                  <CustomerReminderHistory
                    customerId={customer.id || customer.customer_id}
                    shopId={customer.shop_id || customer.business_id}
                    lang={lang}
                    onResend={() => onRemind?.(customer)}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ─── Tabs (point 6): Timeline | Promises | Notes ─── */}
      <div
        role="tablist"
        aria-label="Customer detail sections"
        style={{
          display: 'flex',
          gap: 4,
          padding: '6px 12px 0',
          marginTop: 8,
          borderBottom: '1px solid #e4e6df',
          background: 'var(--color-surface)',
        }}
      >
        {[
          { key: 'timeline', label: tr('customers.timeline', lang) },
          { key: 'promises', label: tr('customers.promises', lang) },
          { key: 'notes', label: tr('customers.notes', lang) },
        ].map(tab => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className="press-scale"
              style={{
                appearance: 'none',
                background: 'none',
                border: 'none',
                padding: '10px 10px 12px',
                fontSize: '0.82rem',
                fontWeight: active ? 800 : 600,
                color: active ? '#171a17' : '#8b9086',
                cursor: 'pointer',
                position: 'relative',
                fontFamily: 'inherit',
              }}
            >
              {tab.label}
              {active && (
                <span style={{ position: 'absolute', left: 8, right: 8, bottom: -1, height: 2, background: '#171a17', borderRadius: 2 }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          4. FOLLOW-UP · Promise to pay + Reminders (one logical group)
          ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'promises' && (onRecordPromise || customer.has_overdue) && (
        <div style={{ padding: '0 14px 12px' }}>
          <p style={{
            fontSize: '0.62rem', fontWeight: 800, color: '#8b9086',
            letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px',
          }}>
            {tr('customers.follow-up', lang)}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {onRecordPromise &&
              (() => {
            const promiseDateVal = customer.promised_pay_date;
            const now = Date.now();
            const isMissed = promiseDateVal && promiseDateVal < now;
            const isToday = promiseDateVal && Math.abs(promiseDateVal - now) < 86400000;

            if (promiseDateVal) {
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 10,
                  background: isMissed ? '#f5e7e1' : '#f9eed4',
                  border: `1px solid ${isMissed ? '#E7C3B7' : '#E4D5B0'}`,
                }}>
                  <span style={{
                    fontSize: '0.78rem', fontWeight: 600,
                    color: isMissed ? '#a0402a' : '#7a5416',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    📅 {isMissed
                      ? (tr('customers.missed-promise-was-due', lang, formatEthiopian(promiseDateVal)))
                      : isToday
                        ? (tr('customers.promised-to-pay-today', lang))
                        : (tr('customers.promised-to-pay-by', lang, formatEthiopian(promiseDateVal)))}
                    {customer.promise_note && (
                      <span style={{ fontWeight: 400, opacity: 0.8 }}>
                        — {customer.promise_note}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => onClearPromise(customer.id)}
                    style={{
                      background: 'none', border: 'none',
                      fontSize: '0.65rem', fontWeight: 700, color: '#8b9086',
                      cursor: 'pointer', padding: '4px 8px',
                    }}
                  >
                    {tr('customers.clear', lang)}
                  </button>
                </div>
              );
            }

            if (!showPromiseForm) {
              return (
                <button
                  type="button"
                  onClick={() => { setPromiseDate(''); setPromiseNote(''); setPromiseAmount(''); setShowPromiseForm(true); }}
                  style={{ padding: '12px', background: '#1b4332', border: 'none', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, color: '#fff', cursor: 'pointer', width: '100%' }}
                >
                  📅 {tr('customers.record-a-promise', lang)}
                </button>
              );
            }

            return (
              <div className="promise-form-slide" style={{
                padding: 14,
                background: '#fff',
                border: '1px solid #e4e6df',
                borderRadius: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, margin: 0, color: '#171a17' }}>
                  📅 {tr('customers.record-promise-to-pay', lang)}
                </p>
                <input
                  type="date"
                  value={promiseDate}
                  onChange={(e) => setPromiseDate(e.target.value)}
                  className="promise-input"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e4e6df',
                    borderRadius: 8,
                    fontSize: '0.85rem',
                    fontFamily: 'inherit',
                    color: '#171a17',
                    background: '#fff',
                  }}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  value={promiseAmount}
                  onChange={(e) => setPromiseAmount(e.target.value)}
                  placeholder={tr('customers.amount-optional', lang)}
                  className="promise-input"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e4e6df',
                    borderRadius: 8,
                    fontSize: '0.85rem',
                    fontFamily: 'inherit',
                    color: '#171a17',
                    background: '#fff',
                  }}
                />
                <input
                  type="text"
                  value={promiseNote}
                  onChange={(e) => setPromiseNote(e.target.value)}
                  placeholder={t.promiseNote}
                  className="promise-input"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e4e6df',
                    borderRadius: 8,
                    fontSize: '0.85rem',
                    fontFamily: 'inherit',
                    color: '#171a17',
                    background: '#fff',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleCancelPromise}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      background: '#f5f6f2',
                      border: '1px solid #e4e6df',
                      borderRadius: 8,
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: '#171a17',
                      cursor: 'pointer',
                      minHeight: 44,
                    }}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={handleRecordPromiseExt}
                    disabled={!promiseDate}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      background: '#1b4332',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: '#fff',
                      cursor: promiseDate ? 'pointer' : 'not-allowed',
                      opacity: promiseDate ? 1 : 0.5,
                      minHeight: 44,
                    }}
                  >
                    {t.saveChanges}
                  </button>
                </div>
              </div>
            );
            })()
            }
              {promiseHistory.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: '0.66rem', fontWeight: 800, color: '#8b9086', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{tr('customers.past-promises', lang)}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {promiseHistory.map(p => {
                      const sColor = p.status === 'missed' ? '#a0402a' : p.status === 'paid' ? '#1b7a3d' : '#5b6158';
                      return (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#fff', border: '1px solid #e4e6df', borderRadius: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#171a17' }}>{p.amount ? fmt(Number(p.amount)) : (tr('customers.promise-2', lang))}</p>
                            <p style={{ margin: 0, fontSize: '0.68rem', color: '#8b9086' }}>{p.due ? formatEthiopian(p.due) : ''} · {new Date(p.at).toLocaleDateString(tr('customers.en-gb', lang))}</p>
                          </div>
                          <span style={{ fontSize: '0.66rem', fontWeight: 800, color: sColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {p.status === 'missed' ? (tr('customers.missed', lang)) : p.status === 'paid' ? (tr('customers.paid', lang)) : (tr('customers.cleared', lang))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          6. HISTORY · search + filter + grouped by date
          ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'timeline' && (<div>
        {/* History header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 8px' }}>
          <p style={{ fontSize: '0.62rem', fontWeight: 800, color: '#8b9086', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
            {tr('customers.timeline-2', lang)}
          </p>
          <span
            style={{
              fontSize: '0.65rem', fontWeight: 700,
              background: '#f5f6f2',
              color: '#7a5416',
              padding: '2px 8px',
              borderRadius: 999,
              border: '1px solid #e4e6df',
            }}
          >
            {tr('customers.tap-row-to-edit', lang)}
          </span>
        </div>

        {/* Search & Filter */}
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#fff', border: '1px solid #e4e6df',
            borderRadius: 10, padding: '8px 12px', marginBottom: 8,
          }}>
            <Search size={14} color="#8b9086" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={tr('customers.search-items', lang)}
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                fontSize: '0.85rem', width: '100%', fontFamily: 'inherit',
                color: '#171a17',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                <X size={14} color="#8b9086" />
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: tr('customers.all', lang) },
              { key: 'credit', label: tr('customers.credits', lang) },
              { key: 'pay', label: tr('customers.payments', lang) },
            ].map(chip => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilterType(chip.key)}
                className="press-scale"
                style={{
                  padding: '4px 12px',
                  borderRadius: 999,
                  background: filterType === chip.key ? '#171a17' : '#fff',
                  border: `1px solid ${filterType === chip.key ? '#171a17' : '#e4e6df'}`,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: filterType === chip.key ? '#fff' : '#5b6158',
                  cursor: 'pointer',
                }}
              >
                {chip.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowFilterMenu(v => !v)}
              className="press-scale"
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: '#fff', border: '1px solid #e4e6df', fontSize: '0.7rem', fontWeight: 700, color: '#5b6158', cursor: 'pointer' }}
            >
              <SlidersHorizontal size={12} /> {tr('customers.filter', lang)}
            </button>
          </div>
          {showFilterMenu && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[{ key: 'all', label: tr('customers.all-time', lang) }, { key: '30', label: tr('customers.last-30-days', lang) }, { key: '90', label: tr('customers.last-90-days', lang) }, { key: '365', label: tr('customers.last-year', lang) }].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => { setDateRange(opt.key); setShowFilterMenu(false); }}
                  style={{ padding: '4px 10px', borderRadius: 999, background: dateRange === opt.key ? '#1b4332' : '#fff', border: `1px solid ${dateRange === opt.key ? '#1b4332' : '#e4e6df'}`, fontSize: '0.68rem', fontWeight: 700, color: dateRange === opt.key ? '#fff' : '#5b6158', cursor: 'pointer' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Connected vertical timeline (points 7-9) */}
        {(() => {
          const now = Date.now();
          let rows = filteredRows.filter(r => !r.isPromise);
          if (filterType === 'credit') rows = rows.filter(r => r.type === 'credit' || r.type === 'credit_allocation');
          else if (filterType === 'pay') rows = rows.filter(r => r.type === 'pay' || r.type === 'payment_allocation' || r.type === 'credit_payment');
          if (dateRange !== 'all') {
            const min = now - Number(dateRange) * 86400000;
            rows = rows.filter(r => (r.created_at || 0) >= min);
          }
          if (rows.length === 0) {
            return (
              <div style={{ margin: '0 14px', padding: 40, background: '#fff', border: '1px solid #e4e6df', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ fontSize: '0.85rem', color: '#8b9086', margin: 0 }}>{tr('customers.no-entries-found', lang)}</p>
              </div>
            );
          }
          const groups = [];
          let lastDate = null;
          rows.forEach(tx => {
            const d = formatEthiopian(tx.created_at);
            if (d !== lastDate) { groups.push({ date: d, items: [] }); lastDate = d; }
            groups[groups.length - 1].items.push(tx);
          });
          const isPayment = (tx) => tx.type === 'pay' || tx.type === 'payment_allocation' || tx.type === 'credit_payment';
          const dotColor = (tx) => isPayment(tx) ? '#1b7a3d' : '#c0392b';
          const amtColor = (tx) => isPayment(tx) ? '#1b7a3d' : '#c0392b';
          const amtSign = (tx) => isPayment(tx) ? '−' : '+';
          const label = (tx) => {
            if (tx.item) return tx.item;
            return isPayment(tx) ? (tr('customers.payment', lang)) : (tr('customers.credit', lang));
          };
          const sub = (tx) => tx.note || (isPayment(tx) ? (tr('customers.payment-received', lang)) : (tr('customers.credit-given', lang)));
          const timeStr = (ts) => { try { return new Date(ts).toLocaleTimeString(tr('customers.en-gb', lang), { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
          return (
            <div style={{ margin: '0 14px 16px' }}>
              {groups.map((g) => (
                <div key={g.date} style={{ marginBottom: 2 }}>
                  <div style={{ padding: '6px 0 2px', fontSize: '0.66rem', fontWeight: 800, color: '#8b9086', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
                    <span>📅 {g.date}</span>
                    {g.items.length > 1 && <span style={{ fontWeight: 600, textTransform: 'none' }}>{g.items.length} {tr('customers.entries', lang)}</span>}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: '#e4e6df' }} />
                    {g.items.map((tx, i) => (
                      <div key={tx.id || i} style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0' }} onClick={() => onSelectTransaction?.(tx)}>
                        <span style={{ position: 'relative', zIndex: 1, width: 16, height: 16, borderRadius: '50%', marginTop: 3, background: dotColor(tx), border: '2px solid #fff', boxShadow: '0 0 0 1px #e4e6df', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#171a17', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(tx)}</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: amtColor(tx), whiteSpace: 'nowrap' }}>{amtSign(tx)}{fmt(Math.abs(Number(tx.amount)))}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: '0.7rem', color: '#8b9086', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub(tx)}</span>
                            <span style={{ fontSize: '0.68rem', color: '#8b9086', whiteSpace: 'nowrap' }}>{timeStr(tx.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
      )}

      {/* ─── Notes tab (points 13-14): private dated notes ─── */}
      {activeTab === 'notes' && (
        <div style={{ padding: '12px 14px 24px' }}>
          {notesList.length === 0 && (
            <p style={{ fontSize: '0.8rem', color: '#8b9086', textAlign: 'center', padding: 20, margin: 0 }}>
              {tr('customers.no-notes-yet', lang)}
            </p>
          )}
          {notesList.map(n => (
            <div key={n.id} style={{ padding: '10px 12px', background: '#fff', border: '1px solid #e4e6df', borderRadius: 10, marginBottom: 8 }}>
              {editingNoteId === n.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    value={editNoteText}
                    onChange={(e) => setEditNoteText(e.target.value)}
                    rows={2}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #e4e6df', borderRadius: 8, fontSize: '0.82rem', fontFamily: 'inherit', color: '#171a17', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setEditingNoteId(null)} style={{ padding: '6px 10px', background: '#f5f6f2', border: '1px solid #e4e6df', borderRadius: 8, fontSize: '0.74rem', fontWeight: 700, color: '#171a17', cursor: 'pointer' }}>{t.cancel}</button>
                    <button type="button" onClick={() => { updateNote(n.id, editNoteText); setEditingNoteId(null); }} disabled={!editNoteText.trim()} style={{ padding: '6px 10px', background: '#1b4332', border: 'none', borderRadius: 8, fontSize: '0.74rem', fontWeight: 700, color: '#fff', cursor: 'pointer' }}>{t.saveChanges}</button>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#171a17', whiteSpace: 'pre-wrap' }}>{n.text}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: '0.66rem', color: '#8b9086' }}>{new Date(n.created_at).toLocaleString(tr('customers.en-gb', lang))}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => { setEditingNoteId(n.id); setEditNoteText(n.text); }} style={{ background: 'none', border: 'none', fontSize: '0.68rem', fontWeight: 700, color: '#5b6158', cursor: 'pointer' }}>{tr('customers.edit', lang)}</button>
                      <button type="button" onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', fontSize: '0.68rem', fontWeight: 700, color: '#a0402a', cursor: 'pointer' }}>{tr('customers.delete', lang)}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={2}
              placeholder={tr('customers.write-a-note', lang)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e4e6df', borderRadius: 10, fontSize: '0.85rem', fontFamily: 'inherit', color: '#171a17', resize: 'vertical' }}
            />
            <button
              type="button"
              onClick={() => { if (noteDraft.trim()) { addNote(noteDraft.trim()); setNoteDraft(''); } }}
              disabled={!noteDraft.trim()}
              style={{ alignSelf: 'flex-end', padding: '9px 16px', background: '#1b4332', border: 'none', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, color: '#fff', cursor: noteDraft.trim() ? 'pointer' : 'not-allowed', opacity: noteDraft.trim() ? 1 : 0.5 }}
            >
              {tr('customers.add-note', lang)}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          7. TRUST LINE
          ═══════════════════════════════════════════════════════════════ */}
      <p style={{
        textAlign: 'center', fontSize: '0.6rem', color: '#a8ada2',
        padding: '16px 14px 4px',
      }}>
        🔒 {tr('customers.backed-up-securely-amounts-auto-hide-for', lang)}
      </p>

      {/* ═══════════════════════════════════════════════════════════════
          8. ARCHIVE / RESTORE
          ═══════════════════════════════════════════════════════════════ */}
      {onArchiveCustomer && (
        <div style={{ textAlign: 'center', padding: '4px 14px 12px' }}>
          {showArchiveConfirm ? (
            <div style={{
              padding: 14,
              background: '#fff',
              border: '1px solid #e4e6df',
              borderRadius: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 600, margin: 0, color: '#171a17' }}>
                {tr('customers.archive', lang, () => customer.display_name, () => hasBalance ? ` This customer has ${fmt(balance)} birr outstanding.` : '', () => hasBalance ? ` ይህ ደንበኛ ${fmt(balance)} ብር ዕዳ አለበት።` : '')}
              </p>
              <p style={{ fontSize: '0.72rem', color: '#5b6158', margin: 0 }}>
                {tr('customers.archived-records-are-preserved-for-history', lang)}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowArchiveConfirm(false)}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: '#f5f6f2',
                    border: '1px solid #e4e6df',
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#171a17',
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleArchive}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: '#a0402a',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#fff',
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  {tr('customers.archive-2', lang)}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowArchiveConfirm(true)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '0.7rem',
                color: customer.archived_at ? '#2e6a47' : '#8b9086',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: 8,
                opacity: 0.7,
              }}
            >
              {customer.archived_at
                ? (tr('customers.restore', lang))
                : (tr('customers.archive-2', lang))}
            </button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PERSISTENT ACTIONS — You Gave (Dubie) / You Got (Paid)
          Rendered in-flow at the bottom of the page (scrolls with content),
          per the redesigned layout. Bottom padding clears the fixed tab nav.
          ═══════════════════════════════════════════════════════════════ */}
      {/* Constant action bar pinned just above the bottom tab nav so the
          primary money actions are always reachable. Opaque + themed so it
          never lets content show through, and offset clear of the nav. */}
      {!transactionSheetOpen && (
      <div className="left-0 right-0 lg:left-64" style={{
        position: 'fixed',
        bottom: 76,
        zIndex: 45,
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border-light)',
        boxShadow: '0 -8px 24px -12px rgba(27,67,50,0.25)',
        padding: '8px 0 10px',
        pointerEvents: 'auto',
      }}>
        <div style={{ width: 'min(100%, 480px)', margin: '0 auto', padding: '0 14px' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onAddCredit}
              className="press-scale"
              style={{
                flex: 1, padding: '13px',
                background: '#E75645', border: 'none', borderRadius: 14,
                color: '#fff', fontWeight: 800, fontSize: '0.82rem',
                cursor: 'pointer', minHeight: 48,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <CreditCard className="w-4 h-4" />
              {t.creditGave}
            </button>
            <button
              type="button"
              onClick={onRecordPayment}
              disabled={!hasBalance}
              className="press-scale"
              style={{
                flex: 1, padding: '13px',
                background: '#2EAB6F', border: 'none', borderRadius: 14,
                color: '#fff', fontWeight: 800, fontSize: '0.82rem',
                cursor: hasBalance ? 'pointer' : 'not-allowed',
                minHeight: 48,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: hasBalance ? 1 : 0.5,
              }}
            >
              <Wallet className="w-4 h-4" />
              {t.creditGot}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           MORE ACTIONS SHEET — secondary actions stay reachable
           (Transfer / Telegram / Send Reminder / Edit / Archive — nothing removed)
          ═══════════════════════════════════════════════════════════════ */}
      {showMoreSheet && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowMoreSheet(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 70,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div style={{
            width: '100%', maxWidth: 480,
            background: '#fff',
            borderRadius: '20px 20px 0 0',
            maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 -8px 32px -8px rgba(0,0,0,0.25)',
          }}>
            <div style={{ width: 38, height: 4, background: '#e4e6df', borderRadius: 999, margin: '10px auto 0' }} />
            <div style={{
              padding: '8px 16px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid #e4e6df',
            }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 800, color: '#171a17', margin: 0 }}>
                {tr('customers.more-actions', lang)}
              </p>
              <button
                type="button"
                onClick={() => setShowMoreSheet(false)}
                aria-label={tr('customers.close', lang)}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: '#f5f6f2', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={16} color="#5b6158" />
              </button>
            </div>
             <div style={{ padding: '8px 8px 16px', display: 'flex', flexDirection: 'column' }}>
              {onTransfer && (
                <button
                  type="button"
                  className="history-row-active"
                  onClick={() => { setShowMoreSheet(false); onTransfer(customer); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 10px', background: 'none', border: 'none',
                    borderRadius: 10, cursor: 'pointer', minHeight: 48, textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: '#f9eed4', color: '#7a5416',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ArrowRightLeft size={16} />
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#171a17' }}>
                    {tr('customers.transfer-credit', lang)}
                  </span>
                </button>
              )}
              {onOpenTelegramConnect && (
                <button
                  type="button"
                  className="history-row-active"
                  onClick={() => { setShowMoreSheet(false); onOpenTelegramConnect(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 10px', background: 'none', border: 'none',
                    borderRadius: 10, cursor: 'pointer', minHeight: 48, textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: tg === 'linked' ? '#e7f0e9' : '#fff',
                    color: tg === 'linked' ? '#2e6a47' : '#171a17',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <TelegramIcon />
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#171a17' }}>
                    {tg === 'linked'
                      ? (tr('customers.telegram', lang))
                      : (tr('customers.connect-telegram', lang))}
                  </span>
                </button>
              )}
              {hasBalance && hasLinkedBorrower && onRemind && (
                <button
                  type="button"
                  className="history-row-active"
                  onClick={() => { setShowMoreSheet(false); onRemind?.(customer); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 10px', background: 'none', border: 'none',
                    borderRadius: 10, cursor: 'pointer', minHeight: 48, textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: '#f3e8fd', color: '#7b2cbf',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Send size={16} />
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#171a17' }}>
                    {tr('customers.send-reminder', lang)}
                  </span>
                </button>
              )}
              {onEditCustomer && (
                <button
                  type="button"
                  className="history-row-active"
                  onClick={() => { setShowMoreSheet(false); onEditCustomer(customer); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 10px', background: 'none', border: 'none',
                    borderRadius: 10, cursor: 'pointer', minHeight: 48, textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: '#eef0ea', color: '#5b6158',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Pencil size={16} />
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#171a17' }}>
                    {tr('customers.edit-customer-2', lang)}
                  </span>
                </button>
              )}
              {onArchiveCustomer && (
                <button
                  type="button"
                  className="history-row-active"
                  onClick={() => { setShowMoreSheet(false); setShowArchiveConfirm(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 10px', background: 'none', border: 'none',
                    borderRadius: 10, cursor: 'pointer', minHeight: 48, textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: '#f5e7e1', color: '#a0402a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {customer.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#171a17' }}>
                    {customer.archived_at
                      ? (tr('customers.restore-customer', lang))
                      : (tr('customers.archive-customer', lang))}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SUCCESS OVERLAY
          ═══════════════════════════════════════════════════════════════ */}
      {showSuccessOverlay && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(255,255,255,0.95)',
          zIndex: 30,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="success-pop" style={{
            width: 80, height: 80,
            background: '#2e6a47',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 40,
          }}>✓</div>
          <p style={{ marginTop: 20, fontSize: '1.2rem', fontWeight: 800, color: '#2e6a47' }}>
            {tr('customers.balance-settled', lang)}
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CSS ANIMATIONS
          ═══════════════════════════════════════════════════════════════ */}
      <style>{`
        .promise-form-slide {
          animation: slideDown 0.3s ease forwards;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .history-row-active:active {
          background: #f9f9f9 !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
          transform: scale(0.98);
        }
        .new-entry-anim {
          animation: dropIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes dropIn {
          0% { opacity: 0; transform: translateY(-15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .success-pop {
          animation: popIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1.4) forwards;
        }
        @keyframes popIn {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }
        .promise-input:focus {
          outline: none;
          border-color: #1b4332;
        }
      `}</style>
    </div>
  );
}

// ─── History row — delegated to shared TransactionRow ──

export default CustomerDetail;
