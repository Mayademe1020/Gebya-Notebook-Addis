import { Suspense, lazy, useState } from 'react';
import { useLang } from '../../context/LangContext';
import AdminMetricsView from '../AdminMetricsView';
import CrossShopCurationQueue from '../CrossShopCurationQueue';
import { label } from '../../labels/index.js';

const AdminDashboard = lazy(() => import('../AdminDashboard.jsx'));
const AdminShopDetail = lazy(() => import('../AdminShopDetail.jsx'));
const OwnerActivityDashboard = lazy(() => import('../OwnerActivityDashboard.jsx'));
const SupportPanel = lazy(() => import('../SupportPanel.jsx'));

const AdminPanelFallback = () => (
  <div className="text-xs text-gray-400 py-4">Loading...</div>
);

function AdminPanel({
  shopId,
  shopProfile,
  staffMembers,
  isOwner,
  isPlatformAdmin,
  showPlatformAdmin,
}) {
  const { lang } = useLang();
  const [adminSection, setAdminSection] = useState(null);
  const [selectedShop, setSelectedShop] = useState(null);

  const toggleSection = (section) => {
    setAdminSection(adminSection === section ? null : section);
  };

  if (!isOwner && !isPlatformAdmin && !showPlatformAdmin) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden mt-4">
      <div
        className="px-4 py-3 text-xs font-black uppercase tracking-wider"
        style={{ color: 'var(--color-warning)' }}
      >
        {showPlatformAdmin
          ? (label('settings-shop.platform-admin', lang))
          : (label('settings-shop.shop-admin', lang))}
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-3">
        <AdminTabButton
          label={label('settings-shop.metrics', lang)}
          isActive={adminSection === 'metrics'}
          onClick={() => toggleSection('metrics')}
        />
        <AdminTabButton
          label={label('settings-shop.analytics', lang)}
          isActive={adminSection === 'analytics'}
          onClick={() => toggleSection('analytics')}
        />
        {(isOwner || isPlatformAdmin) && (
          <AdminTabButton
            label={label('settings-shop.curation', lang)}
            isActive={adminSection === 'curation'}
            onClick={() => toggleSection('curation')}
          />
        )}
        <AdminTabButton
          label={label('settings-shop.activity', lang)}
          isActive={adminSection === 'activity'}
          onClick={() => toggleSection('activity')}
        />
        <AdminTabButton
          label={label('settings-shop.support', lang)}
          isActive={adminSection === 'support'}
          onClick={() => toggleSection('support')}
        />
        {showPlatformAdmin && (
          <AdminTabButton
            label="Admin"
            isActive={adminSection === 'admin'}
            onClick={() => toggleSection('admin')}
          />
        )}
      </div>

      {showPlatformAdmin && (
        <div className="px-4 pb-3">
          <a
            href="/admin"
            className="block w-full py-2.5 rounded-xl text-xs font-bold text-center text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            {label('settings-shop.open-command-center', lang)}
          </a>
          <p
            className="text-[10px] mt-1.5 text-center"
            style={{ color: 'var(--color-text-soft)' }}
          >
            {label('settings-shop.share-with-your-team-admin', lang)}
          </p>
        </div>
      )}

      <AdminSectionContent
        section={adminSection}
        shopId={shopId}
        shopProfile={shopProfile}
        staffMembers={staffMembers}
        selectedShop={selectedShop}
        showPlatformAdmin={showPlatformAdmin}
        onShopSelect={(shop) => {
          setSelectedShop(shop);
          setAdminSection('shopDetail');
        }}
        onBackToAdmin={() => setAdminSection('admin')}
      />
    </div>
  );
}

function AdminTabButton({ label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-[80px] py-2 rounded-lg text-xs font-bold transition-all ${
        isActive ? 'text-white' : ''
      }`}
      style={
        isActive
          ? { background: 'var(--color-primary)' }
          : { background: 'var(--color-bg-hover)', color: 'var(--color-text)' }
      }
    >
      {label}
    </button>
  );
}

function AdminSectionContent({
  section,
  shopId,
  shopProfile,
  staffMembers,
  selectedShop,
  showPlatformAdmin,
  onShopSelect,
  onBackToAdmin,
}) {
  const { lang } = useLang();

  if (!section) return null;

  return (
    <>
      {section === 'metrics' && (
        <div className="px-4 pb-3">
          <AdminMetricsView shopId={shopId} />
        </div>
      )}
      {section === 'analytics' && (
        <div className="px-4 pb-3">
          <Suspense fallback={<AdminPanelFallback />}>
            <LazySimpleAnalytics />
          </Suspense>
        </div>
      )}
      {section === 'curation' && (
        <div className="px-4 pb-3">
          <CrossShopCurationQueue />
        </div>
      )}
      {section === 'activity' && (
        <div className="px-4 pb-3">
          <Suspense fallback={<AdminPanelFallback />}>
            <OwnerActivityDashboard shopProfile={shopProfile} staffMembers={staffMembers} />
          </Suspense>
        </div>
      )}
      {section === 'support' && (
        <div className="px-4 pb-3">
          <Suspense fallback={<AdminPanelFallback />}>
            <SupportPanel isAdmin={showPlatformAdmin} />
          </Suspense>
        </div>
      )}
      {section === 'admin' && (
        <div className="px-4 pb-3">
          <Suspense fallback={<AdminPanelFallback />}>
            <AdminDashboard onShopSelect={onShopSelect} />
          </Suspense>
        </div>
      )}
      {section === 'shopDetail' && selectedShop && (
        <div className="px-4 pb-3">
          <Suspense fallback={<AdminPanelFallback />}>
            <AdminShopDetail
              businessId={selectedShop.id}
              onBack={onBackToAdmin}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}

const LazySimpleAnalytics = lazy(() =>
  import('../analytics/SimpleAnalytics.jsx')
);

export default AdminPanel;
