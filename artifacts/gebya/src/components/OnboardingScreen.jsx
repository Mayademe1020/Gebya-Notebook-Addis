import { useState } from 'react';
import { useLang } from '../context/LangContext';
import { fireToast } from './Toast';
import db, { setIdentity } from '../db';
import { identityApi } from '../api/identity';
import { setAuthToken } from '../utils/syncEngine';
import { usePermissionsStore } from '../stores/permissionsStore';
import { resolvePermissions } from '../utils/permissions';
import { label } from '../labels/index';

/**
 * Gate C: stamp the owner role + permissions into the permissions store the
 * moment onboarding succeeds — before onComplete() hands control to the shell.
 *
 * Why this exists: the store starts at { permissions: null, role: null } and
 * hasPermission() then falls through to STAFF_MINIMAL_SAFE (can_add_records
 * only). A brand-new owner therefore saw Reports OFF, was labelled STAFF in
 * Settings, and was denied the owner/admin section — until an unrelated auth
 * refresh happened to land. That window is a first-session trust failure and
 * it confounded the setup-completion metric.
 *
 * resolvePermissions() mirrors authStore (role defaults merged with the
 * server payload) so the two paths cannot drift. Owned here rather than in
 * handleOnboardingComplete() so the stamp cannot be skipped by a future
 * caller that bypasses the hook.
 */
function stampOwnerPermissions(serverPermissions) {
  usePermissionsStore
    .getState()
    .setPermissions(resolvePermissions('owner', serverPermissions), 'owner');
}

function isValidPhone(digits) {
  return /^[79]\d{8}$/.test(digits);
}

function OnboardingScreen({ onComplete }) {
  const { t, lang, toggleLang } = useLang();
  const phoneOptionalLabel = t.onboardPhoneOptional || '(optional)';
  const phoneHelper = t.onboardPhoneHelper || 'You can add your phone later in Settings.';
  const onboardingPromises = [
    t.onboardPromiseSimple || 'Simple notebook for sales, spending, and Dubie',
    t.onboardPromiseFast || 'Start with your name only',
    t.onboardPromisePrivate || 'Your records stay on this phone',
  ];
   const onboardKicker = label('onboarding.two-ways-to-use-gebya', lang);

   const handleNewShop = () => setMode('form');
  const handleJoinShop = () => onComplete({ __staff_join: true });

  function renderEnglishOptions() {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleNewShop}
          className="w-full flex items-center gap-4 p-4 rounded-xl press-scale text-left"
          style={{ background: 'rgba(27,67,50,0.06)', border: '2px solid rgba(27,67,50,0.12)' }}
        >
          <span className="text-3xl">🏪</span>
          <div>
            <div className="font-black text-gray-900">Shop Owner</div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>Create your own notebook</div>
          </div>
        </button>
        <button
          type="button"
          onClick={handleJoinShop}
          className="w-full flex items-center gap-4 p-4 rounded-xl press-scale text-left"
          style={{ background: 'rgba(196,136,58,0.08)', border: '2px solid rgba(196,136,58,0.2)' }}
        >
          <span className="text-3xl">👥</span>
          <div>
            <div className="font-black text-gray-900">Join a Shop</div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>Connect as a staff member</div>
          </div>
        </button>
      </div>
    );
  }

  function renderAmharicOptions() {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleNewShop}
          className="w-full flex items-center gap-4 p-4 rounded-xl press-scale text-left"
          style={{ background: 'rgba(27,67,50,0.06)', border: '2px solid rgba(27,67,50,0.12)' }}
        >
          <span className="text-3xl">🏪</span>
          <div>
            <div className="font-black text-gray-900">የሱቅ ባለቤት</div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>የራስዎን ማስታወሻ ይፍጠሩ</div>
          </div>
        </button>
        <button
          type="button"
          onClick={handleJoinShop}
          className="w-full flex items-center gap-4 p-4 rounded-xl press-scale text-left"
          style={{ background: 'rgba(196,136,58,0.08)', border: '2px solid rgba(196,136,58,0.2)' }}
        >
          <span className="text-3xl">👥</span>
          <div>
            <div className="font-black text-gray-900">ሱቅ ይቀላቀሉ</div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>እንደ ሰራተኛ ይገናኙ</div>
          </div>
        </button>
      </div>
    );
  }

  const [mode, setMode] = useState('choice');
   const [name, setName] = useState('');
   const [phoneDigits, setPhoneDigits] = useState('');
   const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({ name: false, phone: false });

  const nameValid = name.trim().length > 0;
  const phoneEntered = phoneDigits.length > 0;
  const phoneValid = !phoneEntered || isValidPhone(phoneDigits);
  const canProceed = nameValid && phoneValid;

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 9) setPhoneDigits(raw);
  };

  const handleStart = async () => {
    if (!canProceed || saving) return;
    setSaving(true);
    const fullPhone = phoneEntered ? `+251${phoneDigits}` : '';
    try {
       const result = await identityApi.createShop({
         display_name: name.trim(),
         phone: fullPhone || undefined,
       });
      const identity = {
        shop_id: result.shop_id,
        shop_name: result.shop_name || name.trim(),
        join_code: result.join_code,
        join_url: result.join_url,
        device_id: result.device_id,
        device_token: result.device_token,
        staff_id: result.staff_id,
        display_name: result.display_name || name.trim(),
        phone_number: fullPhone,
        role: 'owner',
        permissions: result.permissions || {},
        device_status: result.device_status || 'active',
        phone_required: result.phone_required ?? false,
        approval_required: result.approval_required ?? false,
      };
      await setIdentity(identity);
      // Gate C: stamp owner role + permissions BEFORE onComplete() hands
      // control to the shell, so the first render already sees role === owner.
      // Without this the store stayed at {null, null} and hasPermission() fell
      // through to STAFF_MINIMAL_SAFE — Reports OFF, STAFF badge, no admin
      // section — until an unrelated auth refresh landed.
      stampOwnerPermissions(identity.permissions);
       await db.settings.put({ key: 'intro_seen', value: 'yes' });
       await db.settings.put({ key: 'shop_name', value: identity.shop_name });
       await db.settings.put({ key: 'shop_phone', value: fullPhone });
       // Save JWT from backend so sync engine can authenticate
      if (result.auth_token) {
        await setAuthToken(result.auth_token);
      }
       onComplete({
         id: result.shop_id,
         shop_id: result.shop_id,
         name: identity.shop_name,
         phone: fullPhone,
         role: 'owner',
         join_code: result.join_code,
         join_url: result.join_url,
         staff_id: result.staff_id,
         device_id: result.device_id,
         display_name: result.display_name || name.trim(),
         device_status: result.device_status || 'active',
       });
    } catch {
      // Gate C (offline path): createShop failed, but a shop now exists on this
      // phone and the person who created it is its owner. Stamp the owner role
      // with role defaults (no server payload) so the very first session opens
      // owner surfaces instead of silently degrading to STAFF_MINIMAL_SAFE.
      stampOwnerPermissions();
       await db.settings.put({ key: 'intro_seen', value: 'yes' });
       await db.settings.put({ key: 'shop_name', value: name.trim() });
       await db.settings.put({ key: 'shop_phone', value: fullPhone });
       fireToast(label('onboarding.saved-on-this-phone-connect-to-internet-to', lang), 5000);
       onComplete({ name: name.trim(), phone: fullPhone });
    } finally {
      setSaving(false);
    }
  };

  if (mode === 'choice') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-start px-4 py-5 texture-noise overflow-y-auto"
        style={{ background: 'var(--color-primary)' }}
      >
        <div className="w-full max-w-sm">
          {/* Language toggle */}
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={toggleLang}
              className="press-scale"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 999,
                padding: '6px 12px',
                color: 'var(--color-bg-white)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              aria-label={label('onboarding.copy', lang)}
            >
              🌐 {label('onboarding.copy-2', lang)}
            </button>
          </div>

          {/* Minimalist header */}
          <div className="text-center mb-4 animate-elastic">
            <img
              src="/icon-192.png"
              alt="Gebya"
              width={56}
              height={56}
              className="mx-auto mb-2"
              style={{ borderRadius: 14, boxShadow: '0 4px 12px -4px rgba(0,0,0,0.4)' }}
            />
            <h1 className="text-2xl font-black text-white tracking-tight mb-0.5 font-serif">Gebya</h1>
            <p className="text-sm font-semibold font-sans" style={{ color: 'rgba(255,255,255,0.72)' }}>
              {t.onboardTagline}
            </p>
          </div>

          <div
            className="bg-white p-6 animate-slide-up"
            style={{ borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)' }}
          >
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--color-accent-amber)' }}>
              {onboardKicker}
            </p>
            <h2 className="text-2xl font-black text-gray-900 mb-2 font-sans">
              {label('onboarding.select-account-type', lang)}
            </h2>

            {lang === 'am' ? renderAmharicOptions() : renderEnglishOptions()}
          </div>

          <p className="text-center text-xs mt-4 leading-5 font-sans" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {t.onboardFooter}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-4 py-5 texture-noise overflow-y-auto"
      style={{ background: 'var(--color-primary)' }}
    >
      <div className="w-full max-w-sm">
        {/* Back */}
        <div className="flex justify-start mb-2">
          <button
            type="button"
            onClick={() => setMode('choice')}
            className="press-scale"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 999,
              padding: '6px 12px',
              color: 'var(--color-bg-white)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ← {label('onboarding.back', lang)}
          </button>
        </div>

        <div className="text-center mb-4 animate-elastic">
          <img
            src="/icon-192.png"
            alt="Gebya"
            width={56}
            height={56}
            className="mx-auto mb-2"
            style={{ borderRadius: 14, boxShadow: '0 4px 12px -4px rgba(0,0,0,0.4)' }}
          />
          <h1 className="text-2xl font-black text-white tracking-tight mb-0.5 font-serif">Gebya</h1>
        </div>

        <div
          className="bg-white p-6 animate-slide-up"
          style={{ borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)' }}
        >
          <h2 className="text-xl font-black text-gray-900 mb-4 font-sans">
            {label('onboarding.set-up-your-notebook', lang)}
          </h2>

          {/* Name */}
          <div className="mb-4">
            <label className="block text-xs font-black uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              {label('onboarding.your-name', lang)} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(prev => ({ ...prev, name: true }))}
              placeholder={lang === 'am' ? 'ስምዎን ያስገቡ' : t.onboardNamePlaceholder}
              className="w-full px-4 py-3 rounded-xl text-sm font-medium"
              style={{
                background: 'var(--color-bg-active)',
                border: `2px solid ${touched.name && !nameValid ? 'var(--color-danger)' : 'var(--color-bg-disabled)'}`,
                outline: 'none',
              }}
              autoFocus
            />
            {touched.name && !nameValid && (
              <p className="text-xs font-medium mt-1" style={{ color: 'var(--color-danger)' }}>
                {label('onboarding.please-enter-your-name', lang)}
              </p>
            )}
          </div>

          {/* Phone */}
          <div className="mb-4">
            <label className="block text-xs font-black uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              {label('onboarding.phone-number', lang)} <span style={{ color: 'var(--color-text-soft)', fontWeight: 500 }}>{phoneOptionalLabel}</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold px-3 py-3 rounded-xl" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>+251</span>
              <input
                type="tel"
                value={phoneDigits}
                onChange={handlePhoneChange}
                onBlur={() => setTouched(prev => ({ ...prev, phone: true }))}
                placeholder="912345678"
                className="flex-1 px-4 py-3 rounded-xl text-sm font-medium"
                style={{
                  background: 'var(--color-bg-active)',
                  border: `2px solid ${touched.phone && phoneEntered && !phoneValid ? 'var(--color-danger)' : 'var(--color-bg-disabled)'}`,
                  outline: 'none',
                }}
                inputMode="numeric"
              />
            </div>
            {touched.phone && phoneEntered && !phoneValid && (
              <p className="text-xs font-medium mt-1" style={{ color: 'var(--color-danger)' }}>
                {label('onboarding.enter-a-valid-phone-number', lang)}
              </p>
            )}
            <p className="text-xs mt-1 font-medium" style={{ color: 'var(--color-text-soft)' }}>{phoneHelper}</p>
          </div>

           {/* Promises */}
          <div className="mb-4 space-y-2">
            {onboardingPromises.map((promise, i) => (
              <div key={i} className="flex items-start gap-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                <span style={{ color: 'var(--color-success)' }}>✓</span>
                {promise}
              </div>
            ))}
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleStart}
            disabled={!canProceed || saving}
            className="w-full py-3.5 rounded-xl font-black text-sm min-h-[48px] press-scale"
            style={{
              background: canProceed && !saving ? 'var(--color-primary)' : 'var(--color-text-soft)',
              color: canProceed && !saving ? 'var(--color-bg-white)' : 'var(--color-text-soft)',
              cursor: canProceed && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving
              ? (label('onboarding.saving', lang))
              : (label('onboarding.start', lang))
            }
          </button>
        </div>

        <p className="text-center text-xs mt-4 leading-5 font-sans" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {t.onboardFooter}
        </p>
      </div>
    </div>
  );
}

export default OnboardingScreen;

