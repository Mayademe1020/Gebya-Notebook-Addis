import { useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, Users, Calendar, Settings, Trash2, Pencil, Share2, X } from 'lucide-react';
import db from './db';
import { PrivacyProvider, usePrivacy } from './context/PrivacyContext';
import { LangProvider, useLang } from './context/LangContext';
import ProfitCard from './components/ProfitCard';
import TransactionForm from './components/TransactionForm';
import EditTransactionSheet from './components/EditTransactionSheet';
import CustomerList from './components/CustomerList';
import CustomerDetail from './components/CustomerDetail';
import CustomerForm from './components/CustomerForm';
import CustomerTransactionSheet from './components/CustomerTransactionSheet';
import HistoryView from './components/HistoryView';
import SettingsPage from './components/SettingsPage';
import OnboardingScreen from './components/OnboardingScreen';
import IntroSlides from './components/IntroSlides';
import DailySuggestions from './components/DailySuggestions';
import { ToastContainer, fireToast } from './components/Toast';
import { DEFAULT_PROVIDERS } from './components/PaymentTypeChips';
import VoiceRecordScreen from './components/VoiceRecordScreen';
import VoiceResultScreen from './components/VoiceResultScreen';
import VoiceFixScreen from './components/VoiceFixScreen';
import { getCurrentEthiopianDate, formatEthiopian } from './utils/ethiopianCalendar';
import { fmt } from './utils/numformat';
import { checkAndAwardBadges } from './utils/badges';
import { buildCustomerSummaries, getCustomerBalance } from './utils/customerLedger';
import { CUSTOMER_TRANSACTION_TYPES, isValidCustomerTransactionType } from './utils/customerTransactionTypes';

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
  const [transactions, setTransactions] = useState([]);
  const [ledgerCustomers, setLedgerCustomers] = useState([]);
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('today');
  const [showForm, setShowForm] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
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
  const [showIntro, setShowIntro] = useState(false);
  const [pressedBtn, setPressedBtn] = useState(null);
  const [voiceStep, setVoiceStep] = useState(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceDetectedTotal, setVoiceDetectedTotal] = useState(null);
  const [voiceItems, setVoiceItems] = useState([]);
  const [voiceConfidence, setVoiceConfidence] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [txns, customerRows, customerTxRows, nameRow, phoneRow, epRow, reRow, telegramRow, introRow] = await Promise.all([
        db.transactions.toArray(),
        db.customers.toArray(),
        db.customer_transactions.toArray(),
        db.settings.get('shop_name'),
        db.settings.get('shop_phone'),
        db.settings.get('enabled_payment_methods'),
        db.settings.get('recurring_expenses'),
        db.settings.get('shop_telegram'),
        db.settings.get('intro_seen'),
      ]);
      txns.sort((a, b) => b.created_at - a.created_at);
      setTransactions(txns);
      setLedgerCustomers(customerRows);
      setLedgerTransactions(customerTxRows);
      const hasName = !!nameRow?.value;
      setShopProfile({
        name: nameRow?.value || null,
        phone: phoneRow?.value || '',
        telegram: telegramRow?.value || '',
      });
      if (!hasName && !introRow?.value) {
        setShowIntro(true);
      }
      try { setEnabledProviders(epRow ? JSON.parse(epRow.value) : DEFAULT_PROVIDERS); } catch { setEnabledProviders(DEFAULT_PROVIDERS); }
      try { setRecurringExpenses(reRow ? JSON.parse(reRow.value) : []); } catch { setRecurringExpenses([]); }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load data:', err);
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
      const now = new Date(transaction.created_at);
      const newTxn = {
        ...transaction,
        ethiopian_date: formatEthiopian(now),
        customer_name: null,
      };

      const id = await db.transactions.add(newTxn);
      const saved = await db.transactions.get(id);

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

      const toastMsg = { sale: t.saleSaved, expense: t.expenseSaved }[transaction.type] || '✓';
      fireToast(toastMsg, 4000, async () => {
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

  const handleVoiceSave = async ({ amount, note, paymentType = 'cash', paymentProvider = '', wasEdited = false }) => {
    const now = Date.now();
    const hasMultiple = voiceItems.length > 1;
    const combinedTranscript = hasMultiple
      ? voiceItems.map(it => it.transcript).join(' | ')
      : (voiceTranscript || null);
    const savedDetectedTotal = hasMultiple
      ? voiceItems.reduce((sum, it) => sum + (it.detectedTotal || 0), 0)
      : (voiceDetectedTotal ?? null);

    const transaction = {
      type: 'sale',
      item_name: note || 'Voice sale',
      quantity: 1,
      amount,
      cost_price: 0,
      profit: null,
      is_credit: false,
      customer_phone: null,
      due_date: null,
      payment_type: paymentType,
      payment_provider: paymentType !== 'cash' ? paymentProvider || null : null,
      direction: null,
      source: 'voice',
      raw_transcript: combinedTranscript,
      detected_total: savedDetectedTotal,
      was_edited: wasEdited || false,
      transcription_provider: null,
      parsing_confidence: hasMultiple ? null : (voiceConfidence ?? null),
      voice_note: note || null,
      raw_audio_ref: null,
      created_at: now,
    };
    await handleAddTransaction(transaction);
    setVoiceStep(null);
    setVoiceTranscript('');
    setVoiceDetectedTotal(null);
    setVoiceItems([]);
    setVoiceConfidence(null);
  };

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
      setTransactions(prev => prev.filter(t2 => t2.id !== id));
      setDeleteTarget(null);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to delete:', err);
    }
  };

  const handleProfileSave = async (name, phone, telegram) => {
    await db.settings.put({ key: 'shop_name', value: name });
    await db.settings.put({ key: 'shop_phone', value: phone });
    await db.settings.put({ key: 'shop_telegram', value: telegram || '' });
    setShopProfile({ name, phone, telegram: telegram || '' });
  };

  const customerSummaries = useMemo(
    () => buildCustomerSummaries(ledgerCustomers, ledgerTransactions),
    [ledgerCustomers, ledgerTransactions]
  );

  const selectedCustomer = useMemo(
    () => customerSummaries.find(c => c.id === selectedCustomerId) || null,
    [customerSummaries, selectedCustomerId]
  );

  const handleAddCustomer = async (payload) => {
    const now = Date.now();
    const id = await db.customers.add({
      display_name: payload.display_name,
      note: payload.note || null,
      phone_number: payload.phone_number || null,
      telegram_username: payload.telegram_username || null,
      telegram_chat_id: null,
      created_at: now,
      updated_at: now,
    });
    const saved = await db.customers.get(id);
    setLedgerCustomers(prev => [...prev, saved]);
    setShowCustomerForm(false);
    setSelectedCustomerId(id);
    setActiveTab('merro');
    fireToast('Customer saved', 1800);
  };

  const handleSaveCustomerTransaction = async (payload) => {
    if (!isValidCustomerTransactionType(payload.type)) return;
    const now = Date.now();
    const entry = {
      customer_id: payload.customer_id,
      type: payload.type,
      amount: payload.amount,
      item_note: payload.item_note || null,
      due_date: payload.due_date || null,
      created_at: now,
      updated_at: now,
    };

    const id = await db.customer_transactions.add(entry);
    const saved = await db.customer_transactions.get(id);

    setLedgerTransactions(prev => [saved, ...prev]);
    await db.customers.update(payload.customer_id, { updated_at: now });
    setLedgerCustomers(prev => prev.map(c => c.id === payload.customer_id ? { ...c, updated_at: now } : c));
    setCustomerTransactionModal(null);

    if (payload.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD) {
      try {
        const fcRow = await db.analytics.get('feature_counts');
        let fc = { sales: 0, expenses: 0, credits: 0 };
        try { fc = fcRow ? JSON.parse(fcRow.value) : fc; } catch { /* keep default */ }
        fc.credits = (fc.credits || 0) + 1;
        await db.analytics.put({ key: 'feature_counts', value: JSON.stringify(fc) });
        setUsageStats(prev => prev ? { ...prev, featureCounts: fc } : prev);
      } catch { /* non-critical */ }
    }

    const customer = ledgerCustomers.find(c => c.id === payload.customer_id);
    if (customer?.telegram_username) {
      const nextCustomerTx = [saved, ...ledgerTransactions].filter(tx => tx.customer_id === payload.customer_id);
      const nextBalance = getCustomerBalance(nextCustomerTx);
      const txText = payload.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT ? 'Payment' : 'Credit';
      const message = `${txText}: ${fmt(payload.amount)} birr\nBalance: ${fmt(nextBalance)} birr`;
      if (window.confirm('Notify customer on Telegram?')) {
        const handle = customer.telegram_username.startsWith('@') ? customer.telegram_username.slice(1) : customer.telegram_username;
        window.open(`https://t.me/${handle}?text=${encodeURIComponent(message)}`, '_blank');
      }
    }
  };

  const todayDateStr = new Date().toDateString();

  const todayTransactions = useMemo(
    () => transactions.filter(t2 => new Date(t2.created_at).toDateString() === todayDateStr),
    [transactions, todayDateStr]
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
      `💰 ${t.sales}:    ${fmt(todaySalesTotal)} ${t.birr}`,
      `🛒 ${t.spent}: ${fmt(todayExpensesTotal)} ${t.birr}`,
      `📈 ${t.calcProfit}:   ${fmt(profit)} ${t.birr}`,
      ``,
      `🏆 ${t.shareTopItems}:`,
      topStr,
      ``,
      t.shareSentVia,
    ].join('\n');
  };

  const handleShareReport = () => {
    setShareText(buildShareSummary());
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

  if (showIntro) {
    return (
      <IntroSlides onDone={() => setShowIntro(false)} />
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
    { id: 'settings', label: t.settings,                     icon: Settings },
  ];

  const typeEmoji = { sale: '💰', expense: '🛒', credit: '👥' };
  const typeColor = { sale: '#15803d', expense: '#dc2626', credit: '#C4883A' };
  const typeBorderColor = { sale: '#86efac', expense: '#fca5a5', credit: '#fcd34d' };

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto relative" style={{ background: P.bg }}>

      <header className="flex-shrink-0 px-4 pt-9 pb-3 texture-noise" style={{ background: P.header }}>
        <div className="flex items-center gap-3 mb-3">
          {/* Avatar — taps to settings */}
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
              ገበያ · {getCurrentEthiopianDate()} · {new Date().toLocaleDateString('en', { day: 'numeric', month: 'short' })}
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
              🔥 {usageStats.streak}
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
            }}>አማ</span>
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
            {lang === 'am' ? 'ይናገሩ — ቆይቶ ማስተካከል ይቻላል' : 'Speak your sale — you can fix it after'}
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

            <DailySuggestions
              todayTransactions={todayTransactions}
              streak={usageStats?.streak || 1}
              onAction={(type) => setShowForm(type)}
            />


            <div className="overflow-hidden animate-elastic stagger-3" style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
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
                  <p className="text-4xl mb-3">🎤</p>
                  <p className="font-bold text-base mb-1" style={{ color: '#374151' }}>No sales recorded yet</p>
                  <p className="text-sm font-semibold" style={{ color: P.amber }}>
                    ↑ Tap above to record your first sale
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
                        {tx.quantity > 1 && <span className="text-xs text-gray-400">×{tx.quantity}</span>}
                        {tx.payment_type && tx.payment_type !== 'cash' && (
                          <span className="text-xs text-gray-400 block">
                            {[tx.payment_type, tx.payment_provider].filter(Boolean).join(' · ')}
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
            <CustomerDetail
              customer={selectedCustomer}
              onBack={() => setSelectedCustomerId(null)}
              onAddCredit={() => setCustomerTransactionModal({
                mode: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
                customer: selectedCustomer,
              })}
              onRecordPayment={() => setCustomerTransactionModal({
                mode: CUSTOMER_TRANSACTION_TYPES.PAYMENT,
                customer: selectedCustomer,
              })}
            />
          ) : (
            <CustomerList
              customers={customerSummaries}
              onSelectCustomer={(customer) => setSelectedCustomerId(customer.id)}
              onAddCustomer={() => setShowCustomerForm(true)}
            />
          )
        )}

        {activeTab === 'history' && (
          <HistoryView
            transactions={transactions}
            onEdit={setEditTarget}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            transactions={transactions}
            todayTransactions={todayTransactions}
            customerSummaries={customerSummaries}
            shopProfile={shopProfile}
            onProfileSave={handleProfileSave}
            enabledProviders={enabledProviders}
            onProvidersChange={setEnabledProviders}
            recurringExpenses={recurringExpenses}
            onRecurringChange={setRecurringExpenses}
            usageStats={usageStats}
            earnedBadges={earnedBadges}
            onShareToday={handleShareReport}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 border-t"
        style={{ background: '#fff', borderColor: P.border }}>
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
          recurringExpenses={recurringExpenses}
          onRecurringChange={setRecurringExpenses}
          initialPaymentType={(showForm === 'sale' || showForm === 'expense') ? lastPayment[showForm]?.type : undefined}
          initialPaymentProvider={(showForm === 'sale' || showForm === 'expense') ? lastPayment[showForm]?.provider : undefined}
          lastPaymentHistory={(showForm === 'sale' || showForm === 'expense') ? {
            bank:   lastPayment[showForm]?.bankProvider   || '',
            wallet: lastPayment[showForm]?.walletProvider || '',
          } : undefined}
        />
      )}

      {showCustomerForm && (
        <CustomerForm
          onSave={handleAddCustomer}
          onDone={() => setShowCustomerForm(false)}
        />
      )}

      {customerTransactionModal && (
        <CustomerTransactionSheet
          customer={customerTransactionModal.customer}
          mode={customerTransactionModal.mode}
          onSave={handleSaveCustomerTransaction}
          onDone={() => setCustomerTransactionModal(null)}
        />
      )}

      {voiceStep === 'record' && (
        <VoiceRecordScreen
          onTranscript={(transcript, detectedTotal, confidence) => {
            const newItem = { transcript, detectedTotal };
            const updatedItems = [...voiceItems, newItem];
            setVoiceItems(updatedItems);
            setVoiceTranscript(transcript);
            setVoiceDetectedTotal(detectedTotal);
            setVoiceConfidence(confidence ?? null);
            setVoiceStep('result');
          }}
          onTypeInstead={() => { setVoiceStep(null); setVoiceItems([]); setVoiceConfidence(null); setShowForm('sale'); }}
        />
      )}

      {voiceStep === 'result' && (
        <VoiceResultScreen
          transcript={voiceTranscript}
          detectedTotal={voiceDetectedTotal}
          items={voiceItems}
          onSave={handleVoiceSave}
          onFix={() => setVoiceStep('fix')}
          onAddAnother={() => setVoiceStep('record')}
          onReRecord={() => { setVoiceTranscript(''); setVoiceDetectedTotal(null); setVoiceItems([]); setVoiceConfidence(null); setVoiceStep('record'); }}
          onTypeInstead={() => { setVoiceStep(null); setVoiceItems([]); setVoiceConfidence(null); setShowForm('sale'); }}
        />
      )}

      {voiceStep === 'fix' && (
        <VoiceFixScreen
          transcript={voiceTranscript}
          detectedTotal={voiceDetectedTotal}
          items={voiceItems}
          onSave={(data) => handleVoiceSave({ ...data, wasEdited: true })}
          onCancel={() => setVoiceStep('result')}
          enabledProviders={enabledProviders}
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
