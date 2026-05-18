import { useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, Users, Calendar, Store, Trash2, Pencil, Share2, X, MoreVertical } from 'lucide-react';
import db from './db';
import { PrivacyProvider, usePrivacy } from './context/PrivacyContext';
import { LangProvider, useLang } from './context/LangContext';
import { ToastContainer, fireToast } from './components/Toast';
import TransactionForm from './components/TransactionForm';
import EditTransactionSheet from './components/EditTransactionSheet';
import CustomerForm from './components/CustomerForm';
import CustomerTransactionSheet from './components/CustomerTransactionSheet';
import CustomerMessageReady from './components/CustomerMessageReady';
import FastDubieCustomerPicker from './components/FastDubieCustomerPicker';
import CustomerTelegramConnectSheet from './components/CustomerTelegramConnectSheet';
import DubiePage from './components/DubiePage';
import HistoryView from './components/HistoryView';
import SettingsPage from './components/SettingsPage';
import OnboardingScreen from './components/OnboardingScreen';
import { DEFAULT_PROVIDERS } from './components/PaymentTypeChips';
import VoiceRecordScreen from './components/VoiceRecordScreenAudio';
import VoiceResultScreen from './components/VoiceResultScreen';
import VoiceFixScreen from './components/VoiceFixScreen';
import { getCurrentEthiopianDate, formatEthiopian } from './utils/ethiopianCalendar';
import { fmt } from './utils/numformat';
import { buildReportSummary } from './utils/reportBuilder';
import { checkAndAwardBadges } from './utils/badges';
import { buildCustomerSummaries, getCustomerBalance, insertCustomerTransaction, sortCustomerTransactions } from './utils/customerLedger';
import { normalizeCustomerDraft, normalizeCustomerTransactionDraft } from './utils/customerLedgerMutations';
import { CUSTOMER_TRANSACTION_TYPES, isValidCustomerTransactionType } from './utils/customerTransactionTypes';
import { buildCustomerLedgerTelegramMessage, buildTelegramMessageUrl, createCustomerTelegramLinkToken, createCustomerTransactionReference } from './utils/customerTelegram';
import { buildSupplierSummaries, getSupplierBalance, isValidSupplierTransactionType, SUPPLIER_TRANSACTION_TYPES } from './utils/supplierLedger';
import { usePwaInstall } from './hooks/usePwaInstall.js';
import { resendLatestTelegramUpdate, sendTelegramLedgerUpdate, syncTelegramCustomerState } from './utils/telegramBotClient';

const P = {
  bg: '#FAF8F5',
  header: '#1B4332',
  actionBar: '#163a2a',
  amber: '#C4883A',
  amberLight: 'rgba(196,136,58,0.12)',
  coral: '#D4654A',
  border: '#e8e2d8',
  borderLight: '#f0ede8',
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

function normalizeDisplayName(value) {
  return String(value || '').trim().toLowerCase();
}

function buildLinkedSaleItemNote(itemName, settledAmount, t) {
  const baseLabel = String(itemName || '').trim() || (t.saleLabelShort || 'Sale');
  if (!Number.isFinite(settledAmount) || settledAmount <= 0) {
    return baseLabel;
  }
  return `${baseLabel} (${t.salePaidShort || 'paid'} ${fmt(settledAmount)})`;
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
    window.open(`https://t.me/${handle}?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      fireToast('📋 ' + t.copiedToClipboard, 2500);
      onClose();
    } catch { /* ignore */ }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 animate-fade"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-md pb-safe animate-slide-up" style={{ borderRadius: '24px 24px 0 0', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b" style={{ borderColor: 'var(--color-border-light)' }}>
          <h2 className="text-base font-black text-gray-800 font-sans">📤 {t.shareTitle}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center min-w-[44px] min-h-[44px] press-scale"
            style={{ background: '#f5f5f5' }}
            aria-label={t.cancel}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-2">
          <div
            className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-pre-wrap"
            style={{ background: '#FAF8F5', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: '140px', overflowY: 'auto', fontSize: '0.7rem', lineHeight: 1.5 }}
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
              ✈️ {t.openTelegram}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="w-full py-3 font-bold text-sm flex items-center justify-center gap-2 min-h-[48px] press-scale"
            style={{ background: '#f5f5f5', color: '#374151', borderRadius: 'var(--radius-md)' }}
          >
            📋 {t.copyText}
          </button>
        </div>
      </div>
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('today');
  const [showForm, setShowForm] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [telegramConnectCustomerId, setTelegramConnectCustomerId] = useState(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showFastDubiePicker, setShowFastDubiePicker] = useState(false);
  const [customerTransactionModal, setCustomerTransactionModal] = useState(null);
  const [customerTransactionEditTarget, setCustomerTransactionEditTarget] = useState(null);
  const [messageReadyModal, setMessageReadyModal] = useState(null);
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
  const [openKebabId, setOpenKebabId] = useState(null);
  const [voiceStep, setVoiceStep] = useState(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceDetectedTotal, setVoiceDetectedTotal] = useState(null);
  const [voiceItems, setVoiceItems] = useState([]);
  const [voiceConfidence, setVoiceConfidence] = useState(null);
  const [voiceDraft, setVoiceDraft] = useState(null);
  const [voiceProvider, setVoiceProvider] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [txns, customerRows, customerTxRows, catalogRows, supplierRows, supplierTxRows, nameRow, phoneRow, businessTypeRow, epRow, reRow, telegramRow] = await Promise.all([
        db.transactions.toArray(),
        db.customers.toArray(),
        db.customer_transactions.toArray(),
        db.catalog_entries?.toArray?.() || [],
        db.suppliers?.toArray?.() || [],
        db.supplier_transactions?.toArray?.() || [],
        db.settings.get('shop_name'),
        db.settings.get('shop_phone'),
        db.settings.get('shop_business_type'),
        db.settings.get('enabled_payment_methods'),
        db.settings.get('recurring_expenses'),
        db.settings.get('shop_telegram'),
      ]);
      txns.sort((a, b) => b.created_at - a.created_at);
      setTransactions(txns);
      setLedgerCustomers(customerRows);
      setLedgerTransactions(sortCustomerTransactions(customerTxRows));
      setCatalogEntries(catalogRows || []);
      setSuppliers(supplierRows || []);
      setSupplierTransactions(supplierTxRows || []);
      setShopProfile({
        name: nameRow?.value || null,
        phone: phoneRow?.value || '',
        businessType: businessTypeRow?.value || '',
        telegram: telegramRow?.value || '',
      });
      try { setEnabledProviders(epRow ? JSON.parse(epRow.value) : DEFAULT_PROVIDERS); } catch { setEnabledProviders(DEFAULT_PROVIDERS); }
      try { setRecurringExpenses(reRow ? JSON.parse(reRow.value) : []); } catch { setRecurringExpenses([]); }
    } catch (err) {
      const safeErr = err instanceof Error ? err.message : String(err);
       if (import.meta.env.DEV) console.error('Failed to load data:', safeErr);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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
      const safeErr = err instanceof Error ? err.message : String(err);
       if (import.meta.env.DEV) console.error('Analytics tracking failed:', safeErr);
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
      const now = new Date(transaction.created_at);
      const newTxn = {
        ...transaction,
        ethiopian_date: formatEthiopian(now),
        customer_name: transaction.customer_name || null,
      };
      const remainingAmount = transaction.type === 'sale' ? Math.max(Number(transaction.remaining_amount) || 0, 0) : 0;
      const settledAmount = transaction.type === 'sale' ? Math.max(Number(transaction.paid_amount) || 0, 0) : 0;
      const needsLinkedCustomerBalance = transaction.type === 'sale'
        && remainingAmount > 0
        && normalizeDisplayName(transaction.customer_name);

      let saved = null;
      let linkedCustomer = null;
      let linkedCustomerTransaction = null;

      await db.transaction('rw', db.transactions, db.customers, db.customer_transactions, async () => {
        if (needsLinkedCustomerBalance) {
          const customerName = String(transaction.customer_name || '').trim();
          const existingCustomers = await db.customers.toArray();
          linkedCustomer = existingCustomers.find((entry) => normalizeDisplayName(entry.display_name) === normalizeDisplayName(customerName)) || null;

          if (!linkedCustomer) {
            const createdAt = transaction.created_at || Date.now();
            const customerId = await db.customers.add({
              display_name: customerName,
              note: null,
              phone_number: null,
              telegram_username: null,
              telegram_chat_id: null,
              telegram_notify_enabled: false,
              telegram_link_token: createCustomerTelegramLinkToken(),
              telegram_linked_at: null,
              telegram_link_requested_at: null,
              created_at: createdAt,
              updated_at: createdAt,
            });
            linkedCustomer = await db.customers.get(customerId);
          } else {
            await db.customers.update(linkedCustomer.id, { updated_at: transaction.created_at || Date.now() });
            linkedCustomer = { ...linkedCustomer, updated_at: transaction.created_at || Date.now() };
          }

          const linkedEntry = {
            customer_id: linkedCustomer.id,
            type: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
            amount: remainingAmount,
            item_note: buildLinkedSaleItemNote(transaction.item_name, settledAmount, t),
            due_date: transaction.settlement_due_date || null,
            reference_code: null,
            telegram_delivery_state: null,
            telegram_delivery_error: null,
            telegram_delivery_attempted_at: null,
            created_at: transaction.created_at || Date.now(),
            updated_at: transaction.created_at || Date.now(),
          };
          const linkedCustomerTransactionId = await db.customer_transactions.add(linkedEntry);
          const referenceCode = createCustomerTransactionReference(linkedCustomerTransactionId, linkedEntry.created_at);
          await db.customer_transactions.update(linkedCustomerTransactionId, { reference_code: referenceCode });
          linkedCustomerTransaction = await db.customer_transactions.get(linkedCustomerTransactionId);

          newTxn.linked_customer_id = linkedCustomer.id;
          newTxn.linked_customer_transaction_id = linkedCustomerTransactionId;
        }

        const id = await db.transactions.add(newTxn);
        saved = await db.transactions.get(id);
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

      if (linkedCustomer) {
        setLedgerCustomers(prev => {
          const exists = prev.some(entry => entry.id === linkedCustomer.id);
          if (!exists) return [...prev, linkedCustomer];
          return prev.map(entry => entry.id === linkedCustomer.id ? { ...entry, updated_at: linkedCustomer.updated_at } : entry);
        });
      }

      if (linkedCustomerTransaction) {
        setLedgerTransactions(prev => insertCustomerTransaction(prev, linkedCustomerTransaction));
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
            const updated = { ...prev, featureCounts: fc };
            checkAndAwardBadges(updated, lang).then(setEarnedBadges);
            return updated;
          });
        } catch { /* non-critical */ }
      }

      const toastMsg = transaction.type === 'sale' && linkedCustomerTransaction
        ? (t.saleSavedWithBalance || 'Sale saved. Remaining balance added to customer.')
        : ({ sale: t.saleSaved, expense: t.expenseSaved }[transaction.type] || '✓');
      fireToast(toastMsg, 1500);
    } catch (err) {
      const safeErr = err instanceof Error ? err.message : String(err);
      if (import.meta.env.DEV) console.error('Failed to save:', safeErr);
      throw err;
    }
  };

  const handleVoiceSave = async ({
    amount,
    note,
    paymentType = 'cash',
    paymentProvider = '',
    wasEdited = false,
    draft = null,
    saleSettlementMode = 'paid_now',
    paidAmount = null,
    remainingAmount = null,
    settlementDueDate = null,
  }) => {
    const now = Date.now();
    const hasMultiple = voiceItems.length > 1;
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
    const summaryNote = note || buildVoiceSummaryFromDraft(mergedDraft) || 'Voice sale';
    const primaryItem = mergedDraft?.items?.length === 1 ? mergedDraft.items[0] : null;

    const transaction = {
      type: 'sale',
      item_name: primaryItem?.name || summaryNote,
      quantity: primaryItem?.quantity || 1,
      amount,
      cost_price: 0,
      profit: null,
      is_credit: (remainingAmount ?? 0) > 0,
      customer_phone: null,
      customer_name: mergedDraft?.customer_name || null,
      due_date: null,
      payment_type: saleSettlementMode === 'pay_later' ? null : paymentType,
      payment_provider: saleSettlementMode === 'pay_later' || paymentType === 'cash' ? null : paymentProvider || null,
      direction: null,
      sale_settlement_mode: saleSettlementMode,
      paid_amount: paidAmount ?? amount,
      remaining_amount: remainingAmount ?? 0,
      settlement_due_date: settlementDueDate,
      source: 'voice',
      raw_transcript: combinedTranscript,
      detected_total: savedDetectedTotal,
      was_edited: wasEdited || false,
      transcription_provider: voiceProvider || null,
      parsing_confidence: hasMultiple ? null : (voiceConfidence ?? null),
      voice_note: summaryNote || null,
      raw_audio_ref: null,
      created_at: now,
    };
    await handleAddTransaction(transaction);
    setVoiceStep(null);
    setVoiceTranscript('');
    setVoiceDetectedTotal(null);
    setVoiceItems([]);
    setVoiceConfidence(null);
    setVoiceDraft(null);
    setVoiceProvider(null);
  };

  const handleUpdateTransaction = async (id, updates) => {
    try {
      const now = Date.now();
      let updated = null;
      let linkedCustomerTransaction = null;
      let removedLinkedCustomerTransactionId = null;
      let touchedCustomerId = null;

      await db.transaction('rw', db.transactions, db.customer_transactions, db.customers, async () => {
        const existing = await db.transactions.get(id);
        if (!existing) return;

        const next = { ...existing, ...updates, updated_at: now };

        if (existing.type === 'sale' && existing.linked_customer_transaction_id) {
          const linkedTransaction = await db.customer_transactions.get(existing.linked_customer_transaction_id);
          touchedCustomerId = existing.linked_customer_id || linkedTransaction?.customer_id || null;

          if (linkedTransaction) {
            const settlementMode = existing.sale_settlement_mode || 'pay_later';
            const nextAmount = Math.max(Number(next.amount) || 0, 0);
            
            // Slice C: Use updated paid_amount if provided, otherwise fall back to existing
            const nextPaidAmount = settlementMode === 'pay_later'
              ? 0
              : settlementMode === 'paid_partly'
                ? Math.max(Number(next.paid_amount ?? existing.paid_amount) || 0, 0)
                : nextAmount;
            
            // Slice C: Defensive guard — reject invalid paid_partly edits
            if (settlementMode === 'paid_partly') {
              if (nextPaidAmount <= 0) {
                throw new Error('Paid amount must be greater than zero for paid partly sales.');
              }
              if (nextPaidAmount >= nextAmount) {
                throw new Error('Paid amount must be less than total for paid partly sales.');
              }
            }
            
            const nextRemainingAmount = settlementMode === 'paid_now'
              ? 0
              : Math.max(nextAmount - nextPaidAmount, 0);

            next.paid_amount = nextPaidAmount;
            next.remaining_amount = nextRemainingAmount;
            next.is_credit = nextRemainingAmount > 0;

            if (nextRemainingAmount > 0) {
              // Slice C: Use updated settlement_due_date if provided
              const nextDueDate = next.settlement_due_date !== undefined ? next.settlement_due_date : existing.settlement_due_date;
              await db.customer_transactions.update(existing.linked_customer_transaction_id, {
                amount: nextRemainingAmount,
                item_note: buildLinkedSaleItemNote(next.item_name, nextPaidAmount, t),
                due_date: nextDueDate || null,
                updated_at: now,
              });
              linkedCustomerTransaction = await db.customer_transactions.get(existing.linked_customer_transaction_id);
            } else {
              await db.customer_transactions.delete(existing.linked_customer_transaction_id);
              removedLinkedCustomerTransactionId = existing.linked_customer_transaction_id;
              next.linked_customer_transaction_id = null;
            }

            if (touchedCustomerId) {
              await db.customers.update(touchedCustomerId, { updated_at: now });
            }
          }
        } else if (existing.type === 'sale' && existing.sale_settlement_mode && existing.sale_settlement_mode !== 'paid_now') {
          const settlementMode = existing.sale_settlement_mode;
          const nextAmount = Math.max(Number(next.amount) || 0, 0);
          
          // Slice C: Use updated paid_amount if provided
          const nextPaidAmount = settlementMode === 'pay_later'
            ? 0
            : settlementMode === 'paid_partly'
              ? Math.max(Number(next.paid_amount ?? existing.paid_amount) || 0, 0)
              : nextAmount;
          
          // Slice C: Defensive guard — reject invalid paid_partly edits
          if (settlementMode === 'paid_partly') {
            if (nextPaidAmount <= 0) {
              throw new Error('Paid amount must be greater than zero for paid partly sales.');
            }
            if (nextPaidAmount >= nextAmount) {
              throw new Error('Paid amount must be less than total for paid partly sales.');
            }
          }
          
          const nextRemainingAmount = settlementMode === 'paid_now'
            ? 0
            : Math.max(nextAmount - nextPaidAmount, 0);

          next.paid_amount = nextPaidAmount;
          next.remaining_amount = nextRemainingAmount;
          next.is_credit = nextRemainingAmount > 0;

          if (nextRemainingAmount > 0 && normalizeDisplayName(existing.customer_name)) {
            let linkedCustomerId = existing.linked_customer_id || null;

            if (!linkedCustomerId) {
              const existingCustomers = await db.customers.toArray();
              const linkedCustomer = existingCustomers.find((entry) => normalizeDisplayName(entry.display_name) === normalizeDisplayName(existing.customer_name)) || null;
              linkedCustomerId = linkedCustomer?.id || null;
            }

            if (linkedCustomerId) {
              // Slice C: Use updated settlement_due_date if provided
              const nextDueDate = next.settlement_due_date !== undefined ? next.settlement_due_date : existing.settlement_due_date;
              const linkedEntry = {
                customer_id: linkedCustomerId,
                type: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
                amount: nextRemainingAmount,
                item_note: buildLinkedSaleItemNote(next.item_name, nextPaidAmount, t),
                due_date: nextDueDate || null,
                reference_code: null,
                telegram_delivery_state: null,
                telegram_delivery_error: null,
                telegram_delivery_attempted_at: null,
                created_at: existing.created_at || now,
                updated_at: now,
              };
              const newLinkedId = await db.customer_transactions.add(linkedEntry);
              const referenceCode = createCustomerTransactionReference(newLinkedId, linkedEntry.created_at);
              await db.customer_transactions.update(newLinkedId, { reference_code: referenceCode });
              linkedCustomerTransaction = await db.customer_transactions.get(newLinkedId);
              next.linked_customer_id = linkedCustomerId;
              next.linked_customer_transaction_id = newLinkedId;
              touchedCustomerId = linkedCustomerId;
              await db.customers.update(linkedCustomerId, { updated_at: now });
            }
          }
        }

        await db.transactions.update(id, next);
        updated = await db.transactions.get(id);
      });

      if (!updated) return;
      setTransactions(prev => prev.map(t2 => t2.id === id ? updated : t2));
      if (linkedCustomerTransaction) {
        setLedgerTransactions(prev => {
          const exists = prev.some(entry => entry.id === linkedCustomerTransaction.id);
          if (!exists) return insertCustomerTransaction(prev, linkedCustomerTransaction);
          return sortCustomerTransactions(prev.map(entry => (
            entry.id === linkedCustomerTransaction.id ? linkedCustomerTransaction : entry
          )));
        });
      } else if (removedLinkedCustomerTransactionId) {
        setLedgerTransactions(prev => prev.filter(entry => entry.id !== removedLinkedCustomerTransactionId));
      }
      if (touchedCustomerId) {
        setLedgerCustomers(prev => prev.map(entry => (
          entry.id === touchedCustomerId ? { ...entry, updated_at: now } : entry
        )));
      }
    } catch (err) {
const safeErr = err instanceof Error ? err.message : String(err);
       if (import.meta.env.DEV) console.error('Failed to update:', safeErr);
       alert('Could not update. Please try again.');
      throw err;
    }
  };

  const handleDeleteTransaction = async (id, options = {}) => {
    try {
      let linkedCustomerTransactionId = null;
      let touchedCustomerId = null;
      const now = Date.now();

      await db.transaction('rw', db.transactions, db.customer_transactions, db.customers, async () => {
        const existing = await db.transactions.get(id);
        if (!existing) return;

        linkedCustomerTransactionId = existing.linked_customer_transaction_id || null;
        touchedCustomerId = existing.linked_customer_id || null;

        if (linkedCustomerTransactionId) {
          await db.customer_transactions.delete(linkedCustomerTransactionId);
        }
        if (touchedCustomerId) {
          await db.customers.update(touchedCustomerId, { updated_at: now });
        }
        await db.transactions.delete(id);
      });

      setTransactions(prev => prev.filter(t2 => t2.id !== id));
      if (linkedCustomerTransactionId) {
        setLedgerTransactions(prev => prev.filter(entry => entry.id !== linkedCustomerTransactionId));
      }
      if (touchedCustomerId) {
        setLedgerCustomers(prev => prev.map(entry => (
          entry.id === touchedCustomerId ? { ...entry, updated_at: now } : entry
        )));
      }
      if (!options.silentClose) {
        setDeleteTarget(null);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
         const safeErr = err instanceof Error ? err.message : String(err);
         console.error('Failed to delete:', safeErr);
       }
    }
  };

  const handleProfileSave = async (name, phone, telegram) => {
    await db.settings.put({ key: 'shop_name', value: name });
    await db.settings.put({ key: 'shop_phone', value: phone || '' });
    await db.settings.put({ key: 'shop_telegram', value: telegram || '' });
    setShopProfile({ name, phone: phone || '', telegram: telegram || '' });
  };

  const customerSummaries = useMemo(
    () => buildCustomerSummaries(ledgerCustomers, ledgerTransactions),
    [ledgerCustomers, ledgerTransactions]
  );

  const selectedCustomer = useMemo(
    () => customerSummaries.find(c => c.id === selectedCustomerId) || null,
    [customerSummaries, selectedCustomerId]
  );

  const activeCustomerTransactionModal = useMemo(() => {
    if (!customerTransactionModal?.customerId) return null;
    return customerSummaries.find(c => c.id === customerTransactionModal.customerId) || null;
  }, [customerSummaries, customerTransactionModal]);

  const openNewDubieCustomerFlow = useCallback(() => {
    setShowFastDubiePicker(false);
    setActiveTab('merro');
    setShowCustomerForm(true);
  }, []);

  const openFastDubiePicker = useCallback(() => {
    if (customerSummaries.length === 0) {
      openNewDubieCustomerFlow();
      return;
    }
    setShowFastDubiePicker(true);
  }, [customerSummaries.length, openNewDubieCustomerFlow]);

  const handleSelectFastDubieCustomer = useCallback((customer) => {
    if (!customer?.id) return;
    setShowFastDubiePicker(false);
    setCustomerTransactionModal({
      mode: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
      customerId: customer.id,
    });
  }, []);

  const activeCatalogEntries = useMemo(
    () => catalogEntries.filter(entry => entry.active !== false).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [catalogEntries]
  );

  const supplierSummaries = useMemo(
    () => buildSupplierSummaries(suppliers, supplierTransactions),
    [suppliers, supplierTransactions]
  );

  const handleGiveCustomerDubie = useCallback(async (payload) => {
    const now = Date.now();
    let customerId = payload.customer_id;
    let savedCustomer = null;
    let savedTransaction = null;

    if (payload.customer) {
      const linkToken = createCustomerTelegramLinkToken();
      const customerPayload = {
        display_name: payload.customer.display_name.trim(),
        note: null,
        phone_number: payload.customer.phone_number || null,
        telegram_username: payload.customer.telegram_username || null,
        telegram_chat_id: null,
        telegram_notify_enabled: false,
        telegram_link_token: linkToken,
        telegram_linked_at: null,
        telegram_link_requested_at: null,
        created_at: now,
        updated_at: now,
      };

      const entry = {
        customer_id: null, // set after customer add
        type: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
        amount: payload.amount,
        item_note: payload.item_note || null,
        catalog_entry_id: payload.catalog_entry_id || null,
        item_kind: payload.item_kind || null,
        due_date: payload.due_date || null,
        reference_code: null,
        telegram_delivery_state: null,
        telegram_delivery_attempted_at: null,
        created_at: now,
        updated_at: now,
      };

      await db.transaction('rw', db.customers, db.customer_transactions, async () => {
        const id = await db.customers.add(customerPayload);
        savedCustomer = await db.customers.get(id);
        customerId = id;

        entry.customer_id = customerId;
        const txId = await db.customer_transactions.add(entry);
        const referenceCode = createCustomerTransactionReference(txId, now);
        await db.customer_transactions.update(txId, { reference_code: referenceCode });
        savedTransaction = await db.customer_transactions.get(txId);
      });

      setLedgerCustomers(prev => [...prev, savedCustomer]);
    } else {
      if (!customerId) return false;

      const entry = {
        customer_id: customerId,
        type: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
        amount: payload.amount,
        item_note: payload.item_note || null,
        catalog_entry_id: payload.catalog_entry_id || null,
        item_kind: payload.item_kind || null,
        due_date: payload.due_date || null,
        reference_code: null,
        telegram_delivery_state: null,
        telegram_delivery_attempted_at: null,
        created_at: now,
        updated_at: now,
      };

      await db.transaction('rw', db.customer_transactions, db.customers, async () => {
        const txId = await db.customer_transactions.add(entry);
        const referenceCode = createCustomerTransactionReference(txId, now);
        await db.customer_transactions.update(txId, { reference_code: referenceCode });
        savedTransaction = await db.customer_transactions.get(txId);
        await db.customers.update(customerId, { updated_at: now });
      });
    }

    if (!savedTransaction) return false;

    setLedgerTransactions(prev => insertCustomerTransaction(prev, savedTransaction));
    if (customerId) {
      setLedgerCustomers(prev => prev.map(c => c.id === customerId ? { ...c, updated_at: now } : c));
    }
    fireToast(t.creditSaved || 'Dubie saved', 2200);
    return true;
  }, [t]);

  const handleRecordCustomerPayment = useCallback(async (payload) => {
    const customer = customerSummaries.find(c => c.id === payload.customer_id);
    if (!customer) { fireToast(t.customerNotFound || 'Customer not found', 2200); return false; }

    const amount = Number(payload.amount) || 0;
    if (amount <= 0) { fireToast(t.validAmountRequired || 'Enter a valid amount', 2200); return false; }
    if (amount > Math.max(customer.balance || 0, 0)) { fireToast(t.paymentMoreThanBalance || 'More than balance', 2600); return false; }

    const now = Date.now();
    const entry = {
      customer_id: payload.customer_id,
      type: CUSTOMER_TRANSACTION_TYPES.PAYMENT,
      amount,
      item_note: payload.note || null,
      due_date: null,
      reference_code: null,
      telegram_delivery_state: null,
      telegram_delivery_attempted_at: null,
      created_at: now,
      updated_at: now,
    };

    const id = await db.customer_transactions.add(entry);
    const referenceCode = createCustomerTransactionReference(id, now);
    await db.customer_transactions.update(id, { reference_code });
    const saved = await db.customer_transactions.get(id);
    await db.customers.update(payload.customer_id, { updated_at: now });

    setLedgerTransactions(prev => insertCustomerTransaction(prev, saved));
    setLedgerCustomers(prev => prev.map(c => c.id === payload.customer_id ? { ...c, updated_at: now } : c));
    fireToast(t.paymentSaved || 'Payment recorded', 2200);
    return true;
  }, [customerSummaries, t]);

  const handleTakeSupplierDubie = useCallback(async (payload) => {
    const now = Date.now();
    let supplierId = payload.supplier_id;
    let savedSupplier = null;
    let savedTransaction = null;

    if (payload.supplier) {
      const supplierPayload = {
        display_name: payload.supplier.display_name.trim(),
        phone_number: payload.supplier.phone_number || null,
        note: null,
        active: true,
        created_at: now,
        updated_at: now,
      };

      const entry = {
        supplier_id: null, // set after supplier add
        type: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD,
        amount: payload.amount,
        catalog_entry_id: payload.catalog_entry_id || null,
        item_name: payload.item_name || null,
        item_kind: payload.item_kind || null,
        quantity: null,
        note: null,
        created_at: now,
        updated_at: now,
      };

      await db.transaction('rw', db.suppliers, db.supplier_transactions, async () => {
        const id = await db.suppliers.add(supplierPayload);
        savedSupplier = await db.suppliers.get(id);
        supplierId = id;

        entry.supplier_id = supplierId;
        const txId = await db.supplier_transactions.add(entry);
        savedTransaction = await db.supplier_transactions.get(txId);
      });

      setSuppliers(prev => [...prev, savedSupplier]);
    } else {
      if (!supplierId) return false;

      const entry = {
        supplier_id: supplierId,
        type: SUPPLIER_TRANSACTION_TYPES.PURCHASE_ADD,
        amount: payload.amount,
        catalog_entry_id: payload.catalog_entry_id || null,
        item_name: payload.item_name || null,
        item_kind: payload.item_kind || null,
        quantity: null,
        note: null,
        created_at: now,
        updated_at: now,
      };

      await db.transaction('rw', db.supplier_transactions, db.suppliers, async () => {
        const txId = await db.supplier_transactions.add(entry);
        savedTransaction = await db.supplier_transactions.get(txId);
        await db.suppliers.update(supplierId, { updated_at: now });
      });
    }

    if (!savedTransaction) return false;

    setSupplierTransactions(prev => [savedTransaction, ...prev]);
    if (supplierId) {
      setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, updated_at: now } : s));
    }
    fireToast(t.supplierDubieSaved || 'Supplier Dubie saved', 2200);
    return true;
  }, [t]);

  const handleRecordSupplierPayment = useCallback(async (payload) => {
    const supplier = supplierSummaries.find(s => s.id === payload.supplier_id);
    if (!supplier) { fireToast('Supplier not found', 2200); return false; }

    const amount = Number(payload.amount) || 0;
    if (amount <= 0) { fireToast('Enter a valid amount', 2200); return false; }
    if (amount > Math.max(supplier.balance || 0, 0)) { fireToast('Payment is more than remaining dubie', 2600); return false; }

    const now = Date.now();
    const entry = {
      supplier_id: payload.supplier_id,
      type: SUPPLIER_TRANSACTION_TYPES.PAYMENT,
      amount,
      catalog_entry_id: null,
      item_name: null,
      item_kind: null,
      quantity: null,
      note: payload.note || null,
      created_at: now,
      updated_at: now,
    };

    const id = await db.supplier_transactions.add(entry);
    const saved = await db.supplier_transactions.get(id);
    await db.suppliers.update(payload.supplier_id, { updated_at: now });

    setSupplierTransactions(prev => [saved, ...prev]);
    setSuppliers(prev => prev.map(s => s.id === payload.supplier_id ? { ...s, updated_at: now } : s));
    fireToast('Supplier payment recorded', 2200);
    return true;
  }, [supplierSummaries]);

  const telegramConnectCustomer = useMemo(
    () => customerSummaries.find(c => c.id === telegramConnectCustomerId) || null,
    [customerSummaries, telegramConnectCustomerId]
  );

  const mergedVoiceDraft = useMemo(
    () => mergeVoiceDrafts(voiceItems, voiceDraft),
    [voiceDraft, voiceItems]
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
      if (import.meta.env.DEV) {
         const safeErr = err instanceof Error ? err.message : String(err);
         console.error('Failed to save customer:', safeErr);
       }
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
      fireToast(t.telegramManualDraftHint, 2600);
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
      fireToast(t.telegramGenerateBorrowerLinkFirst, 2200);
      return false;
    }
    try {
      await syncLinkedCustomerTelegramState(customer);
      const result = await resendLatestTelegramUpdate({ token: customer.telegram_link_token });
      if (result?.delivered) {
        fireToast(t.telegramLatestUpdateSentAgain, 2200);
        return true;
      }
      fireToast(t.telegramNoUpdateReady, 2200);
      return false;
    } catch (error) {
      fireToast(error?.message || t.telegramResendUpdateFailed, 2600);
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
      };

      const id = await db.customer_transactions.add(entry);
      referenceCode = createCustomerTransactionReference(id, now);
      await db.customer_transactions.update(id, { reference_code: referenceCode });
      saved = await db.customer_transactions.get(id);
      nextBalance = getCustomerBalance([saved, ...existingTx]);
      await db.customers.update(draft.customer_id, { updated_at: now });
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

    setLedgerTransactions(prev => insertCustomerTransaction(prev, saved));
    setLedgerCustomers(prev => prev.map(c => c.id === draft.customer_id ? { ...c, updated_at: now } : c));
    setCustomerTransactionModal(null);

    const botAutoSent = !!(customer?.telegram_chat_id && customer?.telegram_notify_enabled);
    const hasContactInfo = !!(customer?.phone_number || customer?.telegram_username);

    if (!botAutoSent && hasContactInfo) {
      setMessageReadyModal({
        type: draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT ? 'payment' : 'credit',
        customerId: draft.customer_id,
        amount: draft.amount,
        itemNote: draft.item_note,
        dueDate: draft.due_date,
      });
    }
    fireToast(draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT ? (t.paymentSaved || 'Payment recorded ✓') : t.creditSaved, 2200);

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
      customerName: customer.display_name,
      type: draft.type,
      amount,
      itemNote: draft.item_note,
      previousBalance,
      updatedBalance: nextBalance,
      createdAt: now,
      referenceCode,
    });

    if (customer?.telegram_chat_id) {
      await syncLinkedCustomerTelegramState(customer, nextBalance);
    }

    if (customer?.telegram_notify_enabled && customer?.telegram_chat_id && customer?.telegram_link_token) {
      try {
        const result = await sendTelegramLedgerUpdate({
          token: customer.telegram_link_token,
          currentBalance: nextBalance,
          message,
          reference: referenceCode,
        });
        telegramDeliveryState = result?.delivered ? 'bot_sent' : 'bot_pending';
      } catch (error) {
        telegramDeliveryState = 'bot_failed';
        telegramDeliveryError = error?.message || t.telegramSendFailed;
      }
    } else if (customer?.telegram_notify_enabled && customer?.telegram_username) {
      const telegramUrl = buildTelegramMessageUrl(customer.telegram_username, message);
      if (telegramUrl) {
        window.open(telegramUrl, '_blank', 'noopener,noreferrer');
        telegramDeliveryState = 'manual_opened';
      } else {
        telegramDeliveryState = 'manual_unavailable';
        telegramDeliveryError = t.telegramManualInvalid;
      }
    } else {
      telegramDeliveryState = customer?.telegram_chat_id ? 'bot_linked_updates_off' : 'not_linked';
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
      fireToast(`${t.telegramDubieSavedButFailed} ${telegramDeliveryError || t.telegramSendFailed}`, 2600);
    }

    return true;
  };

  const handleUpdateCustomerTransaction = async (transactionId, payload) => {
    const draft = normalizeCustomerTransactionDraft(payload);
    if (!draft) {
      fireToast(t.validAmountRequired, 2200);
      return false;
    }

    const currentTx = ledgerTransactions.find(entry => entry.id === transactionId);
    if (!currentTx) {
      fireToast(t.noTransactionsYet || 'Transaction not found', 2200);
      return false;
    }

    const customer = customerSummaries.find(c => c.id === draft.customer_id);
    if (!customer) {
      fireToast(t.customerNotFound, 2200);
      return false;
    }

    let missingTransaction = false;
    let customerMissing = false;
    let invalidPayment = false;
    let updated = null;
    const now = Date.now();

    await db.transaction('rw', db.customer_transactions, db.customers, async () => {
      const existingRecord = await db.customer_transactions.get(transactionId);
      if (!existingRecord) {
        missingTransaction = true;
        return;
      }

      const customerRecord = await db.customers.get(draft.customer_id);
      if (!customerRecord) {
        customerMissing = true;
        return;
      }

      const siblingTransactions = await db.customer_transactions.where('customer_id').equals(draft.customer_id).toArray();
      const balanceWithoutCurrent = getCustomerBalance(siblingTransactions.filter(entry => entry.id !== transactionId));

      if (draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT && draft.amount > Math.max(balanceWithoutCurrent, 0)) {
        invalidPayment = true;
        return;
      }

      const updates = {
        amount: draft.amount,
        item_note: draft.item_note,
        due_date: draft.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD ? draft.due_date : null,
        updated_at: now,
      };

      await db.customer_transactions.update(transactionId, updates);
      await db.customers.update(draft.customer_id, { updated_at: now });
      updated = await db.customer_transactions.get(transactionId);
    });

    if (missingTransaction) {
      fireToast(t.noTransactionsYet || 'Transaction not found', 2200);
      return false;
    }

    if (customerMissing) {
      fireToast(t.customerNotFound, 2200);
      return false;
    }

    if (invalidPayment || !updated) {
      fireToast(t.paymentMoreThanBalance, 2600);
      return false;
    }

    setLedgerTransactions(prev => sortCustomerTransactions(prev.map(entry => (
      entry.id === transactionId ? updated : entry
    ))));
    setLedgerCustomers(prev => prev.map(entry => (
      entry.id === draft.customer_id ? { ...entry, updated_at: now } : entry
    )));
    setCustomerTransactionEditTarget(null);
    fireToast(t.saved || 'Saved!', 2200);
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

  const estimatedProfit = useMemo(() => {
    const sales = todayTransactions.filter(t2 => t2.type === 'sale');
    const expenses = todayTransactions.filter(t2 => t2.type === 'expense');
    const revenue = sales.reduce((s, t2) => s + (t2.amount || 0), 0);
    const costOfGoods = sales.reduce((s, t2) => s + ((t2.cost_price || 0) * (t2.quantity || 1)), 0);
    const expensesTotal = expenses.reduce((s, t2) => s + (t2.amount || 0), 0);
    const salesWithCost = sales.filter(t2 => t2.cost_price > 0).length;
    const totalSales = sales.length;
    const hasPartialCostData = totalSales > 0 && salesWithCost > 0 && salesWithCost < totalSales;
    if (!hasPartialCostData) return null;
    return revenue - costOfGoods - expensesTotal;
  }, [todayTransactions]);

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

  const buildShareSummary = () => buildReportSummary({
    shopName: shopProfile?.name,
    cashTransactions: todayTransactions,
    customerTransactions: todayLedgerTransactions,
    periodLabel: t.shareDailyReport,
    t,
  });

  const handleShareReport = () => {
    setShareText(buildShareSummary());
    setShowShareModal(true);
  };

  const handleHistoryShareReport = (text) => {
    setShareText(text);
    setShowShareModal(true);
  };

  const hid = (n) => hidden ? '••••' : fmt(n);

  const getTimeGreeting = () => {
    const h = new Date().getHours();
    if (lang === 'am') {
      if (h < 12) return '👋 እንኳን ደህና መጡ — ዛሬን ሽያጥ ይቁጠሩ';
      if (h < 17) return '📌 ሲሸጡ ይቅዱ — ዝርዝር ቆይቶ ማስተካከል ይቻላል';
      return '🌙 ዛሬን ሽያጥ አይርሱ — ሁሉ ይቅዱ';
    }
    if (h < 12) return '👋 Good morning — start tracking today\'s sales';
    if (h < 17) return '📌 Keep going — record your sales as you sell';
    return '🌙 Don\'t forget today\'s last sales';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg }}>
        <div className="text-center animate-elastic">
          <div className="text-5xl mb-3">📒</div>
          <h1 className="text-2xl font-black font-serif" style={{ color: P.header }}>ገበያ</h1>
          <p className="text-sm mt-2" style={{ color: '#9ca3af' }}>{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!shopProfile || !shopProfile.name) {
    return (
      <OnboardingScreen
        onComplete={(profile) => setShopProfile(profile)}
      />
    );
  }

  const tabs = [
    { id: 'today',    label: t.todayLabel, sub: t.today,   icon: BookOpen },
    { id: 'merro',    label: t.creditLabel, sub: t.credit,  icon: Users },
    { id: 'history',  label: t.report,                       icon: Calendar },
    { id: 'settings', label: t.myShop,                     icon: Store },
  ];

  const typeEmoji = { sale: '💰', expense: '🛒', credit: '👥' };
  const typeColor = { sale: '#15803d', expense: '#dc2626', credit: '#C4883A' };
  const typeBorderColor = { sale: '#86efac', expense: '#fca5a5', credit: '#fcd34d' };

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto relative" style={{ background: P.bg }}>

      <header className="flex-shrink-0 px-3.5 pt-5 pb-2 texture-noise sm:px-4 sm:pt-6" style={{ background: P.header }}>
        <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Avatar — taps to settings */}
          <button
            onClick={() => setActiveTab('settings')}
            className="flex-shrink-0 press-scale"
            aria-label="Open profile & settings"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              border: '2px solid rgba(255,255,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              fontWeight: 900,
              color: '#fff',
              fontFamily: 'var(--font-serif)',
              letterSpacing: '-0.01em',
            }}
          >
            {shopProfile.name.charAt(0).toUpperCase()}
          </button>

          {/* Shop name + date */}
          <div className="min-w-0 flex-1 pr-1">
            <h1 className="text-lg font-black text-white tracking-tight font-serif leading-tight truncate">
              {shopProfile.name}
            </h1>
            <p className="truncate text-[10px] font-semibold sm:text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
              ገበያ · {getCurrentEthiopianDate()} · {new Date().toLocaleDateString('en', { day: 'numeric', month: 'short' })}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Streak pill */}
            {(usageStats?.streak || 0) > 0 && (
              <span className="flex-shrink-0 whitespace-nowrap px-2 py-1 text-[10px] font-black" style={{
                background: 'rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.9)',
                borderRadius: '8px',
              }}>
                🔥 {usageStats.streak}
              </span>
            )}

            {/* Language toggle */}
            <button
              onClick={toggleLang}
              className="flex flex-shrink-0 items-center text-[10px] font-bold transition-all press-scale"
              style={{
                background: 'rgba(255,255,255,0.15)',
                borderRadius: '10px',
                padding: '2px',
                gap: '1px',
              }}
              aria-label={lang === 'en' ? 'Switch to Amharic' : 'Switch to English'}
            >
              <span style={{
                background: lang === 'en' ? 'rgba(255,255,255,0.95)' : 'transparent',
                color: lang === 'en' ? '#1B4332' : 'rgba(255,255,255,0.6)',
                fontWeight: lang === 'en' ? 800 : 600,
                padding: '3px 8px',
                borderRadius: '7px',
                transition: 'all 0.18s',
                display: 'block',
              }}>EN</span>
              <span style={{
                background: lang === 'am' ? 'rgba(255,255,255,0.95)' : 'transparent',
                color: lang === 'am' ? '#1B4332' : 'rgba(255,255,255,0.6)',
                fontWeight: lang === 'am' ? 800 : 600,
                padding: '3px 8px',
                borderRadius: '7px',
                transition: 'all 0.18s',
                display: 'block',
              }}>አማ</span>
            </button>
          </div>
        </div>

      </header>


      {activeTab === 'today' && (
        <div className="flex-shrink-0 px-3 py-1.5" style={{ background: P.actionBar }}>
          <p className="text-center text-[11px] font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {getTimeGreeting()}
          </p>
          <div className="grid grid-cols-3 gap-2">
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
                    openFastDubiePicker();
                    return;
                  }
                  setShowForm(b.type);
                }}
                onPointerDown={() => setPressedBtn(b.type)}
                onPointerUp={() => setPressedBtn(null)}
                onPointerLeave={() => setPressedBtn(null)}
                onPointerCancel={() => setPressedBtn(null)}
                className="min-w-0 py-2 text-center transition-all min-h-[52px]"
                style={{
                  background: b.bg,
                  borderRadius: 'var(--radius-md)',
                  boxShadow: pressed ? 'none' : `0 3px 0 ${b.shadow}`,
                  transform: pressed ? 'translateY(3px)' : 'none',
                }}
              >
                <div className="px-1 text-sm font-black leading-snug text-white font-sans">{b.sub}</div>
              </button>
            );
          })}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 py-3 pb-28">

        {activeTab === 'today' && (
          <div>

            <div className="overflow-hidden animate-elastic stagger-3" style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
              <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: P.borderLight }}>
                <h3 className="font-bold text-gray-700 text-sm font-sans">
                  {t.todaysEntries}
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5" style={{ background: 'rgba(27,67,50,0.08)', color: P.header, borderRadius: '6px' }}>
                    {todayTransactions.length}
                  </span>
                </h3>
                {(todayTransactions.length > 0 || todayLedgerTransactions.length > 0) && (
                  <button
                    onClick={handleShareReport}
                    className="p-1.5 rounded-full press-scale"
                    style={{ background: 'rgba(27,67,50,0.08)' }}
                    aria-label={t.shareReport}
                  >
                    <Share2 className="w-4 h-4" style={{ color: P.header }} />
                  </button>
                )}
              </div>

              {todayTransactions.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-2xl mb-2">🎤</p>
                  <p className="font-bold text-sm mb-0.5" style={{ color: '#374151' }}>{t.noSalesRecordedYet}</p>
                  <p className="text-xs" style={{ color: P.amber }}>
                    {t.recordFirstSalePrompt}
                  </p>
                </div>
              ) : (
                <>
                  <div className="divide-y" style={{ borderColor: P.borderLight }}>
                    {todayTransactions.map(tx => {
                      const timeStr = new Date(tx.created_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div key={tx.id}
                          className="px-3 py-2 flex items-center border-l-3 relative"
                          style={{ borderLeftColor: typeBorderColor[tx.type] }}>
                          <span className="text-lg mr-2 flex-shrink-0">{typeEmoji[tx.type]}</span>
                          <button
                            className="flex-1 min-w-0 text-left"
                            onClick={() => setEditTarget(tx)}
                          >
                            <div className="flex items-center gap-1">
                              <span className="font-semibold text-gray-800 text-sm truncate">{tx.item_name}</span>
                              {tx.updated_at && <span className="text-[10px]" style={{ color: P.amber }}>{t.edited}</span>}
                            </div>
                            <span className="text-[10px] text-gray-400">
                              {timeStr}
                              {tx.quantity > 1 ? ` · ×${tx.quantity}` : ''}
                              {tx.payment_type && tx.payment_type !== 'cash' ? ` · ${[tx.payment_type, tx.payment_provider].filter(Boolean).join(' · ')}` : ''}
                            </span>
                          </button>
                          <div className="text-right mr-1 flex-shrink-0">
                            <div className="font-bold text-sm" style={{ color: typeColor[tx.type] }}>
                              {tx.type === 'expense' ? '-' : (tx.type === 'sale' ? '+' : '')}{fmt(tx.amount || 0)}
                            </div>
                            {tx.profit !== null && tx.profit !== undefined && (
                              <div className={`text-[10px] ${tx.profit >= 0 ? 'text-green-600' : 'text-red-400'}`}>
                                {tx.profit >= 0 ? '+' : ''}{fmt(tx.profit)}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0 relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setOpenKebabId(openKebabId === tx.id ? null : tx.id); }}
                              className="p-1.5 flex items-center justify-center press-scale"
                              style={{ minWidth: '32px', minHeight: '32px', borderRadius: '8px' }}
                              aria-label="Options"
                            >
                              <MoreVertical className="w-4 h-4" style={{ color: '#9ca3af' }} />
                            </button>
                            {openKebabId === tx.id && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setOpenKebabId(null)} />
                                <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border overflow-hidden" style={{ borderColor: P.border, minWidth: '120px' }}>
                                  <button
                                    onClick={() => { setEditTarget(tx); setOpenKebabId(null); }}
                                    className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-2 hover:bg-gray-50 press-scale"
                                  >
                                    <Pencil className="w-3.5 h-3.5" style={{ color: P.amber }} />
                                    {t.editEntry}
                                  </button>
                                  <button
                                    onClick={() => { setDeleteTarget(tx); setOpenKebabId(null); }}
                                    className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-2 hover:bg-gray-50 press-scale text-red-600"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t.deleteEntryLabel}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="px-4 py-3 border-t" style={{ borderColor: P.borderLight }}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">{t.totalSales}</span>
                      <span className="text-sm font-medium text-gray-800">{fmt(todaySalesTotal)} {t.birr}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-gray-500">{t.totalExpenses}</span>
                      <span className="text-sm font-medium text-red-500">-{fmt(todayExpensesTotal)} {t.birr}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t" style={{ borderColor: P.borderLight }}>
                      <span className="text-xs font-bold text-gray-600">{t.netReceived || 'Net Received'}</span>
                      <span className={`text-lg font-black ${(todaySalesTotal + (todayLedgerTransactions || []).filter(x => x.type === 'payment').reduce((s, x) => s + (x.amount || 0), 0) - todayExpensesTotal) >= 0 ? 'text-green-700' : 'text-red-500'}`}>
                        {fmt(todaySalesTotal + (todayLedgerTransactions || []).filter(x => x.type === 'payment').reduce((s, x) => s + (x.amount || 0), 0) - todayExpensesTotal)} {t.birr}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'merro' && (
          <DubiePage
            customerSummaries={customerSummaries}
            selectedCustomerId={selectedCustomerId}
            onSelectCustomer={(customer) => setSelectedCustomerId(customer.id)}
            onBackToCustomerList={() => setSelectedCustomerId(null)}
            onAddCredit={() => selectedCustomer && setCustomerTransactionModal({
              mode: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
              customerId: selectedCustomer.id,
            })}
            onRecordPayment={() => selectedCustomer && setCustomerTransactionModal({
              mode: CUSTOMER_TRANSACTION_TYPES.PAYMENT,
              customerId: selectedCustomer.id,
            })}
            onToggleTelegramNotify={() => selectedCustomer && handleToggleCustomerTelegramNotify(selectedCustomer)}
            onOpenTelegramConnect={() => selectedCustomer && setTelegramConnectCustomerId(selectedCustomer.id)}
            onResendTelegramUpdate={() => selectedCustomer && handleResendCustomerTelegramUpdate(selectedCustomer)}
            onEditCustomerTransaction={setCustomerTransactionEditTarget}
            supplierSummaries={supplierSummaries}
            onSaveSupplier={handleSaveSupplier}
            onSaveSupplierTransaction={handleSaveSupplierTransaction}
            onUpdateSupplierTransaction={handleUpdateSupplierTransaction}
            onDeleteSupplierTransaction={handleDeleteSupplierTransaction}
            shopName={shopProfile?.name}
            catalogEntries={activeCatalogEntries}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            transactions={transactions}
            ledgerTransactions={ledgerTransactions}
            onEdit={setEditTarget}
            onShareReport={handleHistoryShareReport}
            shopName={shopProfile?.name}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            transactions={transactions}
            todayTransactions={todayTransactions}
            customerSummaries={customerSummaries}
            catalogEntries={catalogEntries}
            supplierSummaries={supplierSummaries}
            shopProfile={shopProfile}
            onProfileSave={handleProfileSave}
            enabledProviders={enabledProviders}
            onProvidersChange={setEnabledProviders}
            recurringExpenses={recurringExpenses}
            onRecurringChange={setRecurringExpenses}
            usageStats={usageStats}
            earnedBadges={earnedBadges}
            onSaveCatalogEntry={handleSaveCatalogEntry}
            onToggleCatalogEntryActive={handleToggleCatalogEntryActive}
            onSaveSupplier={handleSaveSupplier}
            onSaveSupplierTransaction={handleSaveSupplierTransaction}
            onUpdateSupplierTransaction={handleUpdateSupplierTransaction}
            onDeleteSupplierTransaction={handleDeleteSupplierTransaction}
            pwa={pwa}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 border-t"
        style={{ background: '#fff', borderColor: P.border }}>
        {activeTab === 'today' && (
          <div className="flex items-center justify-between px-4 py-1.5 border-b" style={{ borderColor: P.border, background: 'rgba(27,67,50,0.03)' }}>
            <div className="text-center flex-1">
              <div className="text-[10px] font-semibold" style={{ color: '#6b7280' }}>{t.sales}</div>
              <div className="font-black text-sm" style={{ color: '#2d6a4f' }}>{fmt(todaySalesTotal)} {t.birr}</div>
            </div>
            <div className="text-center flex-1 border-x mx-2" style={{ borderColor: P.border }}>
              <div className="text-[10px] font-semibold" style={{ color: '#6b7280' }}>{t.spent}</div>
              <div className="font-black text-sm" style={{ color: '#D4654A' }}>{fmt(todayExpensesTotal)} {t.birr}</div>
            </div>
            <div className="text-center flex-1">
              <div className="text-[10px] font-semibold" style={{ color: '#6b7280' }}>{t.netReceived || 'Net'}</div>
              <div className="font-black text-sm" style={{ color: todaySalesTotal - todayExpensesTotal >= 0 ? '#2d6a4f' : '#D4654A' }}>{fmt(todaySalesTotal - todayExpensesTotal)} {t.birr}</div>
            </div>
          </div>
        )}
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
        <TransactionForm
          type={showForm}
          onSave={handleAddTransaction}
          onDone={() => setShowForm(null)}
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
          customerSuggestions={showForm === 'sale' ? customerSummaries : []}
        />
      )}

      {showCustomerForm && (
        <CustomerForm
          onSave={handleAddCustomer}
          onDone={() => setShowCustomerForm(false)}
        />
      )}

      {showFastDubiePicker && (
        <FastDubieCustomerPicker
          customers={customerSummaries}
          onSelectCustomer={handleSelectFastDubieCustomer}
          onNewCustomer={openNewDubieCustomerFlow}
          onDone={() => setShowFastDubiePicker(false)}
        />
      )}

      {messageReadyModal && (
        <CustomerMessageReady
          customer={customerSummaries.find(c => c.id === messageReadyModal.customerId)}
          shopName={shopProfile?.name}
          type={messageReadyModal.type}
          amount={messageReadyModal.amount}
          itemNote={messageReadyModal.itemNote}
          dueDate={messageReadyModal.dueDate}
          balance={(() => {
            const c = customerSummaries.find(c => c.id === messageReadyModal.customerId);
            return c?.balance || 0;
          })()}
          onDone={() => setMessageReadyModal(null)}
        />
      )}

      {customerTransactionModal && activeCustomerTransactionModal && (
        <CustomerTransactionSheet
          customer={activeCustomerTransactionModal}
          mode={customerTransactionModal.mode}
          onSave={handleSaveCustomerTransaction}
          catalogEntries={activeCatalogEntries}
          onDone={() => setCustomerTransactionModal(null)}
        />
      )}

      {customerTransactionEditTarget && selectedCustomer && (
        <CustomerTransactionSheet
          customer={selectedCustomer}
          existingTransaction={customerTransactionEditTarget}
          onUpdate={handleUpdateCustomerTransaction}
          catalogEntries={activeCatalogEntries}
          onDone={() => setCustomerTransactionEditTarget(null)}
        />
      )}

      {telegramConnectCustomer && (
        <CustomerTelegramConnectSheet
          customer={telegramConnectCustomer}
          shopProfile={shopProfile}
          onSave={(payload) => handleConfirmCustomerTelegramConnection(telegramConnectCustomer, payload)}
          onResendUpdate={() => handleResendCustomerTelegramUpdate(telegramConnectCustomer)}
          onDone={() => setTelegramConnectCustomerId(null)}
        />
      )}

      {voiceStep === 'record' && (
        <VoiceRecordScreen
          onTranscript={(transcript, detectedTotal, confidence, draft, provider) => {
            const newItem = { transcript, detectedTotal, draft };
            const updatedItems = [...voiceItems, newItem];
            setVoiceItems(updatedItems);
            setVoiceTranscript(transcript);
            setVoiceDetectedTotal(detectedTotal);
            setVoiceConfidence(confidence ?? null);
            setVoiceDraft(draft ?? null);
            setVoiceProvider(provider ?? null);
            setVoiceStep('result');
          }}
          onTypeInstead={() => { setVoiceStep(null); setVoiceItems([]); setVoiceConfidence(null); setVoiceDraft(null); setVoiceProvider(null); setShowForm('sale'); }}
        />
      )}

      {voiceStep === 'result' && (
        <VoiceResultScreen
          transcript={voiceTranscript}
          detectedTotal={voiceDetectedTotal}
          items={voiceItems}
          draft={mergedVoiceDraft}
          onSave={handleVoiceSave}
          onFix={() => setVoiceStep('fix')}
          onAddAnother={() => setVoiceStep('record')}
          onReRecord={() => { setVoiceTranscript(''); setVoiceDetectedTotal(null); setVoiceItems([]); setVoiceConfidence(null); setVoiceDraft(null); setVoiceProvider(null); setVoiceStep('record'); }}
          onTypeInstead={() => { setVoiceStep(null); setVoiceItems([]); setVoiceConfidence(null); setVoiceDraft(null); setVoiceProvider(null); setShowForm('sale'); }}
        />
      )}

      {voiceStep === 'fix' && (
        <VoiceFixScreen
          transcript={voiceTranscript}
          detectedTotal={voiceDetectedTotal}
          items={voiceItems}
          draft={mergedVoiceDraft}
          onSave={(data) => handleVoiceSave({ ...data, wasEdited: true })}
          onCancel={() => setVoiceStep('result')}
          enabledProviders={enabledProviders}
          customerSuggestions={customerSummaries}
        />
      )}

      {editTarget && (
        <EditTransactionSheet
          transaction={editTarget}
          enabledProviders={enabledProviders}
          onUpdate={handleUpdateTransaction}
          onClose={() => setEditTarget(null)}
        />
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
          <div className="bg-white p-6 w-full max-w-sm animate-elastic" style={{ borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="text-3xl text-center mb-3">{typeEmoji[deleteTarget.type]}</div>
            <h3 className="text-lg font-black text-gray-900 text-center mb-1 font-sans">{t.deleteEntry}</h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              "{deleteTarget.item_name}" · {fmt(deleteTarget.amount || 0)} {t.birr}
            </p>
            <div className="space-y-2">
              <button onClick={() => handleDeleteTransaction(deleteTarget.id)}
                className="w-full p-4 bg-red-500 text-white font-black min-h-[52px] press-scale"
                style={{ borderRadius: 'var(--radius-md)' }}>
                {t.delete}
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="w-full p-4 font-bold min-h-[52px] press-scale"
                style={{ background: '#f5f5f5', color: '#374151', borderRadius: 'var(--radius-md)' }}>
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
      <PrivacyProvider>
        <AppInner />
      </PrivacyProvider>
    </LangProvider>
  );
}

export default App;
