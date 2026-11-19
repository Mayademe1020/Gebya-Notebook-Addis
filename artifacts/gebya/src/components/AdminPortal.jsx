/**
 * AdminPortal - standalone platform-admin command center, mounted at /admin.
 * Gives the Gebya team a shareable URL to follow platform status: shops,
 * frictions, communications, support tickets, admin actions.
 * Access is server-enforced (/api/admin/* requires an allowlisted admin phone OR email).
 * This page is only the client-side entry + UX gate.
 */
import { useEffect, useState } from 'react';
import { lazy, Suspense } from 'react';
import { LangProvider, useLang, LangContext, ENGLISH_T } from '../context/LangContext';
import { ThemeProvider } from '../context/ThemeContext';
import { PrivacyProvider } from '../context/PrivacyContext';
import { useAuthStore } from '../stores/authStore';
import MembersPanel from './MembersPanel.jsx';
import ActivityPanel from './ActivityPanel.jsx';
import AuthGate from './AuthGate.jsx';
import { label } from '../labels/index.js';

const AdminDashboard = lazy(() => import('./AdminDashboard.jsx'));
const AdminShopDetail = lazy(() => import('./AdminShopDetail.jsx'));

function Shell({ children }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <div className="max-w-6xl mx-auto px-4 py-4">{children}</div>
    </div>
  );
}

const NAV = [
  { id: 'overview', label: 'Overview', am: 'አጠቃላይ' },
  { id: 'shops', label: 'Shops', am: 'ሱቃች' },
  { id: 'frictions', label: 'Frictions', am: 'ጥርጣሬዎች' },
  { id: 'features', label: 'Features', am: 'ባህሪያት' },
  { id: 'actions', label: 'Actions', am: 'እርምጃዎች' },
  { id: 'activity', label: 'Activity', am: 'እንቅስቃሴ' },
  { id: 'team', label: 'Team', am: 'ቡድን' },
];

function Header() {
  const { lang } = useLang();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between py-3 mb-4 -mx-4 px-4" style={{ background: 'linear-gradient(180deg, var(--color-bg) 75%, rgba(255,255,255,0))', borderBottom: '1px solid var(--color-border)', boxShadow: '0 1px 0 rgba(16,24,40,0.03)' }}>
      <div className="flex items-center gap-2">
        <span className="text-xl leading-none font-black" style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent-amber))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Gebya</span>
        <div>
          <p className="text-sm font-black leading-tight">Command Center</p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {label('admin.platform-admin-shops-frictions-comms', lang)}
          </p>
        </div>
      </div>
      <a href="/" className="text-xs font-bold px-3 py-2 rounded-xl transition-colors" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text)' }}>
        {label('admin.open-app', lang)}
      </a>
    </header>
  );
}

function Notice({ title, hint }) {
  return (
    <div className="rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--color-border)' }}>
      <p className="text-sm font-black mb-2">{title}</p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>
    </div>
  );
}

function GoogleAdminSignIn() {
  const { lang } = useLang();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const handleCredential = async (response) => {
    if (!response?.credential) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/google-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: response.credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Google sign-in failed');
      useAuthStore.getState().login(data.token, data.user, data.role, data.permissions, data.businesses, true);
      await useAuthStore.getState().init();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!clientId) return;
    let script = document.getElementById('gis-client');
    if (!script) {
      script = document.createElement('script');
      script.id = 'gis-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      document.body.appendChild(script);
    }
    const initGis = () => window.google?.accounts?.id?.initialize({ client_id: clientId, callback: handleCredential });
    script.onload = initGis;
    if (window.google?.accounts?.id) initGis();
  }, [clientId]);

  if (!clientId) {
    return (
      <p className="text-[11px] text-center mt-3" style={{ color: 'var(--color-text-muted)' }}>
        {label('admin.google-sign-in-not-configured', lang)}
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => window.google?.accounts?.id?.prompt()}
        disabled={loading}
        className="w-full py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
        style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
      >
        {loading ? '...' : (label('admin.sign-in-with-google', lang))}
      </button>
      {error && (
        <p className="text-[11px] mt-2 text-center font-bold" style={{ color: 'var(--color-danger-text)' }}>{error}</p>
      )}
    </div>
  );
}

function AdminPortalInner() {
  const { user, checked, isPlatformAdmin, init } = useAuthStore();
  const { lang } = useLang();
  const [shop, setShop] = useState(null);
  const [section, setSection] = useState('overview');

  useEffect(() => {
    if (!checked) init();
  }, [checked, init]);

  const goBack = () => { setShop(null); };
  const selectShop = (s) => { setShop(s); };
  const navTo = (id) => { setShop(null); setSection(id); };

  const navButton = (item, active, onClick) => (
    <button
      key={item.id}
      onClick={onClick}
      className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap"
      style={active ? { background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))', color: '#fff', boxShadow: '0 6px 16px -8px rgba(27,67,50,0.45)' } : { background: 'var(--color-bg-hover)', color: 'var(--color-text)' }}
    >
      {lang === 'am' ? item.am : item.label}
    </button>
  );

  return (
    <Shell>
      <Header />
      {!checked ? (
        <div className="text-xs text-center py-10" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
      ) : !user ? (
        <div className="max-w-sm mx-auto space-y-3">
          <AuthGate lang={lang} onAuthenticated={() => { useAuthStore.getState().init(); }} />
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{label('admin.or', lang)}</span>
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
          </div>
          <GoogleAdminSignIn />
        </div>
      ) : !isPlatformAdmin ? (
        <Notice
          title={label('admin.admin-access-required', lang)}
          hint="Your phone/email is not on the platform-admin allowlist (PLATFORM_ADMIN_PHONES / PLATFORM_ADMIN_EMAILS)."
        />
      ) : (
        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          <aside className="hidden md:flex md:flex-col gap-1 md:w-44 md:shrink-0 md:sticky md:top-20 md:self-start">
            {NAV.map((item) => navButton(item, section === item.id && !shop, () => navTo(item.id)))}
          </aside>
          <div className="md:hidden flex gap-2 overflow-x-auto pb-1 mb-1 sticky top-[57px] z-10 -mx-4 px-4" style={{ background: 'var(--color-bg)' }}>
            {NAV.map((item) => navButton(item, section === item.id && !shop, () => navTo(item.id)))}
          </div>
          <main className="flex-1 min-w-0">
            {shop ? (
              <Suspense fallback={<div className="text-xs text-center py-10" style={{ color: 'var(--color-text-muted)' }}>Loading shop...</div>}>
                <AdminShopDetail businessId={shop.id} onBack={goBack} />
              </Suspense>
            ) : section === 'team' ? (
              <MembersPanel />
            ) : section === 'activity' ? (
              <ActivityPanel />
            ) : (
              <Suspense fallback={<div className="text-xs text-center py-10" style={{ color: 'var(--color-text-muted)' }}>Loading dashboard...</div>}>
                <AdminDashboard tab={section} onShopSelect={selectShop} />
              </Suspense>
            )}
          </main>
        </div>
      )}
    </Shell>
  );
}

export default function AdminPortal() {
  return (
    <LangProvider>
      <ThemeProvider>
        <PrivacyProvider>
          <LangContext.Provider value={{ lang: 'en', toggleLang: () => {}, t: ENGLISH_T }}>
            <AdminPortalInner />
          </LangContext.Provider>
        </PrivacyProvider>
      </ThemeProvider>
    </LangProvider>
  );
}