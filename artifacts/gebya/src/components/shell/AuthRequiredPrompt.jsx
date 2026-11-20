import { useState, useEffect, useMemo } from 'react';
import { requestOtp, verifyOtp, loginWithPassword, setPassword } from '../../utils/authClient';
import { setAuthToken, getAuthToken } from '../../utils/syncEngine';
import { fireToast } from '../Toast';
import { label } from '../../labels/index.js';

export default function AuthRequiredPrompt({ lang, onClose, onStaffJoin }) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [step, setStep] = useState('phone');
  const [authMethod, setAuthMethod] = useState('otp');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [deliveryMethod, setDeliveryMethod] = useState(null);

  const t = useMemo(() => {
    return lang === 'am' ? {
      title: 'እባክዎ ይግቡ',
      subtitle: 'መረጃዎን ለማቀነስ የስልክ ቁጥርዎን ያስገቡ',
      phoneLabel: 'ስልክ ቁጥር',
      continue: 'ቀጥል',
      otpLabel: 'የተላከውን ኮድ ያስገቡ',
      verify: 'ያረጋግጡ',
      resend: 'ኮድ እንደገና ይላኩ',
      back: 'ተመለስ',
      skip: 'ዝጋ',
      invalidPhone: 'ትክክለኛ ስልክ ቁጥር ያስገቡ',
      otpSent: 'ኮድ ተላክ!',
      success: 'በተሳካ ሁኔታ ገብተዋል',
      error: 'ችግር ተፈጥሮ',
      codeExpired: 'የኮድ ጊዜው አልፎበታል። እንደገና ይሰራው',
      codeInvalid: 'ትክክለኛ ኮድ። እባክዎ ይህልዑት ኮድ ያስገቡ',
      tooManyAttempts: 'በቀየሩ ከፍተኛ ሙያዊ ሙያዊ ሙያዊ',
      sendingViaSMS: 'ማስታወቂያ በSMS ነው የተላከ',
      sendingViaTelegram: 'ማስታወቂያ በTelegram ነው የተላከ',
      notOnTeam: 'አይደለም?',
      joinShop: 'ሱቩን ይቀላቀሉ',
      resending: 'በመላኪያ ነው...',
      verifying: 'በማረጋገጣ ነው...',
      passwordLabel: 'የሚስጥር ቃል መዲወ',
      passwordLogin: 'ከይምት ቃል መዲዛ ይግቡ',
      otpLogin: 'ከOTP ኮድ ይግቡ',
      passwordInvalid: 'ትክክለኛ ወይም ችግኛ ይምት ቃል መዲዛ',
      passwordTooShort: 'የሚስጥር ቃል መዲዛ ቢሆን 6 በላይ ከአይነት ነው',
      wrongPassword: 'ትክክለኛ ይምት ቃል መዲዛ',
      passwordSetup: 'የሚስጥር ቃል መዲዛ ያስገብ',
      skipPasswordSetup: 'አልጨማምትም — ከOTP ጋር ይጠቀሙ',
    } : {
      title: 'Sign in',
      subtitle: 'Enter your phone number to restore cloud sync',
      phoneLabel: 'Phone number',
      continue: 'Continue',
      otpLabel: 'Enter the code we sent',
      verify: 'Verify',
      resend: 'Resend code',
      back: 'Back',
      skip: 'Dismiss',
      invalidPhone: 'Enter a valid phone number',
      otpSent: 'Code sent!',
      success: 'Signed in successfully',
      error: 'Something went wrong',
      codeExpired: 'Code expired. Please request a new one.',
      codeInvalid: 'Invalid code. Please try again.',
      tooManyAttempts: 'Too many attempts. Please request a new code.',
      sendingViaSMS: 'Sent via SMS',
      sendingViaTelegram: 'Sent via Telegram',
      notOnTeam: 'Not on the team?',
      joinShop: 'Join a Shop',
      resending: 'Resending…',
      verifying: 'Verifying…',
      passwordLabel: 'Password',
      passwordLogin: 'Sign in with password',
      otpLogin: 'Use OTP code',
      passwordInvalid: 'Invalid or too short password',
      passwordTooShort: 'Password must be at least 6 characters',
      wrongPassword: 'Wrong password',
      passwordSetup: 'Set a password',
      skipPasswordSetup: 'Skip — use OTP instead',
    }
  }, [lang]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  async function handleRequestOtp() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 9 || (digits[0] !== '7' && digits[0] !== '9')) {
      setError(t.invalidPhone);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await requestOtp(`+251${digits}`);
      setDeliveryMethod(data?.provider || (data?.sent ? 'sms' : null));
      setStep('otp');
      setResendCooldown(30);
      fireToast(t.otpSent, 2000);
    } catch (err) {
      if (err.status === 429) {
        setError(t.tooManyAttempts);
        setResendCooldown(60);
      } else {
        setError(err.message || t.error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    const digits = phone.replace(/\D/g, '');
    setError(null);
    setLoading(true);
    try {
      const { token, user, role, permissions, businesses } = await verifyOtp(`+251${digits}`, otp);
      await setAuthToken(token);

      const { useAuthStore } = await import('../../stores/authStore');
      await useAuthStore.getState().init();

      // Check if user has a password set; if not, offer to set one
      const hasPassword = useAuthStore.getState().hasPassword;
      if (!hasPassword) {
        setStep('set-password');
      } else {
        fireToast(t.success, 2000);
        onClose();
      }
    } catch (err) {
      if (err.status === 400 && /expired|invalid.*otp/i.test(err.message || '')) {
        setError(t.codeExpired);
      } else if (err.status === 429 || /attempt/i.test(err.message || '')) {
        setError(t.tooManyAttempts);
      } else {
        setError(err.message || t.codeInvalid);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPassword() {
    const digits = phone.replace(/\D/g, '');
    if (passwordInput.length < 6) {
      setError(t.passwordTooShort);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error(t.error);
      await setPassword(token, passwordInput);

      const { useAuthStore } = await import('../../stores/authStore');
      useAuthStore.setState({ hasPassword: true });

      fireToast(t.success, 2000);
      onClose();
    } catch (err) {
      setError(err.message || t.error);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(digits) {
    setError(null);
    setLoading(true);
    try {
      const { token } = await loginWithPassword(`+251${digits}`, passwordInput);
      await setAuthToken(token);

      const { useAuthStore } = await import('../../stores/authStore');
      await useAuthStore.getState().init();

      fireToast(t.success, 2000);
      onClose();
    } catch (err) {
      if (err.status === 429) {
        setError(t.tooManyAttempts);
      } else if (err.status === 401) {
        setError(t.wrongPassword);
      } else {
        setError(err.message || t.error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePhoneSubmit() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 9 || (digits[0] !== '7' && digits[0] !== '9')) {
      setError(t.invalidPhone);
      return;
    }
    if (authMethod === 'password') {
      return handlePasswordLogin(digits);
    }
    return handleRequestOtp();
  }

  const deliveryLabel = deliveryMethod === 'telegram' ? t.sendingViaTelegram : (deliveryMethod ? t.sendingViaSMS : '');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-5">
          <h2 className="text-lg font-bold text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>

        {error && (
          <div className="mb-3 rounded-xl px-3 py-2 text-xs font-medium" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}>
            {error}
          </div>
        )}

        {step === 'phone' && (
          <div className="space-y-3">
            <div className="flex gap-0">
              <div className="flex items-center justify-center px-3 py-3 rounded-l-xl border-2 border-r-0 text-sm font-bold" style={{ background: 'var(--color-surface-muted)', borderColor: 'var(--color-border)', color: 'var(--color-primary)', minWidth: '64px' }}>
                +251
              </div>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 9)); setError(null); }}
                placeholder="9XX XXX XXX"
                maxLength={9}
                className="flex-1 px-4 py-3 border-2 rounded-r-xl text-sm focus:outline-none"
                style={{ borderColor: error ? 'var(--color-danger-border)' : 'var(--color-border)' }}
                autoFocus
              />
            </div>

            {authMethod === 'password' && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  {t.passwordLabel}
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => { setPasswordInput(e.target.value); setError(null); }}
                  placeholder={t.passwordLabel}
                  maxLength={32}
                  className="w-full px-4 py-3 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                  style={{ borderColor: error ? 'var(--color-danger-border)' : 'var(--color-border)' }}
                />
              </div>
            )}

            <button
              onClick={handlePhoneSubmit}
              disabled={loading || phone.length !== 9 || (authMethod === 'password' && passwordInput.length < 6)}
              className="w-full py-3 rounded-xl font-bold text-sm min-h-[48px]"
              style={{ background: loading ? 'var(--color-bg-disabled)' : 'var(--color-primary)', color: loading ? 'var(--color-text-soft)' : 'var(--color-bg-white)' }}
            >
              {loading ? '...' : (authMethod === 'password' ? t.passwordLogin : t.continue)}
            </button>

            {authMethod === 'otp' && (
              <button
                onClick={() => { setAuthMethod('password'); setPasswordInput(''); setError(null); }}
                className="w-full py-2.5 text-xs font-bold text-gray-500"
              >
                {t.passwordLogin}
              </button>
            )}

            {authMethod === 'password' && (
              <button
                onClick={() => { setAuthMethod('otp'); setPasswordInput(''); setError(null); setStep('phone'); }}
                className="w-full py-2.5 text-xs font-bold text-gray-500"
              >
                {t.otpLogin}
              </button>
            )}

            <button onClick={onClose} className="w-full py-2.5 text-xs font-bold text-gray-400">{t.skip}</button>
            {onStaffJoin && authMethod === 'otp' && (
              <button
                onClick={() => {
                  onClose();
                  onStaffJoin();
                }}
                className="w-full py-2.5 text-xs font-bold text-gray-500"
              >
                {t.notOnTeam} → {t.joinShop}
              </button>
            )}
          </div>
        )}

        {step === 'otp' && authMethod === 'otp' && (
          <div className="space-y-3">
            {deliveryLabel && (
              <div className="text-center">
                <span className="text-xs text-gray-400">{deliveryLabel}</span>
              </div>
            )}
            <p className="text-xs text-center text-gray-500">
              {phone.replace(/(\d{3})(\d{3})(\d{4})/, '+251 $1 $2 $3')}
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              maxLength={6}
              className="w-full px-4 py-3 border-2 rounded-xl text-sm font-bold tracking-widest text-center focus:outline-none"
              style={{ borderColor: 'var(--color-border)' }}
              autoFocus
            />
            <button
              onClick={handleVerify}
              disabled={loading || otp.length !== 6}
              className="w-full py-3 rounded-xl font-bold text-sm min-h-[48px]"
              style={{ background: loading ? 'var(--color-bg-disabled)' : 'var(--color-primary)', color: loading ? 'var(--color-text-soft)' : 'var(--color-bg-white)' }}
            >
              {loading ? t.verifying : t.verify}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => { setStep('phone'); setOtp(''); setError(null); }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                style={{ background: 'var(--color-surface-muted)' }}
              >
                {t.back}
              </button>
              <button
                onClick={() => { setOtp(''); setError(null); handleRequestOtp(); }}
                 disabled={loading || resendCooldown > 0}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}
              >
                {resendCooldown > 0 ? `${t.resend} (${resendCooldown}s)` : (loading ? t.resending : t.resend)}
              </button>
            </div>
            <button onClick={onClose} className="w-full py-2.5 text-xs font-bold text-gray-400">{t.skip}</button>
          </div>
        )}

        {step === 'set-password' && (
          <div className="space-y-3">
            <div className="text-center">
              <p className="text-sm text-gray-500">
                {label('auth.signed-in-successfully-set-a-password-for', lang)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                {t.passwordLabel}
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setError(null); }}
                placeholder={t.passwordLabel}
                maxLength={32}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                style={{ borderColor: error ? 'var(--color-danger-border)' : 'var(--color-border)' }}
                autoFocus
              />
            </div>
            <button
              onClick={handleSetPassword}
              disabled={loading || passwordInput.length < 6}
              className="w-full py-3 rounded-xl font-bold text-sm min-h-[48px] text-white"
              style={{ background: loading || passwordInput.length < 6 ? 'var(--color-bg-disabled)' : 'var(--color-primary)' }}
            >
              {loading ? t.verifying : t.passwordSetup}
            </button>
            <button
              onClick={() => { fireToast(t.success, 2000); onClose(); }}
              className="w-full py-2.5 text-xs font-bold text-gray-500"
            >
              {t.skipPasswordSetup}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
