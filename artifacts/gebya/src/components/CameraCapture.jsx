// CameraCapture.jsx — Standard native camera capture
//
// Uses the standard <input type="file" capture> approach (like most apps):
// opens the device camera (back by default, front via toggle), reads the
// chosen photo, compresses it, and returns a data URL. No getUserMedia,
// no live <video> preview, no <canvas> capture — just the OS camera intent.
//
// Usage:
//   <CameraCapture
//     open={showCamera}
//     onCapture={(dataUrl) => { setPhoto(dataUrl); setShowCamera(false); }}
//     onClose={() => setShowCamera(false)}
//     lang={lang}
//   />

import { useState } from 'react';
import { X, Camera, RotateCw } from 'lucide-react';
import { compressPhoto } from '../utils/photoCapture';

function CameraCapture({ open, onCapture, onClose, lang = 'en' }) {
  const [facing, setFacing] = useState('environment'); // back camera default
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await compressPhoto(file);
      onCapture?.(dataUrl);
      setError(null);
    } catch {
      setError(lang === 'am' ? 'ፎቶ መምጣት አልተቻለም' : 'Could not capture photo');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', color: '#fff' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
          {lang === 'am' ? 'ፎቶ ያንሱ' : 'Take a photo'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={lang === 'am' ? 'ዝጋ' : 'Close'}
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <p style={{ color: '#fff', fontSize: '0.95rem', opacity: 0.8 }}>
          {facing === 'environment' ? (lang === 'am' ? 'ኋላ ካሜራ' : 'Back camera') : (lang === 'am' ? 'ፊት ካሜራ' : 'Front camera')}
        </p>

        {/* Take photo — native camera intent */}
        <label
          className="press-scale"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#fff', color: '#1a1a1a',
            padding: '18px 28px', borderRadius: 14,
            fontSize: '1rem', fontWeight: 800, cursor: 'pointer',
          }}
        >
          <Camera className="w-6 h-6" />
          {lang === 'am' ? 'ፎቶ ያንሱ' : 'Take photo'}
          <input
            type="file"
            accept="image/*"
            capture={facing === 'environment' ? 'environment' : 'user'}
            onChange={handleFile}
            className="hidden"
          />
        </label>

        {/* Flip camera — standard rotate icon */}
        <button
          type="button"
          onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.15)', color: '#fff',
            padding: '12px 20px', borderRadius: 12,
            fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
            border: 'none',
          }}
        >
          <RotateCw className="w-5 h-5" />
          {facing === 'environment'
            ? (lang === 'am' ? 'ወደ ፊት ካሜራ ቀይር' : 'Switch to front camera')
            : (lang === 'am' ? 'ወደ ኋላ ካሜራ ቀይር' : 'Switch to back camera')}
        </button>

        {error && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>}
        {busy && <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{lang === 'am' ? 'በማረም...' : 'Processing…'}</p>}
      </div>
    </div>
  );
}

export default CameraCapture;
