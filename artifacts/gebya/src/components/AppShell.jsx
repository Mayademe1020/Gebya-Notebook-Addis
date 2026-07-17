import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import db, { getDeviceToken, getIdentity, setIdentity } from '../db';
import identityApi from '../api/identity';
import { PrivacyProvider, usePrivacy } from '../context/PrivacyContext';
import { LangProvider, useLang } from '../context/LangContext';
import { ThemeProvider } from '../context/ThemeContext';
import OnboardingScreen from './OnboardingScreen';
import StaffJoinScreen from './StaffJoinScreen';
import AppHeader from './AppHeader';
import TodayTab from './TodayTab';
import CreditTab from './CreditTab';
import HistoryTab from './HistoryTab';
import AppActionBar from './AppActionBar';
import AppBottomNav from './AppBottomNav';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import GlobalModals from './GlobalModals';
import SearchSheet from './SearchSheet';
import { ToastContainer, fireToast } from './Toast';
import { buildPhotoFields, normalizePhotos } from '../utils/photoProof';
import { getCurrentEthiopianDate, formatEthiopian } from '../utils/ethiopianCalendar';
import { fmt } from '../utils/numformat';
import { useSyncStore } from '../stores/syncStore';
import { buildCustomerSummaries, getCustomerBalance, insertCustomerTransaction, sortCustomerTransactions } from '../utils/customerLedger';
import { normalizeCustomerDraft, normalizeCustomerTransactionDraft } from '../utils/customerLedgerMutations';
import { CUSTOMER_TRANSACTION_TYPES, isValidCustomerTransactionType } from '../utils/customerTransactionTypes';
import { buildCustomerLedgerTelegramMessage, buildTelegramMessageUrl, createCustomerTelegramLinkToken, createCustomerTransactionReference } from '../utils/customerTelegram';
import { buildSupplierSummaries, getSupplierBalance, isValidSupplierTransactionType, SUPPLIER_TRANSACTION_TYPES } from '../utils/supplierLedger';
import { enrichCustomerSummaries, buildCreditMetrics } from '../utils/customerMetrics';
import { usePwaInstall } from '../hooks/usePwaInstall.js';
import { resendLatestTelegramUpdate, syncTelegramCustomerState } from '../utils/telegramBotClient';
import { countPendingTelegramSync, drainTelegramSyncQueue, drainCloudProofQueue, enqueueTelegramLedgerUpdate } from '../utils/syncQueue';
import { createCloudProofFields, enqueueCloudProofUpsert } from '../utils/cloudProof';
import { enqueueStaffEventSync, processStaffEventQueue } from '../utils/staffEventSync';
import { normalizeStaffDraft, resolveActorSnapshot, getActorDisplayLabel } from '../utils/staffMembers';
import { computeAndStoreTrustScores } from '../utils/trustScore';
import { getCurrentEntitlements } from '../utils/entitlements';
import {
  buildDefaultChannels,
  migrateLegacyToChannels,
  deriveLegacyFromChannels,
  normalizeChannelsForSave,
} from '../utils/paymentChannels';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useNotificationsStore } from '../stores/notificationsStore';
import { useAppStore } from '../stores/appStore';
import { useShopStore } from '../stores/shopStore';
import { useAuthStore } from '../stores/authStore';
import { initSyncEngine, destroySyncEngine } from '../utils/syncEngine';
import { requestOtp, verifyOtp } from '../utils/authClient';
import { setAuthToken } from '../utils/syncEngine';

const DEFAULT_PROVIDERS = {
  banks: [],
  wallets: [],
};

function AuthRequiredPrompt({ lang, onClose }) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('phone');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const t = lang === 'am' ? {
    title: 'እባክዎ ይግቡ',
    subtitle: 'መረጃዎን ለማቀነስ የስልክ ቁጥርዎን ያስገቡ',
    phoneLabel: 'ስልክ ቁጥር',
    continue: 'ቀጥል',
    otpLabel: 'የተላከውን ኮድ ያስገቡ',
    verify: 'ያረጋግጡ',
    resend: 'ኮድ እንደገና ይላኩ',
    back: 'ተመለስ',
    skip: 'ዝጋ',
    invalidPhone: 'ትክክለኛ ስልክ ቁጥር ያስገቡ',
    otpSent: 'ኮድ ተላክ!',
    success: 'በተሳካ ሁኔታ ገብተዋል',
    error: 'ችግር ተፈጥሯል',
  } : {
    title: 'Sign in',
    subtitle: 'Enter your phone number to restore cloud sync',
    phoneLabel: 'Phone number',
    continue: 'Continue',
    otpLabel: 'Enter the code we sent',
    verify: 'Verify',
    resend: 'Resend code',
    back: 'Back',
    skip: 'Dismiss',
    invalidPhone: 'Enter a valid phone number',
    otpSent: 'Code sent!',
    success: 'Signed in successfully',
    error: 'Something went wrong',
  };

  async function handleRequestOtp() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 9 || (digits[0] !== '7' && digits[0] !== '9')) {
      setError(t.invalidPhone);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await requestOtp(`+251${digits}`);
      setStep('otp');
      fireToast(t.otpSent, 2000);
    } catch (err) { setError(err.message || t.error); }
    finally { setLoading(false); }
  }

  async function handleVerify() {
    const digits = phone.replace(/\D/g, '');
    setError(null);
    setLoading(true);
    try {
      const { token } = await verifyOtp(`+251${digits}`, otp);
      await setAuthToken(token);
      fireToast(t.success, 2000);
      onClose();
    } catch (err) { setError(err.message || t.error); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-5">
          <h2 className="text-lg font-bold text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>

        {error && (
          <div className="mb-3 rounded-xl px-3 py-2 text-xs font-medium" style={{ background: '#fef2f2', color: '#991b1b' }}>
            {error}
          </div>
        )}

        {step === 'phone' && (
          <div className="space-y-3">
            <div className="flex gap-0">
              <div className="flex items-center justify-center px-3 py-3 rounded-l-xl border-2 border-r-0 text-sm font-bold" style={{ background: '#f5f0e8', borderColor: '#e8e2d8', color: '#1B4332', minWidth: '64px' }}>
                +251
              </div>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 9)); setError(null); }}
                placeholder="9XX XXX XXX"
                maxLength={9}
                className="flex-1 px-4 py-3 border-2 rounded-r-xl text-sm focus:outline-none"
                style={{ borderColor: error ? '#fca5a5' : '#e8e2d8' }}
                autoFocus
              />
            </div>
            <button
              onClick={handleRequestOtp}
              disabled={loading || phone.length !== 9}
              className="w-full py-3 rounded-xl font-bold text-sm min-h-[48px]"
              style={{ background: loading ? '#e5e7eb' : '#1B4332', color: loading ? '#9ca3af' : '#fff' }}
            >
              {loading ? '...' : t.continue}
            </button>
            <button onClick={onClose} className="w-full py-2.5 text-xs font-bold text-gray-400">{t.skip}</button>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              maxLength={6}
              className="w-full px-4 py-3 border-2 rounded-xl text-sm font-bold tracking-widest text-center focus:outline-none"
              style={{ borderColor: '#e8e2d8' }}
              autoFocus
            />
            <button
              onClick={handleVerify}
              disabled={loading || otp.length !== 6}
              className="w-full py-3 rounded-xl font-bold text-sm min-h-[48px]"
              style={{ background: loading ? '#e5e7eb' : '#1B4332', color: loading ? '#9ca3af' : '#fff' }}
            >
              {loading ? '...' : t.verify}
            </button>
            <div className="flex gap-2">
              <button onClick={() => { setStep('phone'); setOtp(''); setError(null); }} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{ background: '#f5f5f5' }}>{t.back}</button>
              <button onClick={handleRequestOtp} disabled={loading} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{ background: '#FAF8F5', border: '1px solid #e8e2d8' }}>{t.resend}</button>
            </div>
            <button onClick={onClose} className="w-full py-2.5 text-xs font-bold text-gray-400">{t.skip}</button>
          </div>
        )}
      </div>
    </div>
  );
}

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

const importSupplierList = () => import('./SupplierList');
const importCustomerList = () => import('./CustomerList');
const importReportView = () => import('./ReportView');
const importSettingsPage = () => import('./SettingsPage');
const importTransactionDetailSheet = () => import('./TransactionDetailSheet');

const SettingsPage = lazyWithRetry(importSettingsPage, 'SettingsPage');
const TransactionDetailSheet = lazyWithRetry(importTransactionDetailSheet, 'TransactionDetailSheet');

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
  conflictWarning = null,
  conflictDetails = [],
}) {
  const { t } = useLang();
  let tone = null;
  let label = '';
  let detail = '';
  let action = null;

  if (!pwa?.isOnline) {
    tone = 'offline';
    label = t.offlineLabel;
    detail = t.offlineDetail;
  } else if (pendingTelegramCount > 0) {
    tone = 'waiting';
    label = t.telegramWaiting;
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
          {retryingTelegram ? '...' : t.telegramRetry}
        </button>
      );
    }
  } else if (pwa?.updateReady) {
    tone = 'update';
    label = t.updateReady;
    detail = t.updateTapRefresh;
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
        {t.updateButton}
      </button>
    );
  } else if (pwa?.offlineReady) {
    tone = 'ready';
    label = t.offlineReadyStatus;
    detail = t.offlineReadyDetail;
  }

  if (conflictWarning) {
    const detailLines = (conflictDetails || []).slice(0, 3).map((d) => {
      const changes = (d.changedFields || []).slice(0, 3).map((field) => {
        const oldVal = d.localVersion?.[field];
        const newVal = d.serverVersion?.[field];
        const oldStr = oldVal == null ? '(empty)' : String(oldVal).substring(0, 30);
        const newStr = newVal == null ? '(empty)' : String(newVal).substring(0, 30);
        return `${field}: ${oldStr} â†’ ${newStr}`;
      });
      const more = (d.changedFields || []).length > 3 ? ` +${(d.changedFields || []).length - 3} more` : '';
      return `${d.table} #${d.recordId}: ${changes.join(', ')}${more}`;
    });
    return (
      <div
        role="alert"
        className="mt-2 flex flex-col gap-1"
        style={{ minHeight: 36, padding: '7px 9px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: 12, fontWeight: 800 }}
      >
        <span className="truncate">
          âš ï¸ {t.syncConflict} Â· {conflictWarning}
        </span>
        {detailLines.length > 0 && (
          <span style={{ fontWeight: 600, fontSize: 11, opacity: 0.85 }}>
            {detailLines.join(' Â· ')}
            {(conflictDetails || []).length > 3 && ` +${(conflictDetails || []).length - 3} more`}
          </span>
        )}
      </div>
    );
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
        {detail ? <span style={{ fontWeight: 700 }}> Â· {detail}</span> : null}
      </span>
      {action}
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
            Ã°Å¸â€™Â¾
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
          {t.trustReopenHint || 'Close and reopen anytime â€” your records stay here.'}
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

export default function AppShell() {
  const { hidden } = usePrivacy();
  const { lang, toggleLang, t } = useLang();
  const pwa = usePwaInstall();
  const pushNotifications = usePushNotifications();
  const unreadNotifCount = useNotificationsStore(s => s.unreadCount);
  const fetchUnreadNotifCount = useNotificationsStore(s => s.fetchUnreadCount);
  const syncConflictWarning = useSyncStore(s => s.conflictWarning);
  const syncConflictDetails = useSyncStore(s => s.conflictDetails);
  // â”€â”€â”€ Data state (local â€” not in stores) â”€â”€â”€
  const [transactions, setTransactions] = useState([]);
  const [ledgerCustomers, setLedgerCustomers] = useState([]);
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierTransactions, setSupplierTransactions] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [activeStaffMemberId, setActiveStaffMemberId] = useState(null);
  const [onboardingType, setOnboardingType] = useState(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [enabledProviders, setEnabledProviders] = useState(DEFAULT_PROVIDERS);
  const [showItemizedSale, setShowItemizedSale] = useState(false);
  const [reminderDefaultChannel, setReminderDefaultChannel] = useState(null);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [showSearchSheet, setShowSearchSheet] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [selectedSupplierTransaction, setSelectedSupplierTransaction] = useState(null);
  const [lastPayment, setLastPayment] = useState({
    sale:    { type: 'cash', provider: '', bankProvider: '', walletProvider: '' },
    expense: { type: 'cash', provider: '', bankProvider: '', walletProvider: '' },
  });
  const [usageStats, setUsageStats] = useState(null);
  const [planTier, setPlanTier] = useState('free');
  const [entitlements, setEntitlements] = useState({ max_staff: 3, max_transactions_per_month: 500, advanced_reports: false, multi_shop: false, priority_support: false });

  // â”€â”€â”€ App state (useAppStore) â”€â”€â”€
  const loading = useAppStore(s => s.loading);
  const setLoading = useAppStore(s => s.setLoading);
  const activeTab = useAppStore(s => s.activeTab);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const lastBackupAt = useAppStore(s => s.lastBackupAt);
  const setLastBackupAt = useAppStore(s => s.setLastBackupAt);
  const backupNudgeDismissed = useAppStore(s => s.backupNudgeDismissed);
  const setBackupNudgeDismissed = useAppStore(s => s.setBackupNudgeDismissed);
  const showForm = useAppStore(s => s.showForm);
  const setShowForm = useAppStore(s => s.setShowForm);
  const selectedCustomerId = useAppStore(s => s.selectedCustomerId);
  const setSelectedCustomerId = useAppStore(s => s.setSelectedCustomerId);
  const setTelegramConnectCustomerId = useAppStore(s => s.setTelegramConnectCustomerId);
  const showCustomerForm = useAppStore(s => s.showCustomerForm);
  const setShowCustomerForm = useAppStore(s => s.setShowCustomerForm);
  const customerTransactionModal = useAppStore(s => s.customerTransactionModal);
  const setCustomerTransactionModal = useAppStore(s => s.setCustomerTransactionModal);
  const reminderTarget = useAppStore(s => s.reminderTarget);
  const setReminderTarget = useAppStore(s => s.setReminderTarget);
  const bulkReminderQueue = useAppStore(s => s.bulkReminderQueue);
  const setBulkReminderQueue = useAppStore(s => s.setBulkReminderQueue);
  const customerTransactionEditTarget = useAppStore(s => s.customerTransactionEditTarget);
  const setCustomerTransactionEditTarget = useAppStore(s => s.setCustomerTransactionEditTarget);
  const customerEditTarget = useAppStore(s => s.customerEditTarget);
  const setCustomerEditTarget = useAppStore(s => s.setCustomerEditTarget);
  const creditView = useAppStore(s => s.creditView);
  const setCreditView = useAppStore(s => s.setCreditView);
  const selectedSupplierId = useAppStore(s => s.selectedSupplierId);
  const setSelectedSupplierId = useAppStore(s => s.setSelectedSupplierId);
  const showSupplierForm = useAppStore(s => s.showSupplierForm);
  const setShowSupplierForm = useAppStore(s => s.setShowSupplierForm);
  const supplierTransactionModal = useAppStore(s => s.supplierTransactionModal);
  const setSupplierTransactionModal = useAppStore(s => s.setSupplierTransactionModal);
  const supplierEditTarget = useAppStore(s => s.supplierEditTarget);
  const setSupplierEditTarget = useAppStore(s => s.setSupplierEditTarget);
  const supplierTransactionEditTarget = useAppStore(s => s.supplierTransactionEditTarget);
  const setSupplierTransactionEditTarget = useAppStore(s => s.setSupplierTransactionEditTarget);
  const deleteTarget = useAppStore(s => s.deleteTarget);
  const setDeleteTarget = useAppStore(s => s.setDeleteTarget);
  const editTarget = useAppStore(s => s.editTarget);
  const setEditTarget = useAppStore(s => s.setEditTarget);
  const showShareModal = useAppStore(s => s.showShareModal);
  const setShowShareModal = useAppStore(s => s.setShowShareModal);
  const shareText = useAppStore(s => s.shareText);
  const setShareText = useAppStore(s => s.setShareText);
  const pressedBtn = useAppStore(s => s.pressedBtn);
  const setPressedBtn = useAppStore(s => s.setPressedBtn);
  const pendingTelegramCount = useAppStore(s => s.pendingTelegramCount);
  const setPendingTelegramCount = useAppStore(s => s.setPendingTelegramCount);
  const retryingTelegram = useAppStore(s => s.retryingTelegram);
  const setRetryingTelegram = useAppStore(s => s.setRetryingTelegram);

  // â”€â”€â”€ Shop state (useShopStore) â”€â”€â”€
  const shopProfile = useShopStore(s => s.shopProfile);
  const setShopProfile = useShopStore(s => s.setShopProfile);
  const recurringExpenses = useShopStore(s => s.recurringExpenses);
  const setRecurringExpenses = useShopStore(s => s.setRecurringExpenses);
  const customQuickAmounts = useShopStore(s => s.customQuickAmounts);
  const setCustomQuickAmounts = useShopStore(s => s.setCustomQuickAmounts);
  const lastSavedSnapshot = useShopStore(s => s.lastSavedSnapshot);
  const setLastSavedSnapshot = useShopStore(s => s.setLastSavedSnapshot);

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

  const loadData = useCallback(async () => {
    try {
      const [
        txns, customerRows, customerTxRows, catalogRows, supplierRows, supplierTxRows, staffRows,
        nameRow, phoneRow, businessTypeRow, epRow, reRow, customQuickAmountsRow, telegramRow,
        snapshotRow, activeStaffRow,
        // Payment receiving accounts â€” used by Pay-it-now /pay URLs (legacy, C.1)
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
        } catch { /* non-critical â€” next save will retry */ }
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
      try {
        const { tier, entitlements: ents } = await getCurrentEntitlements();
        setPlanTier(tier);
        setEntitlements(ents);
      } catch { /* non-critical */ }
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
        // Legacy compat shim â€” derived, never written to from outside App.jsx
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
      // Validate stored JWT against server on boot (non-blocking)
      useAuthStore.getState().init().catch(() => { /* non-critical — sync will handle auth failures */ });
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (loading) return undefined;
    let destroyed = false;
    runAfterFirstPaint(async () => {
      if (destroyed) return;
      try {
        await initSyncEngine(() => { setShowAuthPrompt(true); });
      } catch (err) {
        if (import.meta.env.DEV) console.error('Sync engine init failed:', err);
      }
    });
    return () => {
      destroyed = true;
      destroySyncEngine();
    };
  }, [loading]);

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
    const handleNavigate = (e) => {
      if (e.detail.tab) setActiveTab(e.detail.tab);
      if (e.detail.customerId) setSelectedCustomerId(e.detail.customerId);
    };
    const handleOpenForm = (e) => {
      if (e.detail.type) setShowForm(e.detail.type);
    };
    window.addEventListener('gebya:navigate', handleNavigate);
    window.addEventListener('gebya:open-form', handleOpenForm);
    return () => {
      window.removeEventListener('gebya:sync-queue-changed', handleQueueChanged);
      window.removeEventListener('online', handleQueueChanged);
      window.removeEventListener('gebya:navigate', handleNavigate);
      window.removeEventListener('gebya:open-form', handleOpenForm);
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

  // Poll unread notification count every 30s when app is visible
  useEffect(() => {
    fetchUnreadNotifCount();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchUnreadNotifCount();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadNotifCount]);

  const rememberSaleItemsInCatalog = async (sale) => {
    const items = Array.isArray(sale?.items) ? sale.items : [];
    if (!items.length) return;

    try {
      const now = Date.now();
      const existingEntries = await db.catalog_entries.toArray();
      const updatedIds = new Set();

      for (const line of items) {
        const name = String(line?.name || '').trim();
        if (!name) continue;
        const code = String(line?.code || '').trim();
        const normalizedName = name.toLowerCase();
        const normalizedCode = code.toLowerCase();
        const existing = existingEntries.find(entry => {
          const entryName = String(entry?.name || '').trim().toLowerCase();
          const entryCode = String(entry?.code || entry?.sku || entry?.item_code || '').trim().toLowerCase();
          return entryName === normalizedName || (normalizedCode && entryCode === normalizedCode);
        });
        const usageCount = Math.max(1, Number(line?.qty || 1));
        const price = Number(line?.unit_price || line?.line_total || line?.amount || 0);

        if (existing?.id) {
          const patch = {
            use_count: Number(existing.use_count || 0) + usageCount,
            last_used_at: now,
            updated_at: now,
          };
          if (price > 0) patch.last_price = price;
          if (price > 0) patch.last_unit_price = price;
          if (existing.default_price == null && price > 0) patch.default_price = price;
          if (!existing.code && code) patch.code = code;
          await db.catalog_entries.update(existing.id, patch);
          updatedIds.add(existing.id);
        } else {
          const id = await db.catalog_entries.add({
            name,
            code: code || null,
            kind: line?.item_kind === 'service' ? 'service' : 'item',
            default_price: price > 0 ? price : null,
            last_price: price > 0 ? price : null,
            use_count: usageCount,
            active: true,
            created_at: now,
            updated_at: now,
            last_used_at: now,
          });
          updatedIds.add(id);
        }
      }

      if (updatedIds.size > 0) {
        const nextEntries = await db.catalog_entries.toArray();
        setCatalogEntries(nextEntries);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Sale item learning failed:', err);
    }
  };

  const handleAddTransaction = async (transaction) => {
    try {
      // Enforce max_transactions_per_month entitlement
      const { entitlements } = await getCurrentEntitlements();
      if (entitlements.max_transactions_per_month !== Infinity) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        const monthCount = await db.transactions
          .where('created_at')
          .between(monthStart, monthEnd, true, true)
          .count();
        if (monthCount >= entitlements.max_transactions_per_month) {
          fireToast({
            type: 'error',
            message: lang === 'am'
              ? `ouis በዚህ ወር ${entitlements.max_transactions_per_month} ግብይቶች በቂ ናቸው። Plus ወደ አድሶ ያዝ።`
              : `You've reached the ${entitlements.max_transactions_per_month} transaction limit this month. Upgrade to Plus to continue.`,
          });
          return;
        }
      }

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
        if (isOnlineNow) drainCloudProofQueue({ limit: 3 }).catch(() => {});
      }
      if (saved?.type === 'sale') {
        await rememberSaleItemsInCatalog(saved);
        await enqueueStaffEventSync({
          recordTable: 'transactions',
          record: saved,
          eventType: 'sale',
        });
        if (isOnlineNow) processStaffEventQueue({ limit: 3 }).catch(() => {});
        // Recompute trust scores after sales (non-blocking)
        if (isOnlineNow) computeAndStoreTrustScores(shopProfile?.shop_id || shopProfile?.id).catch(() => {});
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

      // Paid Â· Partial Â· Pay Later â€” when a sale has a credit portion, also
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
            // Settlement breadcrumb Â· so CustomerDetail can show a "from sale"
            // or "pay-later" badge on this credit row. Non-indexed, no schema
            // migration needed.
            settlement_mode: transaction.settlement_mode || null,
            // Multi-item breakdown Â· copy the items[] array onto the customer
            // credit so the ðŸ§º expander shows up in CustomerDetail history.
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
      // Non-destructive confirmation only. Corrections are made by tapping the
      // transaction row (Today/History) â†’ edit/delete, which unwinds related
      // records (customer credit, Telegram, cloud-proof) via the proper paths.
      fireToast(safeToastMsg, isOnlineNow ? 4000 : 4500);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to save:', err);
      fireToast(t.saveFailed || 'Could not save. Please try again.', 3500);
      throw err;
    }
  };

  const handleUpdateTransaction = async (id, updates) => {
    try {
      const { actor_role, actor_name_snapshot } = buildActorSnapshot();
      await db.transactions.update(id, {
        ...updates,
        was_edited: true,
        edited_at: Date.now(),
        edited_by_name: actor_name_snapshot,
        edited_by_role: actor_role,
        updated_at: Date.now(),
      });
      const updated = await db.transactions.get(id);
      setTransactions(prev => prev.map(t2 => t2.id === id ? updated : t2));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to update:', err);
      fireToast(t.updateFailed || 'Could not update. Please try again.', 3500);
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
    setShopProfile({
      ...(shopProfile || {}),
      paymentChannels: normalized,
      payments: deriveLegacyFromChannels(normalized).payments,
    });
    const derived = deriveLegacyFromChannels(normalized);
    setEnabledProviders(derived.enabledProviders || DEFAULT_PROVIDERS);

    try {
      // Canonical
      await db.settings.put({ key: 'shop_payment_channels', value: JSON.stringify(normalized) });
      // Legacy compat â€” derived
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
    // The profile form no longer owns telebirr/CBE/Awash fields â€” those
    // live in the unified Payment Channels section (which has its own
    // save handler). We preserve shopProfile.paymentChannels here so
    // the profile-form save doesn't blank them out.
    setShopProfile({
      ...(shopProfile || {}),
      name,
      phone: phone || '',
      telegram: telegram || '',
      businessType: businessType || 'retail-shop',
      paymentChannels: shopProfile?.paymentChannels,
      payments: shopProfile?.payments,
    });
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
      const current = useShopStore.getState().shopProfile;
      setShopProfile(current ? { ...current, join_code: result.join_code, join_url: result.join_url } : current);
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

  // Enriched customer summaries â€” adds on_time_count, on_time_rate, has_overdue,
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
  // no toast â€” the caller drives the UX.
  const handleAddCustomerInline = async (payload) => {
    const draft = normalizeCustomerDraft(payload);
    if (!draft) return null;
    try {
      const now = Date.now();
      const linkToken = createCustomerTelegramLinkToken();
      const id = await db.customers.add({
        ...draft,
        // Customer photo Â· base64, non-indexed, no schema migration needed
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
      // Edit branch â€” payload.id present means update existing row
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
        fireToast(t.toastCustomerUpdated, 1800);
        return true;
      }
      const linkToken = createCustomerTelegramLinkToken();
      const id = await db.customers.add({
        ...draft,
        // Customer photo Â· base64, non-indexed
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
      // non-critical â€” keep optimistic UI
    }
    setLedgerCustomers(prev => prev.map(c => (
      c.id === customerId ? { ...c, last_reminded_at: stamp } : c
    )));
    // Bulk-reminder queue: advance to next overdue customer automatically.
    if (Array.isArray(bulkReminderQueue) && bulkReminderQueue.length > 0) {
      const [nextId, ...rest] = bulkReminderQueue;
      const nextCustomer = ledgerCustomers.find(c => c.id === nextId);
      if (nextCustomer) {
        // Defer slightly so the current ReminderSheet closes cleanly before
        // the next one opens.
        setTimeout(() => setReminderTarget(nextCustomer), 120);
      }
      setBulkReminderQueue(rest);
    }
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
    // Commit D: EDIT branch â€” payload carries editing_id (mirror of
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
          was_edited: true,
          edited_at: now,
          ...(() => {
            const s = buildActorSnapshot();
            return { edited_by_name: s.actor_name_snapshot, edited_by_role: s.actor_role };
          })(),
          updated_at: now,
        };
        await db.supplier_transactions.update(payload.editing_id, nextEntry);
        updated = await db.supplier_transactions.get(payload.editing_id);
        await db.suppliers.update(existing.supplier_id, { updated_at: now });
      });
      if (!updated) return false;
      setSupplierTransactions(prev => prev.map(tx => tx.id === updated.id ? updated : tx));
      fireToast(t.toastEntryUpdated, 1800);
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
        due_date: payload.due_date || null,
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
    if (isOnlineNow) drainCloudProofQueue({ limit: 3 }).catch(() => {});
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
        due_date: updates.due_date || null,
        was_edited: true,
        edited_at: now,
        ...(() => {
          const s = buildActorSnapshot();
          return { edited_by_name: s.actor_name_snapshot, edited_by_role: s.actor_role };
        })(),
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

  // EDIT-mode branch Â· if payload carries editing_id, update that row instead
  // of inserting a new one. Used by CustomerDetail long-press â†’ Edit.
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
      const { actor_role, actor_name_snapshot } = buildActorSnapshot();
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
        was_edited: true,
        edited_at: Date.now(),
        edited_by_name: actor_name_snapshot,
        edited_by_role: actor_role,
        updated_at: Date.now(),
      };
      await db.customer_transactions.update(editingId, updates);
      const updated = await db.customer_transactions.get(editingId);
      setLedgerTransactions(prev => prev.map(t2 => (t2.id === editingId ? updated : t2)));
      fireToast(t.toastEntryUpdated, 1800);
      return true;
    } catch {
      fireToast(t.toastEntryUpdateFailed, 2400);
      return false;
    }
  };

  // DELETE handler Â· insert reversal entry instead of hard delete for audit trail integrity.
  const handleDeleteCustomerTransaction = async (tx) => {
    if (!tx?.id) return;
    const reversalAmount = Math.abs(Number(tx.amount) || 0);
    if (reversalAmount <= 0) return;
    const reversalEntry = {
      customer_id: tx.customer_id,
      type: 'reversal',
      amount: reversalAmount,
      item_note: tx.item_note ? `Reversal of: ${tx.item_note}` : 'Reversal',
      due_date: null,
      reversal_of: tx.id,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    // Optimistic: add reversal to state, remove original from view
    setLedgerTransactions(prev => {
      const without = prev.filter(t2 => t2.id !== tx.id);
      return [reversalEntry, ...without];
    });
    try {
      await db.customer_transactions.add(reversalEntry);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Reversal entry failed:', err);
      // Roll back optimistic update
      setLedgerTransactions(prev => prev.find(t2 => t2.id === tx.id) ? prev : [tx, ...prev]);
      fireToast(t.toastReverseFailed, 2400);
      return;
    }
    const msg = t.toastEntryReversed;
    fireToast(msg, 4000, async () => {
      try {
        // Undo: remove the reversal, restore the original
        const reversals = await db.customer_transactions.where('reversal_of').equals(tx.id).toArray();
        for (const r of reversals) {
          await db.customer_transactions.delete(r.id);
        }
        const restored = { ...tx, updated_at: Date.now() };
        await db.customer_transactions.put(restored);
        setLedgerTransactions(prev => insertCustomerTransaction(prev.filter(t2 => !reversals.some(r => r.id === t2.id)), restored));
        fireToast(t.undone || 'Undone', 1800);
      } catch (err) {
        if (import.meta.env.DEV) console.error('Undo delete customer_transaction failed:', err);
      }
    });
  };

  const handleSaveCustomerTransaction = async (payload) => {
    // EDIT branch â€” payload carries editing_id
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
    if (isOnlineNow) drainCloudProofQueue({ limit: 3 }).catch(() => {});
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
    fireToast(draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT ? (t.paymentSaved || 'Payment recorded Ã¢Å“â€œ') : t.creditSaved, 2200);

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

    // Recompute trust scores after credit changes (non-blocking)
    if (isOnlineNow) {
      computeAndStoreTrustScores(shopProfile?.shop_id || shopProfile?.id).catch(() => {});
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

  // Yesterday derived state â€” used by TodaySummary's trend indicator (â–²/â–¼ vs yesterday)
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
      : '  â€”';
    return [
      `ðŸ“Š ${shopProfile?.name || 'Shop'} â€” ${t.shareDailyReport}`,
      `ðŸ“… ${new Date().toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
      ``,
      `ðŸ’° ${t.sales}:    ${fmt(todaySalesTotal)} ${t.birr}`,
      `ðŸ›’ ${t.spent}: ${fmt(todayExpensesTotal)} ${t.birr}`,
      `Ã°Å¸â€œË† ${t.calcProfit}:   ${fmt(profit)} ${t.birr}`,
      ``,
      `Ã°Å¸Ââ€  ${t.shareTopItems}:`,
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

  const hid = (n) => hidden ? 'â€¢â€¢â€¢â€¢' : fmt(n);

  const getTimeGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t.greetingMorning;
    if (h < 17) return t.greetingAfternoon;
    return t.greetingEvening;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg }}>
        <div className="text-center animate-elastic">
          <div className="text-5xl mb-3">Ã°Å¸â€œâ€™</div>
          <h1 className="text-2xl font-black font-serif" style={{ color: P.header }}>Ã¡Å’Ë†Ã¡â€° Ã¡â€¹Â«</h1>
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

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto relative" style={{ background: P.bg }}>

      {/* Auth required overlay — shown when sync detects expired/invalid token */}
      {showAuthPrompt && (
        <AuthRequiredPrompt
          lang={lang}
          onClose={() => setShowAuthPrompt(false)}
        />
      )}

      <AppHeader
        shopProfile={shopProfile}
        currentActorLabel={currentActorLabel}
        pwa={pwa}
        unreadNotifCount={unreadNotifCount}
        conflictWarning={syncConflictWarning}
        conflictDetails={syncConflictDetails}
        onOpenNotifications={() => setShowNotificationPanel(true)}
        onRetryTelegram={handleRetryQueuedTelegram}
      />

      <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 pb-36">
        {activeTab === 'today' && (
          <TodayTab
            transactions={transactions}
            todayTransactions={todayTransactions}
            yesterdayNet={yesterdayNet}
            ledgerTransactions={ledgerTransactions}
            lastSavedSnapshot={lastSavedSnapshot}
            lastBackupAt={lastBackupAt}
            onShareReport={handleShareReport}
          />
        )}

        {activeTab === 'credit' && (
          <CreditTab
            selectedCustomer={selectedCustomer}
            selectedSupplier={selectedSupplier}
            shopProfile={shopProfile}
            enrichedCustomerSummaries={enrichedCustomerSummaries}
            creditMetrics={creditMetrics}
            supplierSummaries={supplierSummaries}
            customerTransactions={ledgerTransactions}
            onToggleTelegramNotify={handleToggleCustomerTelegramNotify}
            onResendTelegramUpdate={handleResendCustomerTelegramUpdate}
            onSelectTransaction={setSelectedTransaction}
            onSelectSupplierTransaction={setSelectedSupplierTransaction}
            onSetReminderDefaultChannel={setReminderDefaultChannel}
          />
        )}

        {/* â•â•â• Transaction Detail Sheet (customer) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {selectedTransaction && (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <TransactionDetailSheet
              transaction={selectedTransaction}
              type="customer"
              lang={lang}
              onClose={() => setSelectedTransaction(null)}
              onEdit={(tx) => {
                setSelectedTransaction(null);
                setCustomerTransactionEditTarget({
                  transaction: tx,
                  customerId: selectedCustomer?.id,
                });
              }}
              onDelete={(tx) => {
                setSelectedTransaction(null);
                handleDeleteCustomerTransaction(tx);
              }}
            />
          </Suspense>
        )}

        {/* â•â•â• Transaction Detail Sheet (supplier) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {selectedSupplierTransaction && (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <TransactionDetailSheet
              transaction={selectedSupplierTransaction}
              type="supplier"
              lang={lang}
              onClose={() => setSelectedSupplierTransaction(null)}
              onEdit={(tx) => {
                setSelectedSupplierTransaction(null);
                setSupplierTransactionEditTarget({
                  transaction: tx,
                  supplierId: selectedSupplier?.id,
                });
              }}
              onDelete={(tx) => {
                setSelectedSupplierTransaction(null);
                handleDeleteSupplierTransaction(tx.id);
              }}
            />
          </Suspense>
        )}

        {activeTab === 'history' && (
          <HistoryTab
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
              setActiveTab('credit');
              setCreditView('customers');
            }}
            onShareReport={handleShareCustomReport}
            catalogEntries={activeCatalogEntries}
          />
        )}

        {activeTab === 'settings' && (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <SettingsPage
              shopId={shopProfile?.shop_id || shopProfile?.id}
              transactions={transactions}
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
              onApproveDevice={handleApproveDevice}
              onRejectDevice={handleRejectDevice}
              paymentChannels={shopProfile?.paymentChannels || []}
              onSavePaymentChannels={handleSavePaymentChannels}
              recurringExpenses={recurringExpenses}
              onRecurringChange={setRecurringExpenses}
              onSaveCatalogEntry={handleSaveCatalogEntry}
              onToggleCatalogEntryActive={handleToggleCatalogEntryActive}
              pwa={pwa}
              planTier={planTier}
              entitlements={entitlements}
              staffCount={(staffMembers || []).filter(m => m.active !== false).length}
              transactionCount={transactions.length}
            />
          </Suspense>
        )}
      </main>

      {!showForm && !showCustomerForm && !showItemizedSale && !customerEditTarget && !customerTransactionModal && !customerTransactionEditTarget && !showSupplierForm && !supplierEditTarget && !supplierTransactionModal && !supplierTransactionEditTarget && (
        <AppActionBar
          activeTab={activeTab}
          selectedCustomer={selectedCustomer}
          selectedSupplier={selectedSupplier}
          creditView={creditView}
          customerSummaries={customerSummaries}
          onCreditTap={() => {
            setActiveTab('credit');
            if (!customerSummaries || customerSummaries.length === 0) {
              setShowCustomerForm(true);
            }
          }}
          onItemizedSaleTap={() => setShowItemizedSale(true)}
          onSimpleSaleTap={() => setShowForm('sale')}
          onExpenseTap={() => setShowForm('expense')}
          onAddCustomer={() => setShowCustomerForm(true)}
          onAddSupplier={() => setShowSupplierForm(true)}
          onAddCredit={() => setCustomerTransactionModal({
            mode: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
            customerId: selectedCustomer?.id,
          })}
          onRecordPayment={() => setCustomerTransactionModal({
            mode: CUSTOMER_TRANSACTION_TYPES.PAYMENT,
            customerId: selectedCustomer?.id,
          })}
          pressedBtn={pressedBtn}
          onPointerDown={(type) => setPressedBtn(type)}
          onPointerUp={() => setPressedBtn(null)}
          onPointerLeave={() => setPressedBtn(null)}
          onPointerCancel={() => setPressedBtn(null)}
        />
      )}

      <AppBottomNav
        activeTab={activeTab}
        onTabChange={(tabId) => {
          if (tabId === 'search') {
            setShowSearchSheet(true);
            return;
          }
          setShowForm(null);
          setShowItemizedSale(false);
          setShowCustomerForm(false);
          setShowSupplierForm(false);
          setCustomerTransactionModal(null);
          setCustomerTransactionEditTarget(null);
          setSupplierTransactionModal(null);
          setReminderTarget(null);
          setActiveTab(tabId);
          setSelectedCustomerId(null);
          setSelectedSupplierId(null);
        }}
        creditMetrics={creditMetrics}
        unreadNotifCount={unreadNotifCount}
      />

      <GlobalModals
        enrichedCustomerSummaries={enrichedCustomerSummaries}
        customerSummaries={customerSummaries}
        supplierSummaries={supplierSummaries}
        activeCatalogEntries={activeCatalogEntries}
        recurringExpenses={recurringExpenses}
        setRecurringExpenses={setRecurringExpenses}
        currentActorLabel={currentActorLabel}
        enabledProviders={enabledProviders}
        lastPayment={lastPayment}
        todaySales={todaySales}
        reminderDefaultChannel={reminderDefaultChannel}
        setReminderDefaultChannel={setReminderDefaultChannel}
        setSelectedSupplierId={setSelectedSupplierId}
        showItemizedSale={showItemizedSale}
        setShowItemizedSale={setShowItemizedSale}
        showNotificationPanel={showNotificationPanel}
        setShowNotificationPanel={setShowNotificationPanel}
        handleAddTransaction={handleAddTransaction}
        handleSaveCustomerTransaction={handleSaveCustomerTransaction}
        handleAddCustomer={handleAddCustomer}
        handleSaveSupplier={handleSaveSupplier}
        handleSaveSupplierTransaction={handleSaveSupplierTransaction}
        handleConfirmCustomerTelegramConnection={handleConfirmCustomerTelegramConnection}
        handleResendCustomerTelegramUpdate={handleResendCustomerTelegramUpdate}
        handleUpdateTransaction={handleUpdateTransaction}
        handleCustomerReminderSent={handleCustomerReminderSent}
        handleSaveCatalogEntry={handleSaveCatalogEntry}
        handleAddCustomerInline={handleAddCustomerInline}
      />


      <DeleteConfirmDialog
        deleteTarget={deleteTarget}
        onConfirm={(id) => handleDeleteTransaction(id)}
        onCancel={() => setDeleteTarget(null)}
      />

      {showSearchSheet && (
        <SearchSheet
          transactions={transactions}
          ledgerTransactions={ledgerTransactions}
          customers={ledgerCustomers}
          catalogEntries={activeCatalogEntries}
          lang={lang}
          onClose={() => setShowSearchSheet(false)}
        />
      )}

      <ToastContainer />
    </div>
  );
}

