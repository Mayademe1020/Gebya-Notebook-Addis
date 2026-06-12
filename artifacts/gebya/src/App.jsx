import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, Users, Calendar, Settings, Trash2, Pencil, Share2, X } from 'lucide-react';
import db from './db';
import { PrivacyProvider, usePrivacy } from './context/PrivacyContext';
import { LangProvider, useLang } from './context/LangContext';
import { ThemeProvider } from './context/ThemeContext';
import ProfitCard from './components/ProfitCard';
import OnboardingScreen from './components/OnboardingScreen';
import { ToastContainer, fireToast } from './components/Toast';
import { DEFAULT_PROVIDERS } from './components/PaymentTypeChips';
import { getCurrentEthiopianDate, formatEthiopian } from './utils/ethiopianCalendar';
import { fmt } from './utils/numformat';
import { checkAndAwardBadges } from './utils/badges';
import { buildCustomerSummaries, getCustomerBalance, insertCustomerTransaction, sortCustomerTransactions } from './utils/customerLedger';
import { normalizeCustomerDraft, normalizeCustomerTransactionDraft } from './utils/customerLedgerMutations';
import { CUSTOMER_TRANSACTION_TYPES, isValidCustomerTransactionType } from './utils/customerTransactionTypes';
import { buildCustomerLedgerTelegramMessage, buildTelegramMessageUrl, createCustomerTelegramLinkToken, createCustomerTransactionReference } from './utils/customerTelegram';
import { buildSupplierSummaries, getSupplierBalance, isValidSupplierTransactionType, SUPPLIER_TRANSACTION_TYPES } from './utils/supplierLedger';
import { usePwaInstall } from './hooks/usePwaInstall.js';
import { resendLatestTelegramUpdate, sendTelegramLedgerUpdate, syncTelegramCustomerState } from './utils/telegramBotClient';
import { normalizeStaffDraft, resolveActorSnapshot, getActorDisplayLabel } from './utils/staffMembers';

const TransactionForm = lazy(() => import('./components/TransactionForm'));
const CustomerList = lazy(() => import('./components/CustomerList'));
const EditTransactionSheet = lazy(() => import('./components/EditTransactionSheet'));
const CustomerDetail = lazy(() => import('./components/CustomerDetail'));
const CustomerForm = lazy(() => import('./components/CustomerForm'));
const CustomerTransactionSheet = lazy(() => import('./components/CustomerTransactionSheet'));
const CustomerTelegramConnectSheet = lazy(() => import('./components/CustomerTelegramConnectSheet'));
const HistoryView = lazy(() => import('./components/HistoryView'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const DailySuggestions = lazy(() => import('./components/DailySuggestions'));
const VoiceRecordScreen = lazy(() => import('./components/VoiceRecordScreen'));
const VoiceResultScreen = lazy(() => import('./components/VoiceResultScreen'));
const VoiceFixScreen = lazy(() => import('./components/VoiceFixScreen'));

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

function buildSavedOnDeviceMessage(message, isOnline) {
  const baseMessage = String(message || 'Saved').trim() || 'Saved';
  return isOnline ? baseMessage : (baseMessage + ' - saved on this phone');
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

const EMPTY_VOICE_WORKSPACE = Object.freeze({
  recentSales: [],
  commonItems: [],
  recentCustomers: [],
  itemPriceMemory: {},
  customerItemPatterns: {},
  lastSavedSnapshot: null,
});

function sortStaffMembersForDisplay(items = []) {
  return [...items].sort((a, b) => {
    if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
    return String(a.display_name || '').localeCompare(String(b.display_name || ''));
  });
}

function buildVoiceWorkspaceSnapshot(transactions = [], lastSavedSnapshot = null) {
  if (!transactions.length) {
    return { ...EMPTY_VOICE_WORKSPACE, lastSavedSnapshot };
  }

  const saleTransactions = [];
  for (const tx of transactions) {
    if (tx.type === 'sale') saleTransactions.push(tx);
  }

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

  for (const tx of saleTransactions) {
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
    if (!customerName) continue;

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
}

function buildTodaySnapshot(transactions = [], ledgerTransactions = [], todayDateStr) {
  const todayTransactions = [];
  const todayLedgerTransactions = [];
  const todaySales = [];
  const todayExpenses = [];
  const topProductCounts = {};
  let todaySalesTotal = 0;
  let todayExpensesTotal = 0;

  for (const tx of transactions) {
    if (new Date(tx.created_at).toDateString() !== todayDateStr) continue;
    todayTransactions.push(tx);
    if (tx.type === 'sale') {
      todaySales.push(tx);
      todaySalesTotal += tx.amount || 0;
      const name = tx.item_name || 'Unknown';
      topProductCounts[name] = (topProductCounts[name] || 0) + (tx.quantity || 1);
    } else if (tx.type === 'expense') {
      todayExpenses.push(tx);
      todayExpensesTotal += tx.amount || 0;
    }
  }

  for (const entry of ledgerTransactions) {
    if (new Date(entry.created_at).toDateString() === todayDateStr) {
      todayLedgerTransactions.push(entry);
    }
  }

  const topProducts = Object.entries(topProductCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, qty]) => ({ name, qty }));

  return {
    todayTransactions,
    todayLedgerTransactions,
    todaySales,
    todayExpenses,
    todaySalesTotal,
    todayExpensesTotal,
    topProducts,
  };
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
  const [showForm, setShowForm] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [telegramConnectCustomerId, setTelegramConnectCustomerId] = useState(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [customerTransactionModal, setCustomerTransactionModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [shopProfile, setShopProfile] = useState(null);
  const [enabledProviders, setEnabledProviders] = useState(DEFAULT_PROVIDERS);
  const [recurringExpenses, setRecurringExpenses] = useState([]);
  const [lastPayment, setLastPayment] = useState({
    sale:    { type: 'cash', provider: '', bankProvider: '', walletProvider: '' },
    expense: { type: 'cash', provider: '', bankProvider: '', walletProvider: '' },
  });
  const [usageStats, setUsageStats] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareText, setShareText] = useState('');
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [bestDayTotal, setBestDayTotal] = useState(0);
  const [pressedBtn, setPressedBtn] = useState(null);
  const [voiceStep, setVoiceStep] = useState(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceDetectedTotal, setVoiceDetectedTotal] = useState(null);
  const [voiceItems, setVoiceItems] = useState([]);
  const [voiceConfidence, setVoiceConfidence] = useState(null);
  const [voiceProvider, setVoiceProvider] = useState(null);
  const [voiceDraft, setVoiceDraft] = useState(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(null);
  const [deferredDataLoaded, setDeferredDataLoaded] = useState(false);

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

  const loadCoreData = useCallback(async () => {
    try {
      const [txns, customerRows, customerTxRows, nameRow, phoneRow, businessTypeRow, epRow, reRow, telegramRow, snapshotRow, activeStaffRow] = await Promise.all([
        db.transactions.toArray(),
        db.customers.toArray(),
        db.customer_transactions.toArray(),
        db.settings.get('shop_name'),
        db.settings.get('shop_phone'),
        db.settings.get('shop_business_type'),
        db.settings.get('enabled_payment_methods'),
        db.settings.get('recurring_expenses'),
        db.settings.get('shop_telegram'),
        db.settings.get('last_saved_snapshot'),
        db.settings.get('active_staff_member_id'),
      ]);
      txns.sort((a, b) => b.created_at - a.created_at);
      setTransactions(txns);
      setLedgerCustomers(customerRows);
      setLedgerTransactions(sortCustomerTransactions(customerTxRows));
      setShopProfile({
        name: nameRow?.value || null,
        phone: phoneRow?.value || '',
        telegram: telegramRow?.value || '',
        businessType: businessTypeRow?.value || 'retail-shop',
      });
      try { setEnabledProviders(epRow ? JSON.parse(epRow.value) : DEFAULT_PROVIDERS); } catch { setEnabledProviders(DEFAULT_PROVIDERS); }
      try { setRecurringExpenses(reRow ? JSON.parse(reRow.value) : []); } catch { setRecurringExpenses([]); }
      setActiveStaffMemberId(activeStaffRow?.value ?? null);
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

  const loadDeferredData = useCallback(async () => {
    try {
      const [catalogRows, supplierRows, supplierTxRows, staffRows] = await Promise.all([
        db.catalog_entries?.toArray?.() || [],
        db.suppliers?.toArray?.() || [],
        db.supplier_transactions?.toArray?.() || [],
        db.staff_members?.toArray?.() || [],
      ]);

      setCatalogEntries(catalogRows || []);
      setSuppliers(supplierRows || []);
      setSupplierTransactions(supplierTxRows || []);

      const sortedStaffMembers = sortStaffMembersForDisplay(staffRows || []);
      setStaffMembers(sortedStaffMembers);

      if (activeStaffMemberId != null) {
        const hasActiveStaff = sortedStaffMembers.some((member) => String(member.id) === String(activeStaffMemberId) && member.active !== false);
        if (!hasActiveStaff) {
          setActiveStaffMemberId(null);
          try {
            await db.settings.put({ key: 'active_staff_member_id', value: null });
          } catch { /* non-critical */ }
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load deferred data:', err);
    } finally {
      setDeferredDataLoaded(true);
    }
  }, [activeStaffMemberId]);

  useEffect(() => { loadCoreData(); }, [loadCoreData]);

  useEffect(() => {
    if (loading || deferredDataLoaded) return undefined;

    let cancelled = false;
    let timeoutId = null;
    let idleId = null;
    const run = async () => {
      if (cancelled) return;
      await loadDeferredData();
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(() => { void run(); }, { timeout: 800 });
    } else {
      timeoutId = window.setTimeout(() => { void run(); }, 120);
    }

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      if (idleId != null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [deferredDataLoaded, loadDeferredData, loading]);

  const trackSession = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const [scRow, ladRow, sdRow, lsdRow, daRow, fcRow, fudRow, bdtRow, crRow] = await Promise.all([
        db.analytics.get('session_count'),
        db.analytics.get('last_active_date'),
        db.analytics.get('streak_days'),
        db.analytics.get('longest_streak'),
        db.analytics.get('days_active'),
        db.analytics.get('feature_counts'),
        db.analytics.get('first_used_date'),
        db.analytics.get('best_day_total'),
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
      const bdt = bdtRow?.value || 0;
      const creditsRepaid = crRow?.value || 0;

      setBestDayTotal(bdt);

      await Promise.all([
        db.analytics.put({ key: 'session_count',   value: sessionCount }),
        db.analytics.put({ key: 'last_active_date', value: todayStr }),
        db.analytics.put({ key: 'streak_days',      value: streak }),
        db.analytics.put({ key: 'longest_streak',   value: longestStreak }),
        db.analytics.put({ key: 'days_active',      value: JSON.stringify(daysActive) }),
        db.analytics.put({ key: 'feature_counts',   value: JSON.stringify(featureCounts) }),
        db.analytics.put({ key: 'first_used_date',  value: firstUsed }),
      ]);

      const stats = { sessionCount, streak, longestStreak, daysActive, featureCounts, firstUsed, bestDayTotal: bdt, creditsRepaid };
      setUsageStats(stats);

      const badges = await checkAndAwardBadges(stats, lang);
      setEarnedBadges(badges);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Analytics tracking failed:', err);
    }
  }, [lang]);

  useEffect(() => { trackSession(); }, [trackSession]);

  const checkBestDay = useCallback(async (todayTotal) => {
    try {
      const bdtRow = await db.analytics.get('best_day_total');
      const prevBest = bdtRow?.value || 0;
      const bdFiredRow = await db.analytics.get('best_day_fired_date');
      const todayStr = new Date().toISOString().split('T')[0];

      if (todayTotal > prevBest && bdFiredRow?.value !== todayStr) {
        await db.analytics.put({ key: 'best_day_total', value: todayTotal });
        await db.analytics.put({ key: 'best_day_fired_date', value: todayStr });
        setBestDayTotal(todayTotal);
        fireToast(`${t.newBestDay} ${fmt(todayTotal)} ${t.birr}`, 3000);
        setUsageStats(prev => {
          if (!prev) return prev;
          const updated = { ...prev, bestDayTotal: todayTotal };
          checkAndAwardBadges(updated, lang).then(setEarnedBadges);
          return updated;
        });
      }
    } catch { /* non-critical */ }
  }, [t, lang]);

  const handleAddTransaction = async (transaction) => {
    try {
      const isOnlineNow = isBrowserOnline();
      const now = new Date(transaction.created_at);
      const newTxn = {
        ...transaction,
        ethiopian_date: formatEthiopian(now),
        customer_name: null,
        ...buildActorSnapshot(),
      };

      const id = await db.transactions.add(newTxn);
      const saved = await db.transactions.get(id);
      await rememberLastSave({
        type: transaction.type,
        label: saved?.item_name || transaction.item_name || null,
        amount: saved?.amount || transaction.amount || 0,
        created_at: saved?.created_at || transaction.created_at,
      });

      setTransactions(prev => {
        const updated = [saved, ...prev];
        const todayStr = new Date().toDateString();
        const todayTotal = updated
          .filter(t2 => new Date(t2.created_at).toDateString() === todayStr && t2.type === 'sale')
          .reduce((s, t2) => s + (t2.amount || 0), 0);
        checkBestDay(todayTotal);
        return updated;
      });

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
            const updated = { ...prev, featureCounts: fc };
            checkAndAwardBadges(updated, lang).then(setEarnedBadges);
            return updated;
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

  const handleProfileSave = async (name, phone, telegram, businessType = 'retail-shop') => {
    await db.settings.put({ key: 'shop_name', value: name });
    await db.settings.put({ key: 'shop_phone', value: phone || '' });
    await db.settings.put({ key: 'shop_telegram', value: telegram || '' });
    await db.settings.put({ key: 'shop_business_type', value: businessType || 'retail-shop' });
    setShopProfile({ name, phone: phone || '', telegram: telegram || '', businessType: businessType || 'retail-shop' });
  };

  const handleSaveStaffMember = async (payload) => {
    const normalized = normalizeStaffDraft(payload);
    if (!normalized) return false;
    const id = await db.staff_members.add(normalized);
    const saved = await db.staff_members.get(id);
    setStaffMembers(prev => sortStaffMembersForDisplay([...prev, saved]));
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
    setStaffMembers(prev => sortStaffMembersForDisplay(
      prev.map(item => item.id === member.id ? updatedMember : item)
    ));
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
    const now = Date.now();
    await db.staff_members.update(member.id, { active: false, updated_at: now, deactivated_at: now });
    setStaffMembers(prev => sortStaffMembersForDisplay(
      prev.map(item => item.id === member.id ? { ...item, active: false, updated_at: now, deactivated_at: now } : item)
    ));
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
    setStaffMembers(prev => sortStaffMembersForDisplay(
      prev.map(item => item.id === member.id ? { ...item, active: true, updated_at: now, deactivated_at: null } : item)
    ));
    return true;
  };

  const customerSummaries = useMemo(
    () => buildCustomerSummaries(ledgerCustomers, ledgerTransactions),
    [ledgerCustomers, ledgerTransactions]
  );

  const customerSummaryById = useMemo(
    () => new Map(customerSummaries.map((customer) => [customer.id, customer])),
    [customerSummaries]
  );

  const selectedCustomer = useMemo(
    () => customerSummaryById.get(selectedCustomerId) || null,
    [customerSummaryById, selectedCustomerId]
  );

  const activeCustomerTransactionModal = useMemo(() => {
    if (!customerTransactionModal?.customerId) return null;
    return customerSummaryById.get(customerTransactionModal.customerId) || null;
  }, [customerSummaryById, customerTransactionModal]);

  const activeCatalogEntries = useMemo(
    () => catalogEntries.filter(entry => entry.active !== false).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [catalogEntries]
  );

  const supplierSummaries = useMemo(
    () => buildSupplierSummaries(suppliers, supplierTransactions),
    [suppliers, supplierTransactions]
  );

  const telegramConnectCustomer = useMemo(
    () => customerSummaryById.get(telegramConnectCustomerId) || null,
    [customerSummaryById, telegramConnectCustomerId]
  );

  const mergedVoiceDraft = useMemo(
    () => mergeVoiceDrafts(voiceItems, voiceDraft),
    [voiceDraft, voiceItems]
  );

  const shouldPrepareVoiceWorkspace = activeTab === 'today' && (
    voiceStep !== null ||
    voiceItems.length > 0 ||
    voiceDraft !== null ||
    voiceTranscript.trim().length > 0
  );

  const voiceWorkspace = useMemo(() => {
    if (!shouldPrepareVoiceWorkspace) {
      return { ...EMPTY_VOICE_WORKSPACE, lastSavedSnapshot };
    }
    return buildVoiceWorkspaceSnapshot(transactions, lastSavedSnapshot);
  }, [lastSavedSnapshot, shouldPrepareVoiceWorkspace, transactions]);

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

  const handleAddCustomer = async (payload) => {
    const draft = normalizeCustomerDraft(payload);
    if (!draft) return false;

    try {
      const now = Date.now();
      const linkToken = createCustomerTelegramLinkToken();
      const id = await db.customers.add({
        ...draft,
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
      setActiveTab('merro');
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
      active: payload.active !== false,
      created_at: payload.created_at || now,
      updated_at: now,
    };

    if (!entry.display_name) return null;

    if (payload.id) {
      await db.suppliers.update(payload.id, entry);
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
        created_at: now,
        updated_at: now,
        ...buildActorSnapshot(),
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

  const handleSaveCustomerTransaction = async (payload) => {
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
        reference_code: null,
        telegram_delivery_state: null,
        telegram_delivery_attempted_at: null,
        created_at: now,
        updated_at: now,
        ...buildActorSnapshot(),
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
          const updated = { ...prev, creditsRepaid: repaidCount };
          checkAndAwardBadges(updated, lang).then(setEarnedBadges);
          return updated;
        });
      } catch { /* non-critical */ }
    }

    let telegramDeliveryState = 'not_configured';
    let telegramDeliveryError = null;
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

    if (deliveryCustomer?.telegram_chat_id && isOnlineNow) {
      await syncLinkedCustomerTelegramState(deliveryCustomer, nextBalance);
    }

    if (deliveryCustomer?.telegram_notify_enabled && deliveryCustomer?.telegram_chat_id && deliveryCustomer?.telegram_link_token) {
      if (!isOnlineNow) {
        telegramDeliveryState = 'bot_waiting_for_connection';
        telegramDeliveryError = 'Telegram update needs internet.';
      } else {
        try {
          const result = await sendTelegramLedgerUpdate({
            token: deliveryCustomer.telegram_link_token,
            currentBalance: nextBalance,
            message,
            reference: referenceCode,
          });
          telegramDeliveryState = result?.delivered ? 'bot_sent' : 'bot_pending';
        } catch (error) {
          telegramDeliveryState = 'bot_failed';
          telegramDeliveryError = error?.message || 'Telegram send failed';
        }
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

  const todaySummary = useMemo(
    () => buildTodaySnapshot(transactions, ledgerTransactions, todayDateStr),
    [ledgerTransactions, todayDateStr, transactions]
  );

  const {
    todayTransactions,
    todayLedgerTransactions,
    todaySales,
    todayExpenses,
    todaySalesTotal,
    todayExpensesTotal,
    topProducts,
  } = todaySummary;

  const persistedEntryCount = transactions.length + ledgerTransactions.length;
  const persistedTodayCount = todayTransactions.length + todayLedgerTransactions.length;

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
      `ðŸ“ˆ ${t.calcProfit}:   ${fmt(profit)} ${t.birr}`,
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

  const hid = (n) => hidden ? 'â€¢â€¢â€¢â€¢' : fmt(n);

  const getTimeGreeting = () => {
    const h = new Date().getHours();
    if (lang === 'am') {
      if (h < 12) return 'ðŸ‘‹ áŠ¥áŠ•áŠ³áŠ• á‹°áˆ…áŠ“ áˆ˜áŒ¡ â€” á‹›áˆ¬áŠ• áˆ½á‹«áŒ¥ á‹­á‰áŒ áˆ©';
      if (h < 17) return 'ðŸ“Œ áˆ²áˆ¸áŒ¡ á‹­á‰…á‹± â€” á‹áˆ­á‹áˆ­ á‰†á‹­á‰¶ áˆ›áˆµá‰°áŠ«áŠ¨áˆ á‹­á‰»áˆ‹áˆ';
      return 'ðŸŒ™ á‹›áˆ¬áŠ• áˆ½á‹«áŒ¥ áŠ á‹­áˆ­áˆ± â€” áˆáˆ‰ á‹­á‰…á‹±';
    }
    if (h < 12) return 'ðŸ‘‹ Good morning â€” start tracking today\'s sales';
    if (h < 17) return 'ðŸ“Œ Keep going â€” record your sales as you sell';
    return 'ðŸŒ™ Don\'t forget today\'s last sales';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg }}>
        <div className="text-center animate-elastic">
          <div className="text-5xl mb-3">ðŸ“’</div>
          <h1 className="text-2xl font-black font-serif" style={{ color: P.header }}>áŒˆá‰ á‹«</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-soft)' }}>{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!shopProfile || !shopProfile.name) {
    return (
      <OnboardingScreen
        onComplete={(profile) => setShopProfile({ ...profile, telegram: '', businessType: profile.businessType || 'retail-shop' })}
      />
    );
  }

  const tabs = [
    { id: 'today',    label: t.todayLabel, sub: t.today,   icon: BookOpen },
    { id: 'merro',    label: t.creditLabel, sub: t.credit,  icon: Users },
    { id: 'history',  label: t.report,                       icon: Calendar },
    { id: 'settings', label: t.settings,                     icon: Settings },
  ];

  const typeEmoji = { sale: 'ðŸ’°', expense: 'ðŸ›’', credit: 'ðŸ‘¥' };
  const typeColor = { sale: '#15803d', expense: '#dc2626', credit: '#C4883A' };
  const typeBorderColor = { sale: '#86efac', expense: '#fca5a5', credit: '#fcd34d' };

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto relative" style={{ background: P.bg }}>

      <header className="flex-shrink-0 px-4 pt-9 pb-3 texture-noise" style={{ background: P.header }}>
        <div className="flex items-center gap-3 mb-3">
          {/* Avatar â€” taps to settings */}
          <button
            onClick={() => setActiveTab('settings')}
            className="flex-shrink-0 press-scale"
            aria-label="Open profile & settings"
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              border: '2px solid rgba(255,255,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: 900,
              color: '#fff',
              fontFamily: 'var(--font-serif)',
              letterSpacing: '-0.01em',
            }}
          >
            {shopProfile.name.charAt(0).toUpperCase()}
          </button>

          {/* Shop name + date */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-white tracking-tight font-serif leading-tight truncate">
              {shopProfile.name}
            </h1>
            <p className="text-xs font-semibold mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {t.appName} · {getCurrentEthiopianDate()} · {new Date().toLocaleDateString('en', { day: 'numeric', month: 'short' })}
            </p>
          </div>

          {/* Streak pill */}
          {(usageStats?.streak || 0) > 0 && (
            <span className="flex-shrink-0 text-xs font-black px-2 py-1" style={{
              background: 'rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.9)',
              borderRadius: '8px',
              whiteSpace: 'nowrap',
            }}>
              ðŸ”¥ {usageStats.streak}
            </span>
          )}

          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="text-xs font-bold transition-all flex items-center flex-shrink-0 press-scale"
            style={{
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '10px',
              padding: '3px',
              gap: '2px',
            }}
            aria-label={lang === 'en' ? 'Switch to Amharic' : 'Switch to English'}
          >
            <span style={{
              background: lang === 'en' ? 'rgba(255,255,255,0.95)' : 'transparent',
              color: lang === 'en' ? '#1B4332' : 'rgba(255,255,255,0.6)',
              fontWeight: lang === 'en' ? 800 : 600,
              padding: '4px 10px',
              borderRadius: '8px',
              transition: 'all 0.18s',
              display: 'block',
            }}>EN</span>
            <span style={{
              background: lang === 'am' ? 'rgba(255,255,255,0.95)' : 'transparent',
              color: lang === 'am' ? '#1B4332' : 'rgba(255,255,255,0.6)',
              fontWeight: lang === 'am' ? 800 : 600,
              padding: '4px 9px',
              borderRadius: '8px',
              transition: 'all 0.18s',
              display: 'block',
            }}>áŠ áˆ›</span>
          </button>
        </div>

        {activeTab === 'today' && (
          <div className="flex gap-2">
            {[
              { label: t.sales, val: todaySalesTotal, color: 'rgba(255,255,255,0.15)', text: '#fff' },
              { label: t.spent, val: todayExpensesTotal, color: 'rgba(212,101,74,0.35)', text: '#fff' },
            ].map(s => (
              <div key={s.label} className="flex-1 px-3 py-2 text-center animate-elastic" style={{ background: s.color, borderRadius: 'var(--radius-sm)' }}>
                <div className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>{s.label}</div>
                <div className="font-black text-sm text-white">{hid(s.val)} {t.birr}</div>
              </div>
            ))}
          </div>
        )}
      </header>


      {activeTab === 'today' && (
        <div className="px-3 pt-2 pb-1 flex-shrink-0" style={{ background: P.actionBar }}>
          {/* Time-based greeting */}
          <p className="text-center text-xs font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {getTimeGreeting()}
          </p>
          {/* Voice â€” primary action */}
          <button
            onClick={() => setVoiceStep('record')}
            className="w-full mb-1 py-4 flex flex-col items-center justify-center font-black text-white text-base transition-all active:scale-95 press-scale"
            style={{ background: '#1a5c3a', border: '2px solid rgba(255,255,255,0.25)', borderRadius: 'var(--radius-lg)', boxShadow: '0 5px 0 #0f3d25' }}
          >
            <span className="text-2xl leading-none mb-0.5">ðŸŽ¤</span>
            <span className="text-base font-black leading-snug">{t.recordByVoice}</span>
            <span className="text-xs opacity-70">{t.recordByVoiceSubLabel}</span>
          </button>
          <p className="text-center text-xs mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {lang === 'am' ? 'á‹­áŠ“áŒˆáˆ©á£ á‰ áŠ‹áˆ‹áˆ áˆ›áˆµá‰°áŠ«áŠ¨áˆ á‹­á‰½áˆ‹áˆ‰á¢' : 'Speak your sale. You can fix it after.'}
          </p>
          <div className="flex gap-2 pb-2">
          {[
            { type: 'sale',    label: t.typeSaleLabel, sub: t.typeSale,  bg: '#2d6a4f', shadow: '#1B4332' },
            { type: 'expense', label: t.iSpentLabel, sub: t.iSpent, bg: '#D4654A', shadow: '#a84c37' },
            { type: 'credit',  label: t.creditBtnLabel, sub: t.creditBtn,  bg: '#C4883A', shadow: '#96662b' },
          ].map(b => {
            const pressed = pressedBtn === b.type;
            return (
              <button
                key={b.type}
                onClick={() => {
                  if (b.type === 'credit') {
                    setActiveTab('merro');
                    setShowCustomerForm(true);
                    return;
                  }
                  setShowForm(b.type);
                }}
                onPointerDown={() => setPressedBtn(b.type)}
                onPointerUp={() => setPressedBtn(null)}
                onPointerLeave={() => setPressedBtn(null)}
                onPointerCancel={() => setPressedBtn(null)}
                className="flex-1 py-3 text-center transition-all min-h-[72px]"
                style={{
                  background: b.bg,
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: pressed ? 'none' : `0 5px 0 ${b.shadow}`,
                  transform: pressed ? 'translateY(5px)' : 'none',
                }}
              >
                <div className="font-black text-white text-lg leading-none">+</div>
                <div className="font-black text-white text-base leading-snug font-sans">{b.label}</div>
                <div className="text-white text-xs opacity-70">{b.sub}</div>
              </button>
            );
          })}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 py-3 pb-28">
        {activeTab === 'today' && (
          <div className="space-y-3">
            <ProfitCard transactions={todayTransactions} />

            <Suspense fallback={<PanelFallback label={t.loading} />}>
              <DailySuggestions
                todayTransactions={todayTransactions}
                streak={usageStats?.streak || 1}
                onAction={(type) => setShowForm(type)}
              />
            </Suspense>


            <div className="overflow-hidden animate-elastic stagger-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: P.borderLight }}>
                <h3 className="font-bold text-gray-700 text-sm font-sans">
                  {t.todaysEntries}
                  <span className="ml-2 text-xs px-2 py-0.5" style={{ background: 'rgba(27,67,50,0.08)', color: P.header, borderRadius: 'var(--radius-sm)' }}>
                    {todayTransactions.length}
                  </span>
                </h3>
              </div>

              {todayTransactions.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-4xl mb-3">ðŸŽ¤</p>
                  <p className="font-bold text-base mb-1" style={{ color: 'var(--color-text)' }}>{lang === 'am' ? 'áŒˆáŠ“ áˆáŠ•áˆ áˆ½á‹«áŒ­ áŠ áˆá‰°áˆ˜á‹˜áŒˆá‰ áˆ' : 'No sales recorded yet'}</p>
                  <p className="text-sm font-semibold" style={{ color: P.amber }}>
                    {lang === 'am' ? 'á‹¨áˆ˜áŒ€áˆ˜áˆªá‹« áˆ½á‹«áŒ­á‹ŽáŠ• áˆˆáˆ˜áˆ˜á‹áŒˆá‰¥ áŠ¨áˆ‹á‹­ á‹­áŒ«áŠ‘' : 'Tap above to record your first sale'}
                  </p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: P.borderLight }}>
                  {todayTransactions.map(tx => (
                    <div key={tx.id}
                      className="px-3 py-3 flex items-center border-l-4"
                      style={{ borderLeftColor: typeBorderColor[tx.type] }}>
                      <span className="text-xl mr-2 flex-shrink-0">{typeEmoji[tx.type]}</span>
                      <button
                        className="flex-1 min-w-0 text-left"
                        onClick={() => setEditTarget(tx)}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-gray-800 text-sm truncate">{tx.item_name}</span>
                          {tx.updated_at && <span className="text-xs" style={{ color: P.amber }}>{t.edited}</span>}
                        </div>
                        {tx.quantity > 1 && <span className="text-xs text-gray-400">x{tx.quantity}</span>}
                        {tx.actor_name_snapshot && (
                          <span className="text-xs text-gray-500 block">Entered by {tx.actor_name_snapshot}</span>
                        )}
                        {tx.payment_type && tx.payment_type !== 'cash' && (
                          <span className="text-xs text-gray-400 block">
                            {[tx.payment_type, tx.payment_provider].filter(Boolean).join(' - ')}
                          </span>
                        )}
                      </button>
                      <div className="text-right mr-2 flex-shrink-0">
                        <div className="font-bold text-sm" style={{ color: typeColor[tx.type] }}>
                          {tx.type === 'expense' ? '-' : ''}{fmt(tx.amount || 0)} {t.birr}
                        </div>
                        {tx.profit !== null && tx.profit !== undefined && (
                          <div className={`text-xs ${tx.profit >= 0 ? 'text-green-600' : 'text-red-400'}`}>
                            {tx.profit >= 0 ? '+' : ''}{fmt(tx.profit)} {t.profit}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => setEditTarget(tx)}
                          className="p-2 flex items-center justify-center press-scale"
                          style={{ background: 'rgba(196,136,58,0.1)', minWidth: '44px', minHeight: '44px', borderRadius: 'var(--radius-sm)' }}
                          aria-label={t.editEntry}
                        >
                          <Pencil className="w-3.5 h-3.5" style={{ color: P.amber }} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(tx)}
                          className="p-2 flex items-center justify-center press-scale"
                          style={{ background: '#fff1f2', minWidth: '44px', minHeight: '44px', borderRadius: 'var(--radius-sm)' }}
                          aria-label={t.deleteEntryLabel}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'merro' && (
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
                onToggleTelegramNotify={() => handleToggleCustomerTelegramNotify(selectedCustomer)}
                onOpenTelegramConnect={() => setTelegramConnectCustomerId(selectedCustomer.id)}
                onResendTelegramUpdate={() => handleResendCustomerTelegramUpdate(selectedCustomer)}
              />
            </Suspense>
          ) : (
            <Suspense fallback={<PanelFallback label={t.loading} />}>
              <CustomerList
                customers={customerSummaries}
                onSelectCustomer={(customer) => setSelectedCustomerId(customer.id)}
                onAddCustomer={() => setShowCustomerForm(true)}
              />
            </Suspense>
          )
        )}

        {activeTab === 'history' && (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <HistoryView
              transactions={transactions}
              onEdit={setEditTarget}
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
              enabledProviders={enabledProviders}
              onProvidersChange={setEnabledProviders}
              recurringExpenses={recurringExpenses}
              onRecurringChange={setRecurringExpenses}
              usageStats={usageStats}
              earnedBadges={earnedBadges}
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

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 border-t"
        style={{ background: 'var(--color-surface)', borderColor: P.border }}>
        <div className="flex">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedCustomerId(null);
                }}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 min-h-[60px] transition-colors press-scale"
                style={{
                  background: isActive ? 'rgba(27,67,50,0.07)' : 'transparent',
                  borderBottom: isActive ? `3px solid ${P.header}` : '3px solid transparent',
                  color: isActive ? P.header : '#9ca3af',
                }}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-bold">{tab.label}</span>
                {tab.sub && <span className="text-xs" style={{ opacity: 0.65, fontSize: '0.6rem' }}>{tab.sub}</span>}
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

      {customerTransactionModal && activeCustomerTransactionModal && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <CustomerTransactionSheet
            customer={activeCustomerTransactionModal}
            mode={customerTransactionModal.mode}
            onSave={handleSaveCustomerTransaction}
            actorLabel={currentActorLabel}
            catalogEntries={activeCatalogEntries}
            onDone={() => setCustomerTransactionModal(null)}
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

      {voiceStep === 'record' && (
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

      {voiceStep === 'result' && (
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

      {voiceStep === 'fix' && (
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
              "{deleteTarget.item_name}" Â· {fmt(deleteTarget.amount || 0)} {t.birr}
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








