import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import db, { getIdentity, setIdentity } from '../db';
import { recent } from '../utils/recentRows';
import { getAuthToken } from '../utils/syncEngine';
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
import SideNav from './SideNav';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import GlobalModals from './GlobalModals';
import RecoveryNudgeModal from './RecoveryNudgeModal';

import TransferSheet from './TransferSheet';
import { ToastContainer, fireToast } from './Toast';
import StaffPage from './StaffPage';
import { buildPhotoFields, normalizePhotos } from '../utils/photoProof';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import { fmt } from '../utils/numformat';
import { usePermissionsStore } from '../stores/permissionsStore';
import { useSyncStore } from '../stores/syncStore';
import { useStaffStore } from '../stores/staffStore';
import { buildCustomerSummaries, getCustomerBalance, insertCustomerTransaction, sortCustomerTransactions } from '../utils/customerLedger';
import { fifoAllocatePayment, normalizeCustomerDraft, normalizeCustomerTransactionDraft } from '../utils/customerLedgerMutations';
import { CUSTOMER_TRANSACTION_TYPES, isValidCustomerTransactionType } from '../utils/customerTransactionTypes';
import { buildCustomerLedgerTelegramMessage, buildTelegramMessageUrl, createCustomerTelegramLinkToken, createCustomerTransactionReference } from '../utils/customerTelegram';
import { buildSupplierSummaries, getSupplierBalance, isValidSupplierTransactionType, SUPPLIER_TRANSACTION_TYPES } from '../utils/supplierLedger';
import { enrichCustomerSummaries, buildCreditMetrics } from '../utils/customerMetrics';
import { usePwaInstall } from '../hooks/usePwaInstall.js';
import { useSetupCompletionStamp } from '../hooks/useSetupCompletionStamp.js';
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
  addCustomChannel,
} from '../utils/paymentChannels';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useNotificationStream } from '../hooks/useNotificationStream';
import { useSyncRefresh } from '../hooks/useSyncRefresh';
import { initSession, endSession, trackEvent, trackFirstEvent } from '../utils/eventTracking';
import { checkAndAutoBackup } from '../utils/useAutoBackup';
import { useNotificationsStore } from '../stores/notificationsStore';
import { useAppStore } from '../stores/appStore';
import { useShopStore } from '../stores/shopStore';
import { useAuthStore } from '../stores/authStore';
import { initSyncEngine, destroySyncEngine } from '../utils/syncEngine';
import { setAuthToken } from '../utils/syncEngine';
import AuthRequiredPrompt from './shell/AuthRequiredPrompt';
import { PanelFallback } from './shell/FallbackViews';
import { LoadingScreen, StaffJoinScreenView, OnboardingScreenView } from './shell/AppShellScreens';
import ErrorBoundary from './ErrorBoundary';
import { lazyWithRetry, isBrowserOnline, runAfterFirstPaint, buildSavedOnDeviceMessage, getTransactionCloudProofRecordType, getCustomerCloudProofRecordType, getSupplierCloudProofRecordType } from '../utils/appShellUtils';
import { useSuppliers } from '../hooks/useSuppliers';
import { useStaffOps } from '../hooks/useStaffOps';
import { useShopOps } from '../hooks/useShopOps';

const DEFAULT_PROVIDERS = {
  banks: [],
  wallets: [],
};

// Stale-chunk self-heal — now delegated to appShellUtils.js

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
  amber: 'var(--color-accent-amber)',
  amberLight: 'rgba(196,136,58,0.12)',
  coral: 'var(--color-accent-coral)',
  border: 'var(--color-border)',
  borderLight: 'var(--color-border-light)',
};

export default function AppShell() {
  const { hidden } = usePrivacy();
  const { lang, toggleLang, t } = useLang();
  const pwa = usePwaInstall();
  const pushNotifications = usePushNotifications();
  const unreadNotifCount = useNotificationsStore(s => s.unreadCount);
  const fetchUnreadNotifCount = useNotificationsStore(s => s.fetchUnreadCount);
  const syncConflictWarning = useSyncStore(s => s.conflictWarning);
  const syncConflictDetails = useSyncStore(s => s.conflictDetails);
  const authUser = useAuthStore(s => s.user);
  const authChecked = useAuthStore(s => s.checked);
  // ─── Data state (local — not in stores) ───
  const [transactions, setTransactions] = useState([]);
  const [ledgerCustomers, setLedgerCustomers] = useState([]);
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [activeStaffMemberId, setActiveStaffMemberId] = useState(null);
  const [onboardingType, setOnboardingType] = useState(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [showRecoveryNudge, setShowRecoveryNudge] = useState(false);
  const [enabledProviders, setEnabledProviders] = useState(DEFAULT_PROVIDERS);
  const [reminderDefaultChannel, setReminderDefaultChannel] = useState(null);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [selectedSupplierTransaction, setSelectedSupplierTransaction] = useState(null);
  const [lastPayment, setLastPayment] = useState({
    sale:    { type: 'cash', provider: '', bankProvider: '', walletProvider: '' },
    expense: { type: 'cash', provider: '', bankProvider: '', walletProvider: '' },
  });
  const [usageStats, setUsageStats] = useState(null);
  const [planTier, setPlanTier] = useState('free');
  const [entitlements, setEntitlements] = useState({ max_staff: 3, max_transactions_per_month: 500, advanced_reports: false, multi_shop: false, priority_support: false });

  // ─── Supplier state (useSuppliers hook) ───
  const {
    suppliers,
    supplierTransactions,
    supplierSummaries,
    saveSupplier,
    saveSupplierTransaction,
    updateSupplierTransaction,
    deleteSupplierTransaction,
  } = useSuppliers(t);

  // ─── Shop state (useShopStore) ───
  const shopProfile = useShopStore(s => s.shopProfile);
  const setShopProfile = useShopStore(s => s.setShopProfile);
  const recurringExpenses = useShopStore(s => s.recurringExpenses);
  const setRecurringExpenses = useShopStore(s => s.setRecurringExpenses);
  const customQuickAmounts = useShopStore(s => s.customQuickAmounts);
  const setCustomQuickAmounts = useShopStore(s => s.setCustomQuickAmounts);
  const lastSavedSnapshot = useShopStore(s => s.lastSavedSnapshot);
  const setLastSavedSnapshot = useShopStore(s => s.setLastSavedSnapshot);

  // Gate D: stamp `setup_completed_at` the first time this shop reaches 5/5.
  // Runs here (AppShell is always mounted) so already-completed shops are
  // backfilled on boot instead of only when someone opens Settings.
  useSetupCompletionStamp({
    shopProfile,
    paymentChannels: shopProfile?.paymentChannels,
    catalogEntries,
    recurring: recurringExpenses,
  });

  const buildActorSnapshot = useCallback(() => (
    resolveActorSnapshot({ shopProfile, staffMembers, activeStaffMemberId })
  ), [shopProfile, staffMembers, activeStaffMemberId]);

  const currentActorLabel = useMemo(() => (
    getActorDisplayLabel({ shopProfile, staffMembers, activeStaffMemberId })
  ), [shopProfile, staffMembers, activeStaffMemberId]);

  // ─── Staff ops (useStaffOps hook) ───
  const {
    handleSaveStaffMember,
    handleUpdateStaffMember,
    handleSetActiveStaffMember,
    handleDeactivateStaffMember,
    handleReactivateStaffMember,
    handleApproveDevice,
    handleRejectDevice,
    refreshStaffMembers,
  } = useStaffOps({
    setStaffMembers,
    setActiveStaffMemberId,
    staffMembers,
    activeStaffMemberId,
    shopProfile,
  });

  // ─── Shop ops (useShopOps hook) ───
  const {
    handleSavePaymentChannels,
    handleQuickAddProvider,
    handleProfileSave,
    handleRotateJoinCode,
    handleUpdateShopSettings,
    handleCustomQuickAmountsChange,
    handleSaveCatalogEntry,
    handleToggleCatalogEntryActive,
    handleOnboardingComplete,
    handleStaffJoined,
  } = useShopOps({
    shopProfile,
    setShopProfile,
    setEnabledProviders,
    setOnboardingType,
    setCatalogEntries,
    setCustomQuickAmounts,
    fireToast,
    lang,
  });

  // ─── App state (useAppStore) ───
  const loading = useAppStore(s => s.loading);
  const setLoading = useAppStore(s => s.setLoading);
  const activeTab = useAppStore(s => s.activeTab);
  const setActiveTab = useAppStore(s => s.setActiveTab);

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
  const transferTarget = useAppStore(s => s.transferTarget);
  const setTransferTarget = useAppStore(s => s.setTransferTarget);
  const pendingTelegramCount = useAppStore(s => s.pendingTelegramCount);
  const setPendingTelegramCount = useAppStore(s => s.setPendingTelegramCount);
  const retryingTelegram = useAppStore(s => s.retryingTelegram);
  const setRetryingTelegram = useAppStore(s => s.setRetryingTelegram);

  const storeRole = usePermissionsStore(s => s.role);
  const storePermissions = usePermissionsStore(s => s.permissions);
  const canManageTeam = useMemo(() => {
    const role = storeRole || shopProfile?.role;
    if (role === 'owner' || role === 'manager') return true;
    return storePermissions?.can_manage_team === true;
  }, [storeRole, storePermissions, shopProfile?.role]);
  // A non-owner/manager business member still needs to reach their own
  // staff surface (My Collection + Today), so the Staff tab is shown to them.
  const isStaffRole = !!storeRole && storeRole !== 'owner' && storeRole !== 'manager';
  const staffTabVisible = canManageTeam || isStaffRole;

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
         txns, customerRows, customerTxRows, catalogRows, staffRows,
         nameRow, phoneRow, epRow, reRow, customQuickAmountsRow, telegramRow,
        snapshotRow, activeStaffRow,
        // Payment receiving accounts — used by Pay-it-now /pay URLs (legacy, C.1)
        payTelebirrRow, payCbePhoneRow, payCbeAccountRow, payAwashPhoneRow,
        payBankNameRow, payBankAccountRow,
        // Unified payment channels (Commit C.4) + legacy custom lists for migration
        paymentChannelsRow, customBanksRow, customWalletsRow, identityRow,
      ] = await Promise.all([
        // recency util keeps the FRESHEST inserts under the cap — the old
        // limit(500) returned the OLDEST 500 rows, so shops past the cap
        // lost every new record from all views after reload.
                recent(db.transactions).toArray().then(r => {
          // Soft-deleted rows (tombstones) stay out of every view. Hard-purge
          // them after 30 days so the local DB does not grow forever.
          const cutoff = Date.now() - 30 * 86400000;
          for (const t of r) {
            const at = t.deleted_at || t.deletedAt;
            if (at && at < cutoff) db.transactions.delete(t.id).catch(() => {});
          }
          return r.filter(t => !t.deleted_at && !t.deletedAt);
        }),
        recent(db.customers).toArray().then(r => r.filter(c => !c.deletedAt)),
        recent(db.customer_transactions).toArray(),
        recent(db.catalog_entries).toArray(),
        recent(db.staff_members).toArray(),
        db.settings.get('shop_name'),
        db.settings.get('shop_phone'),
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
      const sortedTxns = [...txns].sort((a, b) => b.created_at - a.created_at);
      setTransactions(sortedTxns);
      setLedgerCustomers(customerRows);
      setLedgerTransactions(sortCustomerTransactions(customerTxRows));
      setCatalogEntries(catalogRows || []);
      setStaffMembers([...(staffRows || [])].sort((a, b) => {
        if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
        return String(a.display_name || '').localeCompare(String(b.display_name || ''));
      }));
       // Non-blocking: plan entitlements power Plus features but must never stall boot.
       getCurrentEntitlements()
         .then(({ tier, entitlements: ents }) => { setPlanTier(tier); setEntitlements(ents); })
         .catch(() => { /* non-critical */ });

       let identityForProfile = identityRow || null;
       if (!identityForProfile && nameRow?.value) {
         // Fire-and-forget: registering the shop with the backend must not block
         // the UI. On success we persist identity; failures are retried by sync.
         identityApi.createShop({
           display_name: nameRow.value,
           phone: phoneRow?.value || undefined,
         })
           .then((result) => {
             const prof = {
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
             setIdentity(prof);
             if (result.auth_token) setAuthToken(result.auth_token);
           })
           .catch(() => { /* non-critical — sync will retry */ });
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
          plan: planTier || 'free',
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
      // Validate stored JWT against server on boot (non-blocking)
      useAuthStore.getState().init().catch(() => { /* non-critical — sync will handle auth failures */ });
      // Refresh staff store data after sync pull completes so staff can
      // see owner reconciliation decisions (reconciliation_status, owner notes)
      try {
        const staffState = useStaffStore.getState();
        staffState.loadSettlements();
        staffState.loadCloudMembers();
      } catch { /* non-critical */ }
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Refresh local data from Dexie after each sync cycle completes
  useSyncRefresh(useCallback(() => { loadData(); }, [loadData]));

    // Initialize session tracking on mount
  useEffect(() => {
    initSession();

    // Trigger auto-backup check once on app start (fires only if online + authenticated + stale)
    checkAndAutoBackup({ silent: true }).catch(() => { /* never block startup */ });

    
    // Track session end on page hide/unload
    const handleVisibilityChange = () => {
      if (document.hidden) {
        endSession();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', endSession);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', endSession);
      endSession();
    };
  }, []);

  useEffect(() => {
    if (loading) return undefined;
    let destroyed = false;
    let swListenerCleanup = null;
    runAfterFirstPaint(async () => {
      if (destroyed) return;
      try {
        const { initSyncEngine, initSwSyncListener } = await import('../utils/syncEngine.js');
        await initSyncEngine(() => { setShowAuthPrompt(true); });
        
        // Initialize SW sync listener to handle background sync events
        swListenerCleanup = initSwSyncListener();
      } catch (err) {
        if (import.meta.env.DEV) console.error('Sync engine init failed:', err);
      }
    });
    return () => {
      destroyed = true;
      destroySyncEngine();
      if (swListenerCleanup) swListenerCleanup();
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

  // Session tracking for analytics
  useEffect(() => {
    if (loading) return undefined;
    
    initSession();
    
    const handleVisibilityChange = () => {
      if (document.hidden) endSession();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', endSession);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', endSession);
      endSession();
    };
  }, [loading]);

  // ─── Phone-recovery nudge (data-loss protection) ──────────────────────────
  // Owners who have NOT signed in have their records only on this phone. After
  // ~50 recorded transactions we surface one warm, dismissible nudge so the
  // shop's financial memory survives a lost/broken phone. Never blocks usage.
  const RECOVERY_NUDGE_THRESHOLD = 50;
  const RECOVERY_NUDGE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  const handleRecoveryNudgeProtect = useCallback(async (phone) => {
    setShowRecoveryNudge(false);
    // Persist the owner's recovery contact locally so it survives a reinstall.
    try {
      if (phone) {
        await db.settings.put({ key: 'recovery_phone', value: phone });
        const existing = await db.settings.get('shop_phone');
        if (!existing?.value) {
          await db.settings.put({ key: 'shop_phone', value: phone });
        }
      }
      await db.settings.put({ key: 'recovery_nudge_dismissed', value: true });
    } catch { /* non-critical */ }
    trackEvent('recovery_setup_started', { has_phone: !!phone }).catch(() => {});
    // Open the existing phone+OTP sign-in flow — once signed in, the sync
    // engine mirrors records to the cloud and they become recoverable.
    setShowAuthPrompt(true);
  }, []);

  const handleRecoveryNudgeSnooze = useCallback(async () => {
    setShowRecoveryNudge(false);
    try {
      await db.settings.put({ key: 'recovery_nudge_snoozed_until', value: String(Date.now() + RECOVERY_NUDGE_SNOOZE_MS) });
    } catch { /* non-critical */ }
    trackEvent('recovery_nudge_snoozed').catch(() => {});
  }, []);

  const handleRecoveryNudgeDismiss = useCallback(async () => {
    setShowRecoveryNudge(false);
    try {
      await db.settings.put({ key: 'recovery_nudge_dismissed', value: true });
    } catch { /* non-critical */ }
    trackEvent('recovery_nudge_dismissed').catch(() => {});
  }, []);

  useEffect(() => {
    if (loading || !authChecked) return;
    if (authUser) return; // already has a cloud account — data is recoverable
    if (transactions.length < RECOVERY_NUDGE_THRESHOLD) return;
    let cancelled = false;
    (async () => {
      try {
        const dismissed = await db.settings.get('recovery_nudge_dismissed');
        if (dismissed?.value === true) return;
        const snoozedUntil = await db.settings.get('recovery_nudge_snoozed_until');
        if (snoozedUntil?.value && Number(snoozedUntil.value) > Date.now()) return;
        if (cancelled) return;
        setShowRecoveryNudge(true);
        trackFirstEvent('recovery_nudge_shown', { transaction_count: transactions.length }).catch(() => {});
      } catch { /* non-critical — nudge is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [loading, authChecked, authUser, transactions.length]);

  // When the owner completes sign-in, record the milestone (fires once).
  useEffect(() => {
    if (authUser) {
      trackFirstEvent('recovery_setup_complete').catch(() => {});
    }
  }, [authUser]);

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

  // Real-time notification count via SSE (replaces 30s polling)
  useNotificationStream(authChecked && !!authUser);

  // Refresh push subscription after login
  useEffect(() => {
    if (authChecked && authUser && pushNotifications.refreshIfNeeded) {
      pushNotifications.refreshIfNeeded();
    }
  }, [authChecked, authUser]);

  // Live permission sync — re-fetch the current user's role + permissions so
  // that owner-side toggles (can_view_reports, can_add_records, …) take effect
  // on staff devices in near-real-time without a manual reload.
  useEffect(() => {
    // Only poll permissions for an authenticated, loaded app. When the user is
    // signed out (or the refresh token is dead) init() would otherwise hit
    // /api/auth/refresh every 30s and spam 401s into the console.
    if (loading || !authChecked || !authUser) return undefined;
    const refreshPermissions = () => {
      if (isBrowserOnline()) {
        useAuthStore.getState().init().catch(() => { /* non-critical */ });
      }
    };
    const interval = setInterval(refreshPermissions, 30000);
    window.addEventListener('online', refreshPermissions);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', refreshPermissions);
    };
  }, [loading, authChecked, authUser]);

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
        const monthRows = await db.transactions
          .where('created_at')
          .between(monthStart, monthEnd, true, true)
          .toArray();
                const monthCount = monthRows.filter(t => !t.deletedAt && !t.deleted_at).length;
        if (monthCount >= entitlements.max_transactions_per_month) {
          // Product ruling: recording must NEVER be hard-blocked on the free
          // tier — a shop that cannot record today's sales deletes the app
          // that same evening. Warn and continue; the Plan panel (Settings →
          // Money) carries the upgrade path. Also fixes the old bug of calling
          // fireToast with an object (it renders "[object Object]").
          fireToast(lang === 'am'
            ? `የዚህ ወር ${entitlements.max_transactions_per_month} ግብይቶች ተደርሰዋል። Plus ለማግኘት ቅንብሮች → ገንዘብ ይመልከቱ።`
            : `Free plan limit (${entitlements.max_transactions_per_month}/month) reached — see Plus in Settings → Money.`, 5000);
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
      
            // Track transaction creation event
      trackEvent('transaction_created', {
        type: transaction.type,
        source: transaction.source || 'manual',
        amount: transaction.amount,
        has_photo: !!transaction.photo_proof_id,
        has_cost_price: !!transaction.cost_price,
        payment_type: transaction.payment_type || 'cash',
        settlement_mode: transaction.settlement_mode || null,
        has_credit: !!transaction.credit_amount && Number(transaction.credit_amount) > 0,
      });

      // First-sale activation event (tracks only once per shop/device)
      void trackFirstEvent('first_sale', {
        type: transaction.type,
        amount: transaction.amount,
        payment_type: transaction.payment_type || 'cash',
        has_credit: !!transaction.credit_amount && Number(transaction.credit_amount) > 0,
      });

      
      // Non-destructive confirmation only. Corrections are made by tapping the
      // transaction row (Today/History) → edit/delete, which unwinds related
      // records (customer credit, Telegram, cloud-proof) via the proper paths.
      fireToast(safeToastMsg, isOnlineNow ? 4000 : 4500);

      // Return the saved record so capture surfaces (Sale Workspace) can
      // offer the post-save UNDO via the soft-delete path.
      return saved;
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
      // Soft-delete (tombstone): keep the row locally and in sync so the owner
      // can undo it and it never silently vanishes from their other devices.
      // Hard purge happens after 30 days (see the load filter below).
      const victim = await db.transactions.get(id);
      if (!victim) { setDeleteTarget(null); return; }
      await db.transactions.put({ ...victim, deleted_at: Date.now(), updated_at: Date.now() });
      const remainingTransactions = transactions.filter(t2 => t2.id !== id);
      setTransactions(remainingTransactions);
      if (remainingTransactions.length === 0 && ledgerTransactions.length === 0) {
        await clearLastSavedSnapshot();
      }
      setDeleteTarget(null);
      fireToast(lang === 'am' ? 'ተሰርዟል' : 'Entry deleted', 8000, async () => {
        try {
          const restored = { ...victim, deleted_at: null, updated_at: Date.now() };
          await db.transactions.put(restored);
          setTransactions(prev => {
            const without = prev.filter(t2 => t2.id !== id);
            return [...without, restored].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          });
          fireToast(lang === 'am' ? 'ተመልሷል ✓' : 'Restored ✓', 1800);
        } catch (err) {
          if (import.meta.env.DEV) console.error('Undo delete transaction failed:', err);
        }
      });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to delete:', err);
    }
  };

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
        fireToast(t.toastCustomerUpdated, 1800);
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
      
            // Track customer added event
      trackEvent('customer_added', {
        has_phone: !!saved.phone_number,
        has_telegram: !!saved.telegram_username,
      });

      // First-customer activation event (tracks only once per shop/device)
      void trackFirstEvent('first_customer', {
        has_phone: !!saved.phone_number,
        has_telegram: !!saved.telegram_username,
      });

      
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
    try {
      await db.customers.update(customerId, nextUpdates);
      setLedgerCustomers(prev => prev.map(customer => (
        customer.id === customerId ? { ...customer, ...nextUpdates } : customer
      )));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to update customer record:', err);
      fireToast(t.customerSaveFailed || 'Could not update customer.', 2400);
    }
  };

  const handleRecordPromise = async (customerId, promisedPayDate, promiseNote, promiseAmount) => {
    await handleUpdateCustomerRecord(customerId, {
      promised_pay_date: promisedPayDate,
      promise_note: promiseNote || null,
      promise_amount: (promiseAmount && !isNaN(Number(promiseAmount))) ? Number(promiseAmount) : null,
    });
    fireToast(t.promiseSaved || 'Promise recorded', 2000);
  };

  const handleClearPromise = async (customerId) => {
    await handleUpdateCustomerRecord(customerId, {
      promised_pay_date: null,
      promise_note: null,
      promise_amount: null,
    });
    fireToast(t.promiseCleared || 'Promise cleared', 2000);
  };

  const handleArchiveCustomer = async (customer) => {
    if (!customer) return;
    const now = Date.now();
    const isArchived = !!customer.archived_at;
    const payload = isArchived
      ? { archived_at: null }
      : { archived_at: now };
    await handleUpdateCustomerRecord(customer.id, payload);
    setLedgerCustomers(prev => prev.map(c =>
      c.id === customer.id
        ? { ...c, ...payload }
        : c
    ));
    if (customer.id === selectedCustomerId) {
      setSelectedCustomerId(customer.id);
    }
    fireToast(
      isArchived
        ? (t.restoreCustomer || 'Customer restored')
        : (t.archiveCustomer || 'Customer archived'),
      2000
    );
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
    if (Array.isArray(bulkReminderQueue) && bulkReminderQueue.length > 0) {
      const [nextId, ...rest] = bulkReminderQueue;
      const nextCustomer = ledgerCustomers.find(c => c.id === nextId);
      if (nextCustomer) {
        // Defer slightly so the current ReminderSheet closes cleanly before
        // the next one opens.
        setTimeout(() => setReminderTarget(nextCustomer), 120);
      }
      setBulkReminderQueue(rest);
    } else {
      // Queue exhausted — notify user
      fireToast(lang === 'am' ? 'ሁሉም ማሳሰቢያዎች ተልከዋል' : 'All reminders sent', 2500);
    }
  };

  const handleSaveSupplier = useCallback((payload) => saveSupplier(payload), [saveSupplier]);

  const handleSaveSupplierTransaction = useCallback(
    (payload) => saveSupplierTransaction(payload, buildActorSnapshot()),
    [saveSupplierTransaction, buildActorSnapshot]
  );

  const handleUpdateSupplierTransaction = useCallback(
    (transactionId, updates) => updateSupplierTransaction(transactionId, updates, buildActorSnapshot()),
    [updateSupplierTransaction, buildActorSnapshot]
  );

  const handleDeleteSupplierTransaction = useCallback(
    (transactionId) => deleteSupplierTransaction(transactionId),
    [deleteSupplierTransaction]
  );

  const handleConfirmCustomerTelegramConnection = async (customer, payload) => {
    if (!customer) return;
    const now = Date.now();
    const nextChatId = payload.telegram_chat_id || customer.telegram_chat_id || null;
    const nextUsername = payload.telegram_username || customer.telegram_username || null;
    const wasNotLinked = !customer.telegram_chat_id;
    try {
      await handleUpdateCustomerRecord(customer.id, {
        telegram_username: nextUsername,
        telegram_chat_id: nextChatId,
        telegram_link_token: payload.telegram_link_token || customer.telegram_link_token || createCustomerTelegramLinkToken(customer.id),
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
        
        // Track telegram linked event (only for new links)
        if (wasNotLinked && nextChatId) {
          trackEvent('telegram_linked', {
            link_method: payload.link_method || 'manual',
            has_username: !!nextUsername
          });
        }
      }
      if (payload.showSavedToast !== false) {
        fireToast(t.saved, 1800);
      }
      if (payload.closeSheet !== false) {
        setTelegramConnectCustomerId(null);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to confirm telegram connection:', err);
      fireToast(t.saveFailed || 'Could not save. Please try again.', 3500);
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

  // DELETE handler · insert reversal entry instead of hard delete for audit trail integrity.
  const handleDeleteCustomerTransaction = async (tx) => {
    if (!tx?.id) return;
    const reversalAmount = Math.abs(Number(tx.amount) || 0);
    if (reversalAmount <= 0) return;
    // Sign amount so getCustomerBalance correctly cancels: credit_add→positive, payment→negative
    const signedAmount = tx.type === 'payment' ? -reversalAmount : reversalAmount;
    const reversalEntry = {
      customer_id: tx.customer_id,
      type: 'reversal',
      amount: signedAmount,
      item_note: tx.item_note ? `Reversal of: ${tx.item_note}` : 'Reversal',
      due_date: null,
      reversal_of: tx.id,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    // Optimistic: keep original in state, add reversal alongside so getCustomerBalance cancels correctly
    setLedgerTransactions(prev => [reversalEntry, ...prev]);
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

      if (draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT) {
        const allCredits = await db.customer_transactions
          .where('customer_id').equals(payload.customer_id)
          .and(tx => tx.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD)
          .toArray();
        const openCredits = allCredits
          .filter(c => (Number(c.amount) || 0) - (Number(c.paid_amount) || 0) > 0)
          .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        if (openCredits.length > 0) {
          const { allocation, creditsToUpdate } = fifoAllocatePayment(amount, openCredits);
          if (creditsToUpdate.length > 0) {
            for (const update of creditsToUpdate) {
              await db.customer_transactions.update(update.id, {
                paid_amount: update.paid_amount,
                status: update.status,
              });
            }
            await db.customer_transactions.update(id, {
              allocation,
            });
            saved = await db.customer_transactions.get(id);
            nextBalance = getCustomerBalance([saved, ...existingTx]);
          }
        }
      }

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
    fireToast(draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT ? (t.paymentSaved || 'Payment recorded ✓') : t.creditSaved, 2200);

    // Track customer transaction events
    if (draft.type === CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD) {
      trackEvent('credit_added', {
        amount: amount,
        has_due_date: !!draft.due_date,
        has_item_note: !!draft.item_note,
      });
    } else if (draft.type === CUSTOMER_TRANSACTION_TYPES.PAYMENT) {
      trackEvent('payment_recorded', {
        amount: amount,
        payment_type: nextBalance <= 0 ? 'full' : 'partial',
        settled_full_balance: settledFullBalance,
      });
    }

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

  const handleTransferSave = async ({ sourceCustomerId, targetCustomerId, amount, sourceName, targetName }) => {
    const now = Date.now();
    const transferId = `transfer_${now}_${sourceCustomerId}_${targetCustomerId}`;
    try {
      const cloudProofFields = await createCloudProofFields();
      const actorSnapshot = buildActorSnapshot();
      const isOnlineNow = isBrowserOnline();

      const sourceEntries = await db.customer_transactions.where('customer_id').equals(sourceCustomerId).toArray();
      const targetEntries = await db.customer_transactions.where('customer_id').equals(targetCustomerId).toArray();
      const sourceBalance = Math.max(getCustomerBalance(sourceEntries), 0);

      if (amount > sourceBalance) {
        fireToast(t.validAmountRequired || 'Insufficient balance', 2200);
        setTransferTarget(null);
        return;
      }

      let targetRecord = await db.customers.get(targetCustomerId);
      let sourceRecord = await db.customers.get(sourceCustomerId);

      await db.transaction('rw', db.customer_transactions, db.customers, async () => {
        const reversalEntry = {
          customer_id: sourceCustomerId,
          type: CUSTOMER_TRANSACTION_TYPES.REVERSAL,
          amount,
          item_note: `${t.transferToLabel || 'Transfer to'} ${targetName}`,
          payment_method: 'transfer',
          transfer_id: transferId,
          transfer_target_id: targetCustomerId,
          reference_code: null,
          telegram_delivery_state: null,
          telegram_delivery_attempted_at: null,
          created_at: now,
          updated_at: now,
          ...actorSnapshot,
          ...cloudProofFields,
        };
        const revId = await db.customer_transactions.add(reversalEntry);
        const revRef = createCustomerTransactionReference(revId, now);
        await db.customer_transactions.update(revId, { reference_code: revRef });
        await db.customers.update(sourceCustomerId, { updated_at: now });

        const creditEntry = {
          customer_id: targetCustomerId,
          type: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD,
          amount,
          item_note: `${t.transferFromLabel || 'Transfer from'} ${sourceName}`,
          payment_method: 'transfer',
          transfer_id: transferId,
          transfer_source_id: sourceCustomerId,
          reference_code: null,
          telegram_delivery_state: null,
          telegram_delivery_attempted_at: null,
          created_at: now,
          updated_at: now,
          ...actorSnapshot,
          ...cloudProofFields,
        };
        const crId = await db.customer_transactions.add(creditEntry);
        const crRef = createCustomerTransactionReference(crId, now);
        await db.customer_transactions.update(crId, { reference_code: crRef });
        await db.customers.update(targetCustomerId, { updated_at: now });
      });

      const revivedTarget = await db.customers.get(targetCustomerId);
      const revivedSource = await db.customers.get(sourceCustomerId);

      // Notify source customer if Telegram connected
      if (revivedSource?.telegram_notify_enabled && revivedSource?.telegram_chat_id && revivedSource?.telegram_link_token) {
        try {
          await enqueueTelegramLedgerUpdate({
            recordTable: 'customer_transactions',
            recordId: `transfer_${sourceCustomerId}_${now}`,
            payload: {
              customerState: { token: revivedSource.telegram_link_token, currentBalance: Math.max(getCustomerBalance(await db.customer_transactions.where('customer_id').equals(sourceCustomerId).toArray()), 0), updatesEnabled: true, telegramUsername: revivedSource.telegram_username || null, chatId: revivedSource.telegram_chat_id || null },
              ledgerUpdate: { token: revivedSource.telegram_link_token, currentBalance: Math.max(getCustomerBalance(await db.customer_transactions.where('customer_id').equals(sourceCustomerId).toArray()), 0), message: `${t.transferToLabel || 'Transfer to'} ${targetName}: ${fmt(amount)} ${t.birr || 'birr'}`, reference: `transfer_${now}` },
            },
          });
        } catch { /* non-critical */ }
      }

      // Notify target customer if Telegram connected
      if (revivedTarget?.telegram_notify_enabled && revivedTarget?.telegram_chat_id && revivedTarget?.telegram_link_token) {
        try {
          await enqueueTelegramLedgerUpdate({
            recordTable: 'customer_transactions',
            recordId: `transfer_${targetCustomerId}_${now}`,
            payload: {
              customerState: { token: revivedTarget.telegram_link_token, currentBalance: Math.max(getCustomerBalance(await db.customer_transactions.where('customer_id').equals(targetCustomerId).toArray()), 0), updatesEnabled: true, telegramUsername: revivedTarget.telegram_username || null, chatId: revivedTarget.telegram_chat_id || null },
              ledgerUpdate: { token: revivedTarget.telegram_link_token, currentBalance: Math.max(getCustomerBalance(await db.customer_transactions.where('customer_id').equals(targetCustomerId).toArray()), 0), message: `${t.transferFromLabel || 'Transfer from'} ${sourceName}: ${fmt(amount)} ${t.birr || 'birr'}`, reference: `transfer_${now}` },
            },
          });
        } catch { /* non-critical */ }
      }

      setLedgerTransactions(prev => {
        const withSrc = insertCustomerTransaction(prev, { id: `transfer_${now}_src`, customer_id: sourceCustomerId, type: CUSTOMER_TRANSACTION_TYPES.REVERSAL, amount, created_at: now });
        return insertCustomerTransaction(withSrc, { id: `transfer_${now}_tgt`, customer_id: targetCustomerId, type: CUSTOMER_TRANSACTION_TYPES.CREDIT_ADD, amount, created_at: now });
      });
      setTransferTarget(null);
      fireToast(`${t.transferSaved || 'Transfer'} ✓`, 2200);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to save transfer:', err);
      fireToast(t.saveFailed || 'Could not save transfer. Please try again.', 3500);
      setTransferTarget(null);
    }
  };

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

  const todayDateStr = new Date().toDateString();
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
      `💰 ${t.sales}:    ${fmt(todaySalesTotal)} ${t.birr}`,
      `🛒 ${t.spent}: ${fmt(todayExpensesTotal)} ${t.birr}`,
      `📈 ${t.calcProfit}:   ${fmt(profit)} ${t.birr}`,
      ``,
      `🏆 ${t.shareTopItems}:`,
      topStr,
      ``,
      t.shareSentVia,
      '',
      '—— Gebya ገበያ',
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

  const hid = (n) => hidden ? '••••' : fmt(n);

  const getTimeGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t.greetingMorning;
    if (h < 17) return t.greetingAfternoon;
    return t.greetingEvening;
  };

  if (loading) {
    return <LoadingScreen t={t} />;
  }

  if (onboardingType === 'staff') {
    return <StaffJoinScreenView onJoined={handleStaffJoined} onBack={() => setOnboardingType(null)} />;
  }

  if (!shopProfile || !shopProfile.name) {
    return <OnboardingScreenView onComplete={handleOnboardingComplete} shopProfile={shopProfile} />;
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col lg:max-w-[1400px] lg:flex-row" style={{ background: P.bg }}>

      <SideNav
        activeTab={activeTab}
        onTabChange={(tabId) => {
          setShowForm(null);
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
        showStaffTab={staffTabVisible}
      />

      <div className="flex min-h-screen w-full flex-1 flex-col lg:min-h-0">

      {/* Auth required overlay — shown when sync detects expired/invalid token */}
      {showAuthPrompt && (
        <AuthRequiredPrompt
          lang={lang}
          onClose={() => setShowAuthPrompt(false)}
        />
      )}

      {/* Phone-recovery nudge — one warm, dismissible prompt for owners who
          haven't signed in but have reached the record threshold */}
      {showRecoveryNudge && (
        <RecoveryNudgeModal
          lang={lang}
          onProtect={handleRecoveryNudgeProtect}
          onSnooze={handleRecoveryNudgeSnooze}
          onDismiss={handleRecoveryNudgeDismiss}
        />
      )}

      {activeTab !== 'settings' && activeTab !== 'history' && (
        <AppHeader
          shopProfile={shopProfile}
          currentActorLabel={currentActorLabel}
          staffMembers={staffMembers}
          activeStaffMemberId={activeStaffMemberId}
          onSetActiveStaffMember={handleSetActiveStaffMember}
          pwa={pwa}
          unreadNotifCount={unreadNotifCount}
          conflictWarning={syncConflictWarning}
          conflictDetails={syncConflictDetails}
          onOpenNotifications={() => setShowNotificationPanel(true)}
          onRetryTelegram={handleRetryQueuedTelegram}
          onSignIn={() => setShowAuthPrompt(true)}
        />
      )}

        <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 pb-36 lg:px-8 lg:pb-28">
        {activeTab === 'today' && (
          <ErrorBoundary compact>
          <TodayTab
            transactions={transactions}
            todayTransactions={todayTransactions}
            yesterdayNet={yesterdayNet}
            ledgerTransactions={ledgerTransactions}
            lastSavedSnapshot={lastSavedSnapshot}
            onShareReport={handleShareReport}
            onSave={handleAddTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            enabledProviders={enabledProviders}
            catalogEntries={activeCatalogEntries}
            customers={customerSummaries}
            onSaveCatalogEntry={handleSaveCatalogEntry}
            onAddCustomerInline={handleAddCustomerInline}
            onAddProvider={handleQuickAddProvider}
            todaysSales={todaySales}
            actorLabel={currentActorLabel}
            shopProfile={shopProfile}
            initialPaymentType={lastPayment?.sale?.type}
            initialPaymentProvider={lastPayment?.sale?.provider}
            activeStaffMemberId={activeStaffMemberId}
            staffMembers={staffMembers}
          />
          </ErrorBoundary>
        )}

        {activeTab === 'credit' && (
          <ErrorBoundary compact>
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
            onTransfer={(c) => setTransferTarget(c)}
            onArchiveCustomer={handleArchiveCustomer}
            onRecordPromise={handleRecordPromise}
            onClearPromise={handleClearPromise}
          />
          </ErrorBoundary>
        )}

        {/* ═══ Transaction Detail Sheet (customer) ═════════════════════════════ */}
        {selectedTransaction && (
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <TransactionDetailSheet
              transaction={selectedTransaction}
              type="customer"
              lang={lang}
              customerBalance={selectedCustomer?.balance}
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

        {/* ═══ Transaction Detail Sheet (supplier) ═════════════════════════════ */}
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
          <ErrorBoundary compact>
          <HistoryTab
            transactions={transactions}
            ledgerTransactions={ledgerTransactions}
            enrichedCustomerSummaries={enrichedCustomerSummaries}
            customers={ledgerCustomers}
            shopProfile={shopProfile}
            onEdit={setEditTarget}
            onShareReport={handleShareCustomReport}
            catalogEntries={activeCatalogEntries}
            staffMembers={staffMembers}
            canSwitchPeople={canManageTeam}
            myStaffId={activeStaffMemberId}
          />
          </ErrorBoundary>
        )}

        {activeTab === 'staff' && (
          <ErrorBoundary compact>
          <StaffPage
            activeStaffMemberId={activeStaffMemberId}
            currentActorLabel={currentActorLabel}
            shopProfile={shopProfile}
            staffMembers={staffMembers}
            onSetActiveStaffMember={handleSetActiveStaffMember}
          onSaveStaffMember={handleSaveStaffMember}
          onUpdateStaffMember={handleUpdateStaffMember}
          onDeactivateStaffMember={handleDeactivateStaffMember}
            onReactivateStaffMember={handleReactivateStaffMember}
            onApproveDevice={handleApproveDevice}
            onRejectDevice={handleRejectDevice}
            onRotateJoinCode={handleRotateJoinCode}
            lang={lang}
              canManageTeam={canManageTeam}
              onNeedAuth={() => setShowAuthPrompt(true)}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'settings' && (
          <ErrorBoundary compact>
          <Suspense fallback={<PanelFallback label={t.loading} />}>
            <SettingsPage
              pwa={pwa}
              shopId={shopProfile?.shop_id || shopProfile?.id}
              transactions={transactions}
              customerSummaries={customerSummaries}
              catalogEntries={catalogEntries}
              supplierSummaries={supplierSummaries}
              shopProfile={shopProfile}
              staffMembers={staffMembers}
              onProfileSave={handleProfileSave}
              paymentChannels={shopProfile?.paymentChannels || []}
              onSavePaymentChannels={handleSavePaymentChannels}
              recurringExpenses={recurringExpenses}
              onRecurringChange={setRecurringExpenses}
              onSaveCatalogEntry={handleSaveCatalogEntry}
              onToggleCatalogEntryActive={handleToggleCatalogEntryActive}
              planTier={planTier}
              entitlements={entitlements}
              staffCount={(staffMembers || []).filter(m => m.active !== false).length}
              transactionCount={transactions.length}
            />
          </Suspense>
          </ErrorBoundary>
        )}
      </main>

      {!showForm && !showCustomerForm && !customerEditTarget && !customerTransactionModal && !customerTransactionEditTarget && !showSupplierForm && !supplierEditTarget && !supplierTransactionModal && !supplierTransactionEditTarget && (
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

      <div className="lg:hidden">
      <AppBottomNav
        activeTab={activeTab}
        onTabChange={(tabId) => {
          setShowForm(null);
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
        showStaffTab={staffTabVisible}
      />
      </div>

      </div>

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
        showNotificationPanel={showNotificationPanel}
        setShowNotificationPanel={setShowNotificationPanel}
        handleAddTransaction={handleAddTransaction}
        handleDeleteTransaction={handleDeleteTransaction}
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
        onAddProvider={handleQuickAddProvider}
      />

      {transferTarget && (
        <TransferSheet
          sourceCustomer={transferTarget}
          customers={enrichedCustomerSummaries}
          onSave={handleTransferSave}
          onClose={() => setTransferTarget(null)}
        />
      )}

      <DeleteConfirmDialog
        deleteTarget={deleteTarget}
        onConfirm={(id) => handleDeleteTransaction(id)}
        onCancel={() => setDeleteTarget(null)}
      />

      <ToastContainer />
    </div>
  );
}

