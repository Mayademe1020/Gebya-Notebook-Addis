import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BookOpen, Users, Calendar, Settings, Trash2, Pencil, Share2, X,
  Plus, Minus, RotateCw,
  MoreVertical, ChevronUp, ChevronDown,
  CreditCard, BarChart3, MoreHorizontal,
} from 'lucide-react';
import db, { getDeviceToken, getIdentity, setIdentity } from './db';
import identityApi from './api/identity';
import { PrivacyProvider, usePrivacy } from './context/PrivacyContext';
import { LangProvider, useLang } from './context/LangContext';
import { ThemeProvider } from './context/ThemeContext';
import ProfitCard from './components/ProfitCard';
import OnboardingScreen from './components/OnboardingScreen';
import StaffJoinScreen from './components/StaffJoinScreen';
import { ToastContainer, fireToast } from './components/Toast';
import PhotoAttachment from './components/PhotoAttachment';
import { buildPhotoFields, normalizePhotos } from './utils/photoProof';
import { getCurrentEthiopianDate, formatEthiopian } from './utils/ethiopianCalendar';
import { fmt } from './utils/numformat';
import { buildCustomerSummaries, getCustomerBalance, insertCustomerTransaction, sortCustomerTransactions } from './utils/customerLedger';
import { normalizeCustomerDraft, normalizeCustomerTransactionDraft } from './utils/customerLedgerMutations';
import { CUSTOMER_TRANSACTION_TYPES, isValidCustomerTransactionType } from './utils/customerTransactionTypes';
import { buildCustomerLedgerTelegramMessage, buildTelegramMessageUrl, createCustomerTelegramLinkToken, createCustomerTransactionReference } from './utils/customerTelegram';
import { buildSupplierSummaries, getSupplierBalance, isValidSupplierTransactionType, SUPPLIER_TRANSACTION_TYPES } from './utils/supplierLedger';
import { enrichCustomerSummaries, buildCreditMetrics } from './utils/customerMetrics';
import { usePwaInstall } from './hooks/usePwaInstall.js';
import { resendLatestTelegramUpdate, syncTelegramCustomerState } from './utils/telegramBotClient';
import { countPendingTelegramSync, drainTelegramSyncQueue, enqueueTelegramLedgerUpdate } from './utils/syncQueue';
import { createCloudProofFields, enqueueCloudProofUpsert } from './utils/cloudProof';
import { enqueueStaffEventSync, processStaffEventQueue } from './utils/staffEventSync';
import { normalizeStaffDraft, resolveActorSnapshot, getActorDisplayLabel } from './utils/staffMembers';
import {
  buildDefaultChannels,
  migrateLegacyToChannels,
  deriveLegacyFromChannels,
  normalizeChannelsForSave,
} from './utils/paymentChannels';

const DEFAULT_PROVIDERS = {
  banks: ['CBE', 'Dashen', 'Awash', 'Abyssinia'],
  wallets: ['telebirr', 'CBE Birr'],
};

// Stale-chunk self-heal. After a new deploy, Vite emits new hashed chunk
// filenames. A browser still running the previous index.html (or a stale
// service-worker shell) requests an old chunk URL that now 404s, throwing
// "Failed to fetch dynamically imported module". We retry once via a hard
// reload (which pulls the fresh index.html + new hashes); a per-chunk
// sessionStorage guard prevents reload loops if the asset is truly missing.
function isLikelyStaleChunkError(err) {
  const message = String(err?.message || err || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed|ChunkLoadError/i.test(message);
}

function lazyWithRetry(importer, name) {
  return lazy(async () => {
    const flag = `gebya_chunk_reload_${name}`;
    const getFlag = () => { try { return sessionStorage.getItem(flag); } catch { return null; } };
    const setFlag = (on) => { try { on ? sessionStorage.setItem(flag, '1') : sessionStorage.removeItem(flag); } catch { /* storage blocked */ } };
    try {
      const mod = await importer();
      setFlag(false);
      return mod;
    } catch (err) {
      if (isLikelyStaleChunkError(err) && !getFlag()) {
        setFlag(true);
        window.location.reload();
        return new Promise(() => {}); // hold the render until the reload lands
      }
      throw err;
    }
  });
}

const importTransactionForm = () => import('./components/TransactionForm');
const importEditTransactionSheet = () => import('./components/EditTransactionSheet');
const importReminderSheet = () => import('./components/ReminderSheet');
const importSupplierList = () => import('./components/SupplierList');
const importSupplierDetail = () => import('./components/SupplierDetail');
const importSupplierForm = () => import('./components/SupplierForm');
const importSupplierTransactionSheet = () => import('./components/SupplierTransactionSheet');
const importCustomerList = () => import('./components/CustomerList');
const importCustomerDetail = () => import('./components/CustomerDetail');
const importCustomerForm = () => import('./components/CustomerForm');
const importCustomerTransactionSheet = () => import('./components/CustomerTransactionSheet');
const importCustomerTelegramConnectSheet = () => import('./components/CustomerTelegramConnectSheet');
const importHistoryView = () => import('./components/HistoryView');
const importReportView = () => import('./components/ReportView');
const importSettingsPage = () => import('./components/SettingsPage');
const importDailySuggestions = () => import('./components/DailySuggestions');

const TransactionForm = lazyWithRetry(importTransactionForm, 'TransactionForm');
const EditTransactionSheet = lazyWithRetry(importEditTransactionSheet, 'EditTransactionSheet');
const ReminderSheet = lazyWithRetry(importReminderSheet, 'ReminderSheet');
const SupplierList = lazyWithRetry(importSupplierList, 'SupplierList');
const SupplierDetail = lazyWithRetry(importSupplierDetail, 'SupplierDetail');
const SupplierForm = lazyWithRetry(importSupplierForm, 'SupplierForm');
const SupplierTransactionSheet = lazyWithRetry(importSupplierTransactionSheet, 'SupplierTransactionSheet');
const CustomerList = lazyWithRetry(importCustomerList, 'CustomerList');
const CustomerDetail = lazyWithRetry(importCustomerDetail, 'CustomerDetail');
const CustomerForm = lazyWithRetry(importCustomerForm, 'CustomerForm');
const CustomerTransactionSheet = lazyWithRetry(importCustomerTransactionSheet, 'CustomerTransactionSheet');
const CustomerTelegramConnectSheet = lazyWithRetry(importCustomerTelegramConnectSheet, 'CustomerTelegramConnectSheet');
const HistoryView = lazyWithRetry(importHistoryView, 'HistoryView');
const ReportView = lazyWithRetry(importReportView, 'ReportView');
const SettingsPage = lazyWithRetry(importSettingsPage, 'SettingsPage');
const DailySuggestions = lazyWithRetry(importDailySuggestions, 'DailySuggestions');

// Voice subsystem hidden per D-027 (Amharic/Oromifa STT quality insufficient today).
// Files preserved (VoiceButton, VoiceRecordScreen, VoiceResultScreen, VoiceFixScreen,
// hooks/useSpeechRecognition); flip VOICE_ENABLED to true to re-enable when local-language
// voice tech improves.
const VOICE_ENABLED = false;
const VoiceRecordScreen = lazyWithRetry(() => import('./components/VoiceRecordScreen'), 'VoiceRecordScreen');
const VoiceResultScreen = lazyWithRetry(() => import('./components/VoiceResultScreen'), 'VoiceResultScreen');
const VoiceFixScreen = lazyWithRetry(() => import('./components/VoiceFixScreen'), 'VoiceFixScreen');

const P = {
  bg: 'var(--color-bg)',
  header: 'var(--color-primary)',
  actionBar: 'var(--color-primary-dark)',
  amber: '#C4883A',
  amberLight: 'rgba(196,136,58,0.12)',
  coral: '#D4654A',
  border: 'var(--color-border)',
  borderLight: 'var(--color-border-light)',
};

const BUSINESS_TYPE_PROMPT_LABELS = {
  'retail-shop': 'Retail shop',
  'shoe-market': 'Shoe market',
  'flower-shop': 'Flower shop',
  'women-dress-shop': 'Women dress shop',
  grocery: 'Grocery / minimarket',
  electronics: 'Electronics / accessories',
  pharmacy: 'Pharmacy / cosmetics',
  other: 'Other',
};

function buildVoiceSummaryFromDraft(draft) {
  if (!draft?.items?.length) return '';
  return draft.items
    .map((item) => {
      const qty = item.quantity && item.quantity !== 1 ? `${item.quantity}x ` : '';
      const price = item.unit_price != null ? ` ${item.unit_price}` : '';
      return `${qty}${item.name}${price}`.trim();
    })
    .join(', ');
}
function buildVoiceDraftFromTransaction(tx) {
  const quantity = Number(tx?.quantity || 1) || 1;
  const amount = tx?.amount != null ? Number(tx.amount) : null;
  const singleLineTotal = amount != null && Number.isFinite(amount) ? amount : null;
  const unitPrice = singleLineTotal != null && quantity > 0 ? Math.round((singleLineTotal / quantity) * 100) / 100 : null;

  return {
    customer_name: tx?.customer_name || null,
    items: tx?.item_name ? [{
      name: tx.item_name,
      quantity,
      unit_price: unitPrice,
      line_total: singleLineTotal,
    }] : [],
    total_amount: singleLineTotal,
    intent: 'sale',
    needs_review: false,
  };
}

function mergeVoiceDrafts(utterances = [], fallbackDraft = null) {
  if (utterances.length <= 1) {
    return fallbackDraft;
  }

  const drafts = utterances
    .map((entry) => entry.draft)
    .filter(Boolean);

  const items = drafts.flatMap((draft) => draft.items || []);
  const allTotalsKnown = items.length > 0 && items.every((item) => item.line_total != null);

  return {
    customer_name: drafts.find((draft) => draft.customer_name)?.customer_name || fallbackDraft?.customer_name || null,
    items,
    total_amount: allTotalsKnown ? items.reduce((sum, item) => sum + (item.line_total || 0), 0) : (drafts.reduce((sum, draft) => sum + (draft.total_amount || 0), 0) || fallbackDraft?.total_amount || null),
    intent: drafts.find((draft) => draft.intent && draft.intent !== 'sale')?.intent || fallbackDraft?.intent || 'sale',
    needs_review: drafts.some((draft) => draft.needs_review) || items.some((item) => item.unit_price == null),
  };
}

function normalizeVoiceTelemetryItems(items = []) {
  return items.map((item) => ({
    name: String(item?.name || '').trim().toLowerCase(),
    quantity: Number(item?.quantity || 1),
    unit_price: item?.unit_price == null ? null : Number(item.unit_price),
  }));
}

function normalizeVoiceTelemetryText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseAnalyticsJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function isBrowserOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function runAfterFirstPaint(callback) {
  if (typeof window === 'undefined') return () => {};
  let cancelled = false;
  let timeoutId = null;
  let idleId = null;

  const run = () => {
    if (cancelled) return;
    callback();
  };

  if ('requestIdleCallback' in window) {
    idleId = window.requestIdleCallback(run, { timeout: 2500 });
  } else {
    timeoutId = window.setTimeout(run, 1200);
  }

  return () => {
    cancelled = true;
    if (idleId != null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(idleId);
    }
    if (timeoutId != null) window.clearTimeout(timeoutId);
  };
}

function buildSavedOnDeviceMessage(message, isOnline) {
  const baseMessage = String(message || 'Saved').trim() || 'Saved';
  return isOnline ? baseMessage : (baseMessage + ' - saved on this phone');
}

function getTransactionCloudProofRecordType(transaction) {
  if (transaction?.type === 'sale') return 'sale';
  if (transaction?.type === 'expense') return 'expense';
  return null;
}

function getCustomerCloudProofRecordType(transaction) {
  if (transaction?.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT) return 'customer_payment';
  if (transaction?.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD) return 'customer_credit';
  return null;
}

function getSupplierCloudProofRecordType(transaction) {
  if (transaction?.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT) return 'supplier_payment';
  if (transaction?.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD) return 'supplier_purchase';
  return null;
}

function OfflineStatusStrip({
  pwa,
  pendingTelegramCount = 0,
  lang = 'en',
  onRetryTelegram,
  retryingTelegram = false,
}) {
  let tone = null;
  let label = '';
  let detail = '';
  let action = null;

  if (!pwa?.isOnline) {
    tone = 'offline';
    label = lang === 'am' ? 'ኔትወርክ የለም' : 'Offline';
    detail = lang === 'am' ? 'በዚህ ስልክ ይቀመጣል' : 'saves on this phone';
  } else if (pendingTelegramCount > 0) {
    tone = 'waiting';
    label = lang === 'am' ? 'ቴሌግራም ይጠብቃል' : 'Telegram waiting';
    detail = `${pendingTelegramCount}`;
    if (typeof onRetryTelegram === 'function') {
      action = (
        <button
          type="button"
          onClick={onRetryTelegram}
          disabled={retryingTelegram}
          className="press-scale"
          style={{
            minHeight: 36,
            minWidth: 56,
            padding: '6px 10px',
            border: 'none',
            borderRadius: 8,
            background: retryingTelegram ? '#bfdbfe' : '#1d4ed8',
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            cursor: retryingTelegram ? 'wait' : 'pointer',
          }}
        >
          {retryingTelegram ? '...' : (lang === 'am' ? 'እንደገና' : 'Retry')}
        </button>
      );
    }
  } else if (pwa?.updateReady) {
    tone = 'update';
    label = lang === 'am' ? 'አዲስ ስሪት ዝግጁ ነው' : 'Update ready';
    detail = lang === 'am' ? 'ለማደስ ይጫኑ' : 'tap to refresh';
    action = (
      <button
        type="button"
        onClick={pwa.applyUpdate}
        className="press-scale"
        style={{
          minHeight: 30,
          padding: '4px 10px',
          border: 'none',
          borderRadius: 8,
          background: '#1B4332',
          color: '#fff',
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        {lang === 'am' ? 'አድስ' : 'Update'}
      </button>
    );
  } else if (pwa?.offlineReady) {
    tone = 'ready';
    label = lang === 'am' ? 'ከመስመር ውጭ ዝግጁ' : 'Offline ready';
    detail = lang === 'am' ? 'ያለ ኢንተርኔት ይሰራል' : 'works without internet';
  }

  if (!tone) return null;

  const styles = {
    offline: { background: '#fff7ed', border: '#fed7aa', color: '#9a3412' },
    waiting: { background: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
    update: { background: '#ecfdf5', border: '#bbf7d0', color: '#166534' },
    ready: { background: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
  }[tone];

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 flex items-center justify-between gap-2"
      style={{
        minHeight: 36,
        padding: '7px 9px',
        borderRadius: 8,
        background: styles.background,
        border: `1px solid ${styles.border}`,
        color: styles.color,
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      <span className="min-w-0 truncate">
        {label}
        {detail ? <span style={{ fontWeight: 700 }}> · {detail}</span> : null}
      </span>
      {action}
    </div>
  );
}

function ShareModal({ summary, telegram, onClose, t }) {
  const isUsername = telegram?.startsWith('@') && telegram.length > 1;
  const handle = isUsername ? telegram.slice(1) : null;
  const encoded = encodeURIComponent(summary);

  const handleNativeShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: t.shareDailyReport, text: summary }); } catch { /* dismissed */ }
    }
  };

  const handleTelegram = () => {
    window.open(`https://t.me/${handle}?text=${encoded}`, '_blank');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      fireToast('ðŸ“‹ ' + t.copiedToClipboard, 2500);
      onClose();
    } catch { /* ignore */ }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 animate-fade"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-md pb-safe animate-slide-up" style={{ background: 'var(--color-surface)', borderRadius: '24px 24px 0 0', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b" style={{ borderColor: 'var(--color-border-light)' }}>
          <h2 className="text-base font-black text-gray-800 font-sans">ðŸ“¤ {t.shareTitle}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center min-w-[44px] min-h-[44px] press-scale"
            style={{ background: 'var(--color-surface-muted)' }}
            aria-label={t.cancel}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-2">
          <div
            className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-pre-wrap"
            style={{ background: 'var(--color-surface-soft)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: '140px', overflowY: 'auto', fontSize: '0.7rem', lineHeight: 1.5, color: 'var(--color-text-muted)' }}
          >
            {summary}
          </div>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              onClick={handleNativeShare}
              className="w-full py-3 font-bold text-sm flex items-center justify-center gap-2 min-h-[48px] hover-lift press-scale"
              style={{ background: 'var(--color-accent-amber)', color: '#fff', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}
            >
              <Share2 className="w-4 h-4" /> {t.shareViaDevice}
            </button>
          )}
          {isUsername && handle && (
            <button
              onClick={handleTelegram}
              className="w-full py-3 font-bold text-sm flex items-center justify-center gap-2 min-h-[48px] hover-lift press-scale"
              style={{ background: '#2481cc', color: '#fff', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}
            >
              âœˆï¸ {t.openTelegram}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="w-full py-3 font-bold text-sm flex items-center justify-center gap-2 min-h-[48px] press-scale"
            style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text)', borderRadius: 'var(--radius-md)' }}
          >
            ðŸ“‹ {t.copyText}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrustCard({ totalEntries, todayCount, lastSavedSnapshot, onStartSale, t }) {
  const savedLabel = lastSavedSnapshot?.label || '';
  const savedAt = lastSavedSnapshot?.created_at
    ? new Date(lastSavedSnapshot.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div
      className="overflow-hidden animate-elastic"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl"
            style={{ background: 'rgba(27,67,50,0.08)' }}
          >
            ðŸ’¾
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-gray-900 text-sm font-sans">
              {t.trustCardTitle || 'Your notebook stays on this phone'}
            </p>
            <p className="text-sm mt-1 font-sans" style={{ color: 'var(--color-text-muted)' }}>
              {t.trustCardBody || 'Save your sales, close the app, and open again later. Your records stay here on this phone.'}
            </p>
            {totalEntries > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                <span
                  className="px-2.5 py-1 text-xs font-black"
                  style={{ background: 'rgba(27,67,50,0.08)', color: '#1B4332', borderRadius: '999px' }}
                >
                  {todayCount} {t.trustTodayCount || 'saved today'}
                </span>
                {savedAt && (
                  <span
                    className="px-2.5 py-1 text-xs font-bold"
                    style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text-muted)', borderRadius: '999px' }}
                  >
                    {t.trustLastSaved || 'Last saved'} {savedAt}
                  </span>
                )}
              </div>
            )}
            {savedLabel && (
              <p className="text-xs mt-2 font-semibold truncate font-sans" style={{ color: '#C4883A' }}>
                {savedLabel}
              </p>
            )}
          </div>
        </div>
      </div>
      <div
        className="px-4 py-3 flex items-center justify-between gap-3"
        style={{ background: 'var(--color-surface-soft)', borderTop: '1px solid var(--color-border-light)' }}
      >
        <p className="text-xs font-medium font-sans" style={{ color: 'var(--color-text-muted)' }}>
          {t.trustReopenHint || 'Close and reopen anytime — your records stay here.'}
        </p>
        {totalEntries === 0 && (
          <button
            onClick={onStartSale}
            className="flex-shrink-0 px-3 py-2 text-xs font-black text-white min-h-[40px] press-scale"
            style={{ background: '#1B4332', borderRadius: 'var(--radius-sm)' }}
          >
            {t.trustCardAction || 'Record your first sale'}
          </button>
        )}
      </div>
    </div>
  );
}

function PanelFallback({ label }) {
  return (
    <div
      className="rounded-2xl border px-4 py-8 text-center text-sm font-semibold"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
    >
      {label}
    </div>
  );
}

function ModalFallback({ label }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0, 0, 0, 0.6)' }}>
      <div
        className="w-full max-w-sm rounded-3xl px-6 py-8 text-center text-sm font-semibold"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', boxShadow: 'var(--shadow-lg)' }}
      >
        {label}
      </div>
    </div>
  );
}

// Today entries row — flat layout matching v4 reference design.
// Renders amount (colored), item_name · method, time, and a ⋮ popover menu (Edit/Delete).
// Module-level so it doesn't re-create on every parent render.
function TxRow({ tx, onTap, onEdit, onDelete, t, lang, fmt }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const isExpense = tx.type === 'expense';
  const isCredit = tx.type === 'credit';
  const amountColor = isExpense ? '#dc2626' : isCredit ? '#2563eb' : '#16a34a';
  const sign = isExpense ? '−' : '+';
  const method = isCredit
    ? (lang === 'am' ? 'ዱቤ' : 'credit')
    : tx.payment_type === 'cash'
      ? 'cash'
      : (tx.payment_provider || tx.payment_type || 'cash');
  const time = new Date(tx.created_at).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
  const editLabel = lang === 'am' ? 'አርትዕ' : 'Edit';
  const deleteLabel = lang === 'am' ? 'ሰርዝ' : 'Delete';

  const hasBreakdown = Array.isArray(tx.items) && tx.items.length > 0;

  return (
    <div className="py-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onTap}
          className="flex-1 min-w-0 text-left flex items-baseline gap-2 press-scale"
        >
          <span className="font-bold text-sm flex-shrink-0" style={{ color: amountColor }}>
            {isCredit && '↻ '}{sign}{fmt(tx.amount || 0)} {lang === 'am' ? 'ብር' : 'birr'}
          </span>
          <span className="text-sm text-gray-600 truncate min-w-0">
            {tx.item_name || '—'}
            <span className="text-gray-400"> · {method}</span>
          </span>
        </button>
        {(tx.photo || (Array.isArray(tx.photos) && tx.photos.length > 0)) && (
          <PhotoAttachment
            photo={tx.photo}
            photos={tx.photos}
            lang={lang}
            label={lang === 'am' ? 'የግብይት ፎቶ ይመልከቱ' : 'View transaction photo'}
          />
        )}
        {hasBreakdown && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setBreakdownOpen(v => !v); }}
            className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold border press-scale flex items-center gap-0.5"
            style={{
              borderColor: breakdownOpen ? '#1B4332' : '#e8e2d8',
              borderRadius: '999px',
              background: breakdownOpen ? 'rgba(27,67,50,0.08)' : '#fff',
              color: breakdownOpen ? '#1B4332' : '#6b7280',
            }}
            aria-label={lang === 'am' ? 'እቃዎችን አሳይ' : 'Show items'}
          >
            🧺{tx.items.length}
            {breakdownOpen
              ? <ChevronUp className="w-3 h-3" />
              : <ChevronDown className="w-3 h-3" />
            }
          </button>
        )}
        <span className="text-xs text-gray-400 flex-shrink-0">{time}</span>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 press-scale min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label={lang === 'am' ? 'ተጨማሪ' : 'More'}
          >
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 bg-white z-20 min-w-[130px]"
              style={{ border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
            >
              <button
                onClick={() => { onEdit(); setMenuOpen(false); }}
                className="w-full px-3 py-2 text-left flex items-center gap-2 text-sm hover:bg-gray-50"
              >
                <Pencil className="w-3.5 h-3.5" /> {editLabel}
              </button>
              <button
                onClick={() => { onDelete(); setMenuOpen(false); }}
                className="w-full px-3 py-2 text-left flex items-center gap-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> {deleteLabel}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline breakdown — shows item-by-item when 🧺 badge tapped */}
      {hasBreakdown && breakdownOpen && (
        <div
          className="mt-2 ml-1 pl-3 py-1.5 space-y-1"
          style={{ borderLeft: '2px solid rgba(27,67,50,0.15)' }}
        >
          {tx.items.map((it, i) => (
            <div key={i} className="flex justify-between items-baseline text-xs">
              <span className="truncate min-w-0" style={{ color: '#374151' }}>• {it.name}</span>
              <span className="font-semibold flex-shrink-0 ml-2" style={{ color: amountColor }}>
                {fmt(it.amount || 0)} {lang === 'am' ? 'ብር' : 'birr'}
              </span>
            </div>
          ))}
          {(() => {
            const sum = tx.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
            const delta = (Number(tx.amount) || 0) - sum;
            if (Math.abs(delta) < 0.01) return null;
            return (
              <div className="flex justify-between items-baseline text-[10px] pt-1 mt-1" style={{ borderTop: '1px dashed rgba(0,0,0,0.08)', color: '#C4883A' }}>
                <span>{delta > 0 ? (lang === 'am' ? 'ቀሪ' : 'Unaccounted') : (lang === 'am' ? 'በላይ' : 'Excess')}</span>
                <span className="font-semibold">{fmt(Math.abs(delta))} {lang === 'am' ? 'ብር' : 'birr'}</span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function AppInner() {
  const { hidden } = usePrivacy();
  const { lang, toggleLang, t } = useLang();
  const pwa = usePwaInstall();
  const [transactions, setTransactions] = useState([]);
  const [ledgerCustomers, setLedgerCustomers] = useState([]);
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierTransactions, setSupplierTransactions] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [activeStaffMemberId, setActiveStaffMemberId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('today');
  // Launch-critical data-loss prevention: nudge the shopkeeper to back up
  // when they've never backed up or it's been >7 days. Dismissable per session.
  const [lastBackupAt, setLastBackupAt] = useState(undefined); // undefined = not loaded yet
  const [backupNudgeDismissed, setBackupNudgeDismissed] = useState(false);
  const [showForm, setShowForm] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [telegramConnectCustomerId, setTelegramConnectCustomerId] = useState(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [customerTransactionModal, setCustomerTransactionModal] = useState(null);
  const [reminderTarget, setReminderTarget] = useState(null);
  // Bulk reminder · queue of customer ids to remind in sequence
  const [bulkReminderQueue, setBulkReminderQueue] = useState([]);
  // Edit a single customer_transaction · opens CustomerTransactionSheet pre-filled
  const [customerTransactionEditTarget, setCustomerTransactionEditTarget] = useState(null);
  // Commit C.2: track the customer being edited (vs added). When non-null,
  // CustomerForm renders in edit mode pre-filled with `existing={customer}`.
  const [customerEditTarget, setCustomerEditTarget] = useState(null);
  // Supplier credit ("I owe") — Khatabook-style second ledger
  const [creditView, setCreditView] = useState('customers'); // 'customers' | 'suppliers'
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierTransactionModal, setSupplierTransactionModal] = useState(null);
  // Commit D: edit existing supplier (mirrors customerEditTarget pattern).
  // When set, SupplierForm renders pre-filled with `existing={supplier}`.
  const [supplierEditTarget, setSupplierEditTarget] = useState(null);
  // Commit D: edit a single supplier_transaction row (mirror of
  // customerTransactionEditTarget). When set, SupplierTransactionSheet
  // renders with `editingTransaction={...}` so the user can adjust amount/note.
  const [supplierTransactionEditTarget, setSupplierTransactionEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [shopProfile, setShopProfile] = useState(null);
  const [onboardingType, setOnboardingType] = useState(null);
  const [enabledProviders, setEnabledProviders] = useState(DEFAULT_PROVIDERS);
  const [recurringExpenses, setRecurringExpenses] = useState([]);
  const [customQuickAmounts, setCustomQuickAmounts] = useState([]);
  const [lastPayment, setLastPayment] = useState({
    sale:    { type: 'cash', provider: '', bankProvider: '', walletProvider: '' },
    expense: { type: 'cash', provider: '', bankProvider: '', walletProvider: '' },
  });
  const [usageStats, setUsageStats] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareText, setShareText] = useState('');
  const [pressedBtn, setPressedBtn] = useState(null);
  const [voiceStep, setVoiceStep] = useState(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceDetectedTotal, setVoiceDetectedTotal] = useState(null);
  const [voiceItems, setVoiceItems] = useState([]);
  const [voiceConfidence, setVoiceConfidence] = useState(null);
  const [voiceProvider, setVoiceProvider] = useState(null);
  const [voiceDraft, setVoiceDraft] = useState(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(null);
  const [pendingTelegramCount, setPendingTelegramCount] = useState(0);
  const [retryingTelegram, setRetryingTelegram] = useState(false);

  const buildActorSnapshot = useCallback(() => (
    resolveActorSnapshot({ shopProfile, staffMembers, activeStaffMemberId })
  ), [shopProfile, staffMembers, activeStaffMemberId]);

  const currentActorLabel = useMemo(() => (
    getActorDisplayLabel({ shopProfile, staffMembers, activeStaffMemberId })
  ), [shopProfile, staffMembers, activeStaffMemberId]);

  const rememberLastSave = useCallback(async (snapshot) => {
    if (!snapshot) return;
    setLastSavedSnapshot(snapshot);
    try {
      await db.settings.put({ key: 'last_saved_snapshot', value: JSON.stringify(snapshot) });
    } catch { /* non-critical */ }
  }, []);

  const clearLastSavedSnapshot = useCallback(async () => {
    setLastSavedSnapshot(null);
    try {
      await db.settings.delete('last_saved_snapshot');
    } catch { /* non-critical */ }
  }, []);

  const appendVoiceQualityEvent = useCallback(async (event) => {
    try {
      const existing = await db.analytics.get('voice_quality_events');
      const events = parseAnalyticsJson(existing?.value, []);
      const nextEvents = [...events, event].slice(-100);
      await db.analytics.put({ key: 'voice_quality_events', value: JSON.stringify(nextEvents) });
    } catch { /* non-critical */ }
  }, []);

  const updateVoiceQualityStats = useCallback(async (updater) => {
    try {
      const existing = await db.analytics.get('voice_quality_stats');
      const current = parseAnalyticsJson(existing?.value, {
        captured: 0,
        fix_opened: 0,
        saved: 0,
        saved_without_edit: 0,
        saved_with_edit: 0,
        type_instead: 0,
        re_recorded: 0,
        amount_changed: 0,
        customer_changed: 0,
        items_changed: 0,
        note_changed: 0,
      });
      const next = updater(current);
      await db.analytics.put({ key: 'voice_quality_stats', value: JSON.stringify(next) });
    } catch { /* non-critical */ }
  }, []);

  const recordVoiceTelemetry = useCallback(async ({ action, wasEdited = false, changeSet = {}, transcript = null, provider = null, draft = null }) => {
    await updateVoiceQualityStats((current) => ({
      ...current,
      captured: current.captured + (action === 'captured' ? 1 : 0),
      fix_opened: current.fix_opened + (action === 'fix_opened' ? 1 : 0),
      saved: current.saved + (action === 'saved' ? 1 : 0),
      saved_without_edit: current.saved_without_edit + (action === 'saved' && !wasEdited ? 1 : 0),
      saved_with_edit: current.saved_with_edit + (action === 'saved' && wasEdited ? 1 : 0),
      type_instead: current.type_instead + (action === 'type_instead' ? 1 : 0),
      re_recorded: current.re_recorded + (action === 're_recorded' ? 1 : 0),
      amount_changed: current.amount_changed + (changeSet.amount ? 1 : 0),
      customer_changed: current.customer_changed + (changeSet.customer ? 1 : 0),
      items_changed: current.items_changed + (changeSet.items ? 1 : 0),
      note_changed: current.note_changed + (changeSet.note ? 1 : 0),
    }));

    await appendVoiceQualityEvent({
      timestamp: Date.now(),
      action,
      wasEdited,
      provider,
      transcript_length: transcript ? String(transcript).trim().length : 0,
      detected_items: draft?.items?.length || 0,
      detected_total: draft?.total_amount ?? null,
      needs_review: !!draft?.needs_review,
      changeSet: {
        amount: !!changeSet.amount,
        customer: !!changeSet.customer,
        items: !!changeSet.items,
        note: !!changeSet.note,
      },
    });
  }, [appendVoiceQualityEvent, updateVoiceQualityStats]);

  const loadData = useCallback(async () => {
    try {
      const [
        txns, customerRows, customerTxRows, catalogRows, supplierRows, supplierTxRows, staffRows,
        nameRow, phoneRow, businessTypeRow, epRow, reRow, customQuickAmountsRow, telegramRow,
        snapshotRow, activeStaffRow,
        // Payment receiving accounts — used by Pay-it-now /pay URLs (legacy, C.1)
        payTelebirrRow, payCbePhoneRow, payCbeAccountRow, payAwashPhoneRow,
        payBankNameRow, payBankAccountRow,
        // Unified payment channels (Commit C.4) + legacy custom lists for migration
        paymentChannelsRow, customBanksRow, customWalletsRow, identityRow,
      ] = await Promise.all([
        db.transactions.toArray(),
        db.customers.toArray(),
        db.customer_transactions.toArray(),
        db.catalog_entries?.toArray?.() || [],
        db.suppliers?.toArray?.() || [],
        db.supplier_transactions?.toArray?.() || [],
        db.staff_members?.toArray?.() || [],
        db.settings.get('shop_name'),
        db.settings.get('shop_phone'),
        db.settings.get('shop_business_type'),
        db.settings.get('enabled_payment_methods'),
        db.settings.get('recurring_expenses'),
        db.settings.get('custom_quick_amounts'),
        db.settings.get('shop_telegram'),
        db.settings.get('last_saved_snapshot'),
        db.settings.get('active_staff_member_id'),
        db.settings.get('shop_pay_telebirr'),
        db.settings.get('shop_pay_cbe_phone'),
        db.settings.get('shop_pay_cbe_account'),
        db.settings.get('shop_pay_awash_phone'),
        db.settings.get('shop_pay_bank_name'),
        db.settings.get('shop_pay_bank_account'),
        db.settings.get('shop_payment_channels'),
        db.settings.get('custom_banks'),
        db.settings.get('custom_wallets'),
        getIdentity(),
      ]);

      // Commit C.4: Migrate legacy payment storage to unified channels[] shape.
      // First load after C.4: read all legacy keys, run migration, persist.
      // Subsequent loads: parse the canonical key directly.
      let paymentChannels;
      if (paymentChannelsRow?.value) {
        try {
          const parsed = JSON.parse(paymentChannelsRow.value);
          paymentChannels = Array.isArray(parsed) && parsed.length > 0
            ? parsed
            : buildDefaultChannels();
        } catch {
          paymentChannels = buildDefaultChannels();
        }
      } else {
        // Check if user has ANY legacy data (existing user); seed defaults otherwise.
        const hasLegacy = !!(
          epRow?.value || payTelebirrRow?.value || payCbePhoneRow?.value ||
          payCbeAccountRow?.value || payAwashPhoneRow?.value ||
          payBankNameRow?.value || payBankAccountRow?.value ||
          customBanksRow?.value || customWalletsRow?.value
        );
        if (hasLegacy) {
          paymentChannels = migrateLegacyToChannels({
            enabledProvidersRaw: epRow?.value,
            customBanksRaw: customBanksRow?.value,
            customWalletsRaw: customWalletsRow?.value,
            payTelebirr: payTelebirrRow?.value,
            payCbePhone: payCbePhoneRow?.value,
            payCbeAccount: payCbeAccountRow?.value,
            payAwashPhone: payAwashPhoneRow?.value,
            payBankName: payBankNameRow?.value,
            payBankAccount: payBankAccountRow?.value,
          });
        } else {
          paymentChannels = buildDefaultChannels();
        }
        // Persist migrated/default channels so this one-time work is durable.
        try {
          await db.settings.put({ key: 'shop_payment_channels', value: JSON.stringify(paymentChannels) });
        } catch { /* non-critical — next save will retry */ }
      }
      txns.sort((a, b) => b.created_at - a.created_at);
      setTransactions(txns);
      setLedgerCustomers(customerRows);
      setLedgerTransactions(sortCustomerTransactions(customerTxRows));
      setCatalogEntries(catalogRows || []);
      setSuppliers(supplierRows || []);
      setSupplierTransactions(supplierTxRows || []);
      setStaffMembers((staffRows || []).sort((a, b) => {
        if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
        return String(a.display_name || '').localeCompare(String(b.display_name || ''));
      }));
      let identityForProfile = identityRow || null;
      if (!identityForProfile && nameRow?.value) {
        try {
          const result = await identityApi.createShop({
            display_name: nameRow.value,
            phone: phoneRow?.value || undefined,
            business_type: businessTypeRow?.value || 'retail-shop',
          });
          identityForProfile = {
            shop_id: result.shop_id,
            shop_name: result.shop_name || nameRow.value,
            join_code: result.join_code,
            join_url: result.join_url,
            device_id: result.device_id,
            device_token: result.device_token,
            staff_id: result.staff_id,
            display_name: result.display_name || nameRow.value,
            phone_number: phoneRow?.value || '',
            role: 'owner',
            permissions: result.permissions || {},
            device_status: result.device_status || 'active',
            phone_required: result.phone_required ?? false,
            approval_required: result.approval_required ?? false,
          };
          await setIdentity(identityForProfile);
        } catch {
          identityForProfile = null;
        }
      }
      const profileName = nameRow?.value || identityForProfile?.shop_name || null;
      // Commit C.4: derive legacy shapes from the canonical channels array so
      // PaymentTypeChips (reads enabledProviders) and ReminderSheet (reads
      // shopProfile.payments) keep working without changes.
      const derivedLegacy = deriveLegacyFromChannels(paymentChannels);

      setShopProfile({
        id: identityForProfile?.shop_id || null,
        shop_id: identityForProfile?.shop_id || null,
        name: profileName,
        phone: phoneRow?.value || identityForProfile?.phone_number || '',
        telegram: telegramRow?.value || '',
        businessType: businessTypeRow?.value || 'retail-shop',
        role: identityForProfile?.role || 'owner',
        staff_id: identityForProfile?.staff_id || null,
        device_id: identityForProfile?.device_id || null,
        join_code: identityForProfile?.join_code || '',
        join_url: identityForProfile?.join_url || '',
        // Canonical (Commit C.4)
        paymentChannels,
        // Legacy compat shim — derived, never written to from outside App.jsx
        payments: derivedLegacy.payments,
      });
      // Commit C.4: enabledProviders is derived from the canonical channels[]
      // (used by PaymentTypeChips). Keep DEFAULT_PROVIDERS as the safety net.
      try {
        setEnabledProviders(derivedLegacy.enabledProviders || DEFAULT_PROVIDERS);
      } catch {
        setEnabledProviders(DEFAULT_PROVIDERS);
      }
      try { setRecurringExpenses(reRow ? JSON.parse(reRow.value) : []); } catch { setRecurringExpenses([]); }
      try {
        const arr = customQuickAmountsRow ? JSON.parse(customQuickAmountsRow.value) : [];
        setCustomQuickAmounts(Array.isArray(arr) ? arr.filter(n => typeof n === 'number' && n > 0) : []);
      } catch { setCustomQuickAmounts([]); }
      const requestedStaffId = activeStaffRow?.value ?? null;
      const hasActiveStaff = (staffRows || []).some((member) => String(member.id) === String(requestedStaffId) && member.active !== false);
      setActiveStaffMemberId(hasActiveStaff ? requestedStaffId : null);
      const hasSavedRecords = txns.length > 0 || customerTxRows.length > 0;
      if (!hasSavedRecords) {
        setLastSavedSnapshot(null);
        try { await db.settings.delete('last_saved_snapshot'); } catch { /* non-critical */ }
      } else {
        try { setLastSavedSnapshot(snapshotRow?.value ? JSON.parse(snapshotRow.value) : null); } catch { setLastSavedSnapshot(null); }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (loading) return undefined;
    return runAfterFirstPaint(() => {
      [
        importCustomerList,
        importSupplierList,
        importReportView,
        importSettingsPage,
      ].forEach((preload) => {
        preload().catch(() => {
          // Non-critical preload. The lazy boundary will handle real navigation.
        });
      });
    });
  }, [loading]);

  const refreshPendingTelegramCount = useCallback(async () => {
    try {
      const count = await countPendingTelegramSync();
      setPendingTelegramCount(count);
      return count;
    } catch {
      setPendingTelegramCount(0);
      return 0;
    }
  }, []);

  useEffect(() => {
    if (loading) return undefined;
    refreshPendingTelegramCount();
    const handleQueueChanged = () => {
      refreshPendingTelegramCount();
    };
    window.addEventListener('gebya:sync-queue-changed', handleQueueChanged);
    window.addEventListener('online', handleQueueChanged);
    return () => {
      window.removeEventListener('gebya:sync-queue-changed', handleQueueChanged);
      window.removeEventListener('online', handleQueueChanged);
    };
  }, [loading, refreshPendingTelegramCount]);

  const refreshQueuedTelegramRecords = useCallback(async () => {
    const result = await drainTelegramSyncQueue({ limit: 5 });
    if (result.records?.length) {
      setLedgerTransactions(prev => prev.map((entry) => {
        const updated = result.records.find((record) => record.id === entry.id);
        return updated || entry;
      }));
    }
    await refreshPendingTelegramCount();
    return result;
  }, [refreshPendingTelegramCount]);

  const handleRetryQueuedTelegram = useCallback(async () => {
    if (retryingTelegram || !isBrowserOnline()) return;
    setRetryingTelegram(true);
    try {
      const result = await refreshQueuedTelegramRecords();
      const sentCount = result.records?.filter(record => record.telegram_delivery_state === 'bot_sent').length || 0;
      fireToast(sentCount > 0 ? `Telegram sent: ${sentCount}` : 'Telegram queue checked', 2200);
    } catch {
      fireToast('Telegram retry failed - will keep waiting', 2600);
    } finally {
      setRetryingTelegram(false);
    }
  }, [refreshQueuedTelegramRecords, retryingTelegram]);

  useEffect(() => {
    if (loading) return undefined;
    let cancelled = false;
    if (isBrowserOnline()) {
      runAfterFirstPaint(() => {
        if (cancelled) return;
        refreshQueuedTelegramRecords().catch(() => {});
      });
    }
    const handleOnline = () => {
      refreshQueuedTelegramRecords().catch(() => {});
    };
    window.addEventListener('online', handleOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
    };
  }, [loading, refreshQueuedTelegramRecords]);

  // Launch-critical: load the last-backup timestamp once on mount so we can
  // decide whether to surface the data-loss nudge on the Today tab.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await db.settings.get('gebya_last_backup_at');
        if (!cancelled) setLastBackupAt(row?.value ? Number(row.value) : null);
      } catch {
        if (!cancelled) setLastBackupAt(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const trackSession = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const [scRow, ladRow, sdRow, lsdRow, daRow, fcRow, fudRow, crRow] = await Promise.all([
        db.analytics.get('session_count'),
        db.analytics.get('last_active_date'),
        db.analytics.get('streak_days'),
        db.analytics.get('longest_streak'),
        db.analytics.get('days_active'),
        db.analytics.get('feature_counts'),
        db.analytics.get('first_used_date'),
        db.analytics.get('credits_repaid'),
      ]);

      const sessionCount = (scRow?.value || 0) + 1;
      const lastDate = ladRow?.value || null;
      const isNewDay = lastDate !== todayStr;

      let streak = sdRow?.value || 1;
      let longestStreak = lsdRow?.value || 1;
      if (isNewDay) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        streak = lastDate === yesterdayStr ? streak + 1 : 1;
        longestStreak = Math.max(longestStreak, streak);
      }

      let daysActive = [];
      try { daysActive = daRow ? JSON.parse(daRow.value) : []; } catch { daysActive = []; }
      if (isNewDay && !daysActive.includes(todayStr)) daysActive = [...daysActive, todayStr];

      let featureCounts = { sales: 0, expenses: 0, credits: 0 };
      try { featureCounts = fcRow ? JSON.parse(fcRow.value) : featureCounts; } catch { /* keep default */ }

      const firstUsed = fudRow?.value || todayStr;
      const creditsRepaid = crRow?.value || 0;

      await Promise.all([
        db.analytics.put({ key: 'session_count',   value: sessionCount }),
        db.analytics.put({ key: 'last_active_date', value: todayStr }),
        db.analytics.put({ key: 'streak_days',      value: streak }),
        db.analytics.put({ key: 'longest_streak',   value: longestStreak }),
        db.analytics.put({ key: 'days_active',      value: JSON.stringify(daysActive) }),
        db.analytics.put({ key: 'feature_counts',   value: JSON.stringify(featureCounts) }),
        db.analytics.put({ key: 'first_used_date',  value: firstUsed }),
      ]);

      const stats = { sessionCount, streak, longestStreak, daysActive, featureCounts, firstUsed, creditsRepaid };
      setUsageStats(stats);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Analytics tracking failed:', err);
    }
  }, [lang]);

  useEffect(() => { trackSession(); }, [trackSession]);

  useEffect(() => {
    processStaffEventQueue({ limit: 5 }).catch(() => {});
    const handleOnline = () => processStaffEventQueue({ limit: 5 }).catch(() => {});
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const handleAddTransaction = async (transaction) => {
    try {
      const isOnlineNow = isBrowserOnline();
      const now = new Date(transaction.created_at);
      const cloudProofFields = await createCloudProofFields();
      // Preserve customer_name from the payload (set by Partial/Pay-later flow); fall back to null
      const newTxn = {
        ...transaction,
        ethiopian_date: formatEthiopian(now),
        customer_name: transaction.customer_name || null,
        ...buildActorSnapshot(),
        ...cloudProofFields,
      };

      const id = await db.transactions.add(newTxn);
      const saved = await db.transactions.get(id);
      const transactionRecordType = getTransactionCloudProofRecordType(saved);
      if (transactionRecordType) {
        await enqueueCloudProofUpsert({
          recordTable: 'transactions',
          recordId: id,
          recordType: transactionRecordType,
          record: saved,
        });
      }
      if (saved?.type === 'sale') {
        await enqueueStaffEventSync({
          recordTable: 'transactions',
          record: saved,
          eventType: 'sale',
        });
        if (isOnlineNow) processStaffEventQueue({ limit: 3 }).catch(() => {});
      }
      await rememberLastSave({
        type: transaction.type,
        label: saved?.item_name || transaction.item_name || null,
        amount: saved?.amount || transaction.amount || 0,
        created_at: saved?.created_at || transaction.created_at,
      });

      setTransactions(prev => {
        const updated = [saved, ...prev];
        return updated;
      });

      // Paid · Partial · Pay Later — when a sale has a credit portion, also
      // record a customer_transaction so the customer's running balance updates.
      // Sale record keeps amount = full value sold; customer_transaction tracks
      // the unpaid portion. Today's cash tally should use cash_received on the
      // sale (= 0 for Later, partial for Partial).
      if (transaction.customer_id && Number(transaction.credit_amount) > 0) {
        try {
          const createdAt = transaction.created_at || Date.now();
          const customerCloudProofFields = await createCloudProofFields();
          const proofFields = buildPhotoFields(normalizePhotos(transaction));
          const customerTxEntry = {
            customer_id: transaction.customer_id,
            type: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
            amount: Number(transaction.credit_amount),
            item_note: transaction.item_name || null,
            catalog_entry_id: transaction.catalog_entry_id || null,
            item_kind: transaction.item_kind || null,
            due_date: null,
            // Settlement breadcrumb · so CustomerDetail can show a "from sale"
            // or "pay-later" badge on this credit row. Non-indexed, no schema
            // migration needed.
            settlement_mode: transaction.settlement_mode || null,
            // Multi-item breakdown · copy the items[] array onto the customer
            // credit so the 🧺 expander shows up in CustomerDetail history.
            items: Array.isArray(transaction.items) && transaction.items.length > 0
              ? transaction.items
              : null,
            // Copy transaction-level proof photo into the generated Dubie row.
            // Payments remain photo-free; item-level photos are out of scope.
            ...proofFields,
            source_transaction_id: id,
            source_type: 'pay_later_sale',
            reference_code: null,
            telegram_delivery_state: null,
            telegram_delivery_attempted_at: null,
            created_at: createdAt,
            updated_at: Date.now(),
            ...buildActorSnapshot(),
            ...customerCloudProofFields,
          };
          const cid = await db.customer_transactions.add(customerTxEntry);
          const referenceCode = createCustomerTransactionReference(cid, createdAt);
          await db.customer_transactions.update(cid, { reference_code: referenceCode });
          const savedCustomerTx = await db.customer_transactions.get(cid);
          if (savedCustomerTx) {
            await enqueueCloudProofUpsert({
              recordTable: 'customer_transactions',
              recordId: cid,
              recordType: 'customer_credit',
              record: savedCustomerTx,
            });
            await enqueueStaffEventSync({
              recordTable: 'customer_transactions',
              record: savedCustomerTx,
              eventType: 'customer_credit',
            });
            if (isOnlineNow) processStaffEventQueue({ limit: 3 }).catch(() => {});
          }
          if (savedCustomerTx) {
            setLedgerTransactions(prev => insertCustomerTransaction(prev, savedCustomerTx));
            const customerRecord = await db.customers.get(transaction.customer_id);
            if (customerRecord?.telegram_notify_enabled && customerRecord?.telegram_chat_id && customerRecord?.telegram_link_token) {
              const customerTxRows = await db.customer_transactions.where('customer_id').equals(transaction.customer_id).toArray();
              const nextBalance = Math.max(getCustomerBalance(customerTxRows), 0);
              const creditAmount = Number(transaction.credit_amount || 0);
              const previousBalance = Math.max(nextBalance - creditAmount, 0);
              const message = buildCustomerLedgerTelegramMessage({
                shopName: shopProfile?.name,
                customerName: customerRecord.display_name,
                type: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
                amount: creditAmount,
                itemNote: transaction.item_name,
                previousBalance,
                updatedBalance: nextBalance,
                createdAt,
                referenceCode,
              });
              const deliveryUpdates = {
                reference_code: referenceCode,
                telegram_delivery_state: isOnlineNow ? 'bot_pending' : 'bot_waiting_for_connection',
                telegram_delivery_error: isOnlineNow ? null : 'Telegram update needs internet.',
                telegram_delivery_attempted_at: Date.now(),
              };
              await db.customer_transactions.update(cid, deliveryUpdates);
              setLedgerTransactions(prev => prev.map(entry => (
                entry.id === cid ? { ...entry, ...deliveryUpdates } : entry
              )));
              await enqueueTelegramLedgerUpdate({
                recordTable: 'customer_transactions',
                recordId: cid,
                payload: {
                  customerState: {
                    token: customerRecord.telegram_link_token,
                    currentBalance: nextBalance,
                    updatesEnabled: !!customerRecord.telegram_notify_enabled,
                    telegramUsername: customerRecord.telegram_username || null,
                    chatId: customerRecord.telegram_chat_id || null,
                  },
                  ledgerUpdate: {
                    token: customerRecord.telegram_link_token,
                    currentBalance: nextBalance,
                    message,
                    reference: referenceCode,
                  },
                },
              });
              if (isOnlineNow) refreshQueuedTelegramRecords().catch(() => {});
            }
          }
        } catch (err) {
          if (import.meta.env.DEV) console.error('Credit-portion save failed:', err);
        }
      }

      if (transaction.type === 'sale' || transaction.type === 'expense') {
        const pType = transaction.payment_type || 'cash';
        const pProvider = transaction.payment_provider || '';
        setLastPayment(prev => {
          const prev_cat = prev[transaction.type] || {};
          return {
            ...prev,
            [transaction.type]: {
              type: pType,
              provider: pProvider,
              bankProvider:   pType === 'bank'   ? pProvider : (prev_cat.bankProvider   || ''),
              walletProvider: pType === 'wallet' ? pProvider : (prev_cat.walletProvider || ''),
            },
          };
        });
      }

      const fcKey = { sale: 'sales', expense: 'expenses' }[transaction.type];
      if (fcKey) {
        try {
          const fcRow = await db.analytics.get('feature_counts');
          let fc = { sales: 0, expenses: 0, credits: 0 };
          try { fc = fcRow ? JSON.parse(fcRow.value) : fc; } catch { /* keep default */ }
          fc[fcKey] = (fc[fcKey] || 0) + 1;
          await db.analytics.put({ key: 'feature_counts', value: JSON.stringify(fc) });
          setUsageStats(prev => {
            if (!prev) return prev;
            return { ...prev, featureCounts: fc };
          });
        } catch { /* non-critical */ }
      }

      const toastMsg = { sale: t.saleSaved, expense: t.expenseSaved }[transaction.type] || 'Saved';
      const safeToastMsg = buildSavedOnDeviceMessage(toastMsg, isOnlineNow);
      fireToast(safeToastMsg, isOnlineNow ? 4000 : 4500, async () => {
        try {
          await db.transactions.delete(id);
          setTransactions(prev => prev.filter(t2 => t2.id !== id));
          fireToast(t.undone, 2000);
        } catch { /* non-critical */ }
      });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to save:', err);
      alert('Could not save. Please try again.');
      throw err;
    }
  };

  const handleVoiceSave = useCallback(async ({ amount, note, paymentType = 'cash', paymentProvider = '', wasEdited = false, draft = null }) => {
    const now = Date.now();
    const hasMultiple = voiceItems.length > 1;
    const originalDraft = hasMultiple ? mergeVoiceDrafts(voiceItems, voiceDraft) : voiceDraft;
    const mergedDraft = hasMultiple ? mergeVoiceDrafts(voiceItems, draft || voiceDraft) : (draft || voiceDraft);
    if (mergedDraft?.intent && mergedDraft.intent !== 'sale' && !wasEdited) {
      fireToast('Voice only saves sales right now. Review the draft before saving.', 2800);
      setVoiceStep('fix');
      return;
    }
    const combinedTranscript = hasMultiple
      ? voiceItems.map(it => it.transcript).join(' | ')
      : (voiceTranscript || null);
    const savedDetectedTotal = hasMultiple
      ? (mergedDraft?.total_amount ?? voiceItems.reduce((sum, it) => sum + (it.detectedTotal || 0), 0))
      : (mergedDraft?.total_amount ?? voiceDetectedTotal ?? null);
    const originalSummaryNote = buildVoiceSummaryFromDraft(originalDraft) || combinedTranscript || 'Voice sale';
    const summaryNote = note || buildVoiceSummaryFromDraft(mergedDraft) || 'Voice sale';
    const primaryItem = mergedDraft?.items?.length === 1 ? mergedDraft.items[0] : null;
    const amountChanged = Math.abs(Number(amount || 0) - Number(savedDetectedTotal || 0)) > 0.01;
    const customerChanged = normalizeVoiceTelemetryText(mergedDraft?.customer_name) !== normalizeVoiceTelemetryText(originalDraft?.customer_name);
    const itemsChanged = JSON.stringify(normalizeVoiceTelemetryItems(mergedDraft?.items || [])) !== JSON.stringify(normalizeVoiceTelemetryItems(originalDraft?.items || []));
    const noteChanged = normalizeVoiceTelemetryText(summaryNote) !== normalizeVoiceTelemetryText(originalSummaryNote);

    const transaction = {
      type: 'sale',
      item_name: primaryItem?.name || summaryNote,
      quantity: primaryItem?.quantity || 1,
      amount,
      cost_price: 0,
      profit: null,
      is_credit: false,
      customer_phone: null,
      customer_name: mergedDraft?.customer_name || null,
      due_date: null,
      payment_type: paymentType,
      payment_provider: paymentType !== 'cash' ? paymentProvider || null : null,
      direction: null,
      source: 'voice',
      raw_transcript: combinedTranscript,
      detected_total: savedDetectedTotal,
      was_edited: wasEdited || false,
      transcription_provider: voiceProvider,
      parsing_confidence: hasMultiple ? null : (voiceConfidence ?? null),
      voice_note: summaryNote || null,
      raw_audio_ref: null,
      created_at: now,
    };
    await handleAddTransaction(transaction);
    await recordVoiceTelemetry({
      action: 'saved',
      wasEdited,
      transcript: combinedTranscript,
      provider: voiceProvider,
      draft: mergedDraft,
      changeSet: {
        amount: amountChanged,
        customer: customerChanged,
        items: itemsChanged,
        note: noteChanged,
      },
    });
    setVoiceStep(null);
    setVoiceTranscript('');
    setVoiceDetectedTotal(null);
    setVoiceItems([]);
    setVoiceConfidence(null);
    setVoiceProvider(null);
    setVoiceDraft(null);
  }, [handleAddTransaction, recordVoiceTelemetry, voiceConfidence, voiceDetectedTotal, voiceDraft, voiceItems, voiceProvider, voiceTranscript]);

  const handleUpdateTransaction = async (id, updates) => {
    try {
      await db.transactions.update(id, { ...updates, updated_at: Date.now() });
      const updated = await db.transactions.get(id);
      setTransactions(prev => prev.map(t2 => t2.id === id ? updated : t2));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to update:', err);
      alert('Could not update. Please try again.');
      throw err;
    }
  };

  const handleDeleteTransaction = async (id) => {
    try {
      await db.transactions.delete(id);
      const remainingTransactions = transactions.filter(t2 => t2.id !== id);
      setTransactions(remainingTransactions);
      if (remainingTransactions.length === 0 && ledgerTransactions.length === 0) {
        await clearLastSavedSnapshot();
      }
      setDeleteTarget(null);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to delete:', err);
    }
  };

  /**
   * Commit C.4: Persist a unified payment-channels array.
   *
   * Writes the canonical key (shop_payment_channels) AND keeps the legacy
   * keys (enabled_payment_methods, custom_banks, custom_wallets, shop_pay_*)
   * in sync so PaymentTypeChips and ReminderSheet continue to read from
   * their existing data paths without needing their own refactor.
   *
   * Called from SettingsPage whenever the user toggles a channel or edits
   * a phone/account field. Optimistic update: state is updated first, then
   * Dexie writes happen; on write failure, state still reflects the user's
   * intent (we just log).
   */
  const handleSavePaymentChannels = async (channels) => {
    const normalized = normalizeChannelsForSave(channels || []);
    // Update React state immediately (optimistic)
    setShopProfile(prev => ({
      ...prev,
      paymentChannels: normalized,
      payments: deriveLegacyFromChannels(normalized).payments,
    }));
    const derived = deriveLegacyFromChannels(normalized);
    setEnabledProviders(derived.enabledProviders || DEFAULT_PROVIDERS);

    try {
      // Canonical
      await db.settings.put({ key: 'shop_payment_channels', value: JSON.stringify(normalized) });
      // Legacy compat — derived
      await db.settings.put({ key: 'enabled_payment_methods', value: JSON.stringify(derived.enabledProviders) });
      await db.settings.put({ key: 'custom_banks', value: JSON.stringify(derived.customBanks) });
      await db.settings.put({ key: 'custom_wallets', value: JSON.stringify(derived.customWallets) });
      // Pay-it-now legacy
      await db.settings.put({ key: 'shop_pay_telebirr', value: derived.payments.telebirr });
      await db.settings.put({ key: 'shop_pay_cbe_phone', value: derived.payments.cbe_phone });
      await db.settings.put({ key: 'shop_pay_cbe_account', value: derived.payments.cbe_account });
      await db.settings.put({ key: 'shop_pay_awash_phone', value: derived.payments.awash_phone });
      await db.settings.put({ key: 'shop_pay_bank_name', value: derived.payments.bank_name });
      await db.settings.put({ key: 'shop_pay_bank_account', value: derived.payments.bank_account });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Payment channels save failed:', err);
    }
  };

  const handleProfileSave = async (name, phone, telegram, businessType = 'retail-shop') => {
    await db.settings.put({ key: 'shop_name', value: name });
    await db.settings.put({ key: 'shop_phone', value: phone || '' });
    await db.settings.put({ key: 'shop_telegram', value: telegram || '' });
    await db.settings.put({ key: 'shop_business_type', value: businessType || 'retail-shop' });

    // Commit C.4: payment accounts moved to handleSavePaymentChannels.
    // The profile form no longer owns telebirr/CBE/Awash fields — those
    // live in the unified Payment Channels section (which has its own
    // save handler). We preserve shopProfile.paymentChannels here so
    // the profile-form save doesn't blank them out.
    setShopProfile(prev => ({
      ...prev,
      name,
      phone: phone || '',
      telegram: telegram || '',
      businessType: businessType || 'retail-shop',
      // Preserve channel state untouched
      paymentChannels: prev?.paymentChannels,
      payments: prev?.payments,
    }));
  };

  const handleSaveStaffMember = async (payload) => {
    const normalized = normalizeStaffDraft(payload);
    if (!normalized) return false;
    const id = await db.staff_members.add(normalized);
    const saved = await db.staff_members.get(id);
    setStaffMembers(prev => [...prev, saved].sort((a, b) => {
      if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
      return String(a.display_name || '').localeCompare(String(b.display_name || ''));
    }));
    return saved;
  };

  const handleUpdateStaffMember = async (staffId, payload) => {
    const member = staffMembers.find(item => String(item.id) === String(staffId));
    if (!member) return false;
    const displayName = String(payload?.display_name || '').trim();
    if (!displayName) return false;

    const now = Date.now();
    await db.staff_members.update(member.id, { display_name: displayName, updated_at: now });
    const updatedMember = { ...member, display_name: displayName, updated_at: now };
    setStaffMembers(prev => prev
      .map(item => item.id === member.id ? updatedMember : item)
      .sort((a, b) => {
        if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
        return String(a.display_name || '').localeCompare(String(b.display_name || ''));
      }));
    return updatedMember;
  };

  const handleSetActiveStaffMember = async (staffId) => {
    const nextId = staffId ? Number(staffId) : null;
    await db.settings.put({ key: 'active_staff_member_id', value: nextId });
    setActiveStaffMemberId(nextId);
  };

  const handleDeactivateStaffMember = async (staffId) => {
    const member = staffMembers.find(item => String(item.id) === String(staffId));
    if (!member) return false;
    if (member.staff_id) {
      try {
        const token = await getDeviceToken();
        if (!token) return false;
        await identityApi.deactivateStaff(member.staff_id, token);
        await refreshStaffMembers();
        return true;
      } catch {
        return false;
      }
    }
    const now = Date.now();
    await db.staff_members.update(member.id, { active: false, updated_at: now, deactivated_at: now });
    setStaffMembers(prev => prev
      .map(item => item.id === member.id ? { ...item, active: false, updated_at: now, deactivated_at: now } : item)
      .sort((a, b) => {
        if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
        return String(a.display_name || '').localeCompare(String(b.display_name || ''));
      }));
    if (String(activeStaffMemberId) === String(member.id)) {
      await db.settings.put({ key: 'active_staff_member_id', value: null });
      setActiveStaffMemberId(null);
    }
    return true;
  };

  const handleReactivateStaffMember = async (staffId) => {
    const member = staffMembers.find(item => String(item.id) === String(staffId));
    if (!member) return false;
    const now = Date.now();
    await db.staff_members.update(member.id, { active: true, updated_at: now, deactivated_at: null });
    setStaffMembers(prev => prev
      .map(item => item.id === member.id ? { ...item, active: true, updated_at: now, deactivated_at: null } : item)
      .sort((a, b) => {
        if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
        return String(a.display_name || '').localeCompare(String(b.display_name || ''));
      }));
    return true;
  };

  const refreshStaffMembers = useCallback(async () => {
    const shopId = shopProfile?.shop_id || shopProfile?.id;
    if (!shopId) return;
    const token = await getDeviceToken();
    if (!token) return;
    const data = await identityApi.listStaff(shopId, token);
    if (!data?.staff) return;
    setStaffMembers(data.staff
      .filter(s => s.role !== 'owner')
      .map(s => ({
        id: s.staff_id,
        staff_id: s.staff_id,
        display_name: s.display_name,
        phone_snapshot: s.phone_snapshot,
        role: s.role,
        active: s.staff_status !== 'inactive',
        staff_status: s.staff_status,
        pending: (s.devices || []).some(d => d.device_status === 'pending'),
        permissions: s.permissions,
        joined_at: s.joined_at,
        updated_at: Date.now(),
        deactivated_at: s.deactivated_at,
        devices: (s.devices || []).map(d => ({
          id: d.device_id,
          device_id: d.device_id,
          device_label: d.device_label,
          active: d.device_status === 'active',
          device_status: d.device_status,
          pending: d.device_status === 'pending',
          last_seen_at: d.last_seen_at,
          created_at: d.created_at,
        })),
      })));
  }, [shopProfile]);

  const handleRotateJoinCode = useCallback(async (shopId) => {
    try {
      const token = await getDeviceToken();
      if (!token) return null;
      const result = await identityApi.rotateJoinCode(shopId, token);
      setShopProfile(prev => prev ? { ...prev, join_code: result.join_code, join_url: result.join_url } : prev);
      return result;
    } catch {
      return null;
    }
  }, []);

  const handleUpdateShopSettings = useCallback(async (shopId, patch) => {
    try {
      const token = await getDeviceToken();
      if (!token) return null;
      return identityApi.updateShopSettings(shopId, {
        phone_required: patch.require_phone_on_join,
        approval_required: patch.require_approval,
      }, token);
    } catch {
      return null;
    }
  }, []);

  const handleApproveDevice = useCallback(async (deviceId) => {
    try {
      const token = await getDeviceToken();
      if (!token) return null;
      const result = await identityApi.approveDevice(deviceId, token);
      await refreshStaffMembers();
      return result;
    } catch {
      return null;
    }
  }, [refreshStaffMembers]);

  const handleRejectDevice = useCallback(async (deviceId, reason) => {
    try {
      const token = await getDeviceToken();
      if (!token) return null;
      const result = await identityApi.rejectDevice(deviceId, { reason }, token);
      await refreshStaffMembers();
      return result;
    } catch {
      return null;
    }
  }, [refreshStaffMembers]);

  const customerSummaries = useMemo(
    () => buildCustomerSummaries(ledgerCustomers, ledgerTransactions),
    [ledgerCustomers, ledgerTransactions]
  );

  // Enriched customer summaries — adds on_time_count, on_time_rate, has_overdue,
  // overdue_amount, overdue_days, avg_pay_days. Used by the v0.3 Credit page.
  // Defined HERE (early) because selectedCustomer + activeCustomerTransactionModal
  // both pull from this enriched list.
  const enrichedCustomerSummariesEarly = useMemo(
    () => enrichCustomerSummaries(customerSummaries),
    [customerSummaries]
  );

  const selectedCustomer = useMemo(
    () => enrichedCustomerSummariesEarly.find(c => c.id === selectedCustomerId) || null,
    [enrichedCustomerSummariesEarly, selectedCustomerId]
  );

  const activeCustomerTransactionModal = useMemo(() => {
    if (!customerTransactionModal?.customerId) return null;
    return enrichedCustomerSummariesEarly.find(c => c.id === customerTransactionModal.customerId) || null;
  }, [enrichedCustomerSummariesEarly, customerTransactionModal]);

  const activeCatalogEntries = useMemo(
    () => catalogEntries.filter(entry => entry.active !== false).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [catalogEntries]
  );

  // Alias for backward-compat in renders below. (Already enriched up top.)
  const enrichedCustomerSummaries = enrichedCustomerSummariesEarly;

  // Composite credit-page metrics (hero card numbers, streak, top customer).
  // Streak draws on ALL transactions across types so it reflects real shop use.
  const creditMetrics = useMemo(() => {
    const allTimestamps = [
      ...transactions.map(t => t.created_at),
      ...ledgerTransactions.map(t => t.created_at),
      ...supplierTransactions.map(t => t.created_at),
    ];
    return buildCreditMetrics({
      enrichedSummaries: enrichedCustomerSummaries,
      customerTransactions: ledgerTransactions,
      globalTimestamps: allTimestamps,
    });
  }, [enrichedCustomerSummaries, ledgerTransactions, transactions, supplierTransactions]);

  const supplierSummaries = useMemo(
    () => buildSupplierSummaries(suppliers, supplierTransactions),
    [suppliers, supplierTransactions]
  );

  const selectedSupplier = useMemo(
    () => supplierSummaries.find(s => s.id === selectedSupplierId) || null,
    [supplierSummaries, selectedSupplierId]
  );

  const activeSupplierTransactionModal = useMemo(() => {
    if (!supplierTransactionModal?.supplierId) return null;
    return supplierSummaries.find(s => s.id === supplierTransactionModal.supplierId) || null;
  }, [supplierSummaries, supplierTransactionModal]);

  const telegramConnectCustomer = useMemo(
    () => customerSummaries.find(c => c.id === telegramConnectCustomerId) || null,
    [customerSummaries, telegramConnectCustomerId]
  );

  const mergedVoiceDraft = useMemo(
    () => mergeVoiceDrafts(voiceItems, voiceDraft),
    [voiceDraft, voiceItems]
  );

  const voiceWorkspace = useMemo(() => {
    const saleTransactions = transactions.filter((tx) => tx.type === 'sale');
    const recentSales = saleTransactions.slice(0, 5).map((tx) => ({
      id: tx.id,
      label: tx.voice_note || tx.item_name || 'Voice sale',
      amount: Number(tx.amount || 0),
      customerName: tx.customer_name || '',
      paymentType: tx.payment_type || 'cash',
      paymentProvider: tx.payment_provider || '',
      createdAt: tx.created_at,
      draft: buildVoiceDraftFromTransaction(tx),
      transcript: tx.raw_transcript || tx.voice_note || tx.item_name || '',
    }));

    const itemCounts = new Map();
    const customerMap = new Map();
    const customerPatternCounts = new Map();

    saleTransactions.forEach((tx) => {
      const itemName = String(tx.item_name || '').trim();
      const amount = tx.amount != null ? Number(tx.amount) : null;
      if (itemName) {
        const existing = itemCounts.get(itemName) || { name: itemName, uses: 0, defaultPrice: null, prices: [] };
        existing.uses += 1;
        if (existing.defaultPrice == null && amount != null && amount > 0) {
          existing.defaultPrice = amount;
        }
        if (amount != null && amount > 0) {
          existing.prices.push(amount);
        }
        itemCounts.set(itemName, existing);
      }

      const customerName = String(tx.customer_name || '').trim();
      if (customerName) {
        if (!customerMap.has(customerName)) {
          customerMap.set(customerName, {
            name: customerName,
            lastAmount: amount,
            lastItemName: itemName,
            lastSeenAt: tx.created_at,
          });
        }

        if (itemName) {
          const customerPatterns = customerPatternCounts.get(customerName) || new Map();
          customerPatterns.set(itemName, (customerPatterns.get(itemName) || 0) + 1);
          customerPatternCounts.set(customerName, customerPatterns);
        }
      }
    });

    const commonItems = [...itemCounts.values()]
      .map((item) => ({
        ...item,
        typicalPrice: item.prices.length
          ? Math.round((item.prices.reduce((sum, price) => sum + price, 0) / item.prices.length) * 100) / 100
          : item.defaultPrice,
      }))
      .sort((a, b) => (b.uses - a.uses) || String(a.name).localeCompare(String(b.name)))
      .slice(0, 8);

    const recentCustomers = [...customerMap.values()].slice(0, 6);

    const itemPriceMemory = {};
    for (const item of itemCounts.values()) {
      const prices = item.prices.slice(-6);
      const typicalPrice = prices.length
        ? Math.round((prices.reduce((sum, price) => sum + price, 0) / prices.length) * 100) / 100
        : item.defaultPrice;
      itemPriceMemory[item.name] = {
        typical_price: typicalPrice,
        recent_prices: prices,
        min_price: prices.length ? Math.min(...prices) : typicalPrice,
        max_price: prices.length ? Math.max(...prices) : typicalPrice,
      };
    }

    const customerItemPatterns = {};
    for (const [customerName, itemMap] of customerPatternCounts.entries()) {
      customerItemPatterns[customerName] = [...itemMap.entries()]
        .sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])))
        .slice(0, 3)
        .map(([itemName]) => itemName);
    }

    return {
      recentSales,
      commonItems,
      recentCustomers,
      itemPriceMemory,
      customerItemPatterns,
      lastSavedSnapshot,
    };
  }, [lastSavedSnapshot, transactions]);

  const voiceContext = useMemo(() => ({
    business_type: BUSINESS_TYPE_PROMPT_LABELS[shopProfile?.businessType] || BUSINESS_TYPE_PROMPT_LABELS['retail-shop'],
    common_items: voiceWorkspace.commonItems.map((item) => item.name),
    recent_customers: voiceWorkspace.recentCustomers.map((customer) => customer.name),
    payment_providers: [...new Set([
      ...(enabledProviders?.banks || []),
      ...(enabledProviders?.wallets || []),
      'cash',
    ])],
    item_price_memory: voiceWorkspace.itemPriceMemory,
    customer_item_patterns: voiceWorkspace.customerItemPatterns,
  }), [enabledProviders, shopProfile?.businessType, voiceWorkspace]);
  const openVoiceShortcutDraft = useCallback(({ transcript = '', detectedTotal = null, draft = null, provider = 'shop-memory', step = 'result' }) => {
    setVoiceItems([]);
    setVoiceTranscript(transcript);
    setVoiceDetectedTotal(detectedTotal);
    setVoiceConfidence(null);
    setVoiceProvider(provider);
    setVoiceDraft(draft);
    setVoiceStep(step);
  }, []);

  const handleVoiceRepeatSale = useCallback((sale) => {
    if (!sale) return;
    openVoiceShortcutDraft({
      transcript: sale.transcript || sale.label || '',
      detectedTotal: sale.amount ?? sale.draft?.total_amount ?? null,
      draft: sale.draft || null,
      provider: 'shop-memory',
      step: 'result',
    });
  }, [openVoiceShortcutDraft]);

  const handleVoiceUseItemShortcut = useCallback((item) => {
    if (!item?.name) return;
    const amount = item.defaultPrice != null ? Number(item.defaultPrice) : null;
    openVoiceShortcutDraft({
      transcript: item.name,
      detectedTotal: amount,
      draft: {
        customer_name: null,
        items: [{
          name: item.name,
          quantity: 1,
          unit_price: amount,
          line_total: amount,
        }],
        total_amount: amount,
        intent: 'sale',
        needs_review: amount == null,
      },
      provider: 'shop-memory',
      step: amount != null ? 'result' : 'fix',
    });
  }, [openVoiceShortcutDraft]);

  const handleVoiceUseCustomerShortcut = useCallback((customer) => {
    if (!customer?.name) return;
    openVoiceShortcutDraft({
      transcript: customer.name,
      detectedTotal: customer.lastAmount ?? null,
      draft: {
        customer_name: customer.name,
        items: customer.lastItemName ? [{
          name: customer.lastItemName,
          quantity: 1,
          unit_price: customer.lastAmount ?? null,
          line_total: customer.lastAmount ?? null,
        }] : [],
        total_amount: customer.lastAmount ?? null,
        intent: 'sale',
        needs_review: true,
      },
      provider: 'shop-memory',
      step: 'fix',
    });
  }, [openVoiceShortcutDraft]);

  const syncLinkedCustomerTelegramState = useCallback(async (customer, currentBalanceOverride = null) => {
    if (!customer?.telegram_link_token || !customer?.telegram_chat_id) return null;
    try {
      return await syncTelegramCustomerState({
        token: customer.telegram_link_token,
        customerName: customer.display_name,
        shopName: shopProfile?.name || 'Gebya',
        currentBalance: currentBalanceOverride != null ? currentBalanceOverride : Number(customer.balance || 0),
        updatesEnabled: !!customer.telegram_notify_enabled,
        telegramUsername: customer.telegram_username || null,
        chatId: customer.telegram_chat_id || null,
      });
    } catch {
      return null;
    }
  }, [shopProfile?.name]);

  // Light-weight customer creator for inline "+ New customer" picker inside
  // TransactionForm (Partial / Pay Later flow). Returns the saved record so
  // the caller can immediately wire it into the transaction. No nav switch,
  // no toast — the caller drives the UX.
  const handleAddCustomerInline = async (payload) => {
    const draft = normalizeCustomerDraft(payload);
    if (!draft) return null;
    try {
      const now = Date.now();
      const linkToken = createCustomerTelegramLinkToken();
      const id = await db.customers.add({
        ...draft,
        // Customer photo · base64, non-indexed, no schema migration needed
        photo: payload?.photo || null,
        telegram_chat_id: null,
        telegram_link_token: linkToken,
        telegram_linked_at: null,
        telegram_link_requested_at: null,
        created_at: now,
        updated_at: now,
      });
      const saved = await db.customers.get(id);
      setLedgerCustomers(prev => [...prev, saved]);
      return saved;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Inline customer save failed:', err);
      return null;
    }
  };

  const handleAddCustomer = async (payload) => {
    const draft = normalizeCustomerDraft(payload);
    if (!draft) return false;

    try {
      const now = Date.now();
      // Edit branch — payload.id present means update existing row
      if (payload.id) {
        const updates = {
          ...draft,
          photo: payload?.photo || null,
          updated_at: now,
        };
        await db.customers.update(payload.id, updates);
        const updated = await db.customers.get(payload.id);
        setLedgerCustomers(prev => prev.map(c => (c.id === payload.id ? updated : c)));
        setShowCustomerForm(false);
        fireToast(lang === 'am' ? 'ተስተካክሏል' : 'Customer updated', 1800);
        return true;
      }
      const linkToken = createCustomerTelegramLinkToken();
      const id = await db.customers.add({
        ...draft,
        // Customer photo · base64, non-indexed
        photo: payload?.photo || null,
        telegram_chat_id: null,
        telegram_link_token: linkToken,
        telegram_linked_at: null,
        telegram_link_requested_at: null,
        created_at: now,
        updated_at: now,
      });
      const saved = await db.customers.get(id);
      setLedgerCustomers(prev => [...prev, saved]);
      setShowCustomerForm(false);
      setSelectedCustomerId(id);
      setActiveTab('credit');
      fireToast(t.customerSaved, 1800);
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to save customer:', err);
      fireToast(t.customerSaveFailed || 'Could not save customer. Please try again.', 2400);
      return false;
    }
  };

  const handleUpdateCustomerRecord = async (customerId, updates) => {
    const now = Date.now();
    const nextUpdates = { ...updates, updated_at: now };
    await db.customers.update(customerId, nextUpdates);
    setLedgerCustomers(prev => prev.map(customer => (
      customer.id === customerId ? { ...customer, ...nextUpdates } : customer
    )));
  };

  const handleToggleCustomerTelegramNotify = async (customer) => {
    if (!customer) return;
    const hasLinkedBorrower = !!customer.telegram_chat_id;
    const hasManualTelegram = !!customer.telegram_username;

    if (!hasLinkedBorrower && !hasManualTelegram) {
      await handleUpdateCustomerRecord(customer.id, {
        telegram_notify_enabled: false,
      });
      setTelegramConnectCustomerId(customer.id);
      fireToast(t.telegramConnectFirstToast, 2200);
      return;
    }
    const nextEnabled = !customer.telegram_notify_enabled;
    await handleUpdateCustomerRecord(customer.id, {
      telegram_notify_enabled: nextEnabled,
    });
    if (hasLinkedBorrower) {
      await syncLinkedCustomerTelegramState({
        ...customer,
        telegram_notify_enabled: nextEnabled,
      });
    } else if (nextEnabled) {
      fireToast('Manual Telegram updates will open a drafted message after each save.', 2600);
    }
  };

  const handleCustomerReminderSent = async (customerId) => {
    const stamp = Date.now();
    try {
      await db.customers.update(customerId, { last_reminded_at: stamp });
    } catch {
      // non-critical — keep optimistic UI
    }
    setLedgerCustomers(prev => prev.map(c => (
      c.id === customerId ? { ...c, last_reminded_at: stamp } : c
    )));
    // Bulk-reminder queue: advance to next overdue customer automatically.
    // Use functional update so we read the latest queue state.
    setBulkReminderQueue(prevQueue => {
      if (!prevQueue || prevQueue.length === 0) return prevQueue;
      const [nextId, ...rest] = prevQueue;
      const nextCustomer = ledgerCustomers.find(c => c.id === nextId);
      if (nextCustomer) {
        // Defer slightly so the current ReminderSheet closes cleanly before
        // the next one opens.
        setTimeout(() => setReminderTarget(nextCustomer), 120);
      }
      return rest;
    });
  };

  const handleCustomQuickAmountsChange = async (nextList) => {
    // Dedupe, drop non-positive, cap at 8 most recent
    const clean = Array.from(new Set((nextList || [])
      .filter(n => typeof n === 'number' && n > 0 && Number.isFinite(n))
    )).slice(-8);
    setCustomQuickAmounts(clean);
    try {
      await db.settings.put({ key: 'custom_quick_amounts', value: JSON.stringify(clean) });
    } catch {
      // non-critical
    }
  };

  const handleSaveCatalogEntry = async (payload) => {
    const now = Date.now();
    const entry = {
      name: String(payload.name || '').trim(),
      kind: payload.kind === 'service' ? 'service' : 'item',
      default_price: payload.default_price != null && payload.default_price !== '' ? Number(payload.default_price) : null,
      default_cost: payload.default_cost != null && payload.default_cost !== '' ? Number(payload.default_cost) : null,
      note: payload.note ? String(payload.note).trim() : null,
      active: payload.active !== false,
      created_at: payload.created_at || now,
      updated_at: now,
    };

    if (!entry.name) return null;

    if (payload.id) {
      await db.catalog_entries.update(payload.id, entry);
      const saved = await db.catalog_entries.get(payload.id);
      setCatalogEntries(prev => prev.map(item => item.id === payload.id ? saved : item));
      return saved;
    }

    const id = await db.catalog_entries.add(entry);
    const saved = await db.catalog_entries.get(id);
    setCatalogEntries(prev => [...prev, saved]);
    return saved;
  };

  const handleToggleCatalogEntryActive = async (entry) => {
    if (!entry?.id) return;
    const updatedAt = Date.now();
    await db.catalog_entries.update(entry.id, { active: entry.active === false, updated_at: updatedAt });
    setCatalogEntries(prev => prev.map(item => (
      item.id === entry.id ? { ...item, active: item.active === false, updated_at: updatedAt } : item
    )));
  };

  const handleSaveSupplier = async (payload) => {
    const now = Date.now();
    const entry = {
      display_name: String(payload.display_name || '').trim(),
      phone_number: payload.phone_number ? String(payload.phone_number).trim() : null,
      note: payload.note ? String(payload.note).trim() : null,
      // Commit D: supplier photo (base64 data URL, non-indexed Dexie property).
      photo: payload.photo || null,
      active: payload.active !== false,
      created_at: payload.created_at || now,
      updated_at: now,
    };

    if (!entry.display_name) return null;

    if (payload.id) {
      // Edit branch: preserve created_at if not provided explicitly
      const { created_at, ...editEntry } = entry;
      await db.suppliers.update(payload.id, editEntry);
      const saved = await db.suppliers.get(payload.id);
      setSuppliers(prev => prev.map(item => item.id === payload.id ? saved : item));
      return saved;
    }

    const id = await db.suppliers.add(entry);
    const saved = await db.suppliers.get(id);
    setSuppliers(prev => [...prev, saved]);
    return saved;
  };

  const handleSaveSupplierTransaction = async (payload) => {
    // Commit D: EDIT branch — payload carries editing_id (mirror of
    // handleSaveCustomerTransaction). Only allow amount + item_name + note +
    // photo edits; type and supplier_id stay locked to the original row.
    if (payload?.editing_id) {
      const amount = Number(payload.amount) || 0;
      if (amount <= 0) {
        fireToast('Enter a valid amount', 2200);
        return false;
      }
      const now = Date.now();
      let updated = null;
      await db.transaction('rw', db.supplier_transactions, db.suppliers, async () => {
        const existing = await db.supplier_transactions.get(payload.editing_id);
        if (!existing) return;
        const supplierTx = await db.supplier_transactions
          .where('supplier_id').equals(existing.supplier_id).toArray();
        // Refuse a payment edit that would over-pay
        if (existing.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT) {
          const others = supplierTx.filter(t => t.id !== existing.id);
          const otherBalance = Math.max(getSupplierBalance(others), 0);
          if (amount > otherBalance) {
            fireToast('Payment is more than remaining dubie', 2600);
            return;
          }
        }
        const nextEntry = {
          ...existing,
          amount,
          item_name: payload.item_name || existing.item_name || null,
          note: payload.note || existing.note || null,
          ...(existing.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT
            ? { photos: [], photo: null, photo_taken_at: null }
            : buildPhotoFields(normalizePhotos(payload))),
          updated_at: now,
        };
        await db.supplier_transactions.update(payload.editing_id, nextEntry);
        updated = await db.supplier_transactions.get(payload.editing_id);
        await db.suppliers.update(existing.supplier_id, { updated_at: now });
      });
      if (!updated) return false;
      setSupplierTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
      fireToast(lang === 'am' ? 'ተስተካክሏል' : 'Entry updated', 1800);
      return true;
    }

    if (!isValidSupplierTransactionType(payload.type)) return false;
    const supplier = supplierSummaries.find(item => item.id === payload.supplier_id);
    if (!supplier) {
      fireToast('Supplier not found', 2200);
      return false;
    }

    const amount = Number(payload.amount) || 0;
    if (amount <= 0) {
      fireToast('Enter a valid amount', 2200);
      return false;
    }

    const now = Date.now();
    const cloudProofFields = await createCloudProofFields();
    let supplierMissing = false;
    let staleOverPayment = false;
    let saved = null;

    await db.transaction('rw', db.supplier_transactions, db.suppliers, async () => {
      const supplierRecord = await db.suppliers.get(payload.supplier_id);
      if (!supplierRecord) {
        supplierMissing = true;
        return;
      }

      const existingTx = await db.supplier_transactions.where('supplier_id').equals(payload.supplier_id).toArray();
      const previousBalance = Math.max(getSupplierBalance(existingTx), 0);

      if (payload.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT && amount > previousBalance) {
        staleOverPayment = true;
        return;
      }

      const entry = {
        supplier_id: payload.supplier_id,
        type: payload.type,
        catalog_entry_id: payload.catalog_entry_id || null,
        item_name: payload.item_name || null,
        item_kind: payload.item_kind || null,
        quantity: payload.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? (Number(payload.quantity) || 1) : null,
        amount,
        note: payload.note || null,
        // Product proof photos (base64 data URLs, non-indexed Dexie property).
        ...(payload.type === SUPPLIER_TRANSACTION_TYPES.PAYMENT
          ? { photos: [], photo: null, photo_taken_at: null }
          : buildPhotoFields(normalizePhotos(payload))),
        created_at: now,
        updated_at: now,
        ...buildActorSnapshot(),
        ...cloudProofFields,
      };

      const id = await db.supplier_transactions.add(entry);
      saved = await db.supplier_transactions.get(id);
      await db.suppliers.update(payload.supplier_id, { updated_at: now });
    });

    if (supplierMissing) {
      fireToast('Supplier not found', 2200);
      return false;
    }

    if (staleOverPayment || !saved) {
      fireToast('Payment is more than remaining dubie', 2600);
      return false;
    }

    setSupplierTransactions(prev => [saved, ...prev]);
    setSuppliers(prev => prev.map(item => item.id === payload.supplier_id ? { ...item, updated_at: now } : item));
    await enqueueCloudProofUpsert({
      recordTable: 'supplier_transactions',
      recordId: saved.id,
      recordType: getSupplierCloudProofRecordType(saved),
      record: saved,
    });
    return true;
  };

  const handleUpdateSupplierTransaction = async (transactionId, updates) => {
    if (!isValidSupplierTransactionType(updates.type)) return false;
    const amount = Number(updates.amount) || 0;
    if (amount <= 0) {
      fireToast('Enter a valid amount', 2200);
      return false;
    }

    const now = Date.now();
    let supplierMissing = false;
    let transactionMissing = false;
    let staleOverPayment = false;
    let saved = null;
    let previousSupplierId = null;
    let nextSupplierId = Number(updates.supplier_id) || null;

    await db.transaction('rw', db.supplier_transactions, db.suppliers, async () => {
      const existing = await db.supplier_transactions.get(transactionId);
      if (!existing) {
        transactionMissing = true;
        return;
      }

      previousSupplierId = existing.supplier_id;
      nextSupplierId = nextSupplierId || existing.supplier_id;

      const supplierRecord = await db.suppliers.get(nextSupplierId);
      if (!supplierRecord) {
        supplierMissing = true;
        return;
      }

      const nextEntry = {
        supplier_id: nextSupplierId,
        type: updates.type,
        catalog_entry_id: updates.catalog_entry_id || null,
        item_name: updates.item_name || null,
        item_kind: updates.item_kind || null,
        quantity: updates.type === SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD ? (Number(updates.quantity) || 1) : null,
        amount,
        note: updates.note || null,
        updated_at: now,
      };

      const existingSupplierTx = await db.supplier_transactions.where('supplier_id').equals(previousSupplierId).toArray();
      const previousSupplierNextTx = existingSupplierTx
        .filter(item => item.id !== transactionId)
        .concat(previousSupplierId === nextSupplierId ? [{ ...existing, ...nextEntry, id: transactionId }] : []);

      if (getSupplierBalance(previousSupplierNextTx) < 0) {
        staleOverPayment = true;
        return;
      }

      if (previousSupplierId !== nextSupplierId) {
        const nextSupplierTx = await db.supplier_transactions.where('supplier_id').equals(nextSupplierId).toArray();
        const nextSupplierNextTx = nextSupplierTx.concat({ ...existing, ...nextEntry, id: transactionId });
        if (getSupplierBalance(nextSupplierNextTx) < 0) {
          staleOverPayment = true;
          return;
        }
      }

      await db.supplier_transactions.update(transactionId, nextEntry);
      saved = await db.supplier_transactions.get(transactionId);
      await db.suppliers.update(nextSupplierId, { updated_at: now });
      if (previousSupplierId && previousSupplierId !== nextSupplierId) {
        await db.suppliers.update(previousSupplierId, { updated_at: now });
      }
    });

    if (transactionMissing) {
      fireToast('Supplier transaction not found', 2200);
      return false;
    }

    if (supplierMissing) {
      fireToast('Supplier not found', 2200);
      return false;
    }

    if (staleOverPayment || !saved) {
      fireToast('Payment is more than remaining dubie', 2600);
      return false;
    }

    setSupplierTransactions(prev => prev.map(item => item.id === transactionId ? saved : item));
    const touchedSupplierIds = new Set([previousSupplierId, saved?.supplier_id].filter(Boolean));
    setSuppliers(prev => prev.map(item => touchedSupplierIds.has(item.id) ? { ...item, updated_at: now } : item));
    return saved;
  };

  const handleDeleteSupplierTransaction = async (transactionId) => {
    const now = Date.now();
    let existing = null;
    let transactionMissing = false;
    let staleOverPayment = false;

    await db.transaction('rw', db.supplier_transactions, db.suppliers, async () => {
      existing = await db.supplier_transactions.get(transactionId);
      if (!existing) {
        transactionMissing = true;
        return;
      }

      const supplierTx = await db.supplier_transactions.where('supplier_id').equals(existing.supplier_id).toArray();
      const remainingTx = supplierTx.filter(item => item.id !== transactionId);
      if (getSupplierBalance(remainingTx) < 0) {
        staleOverPayment = true;
        return;
      }

      await db.supplier_transactions.delete(transactionId);
      await db.suppliers.update(existing.supplier_id, { updated_at: now });
    });

    if (transactionMissing) {
      fireToast('Supplier transaction not found', 2200);
      return false;
    }

    if (staleOverPayment) {
      fireToast('Payment is more than remaining dubie', 2600);
      return false;
    }

    setSupplierTransactions(prev => prev.filter(item => item.id !== transactionId));
    if (existing?.supplier_id) {
      setSuppliers(prev => prev.map(item => item.id === existing.supplier_id ? { ...item, updated_at: now } : item));
    }
    return true;
  };

  const handleConfirmCustomerTelegramConnection = async (customer, payload) => {
    if (!customer) return;
    const now = Date.now();
    const nextChatId = payload.telegram_chat_id || customer.telegram_chat_id || null;
    const nextUsername = payload.telegram_username || customer.telegram_username || null;
    await handleUpdateCustomerRecord(customer.id, {
      telegram_username: nextUsername,
      telegram_chat_id: nextChatId,
      telegram_link_token: customer.telegram_link_token || createCustomerTelegramLinkToken(customer.id),
      telegram_linked_at: nextChatId ? (payload.telegram_linked_at || customer.telegram_linked_at || now) : customer.telegram_linked_at || null,
      telegram_link_requested_at: payload.telegram_link_requested_at || customer.telegram_link_requested_at || now,
      telegram_notify_enabled: nextChatId
        ? customer.telegram_notify_enabled
        : Boolean(nextUsername && customer.telegram_notify_enabled),
    });
    if (nextChatId) {
      await syncLinkedCustomerTelegramState({
        ...customer,
        telegram_chat_id: nextChatId,
        telegram_username: nextUsername,
        telegram_linked_at: payload.telegram_linked_at || customer.telegram_linked_at || now,
        telegram_link_requested_at: payload.telegram_link_requested_at || customer.telegram_link_requested_at || now,
      });
    }
    if (payload.showSavedToast !== false) {
      fireToast(t.saved, 1800);
    }
    if (payload.closeSheet !== false) {
      setTelegramConnectCustomerId(null);
    }
  };

  const handleResendCustomerTelegramUpdate = async (customer) => {
    if (!customer?.telegram_link_token) {
      fireToast('Generate a Telegram borrower link first.', 2200);
      return false;
    }
    try {
      await syncLinkedCustomerTelegramState(customer);
      const result = await resendLatestTelegramUpdate({ token: customer.telegram_link_token });
      if (result?.delivered) {
        fireToast('Latest borrower update sent again.', 2200);
        return true;
      }
      fireToast('No borrower update is ready to resend yet.', 2200);
      return false;
    } catch (error) {
      fireToast(error?.message || 'Could not resend the borrower update.', 2600);
      return false;
    }
  };

  // EDIT-mode branch · if payload carries editing_id, update that row instead
  // of inserting a new one. Used by CustomerDetail long-press → Edit.
  const updateCustomerTransactionRecord = async (editingId, draft, originalPayload) => {
    try {
      const existing = await db.customer_transactions.get(editingId);
      if (!existing) {
        fireToast(t.customerNotFound || 'Entry not found', 2200);
        return false;
      }
      // Preserve items[] across edit (non-indexed prop bypasses the draft normalizer)
      const itemsToStore = Array.isArray(originalPayload?.items) && originalPayload.items.length > 0
        ? originalPayload.items
        : null;
      const proofFields = existing.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT
        ? { photos: [], photo: null, photo_taken_at: null }
        : buildPhotoFields(normalizePhotos(originalPayload));
      const updates = {
        type: draft.type,
        amount: draft.amount,
        item_note: draft.item_note,
        catalog_entry_id: draft.catalog_entry_id || null,
        item_kind: draft.item_kind || null,
        due_date: draft.due_date || null,
        items: itemsToStore,
        // Preserve / replace product proof photos on edit
        ...proofFields,
        // Commit C.6: descriptive quantity ("5 sacks of sugar"). null on payment.
        quantity: originalPayload?.quantity != null ? Number(originalPayload.quantity) : null,
        updated_at: Date.now(),
      };
      await db.customer_transactions.update(editingId, updates);
      const updated = await db.customer_transactions.get(editingId);
      setLedgerTransactions(prev => prev.map(t2 => (t2.id === editingId ? updated : t2)));
      fireToast(lang === 'am' ? 'ተስተካክሏል' : 'Entry updated', 1800);
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Edit customer_transaction failed:', err);
      fireToast(lang === 'am' ? 'ማስተካከል አልተሳካም' : 'Could not update entry', 2400);
      return false;
    }
  };

  // DELETE handler · soft-undo via toast for 4 seconds, then permanent.
  const handleDeleteCustomerTransaction = async (tx) => {
    if (!tx?.id) return;
    // Optimistic remove from state
    setLedgerTransactions(prev => prev.filter(t2 => t2.id !== tx.id));
    try {
      await db.customer_transactions.delete(tx.id);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Delete customer_transaction failed:', err);
      // Roll back optimistic remove
      setLedgerTransactions(prev => prev.find(t2 => t2.id === tx.id) ? prev : [tx, ...prev]);
      fireToast(lang === 'am' ? 'ሰርዝ አልተሳካም' : 'Could not delete entry', 2400);
      return;
    }
    // Undo toast — restores the row if user taps Undo within 4 seconds
    const msg = lang === 'am' ? 'ተሰርዟል' : 'Entry deleted';
    fireToast(msg, 4000, async () => {
      try {
        const restored = { ...tx, updated_at: Date.now() };
        // Use put (not add) so the original id is preserved
        await db.customer_transactions.put(restored);
        setLedgerTransactions(prev => insertCustomerTransaction(prev, restored));
        fireToast(t.undone || 'Undone', 1800);
      } catch (err) {
        if (import.meta.env.DEV) console.error('Undo delete customer_transaction failed:', err);
      }
    });
  };

  const handleSaveCustomerTransaction = async (payload) => {
    // EDIT branch — payload carries editing_id
    if (payload?.editing_id) {
      const draftForEdit = normalizeCustomerTransactionDraft(payload);
      if (!draftForEdit) {
        fireToast(t.validAmountRequired, 2200);
        return false;
      }
      return updateCustomerTransactionRecord(payload.editing_id, draftForEdit, payload);
    }

    const draft = normalizeCustomerTransactionDraft(payload);
    if (!draft) {
      fireToast(t.validAmountRequired, 2200);
      return false;
    }

    const customer = customerSummaries.find(c => c.id === draft.customer_id);
    if (!customer) {
      fireToast(t.customerNotFound, 2200);
      return false;
    }

    const { amount } = draft;

    if (draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT && amount > Math.max(customer.balance || 0, 0)) {
      fireToast(t.paymentMoreThanBalance, 2600);
      return false;
    }

    const now = Date.now();
    const isOnlineNow = isBrowserOnline();
    const cloudProofFields = await createCloudProofFields();
    let customerMissing = false;
    let staleOverPayment = false;
    let saved = null;
    let nextBalance = 0;
    let previousBalance = Math.max(customer.balance || 0, 0);
    let referenceCode = null;
    let latestCustomerRecord = null;

    await db.transaction('rw', db.customer_transactions, db.customers, async () => {
      const customerRecord = await db.customers.get(payload.customer_id);
      if (!customerRecord) {
        customerMissing = true;
        return;
      }

      const existingTx = await db.customer_transactions.where('customer_id').equals(payload.customer_id).toArray();
      previousBalance = Math.max(getCustomerBalance(existingTx), 0);

      if (draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT && amount > previousBalance) {
        staleOverPayment = true;
        return;
      }

      const entry = {
        ...draft,
        // Preserve items[] from the original payload (the normalizer strips it)
        items: Array.isArray(payload?.items) && payload.items.length > 0
          ? payload.items
          : null,
        // Preserve product proof photos (base64 data URLs, non-indexed)
        ...(draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT
          ? { photos: [], photo: null, photo_taken_at: null }
          : buildPhotoFields(normalizePhotos(payload))),
        // Commit C.6: descriptive quantity (5 sacks of sugar). Null for payments.
        quantity: payload?.quantity != null ? Number(payload.quantity) : null,
        reference_code: null,
        telegram_delivery_state: null,
        telegram_delivery_attempted_at: null,
        created_at: now,
        updated_at: now,
        ...buildActorSnapshot(),
        ...cloudProofFields,
      };

      const id = await db.customer_transactions.add(entry);
      referenceCode = createCustomerTransactionReference(id, now);
      await db.customer_transactions.update(id, { reference_code: referenceCode });
      saved = await db.customer_transactions.get(id);
      nextBalance = getCustomerBalance([saved, ...existingTx]);
      await db.customers.update(draft.customer_id, { updated_at: now });
      latestCustomerRecord = await db.customers.get(draft.customer_id);
    });

    if (customerMissing) {
      fireToast(t.customerNotFound, 2200);
      return false;
    }

    if (staleOverPayment || !saved) {
      fireToast(t.paymentMoreThanBalance, 2600);
      return false;
    }

    const settledFullBalance = (
      draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT &&
      previousBalance > 0 &&
      nextBalance <= 0
    );
    const deliveryCustomer = latestCustomerRecord
      ? { ...customer, ...latestCustomerRecord, balance: nextBalance }
      : customer;

    setLedgerTransactions(prev => insertCustomerTransaction(prev, saved));
    setLedgerCustomers(prev => prev.map(c => c.id === draft.customer_id ? { ...c, updated_at: now } : c));
    setCustomerTransactionModal(null);
    await enqueueCloudProofUpsert({
      recordTable: 'customer_transactions',
      recordId: saved.id,
      recordType: getCustomerCloudProofRecordType(saved),
      record: saved,
    });
    await enqueueStaffEventSync({
      recordTable: 'customer_transactions',
      record: saved,
      eventType: draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT ? 'customer_payment' : 'customer_credit',
    });
    if (isOnlineNow) processStaffEventQueue({ limit: 3 }).catch(() => {});
    await rememberLastSave({
      type: draft.type,
      label: draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT
        ? `${customer.display_name} ${t.paymentRecordedLabel || 'Payment'}`
        : (draft.item_note || customer.display_name),
      amount,
      created_at: now,
    });
    fireToast(draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT ? (t.paymentSaved || 'Payment recorded âœ“') : t.creditSaved, 2200);

    if (draft.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD) {
      try {
        const fcRow = await db.analytics.get('feature_counts');
        let fc = { sales: 0, expenses: 0, credits: 0 };
        try { fc = fcRow ? JSON.parse(fcRow.value) : fc; } catch { /* keep default */ }
        fc.credits = (fc.credits || 0) + 1;
        await db.analytics.put({ key: 'feature_counts', value: JSON.stringify(fc) });
        setUsageStats(prev => prev ? { ...prev, featureCounts: fc } : prev);
      } catch { /* non-critical */ }
    }

    if (settledFullBalance) {
      try {
        const crRow = await db.analytics.get('credits_repaid');
        const repaidCount = (crRow?.value || 0) + 1;
        await db.analytics.put({ key: 'credits_repaid', value: repaidCount });
        setUsageStats(prev => {
          if (!prev) return prev;
          return { ...prev, creditsRepaid: repaidCount };
        });
      } catch { /* non-critical */ }
    }

    let telegramDeliveryState = 'not_configured';
    let telegramDeliveryError = null;
    let shouldDrainQueuedTelegram = false;
    const message = buildCustomerLedgerTelegramMessage({
      shopName: shopProfile?.name,
      customerName: deliveryCustomer.display_name,
      type: draft.type,
      amount,
      itemNote: draft.item_note,
      previousBalance,
      updatedBalance: nextBalance,
      createdAt: now,
      referenceCode,
    });

    if (deliveryCustomer?.telegram_notify_enabled && deliveryCustomer?.telegram_chat_id && deliveryCustomer?.telegram_link_token) {
      telegramDeliveryState = isOnlineNow ? 'bot_pending' : 'bot_waiting_for_connection';
      telegramDeliveryError = isOnlineNow ? null : 'Telegram update needs internet.';
      try {
        await enqueueTelegramLedgerUpdate({
          recordTable: 'customer_transactions',
          recordId: saved.id,
          payload: {
            customerState: {
              token: deliveryCustomer.telegram_link_token,
              currentBalance: nextBalance,
              updatesEnabled: !!deliveryCustomer.telegram_notify_enabled,
              telegramUsername: deliveryCustomer.telegram_username || null,
              chatId: deliveryCustomer.telegram_chat_id || null,
            },
            ledgerUpdate: {
              token: deliveryCustomer.telegram_link_token,
              currentBalance: nextBalance,
              message,
              reference: referenceCode,
            },
          },
        });
        shouldDrainQueuedTelegram = isOnlineNow;
      } catch (error) {
        telegramDeliveryState = 'bot_failed';
        telegramDeliveryError = error?.message || 'Telegram queue failed';
      }
    } else if (deliveryCustomer?.telegram_notify_enabled && deliveryCustomer?.telegram_username) {
      if (!isOnlineNow) {
        telegramDeliveryState = 'manual_waiting_for_connection';
        telegramDeliveryError = 'Open Telegram when internet returns to send this update.';
      } else {
        const telegramUrl = buildTelegramMessageUrl(deliveryCustomer.telegram_username, message);
        if (telegramUrl) {
          window.open(telegramUrl, '_blank', 'noopener,noreferrer');
          telegramDeliveryState = 'manual_opened';
        } else {
          telegramDeliveryState = 'manual_unavailable';
          telegramDeliveryError = 'Manual Telegram contact is invalid.';
        }
      }
    } else {
      telegramDeliveryState = deliveryCustomer?.telegram_chat_id ? 'bot_linked_updates_off' : 'not_linked';
    }

    if (saved?.id) {
      const deliveryUpdates = {
        reference_code: referenceCode,
        telegram_delivery_state: telegramDeliveryState,
        telegram_delivery_error: telegramDeliveryError,
        telegram_delivery_attempted_at: Date.now(),
      };
      await db.customer_transactions.update(saved.id, deliveryUpdates);
      saved = { ...saved, ...deliveryUpdates };
      setLedgerTransactions(prev => prev.map(entry => entry.id === saved.id ? saved : entry));
    }

    if (shouldDrainQueuedTelegram) {
      refreshQueuedTelegramRecords().catch(() => {});
    }

    if (telegramDeliveryState === 'bot_failed') {
      fireToast(`Dubie saved. ${telegramDeliveryError || 'Telegram send failed.'}`, 2600);
    } else if (telegramDeliveryState === 'bot_waiting_for_connection') {
      fireToast('Dubie saved on this phone. Telegram will send after you reconnect and resend.', 3200);
    } else if (telegramDeliveryState === 'manual_waiting_for_connection') {
      fireToast('Dubie saved on this phone. Open Telegram after internet returns to send the drafted update.', 3200);
    }

    return true;
  };

  const todayDateStr = new Date().toDateString();

  useEffect(() => {
    if (selectedCustomerId && !selectedCustomer) {
      setSelectedCustomerId(null);
    }
  }, [selectedCustomer, selectedCustomerId]);

  useEffect(() => {
    if (customerTransactionModal && !activeCustomerTransactionModal) {
      setCustomerTransactionModal(null);
    }
  }, [activeCustomerTransactionModal, customerTransactionModal]);

  const todayTransactions = useMemo(
    () => transactions.filter(t2 => new Date(t2.created_at).toDateString() === todayDateStr),
    [transactions, todayDateStr]
  );

  const todayLedgerTransactions = useMemo(
    () => ledgerTransactions.filter(entry => new Date(entry.created_at).toDateString() === todayDateStr),
    [ledgerTransactions, todayDateStr]
  );

  const persistedEntryCount = transactions.length + ledgerTransactions.length;
  const persistedTodayCount = todayTransactions.length + todayLedgerTransactions.length;

  const todaySales = useMemo(
    () => todayTransactions.filter(t2 => t2.type === 'sale'),
    [todayTransactions]
  );
  const todayExpenses = useMemo(
    () => todayTransactions.filter(t2 => t2.type === 'expense'),
    [todayTransactions]
  );
  const todaySalesTotal = useMemo(
    () => todaySales.reduce((s, t2) => s + (t2.amount || 0), 0),
    [todaySales]
  );
  const todayExpensesTotal = useMemo(
    () => todayExpenses.reduce((s, t2) => s + (t2.amount || 0), 0),
    [todayExpenses]
  );

  // Yesterday derived state — used by TodaySummary's trend indicator (▲/▼ vs yesterday)
  const yesterdayDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toDateString();
  }, [todayDateStr]);

  const yesterdayTransactions = useMemo(
    () => transactions.filter(t2 => new Date(t2.created_at).toDateString() === yesterdayDateStr),
    [transactions, yesterdayDateStr]
  );

  const yesterdayNet = useMemo(
    () => yesterdayTransactions.reduce((acc, t2) => {
      if (t2.type === 'sale') return acc + (t2.amount || 0);
      if (t2.type === 'expense') return acc - (t2.amount || 0);
      return acc;
    }, 0),
    [yesterdayTransactions]
  );

  const topProducts = useMemo(() => {
    const counts = {};
    todaySales.forEach(t2 => {
      const name = t2.item_name || 'Unknown';
      counts[name] = (counts[name] || 0) + (t2.quantity || 1);
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, qty]) => ({ name, qty }));
  }, [todaySales]);

  const buildShareSummary = () => {
    const profit = todaySalesTotal - todayExpensesTotal;
    const topStr = topProducts.length > 0
      ? topProducts.map((p, i) => `  ${i + 1}. ${p.name} (x${p.qty})`).join('\n')
      : '  —';
    return [
      `📊 ${shopProfile?.name || 'Shop'} — ${t.shareDailyReport}`,
      `📅 ${new Date().toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
      ``,
      `💰 ${t.sales}:    ${fmt(todaySalesTotal)} ${lang === 'am' ? 'ብር' : 'birr'}`,
      `🛒 ${t.spent}: ${fmt(todayExpensesTotal)} ${lang === 'am' ? 'ብር' : 'birr'}`,
      `ðŸ“ˆ ${t.calcProfit}:   ${fmt(profit)} ${lang === 'am' ? 'ብር' : 'birr'}`,
      ``,
      `ðŸ† ${t.shareTopItems}:`,
      topStr,
      ``,
      t.shareSentVia,
    ].join('\n');
  };

  const handleShareReport = () => {
    setShareText(buildShareSummary());
    setShowShareModal(true);
  };

  // Commit R: ReportView builds its own weekly summary text and passes it
  // through here so we reuse the existing ShareModal flow.
  const handleShareCustomReport = (text) => {
    if (!text) return;
    setShareText(text);
    setShowShareModal(true);
  };

  const handleOnboardingComplete = useCallback((profile) => {
    if (profile?.__staff_join) {
      setOnboardingType('staff');
      return;
    }
    const defaults = buildDefaultChannels();
    setShopProfile({
      ...profile,
      id: profile?.id || profile?.shop_id || null,
      shop_id: profile?.shop_id || profile?.id || null,
      telegram: profile?.telegram || '',
      businessType: profile?.businessType || 'retail-shop',
      role: profile?.role || 'owner',
      paymentChannels: profile?.paymentChannels || defaults,
      payments: profile?.payments || deriveLegacyFromChannels(defaults).payments,
    });
    db.settings.put({ key: 'shop_payment_channels', value: JSON.stringify(defaults) })
      .catch(() => { /* non-critical */ });
  }, []);

  const handleStaffJoined = useCallback((identity) => {
    setOnboardingType(null);
    setShopProfile({
      id: identity?.shop_id || null,
      shop_id: identity?.shop_id || null,
      name: identity?.shop_name || 'Gebya',
      phone: identity?.phone_number || '',
      telegram: '',
      businessType: 'retail-shop',
      role: identity?.role || 'staff',
      paymentChannels: buildDefaultChannels(),
      payments: deriveLegacyFromChannels(buildDefaultChannels()).payments,
    });
  }, []);

  const hid = (n) => hidden ? '••••' : fmt(n);

  const getTimeGreeting = () => {
    const h = new Date().getHours();
    if (lang === 'am') {
      if (h < 12) return '👋 áŠ¥áŠ•áŠ³áŠ• á‹°áˆ…áŠ“ áˆ˜áŒ¡ — á‹›áˆ¬áŠ• áˆ½á‹«áŒ¥ á‹­á‰áŒ áˆ©';
      if (h < 17) return '📌 áˆ²áˆ¸áŒ¡ á‹­á‰…á‹± — á‹áˆ­á‹áˆ­ á‰†á‹­á‰¶ áˆ›áˆµá‰°áŠ«áŠ¨áˆ á‹­á‰»áˆ‹áˆ';
      return '🌙 á‹›áˆ¬áŠ• áˆ½á‹«áŒ¥ áŠ á‹­áˆ­áˆ± — áˆáˆ‰ á‹­á‰…á‹±';
    }
    if (h < 12) return '👋 Good morning — start tracking today\'s sales';
    if (h < 17) return '📌 Keep going — record your sales as you sell';
    return '🌙 Don\'t forget today\'s last sales';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg }}>
        <div className="text-center animate-elastic">
          <div className="text-5xl mb-3">ðŸ“’</div>
          <h1 className="text-2xl font-black font-serif" style={{ color: P.header }}>áŒˆá‰ á‹«</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-soft)' }}>{t.loading}</p>
        </div>
      </div>
    );
  }

  if (onboardingType === 'staff') {
    return (
      <StaffJoinScreen
        onJoined={handleStaffJoined}
        onBack={() => setOnboardingType(null)}
      />
    );
  }

  if (!shopProfile || !shopProfile.name) {
    return (
      <OnboardingScreen
        onComplete={handleOnboardingComplete}
      />
    );
  }

  // Tab labels swap with language toggle (single language at a time, not stacked)
  const TAB_LABELS = {
    today:    { en: 'Today',  am: 'የዛሬ' },
    credit:   { en: 'Credit', am: 'ዱቤ' },
    history:  { en: 'Report', am: 'ሪፖርት' },
    settings: { en: 'More',   am: 'ተጨማሪ' },
  };
  // Tab IDs are UNCHANGED — only display labels and icons swap. activeTab logic stays intact.
  const tabs = [
    { id: 'today',    label: TAB_LABELS.today[lang],    icon: BookOpen },
    { id: 'credit',   label: TAB_LABELS.credit[lang],   icon: CreditCard },
    { id: 'history',  label: TAB_LABELS.history[lang],  icon: BarChart3 },
    { id: 'settings', label: TAB_LABELS.settings[lang], icon: MoreHorizontal },
  ];

  const typeEmoji = { sale: '💰', expense: '🛒', credit: '👥' };
  const typeColor = { sale: '#15803d', expense: '#dc2626', credit: '#C4883A' };
  const typeBorderColor = { sale: '#86efac', expense: '#fca5a5', credit: '#fcd34d' };

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto relative" style={{ background: P.bg }}>

      {/* Lightweight header (v4 design): tight, off-white, no dark green bar.
          Sales/Spent chips removed — TodaySummary now owns those. */}
      <header
        className="flex-shrink-0 px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3"
        style={{ background: 'var(--color-bg)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Avatar — taps to More/Settings */}
          <button
            onClick={() => setActiveTab('settings')}
            className="flex-shrink-0 press-scale flex items-center justify-center rounded-full font-bold text-white"
            aria-label="Open profile"
            style={{
              width: '36px',
              height: '36px',
              background: '#6b7280',
              fontSize: '14px',
              letterSpacing: '0.02em',
            }}
          >
            {shopProfile.name.charAt(0).toUpperCase()}
          </button>

          {/* Shop name — date moved to TodaySummary card to avoid duplication */}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm sm:text-base font-bold tracking-tight leading-tight truncate" style={{ color: '#1a1a1a' }}>
              {shopProfile.name}
            </h1>
            <p className="text-[10px] sm:text-xs font-medium mt-0.5 truncate" style={{ color: '#6b7280' }}>
              Recording as {currentActorLabel || 'Owner'} · {String(shopProfile.role || 'owner').replace(/_/g, ' ')}
            </p>
          </div>

          {/* Language toggle (compact pill) */}
          <button
            onClick={toggleLang}
            className="flex items-center flex-shrink-0 press-scale"
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '2px',
            }}
            aria-label={lang === 'en' ? 'Switch to Amharic' : 'Switch to English'}
          >
            <span
              style={{
                background: lang === 'en' ? '#1B4332' : 'transparent',
                color: lang === 'en' ? '#fff' : '#9ca3af',
                fontWeight: lang === 'en' ? 700 : 600,
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                transition: 'all 0.18s',
              }}
            >
              EN
            </span>
            <span
              style={{
                background: lang === 'am' ? '#1B4332' : 'transparent',
                color: lang === 'am' ? '#fff' : '#9ca3af',
                fontWeight: lang === 'am' ? 700 : 600,
                padding: '3px 7px',
                borderRadius: '6px',
                fontSize: '11px',
                transition: 'all 0.18s',
              }}
            >
              አማ
            </span>
          </button>

          {/* Settings gear */}
          <button
            onClick={() => setActiveTab('settings')}
            className="flex-shrink-0 press-scale flex items-center justify-center"
            aria-label="Settings"
            style={{ minWidth: '44px', minHeight: '44px', padding: '8px' }}
          >
            <Settings className="w-5 h-5" style={{ color: '#6b7280' }} />
          </button>
        </div>
        <OfflineStatusStrip
          pwa={pwa}
          pendingTelegramCount={pendingTelegramCount}
          lang={lang}
          onRetryTelegram={handleRetryQueuedTelegram}
          retryingTelegram={retryingTelegram}
        />
        {/* Sales/Spent chips REMOVED — TodaySummary below owns them now */}
      </header>


      {activeTab === 'today' && (
        <div className="px-3 pt-2 pb-1 flex-shrink-0" style={{ background: 'var(--color-bg)' }}>
          {/* Greeting removed per Gate 3 preservation map (item 2.1) — tight header per v4 design */}
          {/* Voice — primary action — hidden per D-027 (Amharic/Oromifa STT quality insufficient). */}
          {VOICE_ENABLED && (
            <>
{/* Voice — primary action */}
          <button
            onClick={() => setVoiceStep('record')}
            className="w-full mb-1 py-4 flex flex-col items-center justify-center font-black text-white text-base transition-all active:scale-95 press-scale"
            style={{ background: '#1a5c3a', border: '2px solid rgba(255,255,255,0.25)', borderRadius: 'var(--radius-lg)', boxShadow: '0 5px 0 #0f3d25' }}
          >
            <span className="text-2xl leading-none mb-0.5">🎤</span>
            <span className="text-base font-black leading-snug">{t.recordByVoice}</span>
            <span className="text-xs opacity-70">{t.recordByVoiceSubLabel}</span>
          </button>
          <p className="text-center text-xs mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {lang === 'am' ? 'á‹­áŠ“áŒˆáˆ©á£ á‰ áŠ‹áˆ‹áˆ áˆ›áˆµá‰°áŠ«áŠ¨áˆ á‹­á‰½áˆ‹áˆ‰á¢' : 'Speak your sale. You can fix it after.'}
          </p>
            </>
          )}
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 pb-36">
        {activeTab === 'today' && (
          <div className="space-y-4">
            <ProfitCard transactions={todayTransactions} yesterdayNet={yesterdayNet} />

            {/* Launch-critical data-loss nudge. Shows when there's real data to
                protect AND (never backed up OR >7 days stale). Dismissable. */}
            {(() => {
              if (backupNudgeDismissed || lastBackupAt === undefined) return null;
              const hasData = (transactions.length + ledgerTransactions.length) >= 5;
              if (!hasData) return null;
              const stale = lastBackupAt === null || (Date.now() - lastBackupAt) > 7 * 86400000;
              if (!stale) return null;
              const neverBackedUp = lastBackupAt === null;
              return (
                <div
                  style={{
                    background: neverBackedUp ? '#fef2f2' : '#fffbeb',
                    border: `1px solid ${neverBackedUp ? '#fecaca' : '#fde68a'}`,
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{neverBackedUp ? '⚠️' : '⏰'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 800, color: neverBackedUp ? '#991b1b' : '#92400e' }}>
                      {neverBackedUp
                        ? (lang === 'am' ? 'የማስታወሻ ደብተርዎን ያስቀምጡ' : 'Back up your notebook')
                        : (lang === 'am' ? 'ደብተርዎን ለማስቀመጥ ጊዜው አልፏል' : 'Backup is overdue')}
                    </p>
                    <p style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: 1, lineHeight: 1.35 }}>
                      {lang === 'am'
                        ? 'የእርስዎ መረጃ የሚገኘው በዚህ ስልክ ላይ ብቻ ነው። ስልክዎ ቢጠፋ መረጃዎ እንዳይጠፋ አሁኑኑ ያስቀምጡት።'
                        : 'Your data lives only on this phone. Back it up so a lost phone doesn’t mean lost records.'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => setActiveTab('settings')}
                      className="press-scale"
                      style={{
                        background: neverBackedUp ? '#dc2626' : '#C4883A',
                        color: '#fff', border: 'none',
                        borderRadius: 8, padding: '6px 12px',
                        fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {lang === 'am' ? 'ያስቀምጡ' : 'Back up'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBackupNudgeDismissed(true)}
                      style={{
                        background: 'transparent', border: 'none',
                        color: '#9ca3af', fontSize: '0.66rem', fontWeight: 600,
                        cursor: 'pointer', padding: '2px',
                      }}
                    >
                      {lang === 'am' ? 'በኋላ' : 'Later'}
                    </button>
                  </div>
                </div>
              );
            })()}

            <Suspense fallback={<PanelFallback label={t.loading} />}>
              <DailySuggestions
                todayTransactions={todayTransactions}
                onAction={(type) => setShowForm(type)}
              />
            </Suspense>

            {/* Today entries — flat rows with ⋮ menu (Gate 3 / B-014 v4 design) */}
            <div>
              <div className="flex items-center justify-between pb-1.5">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 font-sans">
                  {lang === 'am' ? 'ምዝገባዎች' : 'ENTRIES'}
                  <span className="ml-2 text-[11px] font-semibold text-gray-400 tracking-normal normal-case">
                    {todayTransactions.length}
                  </span>
                </h3>
                <button
                  onClick={handleShareReport}
                  className="p-1.5 press-scale"
                  aria-label={lang === 'am' ? 'አጋራ' : 'Share'}
                >
                  <Share2 className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {todayTransactions.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-medium" style={{ color: '#6b7280' }}>
                    {lang === 'am' ? 'ገና ምንም ምዝገባ የለም' : 'No entries yet'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                    {lang === 'am' ? 'ለመጀመር ከላይ ይጫኑ' : 'Tap above to start'}
                  </p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                  {todayTransactions.map(tx => (
                    <TxRow
                      key={tx.id}
                      tx={tx}
                      onTap={() => setEditTarget(tx)}
                      onEdit={() => setEditTarget(tx)}
                      onDelete={() => setDeleteTarget(tx)}
                      t={t}
                      lang={lang}
                      fmt={fmt}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'credit' && (
          <>
            {/* Segmented control: Customers (people who owe me) vs Suppliers (people I owe) */}
            {!selectedCustomer && !selectedSupplier && (
              <div className="flex gap-1.5 p-1 mb-4" style={{ background: '#f5f1ea', borderRadius: 'var(--radius-md)' }}>
                {[
                  { id: 'customers', label: lang === 'am' ? 'ደንበኞች (ያለባቸው)' : 'Customers (owe me)', accent: '#C4883A' },
                  { id: 'suppliers', label: lang === 'am' ? 'አቅራቢዎች (ያለብኝ)' : 'Suppliers (I owe)', accent: '#dc2626' },
                ].map((view) => {
                  const active = creditView === view.id;
                  return (
                    <button
                      key={view.id}
                      type="button"
                      onClick={() => setCreditView(view.id)}
                      className="flex-1 py-2 px-3 text-xs font-bold transition-all min-h-[40px] press-scale"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        background: active ? '#fff' : 'transparent',
                        color: active ? view.accent : '#6b7280',
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                      }}
                    >
                      {view.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Customers view */}
            {creditView === 'customers' && (
              selectedCustomer ? (
                <Suspense fallback={<PanelFallback label={t.loading} />}>
                  <CustomerDetail
                    customer={selectedCustomer}
                    onBack={() => setSelectedCustomerId(null)}
                    onAddCredit={() => setCustomerTransactionModal({
                      mode: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
                      customerId: selectedCustomer.id,
                    })}
                    onRecordPayment={() => setCustomerTransactionModal({
                      mode: CUSTOMER_TRANSACTION_TYPES.PAYMENT,
                      customerId: selectedCustomer.id,
                    })}
                    onMarkFullyPaid={(c) => setCustomerTransactionModal({
                      mode: CUSTOMER_TRANSACTION_TYPES.PAYMENT,
                      customerId: c.id,
                      initialAmount: Number(c.balance || 0),
                    })}
                    onToggleTelegramNotify={() => handleToggleCustomerTelegramNotify(selectedCustomer)}
                    onOpenTelegramConnect={() => setTelegramConnectCustomerId(selectedCustomer.id)}
                    onResendTelegramUpdate={() => handleResendCustomerTelegramUpdate(selectedCustomer)}
                    onRemind={(c) => setReminderTarget(c)}
                    onEditCustomer={(c) => setCustomerEditTarget(c)}
                    onEditCustomerTransaction={(tx) => setCustomerTransactionEditTarget({
                      transaction: tx,
                      customerId: selectedCustomer.id,
                    })}
                    onDeleteCustomerTransaction={handleDeleteCustomerTransaction}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={<PanelFallback label={t.loading} />}>
                  <CustomerList
                    customers={enrichedCustomerSummaries}
                    metrics={creditMetrics}
                    onSelectCustomer={(customer) => setSelectedCustomerId(customer.id)}
                    onAddCustomer={() => setShowCustomerForm(true)}
                    onRemindCustomer={(customer) => setReminderTarget(customer)}
                    onBulkRemind={() => {
                      // Build queue of overdue customers with at least one contact channel
                      const queue = enrichedCustomerSummaries
                        .filter((c) => c.has_overdue
                          && (c.telegram_chat_id || c.telegram_username || c.phone_number))
                        .map((c) => c.id);
                      if (queue.length === 0) return;
                      setBulkReminderQueue(queue.slice(1));
                      setReminderTarget(enrichedCustomerSummaries.find(c => c.id === queue[0]));
                    }}
                  />
                </Suspense>
              )
            )}

            {/* Suppliers view */}
            {creditView === 'suppliers' && (
              selectedSupplier ? (
                <Suspense fallback={<PanelFallback label={t.loading} />}>
                  <SupplierDetail
                    supplier={selectedSupplier}
                    onBack={() => setSelectedSupplierId(null)}
                    onAddPurchase={() => setSupplierTransactionModal({
                      mode: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD,
                      supplierId: selectedSupplier.id,
                    })}
                    onPaySupplier={() => setSupplierTransactionModal({
                      mode: SUPPLIER_TRANSACTION_TYPES.PAYMENT,
                      supplierId: selectedSupplier.id,
                    })}
                    onMarkFullyPaid={(s) => setSupplierTransactionModal({
                      mode: SUPPLIER_TRANSACTION_TYPES.PAYMENT,
                      supplierId: s.id,
                      initialAmount: Number(s.balance || 0),
                    })}
                    onEditSupplier={(s) => setSupplierEditTarget(s)}
                    onEditSupplierTransaction={(tx) => setSupplierTransactionEditTarget({
                      transaction: tx,
                      supplierId: selectedSupplier.id,
                    })}
                    onDeleteSupplierTransaction={handleDeleteSupplierTransaction}
                  />
                </Suspense>
              ) : (
                <Suspense fallback={<PanelFallback label={t.loading} />}>
                  <SupplierList
                    suppliers={supplierSummaries}
                    onSelectSupplier={(s) => setSelectedSupplierId(s.id)}
                    onAddSupplier={() => setShowSupplierForm(true)}
                  />
                </Suspense>
              )
            )}
          </>
        )}

        {activeTab === 'history' && (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <ReportView
              transactions={transactions}
              ledgerTransactions={ledgerTransactions}
              enrichedCustomerSummaries={enrichedCustomerSummaries}
              customerSummaries={customerSummaries}
              supplierSummaries={supplierSummaries}
              customers={ledgerCustomers}
              suppliers={suppliers}
              shopProfile={shopProfile}
              onEdit={setEditTarget}
              onChaseOverdue={() => {
                // Jump to Credit tab — overdue customers are surfaced there
                setActiveTab('credit');
                setCreditView('customers');
              }}
              onShareReport={handleShareCustomReport}
            />
          </Suspense>
        )}

        {activeTab === 'settings' && (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <SettingsPage
              transactions={transactions}
              todayTransactions={todayTransactions}
              customerSummaries={customerSummaries}
              catalogEntries={catalogEntries}
              supplierSummaries={supplierSummaries}
              shopProfile={shopProfile}
              staffMembers={staffMembers}
              activeStaffMemberId={activeStaffMemberId}
              currentActorLabel={currentActorLabel}
              onProfileSave={handleProfileSave}
              onSaveStaffMember={handleSaveStaffMember}
              onUpdateStaffMember={handleUpdateStaffMember}
              onDeactivateStaffMember={handleDeactivateStaffMember}
              onReactivateStaffMember={handleReactivateStaffMember}
              onSetActiveStaffMember={handleSetActiveStaffMember}
              onRefreshStaffMembers={refreshStaffMembers}
              onRotateJoinCode={handleRotateJoinCode}
              onUpdateShopSettings={handleUpdateShopSettings}
              onApproveDevice={handleApproveDevice}
              onRejectDevice={handleRejectDevice}
              enabledProviders={enabledProviders}
              onProvidersChange={setEnabledProviders}
              paymentChannels={shopProfile?.paymentChannels || []}
              onSavePaymentChannels={handleSavePaymentChannels}
              recurringExpenses={recurringExpenses}
              onRecurringChange={setRecurringExpenses}
              usageStats={usageStats}
              onShareToday={handleShareReport}
              onSaveCatalogEntry={handleSaveCatalogEntry}
              onToggleCatalogEntryActive={handleToggleCatalogEntryActive}
              onSaveSupplier={handleSaveSupplier}
              onSaveSupplierTransaction={handleSaveSupplierTransaction}
              onUpdateSupplierTransaction={handleUpdateSupplierTransaction}
              onDeleteSupplierTransaction={handleDeleteSupplierTransaction}
              pwa={pwa}
            />
          </Suspense>
        )}
      </main>

      {/* Action bar (Today only) — fixed above bottom nav for thumb reach */}
      {activeTab === 'today' && !showForm && !showCustomerForm && !customerEditTarget && !customerTransactionModal && !customerTransactionEditTarget && !showSupplierForm && !supplierEditTarget && !supplierTransactionModal && !supplierTransactionEditTarget && (
        <div
          className="fixed left-0 right-0 max-w-md mx-auto z-30 px-3 py-2 border-t"
          style={{ bottom: '60px', background: '#ffffff', borderColor: '#e5e7eb' }}
        >
          <div className="flex gap-1.5 sm:gap-2">
            {[
              { type: 'sale',    label: lang === 'am' ? 'ሽያጭ' : 'Sale',    color: '#16a34a', icon: Plus    },
              { type: 'expense', label: lang === 'am' ? 'ወጪ'  : 'Expense', color: '#dc2626', icon: Minus   },
              { type: 'credit',  label: lang === 'am' ? 'ዱቤ'  : 'Credit',  color: '#2563eb', icon: RotateCw },
            ].map(b => {
              const pressed = pressedBtn === b.type;
              const Icon = b.icon;
              return (
                <button
                  key={b.type}
                  onClick={() => {
                    if (b.type === 'credit') {
                      setActiveTab('credit');
                      // First-time onboarding: auto-open add-customer form only if list is empty.
                      // Otherwise the user almost always wants to add credit to an existing customer.
                      if (!customerSummaries || customerSummaries.length === 0) {
                        setShowCustomerForm(true);
                      }
                      return;
                    }
                    setShowForm(b.type);
                  }}
                  onPointerDown={() => setPressedBtn(b.type)}
                  onPointerUp={() => setPressedBtn(null)}
                  onPointerLeave={() => setPressedBtn(null)}
                  onPointerCancel={() => setPressedBtn(null)}
                  className="flex-1 py-2.5 sm:py-3 min-h-[44px] sm:min-h-[48px] flex items-center justify-center gap-1.5 sm:gap-2 transition-all min-w-0"
                  style={{
                    background: pressed ? `${b.color}15` : '#ffffff',
                    border: `1.5px solid ${b.color}`,
                    borderRadius: 'var(--radius-md)',
                    transform: pressed ? 'scale(0.98)' : 'none',
                  }}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" style={{ color: b.color, strokeWidth: 2.5 }} />
                  <span className="font-bold text-xs sm:text-sm truncate" style={{ color: b.color }}>{b.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 border-t"
        style={{ background: '#ffffff', borderColor: '#e5e7eb' }}>
        <div className="flex">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  // Close any open overlay so the nav click actually navigates
                  setShowForm(null);
                  setShowCustomerForm(false);
                  setShowSupplierForm(false);
                  setCustomerTransactionModal(null);
                  setCustomerTransactionEditTarget(null);
                  setSupplierTransactionModal(null);
                  setReminderTarget(null);
                  setActiveTab(tab.id);
                  setSelectedCustomerId(null);
                  setSelectedSupplierId(null);
                }}
                className="flex-1 flex flex-col items-center gap-1 py-2 min-h-[56px] press-scale"
                style={{ color: isActive ? '#1B4332' : '#9ca3af' }}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[11px]" style={{ fontWeight: isActive ? 700 : 500 }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {showForm && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <TransactionForm
            type={showForm}
            onSave={handleAddTransaction}
            onDone={() => setShowForm(null)}
            actorLabel={currentActorLabel}
            enabledProviders={enabledProviders}
            catalogEntries={activeCatalogEntries}
            recurringExpenses={recurringExpenses}
            onRecurringChange={setRecurringExpenses}
            onSaveCatalogEntry={handleSaveCatalogEntry}
            customQuickAmounts={customQuickAmounts}
            onCustomQuickAmountsChange={handleCustomQuickAmountsChange}
            customers={customerSummaries}
            onAddCustomerInline={handleAddCustomerInline}
            initialPaymentType={(showForm === 'sale' || showForm === 'expense') ? lastPayment[showForm]?.type : undefined}
            initialPaymentProvider={(showForm === 'sale' || showForm === 'expense') ? lastPayment[showForm]?.provider : undefined}
            lastPaymentHistory={(showForm === 'sale' || showForm === 'expense') ? {
              bank:   lastPayment[showForm]?.bankProvider   || '',
              wallet: lastPayment[showForm]?.walletProvider || '',
            } : undefined}
          />
        </Suspense>
      )}

      {showCustomerForm && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <CustomerForm
            onSave={handleAddCustomer}
            onDone={() => setShowCustomerForm(false)}
          />
        </Suspense>
      )}

      {/* Commit C.2: Edit customer flow. Reuses CustomerForm in edit mode. */}
      {customerEditTarget && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <CustomerForm
            existing={customerEditTarget}
            onSave={async (payload) => {
              const ok = await handleAddCustomer({ ...payload, id: customerEditTarget.id });
              if (ok) setCustomerEditTarget(null);
              return ok;
            }}
            onDone={() => setCustomerEditTarget(null)}
          />
        </Suspense>
      )}

      {customerTransactionModal && activeCustomerTransactionModal && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <CustomerTransactionSheet
            customer={activeCustomerTransactionModal}
            mode={customerTransactionModal.mode}
            initialAmount={customerTransactionModal.initialAmount}
            onSave={handleSaveCustomerTransaction}
            actorLabel={currentActorLabel}
            catalogEntries={activeCatalogEntries}
            onDone={() => setCustomerTransactionModal(null)}
          />
        </Suspense>
      )}

      {/* Edit a single customer_transaction row — fired from CustomerDetail long-press */}
      {customerTransactionEditTarget?.transaction && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <CustomerTransactionSheet
            customer={enrichedCustomerSummaries.find(c => c.id === customerTransactionEditTarget.customerId) || null}
            mode={customerTransactionEditTarget.transaction.type}
            editingTransaction={customerTransactionEditTarget.transaction}
            onSave={handleSaveCustomerTransaction}
            actorLabel={currentActorLabel}
            catalogEntries={activeCatalogEntries}
            onDone={() => setCustomerTransactionEditTarget(null)}
          />
        </Suspense>
      )}

      {/* Supplier flows */}
      {showSupplierForm && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <SupplierForm
            onSave={handleSaveSupplier}
            onDone={(saved) => {
              setShowSupplierForm(false);
              if (saved && saved.id) setSelectedSupplierId(saved.id);
            }}
          />
        </Suspense>
      )}

      {/* Commit D: Edit supplier flow — reuses SupplierForm in edit mode. */}
      {supplierEditTarget && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <SupplierForm
            existing={supplierEditTarget}
            onSave={async (payload) => {
              const saved = await handleSaveSupplier({ ...payload, id: supplierEditTarget.id });
              if (saved) setSupplierEditTarget(null);
              return saved;
            }}
            onDone={() => setSupplierEditTarget(null)}
          />
        </Suspense>
      )}

      {supplierTransactionModal && activeSupplierTransactionModal && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <SupplierTransactionSheet
            supplier={activeSupplierTransactionModal}
            mode={supplierTransactionModal.mode}
            initialAmount={supplierTransactionModal.initialAmount}
            onSave={handleSaveSupplierTransaction}
            actorLabel={currentActorLabel}
            onDone={() => setSupplierTransactionModal(null)}
          />
        </Suspense>
      )}

      {/* Commit D: Edit supplier_transaction row — fired from SupplierDetail action sheet. */}
      {supplierTransactionEditTarget?.transaction && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <SupplierTransactionSheet
            supplier={supplierSummaries.find(s => s.id === supplierTransactionEditTarget.supplierId) || null}
            mode={supplierTransactionEditTarget.transaction.type}
            editingTransaction={supplierTransactionEditTarget.transaction}
            onSave={handleSaveSupplierTransaction}
            actorLabel={currentActorLabel}
            onDone={() => setSupplierTransactionEditTarget(null)}
          />
        </Suspense>
      )}

      {telegramConnectCustomer && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <CustomerTelegramConnectSheet
            customer={telegramConnectCustomer}
            shopProfile={shopProfile}
            onSave={(payload) => handleConfirmCustomerTelegramConnection(telegramConnectCustomer, payload)}
            onResendUpdate={() => handleResendCustomerTelegramUpdate(telegramConnectCustomer)}
            onDone={() => setTelegramConnectCustomerId(null)}
          />
        </Suspense>
      )}

      {VOICE_ENABLED && voiceStep === 'record' && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <VoiceRecordScreen
            workspace={voiceWorkspace}
            voiceContext={voiceContext}
            onRepeatSale={handleVoiceRepeatSale}
            onUseItem={handleVoiceUseItemShortcut}
            onUseCustomer={handleVoiceUseCustomerShortcut}
            onTranscript={(transcript, detectedTotal, confidence, draft, provider) => {
              const newItem = { transcript, detectedTotal, draft };
              const updatedItems = [...voiceItems, newItem];
              setVoiceItems(updatedItems);
              setVoiceTranscript(transcript);
              setVoiceDetectedTotal(detectedTotal);
              setVoiceConfidence(confidence ?? null);
              setVoiceProvider(provider ?? null);
              setVoiceDraft(draft ?? null);
              recordVoiceTelemetry({
                action: 'captured',
                transcript,
                provider: provider ?? null,
                draft: draft ?? null,
              });
              setVoiceStep('result');
            }}
            onTypeInstead={() => {
              recordVoiceTelemetry({ action: 'type_instead', transcript: voiceTranscript, provider: voiceProvider, draft: voiceDraft });
              setVoiceStep(null);
              setVoiceItems([]);
              setVoiceConfidence(null);
              setVoiceProvider(null);
              setVoiceDraft(null);
              setShowForm('sale');
            }}
          />
        </Suspense>
      )}

      {VOICE_ENABLED && voiceStep === 'result' && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <VoiceResultScreen
            transcript={voiceTranscript}
            detectedTotal={voiceDetectedTotal}
            items={voiceItems}
            draft={mergedVoiceDraft}
            workspace={voiceWorkspace}
            onRepeatSale={handleVoiceRepeatSale}
            onUseItem={handleVoiceUseItemShortcut}
            onUseCustomer={handleVoiceUseCustomerShortcut}
            onSave={handleVoiceSave}
            onFix={() => {
              recordVoiceTelemetry({ action: 'fix_opened', transcript: voiceTranscript, provider: voiceProvider, draft: mergedVoiceDraft });
              setVoiceStep('fix');
            }}
            onAddAnother={() => setVoiceStep('record')}
            onReRecord={() => {
              recordVoiceTelemetry({ action: 're_recorded', transcript: voiceTranscript, provider: voiceProvider, draft: mergedVoiceDraft });
              setVoiceTranscript('');
              setVoiceDetectedTotal(null);
              setVoiceItems([]);
              setVoiceConfidence(null);
              setVoiceProvider(null);
              setVoiceDraft(null);
              setVoiceStep('record');
            }}
            onTypeInstead={() => {
              recordVoiceTelemetry({ action: 'type_instead', transcript: voiceTranscript, provider: voiceProvider, draft: mergedVoiceDraft });
              setVoiceStep(null);
              setVoiceItems([]);
              setVoiceConfidence(null);
              setVoiceProvider(null);
              setVoiceDraft(null);
              setShowForm('sale');
            }}
          />
        </Suspense>
      )}

      {VOICE_ENABLED && voiceStep === 'fix' && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <VoiceFixScreen
            transcript={voiceTranscript}
            detectedTotal={voiceDetectedTotal}
            items={voiceItems}
            draft={mergedVoiceDraft}
            onSave={(data) => handleVoiceSave({ ...data, wasEdited: true })}
            onCancel={() => setVoiceStep('result')}
            enabledProviders={enabledProviders}
            lastProviderByType={{
              bank: lastPayment.sale?.bankProvider || '',
              wallet: lastPayment.sale?.walletProvider || '',
            }}
          />
        </Suspense>
      )}

      {editTarget && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <EditTransactionSheet
            transaction={editTarget}
            enabledProviders={enabledProviders}
            onUpdate={handleUpdateTransaction}
            onClose={() => setEditTarget(null)}
          />
        </Suspense>
      )}

      {reminderTarget && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <ReminderSheet
            customer={reminderTarget}
            shopName={shopProfile?.name}
            shopProfile={shopProfile}
            onClose={() => setReminderTarget(null)}
            onSent={handleCustomerReminderSent}
          />
        </Suspense>
      )}

      {showShareModal && (
        <ShareModal
          summary={shareText}
          telegram={shopProfile?.telegram}
          onClose={() => setShowShareModal(false)}
          t={t}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6 animate-fade">
          <div className="bg-white p-6 w-full max-w-sm animate-elastic" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="text-3xl text-center mb-3">{typeEmoji[deleteTarget.type]}</div>
            <h3 className="text-lg font-black text-gray-900 text-center mb-1 font-sans">{t.deleteEntry}</h3>
            <p className="text-sm text-gray-500 text-center mb-5" style={{ color: 'var(--color-text-muted)' }}>
              "{deleteTarget.item_name}" Â· {fmt(deleteTarget.amount || 0)} {lang === 'am' ? 'ብር' : 'birr'}
            </p>
            <div className="space-y-2">
              <button onClick={() => handleDeleteTransaction(deleteTarget.id)}
                className="w-full p-4 bg-red-500 text-white font-black min-h-[52px] press-scale"
                style={{ borderRadius: 'var(--radius-md)' }}>
                {t.delete}
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="w-full p-4 font-bold min-h-[52px] press-scale"
                style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text)', borderRadius: 'var(--radius-md)' }}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  );
}

function App() {
  return (
    <LangProvider>
      <ThemeProvider>
        <PrivacyProvider>
          <AppInner />
        </PrivacyProvider>
      </ThemeProvider>
    </LangProvider>
  );
}

export default App;







