import { useState } from 'react';
import { useLang } from '../context/LangContext';
import db from '../db';
import { BUSINESS_TYPE_OPTIONS, getTemplatesForType } from '../utils/itemTemplates';

function isValidPhone(digits) {
  return /^[79]\d{8}$/.test(digits);
}

function OnboardingScreen({ onComplete }) {
  const { t } = useLang();
  const phoneOptionalLabel = t.onboardPhoneOptional || '(optional)';
  const phoneHelper = t.onboardPhoneHelper || 'You can add your phone later in Settings.';
  const onboardingPromises = [
    t.onboardPromiseSimple || 'Simple notebook for sales, spending, and Dubie',
    t.onboardPromisePrivate || 'Your records stay on this phone',
  ];
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [address, setAddress] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [customBusinessType, setCustomBusinessType] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({ name: false, phone: false });

  const nameValid = name.trim().length > 0;
  const phoneEntered = phoneDigits.length > 0;
  const phoneValid = !phoneEntered || isValidPhone(phoneDigits);
  const canProceed = nameValid && phoneValid;
  const resolvedBusinessType = (customBusinessType.trim() || businessType || '').trim();

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length <= 9) setPhoneDigits(raw);
  };

  const handleStart = async () => {
    if (!canProceed || saving) return;
    setSaving(true);
    const fullPhone = phoneEntered ? `+251${phoneDigits}` : '';
    await db.settings.put({ key: 'intro_seen', value: 'yes' });
    await db.settings.put({ key: 'shop_name', value: name.trim() });
    await db.settings.put({ key: 'shop_phone', value: fullPhone });
    await db.settings.put({ key: 'shop_address', value: address.trim() });
    await db.settings.put({ key: 'shop_business_type', value: resolvedBusinessType });
    const templates = getTemplatesForType(resolvedBusinessType);
    const existingCount = await db.catalog_entries.count();
    if (templates.length > 0 && existingCount === 0) {
      for (const tpl of templates) {
        await db.catalog_entries.add({
          name: tpl.name,
          kind: tpl.kind,
          default_price: 0,
          default_cost: 0,
          note: '',
          active: true,
          created_at: Date.now(),
        });
      }
    }
    onComplete({ name: name.trim(), phone: fullPhone, address: address.trim(), businessType: resolvedBusinessType });
  };

  return (
    <div
      className="min-h-[100dvh] overflow-y-auto px-4 py-4 texture-noise sm:px-6 sm:py-8"
      style={{ background: '#1B4332' }}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-start py-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-center">
        <div className="text-center mb-4 animate-elastic sm:mb-6">
          <div className="text-4xl mb-3 font-black text-white" aria-hidden="true">GB</div>
          <h1 className="text-4xl font-black text-white tracking-tight mb-1 font-serif">Gebya</h1>
          <p className="text-base font-semibold font-sans" style={{ color: 'rgba(255,255,255,0.72)' }}>
            {t.onboardTagline}
          </p>
        </div>

        <div
          className="bg-white p-5 animate-slide-up sm:p-6"
          style={{ borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)' }}
        >
          <h2 className="text-2xl font-black text-gray-900 mb-2 font-sans">{t.onboardWelcome}</h2>
          <p className="text-sm leading-6 text-gray-500 mb-4 font-sans">
            {t.onboardDesc}
          </p>

          <div className="space-y-3.5">
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
                onKeyDown={(e) => { if (e.key === 'Enter' && canProceed) handleStart(); }}
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
                  onKeyDown={(e) => { if (e.key === 'Enter' && canProceed) handleStart(); }}
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
                {t.shopAddress} <span className="text-gray-400 font-normal">{t.shopAddressOptional}</span>
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t.shopAddressPlaceholder}
                className="w-full p-4 border-2 text-base focus:outline-none font-sans"
                style={{
                  borderRadius: 'var(--radius-md)',
                  borderColor: '#e8e2d8',
                }}
              />
            </div>

            <div>
              <p className="text-xs leading-5 font-medium font-sans mb-2" style={{ color: '#6b7280' }}>
                {t.onboardBusinessTypeHelper}
              </p>
              <div className="flex flex-wrap gap-2">
                {BUSINESS_TYPE_OPTIONS.map((option) => {
                  const active = businessType === option && !customBusinessType.trim();
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setBusinessType(option);
                        if (option !== 'other') setCustomBusinessType('');
                      }}
                      className="px-3 py-2 border-2 text-sm font-bold font-sans min-h-[40px] transition-all"
                      style={{
                        borderRadius: '999px',
                        borderColor: active ? '#1B4332' : '#e8e2d8',
                        background: active ? 'rgba(27,67,50,0.08)' : '#FAF8F5',
                        color: active ? '#1B4332' : '#4b5563',
                      }}
                    >
                      {t[`businessType${option.charAt(0).toUpperCase()}${option.slice(1)}`]}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={customBusinessType}
                onChange={(e) => {
                  setCustomBusinessType(e.target.value);
                  if (e.target.value.trim()) setBusinessType('other');
                }}
                placeholder={t.onboardBusinessTypePlaceholder}
                className="mt-2 w-full p-4 border-2 text-base focus:outline-none font-sans"
                style={{
                  borderRadius: 'var(--radius-md)',
                  borderColor: customBusinessType.trim() ? '#1B4332' : '#e8e2d8',
                }}
              />
            </div>
          </div>

          <div className="sticky bottom-0 -mx-5 mt-4 bg-white px-5 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:mx-0 sm:mt-5 sm:p-0">
            <button
              onClick={handleStart}
              disabled={!canProceed || saving}
              className="w-full p-4 font-black text-white text-base min-h-[56px] transition-all active:scale-95 font-sans press-scale"
              style={{
                background: canProceed ? '#1B4332' : '#e5e7eb',
                color: canProceed ? '#fff' : '#9ca3af',
                boxShadow: canProceed ? '0 4px 0 #0f2b20, var(--shadow-sm)' : 'none',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {saving ? t.onboardSettingUp : t.onboardGetStarted}
            </button>
          </div>

          <div className="mt-5 border-t pt-4" style={{ borderColor: '#f0ede8' }}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] font-sans" style={{ color: '#9ca3af' }}>
              Gebya
            </p>
            <div className="space-y-2">
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
          </div>
        </div>

        <p className="text-center text-xs mt-4 px-2 leading-5 font-sans" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {t.onboardFooter}
        </p>
      </div>
    </div>
  );
}

export default OnboardingScreen;

