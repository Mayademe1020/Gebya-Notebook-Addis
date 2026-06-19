import { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, CreditCard, BarChart3, MoreHorizontal, Settings, Plus, Minus, RotateCw } from 'lucide-react';
import { PrivacyProvider } from './context/PrivacyContext';
import { LangProvider, useLang } from './context/LangContext';
import { ThemeProvider } from './context/ThemeContext';
import { useAppStore } from './stores/appStore';
import { useAuthStore } from './stores/authStore';
import { useShopStore } from './stores/shopStore';
import { useTransactions } from './hooks/useTransactions';
import { useCustomers } from './hooks/useCustomers';
import { useSuppliers } from './hooks/useSuppliers';
import { useCatalog } from './hooks/useCatalog';
import { useStaff } from './hooks/useStaff';
import { usePwaInstall } from './hooks/usePwaInstall';
import db from './db';
import { ToastContainer, fireToast } from './components/Toast';
import OnboardingScreen from './components/OnboardingScreen';
import AuthGate from './components/AuthGate';
import OfflineStatusStrip from './components/OfflineStatusStrip';
import { PanelFallback } from './components/Fallbacks';
import TodayTab from './components/TodayTab';
import CreditTab from './components/CreditTab';
import HistoryTab from './components/HistoryTab';
import GlobalModals from './components/GlobalModals';
import { SettingsPage, importCustomerList, importSupplierList, importReportView, importSettingsPage, VOICE_ENABLED } from './utils/lazyImports';
import { fmt } from './utils/numformat';
import { buildCreditMetrics } from './utils/customerMetrics';
import { resolveActorSnapshot, getActorDisplayLabel } from './utils/staffMembers';
import { initSyncEngine, getAuthToken, getSyncEngine, clearAuthToken } from './utils/syncEngine';
import { countPendingTelegramSync, drainTelegramSyncQueue } from './utils/syncQueue';
import { isBrowserOnline } from './utils/browser';
import { buildDefaultChannels, migrateLegacyToChannels, deriveLegacyFromChannels, normalizeChannelsForSave } from './utils/paymentChannels';
import { sortCustomerTransactions } from './utils/customerLedger';

const P = { bg: 'var(--color-bg)' };

const DEFAULT_PROVIDERS = { banks: ['CBE', 'Dashen', 'Awash', 'Abyssinia'], wallets: ['telebirr', 'CBE Birr'] };
const OWNER_ALERT_THRESHOLD_SETTING_KEY = 'owner_alert_threshold_amount';
const DEFAULT_OWNER_ALERT_THRESHOLD_AMOUNT = 1000;

function normalizeOwnerAlertThreshold(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_OWNER_ALERT_THRESHOLD_AMOUNT;
}

function runAfterFirstPaint(cb) {
  if (typeof window === 'undefined') return () => {};
  let cancelled = false;
  let id = null;
  const run = () => { if (!cancelled) cb(); };
  if ('requestIdleCallback' in window) { id = window.requestIdleCallback(run, { timeout: 2500 }); }
  else { id = window.setTimeout(run, 1200); }
  return () => {
    cancelled = true;
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(id);
    else window.clearTimeout(id);
  };
}


function AppInner() {
  const { lang, toggleLang, t } = useLang();
  const pwa = usePwaInstall();

  // Feature hooks
  const { transactions, setTransactions, lastSavedSnapshot, rememberLastSave, clearLastSavedSnapshot, addTransaction, updateTransaction, deleteTransaction } = useTransactions();
  const { ledgerCustomers, setLedgerCustomers, ledgerTransactions, setLedgerTransactions, customerSummaries, enrichedCustomerSummaries, addCustomer, addCustomerInline, updateCustomerRecord, toggleCustomerTelegramNotify, confirmTelegramConnection, resendTelegramUpdate, markReminderSent, saveCustomerTransaction, deleteCustomerTransaction } = useCustomers();
  const { suppliers, setSuppliers, supplierTransactions, setSupplierTransactions, supplierSummaries, saveSupplier, saveSupplierTransaction, updateSupplierTransaction, deleteSupplierTransaction } = useSuppliers();
  const { catalogEntries, setCatalogEntries, activeCatalogEntries, saveCatalogEntry, toggleCatalogEntryActive } = useCatalog();
  const { staffMembers, activeStaffMemberId, setActive: handleSetActiveStaffMember, add: handleSaveStaffMember, update: handleUpdateStaffMember, deactivate: handleDeactivateStaffMember, reactivate: handleReactivateStaffMember } = useStaff();

  // Global UI state
  const activeTab = useAppStore(s => s.activeTab);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const loading = useAppStore(s => s.loading);
  const setLoading = useAppStore(s => s.setLoading);
  const showForm = useAppStore(s => s.showForm);
  const setShowForm = useAppStore(s => s.setShowForm);
  const selectedCustomerId = useAppStore(s => s.selectedCustomerId);
  const setSelectedCustomerId = useAppStore(s => s.setSelectedCustomerId);
  const showCustomerForm = useAppStore(s => s.showCustomerForm);
  const setShowCustomerForm = useAppStore(s => s.setShowCustomerForm);
  const customerTransactionModal = useAppStore(s => s.customerTransactionModal);
  const setCustomerTransactionModal = useAppStore(s => s.setCustomerTransactionModal);
  const customerTransactionEditTarget = useAppStore(s => s.customerTransactionEditTarget);
  const showSupplierForm = useAppStore(s => s.showSupplierForm);
  const supplierEditTarget = useAppStore(s => s.supplierEditTarget);
  const supplierTransactionModal = useAppStore(s => s.supplierTransactionModal);
  const supplierTransactionEditTarget = useAppStore(s => s.supplierTransactionEditTarget);
  const customerEditTarget = useAppStore(s => s.customerEditTarget);
  const pressedBtn = useAppStore(s => s.pressedBtn);
  const setPressedBtn = useAppStore(s => s.setPressedBtn);
  const pendingTelegramCount = useAppStore(s => s.pendingTelegramCount);
  const setPendingTelegramCount = useAppStore(s => s.setPendingTelegramCount);
  const retryingTelegram = useAppStore(s => s.retryingTelegram);
  const setRetryingTelegram = useAppStore(s => s.setRetryingTelegram);
  const lastBackupAt = useAppStore(s => s.lastBackupAt);
  const setLastBackupAt = useAppStore(s => s.setLastBackupAt);
  const setCreditView = useAppStore(s => s.setCreditView);
  const setShowShareModal = useAppStore(s => s.setShowShareModal);
  const setShareText = useAppStore(s => s.setShareText);
  const setDeleteTarget = useAppStore(s => s.setDeleteTarget);
  const deleteTarget = useAppStore(s => s.deleteTarget);

  // Auth
  const authUser = useAuthStore(s => s.user);
  const authChecked = useAuthStore(s => s.checked);
  const setAuthUser = useAuthStore(s => s.setUser);

  // Shop
  const shopProfile = useShopStore(s => s.shopProfile);
  const setShopProfile = useShopStore(s => s.setShopProfile);
  const ownerAlertSettings = useShopStore(s => s.ownerAlertSettings);
  const setOwnerAlertSettings = useShopStore(s => s.setOwnerAlertSettings);
  const enabledProviders = useShopStore(s => s.enabledProviders);
  const setEnabledProviders = useShopStore(s => s.setEnabledProviders);
  const recurringExpenses = useShopStore(s => s.recurringExpenses);
  const setRecurringExpenses = useShopStore(s => s.setRecurringExpenses);
  const customQuickAmounts = useShopStore(s => s.customQuickAmounts);
  const setCustomQuickAmounts = useShopStore(s => s.setCustomQuickAmounts);
  const lastPayment = useShopStore(s => s.lastPayment);
  const usageStats = useShopStore(s => s.usageStats);
  const setUsageStats = useShopStore(s => s.setUsageStats);

  const buildActorSnapshot = useCallback(() =>
    resolveActorSnapshot({ shopProfile, staffMembers, activeStaffMemberId }),
    [shopProfile, staffMembers, activeStaffMemberId]
  );
  const currentActorLabel = useMemo(() =>
    getActorDisplayLabel({ shopProfile, staffMembers, activeStaffMemberId }),
    [shopProfile, staffMembers, activeStaffMemberId]
  );

  // ── Load all persisted data on mount ──
  const loadData = useCallback(async () => {
    try {
      const [
        txns, customerRows, customerTxRows, catalogRows, supplierRows, supplierTxRows,
        nameRow, phoneRow, businessTypeRow, epRow, reRow, customQuickAmountsRow, telegramRow,
        snapshotRow, payTelebirrRow, payCbePhoneRow, payCbeAccountRow, payAwashPhoneRow,
        payBankNameRow, payBankAccountRow, paymentChannelsRow, customBanksRow, customWalletsRow,
        ownerAlertThresholdRow,
      ] = await Promise.all([
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
        db.settings.get('custom_quick_amounts'),
        db.settings.get('shop_telegram'),
        db.settings.get('last_saved_snapshot'),
        db.settings.get('shop_pay_telebirr'),
        db.settings.get('shop_pay_cbe_phone'),
        db.settings.get('shop_pay_cbe_account'),
        db.settings.get('shop_pay_awash_phone'),
        db.settings.get('shop_pay_bank_name'),
        db.settings.get('shop_pay_bank_account'),
        db.settings.get('shop_payment_channels'),
        db.settings.get('custom_banks'),
        db.settings.get('custom_wallets'),
        db.settings.get(OWNER_ALERT_THRESHOLD_SETTING_KEY),
      ]);

      let paymentChannels;
      if (paymentChannelsRow?.value) {
        try {
          const parsed = JSON.parse(paymentChannelsRow.value);
          paymentChannels = Array.isArray(parsed) && parsed.length > 0 ? parsed : buildDefaultChannels();
        } catch { paymentChannels = buildDefaultChannels(); }
      } else {
        const hasLegacy = !!(epRow?.value || payTelebirrRow?.value || payCbePhoneRow?.value || payCbeAccountRow?.value || payAwashPhoneRow?.value || payBankNameRow?.value || payBankAccountRow?.value || customBanksRow?.value || customWalletsRow?.value);
        paymentChannels = hasLegacy
          ? migrateLegacyToChannels({ enabledProvidersRaw: epRow?.value, customBanksRaw: customBanksRow?.value, customWalletsRaw: customWalletsRow?.value, payTelebirr: payTelebirrRow?.value, payCbePhone: payCbePhoneRow?.value, payCbeAccount: payCbeAccountRow?.value, payAwashPhone: payAwashPhoneRow?.value, payBankName: payBankNameRow?.value, payBankAccount: payBankAccountRow?.value })
          : buildDefaultChannels();
        try { await db.settings.put({ key: 'shop_payment_channels', value: JSON.stringify(paymentChannels) }); } catch { /* non-critical */ }
      }

      txns.sort((a, b) => b.created_at - a.created_at);
      setTransactions(txns);
      setLedgerCustomers(customerRows);
      setLedgerTransactions(sortCustomerTransactions(customerTxRows));
      setCatalogEntries(catalogRows || []);
      setSuppliers(supplierRows || []);
      setSupplierTransactions(supplierTxRows || []);
      setOwnerAlertSettings({ threshold_amount: normalizeOwnerAlertThreshold(ownerAlertThresholdRow?.value) });

      const derivedLegacy = deriveLegacyFromChannels(paymentChannels);
      setShopProfile({
        name: nameRow?.value || null,
        phone: phoneRow?.value || '',
        telegram: telegramRow?.value || '',
        businessType: businessTypeRow?.value || 'retail-shop',
        paymentChannels,
        payments: derivedLegacy.payments,
      });
      try { setEnabledProviders(derivedLegacy.enabledProviders || DEFAULT_PROVIDERS); } catch { setEnabledProviders(DEFAULT_PROVIDERS); }
      try { setRecurringExpenses(reRow ? JSON.parse(reRow.value) : []); } catch { setRecurringExpenses([]); }
      try {
        const arr = customQuickAmountsRow ? JSON.parse(customQuickAmountsRow.value) : [];
        setCustomQuickAmounts(Array.isArray(arr) ? arr.filter(n => typeof n === 'number' && n > 0) : []);
      } catch { setCustomQuickAmounts([]); }

      const hasSavedRecords = txns.length > 0 || customerTxRows.length > 0;
      if (!hasSavedRecords) {
        try { await db.settings.delete('last_saved_snapshot'); } catch { /* non-critical */ }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('loadData failed:', err);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);


  // Auth check on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) { if (!cancelled) setAuthUser(false); return; }
        const { getCurrentUser } = await import('./utils/authClient');
        const user = await getCurrentUser(token);
        if (!cancelled) setAuthUser(user);
      } catch { await clearAuthToken(); if (!cancelled) setAuthUser(false); }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync engine init
  useEffect(() => {
    initSyncEngine().catch(() => {});
  }, []);

  // Preload tabs after first paint
  useEffect(() => {
    if (loading) return;
    return runAfterFirstPaint(() => {
      [importCustomerList, importSupplierList, importReportView, importSettingsPage]
        .forEach(fn => fn().catch(() => {}));
    });
  }, [loading]);

  // Last backup timestamp
  useEffect(() => {
    let cancelled = false;
    db.settings.get('gebya_last_backup_at').then(row => {
      if (!cancelled) setLastBackupAt(row?.value ? Number(row.value) : null);
    }).catch(() => { if (!cancelled) setLastBackupAt(null); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Telegram queue count
  const refreshPendingTelegramCount = useCallback(async () => {
    try { const n = await countPendingTelegramSync(); setPendingTelegramCount(n); return n; }
    catch { setPendingTelegramCount(0); return 0; }
  }, [setPendingTelegramCount]);

  const refreshQueuedTelegramRecords = useCallback(async () => {
    const result = await drainTelegramSyncQueue({ limit: 5 });
    if (result.records?.length) {
      setLedgerTransactions(prev => prev.map(e => result.records.find(r => r.id === e.id) || e));
    }
    await refreshPendingTelegramCount();
    return result;
  }, [refreshPendingTelegramCount, setLedgerTransactions]);

  useEffect(() => {
    if (loading) return;
    refreshPendingTelegramCount();
    const handle = () => refreshPendingTelegramCount();
    window.addEventListener('gebya:sync-queue-changed', handle);
    window.addEventListener('online', handle);
    return () => { window.removeEventListener('gebya:sync-queue-changed', handle); window.removeEventListener('online', handle); };
  }, [loading, refreshPendingTelegramCount]);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    if (isBrowserOnline()) runAfterFirstPaint(() => { if (!cancelled) refreshQueuedTelegramRecords().catch(() => {}); });
    const handleOnline = () => refreshQueuedTelegramRecords().catch(() => {});
    window.addEventListener('online', handleOnline);
    return () => { cancelled = true; window.removeEventListener('online', handleOnline); };
  }, [loading, refreshQueuedTelegramRecords]);

  const handleRetryQueuedTelegram = useCallback(async () => {
    if (retryingTelegram || !isBrowserOnline()) return;
    setRetryingTelegram(true);
    try {
      const result = await refreshQueuedTelegramRecords();
      const sent = result.records?.filter(r => r.telegram_delivery_state === 'bot_sent').length || 0;
      fireToast(sent > 0 ? `Telegram sent: ${sent}` : 'Telegram queue checked', 2200);
    } catch { fireToast('Telegram retry failed', 2600); }
    finally { setRetryingTelegram(false); }
  }, [retryingTelegram, setRetryingTelegram, refreshQueuedTelegramRecords]);

  // ── Profile / settings handlers (can't live in a hook — writes to db + shopProfile store) ──
  const handleProfileSave = useCallback(async (name, phone, telegram, businessType = 'retail-shop') => {
    await Promise.all([
      db.settings.put({ key: 'shop_name', value: name }),
      db.settings.put({ key: 'shop_phone', value: phone || '' }),
      db.settings.put({ key: 'shop_telegram', value: telegram || '' }),
      db.settings.put({ key: 'shop_business_type', value: businessType || 'retail-shop' }),
    ]);
    setShopProfile(prev => ({ ...prev, name, phone: phone || '', telegram: telegram || '', businessType: businessType || 'retail-shop', paymentChannels: prev?.paymentChannels, payments: prev?.payments }));
  }, [setShopProfile]);

  const handleSavePaymentChannels = useCallback(async (channels) => {
    const normalized = normalizeChannelsForSave(channels || []);
    const derived = deriveLegacyFromChannels(normalized);
    setShopProfile(prev => ({ ...prev, paymentChannels: normalized, payments: derived.payments }));
    setEnabledProviders(derived.enabledProviders || DEFAULT_PROVIDERS);
    try {
      await Promise.all([
        db.settings.put({ key: 'shop_payment_channels', value: JSON.stringify(normalized) }),
        db.settings.put({ key: 'enabled_payment_methods', value: JSON.stringify(derived.enabledProviders) }),
        db.settings.put({ key: 'custom_banks', value: JSON.stringify(derived.customBanks) }),
        db.settings.put({ key: 'custom_wallets', value: JSON.stringify(derived.customWallets) }),
        db.settings.put({ key: 'shop_pay_telebirr', value: derived.payments.telebirr }),
        db.settings.put({ key: 'shop_pay_cbe_phone', value: derived.payments.cbe_phone }),
        db.settings.put({ key: 'shop_pay_cbe_account', value: derived.payments.cbe_account }),
        db.settings.put({ key: 'shop_pay_awash_phone', value: derived.payments.awash_phone }),
        db.settings.put({ key: 'shop_pay_bank_name', value: derived.payments.bank_name }),
        db.settings.put({ key: 'shop_pay_bank_account', value: derived.payments.bank_account }),
      ]);
    } catch (err) { if (import.meta.env.DEV) console.error('Payment channels save failed:', err); }
  }, [setShopProfile, setEnabledProviders]);

  const handleSaveOwnerAlertSettings = useCallback(async (settings = {}) => {
    const amount = normalizeOwnerAlertThreshold(settings.threshold_amount);
    const next = { threshold_amount: amount };
    setOwnerAlertSettings(next);
    await db.settings.put({ key: OWNER_ALERT_THRESHOLD_SETTING_KEY, value: String(amount) });
    return next;
  }, [setOwnerAlertSettings]);

  const handleCustomQuickAmountsChange = useCallback(async (nextList) => {
    const clean = Array.from(new Set((nextList || []).filter(n => typeof n === 'number' && n > 0))).slice(-8);
    setCustomQuickAmounts(clean);
    try { await db.settings.put({ key: 'custom_quick_amounts', value: JSON.stringify(clean) }); } catch { /* non-critical */ }
  }, [setCustomQuickAmounts]);

  const handleDeleteTransaction = useCallback(async (id) => {
    const ok = await deleteTransaction(id);
    if (ok) setDeleteTarget(null);
  }, [deleteTransaction, setDeleteTarget]);


  // ── Derived state ──
  const todayDateStr = new Date().toDateString();
  const todayTransactions = useMemo(
    () => transactions.filter(t => new Date(t.created_at).toDateString() === todayDateStr),
    [transactions, todayDateStr]
  );
  const yesterdayNet = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    const s = d.toDateString();
    return transactions.filter(t => new Date(t.created_at).toDateString() === s)
      .reduce((acc, t) => t.type === 'sale' ? acc + (t.amount||0) : t.type === 'expense' ? acc - (t.amount||0) : acc, 0);
  }, [transactions]);

  const todaySales = useMemo(() => todayTransactions.filter(t => t.type === 'sale'), [todayTransactions]);
  const todaySalesTotal = useMemo(() => todaySales.reduce((s, t) => s + (t.amount||0), 0), [todaySales]);
  const todayExpensesTotal = useMemo(() => todayTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount||0), 0), [todayTransactions]);

  const todayStaffSalesRows = useMemo(() => {
    const rows = new Map();
    todaySales.filter(t => t.actor_staff_member_id).forEach(t => {
      const id = String(t.actor_staff_member_id);
      const r = rows.get(id) || { id, name: t.actor_name_snapshot || 'Staff', total: 0, count: 0 };
      r.total += Number(t.amount||0); r.count += 1; rows.set(id, r);
    });
    return Array.from(rows.values()).sort((a,b) => b.total - a.total);
  }, [todaySales]);

  const ownerAlerts = useMemo(
    () => todaySales.filter(t => Number(t.amount||0) >= ownerAlertSettings.threshold_amount)
      .sort((a,b) => Number(b.created_at||0) - Number(a.created_at||0)).slice(0, 4),
    [todaySales, ownerAlertSettings.threshold_amount]
  );

  const creditMetrics = useMemo(
    () => buildCreditMetrics(enrichedCustomerSummaries, ledgerTransactions),
    [enrichedCustomerSummaries, ledgerTransactions]
  );

  const topProducts = useMemo(() => {
    const counts = {};
    todaySales.forEach(t => { const n = t.item_name||'Unknown'; counts[n]=(counts[n]||0)+(t.quantity||1); });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,qty])=>({name,qty}));
  }, [todaySales]);

  const handleShareReport = useCallback(() => {
    const profit = todaySalesTotal - todayExpensesTotal;
    const topStr = topProducts.length > 0 ? topProducts.map((p,i) => `  ${i+1}. ${p.name} (x${p.qty})`).join('\n') : '  —';
    const summary = [
      `📊 ${shopProfile?.name||'Shop'} — ${t.shareDailyReport}`,
      `📅 ${new Date().toLocaleDateString('en', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}`,
      ``,
      `💰 ${t.sales}:    ${fmt(todaySalesTotal)} ${lang==='am'?'ብር':'birr'}`,
      `🛒 ${t.spent}: ${fmt(todayExpensesTotal)} ${lang==='am'?'ብር':'birr'}`,
      `📈 ${t.calcProfit}:   ${fmt(profit)} ${lang==='am'?'ብር':'birr'}`,
      ``,
      `🏆 ${t.shareTopItems}:`, topStr, ``, t.shareSentVia,
    ].join('\n');
    setShareText(summary);
    setShowShareModal(true);
  }, [todaySalesTotal, todayExpensesTotal, topProducts, shopProfile, t, lang, setShareText, setShowShareModal]);

  // ── Loading / Onboarding gates ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: P.bg }}>
        <div className="text-center animate-elastic">
          <div className="text-5xl mb-3">📒</div>
          <h1 className="text-2xl font-black font-serif" style={{ color: 'var(--color-primary)' }}>ገብያ</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-soft)' }}>{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!shopProfile?.name) {
    return (
      <OnboardingScreen
        onComplete={(profile) => {
          const defaults = buildDefaultChannels();
          setShopProfile({ ...profile, telegram: '', businessType: profile.businessType||'retail-shop', paymentChannels: defaults, payments: deriveLegacyFromChannels(defaults).payments });
          db.settings.put({ key: 'shop_payment_channels', value: JSON.stringify(defaults) }).catch(() => {});
        }}
      />
    );
  }

  const TAB_LABELS = { today:{en:'Today',am:'የዛሬ'}, credit:{en:'Credit',am:'ዱቤ'}, history:{en:'Report',am:'ሪፖርት'}, settings:{en:'More',am:'ተጨማሪ'} };
  const tabs = [
    { id:'today',    label:TAB_LABELS.today[lang],    icon:BookOpen },
    { id:'credit',   label:TAB_LABELS.credit[lang],   icon:CreditCard },
    { id:'history',  label:TAB_LABELS.history[lang],  icon:BarChart3 },
    { id:'settings', label:TAB_LABELS.settings[lang], icon:MoreHorizontal },
  ];


  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto relative" style={{ background: P.bg }}>

      {/* Header */}
      <header className="flex-shrink-0 px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3" style={{ background: 'var(--color-bg)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={() => setActiveTab('settings')} className="flex-shrink-0 press-scale flex items-center justify-center rounded-full font-bold text-white" aria-label="Open profile" style={{ width:36, height:36, background:'#6b7280', fontSize:14 }}>
            {shopProfile.name.charAt(0).toUpperCase()}
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm sm:text-base font-bold tracking-tight leading-tight truncate" style={{ color:'#1a1a1a' }}>{shopProfile.name}</h1>
            <p className="text-[10px] sm:text-xs font-medium mt-0.5 truncate" style={{ color:'#6b7280' }}>{t.appName}</p>
          </div>
          <button onClick={toggleLang} className="flex items-center flex-shrink-0 press-scale" style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:2 }} aria-label={lang==='en'?'Switch to Amharic':'Switch to English'}>
            {['en','am'].map(l => (
              <span key={l} style={{ background:lang===l?'#1B4332':'transparent', color:lang===l?'#fff':'#9ca3af', fontWeight:lang===l?700:600, padding:l==='en'?'3px 8px':'3px 7px', borderRadius:6, fontSize:11, transition:'all 0.18s' }}>{l==='en'?'EN':'አማ'}</span>
            ))}
          </button>
          <button onClick={() => setActiveTab('settings')} className="flex-shrink-0 press-scale flex items-center justify-center" aria-label="Settings" style={{ minWidth:44, minHeight:44, padding:8 }}>
            <Settings className="w-5 h-5" style={{ color:'#6b7280' }} />
          </button>
        </div>
        <OfflineStatusStrip pwa={pwa} pendingTelegramCount={pendingTelegramCount} lang={lang} onRetryTelegram={handleRetryQueuedTelegram} retryingTelegram={retryingTelegram} />
      </header>

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
            enrichedCustomerSummaries={enrichedCustomerSummaries}
            customerSummaries={customerSummaries}
            creditMetrics={creditMetrics}
            supplierSummaries={supplierSummaries}
            activeCatalogEntries={activeCatalogEntries}
            currentActorLabel={currentActorLabel}
            handleToggleCustomerTelegramNotify={toggleCustomerTelegramNotify}
            handleResendCustomerTelegramUpdate={resendTelegramUpdate}
            handleSaveCustomerTransaction={saveCustomerTransaction}
            handleDeleteCustomerTransaction={deleteCustomerTransaction}
            handleSaveSupplier={saveSupplier}
            handleSaveSupplierTransaction={saveSupplierTransaction}
            handleDeleteSupplierTransaction={deleteSupplierTransaction}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab
            transactions={transactions}
            ledgerTransactions={ledgerTransactions}
            enrichedCustomerSummaries={enrichedCustomerSummaries}
            customerSummaries={customerSummaries}
            staffMembers={staffMembers}
            currentActorLabel={currentActorLabel}
            activeCatalogEntries={activeCatalogEntries}
          />
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
              ownerAlertSettings={ownerAlertSettings}
              onProfileSave={handleProfileSave}
              onSaveOwnerAlertSettings={handleSaveOwnerAlertSettings}
              onSaveStaffMember={handleSaveStaffMember}
              onUpdateStaffMember={handleUpdateStaffMember}
              onDeactivateStaffMember={handleDeactivateStaffMember}
              onReactivateStaffMember={handleReactivateStaffMember}
              onSetActiveStaffMember={handleSetActiveStaffMember}
              enabledProviders={enabledProviders}
              onProvidersChange={setEnabledProviders}
              paymentChannels={shopProfile?.paymentChannels || []}
              onSavePaymentChannels={handleSavePaymentChannels}
              recurringExpenses={recurringExpenses}
              onRecurringChange={setRecurringExpenses}
              usageStats={usageStats}
              onShareToday={handleShareReport}
              onSaveCatalogEntry={saveCatalogEntry}
              onToggleCatalogEntryActive={toggleCatalogEntryActive}
              onSaveSupplier={saveSupplier}
              onSaveSupplierTransaction={saveSupplierTransaction}
              onUpdateSupplierTransaction={updateSupplierTransaction}
              onDeleteSupplierTransaction={deleteSupplierTransaction}
              pwa={pwa}
            />
          </Suspense>
        )}
      </main>

      {/* Action bar — Today tab only, hidden when any modal is open */}
      {activeTab === 'today' && !showForm && !showCustomerForm && !customerEditTarget && !customerTransactionModal && !customerTransactionEditTarget && !showSupplierForm && !supplierEditTarget && !supplierTransactionModal && !supplierTransactionEditTarget && (
        <div className="fixed left-0 right-0 max-w-md mx-auto z-30 px-3 py-2 border-t" style={{ bottom:60, background:'#fff', borderColor:'#e5e7eb' }}>
          <div className="flex gap-1.5 sm:gap-2">
            {[
              { type:'sale',    label:lang==='am'?'ሽያጭ':'Sale',    color:'#16a34a', Icon:Plus },
              { type:'expense', label:lang==='am'?'ወጪ':'Expense',  color:'#dc2626', Icon:Minus },
              { type:'credit',  label:lang==='am'?'ዱቤ':'Credit',   color:'#2563eb', Icon:RotateCw },
            ].map(({ type, label, color, Icon }) => (
              <button
                key={type}
                onClick={() => {
                  if (type === 'credit') { setActiveTab('credit'); if (!customerSummaries?.length) setShowCustomerForm(true); return; }
                  setShowForm(type);
                }}
                onPointerDown={() => setPressedBtn(type)}
                onPointerUp={() => setPressedBtn(null)}
                onPointerLeave={() => setPressedBtn(null)}
                className="flex-1 py-2.5 sm:py-3 min-h-[44px] flex items-center justify-center gap-1.5 transition-all min-w-0"
                style={{ background: pressedBtn===type?`${color}15`:'#fff', border:`1.5px solid ${color}`, borderRadius:'var(--radius-md)', transform:pressedBtn===type?'scale(0.98)':'none' }}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color, strokeWidth:2.5 }} />
                <span className="font-bold text-xs sm:text-sm truncate" style={{ color }}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 border-t" style={{ background:'#fff', borderColor:'#e5e7eb' }}>
        <div className="flex">
          {tabs.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setShowForm(null); setShowCustomerForm(false); setShowSupplierForm(false);
                  setActiveTab(id); setSelectedCustomerId(null);
                  useAppStore.getState().setSelectedSupplierId(null);
                }}
                className="flex-1 flex flex-col items-center gap-1 py-2 min-h-[56px] press-scale"
                style={{ color: isActive ? '#1B4332' : '#9ca3af' }}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[11px]" style={{ fontWeight: isActive ? 700 : 500 }}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <GlobalModals
        enrichedCustomerSummaries={enrichedCustomerSummaries}
        customerSummaries={customerSummaries}
        supplierSummaries={supplierSummaries}
        activeCatalogEntries={activeCatalogEntries}
        recurringExpenses={recurringExpenses}
        currentActorLabel={currentActorLabel}
        enabledProviders={enabledProviders}
        lastPayment={lastPayment}
        handleAddTransaction={addTransaction}
        handleSaveCustomerTransaction={saveCustomerTransaction}
        handleDeleteCustomerTransaction={deleteCustomerTransaction}
        handleAddCustomer={addCustomer}
        handleSaveSupplier={saveSupplier}
        handleSaveSupplierTransaction={saveSupplierTransaction}
        handleCustomerReminderSent={markReminderSent}
        handleToggleCustomerTelegramNotify={toggleCustomerTelegramNotify}
        handleConfirmCustomerTelegramConnection={confirmTelegramConnection}
        handleResendCustomerTelegramUpdate={resendTelegramUpdate}
        handleSaveCatalogEntry={saveCatalogEntry}
        handleCustomQuickAmountsChange={handleCustomQuickAmountsChange}
        handleAddCustomerInline={addCustomerInline}
        setRecurringExpenses={setRecurringExpenses}
      />

      <ToastContainer />

      {authChecked && authUser === false && (
        <AuthGate
          lang={lang}
          shopPhone={shopProfile?.phone || ''}
          onAuthenticated={(user) => { setAuthUser(user); getSyncEngine()?.sync(); }}
          onSkip={() => useAuthStore.getState().setUser({ skipped: true })}
        />
      )}
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
