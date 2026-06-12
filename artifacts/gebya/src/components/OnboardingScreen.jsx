import { useState } from 'react';
import { useLang } from '../context/LangContext';
import db from '../db';
import { identityApi } from '../api/identity';
import { setIdentity } from '../db';
import StaffJoinScreen from './StaffJoinScreen';

const BANK_COPY = 'Gebya is a notebook, not a bank. Gebya does not connect to your bank. Gebya cannot withdraw money. Never enter PIN, OTP, or password. Payment method is only a label like Cash, CBE, Telebirr, or Bank Transfer.';

function BankTrustCopy({ className = '' }) {
  return (
    <div className={`bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 ${className}`}>
      <p className="text-xs font-medium text-green-800 leading-relaxed">{BANK_COPY}</p>
    </div>
  );
}

function isValidPhone(digits) {
  return /^[79]\d{8}$/.test(digits);
}

const BUSINESS_TYPE_OPTIONS = [
  { value: 'retail-shop', label: 'Retail shop' },
  { value: 'shoe-market', label: 'Shoe market' },
  { value: 'flower-shop', label: 'Flower shop' },
  { value: 'women-dress-shop', label: 'Women dress shop' },
  { value: 'grocery', label: 'Grocery / minimarket' },
  { value: 'electronics', label: 'Electronics / accessories' },
  { value: 'pharmacy', label: 'Pharmacy / cosmetics' },
  { value: 'other', label: 'Other' },
];

// Step constants for owner flow
const STEP_CHOICE = 'choice';
const STEP_FORM = 'form';

export default function OnboardingScreen({ onComplete }) {
  const { t } = useLang();
  const [path, setPath] = useState(STEP_CHOICE);

  // Owner flow state
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [businessType, setBusinessType] = useState('retail-shop');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState({ name: false, phone: false });

  const phoneOptionalLabel = t.onboardPhoneOptional || '(optional)';
  const phoneHelper = t.onboardPhoneHelper || 'You can add your phone later in Settings.';
  const onboardingPromises = [
    t.onboardPromiseSimple || 'Simple notebook for sales, spending, and Dubie',
    t.onboardPromiseFast || 'Start with your name only',
    t.onboardPromisePrivate || 'Your records stay on this phone',
  ];

  const nameValid = name.trim().length > 0;
  const phoneEntered = phoneDigits.length > 0;
  const phoneValid = !phoneEntered || isValidPhone(phoneDigits);
  const canProceed = nameValid && phoneValid;

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 9) setPhoneDigits(raw);
  };

  const handleOwnerStart = async () => {
    if (!canProceed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const fullPhone = phoneEntered ? `+251${phoneDigits}` : undefined;
      const result = await identityApi.createShop({
        display_name: name.trim(),
        phone: fullPhone,
        business_type: businessType,
      });
      // Persist identity locally
      await setIdentity({
        shop_id: result.shop_id,
        shop_name: result.shop_name || name.trim(),
        device_id: result.device_id,
        device_token: result.device_token,
        staff_id: result.staff_id,
        display_name: result.display_name || name.trim(),
        phone_number: fullPhone || '',
        role: 'owner',
        permissions: result.permissions || {},
        device_status: result.device_status || 'active',
        phone_required: false,
        approval_required: false,
      });
      await db.settings.put({ key: 'intro_seen', value: 'yes' });
      onComplete({ name: name.trim(), phone: fullPhone, businessType });
    } catch (err) {
      // Network/server error — fall back to local-only mode
      // (backend not running; user can still use Gebya locally)
      await db.settings.put({ key: 'intro_seen', value: 'yes' });
      await db.settings.put({ key: 'shop_name', value: name.trim() });
      await db.settings.put({ key: 'shop_phone', value: phoneEntered ? `+251${phoneDigits}` : '' });
      await db.settings.put({ key: 'shop_business_type', value: businessType });
      onComplete({ name: name.trim(), phone: phoneEntered ? `+251${phoneDigits}` : '', businessType });
    }
  };

  // ─── CHOICE SCREEN ─────────────────────────────────────────────────────────
  if (path === STEP_CHOICE) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 py-8 texture-noise"
        style={{ background: '#1B4332' }}
      >
        <div className="w-full max-w-sm">
          <div className="text-center mb-6 animate-elastic">
            <div className="text-4xl mb-3 font-black text-white" aria-hidden="true">GB</div>
            <h1 className="text-4xl font-black text-white tracking-tight mb-1 font-serif">Gebya</h1>
            <p className="text-base font-semibold font-sans" style={{ color: 'rgba(255,255,255,0.72)' }}>
              {t.onboardTagline}
            </p>
          </div>

          <div
            className="bg-white p-6 animate-slide-up"
            style={{ borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)' }}
          >
            <h2 className="text-xl font-black text-gray-900 mb-1 font-sans">
              {t.onboardWelcome}
            </h2>
            <p className="text-sm leading-6 text-gray-500 mb-5 font-sans">
              {t.onboardChoosePath || 'How are you using Gebya?'}
            </p>

            <div className="space-y-3">
              {/* Owner path */}
              <button
                onClick={() => setPath(STEP_FORM)}
                className="w-full p-4 rounded-xl border-2 text-left transition-all hover:border-green-500 active:scale-98 press-scale"
                style={{ borderColor: '#e8e2d8' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(27,67,50,0.08)' }}
                  >
                    <span className="text-xl" role="img" aria-hidden="true">🏪</span>
                  </div>
                  <div>
                    <p className="font-black text-gray-900 text-base">
                      {t.onboardIOwnShop || 'I own / manage a shop'}
                    </p>
                    <p className="text-xs font-medium text-gray-500 mt-0.5">
                      {t.onboardIOwnShopDesc || 'Start your own notebook — solo or with staff later'}
                    </p>
                  </div>
                </div>
              </button>

              {/* Staff path */}
              <button
                onClick={() => {
                  // Switch to StaffJoinScreen by calling onComplete with a sentinel
                  // so App.jsx knows to render StaffJoinScreen
                  onComplete({ __staff_join: true });
                }}
                className="w-full p-4 rounded-xl border-2 text-left transition-all hover:border-green-500 active:scale-98 press-scale"
                style={{ borderColor: '#e8e2d8' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(27,67,50,0.08)' }}
                  >
                    <span className="text-xl" role="img" aria-hidden="true">👥</span>
                  </div>
                  <div>
                    <p className="font-black text-gray-900 text-base">
                      {t.onboardIWasInvited || 'I was invited by a shop'}
                    </p>
                    <p className="text-xs font-medium text-gray-500 mt-0.5">
                      {t.onboardIWasInvitedDesc || 'Join your shop with a shop code from the owner'}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <BankTrustCopy className="mt-4" />

          <p className="text-center text-xs mt-4 leading-5 font-sans" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {t.onboardFooter}
          </p>
        </div>
      </div>
    );
  }

  // ─── OWNER FORM (existing solo flow, enhanced) ────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-8 texture-noise"
      style={{ background: '#1B4332' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-6 animate-elastic">
          <div className="text-4xl mb-3 font-black text-white" aria-hidden="true">GB</div>
          <h1 className="text-4xl font-black text-white tracking-tight mb-1 font-serif">Gebya</h1>
          <p className="text-base font-semibold font-sans" style={{ color: 'rgba(255,255,255,0.72)' }}>
            {t.onboardTagline}
          </p>
        </div>

        <div
          className="bg-white p-6 animate-slide-up"
          style={{ borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)' }}
        >
          <button
            onClick={() => setPath(STEP_CHOICE)}
            className="mb-4 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← {t.onboardBack || 'Back'}
          </button>

          <h2 className="text-2xl font-black text-gray-900 mb-2 font-sans">
            {t.onboardOwnerSetup || 'Set up your shop'}
          </h2>
          <p className="text-sm leading-6 text-gray-500 mb-5 font-sans">
            {t.onboardOwnerSetupDesc || 'Enter your details to start using Gebya'}
          </p>

          <div className="space-y-2 mb-5">
            {onboardingPromises.map((promise) => (
              <div
                key={promise}
                className="flex items-start gap-3 p-3 border text-sm font-medium font-sans"
                style={{
                  background: '#FAF8F5',
                  borderColor: '#e8e2d8',
                  borderRadius: 'var(--radius-md)',
                  color: '#4b5563',
                }}
              >
                <span className="mt-0.5 text-base" style={{ color: '#1B4332' }} aria-hidden="true">•</span>
                <p>{promise}</p>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block font-semibold text-gray-700 mb-1.5 text-sm font-sans">
                {t.userName} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
                placeholder={t.onboardNamePlaceholder}
                autoFocus
                className="w-full p-4 border-2 text-base focus:outline-none font-sans"
                style={{
                  borderRadius: 'var(--radius-md)',
                  borderColor: touched.name && !nameValid ? '#dc2626' : (nameValid ? '#1B4332' : '#e8e2d8'),
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && canProceed) handleOwnerStart(); }}
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1.5 text-sm font-sans">
                {t.phoneNumber} <span className="text-gray-400 font-normal">{phoneOptionalLabel}</span>
              </label>
              <div className="flex gap-0">
                <div
                  className="flex items-center justify-center px-3 py-4 border-2 border-r-0 text-base font-bold font-sans"
                  style={{
                    background: 'rgba(27,67,50,0.06)',
                    borderColor: touched.phone && !phoneValid ? '#dc2626' : '#e8e2d8',
                    color: '#1B4332',
                    minWidth: '72px',
                    borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
                  }}
                >
                  +251
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phoneDigits}
                  onChange={handlePhoneChange}
                  onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
                  placeholder="9XXXXXXXX"
                  maxLength={9}
                  className="flex-1 p-4 border-2 text-base focus:outline-none font-sans"
                  style={{
                    borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                    borderColor: touched.phone && !phoneValid ? '#dc2626' : (phoneValid ? '#1B4332' : '#e8e2d8'),
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canProceed) handleOwnerStart(); }}
                />
              </div>
              {touched.phone && phoneEntered && !phoneValid && (
                <p className="text-xs text-red-500 mt-1 font-medium font-sans">{t.phoneInvalid}</p>
              )}
              {!phoneEntered && (
                <p className="text-xs mt-1 font-medium font-sans" style={{ color: '#9ca3af' }}>{phoneHelper}</p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1.5 text-sm font-sans">
                {t.onboardBusinessType || 'What type of business do you run?'}
              </label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full p-4 border-2 text-base focus:outline-none font-sans bg-white"
                style={{
                  borderRadius: 'var(--radius-md)',
                  borderColor: '#e8e2d8',
                }}
              >
                {BUSINESS_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="text-xs mt-1 font-medium font-sans" style={{ color: '#9ca3af' }}>
                {t.onboardBusinessTypeHint || 'Helps voice understand your items and customers'}
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handleOwnerStart}
            disabled={!canProceed || saving}
            className="w-full mt-5 p-4 font-black text-white text-base min-h-[56px] transition-all active:scale-95 font-sans press-scale"
            style={{
              background: canProceed ? '#1B4332' : '#e5e7eb',
              color: canProceed ? '#fff' : '#9ca3af',
              boxShadow: canProceed ? '0 4px 0 #0f2b20, var(--shadow-sm)' : 'none',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {saving ? (t.onboardSettingUp || 'Setting up…') : (t.onboardGetStarted || 'Start using Gebya')}
          </button>
        </div>

        <BankTrustCopy className="mt-4" />

        <p className="text-center text-xs mt-4 leading-5 font-sans" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {t.onboardFooter}
        </p>
      </div>
    </div>
  );
}