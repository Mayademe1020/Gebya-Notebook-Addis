import { useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import { normalizePhotos } from '../utils/photoProof';

export default function PhotoAttachment({ photo, photos, lang = 'en', label, size = 46 }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const normalizedPhotos = normalizePhotos(Array.isArray(photos) && photos.length > 0 ? { photos } : { photo });
  if (normalizedPhotos.length === 0) return null;

  const viewLabel = label || (lang === 'am' ? 'ፎቶ ይመልከቱ' : 'View photo');
  const closeLabel = lang === 'am' ? 'ዝጋ' : 'Close';
  const activePhoto = normalizedPhotos[index] || normalizedPhotos[0];
  const extraCount = normalizedPhotos.length - 1;
  const showCarouselControls = normalizedPhotos.length > 1;
  const goPrevious = () => setIndex(prev => (prev - 1 + normalizedPhotos.length) % normalizedPhotos.length);
  const goNext = () => setIndex(prev => (prev + 1) % normalizedPhotos.length);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIndex(0);
          setOpen(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={viewLabel}
        className="press-scale"
        style={{
          width: size,
          height: size,
          minWidth: 44,
          minHeight: 44,
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid #ece6d6',
          background: '#fff',
          padding: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <img src={normalizedPhotos[0].dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: 2,
            bottom: 2,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: 'rgba(17,24,39,0.72)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ImageIcon className="w-3 h-3" />
        </span>
        {extraCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 2,
              top: 2,
              minWidth: 22,
              height: 18,
              padding: '0 4px',
              borderRadius: 999,
              background: 'rgba(27,67,50,0.88)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            +{extraCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={viewLabel}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            background: 'rgba(17,24,39,0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={closeLabel}
            className="press-scale"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 44,
              height: 44,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(0,0,0,0.35)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X className="w-5 h-5" />
          </button>
          {showCarouselControls && (
            <>
              <button
                type="button"
                onClick={goPrevious}
                aria-label={lang === 'am' ? 'ያለፈው ፎቶ' : 'Previous photo'}
                className="press-scale"
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.25)',
                  background: 'rgba(0,0,0,0.35)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label={lang === 'am' ? 'ቀጣዩ ፎቶ' : 'Next photo'}
                className="press-scale"
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.25)',
                  background: 'rgba(0,0,0,0.35)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
              <div
                aria-live="polite"
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 16,
                  transform: 'translateX(-50%)',
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: 'rgba(0,0,0,0.45)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {index + 1}/{normalizedPhotos.length}
              </div>
            </>
          )}
          <img
            src={activePhoto.dataUrl}
            alt=""
            style={{
              maxWidth: '100%',
              maxHeight: '86vh',
              objectFit: 'contain',
              borderRadius: 8,
              boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
            }}
          />
        </div>
      )}
    </>
  );
}
