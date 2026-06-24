import { useState, useEffect } from 'react';
import { Phone, ArrowRight, Check, AlertCircle, X } from 'lucide-react';
import { requestOtp, verifyOtp, linkDevice } from '../utils/authClient';
import { getAuthToken, setAuthToken } from '../utils/syncEngine';
import { getOrCreateCloudProofDeviceId } from '../utils/cloudProof';
import { fireToast } from './Toast';

export default function AuthGate({ onAuthenticated, onSkip, shopPhone = '', lang = 'en' }) {
  const [step, setStep] = useState('phone'); // phone | otp | loading
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Pre-fill phone from shop profile on mount (store only the 9 local digits)
  useEffect(() => {
    if (shopPhone) {
      const digits = shopPhone.replace(/\D/g, '');
      if (digits.startsWith('251') && digits.length === 12) {
        setPhone(digits.slice(3)); // strip 251, keep the 9 local digits
      } else if (digits.length === 9 && (digits[0] === '9' || digits[0] === '7')) {
        setPhone(digits);
      }
    }
  }, [shopPhone]);

  const t = {
    en: {
      title: 'Sign in to Gebya',
      subtitle: 'Enter your shop phone number to sync your data across devices',
      phoneLabel: 'Phone number',
      phonePlaceholder: '+251 9XX XXX XXX',
      continue: 'Continue',
      otpLabel: 'Enter the code we sent',
      otpPlaceholder: '6-digit code',
      verify: 'Verify',
      resend: 'Resend code',
      back: 'Back',
      skip: 'Use without cloud',
      skipHint: 'Your data stays on this phone only',
      invalidPhone: 'Please enter a valid Ethiopian phone number',
      otpSent: 'Code sent! Check Telegram',
      noTelegram: 'No Telegram? Use without cloud below',
      loginSuccess: 'Signed in successfully',
      genericError: 'Something went wrong. Please try again.',
    },
    am: {
      title: 'ወደ ጌባያ ይግቡ',
      subtitle: 'መረጃዎን በሁሉም መሳሪያዎች ላይ ለማቀነስ የሱቅዎን ስልክ ቁጥር ያስገቡ',
      phoneLabel: 'ስልክ ቁጥር',
      phonePlaceholder: '+251 9XX XXX XXX',
      continue: 'ቀጥል',
      otpLabel: 'የተላከውን ኮድ ያስገቡ',
      otpPlaceholder: '6 አኃዝ ኮድ',
      verify: 'ያረጋግጡ',
      resend: 'ኮድ እንደገና ይላኩ',
      back: 'ተመለስ',
      skip: 'በደመና ሳይሆን ይጠቀሙ',
      skipHint: 'መረጃዎ በዚህ ስልክ ላይ ብቻ ይቀመጣል',
      invalidPhone: 'የሚሰራ የኢትዮጵያ ስልክ ቁጥር ያስገቡ',
      otpSent: 'ኮድ ተላክ! ቴሌግራም ያረጋግጡ',
      noTelegram: 'ቴሌግራም የለዎትም? ከዚህ በታች ያለውን ይጠቀሙ',
      loginSuccess: 'በተሳካ ሁኔታ ገብተዋል',
      genericError: 'ችግር ተፈጥሯል። እባክዎ ይደጉሙ።',
    },
  }[lang];

  // phone state holds the 9 local digits only (e.g. "912345678" or "712345678")
  function isValidLocalPhone(localDigits) {
    return localDigits.length === 9 && (localDigits[0] === '9' || localDigits[0] === '7');
  }

  async function handleRequestOtp() {
    if (!isValidLocalPhone(phone)) {
      setError(t.invalidPhone);
      return;
    }
    const formatted = `+251${phone}`;
    setError(null);
    setLoading(true);
    try {
      await requestOtp(formatted);
      setStep('otp');
      fireToast(t.otpSent, 3000);
    } catch (err) {
      setError(err.message || t.genericError);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    const formatted = `+251${phone}`;
    setError(null);
    setLoading(true);
    try {
      const { token, user, role, permissions } = await verifyOtp(formatted, otp);
      await setAuthToken(token);
      const deviceId = await getOrCreateCloudProofDeviceId();
      try { await linkDevice(token, deviceId); } catch (e) { /* non-critical */ }
      fireToast(t.loginSuccess, 2000);
      onAuthenticated?.(user, role, permissions);
    } catch (err) {
      setError(err.message || t.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: '#f0fdf4' }}>
            <Phone className="w-6 h-6 text-green-700" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl px-4 py-3 text-xs font-medium flex items-center gap-2" style={{ background: '#fef2f2', color: '#991b1b' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {step === 'phone' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">{t.phoneLabel}</label>
              <div className="flex gap-0">
                <div className="flex items-center justify-center px-3 py-3 rounded-l-xl border-2 border-r-0 text-sm font-bold" style={{ background: '#f5f0e8', borderColor: '#e8e2d8', color: '#1B4332', minWidth: '64px' }}>
                  +251
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => {
                    // Strip non-digits, cap at 9 chars
                    const raw = e.target.value.replace(/\D/g, '').slice(0, 9);
                    // First digit must be 7 or 9 (or empty while typing)
                    if (raw.length > 0 && raw[0] !== '7' && raw[0] !== '9') return;
                    setPhone(raw);
                    setError(null);
                  }}
                  placeholder="9XX XXX XXX"
                  maxLength={9}
                  className="flex-1 px-4 py-3 border-2 rounded-r-xl text-sm focus:outline-none"
                  style={{ borderColor: error ? '#fca5a5' : '#e8e2d8' }}
                  autoFocus
                />
              </div>
            </div>
            <button
              onClick={handleRequestOtp}
              disabled={loading || !isValidLocalPhone(phone)}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all min-h-[48px]"
              style={{
                background: loading ? '#e5e7eb' : '#1B4332',
                color: loading ? '#9ca3af' : '#fff',
              }}
            >
              {loading ? '...' : <><ArrowRight className="w-4 h-4" /> {t.continue}</>}
            </button>
            <button
              onClick={() => onSkip?.()}
              className="w-full py-3 rounded-xl text-sm font-bold border-2 border-dashed transition-all min-h-[48px]"
              style={{ borderColor: '#e8e2d8', color: '#6b7280', background: '#FAF8F5' }}
            >
              <X className="w-4 h-4 inline mr-1" /> {t.skip}
            </button>
            <p className="text-[10px] text-center" style={{ color: '#9ca3af' }}>{t.skipHint}</p>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">{t.otpLabel}</label>
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t.otpPlaceholder}
                maxLength={6}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm font-bold tracking-widest text-center focus:outline-none"
                style={{ borderColor: '#e8e2d8' }}
                autoFocus
              />
            </div>
            <p className="text-[10px] text-center" style={{ color: '#9ca3af' }}>{t.noTelegram}</p>
            <button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all min-h-[48px]"
              style={{
                background: loading ? '#e5e7eb' : '#1B4332',
                color: loading ? '#9ca3af' : '#fff',
              }}
            >
              {loading ? '...' : <><Check className="w-4 h-4" /> {t.verify}</>}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setStep('phone')}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold min-h-[40px]"
                style={{ background: '#f5f5f5', color: '#374151' }}
              >
                {t.back}
              </button>
              <button
                onClick={handleRequestOtp}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold min-h-[40px]"
                style={{ background: '#FAF8F5', color: '#1B4332', border: '1px solid #e8e2d8' }}
              >
                {t.resend}
              </button>
            </div>
            <button
              onClick={() => onSkip?.()}
              className="w-full py-2.5 rounded-xl text-xs font-bold min-h-[40px]"
              style={{ background: '#fff', color: '#6b7280', border: '1px solid #e8e2d8' }}
            >
              <X className="w-3.5 h-3.5 inline mr-1" /> {t.skip}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
