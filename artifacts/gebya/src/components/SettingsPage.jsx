import { Suspense, useState, lazy, useCallback } from 'react';
import { useLang } from '../context/LangContext';
import { usePermissionsStore } from '../stores/permissionsStore';
import { useAuthStore } from '../stores/authStore';
import { fireToast } from './Toast';
import { trackEvent } from '../utils/eventTracking';
import { PERMISSIONS, ROLES, canAccessDevMode } from '../constants/permissions';

import ShopTab from './settings/tabs/ShopTab';
import MoneyTab from './settings/tabs/MoneyTab';
import DataTab from './settings/tabs/DataTab';
import DownloadAppBanner from './settings/DownloadAppBanner';
import { InstallGuideModal } from './PwaInstallPanel';
import AdminPanel from './settings/AdminPanel';
import SettingsPanelFallback from './settings/SettingsPanelFallback';
import ErrorBoundary from './ErrorBoundary';
import { label } from '../labels/index.js';

const TABS = [
  { id: 'shop', labelEn: 'Shop', labelAm: 'ሱቅ' },
  { id: 'money', labelEn: 'Money', labelAm: 'ገንዘብ' },
  { id: 'data', labelEn: 'Data', labelAm: 'ውሂብ' },
];

const DEV_MODE_UNLOCK_TAPS = 5;
const DEV_MODE_UNLOCK_WINDOW_MS = 10000;

function SettingsPage({
  pwa,
  transactions,
  customerSummaries,
  catalogEntries,
  shopProfile,
  staffMembers,
  onProfileSave,
  paymentChannels,
  onSavePaymentChannels,
  recurringExpenses,
  onRecurringChange,
  onSaveCatalogEntry,
  onToggleCatalogEntryActive,
  planTier,
  entitlements,
  staffCount,
  transactionCount,
  shopId,
}) {
  const { lang, toggleLang, t } = useLang();
  const usePermStore = usePermissionsStore();
  const hasPermission = usePermStore.hasPermission;
  const role = usePermStore.role || ROLES.STAFF;
  const isAdminFlag = useAuthStore(s => s.isPlatformAdmin);

  const roleBadge = (() => {
    if (!role) return null;
    if (role === ROLES.OWNER) return label('nav.owner', lang);
    if (role === ROLES.MANAGER) return label('nav.manager', lang);
    return label('nav.staff', lang);
  })();

  const [activeTab, setActiveTabState] = useState(() => {
    if (typeof sessionStorage !== 'undefined') {
      const saved = sessionStorage.getItem('gebya_settings_tab');
      if (saved === 'shop' || saved === 'money' || saved === 'data') {
        return saved;
      }
    }
    return 'shop';
  });

  const setActiveTab = useCallback((tab) => {
    setActiveTabState(tab);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('gebya_settings_tab', tab);
    }
  }, []);

  const [pendingCardId, setPendingCardId] = useState(null);
  const [adminSection, setAdminSection] = useState(null);
  const [selectedShop, setSelectedShop] = useState(null);
  const [aboutTapCount, setAboutTapCount] = useState(0);
  const [aboutTapStart, setAboutTapStart] = useState(null);

  const [devModeRevealed, setDevModeRevealed] = useState(() => {
    try {
      try { localStorage.removeItem('gebya_dev_mode'); } catch { /* ignore */ }
      return sessionStorage.getItem('gebya_dev_mode') === 'true';
    } catch { return false; }
  });

  const isOwner = role === ROLES.OWNER;
  const isPlatformAdmin = isAdminFlag || role === ROLES.PLATFORM_ADMIN || role === ROLES.SYSTEM_ADMIN;
  const canViewDevMode = canAccessDevMode(role);
  const showAdminSection = devModeRevealed || isOwner || isPlatformAdmin;
  const showPlatformAdmin = isPlatformAdmin;

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
    if (!canViewDevMode) return;

    const now = Date.now();
    const count = aboutTapCount + 1;

    if (!aboutTapStart || (now - aboutTapStart > DEV_MODE_UNLOCK_WINDOW_MS)) {
      setAboutTapStart(now);
      setAboutTapCount(count);
    } else {
      setAboutTapCount(count);
    }

    if (count >= DEV_MODE_UNLOCK_TAPS && (now - (aboutTapStart || now) <= DEV_MODE_UNLOCK_WINDOW_MS)) {
      const confirmed = confirm(
        label('nav.enable-dev-mode-this-reveals-shop-level', lang)
      );
      if (!confirmed) {
        setAboutTapCount(0);
        setAboutTapStart(null);
        return;
      }
      try { sessionStorage.setItem('gebya_dev_mode', 'true'); } catch { /* ignore */ }
      
      // Audit log: track dev mode activation locally
      trackEvent('dev_mode_enabled', {
        role,
        shop_id: shopId,
        method: 'about_tap_5x',
        session_duration_ms: Date.now() - (aboutTapStart || Date.now()),
      }).catch(() => { /* analytics failure is non-critical */ });
      
      // Server-side validation + audit log
      if (shopId) {
        fetch('/api/audit/dev-mode/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_id: shopId }),
        }).catch(() => { /* server-side logging failure is non-critical */ });
      }
      
      setDevModeRevealed(true);
      setAboutTapCount(0);
      setAboutTapStart(null);
      fireToast(
        label('nav.dev-mode-unlocked-this-session-only', lang),
        1800
      );
    }
  };

  const name = shopProfile?.name || '';
  const initials = (() => {
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  })();

  return (
    <div className="space-y-2 pb-4">
      {/* Download App Banner */}
      <DownloadAppBanner pwa={pwa} />
      <InstallGuideModal pwa={pwa} />

      {/* Topbar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1" style={{ background: 'var(--cream)' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            {initials}
          </div>
          <div>
            <div className="text-sm font-black text-gray-900 flex items-center gap-1.5">
              {name || (label('nav.shop', lang))}
              {roleBadge && (
                <span className="text-[0.55rem] font-black uppercase px-1.5 py-0.5 rounded" style={{ background: 'var(--color-warning-border)', color: 'var(--color-primary)' }}>
                  {roleBadge}
                </span>
              )}
            </div>
            <div className="text-[0.68rem]" style={{ color: 'var(--color-text-muted)' }}>
              {shopProfile?.phone || (label('nav.no-phone-added', lang))}
            </div>
          </div>
        </div>

        {/* Language Toggle */}
        <div className="lang-toggle">
          <button
            onClick={() => lang !== 'en' && toggleLang()}
            className={`lang-toggle__btn ${lang === 'en' ? 'lang-toggle__btn--active' : 'lang-toggle__btn--inactive'}`}
            aria-label={lang === 'en' ? 'English selected' : 'Switch to English'}
          >
            EN
          </button>
          <button
            onClick={() => lang !== 'am' && toggleLang()}
            className={`lang-toggle__btn ${label('nav.lang-toggle-btn-inactive', lang)}`}
            aria-label={label('nav.switch-to', lang)}
          >
            አማ
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-list">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            aria-label={lang === 'am' ? tab.labelAm : tab.labelEn}
            className={`tab-btn ${activeTab === tab.id ? 'tab-btn--active' : 'tab-btn--inactive'}`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
                e.preventDefault();
                const currentIndex = TABS.findIndex(t => t.id === tab.id);
                let nextIndex;
                if (e.key === 'ArrowLeft') {
                  nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
                } else if (e.key === 'ArrowRight') {
                  nextIndex = (currentIndex + 1) % TABS.length;
                } else if (e.key === 'Home') {
                  nextIndex = 0;
                } else {
                  nextIndex = TABS.length - 1;
                }
                setActiveTab(TABS[nextIndex].id);
                // ARIA tabs (roving tabindex): focus follows selection, so a
                // second arrow press moves from the newly-selected tab.
                document.getElementById(`tab-${TABS[nextIndex].id}`)?.focus();
              }
            }}
          >
            {lang === 'am' ? tab.labelAm : tab.labelEn}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="px-4">
        <ErrorBoundary fallback="Failed to load settings. Please refresh.">
        <Suspense fallback={<SettingsPanelFallback label={t.loading} />}>
          <div className="animate-fade">
            <div
              id="panel-shop"
              role="tabpanel"
              aria-labelledby="tab-shop"
              style={{ display: activeTab === 'shop' ? 'block' : 'none' }}
            >
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
            </div>

            <div
              id="panel-money"
              role="tabpanel"
              aria-labelledby="tab-money"
              style={{ display: activeTab === 'money' ? 'block' : 'none' }}
            >
              <MoneyTab
                paymentChannels={paymentChannels}
                shopProfile={shopProfile}
                shopId={shopId}
                onSavePaymentChannels={onSavePaymentChannels}
                onNavigate={handleNavigate}
                lang={lang}
                planTier={planTier}
                entitlements={entitlements}
                staffCount={staffCount}
                transactionCount={transactionCount}
                pendingCardId={pendingCardId}
              />
            </div>

            <div
              id="panel-data"
              role="tabpanel"
              aria-labelledby="tab-data"
              style={{ display: activeTab === 'data' ? 'block' : 'none' }}
            >
              <DataTab
                pwa={pwa}
                transactions={transactions}
                customerSummaries={customerSummaries}
                lang={lang}
                shopId={shopId}
              />
            </div>
          </div>
         </Suspense>
         </ErrorBoundary>

        {/* Reminders, notification prefs and password are rendered ONCE, at the
            top of the Data tab (see settings/tabs/DataTab.jsx). They used to be
            rendered here — outside the tab panels — which meant every tab
            showed them and they were mounted twice. */}

        {/* Admin Section */}
        {showAdminSection && (
          <ErrorBoundary fallback="Failed to load admin tools. Please refresh.">
          <AdminPanel
            shopId={shopId}
            shopProfile={shopProfile}
            staffMembers={staffMembers}
            isOwner={isOwner}
            isPlatformAdmin={isPlatformAdmin}
            showPlatformAdmin={showPlatformAdmin}
          />
          </ErrorBoundary>
        )}

        {/* Version display — clean, non-promotional. Hidden dev mode trigger via tap count */}
        <div
          onClick={handleAboutTap}
          className="text-center py-3 text-xs select-none"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label={label('nav.app-info', lang)}
        >
          <span>
            Gebya · v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}
          </span>
          {aboutTapCount > 0 && aboutTapCount < DEV_MODE_UNLOCK_TAPS && !devModeRevealed && (
            <span className="ml-2" style={{ color: 'var(--color-accent-amber)' }}>
              · {DEV_MODE_UNLOCK_TAPS - aboutTapCount} {label('nav.more-taps', lang)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
