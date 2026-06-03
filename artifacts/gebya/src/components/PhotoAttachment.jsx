import { useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';

export default function PhotoAttachment({ photo, lang = 'en', label, size = 46 }) {
  const [open, setOpen] = useState(false);
  if (!photo) return null;

  const viewLabel = label || (lang === 'am' ? 'ፎቶ ይመልከቱ' : 'View photo');
  const closeLabel = lang === 'am' ? 'ዝጋ' : 'Close';

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
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
        <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
          <img
            src={photo}
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
