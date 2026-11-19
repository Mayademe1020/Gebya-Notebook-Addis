import { useState } from 'react';
import { Bell, Settings, ChevronDown, Check } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import OfflineStatusStrip from './OfflineStatusStrip';
import SyncDiagnosticSheet from './SyncDiagnosticSheet';
import BusinessSelector from './BusinessSelector';
import { label } from '../labels/index';

export default function AppHeader({
  shopProfile,
  currentActorLabel,
  staffMembers = [],
  activeStaffMemberId,
  onSetActiveStaffMember,
  pwa,
  unreadNotifCount,
  conflictWarning,
  conflictDetails,
  onOpenNotifications,
  onRetryTelegram,
  onSignIn,
}) {
  const { lang, toggleLang, t } = useLang();
  const T = (en, am) => lang === 'am' ? am : en;
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const pendingTelegramCount = useAppStore(s => s.pendingTelegramCount);
  const retryingTelegram = useAppStore(s => s.retryingTelegram);
  const currentBusinessId = useAuthStore(s => s.currentBusinessId);
  const [showActorPicker, setShowActorPicker] = useState(false);
  const [showSyncDiag, setShowSyncDiag] = useState(false);

  const activeStaff = (staffMembers || []).filter(m => m.active !== false);

  return (
    <header
      className="flex-shrink-0 px-3 sm:px-4 lg:px-8 pt-3 sm:pt-4 pb-2 sm:pb-3"
      style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border-light)', boxShadow: '0 4px 20px -16px rgba(27,67,50,0.35)' }}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => setActiveTab('settings')}
          className="flex-shrink-0 press-scale flex items-center justify-center rounded-full font-bold text-white"
          aria-label="Open profile"
          style={{
            width: '38px', height: '38px',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent-amber))',
            fontSize: '15px', letterSpacing: '0.02em',
            boxShadow: '0 4px 12px -4px rgba(27,67,50,0.45)',
          }}
        >
          {shopProfile.name.charAt(0).toUpperCase()}
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm sm:text-base font-bold tracking-tight leading-tight truncate" style={{ color: 'var(--color-text)' }}>
            <BusinessSelector shopProfile={shopProfile} currentBusinessId={currentBusinessId} />
          </h1>
          <button
            onClick={() => setShowActorPicker(!showActorPicker)}
            className="flex items-center gap-1 text-[10px] sm:text-xs font-medium mt-0.5 truncate press-scale"
            style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {T('Recording as', 'እየመዘገቡ ያሉት')} {currentActorLabel || 'Owner'}
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {showActorPicker && (
          <div
            className="fixed inset-0 z-50"
            onClick={() => setShowActorPicker(false)}
            style={{ background: 'rgba(0,0,0,0.3)' }}
          >
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 bg-white rounded-2xl overflow-hidden shadow-xl border"
              style={{ borderColor: 'var(--color-border)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 text-xs font-black uppercase tracking-wide text-gray-500 border-b" style={{ borderColor: 'var(--color-border-light)' }}>
                {T('Switch actor', 'ተጠቃሚ ቀይር')}
              </div>
              <div className="py-1">
                <button
                  onClick={() => { onSetActiveStaffMember?.(null); setShowActorPicker(false); }}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ background: 'var(--color-primary)' }}>
                    {shopProfile.name?.charAt(0)?.toUpperCase() || 'O'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900">{shopProfile.name || 'Owner'}</div>
                    <div className="text-[11px] text-gray-500">{T('Owner', 'ባለቤት')}</div>
                  </div>
                  {!activeStaffMemberId && <Check className="w-4 h-4 text-green-700 flex-shrink-0" />}
                </button>
                {activeStaff.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { onSetActiveStaffMember?.(m.id); setShowActorPicker(false); }}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50"
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                      {(m.display_name || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">{m.display_name}</div>
                      <div className="text-[11px] text-gray-500">{m.role || 'staff'}</div>
                    </div>
                    {String(activeStaffMemberId) === String(m.id) && <Check className="w-4 h-4 text-green-700 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={toggleLang}
          className="flex items-center flex-shrink-0 press-scale"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-bg-disabled)', borderRadius: '8px', padding: '2px' }}
          aria-label={lang === 'en' ? 'Switch to Amharic' : 'Switch to English'}
        >
          <span style={{
            background: lang === 'en' ? 'var(--color-primary)' : 'transparent',
            color: lang === 'en' ? 'var(--color-bg-white)' : 'var(--color-text-soft)',
            fontWeight: lang === 'en' ? 700 : 600,
            padding: '3px 8px', borderRadius: '6px', fontSize: '11px', transition: 'all 0.18s',
          }}>EN</span>
          <span style={{
            background: label('nav.transparent', lang),
            color: label('nav.var-color-text-soft', lang),
            fontWeight: lang === 'am' ? 700 : 600,
            padding: '3px 7px', borderRadius: '6px', fontSize: '11px', transition: 'all 0.18s',
          }}>አማ</span>
        </button>

        <button
          onClick={onOpenNotifications}
          className="flex-shrink-0 press-scale flex items-center justify-center"
          aria-label={label('nav.notifications', lang)}
          style={{ position: 'relative', minWidth: '44px', minHeight: '44px', padding: '8px' }}
        >
          <Bell className="w-5 h-5" style={{ color: unreadNotifCount > 0 ? 'var(--color-primary)' : 'var(--color-text-soft)' }} />
          {unreadNotifCount > 0 && (
            <span style={{
              position: 'absolute', top: 6, right: 6,
              minWidth: 14, height: 14, borderRadius: 999,
              background: 'var(--color-danger)', color: 'var(--color-bg-white)',
              fontSize: '0.5rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px',
            }}>
              {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className="flex-shrink-0 press-scale flex items-center justify-center"
          aria-label="Settings"
          style={{ minWidth: '44px', minHeight: '44px', padding: '8px' }}
        >
          <Settings className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
        </button>
      </div>
      <OfflineStatusStrip
        pwa={pwa}
        pendingTelegramCount={pendingTelegramCount}
        lang={lang}
        onRetryTelegram={onRetryTelegram}
        retryingTelegram={retryingTelegram}
        conflictWarning={conflictWarning}
        conflictDetails={conflictDetails}
        onSignIn={onSignIn}
        onOpenDiagnostic={() => setShowSyncDiag(true)}
      />
      <SyncDiagnosticSheet
        open={showSyncDiag}
        onClose={() => setShowSyncDiag(false)}
        pwaOnline={pwa?.isOnline}
        onSignIn={onSignIn}
      />
    </header>
  );
}
