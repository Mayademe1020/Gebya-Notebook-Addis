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
import { Save, X, Camera, Image as ImageIcon, Trash2, CheckCircle2 } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { compressPhoto, photoSizeBytes } from '../utils/photoCapture';

function SupplierForm({ existing = null, onSave, onDone }) {
  const { t, lang } = useLang();
  const editing = !!existing?.id;
  const [displayName, setDisplayName] = useState(existing?.display_name || '');
  const [phoneNumber, setPhoneNumber] = useState(existing?.phone_number || '');
  const [note, setNote] = useState(existing?.note || '');
  const [photo, setPhoto] = useState(existing?.photo || null);
  const [photoError, setPhotoError] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = displayName.trim().length > 0 && !saving;
  const initials = (displayName.trim() || existing?.display_name || '?')
    .split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoLoading(true);
    try {
      const dataUrl = await compressPhoto(file);
      setPhoto(dataUrl);
    } catch (err) {
      setPhotoError(err.message || 'Photo capture failed');
    } finally {
      setPhotoLoading(false);
      e.target.value = ''; // allow re-selecting the same file
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = await onSave?.({
        display_name: displayName.trim(),
        phone_number: phoneNumber.trim() || null,
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
                  ? (lang === 'am' ? 'አቅራቢ አስተካክል' : 'Edit supplier')
                  : (lang === 'am' ? 'አቅራቢ አክል' : 'Add supplier')}
              </h2>
              <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
                {lang === 'am' ? 'የምትገዙበት ሰው' : 'Someone you buy from on credit'}
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
                border: photo ? '3px solid #dc2626' : '3px dashed #c9bfa8',
                background: photo ? '#fff' : '#fef2f2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              {photo ? (
                <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : displayName.trim() ? (
                <span style={{
                  fontSize: '2rem', fontWeight: 800, color: '#991b1b',
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
                  background: '#dc2626', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid #fff',
                }}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            {!photo && (
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: 8 }}>
                {lang === 'am' ? 'ፎቶ ይውሰዱ (አማራጭ)' : 'Take a photo (optional)'}
              </p>
            )}

            {photo ? (
              <div className="space-y-2 w-full">
                <p style={{ fontSize: '0.7rem', color: '#047857', fontWeight: 600, textAlign: 'center' }}>
                  ✓ {lang === 'am'
                    ? `ፎቶ ተጨምሯል · ~${photoKb} KB · በዚህ ስልክ ብቻ`
                    : `Photo added · ~${photoKb} KB · on this phone only`}
                </p>
                <div className="flex gap-2">
                  <label
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 border-2 rounded-xl font-bold text-xs cursor-pointer press-scale"
                    style={{ borderColor: '#e8e2d8', color: '#4b5563', background: '#fff' }}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {lang === 'am' ? 'መልሰው ይውሰዱ' : 'Replace'}
                    <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" disabled={photoLoading} />
                  </label>
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 border-2 rounded-xl font-bold text-xs press-scale"
                    style={{ borderColor: '#fecaca', color: '#dc2626', background: '#fff' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {lang === 'am' ? 'አስወግድ' : 'Remove'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 w-full">
                <label
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 border-2 rounded-xl font-bold text-sm cursor-pointer press-scale"
                  style={{ borderColor: '#dc2626', color: '#dc2626', background: '#fff' }}
                >
                  <Camera className="w-4 h-4" />
                  {lang === 'am' ? 'ካሜራ' : 'Camera'}
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" disabled={photoLoading} />
                </label>
                <label
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 border-2 rounded-xl font-bold text-sm cursor-pointer press-scale"
                  style={{ borderColor: '#e8e2d8', color: '#4b5563', background: '#fff' }}
                >
                  <ImageIcon className="w-4 h-4" />
                  {lang === 'am' ? 'ጋለሪ' : 'Gallery'}
                  <input type="file" accept="image/*" onChange={handlePhotoCapture} className="hidden" disabled={photoLoading} />
                </label>
              </div>
            )}
            {photoError && (
              <p style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: 6 }}>
                {photoError}
              </p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              {lang === 'am' ? 'የአቅራቢ ስም' : 'Supplier name'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={lang === 'am' ? 'ለምሳሌ ቡና ቤት ኪሮስ' : 'e.g. Kiros Coffee Wholesale'}
              autoFocus={!editing}
              className="w-full p-4 border-2 focus:outline-none text-base min-h-[52px]"
              style={{ borderRadius: 'var(--radius-md)', borderColor: displayName.trim() ? '#dc2626' : '#e8e2d8' }}
            />
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2 text-sm">
              {lang === 'am' ? 'ስልክ (አማራጭ)' : 'Phone (optional)'}
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder={lang === 'am' ? '0911...' : '0911...'}
              className="w-full p-3 border-2 focus:outline-none text-sm"
              style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
            />
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2 text-sm">
              {lang === 'am' ? 'ማስታወሻ (አማራጭ)' : 'Note (optional)'}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={lang === 'am' ? 'ለምሳሌ ጥቅል ቡና አከፋፋይ' : 'e.g. wholesale coffee distributor'}
              rows={2}
              className="w-full p-3 border-2 focus:outline-none text-sm resize-none"
              style={{ borderRadius: 'var(--radius-md)', borderColor: '#e8e2d8' }}
            />
          </div>

          <p className="text-[10px] text-center font-medium pt-1" style={{ color: '#9ca3af' }}>
            🔒 {lang === 'am' ? 'መረጃው በዚህ ስልክ ላይ ብቻ ይቀመጣል' : 'Stored on this phone only'}
          </p>
        </div>

        <div className="px-6 pb-8 pt-2">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full p-4 font-black text-white text-base flex items-center justify-center gap-2 min-h-[56px] press-scale"
            style={{
              background: canSave ? '#dc2626' : '#e5e7eb',
              color: canSave ? '#fff' : '#9ca3af',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Save className="w-5 h-5" />
            {saving
              ? (lang === 'am' ? 'እያስቀመጥኩ…' : 'Saving…')
              : editing
                ? (lang === 'am' ? 'አስተካክል' : 'Save changes')
                : (lang === 'am' ? 'አስቀምጥ' : 'Save supplier')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SupplierForm;
