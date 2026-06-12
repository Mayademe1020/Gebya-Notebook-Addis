import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QrCode, Copy, Check, ChevronRight, AlertCircle, Users } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { identityApi } from '../api/identity';
import { setIdentity } from '../db';
import db from '../db';

const BANK_COPY = 'Gebya is a notebook, not a bank. Gebya does not connect to your bank. Gebya cannot withdraw money. Never enter PIN, OTP, or password. Payment method is only a label like Cash, CBE, Telebirr, or Bank Transfer. Staff phone number is for identity/contact only, not bank/payment.';

// Steps
const STEP_CODE = 0;
const STEP_NAME = 1;
const STEP_CONFIRM = 2;
const STEP_PENDING = 3;
const STEP_ERROR = 4;

function BankTrustCopy({ className = '' }) {
  return (
    <div className={`bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 ${className}`}>
      <p className="text-xs font-medium text-green-800 leading-relaxed">{BANK_COPY}</p>
    </div>
  );
}

function formatJoinCode(raw) {
  // Strip everything except alphanumeric
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function formatDisplay(code) {
  // Format as XXXX-XXXX
  const cleaned = formatJoinCode(code);
  if (cleaned.length < 4) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
}

export default function StaffJoinScreen({ onJoined, onBack }) {
  const { t } = useLang();
  const [searchParams] = useSearchParams();

  // Pre-fill code from invite link (?code=XXXX-XXXX or ?invite=XXXX-XXXX)
  const prefillCode = searchParams.get('code') || searchParams.get('invite') || '';

  const [step, setStep] = useState(prefillCode ? STEP_NAME : STEP_CODE);
  const [joinCode, setJoinCode] = useState(prefillCode);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneRequired, setPhoneRequired] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [joinResult, setJoinResult] = useState(null); // stored after join for pending state

  // On step 2 (confirm), look up shop info
  const [shopInfoLoading, setShopInfoLoading] = useState(false);

  function handleCodeChange(e) {
    // Auto-format: strip non-alphanumeric, uppercase, insert dash every 4
    const raw = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (raw.length <= 8) {
      setJoinCode(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw);
    }
  }

  async function handleCodeSubmit() {
    if (joinCode.replace(/[^A-Za-z0-9]/g, '').length < 4) {
      setError(t.staffJoinCodeTooShort || 'Enter a valid shop code (at least 4 characters)');
      return;
    }
    setError(null);
    // Try to look up the shop by joining — the backend returns shop_name + settings
    setLoading(true);
    try {
      // Use join with a placeholder name; backend will fail if code invalid
      const result = await identityApi.joinShop({
        join_code: formatJoinCode(joinCode),
        display_name: '__CHECK__',  // sentinel — backend validates code only
        device_label: navigator.userAgent,
      });
      // If we get here, code was valid
      setShopName(result.shop_name || 'this shop');
      setPhoneRequired(result.phone_required ?? false);
      setApprovalRequired(result.approval_required ?? false);
      setStep(STEP_NAME);
    } catch (err) {
      if (err.status === 404) {
        setError(t.staffJoinCodeInvalid || 'Shop code not found. Check with your owner and try again.');
      } else if (err.status === 409) {
        // Device already joined — this device already has an identity
        setError(t.staffJoinAlreadyJoined || 'This device is already connected to a shop. Leave the current shop first from Settings.');
      } else {
        setError(err.data?.error || err.message || t.staffJoinNetworkError || 'Could not reach the server. Check your connection.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleNameSubmit() {
    const name = displayName.trim();
    if (!name || name.length < 2) {
      setError(t.staffNameTooShort || 'Display name must be at least 2 characters');
      return;
    }
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    if (phoneRequired && (!phoneDigits || phoneDigits.length < 9)) {
      setError(t.staffPhoneRequired || 'Phone number is required by this shop');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await identityApi.joinShop({
        join_code: formatJoinCode(joinCode),
        display_name: name,
        phone: phoneRequired ? phoneDigits : undefined,
        device_label: navigator.userAgent,
      });

      if (result.device_status === 'pending') {
        // Approval required — show pending screen
        setShopName(result.shop_name || shopName);
        setJoinResult(result);
        setStep(STEP_PENDING);
        setLoading(false);
        return;
      }

      // Active immediately
      await persistIdentity(result);
      setJoinResult(result);
      if (onJoined) onJoined(result);
    } catch (err) {
      if (err.status === 404) {
        setError(t.staffJoinCodeInvalid || 'Shop code not found.');
      } else if (err.status === 409) {
        setError(t.staffJoinAlreadyJoined || 'This device is already connected to a shop. Leave the current shop first.');
      } else {
        setError(err.data?.error || err.message || t.staffJoinNetworkError || 'Could not reach the server.');
      }
      setStep(STEP_NAME);
    } finally {
      setLoading(false);
    }
  }

  async function persistIdentity(result) {
    await setIdentity({
      shop_id: result.shop_id,
      shop_name: result.shop_name || shopName,
      device_id: result.device_id,
      device_token: result.device_token,
      staff_id: result.staff_id,
      display_name: result.display_name,
      phone_number: result.phone_number || phone,
      role: result.role,
      permissions: result.permissions || {},
      device_status: result.device_status,
      phone_required: result.phone_required ?? phoneRequired,
      approval_required: result.approval_required ?? approvalRequired,
    });
  }

  async function handleConfirmJoin() {
    setLoading(true);
    setError(null);
    try {
      const result = await identityApi.joinShop({
        join_code: formatJoinCode(joinCode),
        display_name: displayName.trim(),
        phone: phoneRequired ? phone.replace(/[^0-9]/g, '') : undefined,
        device_label: navigator.userAgent,
      });
      if (result.device_status === 'pending') {
        setJoinResult(result);
        setStep(STEP_PENDING);
      } else {
        await persistIdentity(result);
        if (onJoined) onJoined(result);
      }
    } catch (err) {
      setError(err.data?.error || err.message || t.staffJoinNetworkError || 'Could not join. Try again.');
      setStep(STEP_CONFIRM);
    } finally {
      setLoading(false);
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(formatJoinCode(joinCode)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Role display label
  const roleLabel = joinResult?.role === 'owner' ? t.roleOwner || 'Owner' :
                    joinResult?.role === 'manager' ? t.roleManager || 'Manager' :
                    joinResult?.role === 'trusted_staff' ? t.roleTrustedStaff || 'Trusted Staff' :
                    t.roleBasicStaff || 'Staff';

  const permLabels = {
    can_create_sale: t.permCanCreateSale || 'Record sales',
    can_create_customer_credit: t.permCanCreateCustomerCredit || 'Record Dubie/credit',
    can_create_customer_payment: t.permCanCreateCustomerPayment || 'Record customer payments',
    can_create_expense: t.permCanCreateExpense || 'Record expenses',
    can_create_note: t.permCanCreateNote || 'Add quick notes',
    can_create_supplier_transaction: t.permCanCreateSupplierTransaction || 'Record supplier transactions',
  };

  const allowedActions = joinResult?.permissions
    ? Object.entries(joinResult.permissions)
        .filter(([, v]) => v === true)
        .map(([k]) => permLabels[k] || k)
    : [t.permCanCreateSale || 'Record sales'];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Header */}
      <div
        className="px-5 pt-8 pb-6"
        style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          {onBack && (
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white/20 text-white press-scale"
              aria-label="Back"
            >
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-black text-white font-serif">
              {t.staffJoinTitle || 'Join a Shop'}
            </h1>
            <p className="text-sm font-semibold mt-0.5" style={{ color: 'rgba(255,255,255,0.72)' }}>
              {t.staffJoinSubtitle || 'Enter the shop code you received from the owner'}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 py-6">

        {/* STEP 0: Enter shop code */}
        {step === STEP_CODE && (
          <div className="space-y-5 animate-slide-up">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                {t.staffJoinCodeLabel || 'Shop Code'}
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={handleCodeChange}
                placeholder={t.staffJoinCodePlaceholder || 'e.g. AB12-CD34'}
                className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 text-lg font-mono font-black tracking-wider text-center focus:border-green-500 focus:outline-none transition-colors"
                maxLength={9}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <p className="text-xs text-gray-400 mt-2 text-center font-medium">
                {t.staffJoinCodeHint || 'Ask your owner for the 8-character shop code'}
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-red-700">{error}</p>
              </div>
            )}

            <button
              onClick={handleCodeSubmit}
              disabled={loading || joinCode.replace(/[^A-Za-z0-9]/g, '').length < 4}
              className="w-full py-4 rounded-xl font-bold text-base text-white disabled:opacity-40 disabled:cursor-not-allowed press-scale"
              style={{ background: 'var(--color-primary)' }}
            >
              {loading ? (t.staffJoinChecking || 'Checking…') : (t.staffJoinContinue || 'Continue')}
            </button>
          </div>
        )}

        {/* STEP 1: Enter name + phone */}
        {step === STEP_NAME && (
          <div className="space-y-5 animate-slide-up">
            {/* Shop name confirmation */}
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-green-200 text-green-800 font-black text-sm flex-shrink-0">
                {shopName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-semibold text-green-700">{t.staffJoiningShop || 'Joining shop'}</p>
                <p className="text-base font-black text-green-900">{shopName}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                {t.staffJoinDisplayNameLabel || 'Your Display Name'} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setError(null); }}
                placeholder={t.staffJoinDisplayNamePlaceholder || 'e.g. Almaz'}
                className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 text-base font-semibold focus:border-green-500 focus:outline-none transition-colors"
                maxLength={40}
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            {phoneRequired && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  {t.staffJoinPhoneLabel || 'Phone Number'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setError(null); }}
                  placeholder={t.staffJoinPhonePlaceholder || '09xxxxxxxx'}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 text-base font-semibold focus:border-green-500 focus:outline-none transition-colors"
                  inputMode="numeric"
                  maxLength={15}
                />
                <p className="text-xs text-gray-400 mt-1.5 font-medium">
                  {t.staffJoinPhoneNote || 'Required by this shop · Used for contact only, never for payment'}
                </p>
              </div>
            )}

            {!phoneRequired && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  {t.staffJoinPhoneLabelOptional || 'Phone Number'} <span className="text-gray-400 font-normal text-xs">({t.staffJoinPhoneOptional || 'optional'})</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t.staffJoinPhonePlaceholder || '09xxxxxxxx'}
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 text-base font-semibold focus:border-green-500 focus:outline-none transition-colors"
                  inputMode="numeric"
                  maxLength={15}
                />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-red-700">{error}</p>
              </div>
            )}

            <button
              onClick={handleNameSubmit}
              disabled={loading || displayName.trim().length < 2}
              className="w-full py-4 rounded-xl font-bold text-base text-white disabled:opacity-40 disabled:cursor-not-allowed press-scale"
              style={{ background: 'var(--color-primary)' }}
            >
              {loading ? (t.staffJoinJoining || 'Joining…') : (t.staffJoinJoinBtn || 'Join Shop')}
            </button>

            <button
              onClick={() => { setStep(STEP_CODE); setError(null); }}
              className="w-full py-3 text-sm font-semibold text-gray-500"
            >
              {t.staffJoinChangeCode || 'Change shop code'}
            </button>
          </div>
        )}

        {/* STEP 2: Confirm — show role, permissions, bank copy */}
        {step === STEP_CONFIRM && (
          <div className="space-y-5 animate-slide-up">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-4 text-center">
              <div className="w-14 h-14 rounded-full bg-green-200 mx-auto flex items-center justify-center mb-3">
                <Users className="w-7 h-7 text-green-700" />
              </div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">
                {t.staffJoinYouAreJoining || 'You are joining'}
              </p>
              <p className="text-xl font-black text-green-900">{shopName}</p>
              <div className="mt-3 inline-flex items-center gap-1.5 bg-green-200 rounded-full px-3 py-1">
                <span className="text-xs font-black text-green-800 uppercase tracking-wider">
                  {roleLabel}
                </span>
              </div>
            </div>

            {/* Allowed actions */}
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3">
                {t.staffJoinAllowedActions || 'What you can do'}
              </p>
              <ul className="space-y-2">
                {allowedActions.map((action) => (
                  <li key={action} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    {action}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 mt-3 font-medium">
                {t.staffJoinOwnerControls || 'Owner can change these permissions at any time'}
              </p>
            </div>

            <BankTrustCopy />

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-red-700">{error}</p>
              </div>
            )}

            <button
              onClick={handleConfirmJoin}
              disabled={loading}
              className="w-full py-4 rounded-xl font-bold text-base text-white disabled:opacity-40 disabled:cursor-not-allowed press-scale"
              style={{ background: 'var(--color-primary)' }}
            >
              {loading ? (t.staffJoinJoining || 'Joining…') : (t.staffJoinConfirmBtn || 'Confirm & Join')}
            </button>

            <button
              onClick={() => { setStep(STEP_NAME); setError(null); }}
              className="w-full py-3 text-sm font-semibold text-gray-500"
            >
              {t.staffJoinGoBack || 'Go back'}
            </button>
          </div>
        )}

        {/* STEP 3: Pending approval */}
        {step === STEP_PENDING && (
          <div className="space-y-5 animate-slide-up">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-6 text-center">
              <div className="w-14 h-14 rounded-full bg-amber-200 mx-auto flex items-center justify-center mb-3">
                <Users className="w-7 h-7 text-amber-700" />
              </div>
              <p className="text-base font-black text-amber-900 mb-1">
                {t.staffJoinPendingTitle || 'Request Sent'}
              </p>
              <p className="text-sm font-medium text-amber-700">
                {t.staffJoinPendingDesc || 'Your request to join has been sent to the shop owner. You will be able to start recording once approved.'}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                {t.staffJoinShopDetails || 'Shop Details'}
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-600">{t.staffJoinShopName || 'Shop'}</span>
                  <span className="text-gray-900">{joinResult?.shop_name || shopName}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-600">{t.staffJoinYourName || 'Your Name'}</span>
                  <span className="text-gray-900">{displayName}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-600">{t.staffJoinRole || 'Role'}</span>
                  <span className="text-gray-900">{roleLabel}</span>
                </div>
              </div>
            </div>

            <BankTrustCopy />

            <button
              onClick={onBack}
              className="w-full py-4 rounded-xl font-bold text-base text-white press-scale"
              style={{ background: 'var(--color-primary)' }}
            >
              {t.staffJoinOK || 'OK'}
            </button>
          </div>
        )}

        {/* STEP 4: Error */}
        {step === STEP_ERROR && (
          <div className="space-y-5 animate-slide-up">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-6 text-center">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <p className="text-base font-black text-red-900 mb-1">{t.staffJoinError || 'Something went wrong'}</p>
              <p className="text-sm font-medium text-red-700">{error}</p>
            </div>
            <button
              onClick={() => { setStep(STEP_CODE); setError(null); }}
              className="w-full py-4 rounded-xl font-bold text-base text-white press-scale"
              style={{ background: 'var(--color-primary)' }}
            >
              {t.staffJoinTryAgain || 'Try Again'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
