import { Suspense, useState } from 'react';
import { X } from 'lucide-react';
import { usePrivacy } from '../context/PrivacyContext';
import { useLang } from '../context/LangContext';
import { useTheme } from '../context/ThemeContext';
import { fireToast } from './Toast';

import ShopTab from './settings/tabs/ShopTab';
import MoneyTab from './settings/tabs/MoneyTab';
import StaffTab from './settings/tabs/StaffTab';
import DataTab from './settings/tabs/DataTab';
import AdminMetricsView from './AdminMetricsView';
import CrossShopCurationQueue from './CrossShopCurationQueue';

const TABS = [
  { id: 'shop', labelEn: 'Shop', labelAm: 'ሱቅ' },
  { id: 'money', labelEn: 'Money', labelAm: 'ገንዘብ' },
  { id: 'staff', labelEn: 'Staff', labelAm: 'ሰራተኞች' },
  { id: 'data', labelEn: 'Data', labelAm: 'ውሂብ' },
];

function SettingsPanelFallback({ label }) {
  return (
    <div className="bg-white rounded-2xl border border-green-100/50 px-5 py-4 text-sm font-semibold text-gray-500">
      {label}
    </div>
  );
}

function SettingsPage({
  transactions,
  customerSummaries,
  catalogEntries,
  supplierSummaries,
  shopProfile,
  staffMembers,
  activeStaffMemberId,
  currentActorLabel,
  onProfileSave,
  onSaveStaffMember,
  onUpdateStaffMember,
  onDeactivateStaffMember,
  onReactivateStaffMember,
  onSetActiveStaffMember,
  onApproveDevice,
  onRejectDevice,
  paymentChannels,
  onSavePaymentChannels,
  recurringExpenses,
  onRecurringChange,
  onSaveCatalogEntry,
  onToggleCatalogEntryActive,
  pwa,
  planTier,
  entitlements,
  staffCount,
  transactionCount,
  shopId,
}) {
  const { theme, setTheme } = useTheme();
  const { hidden, toggle } = usePrivacy();
  const { lang, toggleLang, t } = useLang();
  const [activeTab, setActiveTab] = useState('shop');
  const [dismissInstall, setDismissInstall] = useState(false);
  const [pendingCardId, setPendingCardId] = useState(null);

  const [adminSection, setAdminSection] = useState(null); // null | 'metrics' | 'curation'
  const [aboutTapCount, setAboutTapCount] = useState(0);
  const [devModeRevealed, setDevModeRevealed] = useState(() => {
    try { return localStorage.getItem('gebya_dev_mode') === 'true'; } catch { return false; }
  });

  const handleNavigate = (cardId, tabId) => {
    if (tabId) {
      setActiveTab(tabId);
      setPendingCardId(cardId);
    } else if (cardId !== 'profile' || activeTab === 'shop') {
      setActiveTab('shop');
    }
  };

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

  const name = shopProfile?.name || '';
  const initials = (() => {
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  })();

  const showInstallStrip = pwa && !pwa.isStandalone && !dismissInstall;

  return (
    <div className="space-y-2 pb-4" style={{ paddingBottom: showInstallStrip ? 120 : 80 }}>
      {/* Topbar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1" style={{ background: 'var(--cream)' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-white"
            style={{ background: '#1B4332' }}
          >
            {initials}
          </div>
          <div>
            <div className="text-sm font-black text-gray-900 flex items-center gap-1.5">
              {name || (lang === 'am' ? 'ሱቅ' : 'Shop')}
              <span className="text-[0.55rem] font-black uppercase px-1.5 py-0.5 rounded" style={{ background: '#fde68a', color: '#1B4332' }}>
                {lang === 'am' ? 'ባለቤት' : 'Owner'}
              </span>
            </div>
            <div className="text-[0.68rem]" style={{ color: '#6b7280' }}>
              {shopProfile?.phone || (lang === 'am' ? 'ስልክ አልተጨመረም' : 'No phone added')}
            </div>
          </div>
        </div>
        <div className="flex rounded-full p-0.5 text-xs font-black" style={{ background: '#efece2' }}>
          <button
            onClick={() => lang !== 'en' && toggleLang()}
            className={`px-2.5 py-1 rounded-full ${lang === 'en' ? 'text-white' : ''}`}
            style={lang === 'en' ? { background: '#1B4332' } : { color: '#6b7280' }}
          >
            EN
          </button>
          <button
            onClick={() => lang !== 'am' && toggleLang()}
            className={`px-2.5 py-1 rounded-full ${lang === 'am' ? 'text-white' : ''}`}
            style={lang === 'am' ? { background: '#1B4332' } : { color: '#6b7280' }}
          >
            አማ
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 py-2" style={{ background: 'var(--cream)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 py-2 text-xs font-black rounded-lg transition-all"
            style={{
              background: activeTab === tab.id ? '#fff' : 'transparent',
              color: activeTab === tab.id ? '#1B4332' : '#9ca3af',
              boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {lang === 'am' ? tab.labelAm : tab.labelEn}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="px-4">
        <Suspense fallback={<SettingsPanelFallback label={t.loading} />}>
          {activeTab === 'shop' && (
            <ShopTab
              shopProfile={shopProfile}
              catalogEntries={catalogEntries}
              recurringExpenses={recurringExpenses}
              paymentChannels={paymentChannels}
              onProfileSave={onProfileSave}
              onSaveCatalogEntry={onSaveCatalogEntry}
              onToggleCatalogEntryActive={onToggleCatalogEntryActive}
              onRecurringChange={onRecurringChange}
              lang={lang}
              onNavigate={handleNavigate}
            />
          )}
          {activeTab === 'money' && (
            <MoneyTab
              paymentChannels={paymentChannels}
              shopProfile={shopProfile}
              shopId={shopId}
              onSavePaymentChannels={onSavePaymentChannels}
              lang={lang}
              planTier={planTier}
              entitlements={entitlements}
              staffCount={staffCount}
              transactionCount={transactionCount}
              pendingCardId={pendingCardId}
            />
          )}
          {activeTab === 'staff' && (
            <StaffTab
              staffMembers={staffMembers}
              activeStaffMemberId={activeStaffMemberId}
              currentActorLabel={currentActorLabel}
              onSetActiveStaffMember={onSetActiveStaffMember}
              onSaveStaffMember={onSaveStaffMember}
              onUpdateStaffMember={onUpdateStaffMember}
              onDeactivateStaffMember={onDeactivateStaffMember}
              onReactivateStaffMember={onReactivateStaffMember}
              onApproveDevice={onApproveDevice}
              onRejectDevice={onRejectDevice}
              lang={lang}
            />
          )}
          {activeTab === 'data' && (
            <DataTab
              transactions={transactions}
              customerSummaries={customerSummaries}
              supplierSummaries={supplierSummaries}
              pwa={pwa}
              theme={theme}
              setTheme={setTheme}
              hidden={hidden}
              toggle={toggle}
              lang={lang}
            />
          )}
        </Suspense>

        {/* Admin section — only in dev mode */}
        {devModeRevealed && (
          <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden mt-4">
            <div className="px-4 py-3 text-xs font-black uppercase tracking-wider" style={{ color: '#92400e' }}>
              {lang === 'am' ? 'የልማት ሁነታ' : 'Dev Mode'}
            </div>
            <div className="flex gap-2 px-4 pb-3">
              <button
                onClick={() => setAdminSection(adminSection === 'metrics' ? null : 'metrics')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${adminSection === 'metrics' ? 'text-white' : ''}`}
                style={adminSection === 'metrics' ? { background: '#1B4332' } : { background: '#f3f4f6', color: '#374151' }}
              >
                {lang === 'am' ? 'ሜትሪክስ' : 'Metrics'}
              </button>
              <button
                onClick={() => setAdminSection(adminSection === 'curation' ? null : 'curation')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${adminSection === 'curation' ? 'text-white' : ''}`}
                style={adminSection === 'curation' ? { background: '#1B4332' } : { background: '#f3f4f6', color: '#374151' }}
              >
                {lang === 'am' ? 'ማስተካከያ ወረፋ' : 'Curation'}
              </button>
            </div>
            {adminSection === 'metrics' && <div className="px-4 pb-3"><AdminMetricsView shopId={shopId} /></div>}
            {adminSection === 'curation' && <div className="px-4 pb-3"><CrossShopCurationQueue /></div>}
          </div>
        )}

        {/* About easter egg — hidden tap target */}
        <div
          onClick={handleAboutTap}
          className="text-center py-3 text-xs"
          style={{ color: '#d1d5db' }}
        >
          Gebya v1.0
          {aboutTapCount > 0 && aboutTapCount < 5 && !devModeRevealed && (
            <span className="ml-2" style={{ color: '#C4883A' }}>
              · {5 - aboutTapCount} {lang === 'am' ? 'ተጨማሪ መታ' : 'more taps'}
            </span>
          )}
        </div>
      </div>

      {/* Install strip — floats above bottom nav */}
      {showInstallStrip && (
        <div
          className="fixed flex items-center gap-3 px-4 py-3 z-50"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 56,
            width: '100%',
            maxWidth: 390,
            background: 'rgba(250,249,244,0.95)',
            backdropFilter: 'blur(10px)',
            borderTop: '1px solid rgba(27,67,50,0.08)',
          }}
        >
          <div className="flex-1">
            <div className="text-xs font-bold text-gray-900">
              {lang === 'am' ? 'ጌብያ ይጫኑ' : 'Install Gebya'}
            </div>
            <div className="text-[11px]" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ያለ ኢንተርኔት ይስሩ' : 'Works offline'}
            </div>
          </div>
          <button
            onClick={() => pwa?.install?.()}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white min-h-[36px]"
            style={{ background: '#1B4332' }}
          >
            {lang === 'am' ? 'ጫን' : 'Install'}
          </button>
          <button
            onClick={() => setDismissInstall(true)}
            className="p-1.5 rounded-full flex items-center justify-center"
            style={{ color: '#9ca3af' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
