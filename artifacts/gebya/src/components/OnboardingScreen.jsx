import { useState } from 'react';
import { useLang } from '../context/LangContext';
import { fireToast } from './Toast';
import db, { setIdentity } from '../db';
import { identityApi } from '../api/identity';

function isValidPhone(digits) {
  return /^[79]\d{8}$/.test(digits);
}

const BUSINESS_TYPE_OPTIONS_EN = [
  { value: 'retail-shop', label: 'Retail shop' },
  { value: 'shoe-market', label: 'Shoe market' },
  { value: 'flower-shop', label: 'Flower shop' },
  { value: 'women-dress-shop', label: 'Women dress shop' },
  { value: 'grocery', label: 'Grocery / minimarket' },
  { value: 'electronics', label: 'Electronics / accessories' },
  { value: 'pharmacy', label: 'Pharmacy / cosmetics' },
  { value: 'other', label: 'Other' },
];

const BUSINESS_TYPE_OPTIONS_AM = [
  { value: 'retail-shop', label: 'የችርቻሮ ሱቅ' },
  { value: 'shoe-market', label: 'የጫማ መሸጫ' },
  { value: 'flower-shop', label: 'የአበባ ሱቅ' },
  { value: 'women-dress-shop', label: 'የሴቶች ልብስ ሱቅ' },
  { value: 'grocery', label: 'ግሮሰሪ / ሚኒማርኬት' },
  { value: 'electronics', label: 'ኤሌክትሮኒክስ / መለዋወጫ' },
  { value: 'pharmacy', label: 'ፋርማሲ / መዋቢያ' },
  { value: 'other', label: 'ሌላ' },
];

function OnboardingScreen({ onComplete }) {
  const { t, lang, toggleLang } = useLang();
  const phoneOptionalLabel = t.onboardPhoneOptional || '(optional)';
  const phoneHelper = t.onboardPhoneHelper || 'You can add your phone later in Settings.';
  const onboardingPromises = [
    t.onboardPromiseSimple || 'Simple notebook for sales, spending, and Dubie',
    t.onboardPromiseFast || 'Start with your name only',
    t.onboardPromisePrivate || 'Your records stay on this phone',
  ];
  const businessTypeOptions = lang === 'am' ? BUSINESS_TYPE_OPTIONS_AM : BUSINESS_TYPE_OPTIONS_EN;
  const onboardKicker = lang === 'am' ? 'ጌብያን ለመጠቀም ሁለት መንገዶች' : 'Two ways to use Gebya';

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
            <div className="text-sm font-medium" style={{ color: '#6b7280' }}>Create your own notebook</div>
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
            <div className="text-sm font-medium" style={{ color: '#6b7280' }}>Connect as a staff member</div>
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
            <div className="text-sm font-medium" style={{ color: '#6b7280' }}>የራስዎን ማስታወሻ ይፍጠሩ</div>
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
            <div className="text-sm font-medium" style={{ color: '#6b7280' }}>እንደ ሰራተኛ ይገናኙ</div>
          </div>
        </button>
      </div>
    );
  }

  const [mode, setMode] = useState('choice');
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [businessType, setBusinessType] = useState('retail-shop');
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
        business_type: businessType,
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
      await db.settings.put({ key: 'intro_seen', value: 'yes' });
      await db.settings.put({ key: 'shop_name', value: identity.shop_name });
      await db.settings.put({ key: 'shop_phone', value: fullPhone });
      await db.settings.put({ key: 'shop_business_type', value: businessType });
      onComplete({
        id: result.shop_id,
        shop_id: result.shop_id,
        name: identity.shop_name,
        phone: fullPhone,
        businessType,
        role: 'owner',
        join_code: result.join_code,
        join_url: result.join_url,
        staff_id: result.staff_id,
        device_id: result.device_id,
        display_name: result.display_name || name.trim(),
        device_status: result.device_status || 'active',
      });
    } catch {
      await db.settings.put({ key: 'intro_seen', value: 'yes' });
      await db.settings.put({ key: 'shop_name', value: name.trim() });
      await db.settings.put({ key: 'shop_phone', value: fullPhone });
      await db.settings.put({ key: 'shop_business_type', value: businessType });
      fireToast(lang === 'am' ? 'በዚህ ስልክ ብቻ ተቀምጧል — ኢንተርኔት ሲገኝ ማገናኘት ይችላሉ' : 'Saved on this phone — connect to internet to enable sync', 5000);
      onComplete({ name: name.trim(), phone: fullPhone, businessType });
    } finally {
      setSaving(false);
    }
  };

  if (mode === 'choice') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-start px-4 py-5 texture-noise overflow-y-auto"
        style={{ background: '#1B4332' }}
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
                color: '#fff',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              aria-label={lang === 'am' ? 'Switch to English' : 'ወደ አማርኛ ቀይር'}
            >
              🌐 {lang === 'am' ? 'English' : 'አማርኛ'}
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
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-2" style={{ color: '#C4883A' }}>
              {onboardKicker}
            </p>
            <h2 className="text-2xl font-black text-gray-900 mb-2 font-sans">
              {lang === 'am' ? 'የአጠቃቀም አይነት ይምረጡ' : 'Select Account Type'}
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
      style={{ background: '#1B4332' }}
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
              color: '#fff',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ← {lang === 'am' ? 'ተመለስ' : 'Back'}
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
            {lang === 'am' ? 'የሱቅዎን ማስታወሻ ደብተር ያዘጋጁ' : 'Set up your notebook'}
          </h2>

          {/* Name */}
          <div className="mb-4">
            <label className="block text-xs font-black uppercase tracking-wide mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ስም' : 'Your Name'} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(prev => ({ ...prev, name: true }))}
              placeholder={lang === 'am' ? 'ስምዎን ያስገቡ' : 'Enter your name'}
              className="w-full px-4 py-3 rounded-xl text-sm font-medium"
              style={{
                background: '#f9fafb',
                border: `2px solid ${touched.name && !nameValid ? '#ef4444' : '#e5e7eb'}`,
                outline: 'none',
              }}
              autoFocus
            />
            {touched.name && !nameValid && (
              <p className="text-xs font-medium mt-1" style={{ color: '#ef4444' }}>
                {lang === 'am' ? 'እባክዎ ስም ያስገቡ' : 'Please enter your name'}
              </p>
            )}
          </div>

          {/* Phone */}
          <div className="mb-4">
            <label className="block text-xs font-black uppercase tracking-wide mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'ስልክ ቁጥር' : 'Phone Number'} <span style={{ color: '#9ca3af', fontWeight: 500 }}>{phoneOptionalLabel}</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold px-3 py-3 rounded-xl" style={{ background: '#f3f4f6', color: '#6b7280' }}>+251</span>
              <input
                type="tel"
                value={phoneDigits}
                onChange={handlePhoneChange}
                onBlur={() => setTouched(prev => ({ ...prev, phone: true }))}
                placeholder="912345678"
                className="flex-1 px-4 py-3 rounded-xl text-sm font-medium"
                style={{
                  background: '#f9fafb',
                  border: `2px solid ${touched.phone && phoneEntered && !phoneValid ? '#ef4444' : '#e5e7eb'}`,
                  outline: 'none',
                }}
                inputMode="numeric"
              />
            </div>
            {touched.phone && phoneEntered && !phoneValid && (
              <p className="text-xs font-medium mt-1" style={{ color: '#ef4444' }}>
                {lang === 'am' ? 'እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ' : 'Enter a valid phone number'}
              </p>
            )}
            <p className="text-xs mt-1 font-medium" style={{ color: '#9ca3af' }}>{phoneHelper}</p>
          </div>

          {/* Business type */}
          <div className="mb-4">
            <label className="block text-xs font-black uppercase tracking-wide mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'የሱቅ አይነት' : 'Business Type'}
            </label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm font-medium"
              style={{ background: '#f9fafb', border: '2px solid #e5e7eb', outline: 'none' }}
            >
              {businessTypeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Promises */}
          <div className="mb-4 space-y-2">
            {onboardingPromises.map((promise, i) => (
              <div key={i} className="flex items-start gap-2 text-xs font-medium" style={{ color: '#6b7280' }}>
                <span style={{ color: '#16a34a' }}>✓</span>
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
              background: canProceed && !saving ? '#1B4332' : '#d1d5db',
              color: canProceed && !saving ? '#fff' : '#9ca3af',
              cursor: canProceed && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving
              ? (lang === 'am' ? 'በማስቀመጥ ላይ...' : 'Saving...')
              : (lang === 'am' ? 'ጀምር' : 'Start')
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

