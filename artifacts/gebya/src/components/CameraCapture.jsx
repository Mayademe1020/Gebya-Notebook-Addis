// CameraCapture.jsx — Camera-first photo capture with gallery fallback.
//
// Uses getUserMedia with facingMode:'environment' to explicitly request the REAR
// lens, shows a live preview + shutter, and returns a compressed JPEG data URL.
//
// Graceful fallback: if getUserMedia is unavailable or denied, it shows a
// "Use gallery / file" fallback input so the user is never stuck.
//
// Usage:
//   <CameraCapture
//     open={showCamera}
//     onCapture={(dataUrl) => { setPhoto(dataUrl); setShowCamera(false); }}
//     onClose={() => setShowCamera(false)}
//     lang={lang}
//   />

import { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { compressPhoto, MAX_DIMENSION, JPEG_QUALITY } from '../utils/photoCapture';
import { label } from '../labels/index';

function CameraCapture({ open, onCapture, onClose, lang = 'en' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState('environment'); // start with REAR camera
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  // (Re)start the camera stream whenever the modal opens or the facing flips.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError(null);
    setReady(false);

    async function start() {
      // Stop any prior stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(tr => tr.stop());
        streamRef.current = null;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('unsupported');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(tr => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // iOS Safari needs playsInline + an explicit play()
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play().catch(() => { /* autoplay quirk — ignore */ });
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        // NotAllowedError (denied), NotFoundError (no cam), etc.
        setError(err?.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      }
    }

    start();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(tr => tr.stop());
        streamRef.current = null;
      }
    };
  }, [open, facing]);

  const handleShutter = async () => {
    const video = videoRef.current;
    if (!video || busy) return;
    setBusy(true);
    try {
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 960;
      let srcW = w, srcH = h;
      const max = Math.max(w, h);
      if (max > MAX_DIMENSION) {
        const ratio = MAX_DIMENSION / max;
        srcW = Math.round(w * ratio);
        srcH = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = srcW;
      canvas.height = srcH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, srcW, srcH);
      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      onCapture?.(dataUrl);
    } catch {
      setError('capture');
    } finally {
      setBusy(false);
    }
  };

  // Fallback file input (gallery / OS camera) when getUserMedia is unusable.
  const handleFallbackFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await compressPhoto(file);
      onCapture?.(dataUrl);
    } catch {
      setError('capture');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  if (!open) return null;

  const showFallback = error === 'unsupported' || error === 'denied' || error === 'unavailable';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', color: 'var(--color-bg-white)' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
          {label('sales.take-a-photo', lang)}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={label('sales.close', lang)}
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', border: 'none', color: 'var(--color-bg-white)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Live preview OR fallback */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {!showFallback ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {!ready && (
              <div style={{ position: 'absolute', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>
                {label('sales.opening-camera', lang)}
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--color-bg-white)', padding: 24, maxWidth: 320 }}>
            <Camera className="w-12 h-12 mx-auto mb-3" style={{ opacity: 0.5 }} />
            <p style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 6 }}>
              {error === 'denied'
                ? (label('sales.camera-permission-denied', lang))
                : (label('sales.camera-unavailable', lang))}
            </p>
            <p style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: 16, lineHeight: 1.5 }}>
              {label('sales.pick-a-photo-from-your-gallery-or-allow', lang)}
            </p>
            <label
              className="press-scale"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'var(--color-surface)', color: 'var(--color-text)',
                padding: '12px 18px', borderRadius: 12,
                fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer',
              }}
            >
              <ImageIcon className="w-4 h-4" />
              {label('sales.choose-from-gallery', lang)}
              <input type="file" accept="image/*" onChange={handleFallbackFile} className="hidden" />
            </label>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      {!showFallback && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px 32px' }}>
          {/* Gallery shortcut */}
          <label
            className="press-scale"
            style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
            aria-label={label('sales.gallery', lang)}
          >
            <ImageIcon className="w-5 h-5" style={{ color: 'var(--color-bg-white)' }} />
            <input type="file" accept="image/*" onChange={handleFallbackFile} className="hidden" />
          </label>

          {/* Shutter */}
          <button
            type="button"
            onClick={handleShutter}
            disabled={!ready || busy}
            aria-label={label('sales.capture', lang)}
            style={{
              width: 74, height: 74, borderRadius: '50%',
              background: 'var(--color-surface)',
              border: '4px solid rgba(255,255,255,0.4)',
              cursor: ready && !busy ? 'pointer' : 'not-allowed',
              opacity: ready && !busy ? 1 : 0.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Camera className="w-7 h-7" style={{ color: 'var(--color-text)' }} />
          </button>

          {/* Flip camera */}
          <button
            type="button"
            onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))}
            aria-label={label('sales.flip-camera', lang)}
            style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <RefreshCw className="w-5 h-5" style={{ color: 'var(--color-bg-white)' }} />
          </button>
        </div>
      )}
    </div>
  );
}

export default CameraCapture;
