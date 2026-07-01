import { lazy, Suspense, useState, useEffect } from 'react';
import TeamPage from './TeamPage';
import { Eye, EyeOff, Shield, ChevronRight, Plus, X, Trash2 } from 'lucide-react';
import { usePrivacy } from '../context/PrivacyContext';
import { useLang } from '../context/LangContext';
import { useTheme } from '../context/ThemeContext';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import db from '../db';
import { fireToast } from './Toast';

import ShopProfilePanel from './settings/ShopProfilePanel';
import CatalogPanel from './settings/CatalogPanel';
import RecurringExpensesPanel from './settings/RecurringExpensesPanel';
import BackupDataPanel from './settings/BackupDataPanel';
import DisplayPrivacyPanel from './settings/DisplayPrivacyPanel';
import ReadinessHero from './settings/ReadinessHero';
import PaymentChannelsSection from './settings/PaymentChannelsSection';

const PwaInstallPanel = lazy(() => import('./PwaInstallPanel.jsx'));

const FREQ_LABELS_EN = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const FREQ_LABELS_AM = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const BUSINESS_TYPE_OPTIONS_EN = [
  { value: 'retail-shop', label: 'Retail shop' },
  { value: 'shoe-market', label: 'Shoe market' },
  { value: 'flower-shop', label: 'Flower shop' },
  { value: 'women-dress-shop', label: "Women's clothing" },
  { value: 'supermarket', label: 'Supermarket / Minimarket' },
  { value: 'grocery', label: 'Grocery (liquor)' },
  { value: 'electronics', label: 'Electronics / accessories' },
  { value: 'pharmacy', label: 'Pharmacy / cosmetics' },
  { value: 'other', label: 'Other' },
];
const BUSINESS_TYPE_OPTIONS_AM = [
  { value: 'retail-shop', label: 'የችርቻሮ ሱቅ' },
  { value: 'shoe-market', label: 'የጫማ መሸጫ' },
  { value: 'flower-shop', label: 'የአበባ ሱቅ' },
  { value: 'women-dress-shop', label: 'የሴቶች ልብስ ሱቅ' },
  { value: 'supermarket', label: 'ሱፐርማርኬት / ሚኒማርኬት' },
  { value: 'grocery', label: 'ግሮሰሪ' },
  { value: 'electronics', label: 'ኤሌክትሮኒክስ / መለዋወጫዎች' },
  { value: 'pharmacy', label: 'ፋርማሲ / መዋቢያ' },
  { value: 'other', label: 'ሌላ' },
];

function SettingsSection({
  id, title, openSection, setOpenSection, children,
  defaultOpen = false,
  icon, status, statusTone = 'neutral', subtitle,
}) {
  const open = openSection === id || (defaultOpen && !openSection);

  const tonePalette = {
    ok:      { bg: '#d1fae5', color: '#065f46' },
    warn:    { bg: '#fef3c7', color: '#92400e' },
    bad:     { bg: '#fee2e2', color: '#991b1b' },
    info:    { bg: '#dbeafe', color: '#1e3a8a' },
    neutral: { bg: '#f3f4f6', color: '#6b7280' },
  };
  const tone = tonePalette[statusTone] || tonePalette.neutral;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpenSection(open ? null : id)}
        className="w-full bg-white rounded-2xl border border-green-100/50 overflow-hidden text-left"
      >
        <div className="px-4 py-3.5 flex items-center gap-3">
          {icon && (
            <div
              className="flex-shrink-0 flex items-center justify-center"
              style={{
                width: 34, height: 34,
                borderRadius: 10,
                background: '#fafaf5',
                fontSize: '1.05rem',
              }}
            >
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black text-gray-900 truncate">{title}</h2>
            <p className="text-[11px] mt-0.5 truncate" style={{ color: '#9ca3af' }}>
              {subtitle || (open ? 'Tap to close' : 'Tap to open')}
            </p>
          </div>
          {status && (
            <span
              className="flex-shrink-0 text-[10px] font-bold uppercase"
              style={{
                background: tone.bg,
                color: tone.color,
                padding: '3px 8px',
                borderRadius: 999,
                letterSpacing: '0.04em',
              }}
            >
              {status}
            </span>
          )}
          <ChevronRight
            className="w-4 h-4 flex-shrink-0 transition-transform"
            style={{ color: '#9ca3af', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />
        </div>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}

function GroupLabel({ children }) {
  return (
    <p
      className="text-[10px] font-black uppercase"
      style={{
        color: '#9ca3af',
        letterSpacing: '0.14em',
        padding: '14px 6px 6px',
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

function SettingsPanelFallback({ label }) {
  return (
    <div className="bg-white rounded-2xl border border-green-100/50 px-5 py-4 text-sm font-semibold text-gray-500">
      {label}
    </div>
  );
}

function SettingsPage({
  transactions,
  todayTransactions,
  customerSummaries,
  catalogEntries,
  supplierSummaries,
  shopProfile,
  staffMembers,
  activeStaffMemberId,
  currentActorLabel,
  ownerAlertSettings,
  onProfileSave,
  onSaveOwnerAlertSettings,
  onSaveStaffMember,
  onUpdateStaffMember,
  onDeactivateStaffMember,
  onReactivateStaffMember,
  onSetActiveStaffMember,
  onRefreshStaffMembers,
  onRotateJoinCode,
  onUpdateShopSettings,
  onApproveDevice,
  onRejectDevice,
  onLoadStaffActivity,
  onRetryStaffActivity,
  enabledProviders,
  onProvidersChange,
  paymentChannels,
  onSavePaymentChannels,
  recurringExpenses,
  onRecurringChange,
  usageStats,
  onShareToday,
  onSaveCatalogEntry,
  onToggleCatalogEntryActive,
  onSaveSupplier,
  onSaveSupplierTransaction,
  onUpdateSupplierTransaction,
  onDeleteSupplierTransaction,
  pwa,
}) {
  const { theme, setTheme } = useTheme();
  const { hidden, toggle } = usePrivacy();
  const { lang, t } = useLang();
  const [openSection, setOpenSection] = useState(null);

  const [recurring, setRecurring] = useState(recurringExpenses || []);
  useEffect(() => { setRecurring(recurringExpenses || []); }, [recurringExpenses]);

  const handleRecurringChange = (updated) => {
    setRecurring(updated);
    onRecurringChange?.(updated);
  };

  const [staffName, setStaffName] = useState('');
  const [staffDeactivateTarget, setStaffDeactivateTarget] = useState(null);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editingStaffName, setEditingStaffName] = useState('');
  const [identity, setIdentityState] = useState(null);
  const [shopJoinCode, setShopJoinCode] = useState('');
  const [shopJoinSettings, setShopJoinSettings] = useState(null);
  const [rotating, setRotating] = useState(false);
  const [staffActivity, setStaffActivity] = useState([]);
  const [staffActivityFilter, setStaffActivityFilter] = useState('all');
  const [staffActivityLoading, setStaffActivityLoading] = useState(false);
  const [staffActivityError, setStaffActivityError] = useState('');
  const [staffActivityOffline, setStaffActivityOffline] = useState(false);
  const [staffActivitySource, setStaffActivitySource] = useState('local');

  const handleAddStaffMember = async () => {
    const saved = await onSaveStaffMember?.({ display_name: staffName, role: 'staff', active: true });
    if (!saved) return;
    setStaffName('');
  };

  const handleConfirmDeactivateStaff = async () => {
    if (!staffDeactivateTarget?.id) return;
    const ok = await onDeactivateStaffMember?.(staffDeactivateTarget.id);
    if (!ok) return;
    setStaffDeactivateTarget(null);
  };

  const [shareCopied, setShareCopied] = useState(false);

  const activeCatalogEntries = (catalogEntries || []).filter(entry => entry.active !== false);
  const totalEntries = transactions.length;
  const totalCustomersWithLedger = customerSummaries.length;
  const totalSupplierDubie = (supplierSummaries || []).reduce((sum, supplier) => sum + Math.max(supplier.balance || 0, 0), 0);

  const handleShareStats = async () => {
    if (!usageStats) return;
    const { streak, longestStreak, daysActive, featureCounts, sessionCount, firstUsed } = usageStats;
    const fc = featureCounts || {};
    let firstUsedDisplay = firstUsed;
    try { firstUsedDisplay = firstUsed ? formatEthiopian(new Date(firstUsed)) : firstUsed; } catch { /* keep ISO fallback */ }
    const text = [
      'Gebya usage stats for ' + (shopProfile?.name || 'my shop') + ':' ,
      'Current streak: ' + streak + ' day' + (streak !== 1 ? 's' : '') + ' (longest: ' + longestStreak + ')' ,
      'Using since: ' + firstUsedDisplay,
      'Total days active: ' + (daysActive?.length || 1),
      'Entries: ' + (fc.sales || 0) + ' sales - ' + (fc.expenses || 0) + ' expenses - ' + (fc.credits || 0) + ' Dubie',
      'Sessions opened: ' + sessionCount,
    ].join('\n');
    if (navigator.share) {
      try { await navigator.share({ title: 'Gebya Stats', text }); return; } catch { /* fall through to clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch { /* ignore */ }
  };

  const todaySales = (todayTransactions || []).filter(tx => tx.type === 'sale');
  const todayExpenses = (todayTransactions || []).filter(tx => tx.type === 'expense');
  const todayRevenue = todaySales.reduce((s, tx) => s + (tx.amount || 0), 0);
  const todayCostOfGoods = todaySales.reduce((s, tx) => s + ((tx.cost_price || 0) * (tx.quantity || 1)), 0);
  const todayExpTotal = todayExpenses.reduce((s, tx) => s + (tx.amount || 0), 0);
  const todayHasCost = todaySales.some(tx => tx.cost_price > 0);
  const todayProfit = todayRevenue - todayCostOfGoods - todayExpTotal;

  const profileFullySet = !!(shopProfile?.name && shopProfile?.phone);
  const profileStatus = profileFullySet ? (lang === 'am' ? '✓ ተዋቅሯል' : '✓ Set') : (lang === 'am' ? 'ይጨምሩ' : 'Partial');
  const profileTone = profileFullySet ? 'ok' : 'warn';
  const profileSubtitle = `${shopProfile?.name || (lang === 'am' ? 'ስም የለም' : 'No name')}${shopProfile?.phone ? ` · ${shopProfile.phone}` : ''}`;

  const chTotal = paymentChannels.length;
  const chOn = paymentChannels.filter(c => c.enabled).length;
  const chOnConfigured = paymentChannels.filter(c => c.enabled && (c.usePhoneFromShop || c.phone || c.account)).length;
  const channelsStatus = `${chOnConfigured}/${chTotal}`;
  const channelsTone = chOnConfigured === 0 ? 'bad' : (chOnConfigured < chOn ? 'warn' : 'ok');

  const activeItemsCount = (catalogEntries || []).filter(e => e.active !== false).length;
  const itemsStatus = activeItemsCount > 0 ? `${activeItemsCount}` : (lang === 'am' ? 'ባዶ' : 'Empty');
  const itemsTone = activeItemsCount > 0 ? 'ok' : 'neutral';

  const recurringCount = (recurring || []).length;
  const recurringStatus = recurringCount > 0 ? `${recurringCount}${lang === 'am' ? '' : '/mo'}` : (lang === 'am' ? 'ባዶ' : 'None');
  const recurringTone = recurringCount > 0 ? 'ok' : 'neutral';

  const activeStaffCount = (staffMembers || []).filter(m => m.active !== false).length;
  const teamStatus = activeStaffCount > 0 ? `${activeStaffCount}` : (lang === 'am' ? 'ብቻ እርስዎ' : 'Solo');
  const teamTone = activeStaffCount > 0 ? 'ok' : 'neutral';
  const staffActivityFilters = [
    { id: 'all', label: 'All' },
    { id: 'sale', label: 'Sales' },
    { id: 'customer_payment', label: 'Customer payments' },
    { id: 'customer_credit', label: 'Dubie' },
  ];
  const filteredStaffActivity = (staffActivity || [])
    .filter((item) => staffActivityFilter === 'all' || item.event_type === staffActivityFilter)
    .slice(0, 8);
  const staffActivityCount = filteredStaffActivity.length;
  const staffActivitySyncTone = staffActivity.some(item => item.sync_state === 'needs_retry')
    ? 'warn'
    : (staffActivity.some(item => item.sync_state === 'waiting_to_sync') ? 'info' : 'ok');
  const staffActivityStatusStyle = {
    synced: { background: '#dcfce7', color: '#166534' },
    waiting_to_sync: { background: '#fef3c7', color: '#92400e' },
    needs_retry: { background: '#fee2e2', color: '#991b1b' },
  };
  const formatActivityTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const activityCopy = {
    loading: staffActivityLoading ? 'Refreshing...' : 'Refresh',
    empty: staffActivityFilter === 'all'
      ? 'No staff activity yet. When staff records sales, payments, or Dubie, it will appear here.'
      : 'No activity for this filter yet.',
  };

  const displayPrivacyStatus = `${theme === 'dark' ? (lang === 'am' ? 'ጨለማ' : 'Dark') : (lang === 'am' ? 'ብርሃን' : 'Light')} · ${hidden ? (lang === 'am' ? 'ተደብቋል' : 'Hidden') : (lang === 'am' ? 'ይታያል' : 'Visible')}`;

  const dataStatus = totalEntries > 0 ? `${totalEntries}` : (lang === 'am' ? 'ባዶ' : 'Empty');
  const dataTone = totalEntries > 0 ? 'ok' : 'neutral';

  const [aboutTapCount, setAboutTapCount] = useState(0);
  const [devModeRevealed, setDevModeRevealed] = useState(() => {
    try { return localStorage.getItem('gebya_dev_mode') === 'true'; } catch { return false; }
  });
  const handleAboutTap = () => {
    if (devModeRevealed) return;
    const next = aboutTapCount + 1;
    setAboutTapCount(next);
    if (next >= 5) {
      try { localStorage.setItem('gebya_dev_mode', 'true'); } catch { /* ignore */ }
      setDevModeRevealed(true);
      fireToast(lang === 'am' ? '🛠 የልማት ሁነታ ተከፍቷል' : '🛠 Dev mode unlocked', 1800);
    }
  };

  return (
    <div className="space-y-2 pb-4">

      <Suspense fallback={<SettingsPanelFallback label={t.loading} />}>
        <PwaInstallPanel pwa={pwa} variant="settings" />
      </Suspense>

      <ReadinessHero
        shopProfile={shopProfile}
        paymentChannels={paymentChannels}
        catalogEntries={catalogEntries}
        recurring={recurring}
        lang={lang}
      />

      <GroupLabel>{lang === 'am' ? 'የንግድ ስራ' : 'Commerce'}</GroupLabel>

      <SettingsSection
        id="profile"
        title={t.shopProfile}
        icon="⭐"
        status={profileStatus}
        statusTone={profileTone}
        subtitle={profileSubtitle}
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <ShopProfilePanel shopProfile={shopProfile} onProfileSave={onProfileSave} />
      </SettingsSection>

      <SettingsSection
        id="payment_channels"
        title={lang === 'am' ? 'የክፍያ መንገዶች' : 'Payment channels'}
        icon="💳"
        status={channelsStatus}
        statusTone={channelsTone}
        subtitle={lang === 'am'
          ? `${chOnConfigured} ${chOnConfigured === 1 ? 'መንገድ' : 'መንገዶች'} ዝግጁ ናቸው`
          : `${chOnConfigured} channel${chOnConfigured === 1 ? '' : 's'} ready`}
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <PaymentChannelsSection
          channels={paymentChannels}
          shopPhone={shopProfile?.phone || ''}
          enabledCount={chOn}
          configuredCount={chOnConfigured}
          onChange={(nextChannels) => onSavePaymentChannels?.(nextChannels)}
          lang={lang}
        />
      </SettingsSection>

      <SettingsSection
        id="catalog"
        title={lang === 'am' ? 'እቃዎች' : 'Items'}
        icon="📦"
        status={itemsStatus}
        statusTone={itemsTone}
        subtitle={activeItemsCount > 0
          ? (lang === 'am' ? `${activeItemsCount} ዕቃዎች ተቀምጠዋል` : `${activeItemsCount} saved item${activeItemsCount === 1 ? '' : 's'}`)
          : (lang === 'am' ? 'ለመጀመር ይጨምሩ' : 'Add to get started')}
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <CatalogPanel
          catalogEntries={catalogEntries}
          onSaveCatalogEntry={onSaveCatalogEntry}
          onToggleCatalogEntryActive={onToggleCatalogEntryActive}
        />
      </SettingsSection>

      <SettingsSection
        id="recurring"
        title={t.recurringExpenses}
        icon="🔁"
        status={recurringStatus}
        statusTone={recurringTone}
        subtitle={recurringCount > 0
          ? (lang === 'am' ? `${recurringCount} ወርሃዊ ወጪ` : `${recurringCount} monthly bill${recurringCount === 1 ? '' : 's'}`)
          : (lang === 'am' ? 'ኪራይ፣ ኢንተርኔት፣ ወዘተ' : 'Rent, internet, electricity, etc.')}
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <RecurringExpensesPanel
          recurring={recurring}
          onRecurringChange={handleRecurringChange}
        />
      </SettingsSection>

      <GroupLabel>{lang === 'am' ? 'ሰዎች' : 'People'}</GroupLabel>
      <SettingsSection
        id="team"
        title={lang === 'am' ? 'ቡድን' : 'Team & Staff'}
        icon="👥"
        status={teamStatus}
        statusTone={teamTone}
        subtitle={activeStaffCount > 0
          ? (lang === 'am' ? `${activeStaffCount} ሰራተኞች ንቁ ናቸው` : `${activeStaffCount} active staff`)
          : (lang === 'am' ? 'ሰራተኛ ለመጨመር ይንኩ' : 'Invite staff and manage recording access')}
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <TeamPage
          staffMembers={staffMembers}
          activeStaffMemberId={activeStaffMemberId}
          currentActorLabel={currentActorLabel}
          onSetActiveStaffMember={onSetActiveStaffMember}
          onSaveStaffMember={onSaveStaffMember}
          onUpdateStaffMember={onUpdateStaffMember}
          onDeactivateStaffMember={onDeactivateStaffMember}
          onReactivateStaffMember={onReactivateStaffMember}
        />
      </SettingsSection>

      <GroupLabel>{lang === 'am' ? 'ምርጫዎች' : 'Preferences'}</GroupLabel>
      <SettingsSection
        id="display_privacy"
        title={lang === 'am' ? 'ማሳያ እና ግላዊነት' : 'Display & Privacy'}
        icon="🎨"
        subtitle={displayPrivacyStatus}
        statusTone="neutral"
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <DisplayPrivacyPanel />
      </SettingsSection>

      <GroupLabel>{lang === 'am' ? 'ውሂብ እና መተግበሪያ' : 'Data & App'}</GroupLabel>
      <SettingsSection
        id="data"
        title={lang === 'am' ? 'ምትኬ እና ውሂብ' : 'Backup & data'}
        icon="💾"
        status={dataStatus}
        statusTone={dataTone}
        subtitle={lang === 'am'
          ? `${totalEntries} መዝገብ · ${totalCustomersWithLedger} ደንበኞች በዱቤ`
          : `${totalEntries} entries · ${totalCustomersWithLedger} customers in dubie`}
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <BackupDataPanel
          transactions={transactions}
          customerSummaries={customerSummaries}
          supplierSummaries={supplierSummaries}
        />
      </SettingsSection>

      <SettingsSection
        id="about"
        title={t.about}
        icon="ℹ️"
        subtitle={`Gebya v1.0 · ${usageStats?.daysActive?.length || 1} ${lang === 'am' ? 'ቀናት ተጠቅመዋል' : 'days used'} · ${totalEntries} ${lang === 'am' ? 'መዝገብ' : 'entries'}`}
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
          <button
            type="button"
            onClick={handleAboutTap}
            className="w-full text-left"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <div className="px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black" style={{ background: 'rgba(196,136,58,0.12)', color: '#8b5e20' }}>
                GB
              </div>
              <div className="flex-1">
                <div className="font-bold text-gray-800">Gebya · የንግድ ማስታወሻ</div>
                <div className="text-xs text-gray-500 mt-0.5">Business Notebook for Ethiopian shopkeepers</div>
                <div className="text-xs text-gray-400 mt-1">{t.worksOffline}</div>
              </div>
            </div>
          </button>
          <div className="px-5 py-3 border-t border-green-100/30 flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-700 flex-shrink-0" />
            <p className="text-xs text-gray-500">{t.privacyNote}</p>
          </div>
          <div className="px-5 py-3 border-t border-green-100/30 text-xs text-gray-400">
            {lang === 'am'
              ? `${usageStats?.daysActive?.length || 1} ቀናት ተጠቅመዋል · ${totalEntries} መዝገብ ተመዝግቧል`
              : `Used ${usageStats?.daysActive?.length || 1} day${(usageStats?.daysActive?.length || 1) === 1 ? '' : 's'} · ${totalEntries} entries recorded`}
            {aboutTapCount > 0 && aboutTapCount < 5 && !devModeRevealed && (
              <span className="ml-2" style={{ color: '#C4883A' }}>
                · {5 - aboutTapCount} more taps
              </span>
            )}
          </div>
        </div>
      </SettingsSection>

      {staffDeactivateTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-4xl text-center mb-3">!</div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Inactivate staff member?</h3>
            <p className="text-sm text-gray-500 text-center mb-2">
              {String(activeStaffMemberId) === String(staffDeactivateTarget.id)
                ? `${staffDeactivateTarget.display_name} is currently selected for new records on this phone.`
                : `${staffDeactivateTarget.display_name} will stop appearing for new record entry on this phone.`}
            </p>
            <p className="text-sm text-gray-700 text-center mb-6">
              Past records stay attributed to this staff member. New records will use the owner unless you choose another active staff member.
            </p>
            <div className="space-y-2">
              <button
                onClick={handleConfirmDeactivateStaff}
                className="w-full p-4 bg-red-500 text-white rounded-2xl font-bold min-h-[52px]"
              >
                Inactivate now
              </button>
              <button
                onClick={() => setStaffDeactivateTarget(null)}
                className="w-full p-4 rounded-2xl font-bold min-h-[52px]"
                style={{ background: '#f5f5f5', color: '#374151' }}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
