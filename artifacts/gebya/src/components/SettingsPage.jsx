import { lazy, Suspense, useState, useEffect } from 'react';
import { Eye, EyeOff, Download, Trash2, Info, Shield, ChevronRight, Store, Phone, Check, CreditCard, RefreshCw, Plus, MessageCircle, X, TrendingUp, TrendingDown, Share2, Sun, Moon, Users, Building2, Sparkles, Bell } from 'lucide-react';
import { usePrivacy } from '../context/PrivacyContext';
import { useLang } from '../context/LangContext';
import { useTheme } from '../context/ThemeContext';
import { formatEthiopian } from '../utils/ethiopianCalendar';
import { fmt, parseInput } from '../utils/numformat';
import db from '../db';
import { ALL_BANKS, ALL_WALLETS } from './PaymentTypeChips';
import { fireToast } from './Toast';
import { normalizeTelegram } from '../utils/customerTelegram';
import { isValidSubscriber, extractSubscriberDigits } from '../utils/phoneNumber';
import {
  DEFAULT_CHANNEL_DEFINITIONS,
  getChannelDefinition,
  updateChannel,
  removeChannel,
  addCustomChannel,
} from '../utils/paymentChannels';

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

// Commit S: SettingsSection now carries an optional icon + status pill +
// subtitle so each row shows its own readiness state without expanding.
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

// Commit S: tiny label between section groups (COMMERCE / PEOPLE / ...).
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

// Commit S: Hero strip with avatar + name + setup-ready progress meter.
function ReadinessHero({ shopProfile, paymentChannels = [], catalogEntries = [], recurring = [], lang }) {
  const name = shopProfile?.name || '';
  const initials = (() => {
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  })();

  // Readiness — weighted score across the 4 commerce setup pillars.
  const profileScore = (() => {
    if (!shopProfile?.name) return 0;
    let s = 60;
    if (shopProfile.phone) s += 25;
    if (shopProfile.telegram) s += 15;
    return Math.min(s, 100);
  })();
  const channelsTotal = paymentChannels.length || 1;
  const channelsConfigured = paymentChannels.filter(c => c.enabled && (
    c.usePhoneFromShop || c.phone || c.account
  )).length;
  const channelScore = Math.round((channelsConfigured / channelsTotal) * 100);
  const itemsScore = (catalogEntries || []).filter(e => e.active !== false).length > 0 ? 100 : 0;
  const recurringScore = (recurring || []).length > 0 ? 100 : 0;
  const overallPct = Math.round(
    profileScore * 0.40 + channelScore * 0.40 + itemsScore * 0.10 + recurringScore * 0.10
  );

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #1B4332 0%, #2d6a4f 100%)',
        color: '#fff',
        borderRadius: 18,
        padding: '14px 16px 16px',
        boxShadow: '0 4px 16px -8px rgba(27,67,50,0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div
          style={{
            width: 46, height: 46, borderRadius: '50%',
            background: '#C4883A',
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: '1.05rem',
            border: '2px solid rgba(255,255,255,0.25)',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.66rem', opacity: 0.7, fontWeight: 600 }}>
            {lang === 'am' ? 'ሰላም' : 'Hi'}
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name || (lang === 'am' ? 'ሱቅ' : 'Shop')}
          </div>
          <div style={{ fontSize: '0.65rem', opacity: 0.65, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {shopProfile?.phone || (lang === 'am' ? 'ስልክ አልተጨመረም' : 'No phone added')}
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 12,
          padding: '9px 12px',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {lang === 'am' ? 'ዝግጁ ነው' : 'Setup ready'}
          </div>
          <div style={{ fontFamily: 'Manrope, system-ui, sans-serif', fontSize: '1.1rem', fontWeight: 800, color: '#fde68a', lineHeight: 1 }}>
            {overallPct}%
          </div>
        </div>
        <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden', maxWidth: 120 }}>
          <div
            style={{
              height: '100%',
              width: `${overallPct}%`,
              background: 'linear-gradient(90deg, #fde68a 0%, #fbbf24 100%)',
              borderRadius: 999,
              transition: 'width .3s ease',
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT CHANNELS SECTION (Commit C.4) ──────────────────────────────
//
// Row per channel. Each row collapses to just the toggle + name when
// disabled; expands to show phone/account fields when enabled.
// Auto-saves on every change — there's no Save button.
function PaymentChannelsSection({ channels, shopPhone, enabledCount, configuredCount, onChange, lang }) {
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [addKind, setAddKind] = useState('bank');
  const [addName, setAddName] = useState('');

  const wallets = channels.filter(c => c.kind === 'wallet');
  const banks = channels.filter(c => c.kind === 'bank');

  const handleToggle = (channel) => {
    onChange?.(updateChannel(channels, channel.id, { enabled: !channel.enabled }));
  };
  const handleField = (channelId, field, value) => {
    onChange?.(updateChannel(channels, channelId, { [field]: value }));
  };
  const handleToggleSameAsShop = (channelId, isSame) => {
    onChange?.(updateChannel(channels, channelId, {
      usePhoneFromShop: isSame,
      phone: isSame ? '' : '',
    }));
  };
  const handleRemove = (channelId) => {
    if (!window.confirm(lang === 'am' ? 'ይህን መንገድ ይሰርዙ?' : 'Remove this channel?')) return;
    onChange?.(removeChannel(channels, channelId));
  };
  const handleAddCustom = () => {
    const name = addName.trim();
    if (!name) return;
    onChange?.(addCustomChannel(channels, { kind: addKind, name }));
    setAddName('');
    setShowAddCustom(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
      {/* Header strip with progress chip */}
      <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: '#f0f9f4' }}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" style={{ color: '#047857' }} />
            <p className="text-sm font-black" style={{ color: '#065f46' }}>
              {lang === 'am' ? 'የክፍያ መንገዶች' : 'Payment channels'}
            </p>
          </div>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: configuredCount > 0 ? '#16a34a' : enabledCount > 0 ? '#b8842c' : '#94a3b8',
              color: '#fff',
            }}
          >
            {configuredCount}/{enabledCount} {lang === 'am' ? 'ተዋቅሯል' : 'configured'}
          </span>
        </div>
        <p className="text-[11px] leading-snug" style={{ color: '#047857' }}>
          {lang === 'am'
            ? 'መንገድ ይምረጡ — በሽያጭ መመዝገብ ጊዜ እና ለደንበኞች በሚላክ የመክፈያ አገናኝ ላይ ይታያል።'
            : 'Enable channels — they appear when you record a sale AND on the Pay-it-now link for customers.'}
        </p>
      </div>

      {/* Wallets group */}
      <div className="px-5 py-3" style={{ borderBottom: '1px solid #f0f9f4' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
          📱 {lang === 'am' ? 'ሞባይል ዋሌት' : 'Mobile wallets'}
        </p>
        <div className="flex flex-col gap-2">
          {wallets.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              shopPhone={shopPhone}
              onToggle={() => handleToggle(c)}
              onField={(field, value) => handleField(c.id, field, value)}
              onToggleSameAsShop={(v) => handleToggleSameAsShop(c.id, v)}
              onRemove={() => handleRemove(c.id)}
              lang={lang}
            />
          ))}
        </div>
      </div>

      {/* Banks group */}
      <div className="px-5 py-3" style={{ borderBottom: '1px solid #f0f9f4' }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
          🏦 {lang === 'am' ? 'ባንኮች' : 'Banks'}
        </p>
        <div className="flex flex-col gap-2">
          {banks.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              shopPhone={shopPhone}
              onToggle={() => handleToggle(c)}
              onField={(field, value) => handleField(c.id, field, value)}
              onToggleSameAsShop={(v) => handleToggleSameAsShop(c.id, v)}
              onRemove={() => handleRemove(c.id)}
              lang={lang}
            />
          ))}
        </div>
      </div>

      {/* Add custom channel */}
      <div className="px-5 py-3">
        {showAddCustom ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setAddKind('bank')}
                className="flex-1 py-2 text-xs font-bold border-2 rounded-lg press-scale"
                style={{
                  background: addKind === 'bank' ? 'rgba(196,136,58,0.15)' : '#fff',
                  borderColor: addKind === 'bank' ? '#C4883A' : '#e8e2d8',
                  color: addKind === 'bank' ? '#6b4f1d' : '#6b7280',
                }}
              >
                🏦 {lang === 'am' ? 'ባንክ' : 'Bank'}
              </button>
              <button
                type="button"
                onClick={() => setAddKind('wallet')}
                className="flex-1 py-2 text-xs font-bold border-2 rounded-lg press-scale"
                style={{
                  background: addKind === 'wallet' ? 'rgba(196,136,58,0.15)' : '#fff',
                  borderColor: addKind === 'wallet' ? '#C4883A' : '#e8e2d8',
                  color: addKind === 'wallet' ? '#6b4f1d' : '#6b7280',
                }}
              >
                📱 {lang === 'am' ? 'ዋሌት' : 'Wallet'}
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                placeholder={lang === 'am' ? 'ስም ለምሳሌ Zemen Bank' : 'e.g. Zemen Bank'}
                autoFocus
                className="flex-1 px-3 py-2 border-2 rounded-lg text-sm focus:outline-none"
                style={{ borderColor: '#e8e2d8' }}
              />
              <button
                onClick={handleAddCustom}
                disabled={!addName.trim()}
                className="px-3 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 press-scale"
                style={{ background: addName.trim() ? '#C4883A' : '#e5e7eb' }}
              >
                {lang === 'am' ? 'ጨምር' : 'Add'}
              </button>
              <button
                onClick={() => { setShowAddCustom(false); setAddName(''); }}
                className="px-2 py-2 rounded-lg text-sm font-bold press-scale"
                style={{ background: 'transparent', color: '#6b7280' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddCustom(true)}
            className="w-full py-2.5 text-sm font-bold border-2 border-dashed rounded-lg press-scale flex items-center justify-center gap-1.5"
            style={{ borderColor: '#C4883A', color: '#6b4f1d', background: 'rgba(196,136,58,0.04)' }}
          >
            <Plus className="w-4 h-4" />
            {lang === 'am' ? 'ሌላ መንገድ ጨምር' : 'Add custom channel'}
          </button>
        )}
      </div>

      <div className="px-5 pb-4">
        <p className="text-[10px] leading-snug" style={{ color: '#9ca3af' }}>
          🔒 {lang === 'am'
            ? 'መረጃው በዚህ ስልክ ላይ ብቻ ይቀመጣል። Gebya ገንዘቡን አያይም — እርስዎ በቀጥታ ይቀበላሉ።'
            : 'Stored on this phone only. Gebya never touches the money — customers pay you direct.'}
        </p>
      </div>
    </div>
  );
}

// Single row in the Payment Channels section. Collapses when disabled.
function ChannelRow({ channel, shopPhone, onToggle, onField, onToggleSameAsShop, onRemove, lang }) {
  const def = getChannelDefinition(channel.id);
  const emoji = def?.emoji || (channel.kind === 'bank' ? '🏦' : '📱');
  const ussd = def?.ussd;

  // What fields make sense for this channel?
  // - Wallet (telebirr-style): phone only (with same-as-shop toggle)
  // - Wallet (CBE Birr): phone + optional bank account
  // - Bank: account number only
  // - Custom wallet: phone
  // - Custom bank: account
  const showPhone = channel.kind === 'wallet';
  const showAccount = channel.kind === 'bank' || channel.id === 'cbe_birr';
  const showSameAsShop = channel.id === 'telebirr';

  // Phone displayed in subtitle when usePhoneFromShop = true
  const effectivePhone = channel.usePhoneFromShop ? shopPhone : channel.phone;

  return (
    <div
      style={{
        background: channel.enabled ? '#f8fdf9' : '#fafafa',
        border: `1.5px solid ${channel.enabled ? '#86efac' : '#e5e7eb'}`,
        borderRadius: 12,
        padding: '10px 12px',
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
    >
      {/* Top row: emoji + name + toggle + remove (custom only) */}
      <div className="flex items-center gap-2">
        <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: channel.enabled ? '#1a1a1a' : '#9ca3af' }}>
            {channel.name}
          </p>
          {ussd && channel.enabled && (
            <p className="text-[10px]" style={{ color: '#6b7280' }}>
              USSD {ussd}
              {effectivePhone && ` · ${effectivePhone}`}
            </p>
          )}
        </div>
        {channel.custom && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={lang === 'am' ? 'አስወግድ' : 'Remove'}
            className="press-scale"
            style={{
              padding: 4, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer',
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {/* Toggle */}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={channel.enabled}
          aria-label={channel.enabled ? 'On' : 'Off'}
          className="press-scale"
          style={{
            width: 40, height: 24, borderRadius: 999,
            background: channel.enabled ? '#16a34a' : '#d1d5db',
            border: 'none', cursor: 'pointer', position: 'relative',
            flexShrink: 0, transition: 'background 0.15s ease',
          }}
        >
          <div style={{
            position: 'absolute',
            top: 2, left: channel.enabled ? 18 : 2,
            width: 20, height: 20, borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            transition: 'left 0.18s ease',
          }} />
        </button>
      </div>

      {/* Expanded fields — only when enabled */}
      {channel.enabled && (showPhone || showAccount) && (
        <div className="mt-2.5 flex flex-col gap-2" style={{ paddingLeft: 28 }}>
          {showSameAsShop && (
            <label className="flex items-center gap-1.5 text-[12px] font-semibold cursor-pointer" style={{ color: '#047857' }}>
              <input
                type="checkbox"
                checked={!!channel.usePhoneFromShop}
                onChange={(e) => onToggleSameAsShop(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#16a34a' }}
              />
              {lang === 'am' ? 'ከሱቅ ስልክ ጋር አንድ' : 'Same as shop phone'}
              {channel.usePhoneFromShop && shopPhone && (
                <span className="ml-1 text-[11px] font-bold" style={{ color: '#065f46' }}>
                  ({shopPhone})
                </span>
              )}
            </label>
          )}
          {showPhone && !channel.usePhoneFromShop && (
            <div className="flex gap-0">
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 10px',
                  background: '#fff',
                  border: '2px solid #86efac', borderRight: 'none',
                  borderRadius: '8px 0 0 8px',
                  fontSize: '0.85rem', fontWeight: 800, color: '#1B4332',
                  minWidth: 56,
                }}
              >
                +251
              </div>
              <input
                type="tel"
                inputMode="numeric"
                value={extractSubscriberDigits(channel.phone)}
                onChange={(e) => onField('phone', e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder={lang === 'am' ? '9XXXXXXXX' : '9XXXXXXXX'}
                maxLength={9}
                className="flex-1 p-2 border-2 focus:outline-none text-sm"
                style={{
                  borderRadius: '0 8px 8px 0',
                  borderColor: '#86efac',
                  background: '#fff',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>
          )}
          {showAccount && (
            <input
              type="text"
              inputMode="numeric"
              value={channel.account || ''}
              onChange={(e) => onField('account', e.target.value)}
              placeholder={lang === 'am'
                ? (channel.kind === 'bank' ? 'የመለያ ቁጥር' : 'CBE ባንክ መለያ (አማራጭ)')
                : (channel.kind === 'bank' ? 'Account number' : 'CBE bank account (optional)')}
              className="p-2 border-2 rounded-lg text-sm focus:outline-none"
              style={{
                borderColor: '#86efac',
                background: '#fff',
              }}
            />
          )}
        </div>
      )}
    </div>
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
  onSaveStaffMember,
  onUpdateStaffMember,
  onDeactivateStaffMember,
  onReactivateStaffMember,
  onSetActiveStaffMember,
  onSaveOwnerAlertSettings,
  enabledProviders,
  onProvidersChange,
  // Commit C.4 — unified payment channels
  paymentChannels = [],
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
  const { hidden, toggle } = usePrivacy();
  const { lang, t } = useLang();
  const { theme, setTheme } = useTheme();
  const FREQ_LABELS = lang === 'am' ? FREQ_LABELS_AM : FREQ_LABELS_EN;
  const [openSection, setOpenSection] = useState(null);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);
  // Commit E: backup + restore state
  const [lastBackupAt, setLastBackupAt] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoreConfirmStep2, setRestoreConfirmStep2] = useState(false);
  const [catalogForm, setCatalogForm] = useState({
    id: null,
    name: '',
    kind: 'item',
    default_price: '',
    default_cost: '',
    note: '',
  });
  // Commit S: supplier form state removed. Supplier management lives in the
  // Credit tab → Suppliers view, which is the better home.
  const [staffName, setStaffName] = useState('');
  const [staffDeactivateTarget, setStaffDeactivateTarget] = useState(null);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editingStaffName, setEditingStaffName] = useState('');
  const [alertMode, setAlertMode] = useState(ownerAlertSettings?.mode || 'high_value');
  const [alertThreshold, setAlertThreshold] = useState(String(ownerAlertSettings?.threshold_amount ?? 5000));
  const [alertSummaryTime, setAlertSummaryTime] = useState(ownerAlertSettings?.summary_time || '20:00');

  useEffect(() => {
    setAlertMode(ownerAlertSettings?.mode || 'high_value');
    setAlertThreshold(String(ownerAlertSettings?.threshold_amount ?? 5000));
    setAlertSummaryTime(ownerAlertSettings?.summary_time || '20:00');
  }, [ownerAlertSettings]);

  const [editName, setEditName] = useState(shopProfile?.name || '');
  const [editPhoneDigits, setEditPhoneDigits] = useState(() => {
    const raw = shopProfile?.phone || '';
    return raw.startsWith('+251') ? raw.slice(4) : raw.replace(/\D/g, '').slice(-9);
  });
  const [editTelegram, setEditTelegram] = useState(shopProfile?.telegram || '');
  const [editBusinessType, setEditBusinessType] = useState(shopProfile?.businessType || 'retail-shop');
  const [profileSaved, setProfileSaved] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  // Commit C.4: Payment-account state moved out of the profile form into the
  // new unified Payment Channels section. See `paymentChannels` prop.

  // Phone validation now lives in utils/phoneNumber.js — single source of truth.
  const phoneValid = !editPhoneDigits || isValidSubscriber(editPhoneDigits);
  const normalizedTelegram = normalizeTelegram(editTelegram);
  const telegramValid = !editTelegram.trim() || !!normalizedTelegram;
  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 9) setEditPhoneDigits(raw);
  };

  useEffect(() => {
    const rawPhone = shopProfile?.phone || '';
    setEditName(shopProfile?.name || '');
    setEditPhoneDigits(rawPhone.startsWith('+251') ? rawPhone.slice(4) : rawPhone.replace(/\D/g, '').slice(-9));
    setEditTelegram(shopProfile?.telegram || '');
    setEditBusinessType(shopProfile?.businessType || 'retail-shop');

    // Commit C.4: payment-channel sync handled by the new Payment Channels
    // section — no profile-level payment state to sync here.
  }, [shopProfile]);

  // Commit C.4: Legacy `providers`/`customBanks`/`customWallets` state is
  // gone — replaced by the unified `paymentChannels` prop. The old loader
  // useEffect is no longer needed.

  useEffect(() => {
    const loadVoiceQuality = async () => {
      try {
        const [statsRow, eventsRow] = await Promise.all([
          db.analytics.get('voice_quality_stats'),
          db.analytics.get('voice_quality_events'),
        ]);

        let stats = null;
        let events = [];

        try { stats = statsRow?.value ? JSON.parse(statsRow.value) : null; } catch { stats = null; }
        try { events = eventsRow?.value ? JSON.parse(eventsRow.value) : []; } catch { events = []; }

        setVoiceQuality({
          stats,
          events: Array.isArray(events) ? events.slice().reverse().slice(0, 8) : [],
        });
      } catch {
        setVoiceQuality({ stats: null, events: [] });
      }
    };

    loadVoiceQuality();
  }, []);

  // Commit E: load the last-backup timestamp on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await db.settings.get('gebya_last_backup_at');
        if (!cancelled && row?.value) setLastBackupAt(Number(row.value));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const [recurring, setRecurring] = useState(recurringExpenses || []);
  const [reName, setReName] = useState('');
  const [reAmount, setReAmount] = useState('');
  const [reFreq, setReFreq] = useState('monthly');
  const [showReForm, setShowReForm] = useState(false);

  const [shareCopied, setShareCopied] = useState(false);
  const [voiceQuality, setVoiceQuality] = useState({ stats: null, events: [] });
  const activeCatalogEntries = (catalogEntries || []).filter(entry => entry.active !== false);
  // selectedSupplier — removed in Commit S along with the suppliers section

  // Build the payments payload — telebirr defaults to '' when "Same as shop phone"
  // is checked, signaling the URL builder to fall back to shop_phone.
  const handleProfileSave = async () => {
    if (!editName.trim() || !phoneValid || !telegramValid) return;
    const fullPhone = editPhoneDigits ? '+251' + editPhoneDigits : '';
    // Commit C.4: payments are now owned by the Payment Channels section.
    // Profile save handles only identity fields.
    await onProfileSave(editName.trim(), fullPhone, normalizedTelegram || '', editBusinessType);
    setEditTelegram(normalizedTelegram || '');
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const handleAddStaffMember = async () => {
    const saved = await onSaveStaffMember?.({ display_name: staffName, role: 'staff', active: true });
    if (!saved) return;
    setStaffName('');
  };

  const handleSaveOwnerAlerts = async () => {
    const threshold = Number(parseInput(alertThreshold));
    await onSaveOwnerAlertSettings?.({
      mode: alertMode,
      threshold_amount: Number.isFinite(threshold) && threshold >= 0 ? threshold : 0,
      summary_time: alertSummaryTime || '20:00',
    });
  };

  const handleConfirmDeactivateStaff = async () => {
    if (!staffDeactivateTarget?.id) return;
    const ok = await onDeactivateStaffMember?.(staffDeactivateTarget.id);
    if (!ok) return;
    setStaffDeactivateTarget(null);
  };

  const startEditingStaffMember = (member) => {
    setEditingStaffId(member.id);
    setEditingStaffName(member.display_name || '');
  };

  const cancelEditingStaffMember = () => {
    setEditingStaffId(null);
    setEditingStaffName('');
  };

  const handleSaveEditedStaffMember = async () => {
    if (!editingStaffId) return;
    const saved = await onUpdateStaffMember?.(editingStaffId, { display_name: editingStaffName });
    if (!saved) return;
    cancelEditingStaffMember();
  };

  const csvCell = (value) => {
    const stringValue = value == null ? '' : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  };

  const buildCsvSection = (title, headers, rows) => {
    return [
      [csvCell(title)],
      headers.map(csvCell),
      ...rows.map(row => row.map(csvCell)),
      [],
    ].map(row => row.join(',')).join('\n');
  };

  const exportToCSV = async () => {
    const [customerRows, customerTransactionRows, supplierRows, supplierTransactionRows] = await Promise.all([
      db.customers.toArray(),
      db.customer_transactions.toArray(),
      db.suppliers?.toArray?.() || [],
      db.supplier_transactions?.toArray?.() || [],
    ]);

    const transactionSection = buildCsvSection(
      'Transactions',
      ['Date (Ethiopian)', 'Type', 'Item', 'Quantity', 'Amount (birr)', 'Cost (birr)', 'Profit (birr)', 'Payment', 'Customer', 'Entered by', 'Actor role', 'Actor staff ID'],
      transactions.map(tx => [
        formatEthiopian(tx.created_at),
        tx.type,
        tx.item_name || '',
        tx.quantity || 1,
        tx.amount || 0,
        tx.cost_price || '',
        tx.profit !== null && tx.profit !== undefined ? tx.profit : '',
        [tx.payment_type, tx.payment_provider].filter(Boolean).join(' ') || '',
        tx.customer_name || '',
        tx.actor_name_snapshot || '',
        tx.actor_role || '',
        tx.actor_staff_member_id ?? '',
      ])
    );

    const customerSection = buildCsvSection(
      'Customers',
      ['ID', 'Name', 'Phone', 'Note', 'Telegram', 'Telegram notify enabled', 'Created at (Ethiopian)', 'Updated at (Ethiopian)'],
      customerRows.map(customer => [
        customer.id,
        customer.display_name || '',
        customer.phone_number || '',
        customer.note || '',
        customer.telegram_username || '',
        customer.telegram_notify_enabled ? 'yes' : 'no',
        customer.created_at ? formatEthiopian(customer.created_at) : '',
        customer.updated_at ? formatEthiopian(customer.updated_at) : '',
      ])
    );

    const customerTransactionSection = buildCsvSection(
      'Customer Ledger Transactions',
      ['ID', 'Customer ID', 'Type', 'Amount (birr)', 'Item note', 'Due date (Ethiopian)', 'Created at (Ethiopian)', 'Updated at (Ethiopian)', 'Entered by', 'Actor role', 'Actor staff ID'],
      customerTransactionRows.map(entry => [
        entry.id,
        entry.customer_id,
        entry.type,
        entry.amount || 0,
        entry.item_note || '',
        entry.due_date ? formatEthiopian(entry.due_date) : '',
        entry.created_at ? formatEthiopian(entry.created_at) : '',
        entry.updated_at ? formatEthiopian(entry.updated_at) : '',
        entry.actor_name_snapshot || '',
        entry.actor_role || '',
        entry.actor_staff_member_id ?? '',
      ])
    );

    const supplierSection = buildCsvSection(
      'Suppliers',
      ['ID', 'Name', 'Phone', 'Note', 'Active', 'Created at (Ethiopian)', 'Updated at (Ethiopian)'],
      supplierRows.map(supplier => [
        supplier.id,
        supplier.display_name || '',
        supplier.phone_number || '',
        supplier.note || '',
        supplier.active === false ? 'no' : 'yes',
        supplier.created_at ? formatEthiopian(supplier.created_at) : '',
        supplier.updated_at ? formatEthiopian(supplier.updated_at) : '',
      ])
    );

    const supplierTransactionSection = buildCsvSection(
      'Supplier Ledger Transactions',
      ['ID', 'Supplier ID', 'Type', 'Item', 'Quantity', 'Amount (birr)', 'Note', 'Created at (Ethiopian)', 'Updated at (Ethiopian)', 'Entered by', 'Actor role', 'Actor staff ID'],
      supplierTransactionRows.map(entry => [
        entry.id,
        entry.supplier_id,
        entry.type,
        entry.item_name || '',
        entry.quantity != null ? entry.quantity : '',
        entry.amount || 0,
        entry.note || '',
        entry.created_at ? formatEthiopian(entry.created_at) : '',
        entry.updated_at ? formatEthiopian(entry.updated_at) : '',
        entry.actor_name_snapshot || '',
        entry.actor_role || '',
        entry.actor_staff_member_id ?? '',
      ])
    );

    const csv = [
      transactionSection,
      customerSection,
      customerTransactionSection,
      supplierSection,
      supplierTransactionSection,
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gebya-backup-full-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearAllData = async () => {
    await Promise.all([
      db.transactions.clear(),
      db.customers.clear(),
      db.customer_transactions.clear(),
      db.catalog_entries.clear(),
      db.suppliers.clear(),
      db.supplier_transactions.clear(),
      db.quick_notes?.clear?.() || Promise.resolve(),
      db.owner_alerts?.clear?.() || Promise.resolve(),
      db.staff_members?.clear?.() || Promise.resolve(),
      db.credit_records?.clear?.() || Promise.resolve(),
      db.credit_payment_logs?.clear?.() || Promise.resolve(),
      db.settings.clear(),
      db.analytics.clear(),
    ]);
    setCleared(true);
    setShowClearConfirm(false);
    setTimeout(() => window.location.reload(), 800);
  };

  // ─── Commit E: JSON backup + restore ────────────────────────────────────
  //
  // Full-fidelity Dexie dump (photos included as base64). Single JSON file
  // restorable on the same device or a new phone after reinstall.
  //
  // Shape:
  //   {
  //     gebya_backup_version: 1,
  //     exported_at: ISO timestamp,
  //     tables: {
  //       transactions, customers, customer_transactions, catalog_entries,
  //       suppliers, supplier_transactions, quick_notes, owner_alerts, staff_members,
  //       staff_sale_events, settings, analytics
  //     }
  //   }

  const buildBackupJSON = async () => {
    const [
      transactionsRows, customerRows, customerTxRows, catalogRows,
      supplierRows, supplierTxRows, quickNoteRows, ownerAlertRows, staffRows, staffSaleEventRows, settingsRows, analyticsRows,
    ] = await Promise.all([
      db.transactions.toArray(),
      db.customers.toArray(),
      db.customer_transactions.toArray(),
      db.catalog_entries?.toArray?.() || [],
      db.suppliers?.toArray?.() || [],
      db.supplier_transactions?.toArray?.() || [],
      db.quick_notes?.toArray?.() || [],
      db.owner_alerts?.toArray?.() || [],
      db.staff_members?.toArray?.() || [],
      db.staff_sale_events?.toArray?.() || [],
      db.settings?.toArray?.() || [],
      db.analytics?.toArray?.() || [],
    ]);
    return {
      gebya_backup_version: 1,
      exported_at: new Date().toISOString(),
      app_version: '1.0',
      counts: {
        transactions: transactionsRows.length,
        customers: customerRows.length,
        customer_transactions: customerTxRows.length,
        suppliers: supplierRows.length,
        supplier_transactions: supplierTxRows.length,
        quick_notes: quickNoteRows.length,
        owner_alerts: ownerAlertRows.length,
        catalog_entries: catalogRows.length,
        staff_members: staffRows.length,
        staff_sale_events: staffSaleEventRows.length,
      },
      tables: {
        transactions: transactionsRows,
        customers: customerRows,
        customer_transactions: customerTxRows,
        catalog_entries: catalogRows,
        suppliers: supplierRows,
        supplier_transactions: supplierTxRows,
        quick_notes: quickNoteRows,
        owner_alerts: ownerAlertRows,
        staff_members: staffRows,
        staff_sale_events: staffSaleEventRows,
        settings: settingsRows,
        analytics: analyticsRows,
      },
    };
  };

  const exportToJSON = async () => {
    try {
      const data = await buildBackupJSON();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gebya-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // Record last backup timestamp
      try { await db.settings.put({ key: 'gebya_last_backup_at', value: Date.now() }); } catch { /* ignore */ }
      setLastBackupAt(Date.now());
      fireToast(lang === 'am' ? '✓ ምትኬ ወረደ' : '✓ Backup downloaded', 1800);
    } catch (err) {
      if (import.meta.env.DEV) console.error('JSON backup failed:', err);
      fireToast(lang === 'am' ? 'ምትኬ አልተሳካም' : 'Backup failed', 2400);
    }
  };

  const shareBackup = async () => {
    try {
      const data = await buildBackupJSON();
      const json = JSON.stringify(data, null, 2);
      const filename = `gebya-backup-${new Date().toISOString().split('T')[0]}.json`;
      // navigator.share with files — supported on most mobile browsers
      if (navigator.canShare && typeof File === 'function') {
        try {
          const file = new File([json], filename, { type: 'application/json' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'Gebya backup',
              text: lang === 'am'
                ? `Gebya ምትኬ · ${new Date().toLocaleDateString()}`
                : `Gebya backup · ${new Date().toLocaleDateString()}`,
            });
            try { await db.settings.put({ key: 'gebya_last_backup_at', value: Date.now() }); } catch { /* ignore */ }
            setLastBackupAt(Date.now());
            return;
          }
        } catch (shareErr) {
          if (import.meta.env.DEV) console.warn('File share failed, falling back:', shareErr);
        }
      }
      // Fallback: download
      await exportToJSON();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Share backup failed:', err);
      fireToast(lang === 'am' ? 'ማጋራት አልተሳካም' : 'Share failed', 2400);
    }
  };

  const handleImportFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data?.gebya_backup_version !== 1) {
          throw new Error('Not a valid Gebya backup file');
        }
        setRestoreTarget(data);
      } catch (err) {
        fireToast(lang === 'am' ? 'የተበላሸ ምትኬ ፋይል' : 'Invalid backup file', 2400);
        if (import.meta.env.DEV) console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // allow re-selecting the same file later
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget?.tables) return;
    const { tables } = restoreTarget;
    try {
      // Wipe everything first, then bulk-add. Wrap in a single Dexie transaction.
      await db.transaction('rw',
        db.transactions, db.customers, db.customer_transactions, db.catalog_entries,
        db.suppliers, db.supplier_transactions, db.quick_notes, db.owner_alerts, db.staff_members, db.staff_sale_events, db.settings, db.analytics,
        async () => {
          await Promise.all([
            db.transactions.clear(),
            db.customers.clear(),
            db.customer_transactions.clear(),
            db.catalog_entries.clear(),
            db.suppliers.clear(),
            db.supplier_transactions.clear(),
            db.quick_notes?.clear?.() || Promise.resolve(),
            db.owner_alerts?.clear?.() || Promise.resolve(),
            db.staff_members?.clear?.() || Promise.resolve(),
            db.staff_sale_events?.clear?.() || Promise.resolve(),
            db.settings.clear(),
            db.analytics?.clear?.() || Promise.resolve(),
          ]);
          // Restore in dependency order (parents first)
          if (Array.isArray(tables.customers))             await db.customers.bulkAdd(tables.customers);
          if (Array.isArray(tables.suppliers))             await db.suppliers.bulkAdd(tables.suppliers);
          if (Array.isArray(tables.catalog_entries))       await db.catalog_entries.bulkAdd(tables.catalog_entries);
          if (Array.isArray(tables.staff_members))         await db.staff_members.bulkAdd(tables.staff_members);
          if (Array.isArray(tables.transactions))          await db.transactions.bulkAdd(tables.transactions);
          if (Array.isArray(tables.customer_transactions)) await db.customer_transactions.bulkAdd(tables.customer_transactions);
          if (Array.isArray(tables.supplier_transactions)) await db.supplier_transactions.bulkAdd(tables.supplier_transactions);
          if (Array.isArray(tables.quick_notes))           await db.quick_notes.bulkAdd(tables.quick_notes);
          if (Array.isArray(tables.owner_alerts))          await db.owner_alerts.bulkAdd(tables.owner_alerts);
          if (Array.isArray(tables.staff_sale_events))     await db.staff_sale_events.bulkAdd(tables.staff_sale_events);
          if (Array.isArray(tables.settings))              await db.settings.bulkAdd(tables.settings);
          if (Array.isArray(tables.analytics))             await db.analytics.bulkAdd(tables.analytics);
        }
      );
      setRestoreTarget(null);
      setRestoreConfirmStep2(false);
      fireToast(lang === 'am' ? '✓ መልሶ ተመለሰ — በመጫን ላይ…' : '✓ Restored — reloading…', 1800);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Restore failed:', err);
      fireToast(lang === 'am' ? 'መልሶ ማስቀመጥ አልተሳካም' : 'Restore failed', 2600);
      setRestoreTarget(null);
      setRestoreConfirmStep2(false);
    }
  };

  // Commit C.4: All bank/wallet toggling + custom add now flows through the
  // unified `paymentChannels` prop via the PaymentChannelsSection component.
  // The legacy `toggleBank` / `toggleWallet` / `addCustomBank` / `addCustomWallet`
  // helpers have been removed (their persistence logic moved into App.jsx's
  // handleSavePaymentChannels which writes the canonical key + derives the
  // legacy keys for downstream consumers).

  const addRecurring = async () => {
    const amt = parseFloat(reAmount);
    if (!reName.trim() || !amt) return;
    const newItem = { id: Date.now(), name: reName.trim(), amount: amt, freq: reFreq };
    const updated = [...recurring, newItem];
    setRecurring(updated);
    await db.settings.put({ key: 'recurring_expenses', value: JSON.stringify(updated) });
    onRecurringChange?.(updated);
    setReName('');
    setReAmount('');
    setReFreq('monthly');
    setShowReForm(false);
  };

  const removeRecurring = async (id) => {
    const updated = recurring.filter(r => r.id !== id);
    setRecurring(updated);
    await db.settings.put({ key: 'recurring_expenses', value: JSON.stringify(updated) });
    onRecurringChange?.(updated);
  };

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

  const totalEntries = transactions.length;
  const totalCustomersWithLedger = customerSummaries.length;
  const totalSupplierDubie = (supplierSummaries || []).reduce((sum, supplier) => sum + Math.max(supplier.balance || 0, 0), 0);
  const currentFullPhone = editPhoneDigits ? '+251' + editPhoneDigits : '';
  // Commit C.4: profile-form changes are scoped to identity only. Payment
  // changes live in their own section (Payment Channels) with auto-save on
  // every toggle/field — no Save button needed there.
  const profileChanged = (
    editName.trim() !== (shopProfile?.name || '') ||
    currentFullPhone !== (shopProfile?.phone || '') ||
    editTelegram.trim() !== (shopProfile?.telegram || '') ||
    editBusinessType !== (shopProfile?.businessType || 'retail-shop')
  );

  // Count enabled + configured payment channels — drives the summary chip
  // shown in the new Payment Channels section header.
  const enabledChannelsCount = paymentChannels.filter(c => c.enabled).length;
  const configuredChannelsCount = paymentChannels.filter(c => c.enabled && (
    c.usePhoneFromShop || !!c.phone || !!c.account
  )).length;

  const voiceStats = voiceQuality.stats;
  const capturedVoices = voiceStats?.captured || 0;
  const savedVoices = voiceStats?.saved || 0;
  const editedVoices = voiceStats?.saved_with_edit || 0;
  const untouchedVoices = voiceStats?.saved_without_edit || 0;
  const correctionRate = savedVoices > 0 ? Math.round((editedVoices / savedVoices) * 100) : null;
  const saveWithoutEditRate = savedVoices > 0 ? Math.round((untouchedVoices / savedVoices) * 100) : null;
  const fixOpenRate = capturedVoices > 0 ? Math.round(((voiceStats?.fix_opened || 0) / capturedVoices) * 100) : null;
  const rerecordRate = capturedVoices > 0 ? Math.round(((voiceStats?.re_recorded || 0) / capturedVoices) * 100) : null;

  const todaySales = (todayTransactions || []).filter(tx => tx.type === 'sale');
  const todayExpenses = (todayTransactions || []).filter(tx => tx.type === 'expense');
  const todayRevenue = todaySales.reduce((s, tx) => s + (tx.amount || 0), 0);
  const todayCostOfGoods = todaySales.reduce((s, tx) => s + ((tx.cost_price || 0) * (tx.quantity || 1)), 0);
  const todayExpTotal = todayExpenses.reduce((s, tx) => s + (tx.amount || 0), 0);
  const todayHasCost = todaySales.some(tx => tx.cost_price > 0);
  const todayProfit = todayRevenue - todayCostOfGoods - todayExpTotal;

  const resetCatalogForm = () => {
    setCatalogForm({
      id: null,
      name: '',
      kind: 'item',
      default_price: '',
      default_cost: '',
      note: '',
    });
  };

  // Commit S: resetSupplierForm / resetSupplierTxForm removed — section deleted

  const handleCatalogSubmit = async () => {
    const saved = await onSaveCatalogEntry?.({
      id: catalogForm.id,
      name: catalogForm.name,
      kind: catalogForm.kind,
      default_price: parseInput(catalogForm.default_price),
      default_cost: parseInput(catalogForm.default_cost),
      note: catalogForm.note,
      active: true,
    });
    if (!saved) return;
    fireToast(catalogForm.id ? 'Catalog updated' : 'Saved to items & services', 1800);
    resetCatalogForm();
  };

  // Commit S: supplier handlers (submit / transaction submit / edit /
  // confirm-delete) removed — section moved to Credit tab fully.

  // ─── Commit S: derive status pills + readiness data ─────────────────────
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

  const displayPrivacyStatus = `${theme === 'dark' ? (lang === 'am' ? 'ጨለማ' : 'Dark') : (lang === 'am' ? 'ብርሃን' : 'Light')} · ${hidden ? (lang === 'am' ? 'ተደብቋል' : 'Hidden') : (lang === 'am' ? 'ይታያል' : 'Visible')}`;

  const dataStatus = totalEntries > 0 ? `${totalEntries}` : (lang === 'am' ? 'ባዶ' : 'Empty');
  const dataTone = totalEntries > 0 ? 'ok' : 'neutral';

  // 5-tap reveal of voice-quality dev panel inside About
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

  // Step-2 confirm for "Start over" (Commit S — sign-off: two-confirm)
  const [showClearConfirmStep2, setShowClearConfirmStep2] = useState(false);

  return (
    <div className="space-y-2 pb-4">

      <Suspense fallback={<SettingsPanelFallback label={t.loading} />}>
        <PwaInstallPanel pwa={pwa} variant="settings" />
      </Suspense>

      {/* ─── Hero ─── */}
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
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
          <div className="px-5 pt-5 pb-4 space-y-3">
            <div className="rounded-xl px-4 py-3 text-xs font-medium" style={{ background: '#FAF8F5', color: '#5b6470', border: '1px solid #e8e2d8' }}>
              {lang === 'am'
                ? 'ይህ የዚህ ስልክ ዋና ባለቤት መለያ ነው። እዚህ የሚደረጉ ለውጦች መላውን ሱቅ ማስታወሻ ይነካሉ።'
                : "This profile is the main owner identity for this phone's notebook. Changes here affect the whole shop notebook."}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                <Store className="w-3.5 h-3.5" /> {t.userName} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder={t.onboardNamePlaceholder || 'e.g. Tigist'}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                style={{ borderColor: editName.trim() ? '#C4883A' : '#e8e2d8' }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> {t.phoneNumber} <span className="text-gray-400 font-normal">{t.onboardPhoneOptional || '(optional)'}</span>
              </label>
              <div className="flex gap-0">
                <div
                  className="flex items-center justify-center px-3 py-3 rounded-l-xl border-2 border-r-0 text-sm font-bold"
                  style={{ background: '#f5f0e8', borderColor: (phoneTouched && !phoneValid) ? '#dc2626' : '#e8e2d8', color: '#1B4332', minWidth: '64px' }}
                >
                  +251
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={editPhoneDigits}
                  onChange={handlePhoneChange}
                  onBlur={() => setPhoneTouched(true)}
                  placeholder="9XXXXXXXX"
                  maxLength={9}
                  className="flex-1 px-4 py-3 border-2 rounded-r-xl text-sm focus:outline-none"
                  style={{ borderColor: (phoneTouched && !phoneValid) ? '#dc2626' : (phoneValid ? '#C4883A' : '#e8e2d8') }}
                />
              </div>
              {phoneTouched && !phoneValid && editPhoneDigits.length > 0 && (
                <p className="text-xs text-red-500 mt-1 font-medium">{t.phoneInvalid}</p>
              )}
              {editPhoneDigits.length === 0 && (
                <p className="text-xs mt-1 font-medium text-gray-400">{t.onboardPhoneHelper || 'You can add your phone later in Settings.'}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" /> {t.telegramLabel}
              </label>
              <input
                type="text"
                value={editTelegram}
                onChange={e => setEditTelegram(e.target.value)}
                placeholder={t.telegramPlaceholder}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                style={{ borderColor: telegramValid ? '#e8e2d8' : '#dc2626' }}
              />
              {!telegramValid && (
                <p className="text-xs text-red-500 mt-1 font-medium">{t.telegramFormatHint}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                <Store className="w-3.5 h-3.5" /> {lang === 'am' ? 'የንግድ አይነት' : 'Business type'}
              </label>
              <select
                value={editBusinessType}
                onChange={e => setEditBusinessType(e.target.value)}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm font-semibold focus:outline-none bg-white"
                style={{ borderColor: '#e8e2d8' }}
              >
                {(lang === 'am' ? BUSINESS_TYPE_OPTIONS_AM : BUSINESS_TYPE_OPTIONS_EN).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="text-xs mt-1 font-medium text-gray-400">
                {lang === 'am'
                  ? 'ለሱቅዎ ተስማሚ ሃሳቦችን ለመስጠት እንጠቀምበታለን።'
                  : 'We use this to tailor suggestions for your shop.'}
              </p>
            </div>



            <button
              onClick={handleProfileSave}
              disabled={!editName.trim() || !phoneValid || !telegramValid || (!profileChanged && !profileSaved)}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all min-h-[48px]"
              style={{
                background: profileSaved ? '#15803d' : (editName.trim() && phoneValid && telegramValid && profileChanged ? '#C4883A' : '#e5e7eb'),
                color: (editName.trim() && phoneValid && telegramValid && (profileChanged || profileSaved)) ? '#fff' : '#9ca3af',
              }}
            >
              {profileSaved ? <><Check className="w-4 h-4" /> {t.saved}</> : t.saveChanges}
            </button>
          </div>
        </div>
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
          enabledCount={enabledChannelsCount}
          configuredCount={configuredChannelsCount}
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
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
          <div className="px-5 pt-5 pb-4 space-y-3">
            {/* Commit P2: bilingual + simplified. Helper line explains the point. */}
            <p className="text-xs" style={{ color: '#6b7280' }}>
              {lang === 'am'
                ? 'በተደጋጋሚ የሚሸጡትን ዕቃዎች ከነ ዋጋቸው ያስቀምጡ — ሽያጭ ሲመዘግቡ በፍጥነት ይመጣሉ።'
                : 'Save items you sell often with their prices — they autofill when you record a sale.'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {['item', 'service'].map(kind => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setCatalogForm(prev => ({ ...prev, kind }))}
                  className="py-3 rounded-xl text-sm font-bold border-2 transition-all min-h-[44px]"
                  style={{
                    borderColor: catalogForm.kind === kind ? '#1B4332' : '#e8e2d8',
                    background: catalogForm.kind === kind ? 'rgba(27,67,50,0.07)' : '#fff',
                    color: catalogForm.kind === kind ? '#1B4332' : '#6b7280',
                  }}
                >
                  {kind === 'item'
                    ? (lang === 'am' ? '📦 ዕቃ' : '📦 Item')
                    : (lang === 'am' ? '🛠 አገልግሎት' : '🛠 Service')}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={catalogForm.name}
              onChange={e => setCatalogForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder={lang === 'am' ? 'ስም · ለምሳሌ ስኳር' : 'Name · e.g. Sugar'}
              className="w-full px-4 py-3 border-2 rounded-xl text-sm font-semibold focus:outline-none"
              style={{ borderColor: catalogForm.name.trim() ? '#C4883A' : '#e8e2d8' }}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#9ca3af' }}>
                  {lang === 'am' ? 'የሽያጭ ዋጋ' : 'Sale price'}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={catalogForm.default_price}
                  onChange={e => setCatalogForm(prev => ({ ...prev, default_price: e.target.value.replace(/[^\d.,]/g, '') }))}
                  placeholder={lang === 'am' ? 'ብር' : 'birr'}
                  className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                  style={{ borderColor: '#e8e2d8' }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#9ca3af' }}>
                  {lang === 'am' ? 'መግዣ ዋጋ (አማራጭ)' : 'Cost (optional)'}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={catalogForm.default_cost}
                  onChange={e => setCatalogForm(prev => ({ ...prev, default_cost: e.target.value.replace(/[^\d.,]/g, '') }))}
                  placeholder={lang === 'am' ? 'ለትርፍ ስሌት' : 'for profit'}
                  className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                  style={{ borderColor: '#e8e2d8' }}
                />
              </div>
            </div>
            <div className="flex gap-2">
              {catalogForm.id && (
                <button
                  type="button"
                  onClick={resetCatalogForm}
                  className="px-4 py-3 rounded-xl text-sm font-bold min-h-[44px]"
                  style={{ background: '#f5f5f5', color: '#6b7280' }}
                >
                  {lang === 'am' ? 'ይቅር' : 'Cancel'}
                </button>
              )}
              <button
                type="button"
                onClick={handleCatalogSubmit}
                disabled={!catalogForm.name.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white min-h-[44px] disabled:opacity-40"
                style={{ background: '#1B4332' }}
              >
                {catalogForm.id
                  ? (lang === 'am' ? 'አስተካክል' : 'Update')
                  : (lang === 'am' ? '＋ አስቀምጥ' : '＋ Save')}
              </button>
            </div>

            <div className="space-y-2 pt-2">
              {(catalogEntries || []).length === 0 && (
                <p className="text-xs text-gray-400">
                  {lang === 'am' ? 'ገና ምንም ዕቃ አልተቀመጠም።' : 'No saved items yet.'}
                </p>
              )}
              {(catalogEntries || []).map(entry => (
                <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: '#FAF8F5', border: '1.5px solid var(--color-border)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-800 text-sm">{entry.name}</p>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: entry.kind === 'service' ? '#dbeafe' : '#dcfce7', color: entry.kind === 'service' ? '#1d4ed8' : '#166534' }}>
                        {entry.kind === 'service'
                          ? (lang === 'am' ? 'አገልግሎት' : 'Service')
                          : (lang === 'am' ? 'ዕቃ' : 'Item')}
                      </span>
                      {entry.active === false && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                          {lang === 'am' ? 'ተደብቋል' : 'Archived'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {lang === 'am' ? 'ሽያጭ' : 'Sale'} {entry.default_price != null ? fmt(entry.default_price) : '-'}
                      {' · '}
                      {lang === 'am' ? 'መግዣ' : 'Cost'} {entry.default_cost != null ? fmt(entry.default_cost) : '-'}
                    </p>
                    {entry.note && <p className="text-xs text-gray-400 mt-1">{entry.note}</p>}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setCatalogForm({
                        id: entry.id,
                        name: entry.name || '',
                        kind: entry.kind || 'item',
                        default_price: entry.default_price != null ? String(entry.default_price) : '',
                        default_cost: entry.default_cost != null ? String(entry.default_cost) : '',
                        note: entry.note || '',
                      })}
                      className="px-3 py-2 rounded-lg text-xs font-bold"
                      style={{ background: '#fff', color: '#1B4332', border: '1px solid #e8e2d8' }}
                    >
                      {lang === 'am' ? 'አስተካክል' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleCatalogEntryActive?.(entry)}
                      className="px-3 py-2 rounded-lg text-xs font-bold"
                      style={{ background: entry.active === false ? '#dcfce7' : '#f3f4f6', color: entry.active === false ? '#166534' : '#6b7280' }}
                    >
                      {entry.active === false
                        ? (lang === 'am' ? 'መልስ' : 'Restore')
                        : (lang === 'am' ? 'ደብቅ' : 'Archive')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <p className="text-xs text-gray-500 mb-3">{t.recurringHint}</p>

            {recurring.length > 0 && (
              <div className="space-y-2 mb-3">
                {recurring.map(re => (
                  <div key={re.id} className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: '#FAF8F5', border: '1.5px solid var(--color-border)' }}>
                    <RefreshCw className="w-4 h-4 flex-shrink-0" style={{ color: '#C4883A' }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{re.name}</p>
                      <p className="text-xs text-gray-500">{fmt(re.amount)} {t.birr} - {FREQ_LABELS[re.freq] || re.freq}</p>
                    </div>
                    <button
                      onClick={() => removeRecurring(re.id)}
                      className="p-1.5 rounded-full hover:bg-red-50 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!showReForm ? (
              <button
                onClick={() => setShowReForm(true)}
                className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 border-2 border-dashed transition-all min-h-[48px]"
                style={{ borderColor: '#e8e2d8', color: '#C4883A', background: '#FAF8F5' }}
              >
                <Plus className="w-4 h-4" /> {t.addRecurring}
              </button>
            ) : (
              <div className="space-y-2 p-3 rounded-xl border" style={{ background: '#FAF8F5', borderColor: 'var(--color-border)' }}>
                <input
                  type="text"
                  value={reName}
                  onChange={e => setReName(e.target.value)}
                  placeholder={t.expenseName}
                  className="w-full px-3 py-2.5 border-2 rounded-xl text-sm focus:outline-none"
                  style={{ borderColor: '#e8e2d8' }}
                />
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={reAmount}
                    onChange={e => setReAmount(e.target.value)}
                    placeholder={t.amount}
                    className="w-full px-3 py-2.5 pr-14 border-2 rounded-xl text-sm focus:outline-none"
                    style={{ borderColor: '#e8e2d8' }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">{t.birr}</span>
                </div>
                <div className="flex gap-2">
                  {['daily', 'weekly', 'monthly'].map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setReFreq(f)}
                      className="flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all min-h-[40px]"
                      style={{
                        borderColor: reFreq === f ? '#C4883A' : '#e8e2d8',
                        background: reFreq === f ? 'rgba(196,136,58,0.15)' : '#fff',
                        color: reFreq === f ? '#1B4332' : '#6b7280',
                      }}
                    >
                      {FREQ_LABELS[f]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowReForm(false); setReName(''); setReAmount(''); setReFreq('monthly'); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold min-h-[44px]" style={{ background: '#f5f5f5', color: '#6b7280' }}
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={addRecurring}
                    disabled={!reName.trim() || !parseFloat(reAmount)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 min-h-[44px]"
                    style={{ background: '#C4883A' }}
                  >
                    {t.add}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="h-2" />
        </div>
      </SettingsSection>

      <GroupLabel>{lang === 'am' ? 'ሰዎች' : 'People'}</GroupLabel>
      <SettingsSection
        id="team"
        title={lang === 'am' ? 'ቡድን' : 'Team'}
        icon="👥"
        status={teamStatus}
        statusTone={teamTone}
        subtitle={activeStaffCount > 0
          ? (lang === 'am' ? `${activeStaffCount} ሰራተኞች ንቁ ናቸው` : `${activeStaffCount} active staff`)
          : (lang === 'am' ? 'ሰራተኛ ለመጨመር ይንኩ' : 'Add staff members to attribute records')}
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
          <div className="px-5 py-4 space-y-4">
            <div className="rounded-xl px-4 py-3 text-xs font-medium" style={{ background: '#FAF8F5', color: '#5b6470', border: '1px solid #e8e2d8' }}>
              Owner-only area. Add staff for future attribution, choose who is currently entering records on this phone, and deactivate staff without deleting shop history.
            </div>
            <div className="rounded-xl px-4 py-3 text-xs font-medium" style={{ background: '#ecfdf5', color: '#166534', border: '1px solid #bbf7d0' }}>
              <div className="font-black text-gray-900">Current mode: Staff on this phone</div>
              <div className="mt-1">Sales are saved on this device. Staff-phone sync is not enabled yet.</div>
              <div className="mt-1">Future sync will let staff phones send sales to the owner when online.</div>
            </div>

            <div className="rounded-xl border px-4 py-3" style={{ borderColor: '#e8e2d8', background: '#fcfbf8' }}>
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Current record actor</div>
              <div className="mt-1 text-sm font-black text-gray-900">{currentActorLabel || 'Owner'}</div>
              <div className="mt-3">
                <label className="block text-xs font-bold text-gray-500 mb-1.5">Save new records as</label>
                <select
                  value={activeStaffMemberId || ''}
                  onChange={(e) => onSetActiveStaffMember?.(e.target.value || null)}
                  className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none bg-white"
                  style={{ borderColor: '#e8e2d8' }}
                >
                  <option value="">Owner ({shopProfile?.name || 'Owner'})</option>
                  {(staffMembers || []).filter(member => member.active !== false).map(member => (
                    <option key={member.id} value={member.id}>
                      {member.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Add staff member
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={staffName}
                  onChange={e => setStaffName(e.target.value)}
                  placeholder="Staff name"
                  className="flex-1 px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                  style={{ borderColor: staffName.trim() ? '#C4883A' : '#e8e2d8' }}
                />
                <button
                  onClick={handleAddStaffMember}
                  disabled={!staffName.trim()}
                  className="px-4 py-3 rounded-xl font-bold text-sm min-h-[48px]"
                  style={{ background: staffName.trim() ? '#1B4332' : '#e5e7eb', color: staffName.trim() ? '#fff' : '#9ca3af' }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Staff list</div>
              {(staffMembers || []).length === 0 ? (
                <div className="rounded-xl border px-4 py-3 text-sm text-gray-500" style={{ borderColor: '#e8e2d8', background: '#fcfbf8' }}>
                  No staff added yet. Owner remains the default actor for every record.
                </div>
              ) : (
                (staffMembers || []).map(member => (
                  <div key={member.id} className="rounded-xl border px-4 py-3 flex items-center justify-between gap-3" style={{ borderColor: '#e8e2d8', background: member.active === false ? '#f9fafb' : '#fff' }}>
                    <div className="min-w-0 flex-1">
                      {String(editingStaffId) === String(member.id) ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editingStaffName}
                            onChange={e => setEditingStaffName(e.target.value)}
                            placeholder="Staff name"
                            className="w-full px-3 py-2 border-2 rounded-xl text-sm focus:outline-none"
                            style={{ borderColor: editingStaffName.trim() ? '#C4883A' : '#e8e2d8', background: '#fff' }}
                          />
                          <div className="text-xs text-gray-500">
                            Update the display name for future attribution. Past saved records keep the original name snapshot.
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="font-bold text-sm text-gray-900">{member.display_name}</div>
                          <div className="text-xs text-gray-500">
                            {member.active === false ? 'Inactive - past records stay attributed to this staff member.' : 'Active staff member'}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {String(editingStaffId) === String(member.id) ? (
                        <>
                          <button
                            onClick={handleSaveEditedStaffMember}
                            disabled={!editingStaffName.trim()}
                            className="px-3 py-2 rounded-xl text-xs font-bold min-h-[40px]"
                            style={{ background: editingStaffName.trim() ? '#1B4332' : '#e5e7eb', color: editingStaffName.trim() ? '#fff' : '#9ca3af' }}
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEditingStaffMember}
                            className="px-3 py-2 rounded-xl text-xs font-bold min-h-[40px]"
                            style={{ background: '#f5f5f5', color: '#374151' }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEditingStaffMember(member)}
                          className="px-3 py-2 rounded-xl text-xs font-bold min-h-[40px]"
                          style={{ background: '#f5f5f5', color: '#374151' }}
                        >
                          Edit
                        </button>
                      )}
                      {member.active !== false && (
                        <button
                          onClick={() => onSetActiveStaffMember?.(member.id)}
                          className="px-3 py-2 rounded-xl text-xs font-bold min-h-[40px]"
                          style={{ background: String(activeStaffMemberId) === String(member.id) ? '#1B4332' : '#f5f5f5', color: String(activeStaffMemberId) === String(member.id) ? '#fff' : '#374151' }}
                        >
                          {String(activeStaffMemberId) === String(member.id) ? 'Current' : 'Use'}
                        </button>
                      )}
                      {member.active !== false && (
                        <button
                          onClick={() => setStaffDeactivateTarget(member)}
                          disabled={String(editingStaffId) === String(member.id)}
                          className="px-3 py-2 rounded-xl text-xs font-bold min-h-[40px]"
                          style={{ background: String(editingStaffId) === String(member.id) ? '#f3f4f6' : '#fff1f2', color: String(editingStaffId) === String(member.id) ? '#9ca3af' : '#b91c1c' }}
                        >
                          Inactivate
                        </button>
                      )}
                      {member.active === false && (
                        <button
                          onClick={() => onReactivateStaffMember?.(member.id)}
                          disabled={String(editingStaffId) === String(member.id)}
                          className="px-3 py-2 rounded-xl text-xs font-bold min-h-[40px]"
                          style={{ background: String(editingStaffId) === String(member.id) ? '#f3f4f6' : '#ecfdf5', color: String(editingStaffId) === String(member.id) ? '#9ca3af' : '#166534' }}
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="owner_alerts"
        title={lang === 'am' ? 'የባለቤት ማሳወቂያ' : 'Owner alerts'}
        icon="🔔"
        status={alertMode === 'none' ? (lang === 'am' ? 'ጠፍቷል' : 'Off') : (alertMode === 'high_value' ? `${Number(parseInput(alertThreshold)) || 0}+` : alertMode)}
        statusTone={alertMode === 'none' ? 'neutral' : 'ok'}
        subtitle={lang === 'am' ? 'በዚህ ስልክ ላይ የሚቀመጥ የሽያጭ ማሳወቂያ' : 'Local sale alerts saved on this phone'}
        openSection={openSection}
        setOpenSection={setOpenSection}
      >
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
          <div className="px-5 py-4 space-y-4">
            <div className="rounded-xl px-4 py-3 text-xs font-medium flex items-start gap-2" style={{ background: '#FAF8F5', color: '#5b6470', border: '1px solid #e8e2d8' }}>
              <Bell className="w-4 h-4 flex-shrink-0" style={{ color: '#C4883A' }} />
              <span>Local owner alerts stay on this phone. Staff-phone sync and remote alerts are not enabled yet.</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'all', label: 'Every sale' },
                { id: 'high_value', label: 'High value' },
                { id: 'summary', label: 'Daily summary' },
                { id: 'none', label: 'Off' },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setAlertMode(option.id)}
                  className="px-3 py-3 rounded-xl text-sm font-bold min-h-[48px] transition-all"
                  style={{
                    background: alertMode === option.id ? '#1B4332' : '#f5f5f5',
                    color: alertMode === option.id ? '#fff' : '#374151',
                    border: alertMode === option.id ? '1px solid #1B4332' : '1px solid #e8e2d8',
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {alertMode === 'high_value' && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">Alert when sale is at least</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={alertThreshold}
                    onChange={e => setAlertThreshold(e.target.value.replace(/,/g, '').replace(/[^\d.]/g, ''))}
                    placeholder="5000"
                    className="w-full px-4 py-3 pr-14 border-2 rounded-xl text-sm focus:outline-none"
                    style={{ borderColor: '#e8e2d8' }}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">birr</span>
                </div>
              </div>
            )}

            {alertMode === 'summary' && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">Summary time</label>
                <input
                  type="time"
                  value={alertSummaryTime}
                  onChange={e => setAlertSummaryTime(e.target.value)}
                  className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none"
                  style={{ borderColor: '#e8e2d8' }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveOwnerAlerts}
              className="w-full py-3 rounded-xl font-bold text-sm min-h-[48px]"
              style={{ background: '#1B4332', color: '#fff' }}
            >
              Save alert preference
            </button>
          </div>
        </div>
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
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden divide-y divide-green-100/30">
          {/* Theme row */}
          <div className="px-5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9ca3af' }}>
              {t.appearance}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'light', label: t.lightMode, icon: Sun },
                { id: 'dark', label: t.darkMode, icon: Moon },
              ].map((option) => {
                const active = theme === option.id;
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    onClick={() => setTheme(option.id)}
                    className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold min-h-[48px] transition-all"
                    style={{
                      background: active ? '#1B4332' : '#f5f5f5',
                      color: active ? '#fff' : '#374151',
                      border: active ? '1px solid #1B4332' : '1px solid #e8e2d8',
                    }}
                  >
                    <Icon className="w-4 h-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Hide amounts toggle */}
          <button
            onClick={toggle}
            className="w-full flex items-center gap-4 px-5 py-4 active:bg-green-50 transition-colors min-h-[64px] text-left"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: hidden ? 'rgba(196,136,58,0.12)' : '#dcfce7' }}>
              {hidden ? <EyeOff className="w-5 h-5 text-green-800" /> : <Eye className="w-5 h-5 text-green-700" />}
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-800 text-sm">{t.hideAmounts}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {hidden ? t.totalsHidden : t.totalsVisible}
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 flex items-center px-0.5 ${hidden ? 'bg-green-700' : 'bg-gray-200'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${hidden ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </button>
        </div>
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
        <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden divide-y divide-green-100/30">
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f0fdf4' }}>
              <Info className="w-5 h-5 text-green-700" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-800">{t.storedOnDevice}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {totalEntries} {lang === 'am' ? 'መዝገብ' : 'entries'} · {totalCustomersWithLedger} {lang === 'am' ? 'ደንበኞች' : 'customers in dubie'}
              </div>
            </div>
          </div>

          {/* Last backup indicator · Commit E */}
          <div
            className="px-5 py-3"
            style={{
              background: lastBackupAt
                ? (Date.now() - lastBackupAt < 7 * 86400000 ? '#f0fdf4' : '#fef3c7')
                : '#fef2f2',
              borderTop: '1px solid rgba(0,0,0,0.04)',
              borderBottom: '1px solid rgba(0,0,0,0.04)',
            }}
          >
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '0.95rem' }}>
                {lastBackupAt
                  ? (Date.now() - lastBackupAt < 7 * 86400000 ? '✓' : '⏰')
                  : '⚠️'}
              </span>
              <div className="flex-1">
                <p className="text-xs font-bold" style={{
                  color: lastBackupAt
                    ? (Date.now() - lastBackupAt < 7 * 86400000 ? '#065f46' : '#92400e')
                    : '#991b1b',
                }}>
                  {(() => {
                    if (!lastBackupAt) {
                      return lang === 'am' ? 'ምንም ምትኬ የለም' : 'No backup yet';
                    }
                    const days = Math.floor((Date.now() - lastBackupAt) / 86400000);
                    if (days === 0) return lang === 'am' ? 'ምትኬ ዛሬ ተወስዷል' : 'Backed up today';
                    if (days === 1) return lang === 'am' ? 'ምትኬ ትናንት ተወስዷል' : 'Backed up yesterday';
                    return lang === 'am' ? `ምትኬ ከ ${days} ቀን በፊት` : `Backed up ${days} days ago`;
                  })()}
                </p>
                <p className="text-[11px]" style={{ color: '#6b7280' }}>
                  {lang === 'am'
                    ? 'በስልክዎ ላይ ብቻ ይቀመጣል — እርስዎ ይያዙት'
                    : 'Stored on your phone only — you own it'}
                </p>
              </div>
            </div>
          </div>

          {/* Download JSON backup · Commit E */}
          <button
            onClick={exportToJSON}
            disabled={totalEntries === 0 && totalCustomersWithLedger === 0}
            className="w-full flex items-center gap-4 px-5 py-4 active:bg-green-50 transition-colors min-h-[64px] disabled:opacity-40 text-left"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#dcfce7' }}>
              <Download className="w-5 h-5" style={{ color: '#15803d' }} />
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-800">
                {lang === 'am' ? 'JSON ምትኬ አውጣ' : 'Download backup (JSON)'}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {lang === 'am'
                  ? 'ሁሉም መረጃ ከፎቶ ጋር · ለመመለስ ይጠቅማል'
                  : 'Full data + photos · restorable on new phone'}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
          </button>

          {/* Share via OS share sheet (Telegram saved messages, email, etc.) · Commit E */}
          {typeof navigator !== 'undefined' && (navigator.canShare || navigator.share) && (
            <button
              onClick={shareBackup}
              disabled={totalEntries === 0 && totalCustomersWithLedger === 0}
              className="w-full flex items-center gap-4 px-5 py-4 active:bg-blue-50 transition-colors min-h-[64px] disabled:opacity-40 text-left"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#dbeafe' }}>
                <Share2 className="w-5 h-5" style={{ color: '#1d4ed8' }} />
              </div>
              <div className="flex-1">
                <div className="font-bold text-gray-800">
                  {lang === 'am' ? 'ምትኬ አጋራ' : 'Share backup'}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {lang === 'am'
                    ? 'ቴሌግራም Saved Messages፣ ኢሜል፣ ወዘተ'
                    : 'Send to Telegram Saved Messages, email, etc.'}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </button>
          )}

          {/* Restore from JSON file · Commit E */}
          <label
            className="w-full flex items-center gap-4 px-5 py-4 active:bg-amber-50 transition-colors min-h-[64px] cursor-pointer"
            style={{ background: '#fff' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fef3c7' }}>
              <RefreshCw className="w-5 h-5" style={{ color: '#92400e' }} />
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-800">
                {lang === 'am' ? 'ከምትኬ ፋይል መልሰው ይጫኑ' : 'Restore from backup file'}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {lang === 'am'
                  ? 'ሁሉንም መረጃ ይተካል · ሁለት ጊዜ ማረጋገጫ ያስፈልጋል'
                  : 'Replaces all data on this phone · two-step confirm'}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportFileSelected}
              className="hidden"
            />
          </label>

          {/* Owner CSV export (existing flat spreadsheet for accountants) */}
          <button
            onClick={exportToCSV}
            disabled={totalEntries === 0}
            className="w-full flex items-center gap-4 px-5 py-4 active:bg-gray-50 transition-colors min-h-[64px] disabled:opacity-40 text-left"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f3f4f6' }}>
              <Download className="w-5 h-5 text-gray-600" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-800">
                {lang === 'am' ? 'CSV አውጣ (ለሂሳብ ቤት)' : 'Export CSV (for accountant)'}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {lang === 'am'
                  ? 'ጠፍጣፋ ስፕሬድሺት · ፎቶ የለም'
                  : 'Flat spreadsheet · no photos'}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
          </button>

          {/* Start over · two-step confirm (Commit S) */}
          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full flex items-center gap-4 px-5 py-4 active:bg-red-50 transition-colors min-h-[64px] text-left"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fff1f2' }}>
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-red-600">
                {lang === 'am' ? 'መልሰው ጀምር' : 'Start over on this phone'}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {lang === 'am'
                  ? 'ሁሉንም ይሰርዛል — መልሶ ማግኘት አይቻልም'
                  : 'Deletes everything — cannot be undone'}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
          </button>
        </div>
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
          {/* Brand block · tap 5× to reveal dev panel (Commit S) */}
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
          {/* Usage tribute · one-liner from old usage section */}
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

      {/* Dev mode panel · only after 5 taps on About header (or persistent flag) */}
      {devModeRevealed && (voiceStats || voiceQuality.events.length > 0) && (
        <>
          <GroupLabel>{lang === 'am' ? '🛠 ለልማት' : '🛠 Developer'}</GroupLabel>
          <SettingsSection
            id="voice-quality"
            title="Voice Quality"
            icon="🎙"
            subtitle="Internal telemetry · dev mode"
            statusTone="info"
            status="DEV"
            openSection={openSection}
            setOpenSection={setOpenSection}
          >
            <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden">
              <div className="px-4 pt-4 pb-3 space-y-3">
                <div className="rounded-xl p-3" style={{ background: '#FAF8F5', border: '1.5px solid var(--color-border)' }}>
                  <p className="text-sm font-bold text-gray-900">Voice recognition telemetry</p>
                  <p className="text-xs text-gray-500 mt-1">Captured: {capturedVoices} · Saved: {savedVoices} · Edits: {editedVoices} · Untouched: {untouchedVoices}</p>
                  {correctionRate != null && (
                    <p className="text-xs text-gray-500 mt-1">Correction rate: {correctionRate}%</p>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  Tap About header again to keep this panel hidden by default.
                </div>
              </div>
            </div>
          </SettingsSection>
        </>
      )}


      {/* Step 1 — first confirm */}
      {showClearConfirm && !showClearConfirmStep2 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-4xl text-center mb-3">⚠️</div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
              {lang === 'am' ? 'በዚህ ስልክ መልሰው ይጀምሩ?' : 'Start over on this phone?'}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              {lang === 'am'
                ? `ይህ ${totalEntries} መዝገብ፣ ${totalCustomersWithLedger} የደንበኞች መዝገብ፣ የእርስዎ መለያ እና የመተግበሪያው ሁሉ ይሰረዛል። መልሶ ማግኘት አይቻልም።`
                : `This will delete ${totalEntries} entries, ${totalCustomersWithLedger} customer ledgers, your owner profile, and all saved app setup. This cannot be undone.`}
            </p>
            <div className="space-y-2">
              <button
                onClick={() => setShowClearConfirmStep2(true)}
                className="w-full p-4 bg-red-500 text-white rounded-2xl font-bold min-h-[52px]"
              >
                {lang === 'am' ? 'ቀጥል →' : 'Continue →'}
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="w-full p-4 rounded-2xl font-bold min-h-[52px]"
                style={{ background: '#f5f5f5', color: '#374151' }}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — final confirm (Commit S sign-off: two-confirm) */}
      {showClearConfirmStep2 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border-2" style={{ borderColor: '#dc2626' }}>
            <div className="text-4xl text-center mb-3">🛑</div>
            <h3 className="text-xl font-black text-red-600 text-center mb-2">
              {lang === 'am' ? 'እርግጠኛ ነዎት?' : 'Are you sure?'}
            </h3>
            <p className="text-sm text-gray-700 text-center mb-2 font-bold">
              {lang === 'am' ? 'ይህ የመጨረሻ ማረጋገጫ ነው።' : 'This is your last chance to cancel.'}
            </p>
            <p className="text-sm text-gray-500 text-center mb-6">
              {lang === 'am'
                ? `${totalEntries} መዝገብ እና ${totalCustomersWithLedger} ደንበኞች ይጠፋሉ።`
                : `${totalEntries} entries and ${totalCustomersWithLedger} customer ledgers will be permanently lost.`}
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setShowClearConfirmStep2(false);
                  clearAllData();
                }}
                className="w-full p-4 bg-red-600 text-white rounded-2xl font-bold min-h-[52px]"
              >
                {lang === 'am' ? 'አዎ፣ አሁን ሰርዝ' : 'Yes, delete everything now'}
              </button>
              <button
                onClick={() => { setShowClearConfirmStep2(false); setShowClearConfirm(false); }}
                className="w-full p-4 rounded-2xl font-bold min-h-[52px]"
                style={{ background: '#1B4332', color: '#fff' }}
              >
                {lang === 'am' ? 'አይ፣ አቁም' : 'No, keep my data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* supplier-delete modal removed in Commit S */}

      {/* ─── Commit E: Restore-from-backup confirm modals ────────────── */}
      {restoreTarget && !restoreConfirmStep2 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-4xl text-center mb-3">⚠️</div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
              {lang === 'am' ? 'ምትኬ ይመለስ?' : 'Restore from backup?'}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-3">
              {lang === 'am'
                ? `ፋይል ${new Date(restoreTarget.exported_at).toLocaleDateString()} የተወሰደ ምትኬ ይዟል።`
                : `Backup file from ${new Date(restoreTarget.exported_at).toLocaleDateString()}`}
            </p>
            <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: '#fafaf5', border: '1px solid #ece6d6' }}>
              <p className="font-bold text-gray-700 mb-1">
                {lang === 'am' ? 'በዚህ ምትኬ ውስጥ' : 'Backup contains'}:
              </p>
              <div className="space-y-0.5 text-gray-600">
                <div>{restoreTarget.counts?.transactions || 0} {lang === 'am' ? 'ሽያጭ + ወጪ' : 'sales + expenses'}</div>
                <div>{restoreTarget.counts?.customers || 0} {lang === 'am' ? 'ደንበኞች' : 'customers'} · {restoreTarget.counts?.customer_transactions || 0} {lang === 'am' ? 'የዱቤ መዝገብ' : 'dubie entries'}</div>
                <div>{restoreTarget.counts?.suppliers || 0} {lang === 'am' ? 'አቅራቢዎች' : 'suppliers'} · {restoreTarget.counts?.supplier_transactions || 0} {lang === 'am' ? 'የአቅራቢ መዝገብ' : 'supplier entries'}</div>
                <div>{restoreTarget.counts?.catalog_entries || 0} {lang === 'am' ? 'ዕቃዎች' : 'catalog items'} · {restoreTarget.counts?.staff_members || 0} {lang === 'am' ? 'ሰራተኞች' : 'staff'}</div>
              </div>
            </div>
            <p className="text-sm font-bold text-red-600 text-center mb-4">
              {lang === 'am'
                ? '⚠️ በዚህ ስልክ ላይ ያለው ሁሉም መረጃ ይተካል'
                : '⚠️ All current data on this phone will be replaced'}
            </p>
            <div className="space-y-2">
              <button
                onClick={() => setRestoreConfirmStep2(true)}
                className="w-full p-4 rounded-2xl text-white font-bold min-h-[52px]"
                style={{ background: '#C4883A' }}
              >
                {lang === 'am' ? 'ቀጥል →' : 'Continue →'}
              </button>
              <button
                onClick={() => setRestoreTarget(null)}
                className="w-full p-4 rounded-2xl font-bold min-h-[52px]"
                style={{ background: '#f5f5f5', color: '#374151' }}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreTarget && restoreConfirmStep2 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border-2" style={{ borderColor: '#dc2626' }}>
            <div className="text-4xl text-center mb-3">🔄</div>
            <h3 className="text-xl font-black text-red-600 text-center mb-2">
              {lang === 'am' ? 'እርግጠኛ ነዎት?' : 'Are you sure?'}
            </h3>
            <p className="text-sm text-gray-700 text-center mb-2 font-bold">
              {lang === 'am'
                ? 'የአሁኑን መረጃ ሁሉ ይተካል — መልሶ ማግኘት አይቻልም።'
                : 'This replaces all current data — cannot be undone.'}
            </p>
            <p className="text-sm text-gray-500 text-center mb-6">
              {lang === 'am'
                ? 'ከመመለስ በፊት የአሁኑን መረጃ ምትኬ ይውሰዱ።'
                : 'Tip: download a backup of current data first.'}
            </p>
            <div className="space-y-2">
              <button
                onClick={handleRestoreConfirm}
                className="w-full p-4 bg-red-600 text-white rounded-2xl font-bold min-h-[52px]"
              >
                {lang === 'am' ? 'አዎ፣ መልሰው ጫን' : 'Yes, restore now'}
              </button>
              <button
                onClick={() => { setRestoreConfirmStep2(false); setRestoreTarget(null); }}
                className="w-full p-4 rounded-2xl font-bold min-h-[52px]"
                style={{ background: '#1B4332', color: '#fff' }}
              >
                {lang === 'am' ? 'አይ፣ ይተወው' : 'No, keep current data'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {cleared && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: '#fff1f2' }}>
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <p className="font-bold text-gray-800">{t.dataCleared}</p>
            <p className="text-sm text-gray-500 mt-1">{t.reloading}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;



