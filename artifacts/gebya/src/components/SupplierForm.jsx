// SupplierForm.jsx — Cockpit Synthesis v0.3 · adds photo capture (Commit D)
//
// Mirror of CustomerForm but stripped down — suppliers don't need Telegram
// link state because they're typically wholesalers, not customers we chase.
// Compressed photo via photoCapture.js (~80KB JPEG), stored as base64 on
// the suppliers row.
//
// Edit mode: pass `existing={supplier}` to pre-fill name, phone, note, photo.
// On save, parent passes payload.id back through handleSaveSupplier's edit branch.

import { useState } from 'react';
import { Save, X, Camera, Trash2, CheckCircle2 } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { photoSizeBytes } from '../utils/photoCapture';
import CameraCapture from './CameraCapture';
import {
  extractSubscriberDigits,
  isValidSubscriber,
  normalizeEthiopianPhone,
} from '../utils/phoneNumber';
import { label } from '../labels/index.js';

function SupplierForm({ existing = null, onSave, onDone }) {
  const { t, lang } = useLang();
  const editing = !!existing?.id;
  const [displayName, setDisplayName] = useState(existing?.display_name || '');
  // Phone: store 9-digit subscriber portion. The +251 prefix is rendered as
  // a static block, and on save we normalize to E.164 ("+251911234567").
  const [phoneDigits, setPhoneDigits] = useState(
    existing?.phone_number ? extractSubscriberDigits(existing.phone_number) : ''
  );
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [note, setNote] = useState(existing?.note || '');
  const [photo, setPhoto] = useState(existing?.photo || null);
  const [photoError, setPhotoError] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false); // B2: rear-camera capture modal
  const [saving, setSaving] = useState(false);

  const phoneValid = !phoneDigits || isValidSubscriber(phoneDigits);
  const canSave = displayName.trim().length > 0 && phoneValid && !saving;

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    setPhoneDigits(raw.slice(0, 9));
  };
  const initials = (displayName.trim() || existing?.display_name || '?')
    .split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const normalizedPhone = phoneDigits ? normalizeEthiopianPhone(phoneDigits) : null;
      const saved = await onSave?.({
        display_name: displayName.trim(),
        phone_number: normalizedPhone,
        note: note.trim() || null,
        photo: photo || null,
      });
      if (saved && saved.id != null) onDone?.(saved);
    } finally {
      setSaving(false);
    }
  };

  const photoBytes = photo ? photoSizeBytes(photo) : 0;
  const photoKb = photoBytes ? Math.round(photoBytes / 1024) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
      <div
        className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto animate-slide-up"
        style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}
      >
        <div
          className="sticky top-0 bg-white z-10 px-6 pt-5 pb-4 border-b"
          style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', borderColor: 'var(--color-border-light)' }}
        >
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-black text-gray-900">
                {editing
                  ? (label('suppliers.edit-supplier-2', lang))
                  : (label('suppliers.add-supplier', lang))}
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {label('suppliers.someone-you-buy-from-on-credit', lang)}
              </p>
            </div>
            <button
              onClick={onDone}
              aria-label={t.close}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center press-scale"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">

          {/* ─── PHOTO BLOCK (Commit D) ───────────────────────────────────────
              100px circular preview with dashed border when empty, solid red
              border when set (suppliers = red side of the ledger). Two action
              buttons: rear-camera capture + gallery picker. */}
          <div className="flex flex-col items-center">
            <div
              style={{
                width: 100, height: 100, borderRadius: '50%',
                overflow: 'hidden', position: 'relative',
                border: photo ? '3px solid var(--color-danger)' : '3px dashed var(--color-border)',
                background: photo ? 'var(--color-bg-white)' : 'var(--color-danger-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              {photo ? (
                <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : displayName.trim() ? (
                <span style={{
                  fontSize: '2rem', fontWeight: 800, color: 'var(--color-danger-text)',
                  fontFamily: 'Manrope, system-ui, sans-serif',
                }}>{initials}</span>
              ) : (
                <span style={{ fontSize: '2.4rem', opacity: 0.4 }}>🏪</span>
              )}
              {/* Floating "set" badge when photo is present */}
              {photo && (
                <div style={{
                  position: 'absolute', bottom: 3, right: 3,
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'var(--color-danger)', color: 'var(--color-bg-white)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid #fff',
                }}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            {!photo && (
              <p style={{ fontSize: '0.7rem', color: 'var(--color-text-soft)', marginBottom: 8 }}>
                {label('suppliers.take-a-photo-optional', lang)}
              </p>
            )}

            {photo ? (
              <div className="space-y-2 w-full">
                <p style={{ fontSize: '0.7rem', color: 'var(--color-success-text)', fontWeight: 600, textAlign: 'center' }}>
                  ✓ {label('suppliers.photo-added-kb-on-this-phone-only', lang, photoKb)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCamera(true)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 border-2 rounded-xl font-bold text-xs cursor-pointer press-scale"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)', background: 'var(--color-surface)' }}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {label('suppliers.replace', lang)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 border-2 rounded-xl font-bold text-xs press-scale"
                    style={{ borderColor: 'var(--color-danger-border)', color: 'var(--color-danger)', background: 'var(--color-surface)' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {label('suppliers.remove', lang)}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 border-2 rounded-xl font-bold text-sm cursor-pointer press-scale"
                  style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)', background: 'var(--color-surface)' }}
                >
                  <Camera className="w-4 h-4" />
                  {label('suppliers.add-photo-2', lang)}
                </button>
              </div>
            )}
            {photoError && (
              <p style={{ fontSize: '0.7rem', color: 'var(--color-danger)', marginTop: 6 }}>
                {photoError}
              </p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              {label('suppliers.supplier-name', lang)} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={label('suppliers.e-g-kiros-coffee-wholesale', lang)}
              autoFocus={!editing}
              className="w-full p-4 border-2 focus:outline-none text-base min-h-[52px]"
              style={{ borderRadius: 'var(--radius-md)', borderColor: displayName.trim() ? 'var(--color-danger)' : 'var(--color-border)' }}
            />
          </div>

          {/* Phone — Commit C.3: +251 prefix block + 7/9 validation */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2 text-sm">
              📞 {label('suppliers.phone', lang)}
              <span className="font-normal text-xs ml-1" style={{ color: 'var(--color-text-soft)' }}>
                ({label('suppliers.optional', lang)})
              </span>
            </label>
            <div style={{ display: 'flex', gap: 0 }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 12px',
                  background: 'var(--color-surface-muted)',
                  border: `2px solid ${(phoneTouched && !phoneValid) ? 'var(--color-danger)' : 'var(--color-border)'}`,
                  borderRight: 'none',
                  borderTopLeftRadius: 'var(--radius-md)',
                  borderBottomLeftRadius: 'var(--radius-md)',
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  color: 'var(--color-danger-text)',
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
                placeholder="9XXXXXXXX"
                maxLength={9}
                className="flex-1 p-3 border-2 focus:outline-none text-base"
                style={{
                  borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                  borderColor: (phoneTouched && !phoneValid)
                    ? 'var(--color-danger)'
                    : phoneValid && phoneDigits
                      ? 'var(--color-danger)'
                      : 'var(--color-border)',
                  minHeight: 48,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.04em',
                }}
              />
            </div>
            {phoneTouched && !phoneValid && phoneDigits.length > 0 && (
              <p className="text-xs font-medium mt-1" style={{ color: 'var(--color-danger)' }}>
                {label('suppliers.phone-must-start-with-9-or-7-9-digits-total', lang)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2 text-sm">
              {label('suppliers.note-optional', lang)}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={label('suppliers.e-g-wholesale-coffee-distributor', lang)}
              rows={2}
              className="w-full p-3 border-2 focus:outline-none text-sm resize-none"
              style={{ borderRadius: 'var(--radius-md)', borderColor: 'var(--color-border)' }}
            />
          </div>

          <p className="text-[10px] text-center font-medium pt-1" style={{ color: 'var(--color-text-soft)' }}>
            🔒 {label('suppliers.stored-on-this-phone-only', lang)}
          </p>
        </div>

        <div className="px-6 pb-8 pt-2">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full p-4 font-black text-white text-base flex items-center justify-center gap-2 min-h-[56px] press-scale"
            style={{
              background: canSave ? 'var(--color-danger)' : 'var(--color-bg-disabled)',
              color: canSave ? 'var(--color-bg-white)' : 'var(--color-text-soft)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Save className="w-5 h-5" />
            {saving
              ? (label('suppliers.saving', lang))
              : editing
                ? (label('suppliers.save-changes', lang))
                : (label('suppliers.save-supplier', lang))}
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

export default SupplierForm;
