import { useState, useEffect } from 'react';
import { Phone, ArrowRight, Check, AlertCircle, X, KeyRound } from 'lucide-react';
import { requestOtp, verifyOtp, linkDevice, getCurrentUser } from '../utils/authClient';
import { getAuthToken, setAuthToken } from '../utils/syncEngine';
import { getOrCreateCloudProofDeviceId } from '../utils/cloudProof';
import { fireToast } from './Toast';
import { label } from '../labels/index';

const API_BASE = import.meta.env.VITE_SYNC_API_URL || '/api';

export default function AuthGate({ onAuthenticated, onSkip, shopPhone = '', lang = 'en' }) {
  const [step, setStep] = useState('phone'); // phone | otp | loading | invite_code
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Pre-fill phone from shop profile on mount
  useEffect(() => {
    if (shopPhone) {
      const digits = shopPhone.replace(/\D/g, '');
      if (digits.startsWith('251') && digits.length === 12) {
        setPhone(digits.slice(3));
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
      inviteTitle: 'Have an invite code?',
      inviteSubtitle: 'Enter the code your shop owner gave you to join their shop',
      invitePlaceholder: 'Paste invite code here',
      joinShop: 'Join Shop',
      invalidInvite: 'This code is invalid or has expired',
      inviteJoined: 'You have joined the shop! Signing you in...',
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
      inviteTitle: 'የጋበዛ ኮድ አለዎት?',
      inviteSubtitle: 'የሱቅ ባለቤት የሰጠዎትን ኮድ ያስገቡ',
      invitePlaceholder: 'ኮዱን እዚህ ያስገቡ',
      joinShop: 'ሱቁን ይቀላቀሉ',
      invalidInvite: 'ኮዱ ልክ አይደለም ወይም ጊዜው አልፏል',
      inviteJoined: 'ሱቁን ተቀላቅለዋል! እያስገባንዎት ነው...',
    },
  }[lang];

  function isValidLocalPhone(localDigits) {
    return localDigits.length === 9 && (localDigits[0] === '9' || localDigits[0] === '7');
  }

  async function handleRequestOtp() {
    if (!isValidLocalPhone(phone)) { setError(t.invalidPhone); return; }
    const formatted = `+251${phone}`;
    setError(null);
    setLoading(true);
    try {
      await requestOtp(formatted);
      setStep('otp');
      fireToast(t.otpSent, 3000);
    } catch (err) { setError(err.message || t.genericError); }
    finally { setLoading(false); }
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
    } catch (err) { setError(err.message || t.genericError); }
    finally { setLoading(false); }
  }

  async function handleJoinViaInvite() {
    const code = inviteCode.trim();
    if (!code) return;
    setError(null);
    setInviteLoading(true);
    try {
      const res = await fetch(`${API_BASE}/business/join/${encodeURIComponent(code)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.invalidInvite);
      if (data.requires_auth) {
        // Staff needs to login first
        setError(label('auth.please-sign-in-first-then-enter-the-code', lang));
        return;
      }
      if (data.joined || data.already_member) {
        fireToast(t.inviteJoined, 2500);
        // Reload auth to pick up new membership
        const storedToken = await getAuthToken();
        if (storedToken) {
          try {
            const userData = await getCurrentUser(storedToken);
            onAuthenticated?.(userData.user, userData.role, userData.permissions);
          } catch { window.location.reload(); }
        } else {
          // No token yet — reload so the auth gate can re-initialize with the new membership
          window.location.reload();
        }
      } else {
        setError(t.invalidInvite);
      }
    } catch (err) {
      setError(err.message || t.invalidInvite);
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl max-h-[95vh] overflow-y-auto">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--color-success-bg)' }}>
            <Phone className="w-6 h-6 text-green-700" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl px-4 py-3 text-xs font-medium flex items-center gap-2" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {step === 'phone' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">{t.phoneLabel}</label>
              <div className="flex gap-0">
                <div className="flex items-center justify-center px-3 py-3 rounded-l-xl border-2 border-r-0 text-sm font-bold" style={{ background: 'var(--color-surface-muted)', borderColor: 'var(--color-border)', color: 'var(--color-primary)', minWidth: '64px' }}>
                  +251
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '').slice(0, 9);
                    if (raw.length > 0 && raw[0] !== '7' && raw[0] !== '9') return;
                    setPhone(raw);
                    setError(null);
                  }}
                  placeholder="9XX XXX XXX"
                  maxLength={9}
                  className="flex-1 px-4 py-3 border-2 rounded-r-xl text-sm focus:outline-none"
                  style={{ borderColor: error ? 'var(--color-danger-border)' : 'var(--color-border)' }}
                  autoFocus
                />
              </div>
            </div>
            <button
              onClick={handleRequestOtp}
              disabled={loading || !isValidLocalPhone(phone)}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all min-h-[48px]"
              style={{ background: loading ? 'var(--color-bg-disabled)' : 'var(--color-primary)', color: loading ? 'var(--color-text-soft)' : 'var(--color-bg-white)' }}
            >
              {loading ? '...' : <><ArrowRight className="w-4 h-4" /> {t.continue}</>}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }}></div>
              <span className="text-[10px] font-bold text-gray-400 uppercase">or</span>
              <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }}></div>
            </div>

            {/* Invite code section */}
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-subtle)' }}>
              <div className="flex items-center gap-2 mb-2">
                <KeyRound className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-bold text-gray-700">{t.inviteTitle}</span>
              </div>
              <p className="text-[10px] text-gray-500 mb-2">{t.inviteSubtitle}</p>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => { setInviteCode(e.target.value); setError(null); }}
                placeholder={t.invitePlaceholder}
                className="w-full px-3 py-2.5 border-2 rounded-xl text-xs font-mono focus:outline-none mb-2"
                style={{ borderColor: 'var(--color-border)' }}
              />
              <button
                onClick={handleJoinViaInvite}
                disabled={inviteLoading || !inviteCode.trim()}
                className="w-full py-2.5 rounded-xl text-xs font-bold min-h-[40px]"
                style={{ background: (inviteLoading || !inviteCode.trim()) ? 'var(--color-bg-disabled)' : 'var(--color-primary)', color: (inviteLoading || !inviteCode.trim()) ? 'var(--color-text-soft)' : 'var(--color-bg-white)' }}
              >
                {inviteLoading ? '...' : t.joinShop}
              </button>
            </div>

            <button
              onClick={() => onSkip?.()}
              className="w-full py-3 rounded-xl text-sm font-bold border-2 border-dashed transition-all min-h-[48px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)', background: 'var(--color-surface-muted)' }}
            >
              <X className="w-4 h-4 inline mr-1" /> {t.skip}
            </button>
            <p className="text-[10px] text-center" style={{ color: 'var(--color-text-soft)' }}>{t.skipHint}</p>
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
                style={{ borderColor: 'var(--color-border)' }}
                autoFocus
              />
            </div>
            <p className="text-[10px] text-center" style={{ color: 'var(--color-text-soft)' }}>{t.noTelegram}</p>
            <button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all min-h-[48px]"
              style={{ background: loading ? 'var(--color-bg-disabled)' : 'var(--color-primary)', color: loading ? 'var(--color-text-soft)' : 'var(--color-bg-white)' }}
            >
              {loading ? '...' : <><Check className="w-4 h-4" /> {t.verify}</>}
            </button>
            <div className="flex gap-2">
              <button onClick={() => setStep('phone')} className="flex-1 py-2.5 rounded-xl text-xs font-bold min-h-[40px]" style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text)' }}>
                {t.back}
              </button>
              <button onClick={handleRequestOtp} disabled={loading} className="flex-1 py-2.5 rounded-xl text-xs font-bold min-h-[40px]" style={{ background: 'var(--color-surface-muted)', color: 'var(--color-primary)', border: '1px solid var(--color-border)' }}>
                {t.resend}
              </button>
            </div>
            <button
              onClick={() => onSkip?.()}
              className="w-full py-2.5 rounded-xl text-xs font-bold min-h-[40px]"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
            >
              <X className="w-3.5 h-3.5 inline mr-1" /> {t.skip}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}