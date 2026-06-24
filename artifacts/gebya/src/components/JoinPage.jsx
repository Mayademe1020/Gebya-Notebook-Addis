import { useState, useEffect } from 'react';
import { Phone, ArrowRight, Check, AlertCircle, Building2 } from 'lucide-react';
import { requestOtp, verifyOtp, linkDevice } from '../utils/authClient';
import { setAuthToken, forceFullSync } from '../utils/syncEngine';
import { getOrCreateCloudProofDeviceId } from '../utils/cloudProof';
import { fireToast } from './Toast';

const API_BASE = import.meta.env.VITE_SYNC_API_URL || '/api';
const JOIN_TOKEN = (() => {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const match = path.match(/^\/join\/(.+)$/);
  return match ? match[1] : null;
})();

const t = {
  en: {
    joinTitle: (name) => `Join ${name}?`,
    joinSubtitle: 'You are invited to manage this shop on Gebya.',
    phoneLabel: 'Phone number',
    phonePlaceholder: '9XX XXX XXX',
    continue: 'Continue',
    otpLabel: 'Enter the code we sent to your Telegram',
    otpPlaceholder: '6-digit code',
    verify: 'Verify',
    resend: 'Resend code',
    back: 'Back',
    joined: 'You joined successfully!',
    alreadyMember: 'You are already a member.',
    invalidPhone: 'Please enter a valid Ethiopian phone number',
    otpSent: 'Code sent! Check Telegram',
    genericError: 'Something went wrong. Please try again.',
    expired: 'This invite has expired. Ask the owner to send a new one.',
    revoked: 'This invite has been revoked.',
    alreadyUsed: 'This invite has already been used.',
    differentBusiness: 'You already belong to a different business.',
    notFound: 'Invite not found.',
    redirecting: 'Redirecting...',
  },
  am: {
    joinTitle: (name) => `${name} ይቀላቀሉ?`,
    joinSubtitle: 'በጌባያ ይህን ሱቅ ለማስተዳደር ተጋብዘዋል።',
    phoneLabel: 'ስልክ ቁጥር',
    phonePlaceholder: '9XX XXX XXX',
    continue: 'ቀጥል',
    otpLabel: 'ወደ ቴሌግራም የተላከውን ኮድ ያስገቡ',
    otpPlaceholder: '6 አኃዝ ኮድ',
    verify: 'ያረጋግጡ',
    resend: 'ኮድ እንደገና ይላኩ',
    back: 'ተመለስ',
    joined: 'በተሳካ ሁኔታ ተቀላቅለዋል!',
    alreadyMember: 'አስቀድመው አባል ናችሁ።',
    invalidPhone: 'የሚሰራ የኢትዮጵያ ስልክ ቁጥር ያስገቡ',
    otpSent: 'ኮድ ተላከ! ቴሌግራም ያረጋግጡ',
    genericError: 'ችግር ተፈጥሯል። እባክዎ ይደጉሙ።',
    expired: 'ይህ ጥሪ ጊዜው አልፎበታል። አዲስ ለመጠየቅ የባለቤቱን ይጠይቁ።',
    revoked: 'ይህ ጥሪ ተሰርዟል።',
    alreadyUsed: 'ይህ ጥሪ ቀድሞውኑ ጥቅም ላይ ውሏል።',
    differentBusiness: 'አስቀድሞ ለሌላ ቢዝነስ ተመዝግበዋል።',
    notFound: 'ጥሪ አልተገኘም።',
    redirecting: 'እየዞሩ ነው...',
  },
};

function isValidLocalPhone(localDigits) {
  return localDigits.length === 9 && (localDigits[0] === '9' || localDigits[0] === '7');
}

async function tryJoin(token, authToken = null) {
  const res = await fetch(`${API_BASE}/business/join/${token}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error || 'Join failed';
    if (msg.includes('expired')) return { kind: 'expired' };
    if (msg.includes('revoked')) return { kind: 'revoked' };
    if (msg.includes('already used')) return { kind: 'already_used' };
    if (msg.includes('different business')) return { kind: 'different_business' };
    if (msg.includes('not found')) return { kind: 'not_found' };
    return { kind: 'error', message: msg };
  }
  if (data.requires_auth) return { kind: 'requires_auth', businessName: data.business_name, role: data.role };
  if (data.joined) return { kind: 'joined', businessName: data.business_name, role: data.role };
  if (data.already_member) return { kind: 'already_member', businessName: data.business_name, role: data.role };
  return { kind: 'error', message: 'Unexpected response' };
}

export default function JoinPage() {
  const lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('am') ? 'am' : 'en';
  const tx = t[lang];

  const [status, setStatus] = useState('checking'); // checking | login | joined | error
  const [businessName, setBusinessName] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState(null);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('phone'); // phone | otp
  const [loading, setLoading] = useState(false);

  // On mount: try join without auth
  useEffect(() => {
    if (!JOIN_TOKEN) {
      setStatus('error');
      setError(tx.notFound);
      return;
    }
    (async () => {
      const result = await tryJoin(JOIN_TOKEN);
      handleJoinResult(result);
    })();
  }, []);

  function handleJoinResult(result) {
    switch (result.kind) {
      case 'joined':
      case 'already_member':
        setStatus('joined');
        setBusinessName(result.businessName || '');
        triggerSyncAndRedirect();
        break;
      case 'requires_auth':
        setStatus('login');
        setBusinessName(result.businessName || '');
        setRole(result.role || '');
        break;
      case 'expired':
        setStatus('error');
        setError(tx.expired);
        break;
      case 'revoked':
        setStatus('error');
        setError(tx.revoked);
        break;
      case 'already_used':
        setStatus('error');
        setError(tx.alreadyUsed);
        break;
      case 'different_business':
        setStatus('error');
        setError(tx.differentBusiness);
        break;
      case 'not_found':
        setStatus('error');
        setError(tx.notFound);
        break;
      default:
        setStatus('error');
        setError(result.message || tx.genericError);
    }
  }

  async function triggerSyncAndRedirect() {
    try {
      await forceFullSync();
    } catch (e) {
      if (import.meta.env.DEV) console.error('[join] full sync failed:', e);
    }
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  }

  async function handleRequestOtp() {
    if (!isValidLocalPhone(phone)) {
      setError(tx.invalidPhone);
      return;
    }
    const formatted = `+251${phone}`;
    setError(null);
    setLoading(true);
    try {
      await requestOtp(formatted);
      setStep('otp');
      fireToast(tx.otpSent, 3000);
    } catch (err) {
      setError(err.message || tx.genericError);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    const formatted = `+251${phone}`;
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await verifyOtp(formatted, otp);
      await setAuthToken(token);
      const deviceId = await getOrCreateCloudProofDeviceId();
      try { await linkDevice(token, deviceId); } catch (e) { /* non-critical */ }
      fireToast(tx.joined, 2000);
      // Now call join again with auth
      const result = await tryJoin(JOIN_TOKEN, token);
      handleJoinResult(result);
    } catch (err) {
      setError(err.message || tx.genericError);
    } finally {
      setLoading(false);
    }
  }

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAF8F5' }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-green-700 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">...</p>
        </div>
      </div>
    );
  }

  if (status === 'joined') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#FAF8F5' }}>
        <div className="bg-white rounded-3xl p-8 w-full max-w-sm text-center shadow-lg">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: '#ecfdf5' }}>
            <Check className="w-8 h-8 text-green-700" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">{tx.joined}</h2>
          <p className="text-sm text-gray-500">{tx.redirecting}</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#FAF8F5' }}>
        <div className="bg-white rounded-3xl p-8 w-full max-w-sm text-center shadow-lg">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: '#fef2f2' }}>
            <AlertCircle className="w-8 h-8 text-red-700" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {lang === 'am' ? 'ይቅርታ' : 'Sorry'}
          </h2>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <a href="/" className="inline-block px-6 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: '#1B4332' }}>
            {lang === 'am' ? 'ወደ ጌባያ ይሂዱ' : 'Go to Gebya'}
          </a>
        </div>
      </div>
    );
  }

  // status === 'login'
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#FAF8F5' }}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-lg">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: '#f0fdf4' }}>
            <Building2 className="w-6 h-6 text-green-700" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">{tx.joinTitle(businessName)}</h2>
          <p className="text-sm text-gray-500 mt-1">{tx.joinSubtitle}</p>
          {role && (
            <span className="inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full" style={{ background: '#fef3c7', color: '#92400e' }}>
              {role === 'cashier' ? (lang === 'am' ? 'ካሸር' : 'Cashier') : (lang === 'am' ? 'ተመልካች' : 'Viewer')}
            </span>
          )}
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
              <label className="block text-xs font-bold text-gray-500 mb-1.5">{tx.phoneLabel}</label>
              <div className="flex gap-0">
                <div className="flex items-center justify-center px-3 py-3 rounded-l-xl border-2 border-r-0 text-sm font-bold" style={{ background: '#f5f0e8', borderColor: '#e8e2d8', color: '#1B4332', minWidth: '64px' }}>
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
                  placeholder={tx.phonePlaceholder}
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
              style={{ background: loading ? '#e5e7eb' : '#1B4332', color: loading ? '#9ca3af' : '#fff' }}
            >
              {loading ? '...' : <><ArrowRight className="w-4 h-4" /> {tx.continue}</>}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">{tx.otpLabel}</label>
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={tx.otpPlaceholder}
                maxLength={6}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm font-bold tracking-widest text-center focus:outline-none"
                style={{ borderColor: '#e8e2d8' }}
                autoFocus
              />
            </div>
            <button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all min-h-[48px]"
              style={{ background: loading ? '#e5e7eb' : '#1B4332', color: loading ? '#9ca3af' : '#fff' }}
            >
              {loading ? '...' : <><Check className="w-4 h-4" /> {tx.verify}</>}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setStep('phone')}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold min-h-[40px]"
                style={{ background: '#f5f5f5', color: '#374151' }}
              >
                {tx.back}
              </button>
              <button
                onClick={handleRequestOtp}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold min-h-[40px]"
                style={{ background: '#FAF8F5', color: '#1B4332', border: '1px solid #e8e2d8' }}
              >
                {tx.resend}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
