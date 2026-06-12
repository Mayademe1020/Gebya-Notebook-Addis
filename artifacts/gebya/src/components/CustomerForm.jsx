// CustomerForm.jsx — Cockpit Synthesis v0.3 · flat layout (Commit C.3)
//
// Commit C.3 changes:
//   - Removed the "More (optional)" collapsible — all fields visible at once.
//   - Phone moved up to the second slot (after name) with a +251 prefix
//     block and tool-level validation via utils/phoneNumber.js.
//   - Photo block compacted (80px circle instead of 100px, tighter spacing)
//     so the whole form fits on a 320px viewport without aggressive scroll.
//   - Tigist's first add: phone → save → 4 taps total.
//
// Photo: optional, circle at top (camera + gallery buttons), reuses
// photoCapture.js (~80KB JPEG). Initials fallback when no photo.
// The photo gets stored on the customers row as a base64 data URL.

import { useState } from 'react';
import { Camera, CheckCircle2, Save, X } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { normalizeTelegram } from '../utils/customerTelegram';
import { compressPhoto, photoSizeBytes } from '../utils/photoCapture';
import CameraCapture from './CameraCapture';
import {
  extractSubscriberDigits,
  isValidSubscriber,
  normalizeEthiopianPhone,
} from '../utils/phoneNumber';

function initialsOf(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function CustomerForm({ onSave, onDone, existing }) {
  const { t, lang } = useLang();
  const isEditing = !!existing;
  const [displayName, setDisplayName] = useState(existing?.display_name || '');
  const [note, setNote] = useState(existing?.note || '');
  // Phone state: store the 9-digit subscriber portion only (no +251, no leading 0).
  // The +251 block is rendered as a sibling element. On save we normalize to
  // E.164 ("+251911234567") so downstream tel: links and storage are uniform.
  const [phoneDigits, setPhoneDigits] = useState(
    existing?.phone_number ? extractSubscriberDigits(existing.phone_number) : ''
  );
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState(existing?.telegram_username || '');
  const [photo, setPhoto] = useState(existing?.photo || null);
  const [photoError, setPhotoError] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false); // B2: rear-camera capture modal
  const [saving, setSaving] = useState(false);

  const phoneValid = !phoneDigits || isValidSubscriber(phoneDigits);
  const normalizedTelegram = normalizeTelegram(telegramUsername);
  const telegramValid = !telegramUsername.trim() || !!normalizedTelegram;
  const canSave = displayName.trim().length > 0 && phoneValid && telegramValid;

  const handlePhoneChange = (e) => {
    // Accept only digits, max 9 characters. Validation kicks in once 9 reached.
    const raw = e.target.value.replace(/\D/g, '');
    setPhoneDigits(raw.slice(0, 9));
  };

  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    setPhotoError(null);
    try {
      const dataUrl = await compressPhoto(file);
      setPhoto(dataUrl);
    } catch (err) {
      setPhotoError(err.message || 'Photo capture failed');
    } finally {
      setPhotoLoading(false);
    }
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      // Normalize phone to E.164 ("+251911234567") before saving — single
      // canonical shape in the database. Pass null if empty.
      const normalizedPhone = phoneDigits ? normalizeEthiopianPhone(phoneDigits) : null;
      const didSave = await onSave?.({
        ...(isEditing ? { id: existing.id } : {}),
        display_name: displayName.trim(),
        note: note.trim() || null,
        phone_number: normalizedPhone,
        telegram_username: normalizedTelegram || null,
        telegram_notify_enabled: existing?.telegram_notify_enabled ?? false,
        photo: photo || null,
      });
      if (didSave) onDone?.(didSave === true ? null : didSave);
    } finally {
      setSaving(false);
    }
  };

  const initials = initialsOf(displayName || existing?.display_name);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
      <div
        className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto animate-slide-up"
        style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}
      >

        {/* Header */}
        <div
          className="sticky top-0 bg-white z-10 px-5 pt-4 pb-3 border-b"
          style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', borderColor: 'var(--color-border-light)' }}
        >
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-black text-gray-900">
                {isEditing
                  ? (lang === 'am' ? 'ደንበኛ አስተካክል' : 'Edit customer')
                  : (lang === 'am' ? 'ደንበኛ አክል' : 'Add customer')}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                {lang === 'am'
                  ? 'ስም ብቻ ግዴታ ነው። ሌላው ሁሉ አማራጭ።'
                  : 'Only name is required. The rest is optional.'}
              </p>
            </div>
            <button
              onClick={onDone}
              aria-label={t.close}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center press-scale"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Compact photo block (80px) */}
        <div
          className="px-5 py-3 border-b flex items-center gap-3"
          style={{ borderColor: 'var(--color-border-light)' }}
        >
          <div
            style={{
              width: 64, height: 64, borderRadius: '50%',
              position: 'relative',
              overflow: 'hidden',
              border: photo ? '2px solid #047857' : '2px dashed #c9bfa8',
              background: photo ? '#fff' : '#f5f1ea',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {photo ? (
              <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#b8842c',
                fontSize: displayName.trim() ? '1.2rem' : '1.5rem',
                fontWeight: 800,
              }}>
                {displayName.trim() ? initials : '👤'}
              </div>
            )}
            {photo && (
              <div style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 22, height: 22, borderRadius: '50%',
                background: '#047857', color: '#fff',
                border: '2px solid #fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CheckCircle2 className="w-3 h-3" />
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {photo ? (
              <>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#047857' }}>
                  ✓ {lang === 'am' ? 'ፎቶ ተጨምሯል' : 'Photo added'}
                  <span style={{ fontWeight: 500, color: '#9ca3af', marginLeft: 6 }}>
                    {Math.round(photoSizeBytes(photo) / 1024)} KB
                  </span>
                </p>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setShowCamera(true)}
                    className="cursor-pointer press-scale"
                    style={{
                      padding: '4px 10px', fontSize: '0.7rem', fontWeight: 700,
                      background: '#fff', border: '1px solid #ece6d6',
                      borderRadius: 6, color: '#1a1a1a',
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                    }}
                  >
                    <Camera className="w-3 h-3" />
                    {lang === 'am' ? 'ቀይር' : 'Replace'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="press-scale"
                    style={{
                      padding: '4px 10px', fontSize: '0.7rem', fontWeight: 700,
                      background: '#fef2f2', border: '1px solid #fecaca',
                      borderRadius: 6, color: '#dc2626',
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      cursor: 'pointer',
                    }}
                  >
                    <X className="w-3 h-3" />
                    {lang === 'am' ? 'አስወግድ' : 'Remove'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1a1a1a' }}>
                  {lang === 'am' ? 'ፎቶ (አማራጭ)' : 'Photo (optional)'}
                </p>
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>
                  {lang === 'am' ? 'በቆጣሪው ላይ ለማወቅ ይረዳዎታል' : 'recognize them faster at the counter'}
                </p>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setShowCamera(true)}
                    className="cursor-pointer press-scale"
                    style={{
                      padding: '5px 10px', fontSize: '0.72rem', fontWeight: 700,
                      background: '#1a1a1a', color: '#fff',
                      borderRadius: 6,
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                    }}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {lang === 'am' ? 'ካሜራ' : 'Camera'}
                  </button>
                  <label className="cursor-pointer press-scale" style={{
                    padding: '5px 10px', fontSize: '0.72rem', fontWeight: 700,
                    background: '#fff', color: '#1a1a1a',
                    border: '1px solid #ece6d6',
                    borderRadius: 6,
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                  }}>
                    🖼 {lang === 'am' ? 'ጋለሪ' : 'Gallery'}
                    <input type="file" accept="image/*" onChange={handlePhotoCapture} className="hidden" disabled={photoLoading} />
                  </label>
                </div>
              </>
            )}
            {photoLoading && (
              <p style={{ fontSize: '0.65rem', color: '#b8842c', marginTop: 2 }}>
                {lang === 'am' ? 'ፎቶ እያዘጋጀ…' : 'Compressing…'}
              </p>
            )}
            {photoError && (
              <p style={{ fontSize: '0.65rem', color: '#dc2626', marginTop: 2 }}>
                {photoError}
              </p>
            )}
          </div>
        </div>

        {/* All fields visible — no collapsible (Commit C.3) */}
        <div className="px-5 py-3 space-y-3">

          {/* Name (required) */}
          <div>
            <label className="block font-semibold mb-1 text-sm" style={{ color: '#374151' }}>
              {lang === 'am' ? 'ስም' : 'Name'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={lang === 'am' ? 'ለምሳሌ ትግስት' : 'e.g. Tigist'}
              autoFocus={!isEditing}
              className="w-full p-3 border-2 focus:outline-none text-base"
              style={{
                borderRadius: 'var(--radius-md)',
                borderColor: displayName.trim() ? '#1B4332' : '#e8e2d8',
                minHeight: 48,
              }}
            />
          </div>

          {/* Phone — Commit C.3: prominent, with +251 prefix, validated */}
          <div>
            <label className="block font-semibold mb-1 text-sm" style={{ color: '#374151' }}>
              📞 {lang === 'am' ? 'ስልክ' : 'Phone'}
              <span className="font-normal text-xs ml-1" style={{ color: '#9ca3af' }}>
                ({lang === 'am' ? 'ለማስታወሻ' : 'for reminders'})
              </span>
            </label>
            <div style={{ display: 'flex', gap: 0 }}>
              {/* +251 prefix block — non-editable, signals Ethiopia */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 12px',
                  background: '#f5f0e8',
                  border: `2px solid ${(phoneTouched && !phoneValid) ? '#dc2626' : '#e8e2d8'}`,
                  borderRight: 'none',
                  borderTopLeftRadius: 'var(--radius-md)',
                  borderBottomLeftRadius: 'var(--radius-md)',
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  color: '#1B4332',
                  minWidth: 64,
                  minHeight: 48,
                }}
              >
                +251
              </div>
              <input
                type="tel"
                inputMode="numeric"
                value={phoneDigits}
                onChange={handlePhoneChange}
                onBlur={() => setPhoneTouched(true)}
                placeholder={lang === 'am' ? '9XXXXXXXX' : '9XXXXXXXX'}
                maxLength={9}
                className="flex-1 p-3 border-2 focus:outline-none text-base"
                style={{
                  borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                  borderColor: (phoneTouched && !phoneValid)
                    ? '#dc2626'
                    : phoneValid && phoneDigits
                      ? '#1B4332'
                      : '#e8e2d8',
                  minHeight: 48,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.04em',
                }}
              />
            </div>
            {phoneTouched && !phoneValid && phoneDigits.length > 0 && (
              <p className="text-xs font-medium mt-1" style={{ color: '#dc2626' }}>
                {lang === 'am'
                  ? 'ስልክ 9 ወይም 7 ይጀምር — 9 አኃዝ መሆን አለበት'
                  : 'Phone must start with 9 or 7 — 9 digits total'}
              </p>
            )}
            {!phoneTouched && phoneDigits.length === 0 && (
              <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                {lang === 'am'
                  ? 'በዘጠኝ ወይም ሰባት የሚጀምር 9 አኃዝ'
                  : '9 digits, starts with 9 or 7'}
              </p>
            )}
          </div>

          {/* Telegram (optional) */}
          <div>
            <label className="block font-semibold mb-1 text-sm" style={{ color: '#374151' }}>
              💬 {lang === 'am' ? 'ቴሌግራም' : 'Telegram'}
              <span className="font-normal text-xs ml-1" style={{ color: '#9ca3af' }}>
                ({lang === 'am' ? 'አማራጭ' : 'optional'})
              </span>
            </label>
            <input
              type="text"
              value={telegramUsername}
              onChange={(e) => setTelegramUsername(e.target.value)}
              placeholder={t.customerTelegramPlaceholder}
              className="w-full p-3 border-2 focus:outline-none text-sm"
              style={{
                borderRadius: 'var(--radius-md)',
                borderColor: telegramValid ? '#e8e2d8' : '#dc2626',
                minHeight: 48,
              }}
            />
            {!telegramValid && (
              <p className="text-xs font-medium mt-1" style={{ color: '#dc2626' }}>
                {t.telegramFormatHint}
              </p>
            )}
          </div>

          {/* Note (optional) */}
          <div>
            <label className="block font-semibold mb-1 text-sm" style={{ color: '#374151' }}>
              {lang === 'am' ? 'ማስታወሻ' : 'Note'}
              <span className="font-normal text-xs ml-1" style={{ color: '#9ca3af' }}>
                ({lang === 'am' ? 'አማራጭ' : 'optional'})
              </span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.customerNotePlaceholder}
              rows={2}
              className="w-full p-3 border-2 focus:outline-none text-sm resize-none"
              style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
            />
          </div>
        </div>

        {/* Save button */}
        <div className="px-5 pb-6 pt-2">
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full p-3 font-black text-white text-base flex items-center justify-center gap-2 min-h-[52px] press-scale"
            style={{
              background: canSave ? '#1B4332' : '#e5e7eb',
              color: canSave ? '#fff' : '#9ca3af',
              borderRadius: 'var(--radius-md)',
              boxShadow: canSave ? '0 3px 0 #0f2b20, var(--shadow-sm)' : 'none',
            }}
          >
            <Save className="w-5 h-5" />
            {saving
              ? t.saving
              : isEditing
                ? (lang === 'am' ? 'አስተካክል' : 'Update')
                : t.saveCustomer}
          </button>
        </div>
      </div>

      {/* B2: rear-camera capture modal */}
      <CameraCapture
        open={showCamera}
        onCapture={(dataUrl) => { setPhoto(dataUrl); setShowCamera(false); }}
        onClose={() => setShowCamera(false)}
        lang={lang}
      />
    </div>
  );
}

export default CustomerForm;
